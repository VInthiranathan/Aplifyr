# Job application tracking

## Purpose and scope

The application tracker lets a signed-in user record a submitted job application and maintain its current stage, application date, next action, follow-up date and private notes. It does not infer that an external application was submitted; the user explicitly chooses **Mark as applied** on the job detail page.

## User flow

- `/jobs/[id]` checks whether the current job already has an application record.
- **Mark as applied** creates one idempotently with status `applied` and the user's local calendar date.
- `/applications` lists the user's records and defaults to active processes.
- `/jobs` and the home page's **Matched jobs** tab fetch the signed-in user's application IDs and statuses and mark matching job cards as **Applied** or **Applied · current status**. Job discovery remains usable if this supplementary request fails. Statuses refresh when the window regains focus or a cached page is restored after back navigation.
- Filters cover active, all and each individual status: applied, screening, interview, offer, accepted, rejected and withdrawn.
- A record can be updated or permanently deleted. Optimistic concurrency prevents an older browser tab from overwriting a newer change.
- On mobile, Applications is a primary bottom-navigation destination. Favorites remains available in the settings drawer; both remain present in the desktop sidebar.

## Routes and contracts

`frontend/pages/api/applications.ts` accepts cookie-authenticated requests only and returns `private, no-store` responses.

- `GET ?jobId=...` returns `{ application }` or `null`.
- `GET` without `jobId` returns all owner-visible `{ job_id, status }` records within explicit safety bounds using shared keyset pagination; notes and other application details are not included. Errors do not return partial success.
- `POST` accepts `jobId`, `jobContext` and `appliedAt`; repeat calls preserve the existing record.
- `PUT` accepts all editable fields plus `updatedAt` and returns `409` for a stale revision.
- `DELETE` requires the same owner/job/revision identity and returns `409` for a stale revision.

Mutation requests must be same-site JSON. Job IDs, status values, real ISO calendar dates, context fields, next steps and notes are bounded in the API and database.

## Persistence, privacy and permissions

Migration `20260923122723_job_application_tracker.sql` creates `public.job_applications`, keyed by `(user_id, job_id)`. RLS is enabled before client use; separate SELECT, INSERT, UPDATE and DELETE policies require `auth.uid() = user_id`. UPDATE includes both `USING` and `WITH CHECK`. Account deletion cascades to all application records.

Application records do not use the generated-document seven-day expiry: they are user-managed history and remain until the user deletes them or the account is deleted. The controller must document the actual purpose, legal basis and retention policy in the public privacy notice before launch. This implementation does not claim or invent those decisions. The authenticated account export includes all stored application fields.

## Verification

- Run `npm test` in `frontend/` for schema/RLS, UI contract, localization and regression checks.
- Run `npm run build` in `frontend/` for the production TypeScript and Next.js build.
- Apply the migration in a non-production Supabase project and confirm owner isolation, update/delete conflicts and account cascade before production rollout.

## Quota and complete reads

Migration `20260926051754_security_hardening_and_document_revisions.sql` enforces 1,000 applications per owner through a private counter and transactional trigger, including direct Data API inserts. Conflicting idempotent inserts do not consume capacity. Legacy excess rows are preserved for editing/deletion; changing owner or job identity is prohibited. SQLSTATE 54000 maps to API 409 `capacity`, with Swedish/English guidance to export/delete older records.

`lib/readApplications.ts` is shared by SSR, export and status lookup. It requests 100 rows ordered by immutable job ID and continues until an empty page, including when the host returns fewer than requested. Bounds are 1,001 requests, 10,000 rows and 16 MiB UTF-8, with explicit failure on incomplete reads. The UI sorts full records by last update after reading. Results are not a transactional snapshot across concurrent changes. Regression tests exercise more than 500 rows with short hosted pages, direct-write quotas, legacy rows and deletion cascades.

Job-detail loading and marking now live in `features/jobs/useJobApplication.ts`; the route keeps the action UI. Matched-list application badges live in `features/home/MatchedJobs.tsx` and continue using the same `useApplicationStatuses` hook. This extraction changes neither database ownership nor retention.
