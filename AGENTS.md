# Aplifyr — Agent Instructions

## 1. Project Overview

Aplifyr contains:

- `backend/` — .NET 10 Web API (`Aplifyr.Api`)
- `frontend/` — Next.js 16 Pages Router application
- `supabase/` — Supabase configuration and migrations

Frontend and backend are independently runnable services.

The product name is **Aplifyr**. Do not reintroduce previous product names in application code, configuration, namespaces, package metadata, or UI.

---

## 2. Source of Truth

Read only the documentation relevant to the task:

- `documents/project-overview.md` — architecture and project purpose
- `documents/quick-start.md` — local setup and workflow
- `documents/database-schema.md` — database structure
- relevant feature documentation under `documents/`

`AGENTS.md` defines persistent repository rules.

Project documents define implementation-specific behavior.

---

## 3. Git Safety

- Do not create or switch branches unless explicitly requested.
- Never make changes directly to `main` unless explicitly requested.
- Do not amend, rewrite, rebase, reset, or force-push existing commits unless explicitly requested.
- Keep changes focused on the requested task.
- Review the final diff before finishing.
- Do not modify unrelated files.

---

## 4. Documentation

Feature documentation is part of implementation.

When a feature is added, changed, or removed:

- update the existing canonical document in `documents/`
- create a new document only when no suitable document exists
- update `documents/project-overview.md` when needed for discoverability
- update architecture, setup, database, or privacy documentation when affected

Documentation must describe actual implemented behavior.

Where relevant, include:

- purpose and scope
- user flow
- routes/components
- API contracts
- persistence/migrations
- permissions/security
- validation/error behavior
- important limitations
- verification steps

Keep documentation consistent with code and schema.

---

## 5. Backend Rules

Controllers live in `backend/Controllers/` and use `[ApiController]` with `api/[controller]` routes.

Current architecture:

- `JobsController` and `UserController` use local JSON data.
- `ExternalJobsController` integrates with Arbetsförmedlingen / JobTech.
- `CoverLettersController` may use Gemini and/or Groq.
- `UploadController` only retains its health endpoint; file uploads are disabled.
- `Program.cs` may initialize Supabase, but local backend startup must not fail because optional Supabase credentials are missing or invalid.

Rules:

- preserve existing routes and response shapes unless the task requires an API change
- keep CORS configuration-driven
- prefer typed request parsing
- do not silently swallow meaningful parsing or integration failures
- preserve the local JSON-backed demo flow unless the task explicitly changes its data source

---

## 6. Frontend Rules

The frontend uses the **Next.js Pages Router**.

Do not introduce App Router patterns unless the project is intentionally migrated.

Use:

- `frontend/types/api.ts` for shared API types
- `frontend/lib/backendUrl.ts` for backend URL resolution
- `frontend/components/` for shared components
- `lucide-react` for icons
- `next-themes` for theme support
- Tailwind CSS for styling

`frontend/proxy.ts` contains active request/proxy logic.

### Backend URLs

- server-side: `getServerBackendUrl()`
- client-side: `getPublicBackendUrl()`
- keep fallback behavior aligned with `frontend/next.config.js`

Do not duplicate backend URL fallback logic inline.

---

## 7. Internationalisation

`next-i18next` supports:

- `en`
- `sv`

Shared namespace: `common`

Locale files:

- `frontend/public/locales/en/common.json`
- `frontend/public/locales/sv/common.json`

Rules:

- user-facing strings require translation keys in both locales
- do not hardcode visible English/Swedish strings in JSX unless they are external data
- group keys by feature/page
- pages using translations must load the required namespace

---

## 8. UI and Styling

Keep UI consistent with the existing application.

Prefer shared primitives over page-local styling.

### Layout primitives

Use where appropriate:

- `app-page-shell`
- `app-page-header`
- `app-page-title`
- `app-page-subtitle`

### Interactive surfaces

- `app-hover-standard`
- `app-card-base`
- `app-card-hover`

### Buttons

Prefer `frontend/components/ui/button.tsx`.

Use existing variants:

- primary
- secondary
- ghost
- external — outbound links only
- link

Avoid adding page-specific button color systems for standard actions.

### Job lists

Prefer:

- `frontend/components/JobListCard.tsx`
- `app-job-list-card`

New UI must support light and dark mode.

---

## 9. Profile Rules

- Profile images are initials-only unless storage and persistence are implemented end to end.
- File/CV uploads are disabled.
- Work experience and education belong in their dedicated profile areas.
- Desired roles and geographic preferences belong in Job Preferences.
- Matching behavior is documented in `documents/job-preferences-matching.md`.

Keep detailed feature behavior in canonical feature documents instead of duplicating it here.

---

## 10. Supabase and Database Rules

Repository migrations live under `supabase/`.

For schema changes:

- inspect relevant existing migrations
- preserve compatibility where practical
- review constraints, indexes, triggers, and RLS implications
- keep migration files production-safe
- do not assume missing repository migrations prove that production policies are absent
- do not blindly replace existing RLS policies

Take extra care with destructive changes such as:

- dropping tables/columns
- deleting data
- replacing policies
- changing authentication behavior
- removing constraints

---

## 11. Privacy, GDPR, and Security

For features involving personal data, read:

- `documents/privacy-controls.md`
- `documents/gdpr-supabase-runbook.md`
- relevant feature documentation

Do not invent:

- legal bases
- processor agreements
- retention periods
- transfer safeguards
- compliance claims

For user-owned Supabase data:

- evaluate RLS requirements
- enforce ownership server-side/database-side
- do not rely on frontend-only authorization
- keep service-role credentials server-only
- verify identity independently of client-supplied IDs

Optional AI processing must follow the project's documented consent flow.

Do not:

- bypass required consent/reservation flows
- silently enable fallback providers
- preselect optional consent
- transmit unnecessary personal data
- silently add processors or tracking

Do not claim end-to-end deletion or GDPR conformity unless verified across all relevant systems.

---

## 12. Secrets and Environment

Never commit secrets or credentials.

Do not commit:

- real `.env` files
- API keys
- access tokens
- Supabase service-role keys
- private certificates or credentials

Use environment variables and `.env.example` for examples.

Rules:

- keep server secrets out of `NEXT_PUBLIC_*`
- do not hardcode production credentials
- do not print secrets in logs, tests, screenshots, commits, or summaries

Important variables:

| Variable | Purpose |
|---|---|
| `BACKEND_URL` | Server-side backend URL |
| `NEXT_PUBLIC_BACKEND_URL` | Browser-visible backend URL |
| `NEXT_PUBLIC_ENABLE_DEBUG_UI` | Debug UI outside development |
| `NEXT_PUBLIC_SUPABASE_URL` | Frontend Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Frontend Supabase anon key |
| `SUPABASE_URL` | Optional backend Supabase URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend Supabase service-role key |
| `CORS_ALLOWED_ORIGINS` | Allowed backend CORS origins |
| `GEMINI_API_KEY` | Gemini integration |
| `GROQ_API_KEY` | Groq integration |

Raw API/debug panels must remain disabled in production unless explicitly enabled by configuration.

---

## 13. Safe File Editing

- read the complete relevant file before substantially rewriting it
- prefer targeted edits
- do not reconstruct large files from partial excerpts
- do not truncate controllers, configuration, translation files, lockfiles, or generated metadata
- preserve unrelated business logic
- avoid unrelated refactors

Take extra care with large logic-heavy files such as `backend/Controllers/ExternalJobsController.cs`.

---

## 14. Validation

Use the project's executable validation.

### Backend

```powershell
dotnet restore backend/Aplifyr.Api.csproj
dotnet build backend/Aplifyr.Api.csproj --configuration Release
```

### Frontend

```powershell
cd frontend
npm ci
npm run build
```

### Docker

When backend deployment or Docker configuration changes:

```powershell
docker build -f backend/Dockerfile .
```

Rules:

- run targeted tests/checks when available
- run the relevant production build before declaring substantial changes complete when practical
- fix validation failures caused by the change
- if validation cannot run, report that clearly
- never claim success based only on diff review

---

## 15. Completion Criteria

Before marking work complete:

1. review the final diff
2. confirm no unrelated files or behavior changed
3. run relevant validation
4. check for unintended deletions, truncation, debug code, generated noise, and secrets
5. verify required documentation is updated
6. verify relevant database/RLS/security implications when applicable
7. report what changed, what was validated, and anything still unverified

A feature is not complete if required documentation is stale or relevant validation has not been considered.