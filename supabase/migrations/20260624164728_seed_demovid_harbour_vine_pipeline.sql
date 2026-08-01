-- Re-seed the +demovid demo (Harbour & Vine) pipeline. The employer's jobs were
-- previously deleted (cascading the pipeline away); the 9 demo candidates still
-- exist and are orphaned. This relinks them — creates NO new candidates and
-- deletes nothing. Idempotent: jobs use fixed ids (ON CONFLICT DO NOTHING) and
-- applications use a NOT EXISTS guard, so re-running is a no-op.

-- A. Two jobs under Harbour & Vine (employer bd089661…), status active.
insert into public.jobs (id, employer_id, title, company, location, area, salary_min, salary_max, salary_type, status, category, description)
values
  ('de600d00-0000-4000-8000-000000000001','bd089661-4340-4432-a77f-3ba43424a4d4',
   'Restaurant Manager','Harbour & Vine','London','Shoreditch',38000,45000,'annual','active','hospitality',
   'Lead front-of-house at Harbour & Vine, our 120-cover Shoreditch restaurant. Own service standards, rotas, stock and P&L, and develop a team of 15. We are after a hands-on RM from a quality-led, high-volume background.'),
  ('de600d00-0000-4000-8000-000000000002','bd089661-4340-4432-a77f-3ba43424a4d4',
   'Assistant Restaurant Manager','Harbour & Vine','London','Shoreditch',30000,36000,'annual','active','hospitality',
   'Support the RM in running daily service at Harbour & Vine. Lead shifts, train the floor team, and own reservations and guest experience. A step-up role for a strong supervisor or existing AM.')
on conflict (id) do nothing;

-- B. Link the 9 existing demo candidates across the pipeline stages.
insert into public.job_applications (job_id, candidate_id, status, job_title, company, applied_at)
select v.job_id::uuid, v.candidate_id::uuid, v.status, v.job_title, 'Harbour & Vine', now() - (v.days || ' days')::interval
from (values
  -- Restaurant Manager (job 1): full pipeline reviewing → hired
  ('de600d00-0000-4000-8000-000000000001','74fab2fc-5b0b-42f8-8a23-8d467e1d3884','reviewing',  'Restaurant Manager', 3),   -- Priya Nair
  ('de600d00-0000-4000-8000-000000000001','51e8be84-57c3-4d90-8a8d-dcb9dd9c79f3','shortlisted','Restaurant Manager', 7),   -- Sofia Marchetti
  ('de600d00-0000-4000-8000-000000000001','7aed6291-f8cb-49a0-bca0-3ade07bcadcb','interview',  'Restaurant Manager', 10),  -- Amara Okeke
  ('de600d00-0000-4000-8000-000000000001','61a9f746-d614-4a87-be8b-2b3f28f6c58e','offered',    'Restaurant Manager', 14),  -- Gabriel Costa
  ('de600d00-0000-4000-8000-000000000001','66bcd521-2093-431f-8e99-20957ad9d29f','hired',      'Restaurant Manager', 20),  -- Liam Doyle
  -- Assistant Restaurant Manager (job 2)
  ('de600d00-0000-4000-8000-000000000002','3756160d-83eb-4bfa-a613-5011ca2b142c','reviewing',  'Assistant Restaurant Manager', 2),  -- Chloe Bennett
  ('de600d00-0000-4000-8000-000000000002','a71c7ae8-c097-4bb1-a71a-124983fd7c86','shortlisted','Assistant Restaurant Manager', 6),  -- Tom Fletcher
  ('de600d00-0000-4000-8000-000000000002','a1fed401-3b92-41d0-a9c8-334785bc3295','shortlisted','Assistant Restaurant Manager', 6),  -- Harry Whitfield
  ('de600d00-0000-4000-8000-000000000002','40d10dae-09fb-4fe4-bf62-600e0eb1aa66','interview',  'Assistant Restaurant Manager', 9)   -- Marcus Bellini (hero)
) as v(job_id, candidate_id, status, job_title, days)
where not exists (
  select 1 from public.job_applications ja
  where ja.job_id = v.job_id::uuid and ja.candidate_id = v.candidate_id::uuid
);

-- C. Polish the hero (Marcus Bellini) with Phase 2 fields + set availability on all.
update public.candidate_profiles set
  headline = 'Assistant RM ready to step up — opening teams & 200-cover service',
  specialties = ARRAY['Floor management','Opening teams','Rota & cost control','Service standards'],
  availability = 'Available immediately'
where user_id = '40d10dae-09fb-4fe4-bf62-600e0eb1aa66';

update public.candidate_profiles set availability = '2 weeks notice'      where user_id = '74fab2fc-5b0b-42f8-8a23-8d467e1d3884';  -- Priya
update public.candidate_profiles set availability = '1 month notice'      where user_id = 'a71c7ae8-c097-4bb1-a71a-124983fd7c86';  -- Tom
update public.candidate_profiles set availability = 'Available immediately' where user_id = '51e8be84-57c3-4d90-8a8d-dcb9dd9c79f3';  -- Sofia
update public.candidate_profiles set availability = '2 weeks notice'      where user_id = '3756160d-83eb-4bfa-a613-5011ca2b142c';  -- Chloe
update public.candidate_profiles set availability = 'Flexible'            where user_id = 'a1fed401-3b92-41d0-a9c8-334785bc3295';  -- Harry
update public.candidate_profiles set availability = '1 month notice'      where user_id = '7aed6291-f8cb-49a0-bca0-3ade07bcadcb';  -- Amara
update public.candidate_profiles set availability = 'Available immediately' where user_id = '61a9f746-d614-4a87-be8b-2b3f28f6c58e';  -- Gabriel
update public.candidate_profiles set availability = '2 weeks notice'      where user_id = '66bcd521-2093-431f-8e99-20957ad9d29f';  -- Liam;
