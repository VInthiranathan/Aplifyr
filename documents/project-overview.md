# Project Overview

## Current stage

The 2026-10-08 follow-up fixes root/build dependency advisories, upgrades the approved Tailwind build chain to 4.3.3, strengthens CI audits and password recovery, and adds local Auth/load/deletion-restore checks. Supabase platform work was excluded by the owner during this follow-up. Current local results and outstanding launch decisions are recorded at the top of [the operations runbook](gdpr-supabase-runbook.md). These changes have not been published or deployed.

Development/testing; public-launch prerequisites remain open. PR #34 is merged into main. See [the runbook](gdpr-supabase-runbook.md) for dated CI, migration, notice activation and deployment evidence. Code availability does not prove that the entire hosted flow is verified.

## Purpose

Aplifyr helps a user move from job discovery to a prepared application by combining job search, profile management, work experience and education, and AI-assisted cover letter generation.

## Main User Flows

### Guest access

- `/jobs`, `/jobs/[id]`, `/support`, `/auth` and `/privacy` are public. Anonymous `/` redirects to job search; authenticated `/` retains personalized matches and prepared jobs.
- Desktop and mobile navigation offer sign-in for guests; auth also offers **Continue without an account**. Search/filter/ad APIs were already public; no private API or RLS policy is opened.
- CV pages, profile, application tracking, favorites and document APIs retain authentication. Guest document/favorite actions lead to login with an allowlisted `returnTo` destination. Login and the email-confirmation page preserve the selected job; query payloads and external redirects are rejected.
- Before either generation flow, the UI checks the saved profile and career data. Missing information leads to profile editing with a link back to the selected job/CV page. Backend independently requires a nonblank name plus a nonblank biography, at least one nonblank skill, or a career entry with a title. Beginners need not have employment history; contact fields remain optional.
- `GenerationProfile` verifies the saved, owner-scoped profile before letter provider calls; CV uses the same readiness rule. Incomplete profiles return `422 profileEmpty`. Existing consent/reservation, quotas and document retention remain in force. The letter's bounded client-supplied facts remain the existing trust limitation.
- `AuthSessionProvider` supplies UI state only; server authentication remains authoritative. Guests do not fetch profile/application/saved-letter data on public pages. Public HTML retains CSP and private/no-store caching.
- Verification: `guest-access.test.cjs`, `proxy-refresh.test.cjs`, auth/CV regressions and backend security tests cover routing, safe return destinations, readiness and protected endpoints. Real hosted registration/email/provider flows still require deployment verification.


### Account registration and sign-in

- When the deployment lacks public Supabase Auth configuration, login/signup remain disabled and show a localized availability message before users submit. Guest browsing stays available. Preview deployments need their own configured Auth environment; a successful build alone does not verify registration availability.

- `/auth` keeps the existing split sign-in form and uses the refined animated Aplifyr brand panel.
- Registrations that require email confirmation continue to `/auth/verify-email`, where the activation step is explained before the user returns to sign in.
- If Supabase returns an active session immediately, registration continues directly to the authenticated home page.
- Successful signup/login is retained if client navigation fails: the form clears passwords and offers a safe continuation link instead of reporting registration failure. Duplicate submissions are blocked. A signup transport failure reports an uncertain result and asks the user to check email before trying again.
- Signup and explicit confirmation resend set `emailRedirectTo` to the current origin's localized `/auth/confirm`, preserving only an allowlisted job/return destination. The callback uses `serverSupabase` to exchange the PKCE code (including `sb_flow_id` when supplied), persists response cookies, and redirects to a clean `/auth/verify-email` result URL before rendering. Each outbound callback request has a 10-second timeout. Codes/error descriptions are not rendered or logged; an empty redirect fragment removes inherited error hashes.
- The confirmation screen supports success, used/expired/invalid link, missing browser verifier, and temporary Auth failure. Cross-browser confirmation may activate the email without establishing a session; users are guided to email/password sign-in instead of registering again. Login maps `email_not_confirmed` to the verification screen without preventing a later retry.
- A new confirmation email can be requested explicitly with `auth.resend({ type: 'signup' })`; it does not create another account. The email field stays in component memory, not the URL or app storage. Responses use generic wording, with a 60-second UI cooldown plus Supabase's independent hosted limits. Both locales contain friendly errors instead of raw provider messages.
- Hosted prerequisites: the controlled production origin must be configured as Supabase's Site URL, and the localized callback URLs (with safe return parameters) must be accepted by its redirect allowlist. Confirm-signup emails must use `{{ .ConfirmationURL }}` so Supabase verifies the email and redirects to the requested callback. Existing links issued before this change still use their old destination. A custom token-hash template is not handled by this PKCE callback. No hosted configuration was changed by this implementation.
- `auth-confirmation.test.cjs` exercises rendered signup/resend/login pages and server callback outcomes with synthetic Auth fixtures. This is separate from real email delivery, hosted redirect configuration and production browser verification, which still require a controlled test mailbox and deployment of this branch.

### Job-specific CV

- `/jobs/[id]/cv` maintains job context, stores the latest generated CV for seven days, restores it on return, supports immediate deletion and saved per-statement editing without extending expiry, and exports the saved revision as a local PDF.
- Gemini rewrites profile, work and education text in the advertisement's Swedish or English language, with source references and a separate factual review using the CV key. CV preview/PDF headings follow the same language.
- See [CV generation](cv-generation.md) for contracts, migrations 009 and 20260918164504, retention, source-validation limits and configuration.


### Home Dashboard

- loads personalized JobTech matches through `JobMatchingService`, exposed by `ExternalJobsController.Matching.cs`, using desired roles, geographic preferences, and explicit profile/career skills
- shows matched jobs, a preparation/submission work queue and follow-up actions
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
- cover letter generation fails closed without configured Auth or approved AI providers; see [deployment runbook](gdpr-supabase-runbook.md) for configuration and deployment checks

## Current Known Limitations

- backend CORS is configuration-driven, with localhost defaults; deployments must configure their allowed origins
- profile images are initials-only; file uploads are disabled
- the job detail page has no raw-response debug toggle
- job and profile extraction logic contains some silent catches, which makes failures harder to diagnose
- support uses a configured mailto contact; sending occurs in the user's mail application and requires a real monitored mailbox
- favorites are browser-local and account-scoped; legacy unowned favorites are cleared rather than assigned to another login
- backend demo `/api/user` is Development-only; general limits are process-local, while AI reservations and quotas are shared through Supabase migration 008
- GDPR operational tasks and remaining code limitations are listed in the [deployment runbook](gdpr-supabase-runbook.md)

## Folder Map

- `backend/`: ASP.NET Core API
- `frontend/`: Next.js app
- `supabase/`: Supabase config and SQL migrations
- `documents/`: setup guides, review notes, and project documentation

The job page reuses its cover-letter button to open an existing letter. The letter modal exports its current text as a local PDF; see [cover-letter setup](cover-letter-setup.md).

## Security hardening

Backend endpoints now require verified authentication by default; public controllers explicitly opt out. Authentication, generation and document/public traffic have separate admission limits. `CvStore` exposes named, owner-bound write operations. Generated CV responses use the database revision so an immediate edit does not conflict with a fabricated timestamp. Frontend SSR auth and application pagination share implementations; job-ad rendering is extracted to `components/JobAdContent.tsx`.

The hardening migration tightens grants, validates legacy constraints, enforces application quotas and adds version-bound AI reservations. Hosted execution is recorded in the runbook. Current code pins `2026-10-documents-v3`. Client-supplied ordinary letter facts remain a trust limitation; restructuring does not make those facts authoritative.

## Application boundaries after decomposition

| Area | Responsibility |
|---|---|
| `CvsController` / `CoverLettersController` | HTTP routes, request limits, authentication checks and safe response/error mapping |
| `CvApplicationService` / `LetterApplicationService` | Generation/edit workflows, consent checks, source selection and owner-bound persistence |
| `CanonicalJobClient` / `LetterProvider` / `LetterPrompt` | Canonical ad transport, per-attempt provider reservations and prompt instructions |
| `JobMatchingService` | Shared bounded cache, continuation cursors, serialization gates and ranking orchestration |
| `JobMatchingRules` / `JobSearchCatalog` | Pure scoring/normalization and upstream vocabulary; CV reuses rules without depending on a controller |
| `ApplicationServices` | Shared dependency registration and bounded HTTP-client configuration |
| `features/home` | Matching lifecycle hook plus matched/prepared lists and grade summary |
| `features/jobs` | Search lifecycle/filter UI, job loading, application tracking and saved-letter/generation hooks |

Pages retain routing/SSR and compose these units. Hooks preserve cancellation/session isolation already covered by behavior tests; rules and services can be tested without a browser. The application services still receive the verified request context for owner-bound storage and AI reservations; they do not return MVC results. Public job search/ad-fallback transport stays in the smaller ExternalJobs controller. This decomposition adds no provider, persistence purpose, migration or deployment setting.

### Approved security dependency patches — 2026-10-01

Next.js is pinned to 16.3.6 and the lockfile resolves DOMPurify to 3.4.16 after owner approval. These address the dependency audit failures found during the guest-access PR. No hosting settings or database schema changes are required.

## Application workspace

Job-specific tabs now connect overview, CV, saved cover-letter editing, application status and private notes. Home offers an actionable prepared/submitted work queue and follow-ups. Shared job-card progress and deterministic matching explanations make the current state visible; profile readiness gives concrete recommendations. Single-statement/paragraph AI proposals require review and explicit save. See [Application workspace](application-workspace.md) for contracts, migration, privacy, limitations and rollout. PR #34 is merged; the workspace migration and v3 notice activation have been completed as separate approved operations. Render and end-to-end hosted behavior still need verification.

## Documentation map

- [Quick start](quick-start.md) and [troubleshooting](troubleshooting.md): setup and failure diagnosis.
- [Database schema](database-schema.md): tables, ownership and retention.
- [Privacy controls](privacy-controls.md): implemented data and consent contracts.
- [Operations runbook](gdpr-supabase-runbook.md): verified status, migration mappings, launch prerequisites and legacy-storage cleanup.
- Feature contracts: [workspace](application-workspace.md), [CV](cv-generation.md), [letters](cover-letter-setup.md), [applications](job-application-tracking.md), [matching](job-preferences-matching.md), [career](profile-career-history.md), [mobile](mobile-app-experience.md).
