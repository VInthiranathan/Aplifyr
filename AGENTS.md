# Aplifyr — Agent Instructions

## Repo Overview

This workspace contains a two-service application:

- `backend/` — .NET 10 Web API (`Aplifyr.Api`) on `http://localhost:5000`
- `frontend/` — Next.js 16 Pages Router app on `http://localhost:3000`
- `supabase/` — Supabase config and migrations for frontend-auth/profile features

Treat the backend and frontend as independently runnable. Do not assume one can be replaced by the other.

## Git and Branch Safety

- Do not create new branches unless explicitly requested by the user.
- Do not switch branches unless explicitly requested.
- Never make changes directly to `main` unless the user explicitly asks for it.
- Work on the branch provided by the current task/environment.
- Do not amend, rewrite, or force-push existing commits unless explicitly requested.
- Before finishing, inspect the final diff and make sure unrelated files were not changed.

## Project Identity

- The project name is **Aplifyr**.
- Always refer to the application, solution, API, and product as Aplifyr.
- Do not reintroduce the previous project name in code, configuration, package metadata, namespaces, or UI.
- The word "examensarbete" may remain in thesis/report text when it refers to the academic thesis itself rather than the product name.

## Source of Truth

Before making significant changes, read the relevant project documentation:
- `documents/project-overview.md` — project architecture and purpose
- `documents/quick-start.md` — local setup and development workflow
- `documents/database-schema.md` — database structure when working with data/Supabase

`AGENTS.md` contains the high-level rules that must always be followed.
The documents above contain the detailed implementation guidance.

## Local Development

```powershell
# backend
cd backend
dotnet restore
dotnet run

# frontend
cd frontend
npm install
npm run dev
```

- The backend must keep working for local development even when Supabase credentials are missing.
- Frontend page/API code should use `frontend/lib/backendUrl.ts` to resolve backend URLs instead of reimplementing env fallback order inline.
- The backend resolves allowed CORS origins from `AllowedOrigins` or `CORS_ALLOWED_ORIGINS`, with localhost defaults when neither is set.

## Backend Rules

- Controllers live in `backend/Controllers/` and use `[ApiController]` with `api/[controller]` routes.
- `JobsController` and `UserController` currently read local JSON from `backend/Data/jobs.json` and `backend/Data/user.json`.
- `ExternalJobsController` proxies Arbetsförmedlingen / JobTech search APIs and contains filtering/mapping logic for regions, municipalities, occupations, and employment types.
- `CoverLettersController` calls external LLM providers and depends on `GEMINI_API_KEY` and/or `GROQ_API_KEY`.
- `UploadController` is a small upload/health surface.
- `Program.cs` may optionally initialize Supabase, but startup must not hard-fail when Supabase env vars are absent or invalid.
- Keep `Program.cs` CORS behavior configuration-driven. New deployment origins should be added via config/env, not hardcoded in source.
- Keep backend changes conservative: preserve existing routes and response shapes unless the task explicitly requires an API change.
- When request payload parsing degrades prompt quality or external-job filtering, prefer typed reads plus warning logs over silent `catch {}` blocks.

## Frontend Rules

- Pages Router only. Do not introduce App Router files or patterns.
- Shared API types belong in `frontend/types/api.ts`.
- Shared runtime env resolution belongs in `frontend/lib/backendUrl.ts`.
- Shared layout/navigation lives in `frontend/components/`.
- Use `lucide-react` for icons.
- Use `next-themes` for light/dark mode and preserve both theme variants for new UI.
- `frontend/proxy.ts` is active request middleware/proxy logic; do not replace it with older Next.js middleware conventions unless the framework requires it.

## Backend URL Usage

- Server-side page fetching should call `getServerBackendUrl()` from `frontend/lib/backendUrl.ts`.
- Client-side fetching should call `getPublicBackendUrl()` from `frontend/lib/backendUrl.ts`.
- `frontend/next.config.js` also uses these env vars for `/api/:path*` rewrites.
- Keep env fallback order aligned across all three surfaces:
  - page data fetching
  - client fetches
  - rewrite destination

## Debug UI

- Raw API response panels must be gated behind development mode or `NEXT_PUBLIC_ENABLE_DEBUG_UI=true`.
- Do not expose debug toggles on production-facing pages by default.

## Profile Page

- Profile images are currently initials-only. Do not ship image upload UI unless storage and profile persistence are implemented end to end.
- CV upload is implemented and persisted; profile image upload is not.

## Internationalisation

- `next-i18next` is configured in `frontend/next-i18next.config.js`.
- Supported locales are `en` and `sv`.
- Shared namespace is `common`.
- Locale files live in:
  - `frontend/public/locales/en/common.json`
  - `frontend/public/locales/sv/common.json`
- Every user-facing string must be backed by translation keys in both files.
- Do not hardcode visible English or Swedish text in JSX unless it is data returned by an external API.
- Group keys by feature/page (`home`, `jobs`, `favorites`, `jobDetail`, `support`, `auth`, `user`, etc.).
- If a page renders translated text, make sure it loads `serverSideTranslations(locale ?? 'en', ['common'])`.

## Styling Guidance

- Tailwind CSS utilities only; keep changes consistent with the existing styling approach.
- Write light-mode classes first, then `dark:` overrides.
- Reuse the shared style primitives in `frontend/styles/globals.css` before inventing page-local hover or button treatments.
- Preserve the existing palette and structure:
  - page background: `bg-gray-50 dark:bg-[#0d0d0d]`
  - card background: `bg-white dark:bg-[#1a1a1a]`
  - primary text: `text-gray-900 dark:text-white`
  - secondary text: `text-gray-500 dark:text-white/60`
  - borders: `border-gray-200 dark:border-white/5`

### Standard Hover

- The default interactive hover should match the sidebar pattern.
- Use `app-hover-standard` for controls that should behave like sidebar items.
- Use `app-card-base` + `app-card-hover` for hoverable cards and panels.
- Do not introduce blue-only hover states for standard app surfaces.

### Page Layout

- Page-level spacing should follow the in-app shell used by Support and All Jobs.
- Prefer shared page layout primitives from `frontend/styles/globals.css` for standard page structure:
  - `app-page-shell` for outer page padding and vertical rhythm
  - `app-page-header` for title/subtitle grouping
  - `app-page-title` for the main page heading
  - `app-page-subtitle` for the supporting line below the title
- Home and Favorites should align with the same page-shell spacing and header rhythm as the rest of the app instead of using custom `min-h-screen`, `p-8`, or oversized hero-style headings.

### Buttons

- Prefer the shared button system in `frontend/components/ui/button.tsx`.
- Standard app buttons should collapse into two main treatments only:
  - primary for the main action in a view or card
  - secondary for supporting and neutral actions
- Primary actions should use the app-styled primary treatment instead of generic blue or purple buttons.
- Secondary actions should use the app-styled neutral treatment instead of ad hoc gray, white-outline, or custom muted buttons.
- Shared options now are:
  - `Button` default or `variant="primary"` for primary actions
  - `Button variant="secondary"` for secondary actions
  - `Button variant="ghost"` for navbar-like icon or subtle utility actions
  - `Button variant="external"` only for outbound/external-link actions such as opening original job ads or external apply flows
  - `Button variant="link"` for inline text-only actions that should still use the shared API
  - `app-primary-button` and `app-secondary-button` when a plain element or link must match the same system
- Avoid reintroducing `bg-blue-600 hover:bg-blue-700`, `bg-purple-600 hover:bg-purple-700`, or page-local button palettes for standard actions.
- On job detail surfaces, prefer shared primary/secondary buttons and reserve the external variant for outbound links only.
- Do not override shared button shape with `rounded-none` on auth or other standard app surfaces.
- Auth pages, favorites actions, and sidebar/auth-shell utility controls should use the shared Button API for submit, toggle, close, and icon actions unless the control is a true navigation link.

### Job Lists

- Job listings on home, favorites, and all jobs should use the same layout shell.
- Prefer `frontend/components/JobListCard.tsx` for job-list rows/cards.
- The standard job-list surface is `app-job-list-card`.
- Keep these job-list pages visually aligned:
  - title/link treatment
  - meta row spacing
  - tag/chip styling
  - aside actions and match badge placement
  - footer spacing and dividers when present

## Safe Change Expectations

- Prefer root-cause fixes over view-only patches.
- Keep the backend runnable without optional secrets.
- Preserve the current JSON-backed local demo flow unless the task explicitly changes the data source.
- Remove dead code when it is clearly unused, but do not delete debugging surfaces that are still part of an active workflow without checking nearby usage.
- When changing filtering or external-job behavior, validate that pagination and filter query params still line up with `ExternalJobsController`.

## Validation

Use the narrowest relevant validation after edits:

```powershell
# frontend
cd frontend
npm run build

# backend
cd backend
dotnet run
```

- Prefer executable validation over diff-only review.
- If the backend build is blocked by a stale running process locking `bin/Debug`, stop that process and rerun validation rather than weakening the check.

## Environment Variables

| Variable | Purpose |
|---|---|
| `BACKEND_URL` | Server-side backend base URL |
| `NEXT_PUBLIC_BACKEND_URL` | Browser-visible backend base URL |
| `NEXT_PUBLIC_ENABLE_DEBUG_UI` | Opt in to debug response panels outside development |
| `NEXT_PUBLIC_SUPABASE_URL` | Frontend Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Frontend Supabase anon key |
| `SUPABASE_URL` | Optional backend Supabase URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional backend Supabase service-role key |
| `CORS_ALLOWED_ORIGINS` | Optional comma-separated frontend origins allowed by backend CORS |
| `GEMINI_API_KEY` | Cover-letter generation via Gemini |
| `GROQ_API_KEY` | Cover-letter generation via Groq |
