-- Temp Work: denormalised poster identity (so the public feed shows who posted
-- without reading employer_profiles) + a maintained interest count (so cards show
-- a count without exposing individual interest rows). Table is empty; additive.
alter table public.temp_posts
  add column if not exists company_name   text,
  add column if not exists company_logo   text,
  add column if not exists interest_count int not null default 0;

create or replace function public.temp_interest_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.temp_posts set interest_count = interest_count + 1 where id = new.temp_post_id;
  elsif tg_op = 'DELETE' then
    update public.temp_posts set interest_count = greatest(0, interest_count - 1) where id = old.temp_post_id;
  end if;
  return null;
end;
$$;
drop trigger if exists trg_temp_interest_count on public.temp_interest;
create trigger trg_temp_interest_count
  after insert or delete on public.temp_interest
  for each row execute function public.temp_interest_count();
