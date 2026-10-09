# Quick Start

## Scope

This guide covers local development for the runnable app inside `Aplifyr/`.

## Prerequisites

- Node.js 24.x (also required for the deployed frontend)
- npm 10 or newer
- .NET SDK 10.0, because the backend targets `net10.0`
- a Supabase project
- optional: Supabase CLI if you want to push migrations from the command line
- optional: separate Gemini letter/CV keys for approved AI processing

## Install Dependencies

From `Aplifyr/`:

```powershell
npm ci
```

The root `postinstall` script runs `npm ci --prefix frontend`: both dependency trees use their committed lockfiles. Use `npm ci --ignore-scripts` only when deliberately installing root tools without the frontend. Tailwind CSS and its PostCSS integration are pinned to 4.3.3; the existing JS theme/dark-mode configuration is loaded from the stylesheet. Tailwind 4 requires modern browsers (Safari 16.4+, Chrome 111+, Firefox 128+); older-browser support has not been verified.

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
- `GEMINI_API_KEY` for the intended Gemini letter flow; legacy Groq requires its own separately approved configuration
- `SUPABASE_SERVICE_ROLE_KEY` for owner-bound persistence and consent reservations

Notes:

- the backend starts without Supabase credentials; public JobTech search and matching remain available
- AI returns 503 without configured Auth/approved providers, 401 for missing/invalid authentication, and 503 for missing provider configuration
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

For a **new local/staging database**, apply all checked-in files in filename order:

1. `001_create_profiles_table.sql`
2. `002_add_location_preferences_to_profiles.sql`
3. `003_add_private_cv_columns.sql`
4. `004_create_profile_career_entries.sql`
5. `005_remove_cv_feature.sql`
6. `006_secure_profiles.sql`
7. `007_personal_data_limits.sql`
8. `008_privacy_consent_and_limits.sql`
9. `009_generated_cvs.sql`
10. `20260918164504_prepared_jobs_and_generated_document_retention.sql`
11. `20260921184722_add_profile_contact_details.sql`
12. `20260923122723_job_application_tracker.sql`
13. `20260926051754_security_hardening_and_document_revisions.sql`
14. `20261002075427_application_workspace.sql`

For an existing hosted installation, inspect the ledger and schema first. The current project's ledger differs from repository filenames; see [the runbook](gdpr-supabase-runbook.md). Do not blindly run `supabase db push` or replay creation migrations. Live changes need separate approval. Notices are seeded disabled; enabling a notice and each user's consent are separate operations.

Configure `PRIVACY_NOTICE_SV`, `PRIVACY_NOTICE_EN` and `PRIVACY_CONTACT_EMAIL` before public launch. Legacy file cleanup is described in the runbook; it is not part of routine setup.

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

Run from the repository root; dated validation evidence is in the runbook:

```powershell
Set-Location .\backend
dotnet build

Set-Location ..\frontend
npm run build
```

## Local Development Notes

### Optional browser check with synthetic data

After building the final frontend, start a separate local production server from `frontend/`:

```sh
node node_modules/next/dist/bin/next start -p 3100
```

In another terminal, also from `frontend/`, run:

```sh
node scripts/check-launch-ui.cjs
```

This optional check requires Playwright and a Chromium installation in the validation environment. Both are available in the managed review workspace; no new app dependency or browser installation is made by the script. Set `APLIFYR_UI_TEST_BROWSER` to an installed Chromium executable when needed, or use Playwright's installed browser. `APLIFYR_UI_TEST_BASE_URL` defaults to `http://localhost:3100` and accepts only localhost/127.0.0.1 URLs. Frontend public Supabase configuration must be present at build time and available through the environment or `.env.local` when running the check.

The browser uses a synthetic client session and intercepts private/API/provider requests with fixtures. Only public job pages and their local assets/route data reach the running frontend. No real Auth, AI, consent grant, database mutation or personal test data is used. Checks cover saved favorites across reload/removal, one confirmation when closing an unsaved inline letter, rejected navigation retaining the draft, note read retry/write failure, and saved-revision retry after simulated generation without another generation request. They run in both locales, mobile/desktop widths and light/dark themes, with keyboard navigation, width and nonce-CSP checks. This verifies UI behavior, not server authentication, actual AI generation or production persistence; those remain separate launch checks.

The ordinary frontend regression suite remains `npm test`; this browser script is not part of its automatic execution. Runtime/browser sandbox permissions may be necessary even when the target server is local.

### Service notes

- backend CORS is configuration-driven and can use `CORS_ALLOWED_ORIGINS`
- the dashboard loads personalized JobTech matches; JSON jobs are a separate demo endpoint
- the profile page depends on Supabase auth and the `profiles` table
- career entries persist through `/api/career` and require migration 004
- migration 006 represents the repository's profile RLS baseline; reconcile with existing live policies before deployment

## Job-specific CV configuration

Apply migration `009_generated_cvs.sql` after 008, then apply
`20260918164504_prepared_jobs_and_generated_document_retention.sql`. The latter enables Supabase Cron,
adds independent seven-day retention for generated CVs and cover letters, and adds prepared-job tracking. Verify the cleanup job after deployment.
Set backend-only `GEMINI_CV_API_KEY`. The reviewed active Gemini notice must match
`2026-10-documents-v3`, pinned in both frontend and backend source (no notice-version environment variable). Use a new notice version and obtain
fresh consent; do not reuse a notice that says generated output is transient. `GEMINI_API_KEY` remains for letters; CV has no key fallback.
Existing `GEMINI_MODEL`, `AI_ALLOWED_PROVIDERS=gemini` and backend Supabase credentials are required.
See [CV generation](cv-generation.md) for consent renewal, limits and staging checks.

## Frontend runtime on Vercel

Both root and frontend `package.json` pin `engines.node` to `24.x`, so local
development and Vercel use the same supported major version regardless of which
directory is configured as the project root. Vercel applies this override on the
next deployment; existing deployments do not change. See
[Vercel Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

The locked `sanitize-html` 2.17.7 requires Node >=22.12.0 and loads the ESM
`htmlparser2` 12 dependency via CommonJS `require()`. An incompatible runtime
can crash `/jobs/[id]` during module loading with `ERR_REQUIRE_ESM`, before any
job data is fetched. Keep HTML sanitization enabled and retain the bundling regression below for hosts that disable require-ESM.

Validation on Node 24: run `npm ci`, `node --test tests/security.test.cjs`, and
`npm run build` from `frontend/`. After deployment, confirm Node 24 in the build
logs, then open a job while signed in, both by direct URL and through the job
list. Verify that the page and its `/_next/data/.../jobs/<id>.json` request no
longer return 500. A successful build alone does not verify the live runtime.

### Job page serverless module compatibility

Node 24 alone is not sufficient if the host disables `require(ESM)`.
`next.config.js` now bundles `sanitize-html` and `htmlparser2` using
`transpilePackages`, preserving sanitization while removing their native CommonJS
to ESM loading boundary from the job route. The former build reproduces the
reported `ERR_REQUIRE_ESM` under `--no-experimental-require-module`; the bundled
build loads both job and CV route modules successfully under the same flag.

After `npm run build`, run:

```sh
node --no-experimental-require-module scripts/check-job-runtime.cjs
```

CI runs this regression after building. The script turns asynchronous module
rejections into a nonzero exit status; a successful `require()` return alone is
not sufficient. This verifies route module initialization, not authenticated live
job data fetching. Production logs still require authorized Vercel team access.

## Hardening migration and local verification

The ordered list above includes hardening and workspace migrations. For existing installations follow the runbook ledger mapping. The hosted project has v3 active; new installations still require separately approved notice activation and fresh user consent.

`TRUSTED_PROXY_ADDRESSES` is optional and accepts comma-separated verified immediate proxy IP addresses. Empty means forwarding headers are ignored; never populate it with arbitrary client values. Behind a shared proxy, pre-authentication and public IP limits can be shared by users until the actual proxy chain is verified. This setting requires separate hosting approval.

Run frontend `npm test` and `npm run build`, backend Release build and the SecurityTests, CvTests, WorkspaceTests and Matching.Tests executable projects. The security workflow audits root development tools and the complete frontend production/build tree at moderate severity, runs the .NET audit independently, and scans git history for secrets. CI actions are pinned to immutable commits and checkout does not persist credentials. Hosted execution on the final revision remains a separate gate.


## Isolated launch checks without hosted credentials

The local regression suites use synthetic users, stubbed Auth/provider transport and isolated PGlite instances. `deletion-restore.test.cjs` exercises the full application schema, deletes one synthetic account while preserving another, restores an older local snapshot and reapplies the deletion before checking owner isolation. It does not test hosted Auth tokens, provider deletion, binary storage, Supabase backups or pg_cron.

For browser verification, build with a fixture Auth origin and a local backend. Do not copy a production environment file into the test environment:

```sh
cd frontend
NEXT_PUBLIC_SUPABASE_URL=https://fixture.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=synthetic-publishable-key BACKEND_URL=http://127.0.0.1:5102 NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:5102 npm run build
NEXT_PUBLIC_SUPABASE_URL=https://fixture.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=synthetic-publishable-key node node_modules/next/dist/bin/next start -p 3102
```

Run both checks in another terminal with the same fixture Auth origin:

```sh
NEXT_PUBLIC_SUPABASE_URL=https://fixture.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=synthetic-publishable-key APLIFYR_UI_TEST_BASE_URL=http://localhost:3102 node scripts/check-launch-ui.cjs
NEXT_PUBLIC_SUPABASE_URL=https://fixture.supabase.co APLIFYR_UI_TEST_BASE_URL=http://localhost:3102 node scripts/check-auth-ui.cjs
```

`check-auth-ui.cjs` intercepts all external requests with synthetic fixtures. It checks localized recovery requests/cooldown, keyboard submission, sanitized provider errors, invalid PKCE input, page width and CSP across both locales, both viewport sizes and both themes. It does not send email or change a real password. The production server rejects malformed callback input before any Auth exchange; SDK transport tests cover valid exchange and cookies.

To reproduce the finite load smoke check, build the backend and run its DLL from an empty temporary working directory with `ASPNETCORE_ENVIRONMENT=Production`, blank `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `AI_ALLOWED_PROVIDERS`, `AI_DIAGNOSTICS_UNTIL`, `GEMINI_API_KEY`, `GEMINI_CV_API_KEY`, `GROQ_API_KEY` and `TRUSTED_PROXY_ADDRESSES`. Bind only `http://127.0.0.1:5102`. Running from the empty directory prevents DotNetEnv from loading a project `.env` file.

From the repository root:

```sh
node scripts/check-local-load.cjs
```

The load script accepts only a loopback HTTP origin, checks private access fails closed, then issues exactly 180 health requests with eight workers. It requires both successful responses and 429 admission rejection with `Retry-After`, and a local p95 below 1000 ms. Restart the isolated backend before each run to reset its fixed-window counters. This verifies health/admission behavior only; it does not establish Render capacity, upstream throughput or currency spending limits.

## Supabase Free: isolated real Auth and private workflow verification

These tools require Docker, a working Supabase CLI, Playwright and Chromium. They do not add an app dependency or link to a hosted project. This workspace inspected CLI `2.81.3` help; verify your installed CLI's commands with `--help`. The ordinary frontend tests require none of these external services.

From the repository root, create a new directory outside the checkout:

```sh
node scripts/prepare-launch-local.cjs /tmp/aplifyr-launch-local
umask 077
supabase --workdir /tmp/aplifyr-launch-local start --exclude realtime,storage-api,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor > /tmp/aplifyr-launch-local/start.log 2>&1
```

The config uses ports 55321/55322/55324, email confirmation, refresh-token rotation, a 12-character password minimum and loopback callback allowlists. Higher local mail limits allow synthetic checks; these are not recommendations to weaken hosted abuse limits. Mailpit captures mail; it sends nothing to a real inbox. The entire migration chain runs locally, including pg_cron. No live ledger is repaired or replayed.

The start log/status can contain local keys; keep it private and do not upload it. The managed workspace's policy currently blocks `public.ecr.aws`, so stack start and the full flow below have **not passed here**. Permit the registry through the environment configuration workflow before trying again; retain the proxy and TLS verification.

`with-local-stack.cjs` reads `supabase status -o json` internally, checks the unlinked local project/origin, and injects its keys without printing them. It replaces the frontend's hosted Auth configuration and removes inherited backend/AI credentials. Set `APLIFYR_SUPABASE_CLI` if the CLI executable is outside PATH, and `APLIFYR_LOCAL_STACK_DIR` if using another prepared directory. Do not reuse an existing production build: public Auth values are compiled into browser code.

Build and start from `frontend/`:

```sh
node ../scripts/with-local-stack.cjs npm run build
node ../scripts/with-local-stack.cjs node node_modules/next/dist/bin/next start --hostname 127.0.0.1 -p 3200
```

In another terminal, from the repository root:

```sh
APLIFYR_LOCAL_DELETION_JOURNAL=/tmp/aplifyr-launch-local.deletions.jsonl node scripts/with-local-stack.cjs node scripts/check-launch-flows.cjs
```

Playwright must be resolvable in the validation environment (`NODE_PATH` can select an already installed tool); set `APLIFYR_UI_TEST_BROWSER` for Chromium outside `/usr/bin/chromium`. The script accepts only loopback Auth/app/mail origins and refuses hosted test targets. It submits real signup/recovery forms, follows captured emails through the server PKCE callback, tests real sessions, direct A/B RLS, regular-user consent/withdrawal and reservation/quota RPCs, private CRUD/conflicts/export and same-browser A-to-B switching. It finally tests Auth deletion, owned-row cascades and old-token/refresh denial. Generated users, choices, quota fixtures and notice enablement are local only and cleaned up. After a failure, check that cleanup succeeded; destroy the disposable mail/database volumes and private journal when no longer needed, using `supabase stop --help` to inspect supported disposal flags.

The finite load segment runs ten complete profile/career/application/note/workspace/export workflows with two authenticated users/concurrent workers and prints workflow p50/p95. It is more representative of private database activity than health-only load, but excludes real JobTech, AI and hosted capacity. Its 15-second p95 guard is a local smoke threshold, not a production SLO. Do not present unexecuted scripts or this limited workload as a passed launch capacity test.

### Bounded checks against the existing hosted test account

Injected `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `APLIFYR_TEST_EMAIL` and `APLIFYR_TEST_PASSWORD` are required. The tool is pinned to the known Aplifyr URLs/project and uses no privileged key. It reads private APIs/export, verifies direct profile RLS, refreshes a real session and signs out only that test session. It never sends an email, generates AI, changes consent/profile, creates/deletes accounts or loads production. No token or personal response is printed.

```sh
NODE_USE_ENV_PROXY=1 node scripts/check-hosted-readiness.cjs
```

`NODE_USE_ENV_PROXY=1` uses this managed environment's inherited proxy on Node 24; omit it when your environment has no proxy. This command passed on 2026-10-08 against the PR #39 production deployment. It does not verify new registration, SMTP delivery, reset, second-account switching or complete deletion.

## Operator backup and quarantined restore

Supabase Free does not provide downloadable managed backups/PITR. Use an operator-controlled logical backup and prove restore. After confirming the exact source project, use the official [CLI backup/restore procedure](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore). Read `supabase db dump --help` first. Protect connection credentials through the CLI's authenticated/linked configuration and injected password; do not commit them, echo them or put passwords in command arguments. Keep the source connection, roles/schema/data exports and any auxiliary Storage inventory in a private workspace. Only verified legacy Storage objects require separate binary backup; SQL dumps do not copy those binaries. Include source project, Postgres/Auth versions, UTC timestamps, migration ledger and checksums in the bundle's manifest. Multiple logical dump commands need a quiescent/write-paused source or an explicitly verified consistency strategy; do not assume they share one transactional snapshot.

Pack the completed exports/manifest into a private file, then use the injected `APLIFYR_BACKUP_KEY` (exactly 64 hex characters representing a securely generated random 256-bit key):

```sh
node scripts/protect-backup.cjs encrypt /protected/backup-bundle.tar /protected/backup-bundle.aplbackup
node scripts/protect-backup.cjs verify /protected/backup-bundle.aplbackup
node scripts/protect-backup.cjs decrypt /protected/backup-bundle.aplbackup /protected/restore-bundle.tar
```

Verification authenticates every byte. Existing outputs are never overwritten; wrong keys/corruption fail without exposing a completed plaintext file. Store the encrypted copy and recoverable key separately, with a second failure-independent copy. Plaintext source/decrypted bundles remain sensitive and require cleanup. The commands do not schedule a backup or store a copy remotely. The operator must choose and enable a schedule/storage location and retention, then measure RPO/RTO in a restore drill.

For approved account deletion, persist a private source-project/UUID/timestamp intent **before** deleting through Supabase Auth's admin flow; use `appendIntent` from `scripts/lib/deletion-replay.cjs` in the reviewed operator procedure. This requires a verified account, current scope and explicit deletion authorization. Preserve the separate journal even if the deletion API fails, resolve pending failures and verify all systems. Never keep the only journal inside the backup being restored. Do not use the replay SQL to process normal live deletion requests.

On a quarantined restore with no public traffic, SMTP/AI activity or cron workers running, validate the restored schema/versions and generate the suppression SQL:

```sh
node scripts/replay-deletions.cjs /protected/source.deletions.jsonl trgloqvcyzfizeycbhjx > /protected/replay.sql
```

Review it, then execute with `psql -X --set ON_ERROR_STOP=1 --file /protected/replay.sql` against the explicitly configured **restore target**, using injected `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER` and `PGPASSWORD`/a protected passfile. The argument identifies the original source, not permission to connect to or delete production. Empty/malformed/cross-project journals fail. Replay reinstates triggers, deletes suppressed UUIDs, verifies account-FK cascades and removes restored sessions/refresh tokens. Relevant legacy Storage metadata blocks it pending Storage API cleanup. Re-run safely, verify account A remains deleted and B/data are preserved, test anonymous/A/B access and expiry/cron before reopening. Confirm external provider deletion separately. The actual hosted dump/restore, Storage API cleanup and provider confirmation have not been performed here.
