create or replace function increment_application_count(p_job_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  update jobs
  set application_count = coalesce(application_count, 0) + 1
  where id = p_job_id;
end;
$$;
