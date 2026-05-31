# Quick Start

## Scope

This guide covers local development for the runnable app inside `Examensarbete/`.

## Prerequisites

- Node.js 20 or newer
- npm 10 or newer
- .NET SDK 10.0 preview or newer, because the backend targets `net10.0`
- a Supabase project
- optional: Supabase CLI if you want to push migrations from the command line
- optional: Gemini and or Groq API keys if you want AI cover letter generation

## Install Dependencies

From `Examensarbete/`:

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

Required for Supabase-backed profile and CV features:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Required for cover letter generation:

- at least one of `GEMINI_API_KEY` or `GROQ_API_KEY`

Notes:

- the backend can start without Supabase credentials, but only the JSON-backed endpoints will remain useful
- the cover letter endpoint returns `400` if neither AI key is configured

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

From `Examensarbete/`:

```powershell
supabase db push
```

### Option B: Supabase SQL Editor

Run the migration files in this order:

1. `supabase/migrations/001_create_profiles_table.sql`
2. `supabase/migrations/002_add_location_preferences_to_profiles.sql`
3. `supabase/migrations/003_add_private_cv_columns.sql`

## Configure Private CV Storage

Follow `documents/supabase-storage-setup.md` before testing CV upload.

## Start the App

From `Examensarbete/`:

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
5. Upload a text-based PDF CV.
6. Open a job detail page and generate a cover letter.

## Build Validation

These commands were validated on May 28, 2026:

```powershell
Set-Location .\backend
dotnet build

Set-Location ..\frontend
npm run build
```

## Local Development Notes

- backend CORS is currently hardcoded to localhost origins only
- the dashboard home page reads local JSON data from `backend/Data/jobs.json`
- the profile page depends on Supabase auth and the `profiles` table
- CV upload supports PDF only and rejects files larger than 5 MB