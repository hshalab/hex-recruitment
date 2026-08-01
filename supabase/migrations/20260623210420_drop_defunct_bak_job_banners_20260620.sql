-- Drop the defunct banner-migration backup. The base64→Storage banner
-- migration completed (35/35) long ago; the live banners are served from the
-- job-banners Storage bucket / jobs.company_banner_url. The only reference to
-- this table in the codebase is a descriptive comment in the already-run
-- scripts/migrate-banners-to-storage.js — no runtime read/write. Dropping it
-- clears the rls_disabled_in_public ERROR (table was public with RLS off).
DROP TABLE IF EXISTS public.bak_job_banners_20260620;
