-- TWstock watchlist: run this once in Supabase → SQL Editor → New query → Run.
-- Same Supabase project as EZexams (same accounts and device PINs). Safe to run again.
--
-- One row = one account's watchlist. `payload` is {updatedAt, symbols: ["2330", ...]}.
-- Row Level Security: a signed-in person can only read or write their own row.

create table if not exists public.watchlist (
  user_id    uuid        primary key default auth.uid() references auth.users (id) on delete cascade,
  payload    jsonb       not null check (pg_column_size(payload) < 100000),
  updated_at timestamptz not null default now()
);

alter table public.watchlist enable row level security;

drop policy if exists "watchlist: read own"   on public.watchlist;
drop policy if exists "watchlist: insert own" on public.watchlist;
drop policy if exists "watchlist: update own" on public.watchlist;

create policy "watchlist: read own"   on public.watchlist for select to authenticated using      ((select auth.uid()) = user_id);
create policy "watchlist: insert own" on public.watchlist for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "watchlist: update own" on public.watchlist for update to authenticated using      ((select auth.uid()) = user_id)
                                                                                    with check ((select auth.uid()) = user_id);

-- "Automatically expose new tables" is off, so the table is opened explicitly, to signed-in people only.
revoke all on public.watchlist from anon, authenticated;
grant select, insert, update on public.watchlist to authenticated;
