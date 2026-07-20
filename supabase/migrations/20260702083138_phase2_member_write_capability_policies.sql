-- PHASE 2 STEP 5: capability-gated member WRITE policies (additive; owner
-- policies untouched). A member with the capability can write; a member without
-- it is denied by RLS (PostgREST 42501 -> HTTP 403). Owners keep writing via the
-- existing auth.uid()=employer_id policies (has_employer_permission is also true
-- for them). The restrictive approval_gate_blocks_writes still applies where set.

-- Move candidates in the pipeline -> manage_pipeline
drop policy if exists "members update job_applications (manage_pipeline)" on public.job_applications;
create policy "members update job_applications (manage_pipeline)" on public.job_applications
  for update to authenticated
  using (exists (select 1 from public.jobs j
                 where j.id = job_applications.job_id
                   and public.has_employer_permission(j.employer_id, 'manage_pipeline')))
  with check (exists (select 1 from public.jobs j
                      where j.id = job_applications.job_id
                        and public.has_employer_permission(j.employer_id, 'manage_pipeline')));

-- Post & edit jobs -> manage_jobs
drop policy if exists "members insert jobs (manage_jobs)" on public.jobs;
create policy "members insert jobs (manage_jobs)" on public.jobs
  for insert to authenticated
  with check (public.has_employer_permission(employer_id, 'manage_jobs')
              and not public.is_employer_blocked_by_approval());
drop policy if exists "members update jobs (manage_jobs)" on public.jobs;
create policy "members update jobs (manage_jobs)" on public.jobs
  for update to authenticated
  using (public.has_employer_permission(employer_id, 'manage_jobs'))
  with check (public.has_employer_permission(employer_id, 'manage_jobs'));

-- Schedule & manage interviews -> manage_interviews
drop policy if exists "members insert interviews (manage_interviews)" on public.interviews;
create policy "members insert interviews (manage_interviews)" on public.interviews
  for insert to authenticated
  with check (public.has_employer_permission(employer_id, 'manage_interviews'));
drop policy if exists "members update interviews (manage_interviews)" on public.interviews;
create policy "members update interviews (manage_interviews)" on public.interviews
  for update to authenticated
  using (public.has_employer_permission(employer_id, 'manage_interviews'))
  with check (public.has_employer_permission(employer_id, 'manage_interviews'));

drop policy if exists "members insert interview_bookings (manage_interviews)" on public.interview_bookings;
create policy "members insert interview_bookings (manage_interviews)" on public.interview_bookings
  for insert to authenticated
  with check (public.has_employer_permission(employer_id, 'manage_interviews'));
drop policy if exists "members update interview_bookings (manage_interviews)" on public.interview_bookings;
create policy "members update interview_bookings (manage_interviews)" on public.interview_bookings
  for update to authenticated
  using (public.has_employer_permission(employer_id, 'manage_interviews'))
  with check (public.has_employer_permission(employer_id, 'manage_interviews'));

-- Make/withdraw offers, incl. confirmHire -> manage_pipeline
drop policy if exists "members insert job_offers (manage_pipeline)" on public.job_offers;
create policy "members insert job_offers (manage_pipeline)" on public.job_offers
  for insert to authenticated
  with check (public.has_employer_permission(employer_id, 'manage_pipeline'));
drop policy if exists "members update job_offers (manage_pipeline)" on public.job_offers;
create policy "members update job_offers (manage_pipeline)" on public.job_offers
  for update to authenticated
  using (public.has_employer_permission(employer_id, 'manage_pipeline'))
  with check (public.has_employer_permission(employer_id, 'manage_pipeline'));
