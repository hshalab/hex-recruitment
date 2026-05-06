-- Pipeline cascade: keep interviews + job_offers in sync with job_applications.status.
-- One rule lives in the DB so every status writer (drag-drop, kebab menu, modals,
-- API routes) gets the same behaviour without each having to remember.
--
-- Existing CHECK constraints on interviews.status and job_offers.status already include
-- every target value the cascade needs (cancelled / completed / accepted / withdrawn),
-- so this migration adds:
--   1. pipeline_cascade_log table (audit + lets the client build a toast)
--   2. cascade_application_status() trigger function
--   3. trg_cascade_application_status AFTER UPDATE OF status WHEN distinct

CREATE TABLE public.pipeline_cascade_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  uuid NOT NULL REFERENCES public.job_applications(id) ON DELETE CASCADE,
  from_status     text,
  to_status       text NOT NULL,
  cascade_kind    text NOT NULL CHECK (cascade_kind IN (
    'interview_completed', 'interview_cancelled',
    'offer_accepted', 'offer_withdrawn',
    'backward_move', 'restore'
  )),
  cascade_target  uuid,
  details         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX pipeline_cascade_log_application_idx
  ON public.pipeline_cascade_log (application_id, created_at DESC);

ALTER TABLE public.pipeline_cascade_log ENABLE ROW LEVEL SECURITY;

-- Only the employer who owns the application can read its log rows.
-- Nobody writes from clients — the trigger is the only writer.
CREATE POLICY pipeline_cascade_log_select_employer
  ON public.pipeline_cascade_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.job_applications ja
      JOIN public.jobs j ON j.id = ja.job_id
      WHERE ja.id = pipeline_cascade_log.application_id
        AND j.employer_id = auth.uid()
    )
  );


CREATE OR REPLACE FUNCTION public.cascade_application_status() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now           timestamptz := now();
  v_completed     int := 0;
  v_cancelled     int := 0;
  v_target_id     uuid;
  v_order_old     int;
  v_order_new     int;
  v_is_backward   boolean;
BEGIN
  -- Direction map. Lower index = earlier stage in the active funnel.
  -- rejected/withdrawn are terminal/off-pipeline and handled by their own branches.
  v_order_old := CASE LOWER(COALESCE(OLD.status, ''))
    WHEN 'pending'      THEN 0
    WHEN 'applied'      THEN 0
    WHEN 'reviewing'    THEN 1
    WHEN 'viewed'       THEN 1
    WHEN 'shortlisted'  THEN 2
    WHEN 'interviewing' THEN 3
    WHEN 'interview'    THEN 3
    WHEN 'offered'      THEN 4
    WHEN 'hired'        THEN 5
    ELSE -1
  END;
  v_order_new := CASE LOWER(COALESCE(NEW.status, ''))
    WHEN 'pending'      THEN 0
    WHEN 'applied'      THEN 0
    WHEN 'reviewing'    THEN 1
    WHEN 'viewed'       THEN 1
    WHEN 'shortlisted'  THEN 2
    WHEN 'interviewing' THEN 3
    WHEN 'interview'    THEN 3
    WHEN 'offered'      THEN 4
    WHEN 'hired'        THEN 5
    ELSE -1
  END;
  v_is_backward := v_order_old > -1
                AND v_order_new > -1
                AND v_order_old > v_order_new
                AND NEW.status NOT IN ('rejected', 'withdrawn');

  IF NEW.status = 'rejected' THEN
    -- Cancel every live interview attached to this application.
    WITH upd AS (
      UPDATE public.interviews
      SET status = 'cancelled', updated_at = v_now
      WHERE application_id = NEW.id
        AND status IN ('pending_selection', 'scheduled', 'confirmed')
      RETURNING id
    )
    SELECT count(*) INTO v_cancelled FROM upd;
    IF v_cancelled > 0 THEN
      INSERT INTO public.pipeline_cascade_log (application_id, from_status, to_status, cascade_kind, details)
      VALUES (NEW.id, OLD.status, NEW.status, 'interview_cancelled', jsonb_build_object('count', v_cancelled));
    END IF;

    -- Withdraw the most-recent pending offer.
    WITH upd AS (
      UPDATE public.job_offers
      SET status = 'withdrawn', updated_at = v_now
      WHERE id = (
        SELECT id FROM public.job_offers
        WHERE application_id = NEW.id AND status = 'pending'
        ORDER BY created_at DESC
        LIMIT 1
      )
      RETURNING id
    )
    SELECT id INTO v_target_id FROM upd;
    IF v_target_id IS NOT NULL THEN
      INSERT INTO public.pipeline_cascade_log (application_id, from_status, to_status, cascade_kind, cascade_target)
      VALUES (NEW.id, OLD.status, NEW.status, 'offer_withdrawn', v_target_id);
    END IF;

  ELSIF NEW.status = 'hired' THEN
    -- Past-dated live interviews → completed; future-dated → cancelled.
    WITH live AS (
      SELECT i.id,
             (i.interview_date::timestamp + i.interview_time::interval) AS scheduled_at
      FROM public.interviews i
      WHERE i.application_id = NEW.id
        AND i.status IN ('pending_selection', 'scheduled', 'confirmed')
    ),
    upd AS (
      UPDATE public.interviews i
      SET status = CASE WHEN live.scheduled_at < v_now THEN 'completed' ELSE 'cancelled' END,
          updated_at = v_now
      FROM live
      WHERE i.id = live.id
      RETURNING i.id, i.status
    )
    SELECT
      count(*) FILTER (WHERE status = 'completed'),
      count(*) FILTER (WHERE status = 'cancelled')
    INTO v_completed, v_cancelled
    FROM upd;
    IF v_completed > 0 THEN
      INSERT INTO public.pipeline_cascade_log (application_id, from_status, to_status, cascade_kind, details)
      VALUES (NEW.id, OLD.status, NEW.status, 'interview_completed', jsonb_build_object('count', v_completed));
    END IF;
    IF v_cancelled > 0 THEN
      INSERT INTO public.pipeline_cascade_log (application_id, from_status, to_status, cascade_kind, details)
      VALUES (NEW.id, OLD.status, NEW.status, 'interview_cancelled', jsonb_build_object('count', v_cancelled));
    END IF;

    -- Accept the most-recent non-accepted offer.
    WITH upd AS (
      UPDATE public.job_offers
      SET status = 'accepted', updated_at = v_now
      WHERE id = (
        SELECT id FROM public.job_offers
        WHERE application_id = NEW.id AND status <> 'accepted'
        ORDER BY created_at DESC
        LIMIT 1
      )
      RETURNING id
    )
    SELECT id INTO v_target_id FROM upd;
    IF v_target_id IS NOT NULL THEN
      INSERT INTO public.pipeline_cascade_log (application_id, from_status, to_status, cascade_kind, cascade_target)
      VALUES (NEW.id, OLD.status, NEW.status, 'offer_accepted', v_target_id);
    END IF;

  ELSIF NEW.status = 'offered' AND OLD.status IN ('interview', 'interviewing') THEN
    -- Most-recent live interview → completed (the one that "happened").
    -- Older live interviews → cancelled.
    WITH live AS (
      SELECT i.id,
             ROW_NUMBER() OVER (
               ORDER BY (i.interview_date::timestamp + i.interview_time::interval) DESC
             ) AS rn
      FROM public.interviews i
      WHERE i.application_id = NEW.id
        AND i.status IN ('pending_selection', 'scheduled', 'confirmed')
    ),
    upd AS (
      UPDATE public.interviews i
      SET status = CASE WHEN live.rn = 1 THEN 'completed' ELSE 'cancelled' END,
          updated_at = v_now
      FROM live
      WHERE i.id = live.id
      RETURNING i.status
    )
    SELECT
      count(*) FILTER (WHERE status = 'completed'),
      count(*) FILTER (WHERE status = 'cancelled')
    INTO v_completed, v_cancelled
    FROM upd;
    IF v_completed > 0 THEN
      INSERT INTO public.pipeline_cascade_log (application_id, from_status, to_status, cascade_kind, details)
      VALUES (NEW.id, OLD.status, NEW.status, 'interview_completed', jsonb_build_object('count', v_completed));
    END IF;
    IF v_cancelled > 0 THEN
      INSERT INTO public.pipeline_cascade_log (application_id, from_status, to_status, cascade_kind, details)
      VALUES (NEW.id, OLD.status, NEW.status, 'interview_cancelled', jsonb_build_object('count', v_cancelled));
    END IF;

  ELSIF v_is_backward THEN
    -- Backward move between active stages — log only, preserve future-dated commitments.
    INSERT INTO public.pipeline_cascade_log (application_id, from_status, to_status, cascade_kind)
    VALUES (NEW.id, OLD.status, NEW.status, 'backward_move');

  ELSIF OLD.status = 'rejected' AND NEW.status NOT IN ('rejected', 'withdrawn') THEN
    -- Restore from the DECLINED column — informational log only.
    INSERT INTO public.pipeline_cascade_log (application_id, from_status, to_status, cascade_kind)
    VALUES (NEW.id, OLD.status, NEW.status, 'restore');
  END IF;

  RETURN NEW;
END;
$$;


CREATE TRIGGER trg_cascade_application_status
  AFTER UPDATE OF status ON public.job_applications
  FOR EACH ROW
  WHEN (NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION public.cascade_application_status();
