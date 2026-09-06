# Profile career history

## Purpose and research

Job-specific CV generation needs structured source facts rather than only an uploaded
PDF or a general biography. The profile now has Overview, Work experience and Education
tabs. Jobs, internships, freelance and volunteer roles can all be recorded. Education
also accommodates courses and certifications.

Research reviewed on 2026-09-05:

- [CareerOneStop: work experience](https://www.careeronestop.org/JobSearch/Resumes/ResumeGuide/work-experience.aspx)
  recommends recording jobs, responsibilities and accomplishments. This informed separate
  fields for tasks and results, with prompts to describe personal contributions.
- [CareerOneStop: resumes](https://www.careeronestop.org/JobSearch/Resumes/resumes.aspx?frd=true)
  recommends relevant keyword qualifications that the candidate actually possesses.
  Skills are therefore stored alongside their source experience; personal strengths
  have a separate field asking for evidence rather than an unsupported adjective list.
- [Greenhouse: unsuccessful resume parsing](https://support.greenhouse.io/hc/en-us/articles/200989175-Unsuccessful-resume-parse)
  documents parsing problems with columns, graphics, unclear sections and contact details
  in headers or text boxes. Its parser also has a 2.5 MB limit, distinct from upload limits.
  These are constraints for a future export, not a reason to restrict the profile's UI.
- [WAI-ARIA tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)
  informed tab roles, associated panels, selected state and arrow/Home/End navigation.
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
  informed owner-only policies using authenticated user IDs.

No universal ATS score or guaranteed acceptance is claimed. The future generator should
select and rephrase relevant verified facts, never invent skills, degrees or numerical
results. Use normal section headings, one-column text-based exports, and a user review
before download. Keep generated job-specific CVs separate from these source facts.

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
Existing biography, skills, preferences and uploaded CV data are not overwritten.

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

Run in `frontend/`:

```sh
npm ci
npm test
npm run build
```

The 14 automated tests cover validation, API authentication/ownership/version checks,
translation parity, component create/edit/delete, failure recovery, and migration/RLS
behavior in local PostgreSQL via PGlite. They do not replace a smoke test against the
deployed Supabase instance. The production build passes. Cloud Browser could not reach
the local preview, so no visual browser verification is claimed.

## Boundary for the next CV feature

This implements the requested profile foundation. It does not add a CV generator or
change cover-letter generation. A later job-specific generator should read these entries
server-side for the authenticated user and preserve entry IDs for traceability. It will
also need contact details, languages and relevant links, job-ad input, an editable preview,
and text-based PDF/DOCX export. Missing details should be requested, never inferred as fact.
