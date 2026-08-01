CREATE TABLE IF NOT EXISTS public.bak_job_banners_20260620 AS
SELECT id, company_banner_url, now() AS backed_up_at
FROM public.jobs
WHERE company_banner_url LIKE 'data:%';
