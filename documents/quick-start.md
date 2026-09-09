# Quick Start

## Scope

This guide covers local development for the runnable app inside `Aplifyr/`.

## Prerequisites

- Node.js 20 or newer
- npm 10 or newer
- .NET SDK 10.0 preview or newer, because the backend targets `net10.0`
- a Supabase project
- optional: Supabase CLI if you want to push migrations from the command line
- optional: Gemini and or Groq API keys if you want AI cover letter generation

## Install Dependencies

From `Aplifyr/`:

```powershell
npm install
```

The root `postinstall` script installs the frontend dependencies automatically.

## Environment Files

Create the environment files from the provided examples.

```powershell
Set-Location .\backend
Copy-Item .env.example .env

Set-Location ..\frontend
Copy-Item .env.example .env.local
```

### Backend Variables

File: `backend/.env`

Optional backend Supabase SDK initialization (frontend profile routes use the frontend Auth configuration):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Required for cover letter generation:

- `SUPABASE_URL` (HTTPS) and `SUPABASE_ANON_KEY`, for verifying the browser's bearer token
- `AI_ALLOWED_PROVIDERS`: enable only reviewed providers (`gemini`, `groq`, or both comma-separated); empty disables AI
- `GEMINI_MODEL` if Gemini is enabled; choose a model available in your account
- at least one of `GEMINI_API_KEY` or `GROQ_API_KEY`

Notes:

- the backend starts without Supabase credentials; public JobTech search and matching remain available
- AI returns 503 without configured Auth/approved providers, 401 for missing/invalid authentication, and 400 if enabled providers lack API keys
- AI requests are capped at 64 KiB and three jobs; process-local rate limits return 429

### Frontend Variables

File: `frontend/.env.local`

Required:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Usually set to the local backend URL:

- `BACKEND_URL=http://localhost:5000`
- `NEXT_PUBLIC_BACKEND_URL=http://localhost:5000`

Notes:

- some pages use `BACKEND_URL` during server-side rendering
- client-side job pages use `NEXT_PUBLIC_BACKEND_URL`
- keep both values aligned for local development

## Apply Database Migrations

The repository already contains the required SQL migrations in `supabase/migrations/`.

### Option A: Supabase CLI

From `Aplifyr/`:

```powershell
supabase db push
```

### Option B: Supabase SQL Editor

Run the migration files in this order:

1. `supabase/migrations/001_create_profiles_table.sql`
2. `supabase/migrations/002_add_location_preferences_to_profiles.sql`
3. `supabase/migrations/003_add_private_cv_columns.sql` (historical migration)
4. `supabase/migrations/004_create_profile_career_entries.sql`
5. `supabase/migrations/005_remove_cv_feature.sql`
6. `supabase/migrations/006_secure_profiles.sql`
7. `supabase/migrations/007_personal_data_limits.sql`
8. `supabase/migrations/008_privacy_consent_and_limits.sql`

For the owner's existing 001–005 installation with profile RLS, 008 is also supplied as a single manual upgrade including missing 007 limits and additive owner guards. It preserves existing policies. Reconcile migration history after manual application. AI now requires backend `SUPABASE_SERVICE_ROLE_KEY` for atomic reservations, reviewed/enabled DB notices and explicit user consent. See [privacy controls](privacy-controls.md); SQL alone does not deploy the UI or activate AI.

Existing installations: inspect live RLS/policies and migration history first. The owner reports profile RLS already enabled; do not blindly replay schema or policies. Follow [the Supabase/GDPR runbook](gdpr-supabase-runbook.md), including legacy constraint checks. Configure server-side `PRIVACY_NOTICE_SV`, `PRIVACY_NOTICE_EN` and `PRIVACY_CONTACT_EMAIL` before public launch; see [privacy controls](privacy-controls.md).

For an existing installation, follow `documents/retire-file-storage.md` for the one-time retirement of legacy storage.

## Start the App

From `Aplifyr/`:

```powershell
npm run dev
```

This starts both services:

- frontend: `http://localhost:3000`
- backend: `http://localhost:5000`

## Verify the Setup

1. Open `http://localhost:3000`.
2. Sign in through Supabase auth.
3. Visit `/jobs` and confirm live job listings load.
4. Visit `/user` and save a profile.
5. Add work experience and education, then verify both in the profile overview.
6. Configure approved AI providers, open a job detail page and generate a cover letter after reviewing the disclosure.
7. Verify direct Supabase profile access with two test users and an anonymous client. Only an owner's records must be accessible.

## Build Validation

These commands were validated on May 28, 2026:

```powershell
Set-Location .\backend
dotnet build

Set-Location ..\frontend
npm run build
```

## Local Development Notes

- backend CORS is configuration-driven and can use `CORS_ALLOWED_ORIGINS`
- the dashboard loads personalized JobTech matches; JSON jobs are a separate demo endpoint
- the profile page depends on Supabase auth and the `profiles` table
- career entries persist through `/api/career` and require migration 004
- migration 006 represents the repository's profile RLS baseline; reconcile with existing live policies before deployment

## Job-specific CV configuration

Apply migration `009_generated_cvs.sql` after 008 and before deploying the new account export.
Set backend-only `GEMINI_CV_API_KEY` and `GEMINI_CV_NOTICE_VERSION` (the reviewed active Gemini
notice covering CV/career processing). `GEMINI_API_KEY` remains for letters; CV has no key fallback.
Existing `GEMINI_MODEL`, `AI_ALLOWED_PROVIDERS=gemini` and backend Supabase credentials are required.
See [CV generation](cv-generation.md) for consent renewal, limits and staging checks.
