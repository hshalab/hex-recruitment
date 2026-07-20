-- Idempotency key for re-runnable external imports (e.g. the Goldenkeys weekly
-- sync). Nullable so ordinary employer-posted jobs are unaffected; the partial
-- unique index enforces one job per source URL only when source_url is set.
alter table public.jobs add column if not exists source_url text;
create unique index if not exists jobs_source_url_key
  on public.jobs (source_url) where source_url is not null;
