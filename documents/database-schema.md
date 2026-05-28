# Database Schema

## Scope

This document reflects the current schema implied by the checked-in Supabase migrations.

It replaces the old planning note that described separate `cvs`, `job_posts`, `applications`, and `generated_documents` tables. Those tables are not created by the current migration set.

## Current Table: `public.profiles`

Created and extended by:

- `supabase/migrations/001_create_profiles_table.sql`
- `supabase/migrations/002_add_location_preferences_to_profiles.sql`
- `supabase/migrations/003_add_private_cv_columns.sql`

Current columns:

- `id uuid primary key references auth.users(id) on delete cascade`
- `full_name text`
- `title text`
- `location text`
- `bio text`
- `tech_stack text[]`
- `roles text[]`
- `cv_url text`
- `location_preferences text[] default '{}'::text[]`
- `cv_storage_path text`
- `cv_text text`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

## Triggers and Functions

### New User Profile Creation

Migration `001_create_profiles_table.sql` creates `public.handle_new_auth_user()` and an `on_auth_user_created` trigger on `auth.users`.

Result:

- a profile row is created automatically when a new auth user is inserted

### Automatic `updated_at`

Migration `001_create_profiles_table.sql` also creates `public.profiles_updated_at()` and a `set_profiles_updated_at` trigger.

Result:

- `updated_at` is refreshed before each profile update

## Storage Relationship

CV files are not stored in a database table. The current app stores:

- the actual PDF in the private Supabase Storage bucket `cvs`
- the storage path in `profiles.cv_storage_path`
- extracted text in `profiles.cv_text`

## Notes for Future Work

If the project later needs application history, generated document archives, or structured job tracking, those tables still need real migrations before they can be treated as part of the live system.