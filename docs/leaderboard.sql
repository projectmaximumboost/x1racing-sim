-- X1 Racing SkyRacer Flying Car Grand Prix: leaderboard tables for Supabase (run once in the SQL editor).
-- The sim inserts one row per new personal best and reads the x1_leaderboard view.
-- Visitors can add rows and read the board; they cannot read, change or delete the raw rows.

create table if not exists public.x1_laps (
  id          bigint generated always as identity primary key,
  handle      text        not null check (handle ~ '^[A-Za-z0-9_]{1,15}$'),   -- X handle, no @
  lap_ms      integer     not null check (lap_ms between 40000 and 600000),    -- 40 s to 10 min
  max_mph     integer     check (max_mph between 0 and 400),
  build       text        check (char_length(build) <= 32),
  device      text        check (device in ('touch','pad','keys')),
  created_at  timestamptz not null default now()
);
create index if not exists x1_laps_handle_idx on public.x1_laps (lower(handle), lap_ms);

alter table public.x1_laps enable row level security;
drop policy if exists "anyone can add a lap" on public.x1_laps;
create policy "anyone can add a lap" on public.x1_laps for insert to anon, authenticated with check (true);
grant insert on public.x1_laps to anon, authenticated;
-- no select, update or delete policy: raw rows stay private

-- slow down flooding: at most 30 rows per handle per hour
create or replace function public.x1_laps_rate_limit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.x1_laps where lower(handle) = lower(new.handle) and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'too many laps for this handle, try again later';
  end if;
  return new;
end $$;
drop trigger if exists x1_laps_rate_limit on public.x1_laps;
create trigger x1_laps_rate_limit before insert on public.x1_laps for each row execute function public.x1_laps_rate_limit();

-- the board: best lap per handle (handles compare without case)
create or replace view public.x1_leaderboard as
  select distinct on (lower(handle)) handle, lap_ms, max_mph, created_at as set_at
  from public.x1_laps
  order by lower(handle), lap_ms asc, created_at asc;
grant select on public.x1_leaderboard to anon, authenticated;

-- to remove a bad entry (run as the project owner):
--   delete from public.x1_laps where lower(handle) = lower('somehandle');
