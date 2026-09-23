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
- `supabase/migrations/20260921184722_add_profile_contact_details.sql` (optional validated CV contact fields)

Current columns:

- `id uuid primary key references auth.users(id) on delete cascade`
- `full_name text`
- `title text`
- `location text`
- `contact_email text`
- `phone text`
- `website_url text`
- `linkedin_url text`
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

Migration `20260921184722_add_profile_contact_details.sql` adds optional contact email,
telephone, HTTPS website/portfolio and HTTPS LinkedIn fields to the existing owner-only
profile row. Database checks bound their lengths and reject malformed direct writes.
It does not add grants or policies; migration 006/008 ownership enforcement continues
to apply to the whole row.

Migration 009 adds `generated_cvs`, keyed by `(user_id, job_id)`, with owner-only SELECT/DELETE, backend-only validated writes, bounded JSON and account-deletion cascade. Migration `20260918164504_prepared_jobs_and_generated_document_retention.sql` adds `expires_at`, creates `generated_cover_letters` with the same owner/job key, and makes the latest CV and cover letter readable for seven days from generation. Regeneration replaces the relevant row and restarts its independent seven-day period; no version history is stored. The legacy CV save RPC delegates to the retention-aware RPC during rolling deployment. An hourly Supabase Cron job physically deletes expired rows after RLS has already hidden them.

The same migration adds `prepared_jobs`, keyed by `(user_id, job_id)`. It stores bounded public job context plus the active expiry for each generated artifact; document content remains in the corresponding generated-document table. Authenticated users can only select their own active rows and generated documents; backend service RPCs perform validated writes. Deleting or expiring one artifact clears only its marker and removes the prepared job only when neither artifact remains. All three tables cascade on account deletion. See [CV generation](cv-generation.md) and [cover-letter setup](cover-letter-setup.md).

## Job applications

Migration `20260923122723_job_application_tracker.sql` adds `public.job_applications`, keyed by `(user_id, job_id)`. It stores bounded job context, one validated process status, application date, optional next action/date, notes and timestamps. The authenticated role has CRUD access only through owner-scoped RLS policies; UPDATE uses both `USING` and `WITH CHECK`. Records cascade when the Auth user is deleted. See [Job application tracking](job-application-tracking.md).
