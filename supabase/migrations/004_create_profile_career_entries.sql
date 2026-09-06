-- Structured CV source facts, owned by the signed-in user.
begin;
create table public.profile_career_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('work', 'education')),
  title text not null check (length(trim(title)) between 1 and 200),
  organization text not null check (length(trim(organization)) between 1 and 200),
  location text not null default '' check (length(location) <= 200),
  qualification text not null default '' check (length(qualification) <= 200),
  start_month text not null check (start_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' and start_month >= '1900-01'),
  end_month text check (end_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  is_current boolean not null default false,
  description text not null default '' check (length(description) <= 5000),
  achievements text not null default '' check (length(achievements) <= 5000),
  learned text not null default '' check (length(learned) <= 5000),
  skills text[] not null default '{}' check (cardinality(skills) <= 50),
  strengths text not null default '' check (length(strengths) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((is_current and end_month is null) or
         (not is_current and end_month is not null and end_month >= start_month))
);
create index profile_career_entries_user_kind_idx
  on public.profile_career_entries (user_id, kind, start_month desc);

alter table public.profile_career_entries enable row level security;
revoke all on public.profile_career_entries from anon;
grant select, insert, update, delete on public.profile_career_entries to authenticated;
create policy career_select on public.profile_career_entries for select to authenticated
  using ((select auth.uid()) = user_id);
create policy career_insert on public.profile_career_entries for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy career_update on public.profile_career_entries for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy career_delete on public.profile_career_entries for delete to authenticated
  using ((select auth.uid()) = user_id);
create trigger career_updated_at before update on public.profile_career_entries
  for each row execute function public.profiles_updated_at();
commit;
