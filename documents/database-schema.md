# Database Schema

## Scope

This document reflects the current schema implied by the checked-in Supabase migrations.

## Current Table: `public.profiles`

Created and extended by:

- `supabase/migrations/001_create_profiles_table.sql`
- `supabase/migrations/002_add_location_preferences_to_profiles.sql`
- `supabase/migrations/003_add_private_cv_columns.sql` (historical)
- `supabase/migrations/005_remove_cv_feature.sql` (removes legacy document fields)
- `supabase/migrations/006_secure_profiles.sql` (owner-only row-level access)
- `supabase/migrations/007_personal_data_limits.sql` (profile/skill limits, initially NOT VALID for legacy rows)

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

Migration 006 enables RLS on profiles, revokes anon/public grants, and grants authenticated CRUD subject to ownership. A restrictive owner guard also constrains older permissive policies. It locks the signup/update trigger functions' search paths and restricts direct execution of the signup function. No profile data is deleted by migration 006.

`documents/profiles-schema-reference.sql` is only a historical schema reference, not a migration. Apply the numbered migration files; do not replay the reference over existing tables.

### New User Profile Creation

Migration `001_create_profiles_table.sql` creates `public.handle_new_auth_user()` and an `on_auth_user_created` trigger on `auth.users`.

Result:

- a profile row is created automatically when a new auth user is inserted

### Automatic `updated_at`

Migration `001_create_profiles_table.sql` also creates `public.profiles_updated_at()` and a `set_profiles_updated_at` trigger.

Result:

- `updated_at` is refreshed before each profile update

## Career History

Migration 008 introduces versioned `ai_privacy_notices`, owner-readable/RPC-written `ai_consents` and `ai_consent_receipts`, private `ai_usage` and singleton `ai_budget`, plus private `aplifyr_career_counts`. All personal owner tables cascade from auth.users. Client grants cannot modify consents or quota counters; the service-role-only reservation checks current consent and budget atomically. See [privacy controls](privacy-controls.md) for contracts, limits, retention responsibilities and upgrade prerequisites.

Migration 004 adds `public.profile_career_entries`, with owner-only row-level security.
See `profile-career-history.md` for fields and API behavior. Migration 005 leaves these
entries intact and retires legacy document storage; see `retire-file-storage.md`.

## Notes for Future Work

Migration 007 limits profile name/title/location to 200 characters, bio to 5,000, and profile lists to 50 non-null items of at most 100 characters. Career skill items receive the same per-item constraint. Older invalid rows are preserved until reviewed; new writes are checked. Total career count is not limited by this migration. See [the runbook](gdpr-supabase-runbook.md) before applying or validating constraints. Existing production RLS must be inspected, not assumed missing or replaced blindly.

Migration 009 adds `generated_cvs`, keyed by `(user_id, job_id)`, with owner-only SELECT/DELETE, backend-only validated writes, bounded JSON and account-deletion cascade. See [CV generation](cv-generation.md). It stores the latest result, not version history. Application history and structured user-owned job tracking remain future work.
