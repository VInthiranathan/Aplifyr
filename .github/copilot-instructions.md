# Copilot Instructions

## Repo Overview

This workspace contains a two-service application:

- `backend/` — .NET 10 Web API (`Examensarbete.Api`) on `http://localhost:5000`
- `frontend/` — Next.js 16 Pages Router app on `http://localhost:3000`
- `supabase/` — Supabase config and migrations for frontend-auth/profile features

Treat the backend and frontend as independently runnable. Do not assume one can be replaced by the other.

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
- The frontend uses `BACKEND_URL` or `NEXT_PUBLIC_BACKEND_URL` for backend calls. Default fallback is `http://localhost:5000`.
- Backend CORS currently allows `http://localhost:3000` and `http://127.0.0.1:3000`.

## Backend Rules

- Controllers live in `backend/Controllers/` and use `[ApiController]` with `api/[controller]` routes.
- `JobsController` and `UserController` currently read local JSON from `backend/Data/jobs.json` and `backend/Data/user.json`.
- `ExternalJobsController` proxies Arbetsförmedlingen / JobTech search APIs and contains filtering/mapping logic for regions, municipalities, occupations, and employment types.
- `CoverLettersController` calls external LLM providers and depends on `GEMINI_API_KEY` and/or `GROQ_API_KEY`.
- `UploadController` is a small upload/health surface.
- `Program.cs` may optionally initialize Supabase, but startup must not hard-fail when Supabase env vars are absent or invalid.
- Keep backend changes conservative: preserve existing routes and response shapes unless the task explicitly requires an API change.

## Frontend Rules

- Pages Router only. Do not introduce App Router files or patterns.
- Shared API types belong in `frontend/types/api.ts`.
- Shared layout/navigation lives in `frontend/components/`.
- Use `lucide-react` for icons.
- Use `next-themes` for light/dark mode and preserve both theme variants for new UI.
- `frontend/proxy.ts` is active request middleware/proxy logic; do not replace it with older Next.js middleware conventions unless the framework requires it.

## Backend URL Usage

- Server-side page fetching should prefer `BACKEND_URL` and can fall back to `NEXT_PUBLIC_BACKEND_URL`.
- Client-side fetching should use `NEXT_PUBLIC_BACKEND_URL`.
- `frontend/next.config.js` also uses these env vars for `/api/:path*` rewrites.
- When changing backend URLs, update all three surfaces together:
  - page data fetching
  - client fetches
  - rewrite destination

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
  - `app-primary-button` and `app-secondary-button` when a plain element or link must match the same system
- Avoid reintroducing `bg-blue-600 hover:bg-blue-700`, `bg-purple-600 hover:bg-purple-700`, or page-local button palettes for standard actions.
- On job detail surfaces, prefer shared primary/secondary buttons and reserve the external variant for outbound links only.

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
| `NEXT_PUBLIC_SUPABASE_URL` | Frontend Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Frontend Supabase anon key |
| `SUPABASE_URL` | Optional backend Supabase URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional backend Supabase service-role key |
| `GEMINI_API_KEY` | Cover-letter generation via Gemini |
| `GROQ_API_KEY` | Cover-letter generation via Groq |
