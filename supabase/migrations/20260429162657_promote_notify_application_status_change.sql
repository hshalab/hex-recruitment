-- Promote notify_application_status_change() from a no-op into a
-- BEFORE-UPDATE trigger that bumps job_applications.updated_at when
-- the status column actually changes. The notification inserts stay in
-- application code (status-specific copy with job/company context).

CREATE OR REPLACE FUNCTION public.notify_application_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Status-change-specific updated_at bump. Notification inserts are
  -- emitted from application code so the message text can include the
  -- job title and company name without expensive joins in plpgsql.
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- The previous trigger fired AFTER UPDATE, which can't mutate NEW.
-- Recreate it as BEFORE UPDATE OF status so the timestamp bump lands
-- in the same write, with a WHEN clause that skips no-op status writes.
DROP TRIGGER IF EXISTS on_application_status_change ON public.job_applications;

CREATE TRIGGER on_application_status_change
BEFORE UPDATE OF status ON public.job_applications
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.notify_application_status_change();
