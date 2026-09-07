# Database Schema

## Scope

This document reflects the current schema implied by the checked-in Supabase migrations.

## Current Table: `public.profiles`

Created and extended by:

- `supabase/migrations/001_create_profiles_table.sql`
- `supabase/migrations/002_add_location_preferences_to_profiles.sql`
- `supabase/migrations/003_add_private_cv_columns.sql` (historical)
- `supabase/migrations/005_remove_cv_feature.sql` (removes legacy document fields)

Current columns:

- `id uuid primary key references auth.users(id) on delete cascade`
- `full_name text`
- `title text`
- `location text`
- `bio text`
- `tech_stack text[]`
- `roles text[]`
- `location_preferences text[] default '{}'::text[]`
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

## Career History

Migration 004 adds `public.profile_career_entries`, with owner-only row-level security.
See `profile-career-history.md` for fields and API behavior. Migration 005 leaves these
entries intact and retires legacy document storage; see `retire-file-storage.md`.

## Notes for Future Work

If the project later needs application history, generated document archives, or structured job tracking, those tables still need real migrations before they can be treated as part of the live system.