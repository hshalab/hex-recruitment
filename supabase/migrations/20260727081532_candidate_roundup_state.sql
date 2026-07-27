-- Weekly "roles for you" roundup state.
--
-- Unlike the job digest, this product is NOT recency-gated — it re-surfaces the
-- current active inventory to dormant candidates. That means a timestamp alone
-- is not enough: with the same 246 jobs on the market, a pure watermark would
-- send the same top 8 every single week.
--
-- Shape: { lastSentAt: ISO, recentJobIds: string[] }
-- recentJobIds is a capped ring (see ROUNDUP_MEMORY) of the job ids most
-- recently emailed to this candidate. Each run excludes them, so consecutive
-- weeks rotate through the inventory instead of repeating.
--
-- jsonb rather than two columns, following notification_preferences /
-- nudge_state / discoverability_notice on this same table: one owned helper
-- reads and writes it (lib/rolesRoundup.ts), nothing else touches it.
alter table public.candidate_profiles
  add column if not exists roundup_state jsonb;

comment on column public.candidate_profiles.roundup_state is
  'Weekly "roles for you" roundup state: { lastSentAt, recentJobIds[] }. recentJobIds is a capped ring of recently-emailed job ids so consecutive weeks do not repeat the same roles. NULL = never sent.';
