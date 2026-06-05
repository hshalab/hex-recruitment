-- Add a `withdrawn` branch to the pipeline cascade trigger.
--
-- The original cascade (20260505163119) handles rejected, hired,
-- interview → offered, backward moves, and rejected → restore — but it
-- has no branch for `withdrawn`, the status candidates set when they
-- self-withdraw from /applications (or when the employer marks them as
-- withdrawn via WithdrawModal). Result: when a candidate withdraws,
-- their live interviews stay in 'scheduled'/'confirmed' (showing up on
-- the employer's /interviews page) and a pending offer stays in
-- 'pending' (showing up on /offers). Both should resolve.
--
-- Mirror of the `rejected` branch, with one semantic difference: when
-- the employer rejects, a pending offer's status becomes 'withdrawn'
-- (the employer pulled it). When the candidate withdraws their
-- application, a pending offer's status becomes 'declined' (the
-- candidate refused to proceed). That requires extending the
-- cascade_kind CHECK enum to include 'offer_declined'.
--
-- Idempotent: trigger fires AFTER UPDATE OF status WHEN distinct, so
-- re-setting the same status doesn't re-cascade. CREATE OR REPLACE on
-- the function. ALTER on the CHECK constraint.

-- 1. Extend the cascade_kind enum.
ALTER TABLE public.pipeline_cascade_log
  DROP CONSTRAINT IF EXISTS pipeline_cascade_log_cascade_kind_check;

ALTER TABLE public.pipeline_cascade_log
  ADD CONSTRAINT pipeline_cascade_log_cascade_kind_check
  CHECK (cascade_kind IN (
    'interview_completed', 'interview_cancelled',
    'offer_accepted', 'offer_withdrawn', 'offer_declined',
    'backward_move', 'restore'
  ));

-- 2. Replace the cascade function with the new `withdrawn` branch
--    inserted between the `rejected` and `hired` branches. All other
--    branches preserved byte-for-byte from 20260505163119.
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

  ELSIF NEW.status = 'withdrawn' THEN
    -- NEW BRANCH — candidate (or employer-on-their-behalf) withdrew the
    -- application. Cancel live interviews so they leave the employer's
    -- /interviews upcoming list, and mark the most-recent pending offer
    -- as 'declined' (semantically different from the employer-initiated
    -- 'withdrawn' offer status used in the rejected branch).
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

    WITH upd AS (
      UPDATE public.job_offers
      SET status = 'declined', updated_at = v_now
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
      VALUES (NEW.id, OLD.status, NEW.status, 'offer_declined', v_target_id);
    END IF;

  ELSIF NEW.status = 'hired' THEN
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
    INSERT INTO public.pipeline_cascade_log (application_id, from_status, to_status, cascade_kind)
    VALUES (NEW.id, OLD.status, NEW.status, 'backward_move');

  ELSIF OLD.status = 'rejected' AND NEW.status NOT IN ('rejected', 'withdrawn') THEN
    INSERT INTO public.pipeline_cascade_log (application_id, from_status, to_status, cascade_kind)
    VALUES (NEW.id, OLD.status, NEW.status, 'restore');

  -- Symmetric "restore from withdrawn" branch — informational log only,
  -- mirrors the rejected→active restore. Lets a candidate change their
  -- mind without surprising the audit.
  ELSIF OLD.status = 'withdrawn' AND NEW.status NOT IN ('rejected', 'withdrawn') THEN
    INSERT INTO public.pipeline_cascade_log (application_id, from_status, to_status, cascade_kind)
    VALUES (NEW.id, OLD.status, NEW.status, 'restore');
  END IF;

  RETURN NEW;
END;
$$;
