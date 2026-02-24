# Copilot Instructions

## Architecture Overview

Full-stack job-tracking application with two independently runnable services:

- **`backend/`** — .NET 10 minimal Web API (`Examensarbete.Api`). Runs on `http://localhost:5000`.
- **`frontend/`** — Next.js 16 (Pages Router), TypeScript, Tailwind CSS v3. Runs on `http://localhost:3000`.
- **`supabase/`** — Supabase config. The backend connects directly to Supabase PostgreSQL via a connection string. The frontend does not connect to Supabase directly; all data access goes through the backend API.

## Dev Workflows

```powershell
# Backend
cd backend; dotnet restore; dotnet run

# Frontend (separate terminal)
cd frontend; npm install; npm run dev
```

Both must run simultaneously. The frontend dev server is fixed to port 3000; the backend to port 5000 (CORS is hardcoded for `http://localhost:3000` in `Program.cs`).

## Backend Patterns

- All controllers live in `Controllers/`, use `[ApiController]` + `[Route("api/[controller]")]`.
- Data is stored in **Supabase (PostgreSQL)**. The backend connects via `Npgsql` + `Dapper`. Connection string is in `appsettings.json` under `ConnectionStrings.Supabase`.
- `DefaultTypeMap.MatchNamesWithUnderscores = true` in `Program.cs` maps `snake_case` columns to C# `PascalCase` properties automatically.
- C# model classes are in `backend/Models/` (`Job`, `User`, `Progression`). PostgreSQL arrays (`text[]`) map directly to `string[]`.
- `ExternalJobsController` is a thin proxy to the Arbetsförmedlingen public API (`jobsearch.api.jobtechdev.se/search`); it forwards query params and streams the response as raw JSON.
- Run `backend/supabase-schema.sql` in the Supabase SQL Editor to create tables and seed initial data.
- Adding a new data entity: create a model in `Models/`, add a migration to `supabase-schema.sql`, and add a new controller.

## Frontend Patterns

- **Pages Router only** — do not use App Router conventions (`app/`, `layout.tsx`, server components).
- **Server-side data fetching** uses `getServerSideProps` with env var `BACKEND_URL` (not prefixed with `NEXT_PUBLIC_`). See `pages/index.tsx` and `pages/user/index.tsx`.
- **Client-side fetching** uses `NEXT_PUBLIC_BACKEND_URL`. See `pages/jobs/index.tsx`.
- All shared TypeScript types are in `frontend/types/api.ts` (`Job`, `User`, `ExternalJob`, `AFSearchResult`, etc.). Add new API shapes here.
- Icons are from `lucide-react` — do not add a second icon library.
- The sidebar nav items are defined in `components/Sidebar.tsx` — update the `navItems` array when adding pages.

## Styling

- Tailwind v3 utility classes only; no CSS modules.
- `darkMode: 'class'` is configured in `tailwind.config.js`. Theme switching is handled by `next-themes` (`ThemeProvider` in `_app.tsx`).
- **Every new component must support both dark and light mode.** Always pair dark-mode classes with their light-mode equivalents.

### Dark / Light palette

| Role | Dark | Light |
|---|---|---|
| Page background | `bg-[#0d0d0d]` | `bg-gray-50` |
| Card background | `bg-[#1a1a1a]` | `bg-white` |
| Primary text | `text-white` | `text-gray-900` |
| Secondary text | `text-white/60` | `text-gray-500` |
| Border | `border-white/5` | `border-gray-200` |
| Border hover | `border-white/10` | `border-gray-300` |
| Input background | `bg-white/5` | `bg-white` |
| Input border | `border-white/10` | `border-gray-300` |

- Card pattern: `rounded-2xl p-5 bg-[#1a1a1a] dark:bg-[#1a1a1a] border border-white/5 dark:border-white/5 hover:border-white/10 dark:hover:border-white/10 bg-white light:bg-white border-gray-200 transition-colors`.
- Shorthand: write the light class first, then override with `dark:` variant.
  ```tsx
  // Example
  <div className="bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/5 text-gray-900 dark:text-white">
  ```

## Internationalisation (i18n)

- `next-i18next` is configured in `next-i18next.config.js`. Locales: `en` (default) and `sv`.
- Translation files: `public/locales/en/common.json` and `public/locales/sv/common.json`. Namespace is `common`.
- **Every new user-facing string must have a key in both locale files.** Never hardcode display text in JSX.
- Add new keys under a logical namespace group matching the feature/page (e.g., `"jobs"`, `"user"`, `"home"`).

### i18n patterns

**Client component:**
```tsx
import { useTranslation } from 'next-i18next';

export default function MyComponent() {
  const { t } = useTranslation('common');
  return <h1>{t('myPage.title')}</h1>;
}
```

**Page with `getServerSideProps`:**
```tsx
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import type { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async ({ locale, ...ctx }) => {
  return {
    props: {
      ...(await serverSideTranslations(locale ?? 'en', ['common'])),
      // other props
    },
  };
};
```

- When adding a new page, always include `serverSideTranslations` in `getServerSideProps`.
- Keep key names in English, camelCase, nested under a page/feature group.
  ```json
  // en/common.json
  "myFeature": { "title": "My Feature", "description": "Does something" }

  // sv/common.json
  "myFeature": { "title": "Min funktion", "description": "Gör något" }
  ```

## Environment Variables

| Variable | Used in | Purpose |
|---|---|---|
| `BACKEND_URL` | `getServerSideProps` | Backend base URL (server-side only) |
| `NEXT_PUBLIC_BACKEND_URL` | client fetch | Backend base URL (browser) |
| `NEXT_PUBLIC_SUPABASE_URL` | `lib/supabaseClient.ts` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `lib/supabaseClient.ts` | Supabase anon key |
| `ConnectionStrings__Supabase` | `appsettings.json` / env | Npgsql connection string for the backend |
