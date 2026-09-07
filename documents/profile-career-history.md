# Profile career history

## Purpose

The profile has Overview, Work experience and Education tabs. The overview displays
all saved entries and details in two timeline cards, with ongoing entries first.
The cards show accurate loading, error/retry and empty states. Manage buttons lead to
the editors. One shared data provider keeps saves and deletions synchronized across
the overview and both tabs without discarding editor drafts.

## Implemented fields and behavior

| Information | Work experience | Education |
| --- | --- | --- |
| Title | Job title | Programme or course |
| Organization | Employer or organization | School or training provider |
| Qualification | Not shown | Degree, level or certification |
| Location | Optional | Optional |
| Dates | Start/end month or ongoing | Start/end month or ongoing |
| Description | Tasks and responsibilities | Content and relevant courses |
| Achievements | Results and contributions | Projects, thesis and results |
| Learning | Knowledge and ways of working | Methods and practical skills |
| Skills | Up to 50 named skills/tools | Up to 50 named skills/tools |
| Strengths | Personal qualities with examples | Personal qualities with examples |

Title, organization and dates are required. Narrative fields allow 5,000 characters each.
Start dates cannot be in the future; end dates cannot precede start dates. Finished work
cannot have a future end date. Ongoing entries have no end month. Records sort ongoing
first, then newest start month. Empty states do not pretend a failed load is an empty list.

The editor supports additions, edits, confirmed removal, saving/error feedback and retry.
Visited panels remain mounted so switching tabs preserves drafts. Closing an editor asks
before discarding; full-page navigation/refresh uses the browser's beforeunload warning.
Both English and Swedish, light and dark themes, and responsive form columns are supported.

## Storage and API

`public.profile_career_entries` stores one record per experience or education, with `kind`
as the discriminator. It references `auth.users` directly, so a missing legacy `profiles`
row does not prevent career entry creation. Account deletion cascades to these entries.
Existing biography, skills and preferences are not overwritten.

`/api/career` uses the existing cookie-based Supabase authentication and the public anon
key with the user's session. No service-role key is used. Ownership is assigned from
`auth.getUser()`, never accepted from the request body, and also enforced by database RLS.

- GET: returns `{ entries }` for the signed-in user, including both kinds.
- POST: validates a `CareerEntryInput` and returns `{ entry }`.
- PUT: requires the full input plus `id` and the last `updated_at` value.
- DELETE: requires `id` and the last `updated_at` value.

PUT/DELETE filter by owner, ID and version; an unmatched/stale entry returns 409. Concurrent
browser edits therefore do not silently overwrite each other. Mutations require JSON and
reject cross-site browser requests; responses are private and non-cacheable. Database
details are not sent in errors. The page consumes this dedicated API; legacy profile and
cover-letter response shapes are unchanged.

## Rollout

1. Apply `supabase/migrations/004_create_profile_career_entries.sql` to the project's Supabase
   database after the existing migrations. It is transactional and uses the existing
   `profiles_updated_at()` trigger function from migration 001.
2. Deploy the frontend from this branch with the existing Supabase URL and anon key.
3. Sign in and test create/edit/delete for a job and an education, refresh persistence,
   tab switching, and access from a second account.

The migration can be applied through the project's established SQL migration workflow
or as the complete script in the Supabase SQL editor. It must be applied once. This
change does not execute remote migrations automatically.

## Verification

Run `npm test` and `npm run build` from `frontend/`. Tests cover validation,
API ownership/version checks, translations, editor behavior, shared overview state,
and local PostgreSQL constraints and storage retirement. A deployed Supabase smoke
test is still required for the production environment.
