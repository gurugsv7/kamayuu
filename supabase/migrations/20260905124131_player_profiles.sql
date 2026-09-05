-- A player's durable identity. Own-row only: nothing here is readable by other
-- players. Table-stakes names shown at a table travel in the room payload, not
-- from here, so no cross-player read is ever needed.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 16),
  avatar text not null default 'lotus' check (avatar in ('lotus','spade','heart','club','diamond','moon','sun','star')),
  matches_played integer not null default 0 check (matches_played >= 0),
  matches_won integer not null default 0 check (matches_won >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on public.profiles from public, anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;

create policy profiles_read_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_create_own on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Win counts must never be client-writable, or they are trivially forged.
-- Only the trusted commit path may move them.
create function public.lotus_freeze_stats() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if current_user <> 'service_role' then
    new.matches_played := old.matches_played;
    new.matches_won := old.matches_won;
  end if;
  new.updated_at := now();
  new.id := old.id;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.lotus_freeze_stats();

create function public.lotus_record_result(p_winners uuid[], p_players uuid[]) returns void
  language sql security invoker set search_path='' as $$
  update public.profiles p set
    matches_played = p.matches_played + 1,
    matches_won = p.matches_won + (case when p.id = any(p_winners) then 1 else 0 end)
  where p.id = any(p_players);
$$;
revoke all on function public.lotus_record_result(uuid[],uuid[]) from public, anon, authenticated;
grant execute on function public.lotus_record_result(uuid[],uuid[]) to service_role;
