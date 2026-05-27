alter table public.profiles
add column if not exists location_preferences text[] default '{}'::text[];