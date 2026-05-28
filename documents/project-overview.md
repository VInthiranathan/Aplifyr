# Project Overview

## Purpose

Aplifyr helps a user move from job discovery to a prepared application by combining job search, profile management, CV upload, and AI-assisted cover letter generation.

## Main User Flows

### Home Dashboard

- loads local data from `backend/Data/jobs.json`
- shows progression and match grades
- requires a signed-in Supabase session before rendering the page

### External Job Search

- frontend page: `frontend/pages/jobs/index.tsx`
- backend controller: `backend/Controllers/ExternalJobsController.cs`
- data source: Arbetsformedlingen JobSearch API
- supports search, municipality, region, remote, employment type, and occupation filters

### Job Detail and Cover Letter Generation

- frontend page: `frontend/pages/jobs/[id].tsx`
- backend controller: `backend/Controllers/CoverLettersController.cs`
- the frontend fetches the user profile and includes CV text when available
- the backend detects the language from the job description and then calls Gemini first, with Groq as fallback

### User Profile and CV

- frontend page: `frontend/pages/user/index.tsx`
- frontend API routes: `frontend/pages/api/profile.ts`, `frontend/pages/api/upload-cv.ts`, `frontend/pages/api/cv.ts`
- Supabase stores profile data in `public.profiles`
- uploaded CV PDFs are stored in a private `cvs` bucket
- extracted PDF text is saved to `profiles.cv_text` and reused during cover letter generation

## Architecture

### Frontend

- Next.js 16 with the Pages Router
- TypeScript
- Tailwind CSS
- next-i18next for English and Swedish translations
- Supabase auth helpers for browser and server-side auth handling

### Backend

- ASP.NET Core Web API on .NET 10
- JSON-backed local endpoints for dashboard data
- integration with Arbetsformedlingen for external jobs
- integration with Gemini and Groq for cover letter generation
- optional Supabase client setup during startup

### Supabase

- auth for sign-in and session handling
- `profiles` table for user-facing profile data
- private Storage bucket for CV uploads

## Important Runtime Behavior

- `frontend/next.config.js` rewrites `/api/:path*` to the backend base URL
- some frontend pages still read `BACKEND_URL`, while client-side job pages use `NEXT_PUBLIC_BACKEND_URL`
- backend startup works without a `.env`, but Supabase-backed features then become unavailable
- cover letter generation fails fast if both AI keys are missing

## Current Known Limitations

- the backend CORS policy is restricted to localhost origins
- profile image upload is only client-side preview and is not persisted yet
- the job detail page still exposes a debug toggle for raw API output
- job and profile extraction logic contains some silent catches, which makes failures harder to diagnose

## Folder Map

- `backend/`: ASP.NET Core API
- `frontend/`: Next.js app
- `supabase/`: Supabase config and SQL migrations
- `documents/`: setup guides, review notes, and project documentation