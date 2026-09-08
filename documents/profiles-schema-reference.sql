-- Historical schema reference only. Apply numbered supabase/migrations instead.
create table public.profiles (
  id uuid not null,
  full_name text null,
  title text null,
  location text null,
  bio text null,
  tech_stack text[] null,
  roles text[] null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  location_preferences text[] null default '{}'::text[],
  constraint profiles_pkey primary key (id),
  constraint profiles_id_fkey foreign KEY (id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create trigger set_profiles_updated_at BEFORE
update on profiles for EACH row
execute FUNCTION profiles_updated_at ();