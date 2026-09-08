-- Review legacy violations before VALIDATE; do not truncate personal data automatically.
begin;
create function public.aplifyr_short_text_array(value text[])
returns boolean language sql immutable set search_path = '' as $$
  select value is null or (
    cardinality(value) <= 50 and
    not exists (select 1 from unnest(value) as item where item is null or length(item) > 100)
  );
$$;
revoke all on function public.aplifyr_short_text_array(text[]) from public;
grant execute on function public.aplifyr_short_text_array(text[]) to authenticated, service_role;
alter table public.profiles add constraint profiles_personal_data_limits check (
  (full_name is null or length(full_name) <= 200) and
  (title is null or length(title) <= 200) and
  (location is null or length(location) <= 200) and
  (bio is null or length(bio) <= 5000) and
  public.aplifyr_short_text_array(tech_stack) and
  public.aplifyr_short_text_array(roles) and
  public.aplifyr_short_text_array(location_preferences)
) not valid;
alter table public.profile_career_entries add constraint career_skill_item_limits
  check (public.aplifyr_short_text_array(skills)) not valid;
commit;
