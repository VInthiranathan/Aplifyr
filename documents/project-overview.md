# Project Overview

## Purpose

Aplifyr helps a user move from job discovery to a prepared application by combining job search, profile management, work experience and education, and AI-assisted cover letter generation.

## Main User Flows

### Account registration and sign-in

- `/auth` keeps the existing split sign-in form and uses the refined animated Aplifyr brand panel.
- Registrations that require email confirmation continue to `/auth/verify-email`, where the activation step is explained before the user returns to sign in.
- If Supabase returns an active session immediately, registration continues directly to the authenticated home page.

### Job-specific CV

- `/jobs/[id]/cv` maintains job context, stores the latest generated CV for seven days, restores it on return, supports immediate deletion and saved per-statement editing without extending expiry, and exports the saved revision as a local PDF.
- Gemini rewrites profile, work and education text in the advertisement's Swedish or English language, with source references and a separate factual review using the CV key. CV preview/PDF headings follow the same language.
- See [CV generation](cv-generation.md) for contracts, migrations 009 and 20260918164504, retention, source-validation limits and configuration.


### Home Dashboard

- loads personalized JobTech matches through `ExternalJobsController.Matching.cs`, using desired roles, geographic preferences, and explicit profile/career skills
- shows match grades and two job-list tabs: matched jobs and prepared jobs
- adds a job to prepared jobs only after a CV or cover letter is generated successfully; the latest CV and latest cover letter are stored for seven days and can be deleted independently
- requires a signed-in session when Supabase is configured
- see [Job preferences and matching](job-preferences-matching.md) for scoring, caching, pagination, and verification

### Job application tracking

- `/applications` shows owner-scoped submitted applications with process status, dates, next action and private notes
- `/jobs/[id]` creates an application only after the user explicitly marks the job as applied
- updates use optimistic concurrency; records are included in account export and remain until user/account deletion
- see [Job application tracking](job-application-tracking.md) for routes, persistence, security and verification

### External Job Search

- frontend page: `frontend/pages/jobs/index.tsx`
- backend controller: `backend/Controllers/ExternalJobsController.cs`
- data source: Arbetsformedlingen JobSearch API
- supports search, municipality, region, remote, employment type, and occupation filters

### Job Detail and Cover Letter Generation

- frontend page: `frontend/pages/jobs/[id].tsx`
- backend controller: `backend/Controllers/CoverLettersController.cs`
- the frontend fetches supported user profile fields for personalization
- the backend verifies the Supabase bearer token and uses the same ad-language selection as CV generation; only explicitly approved providers may be called (Gemini first, Groq fallback if both are enabled)
- AI is disabled until `AI_ALLOWED_PROVIDERS` is configured; Gemini also requires `GEMINI_MODEL`
- job HTML is sanitized; the user is informed before sharing profile facts with external AI

### User Profile and Career History

- frontend page: `frontend/pages/user/index.tsx`
- frontend API routes: `frontend/pages/api/profile.ts`, `frontend/pages/api/career.ts`
- Supabase stores profile data in `public.profiles`
- work experience and education are stored in `public.profile_career_entries`
- the overview displays all saved career details; separate tabs provide editing
- the job preferences tab edits desired roles, home location, and geographic preferences; these details are no longer edited in the overview
- see [Career history](profile-career-history.md) and [Job preferences and matching](job-preferences-matching.md)

## Architecture

### Privacy controls

- Follow-up migration 008 adds per-provider consent and withdrawal, immutable notice receipts, distributed AI reservations and career quotas. Nonce CSP and bounded matching capacity are now implemented. See the current enforcement section in [Privacy controls](privacy-controls.md).

- Public `/privacy` page links to an authenticated, owner-scoped JSON export and configured rights contact.
- General profile edits now require an optimistic version; career reads use bounded keyset pagination.
- External employer logos are replaced with local icons to avoid automatic third-party image requests.
- See [Privacy controls](privacy-controls.md) for contracts and limitations, and the Swedish [Supabase/GDPR runbook](gdpr-supabase-runbook.md) for deployment and organizational actions.

### Frontend

- Next.js 16 with the Pages Router
- TypeScript
- Tailwind CSS
- next-i18next for English and Swedish translations
- `@supabase/ssr` for browser/server auth; shared `lib/serverSupabase.ts` for API and SSR cookies
- mobile-first app shell with safe-area-aware top and bottom navigation, contained page scrolling, responsive filters, and bottom-sheet dialogs; see [Mobile app experience](mobile-app-experience.md)

### Backend

- ASP.NET Core Web API on .NET 10
- JSON-backed local demo endpoints for jobs and user data, separate from personalized dashboard matching
- integration with Arbetsformedlingen for external jobs
- integration with Gemini and Groq for cover letter generation
- optional Supabase client setup during startup

### Supabase

- auth for sign-in and session handling
- `profiles` table for user-facing profile data
- owner-only profiles (migration 006) and career history (migration 004), protected by row-level security

## Important Runtime Behavior

- `frontend/next.config.js` rewrites `/api/:path*` to the backend base URL
- some frontend pages still read `BACKEND_URL`, while client-side job pages use `NEXT_PUBLIC_BACKEND_URL`
- backend startup works without a `.env`, but Supabase-backed features then become unavailable
- cover letter generation fails closed without configured Auth or approved AI providers; see [Security and EU privacy audit](security-gdpr-audit-2026-09-08.md) for configuration and deployment checks

## Current Known Limitations

- backend CORS is configuration-driven, with localhost defaults; deployments must configure their allowed origins
- profile images are initials-only; file uploads are disabled
- the job detail page has no raw-response debug toggle
- job and profile extraction logic contains some silent catches, which makes failures harder to diagnose
- support uses a configured mailto contact; sending occurs in the user's mail application and requires a real monitored mailbox
- favorites are browser-local and account-scoped; legacy unowned favorites are cleared rather than assigned to another login
- backend demo `/api/user` is Development-only; general limits are process-local, while AI reservations and quotas are shared through Supabase migration 008
- GDPR operational tasks and remaining code limitations are listed in the [security and EU privacy audit](security-gdpr-audit-2026-09-08.md)

## Folder Map

- `backend/`: ASP.NET Core API
- `frontend/`: Next.js app
- `supabase/`: Supabase config and SQL migrations
- `documents/`: setup guides, review notes, and project documentation

The job page reuses its cover-letter button to open an existing letter. The letter modal exports its current text as a local PDF; see [cover-letter setup](cover-letter-setup.md).

## Security hardening — 2026-09-26 (prepared, not deployed)

Backend endpoints now require verified authentication by default; public controllers explicitly opt out. Authentication, generation and document/public traffic have separate admission limits. `CvStore` exposes named, owner-bound write operations. Generated CV responses use the database revision so an immediate edit does not conflict with a fabricated timestamp. Frontend SSR auth and application pagination share implementations; job-ad rendering is extracted to `components/JobAdContent.tsx`.

The accompanying migration tightens grants, validates legacy constraints, enforces the application quota and adds version-bound AI reservations. CI adds secret and dependency checks. The current code requires document notice `2026-09-documents-v2`; the migration deliberately leaves it disabled. See the [rollout section in the runbook](gdpr-supabase-runbook.md#9-härdning-2026-09-26--förberedd-utrullning) for ordering and outstanding production work. Large controllers/pages and client-supplied cover-letter facts remain incremental refactoring work; this is not a complete architectural rewrite.
