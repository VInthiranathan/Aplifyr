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
- `GET` without `jobId` returns at most 500 owner-visible `{ job_id, status }` records for list badges; notes and other application details are not included.
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
