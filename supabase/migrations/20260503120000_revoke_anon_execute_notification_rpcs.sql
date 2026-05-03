-- B1 / AUDIT_2026-05-03 — revoke broad EXECUTE on 10 SECURITY DEFINER
-- notification + counter RPCs that were callable by the public anon key.
--
-- BEFORE: aclexplode(p.proacl) on each function returned grantees
-- {PUBLIC, anon, authenticated, postgres, service_role}, which let anyone
-- with the public anon key POST /rest/v1/rpc/<fn> and execute the body
-- (verified live with HTTP 409 FK violation reproduction).
--
-- This migration is access-control only. Body-level authorization gaps
-- (functions accepting arbitrary p_user_id / p_job_id / p_review_id
-- without verifying caller ownership) are tracked separately and will
-- ship in a follow-up migration.
--
-- The 7 RPCs with no app-code callers are locked down but not dropped.
-- Reason: SQL views, cron jobs, edge functions, and triggers don't show
-- up in a TypeScript grep, and DROP is irreversible. REVOKE is inert and
-- reversible. Backlog memory tracks the ~30-day-post-launch DROP.
--
-- Triggers (notify_application_status_change, handle_new_user) keep
-- firing because triggers execute as the function owner regardless of
-- the EXECUTE privilege.

-- 1. Dead or trigger-only RPCs: revoke from anon, authenticated, and PUBLIC.
REVOKE EXECUTE ON FUNCTION public.create_notification(uuid, text, text, text, text, text, text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_new_application(uuid, text, text, text)               FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_new_message(uuid, text, text)                          FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_profile_viewed(uuid, text)                             FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_application_status_change()                            FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                                             FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_application_count(uuid)                             FROM anon, authenticated, PUBLIC;

-- 2. Still-used RPCs: keep authenticated, drop anon and PUBLIC.
--    Callers (all gated by signed-in candidate):
--      - increment_job_views: hooks/useAnalyticsTracking.ts:61, app/jobs/page.tsx:422,585
--      - increment_review_helpful, decrement_review_helpful: hooks/useReviewVotes.ts:141,186
REVOKE EXECUTE ON FUNCTION public.increment_job_views(uuid)        FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_review_helpful(uuid)   FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.decrement_review_helpful(uuid)   FROM anon, PUBLIC;
