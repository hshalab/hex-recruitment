-- Let a conversation belong to a SHIFT as well as to a job.
--
-- Interest in a shift should land in the employer's Messages the way an
-- application does, so an agency has one inbox rather than two. Two things stop
-- the obvious version of that working:
--
--   1. conversations.related_job_id has a foreign key to jobs(id), so a
--      temp_post id cannot be smuggled into it. Hence a column of its own.
--
--   2. UNIQUE (participant_1, participant_2, related_job_id) is what stops a
--      second application opening a second thread — but in Postgres NULLs are
--      DISTINCT in a unique constraint. So leaving related_job_id null does not
--      merely fail to dedup, it fails SILENTLY: a chef interested in three of an
--      agency's shifts would get three identical-looking threads with the same
--      employer, and so would the agency. The partial unique index below is the
--      part that actually earns its keep.
alter table public.conversations
  add column if not exists related_temp_post_id uuid references public.temp_posts(id) on delete set null;

create unique index if not exists conversations_participants_temp_post_key
  on public.conversations (participant_1, participant_2, related_temp_post_id)
  where related_temp_post_id is not null;

create index if not exists conversations_temp_post_idx
  on public.conversations (related_temp_post_id)
  where related_temp_post_id is not null;
