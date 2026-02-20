# Copilot Instructions

## Architecture Overview

Full-stack job-tracking application with two independently runnable services:

- **`backend/`** — .NET 10 minimal Web API (`Examensarbete.Api`). Runs on `http://localhost:5000`.
- **`frontend/`** — Next.js 16 (Pages Router), TypeScript, Tailwind CSS v3. Runs on `http://localhost:3000`.
- **`supabase/`** — Supabase config. The backend connects directly to Supabase PostgreSQL via a connection string. The frontend Supabase client (`frontend/lib/supabaseClient.ts`) is available for future client-side DB access.

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

- Tailwind v3 utility classes only; no CSS modules. Dark-theme palette: page bg `#0d0d0d`, card bg `#1a1a1a`, borders `border-white/5` or `border-white/10`.
- Cards use `rounded-2xl p-5 border border-white/5 hover:border-white/10 transition-colors`.

## Environment Variables

| Variable | Used in | Purpose |
|---|---|---|
| `BACKEND_URL` | `getServerSideProps` | Backend base URL (server-side only) |
| `NEXT_PUBLIC_BACKEND_URL` | client fetch | Backend base URL (browser) |
| `NEXT_PUBLIC_SUPABASE_URL` | `lib/supabaseClient.ts` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `lib/supabaseClient.ts` | Supabase anon key |
| `ConnectionStrings__Supabase` | `appsettings.json` / env | Npgsql connection string for the backend |
