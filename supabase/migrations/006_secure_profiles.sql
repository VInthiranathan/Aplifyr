begin;
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, public;
grant select, insert, update, delete on public.profiles to authenticated;
-- Restrictive guard also constrains any older, permissive dashboard-created policy.
drop policy if exists profiles_owner_guard on public.profiles;
create policy profiles_owner_guard on public.profiles as restrictive for all to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
drop policy if exists profiles_owner_access on public.profiles;
create policy profiles_owner_access on public.profiles for all to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
alter function public.handle_new_auth_user() set search_path = '';
alter function public.profiles_updated_at() set search_path = '';
revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;
commit;
