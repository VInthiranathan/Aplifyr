-- Create profiles table linked to auth.users
-- Table name: public.profiles

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  title text,
  location text,
  bio text,
  tech_stack text[],
  roles text[],
  cv_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Function: create profile row when a new auth user is created
create or replace function public.handle_new_auth_user()
returns trigger as $$
begin
  -- try to read a full_name from the user's raw metadata, fall back to email
  insert into public.profiles (id, full_name, created_at)
  values (
    new.id,
    coalesce((new.raw_user_meta_data->>'full_name')::text, new.email),
    now()
  )
  on conflict (id) do nothing;

  return new;
end;
$$ language plpgsql security definer;

-- Trigger: call function after a new row is inserted into auth.users
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute procedure public.handle_new_auth_user();

-- Optional: keep profile.updated_at in sync when profile changes
create or replace function public.profiles_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row
  execute procedure public.profiles_updated_at();
