-- Contract, Freelance, Internship and Apprenticeship have been removed from the
-- work-type vocabulary (see lib/workTypes.ts). No job on the board has ever
-- carried any of them and none is a hospitality word.
--
-- BLANK, DO NOT MAP. One live profile held ["Freelance"], which could mean
-- agency work, a self-employed private chef, or simply the nearest thing to
-- "not a normal job". Translating it would write a preference onto a real
-- person's profile that they never stated and would never see. Blank reads as
-- "no preference", which is honest and costs them nothing: calcTypeMatch scores
-- an unstated preference NEUTRAL, not zero.
--
-- Written as a set difference rather than a blanket clear, so a profile holding
-- ["Full-time","Freelance"] keeps the Full-time and loses only the retired word.
update candidate_profiles
set preferred_job_types = (
  select coalesce(jsonb_agg(v.value), '[]'::jsonb)
  from jsonb_array_elements_text(preferred_job_types) v
  where v.value in ('Full-time','Part-time','Flexible','Permanent','Temporary','Fixed-term')
)
where jsonb_array_length(coalesce(preferred_job_types, '[]'::jsonb)) > 0
  and exists (
    select 1 from jsonb_array_elements_text(preferred_job_types) v
    where v.value not in ('Full-time','Part-time','Flexible','Permanent','Temporary','Fixed-term')
  );
