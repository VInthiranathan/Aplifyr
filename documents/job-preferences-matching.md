# Job preferences and matching

The profile has four tabs: overview, work experience, education, and job preferences.
The overview keeps personal information, skills, and saved career history. Desired roles
and geographic preferences are edited together in the job preferences tab.

## Persistence

The existing `profiles.roles`, `location`, and `location_preferences` columns are reused.
No new migration is required. Existing preferences load into the new editor.

`PATCH /api/profile` accepts `roles`, `location`, `locationPreferences`, and `updatedAt`.
It validates and normalizes preferences, scopes writes to the authenticated user, and
compares `updatedAt` with the stored timestamp. A stale version returns 409 without
changing the profile. A null version creates a missing profile; a concurrent creation
also returns 409. Failed saves preserve the draft. Successful saves invalidate the
client match session. Tabs remain mounted after visiting so changing tabs keeps drafts.
Reloading/leaving the document with a draft triggers the browser's unsaved-change warning.

Existing profile editors send only the fields belonging to their section. `PUT /api/profile`
preserves omitted fields, so saving a biography does not overwrite job preferences.
PUT also requires `updatedAt` and uses an owner-/version-filtered update (or null-version insert), returning 409 for a conflict. See [privacy controls](privacy-controls.md).
Both PUT and PATCH require JSON, reject cross-origin browser mutations, and return no-store responses. PUT additionally validates field/list lengths; the profile endpoint body limit is 32 KiB. Migration 006 enforces ownership even for direct Data API requests.

## Match inputs and ranking

Capacity follow-up: cache is bounded to 32 entries/process, 1,000 jobs and 512 Ki serialized characters per pool. Exceeding a pool bound returns 422 before page mutation, stops polling and displays incomplete-result guidance. HTTP responses are bounded and concurrent requests limited. See [privacy controls](privacy-controls.md) for deployment implications.

- Each desired role has its own upstream query and pagination cursor. Results are combined
  and deduplicated by ad ID. If roles are empty, the profile title is the fallback.
- A role's individual words must match the headline or an occupation field. Existing
  English/Swedish role synonyms and common compound roles are supported. Specializations
  such as backend and C++ remain meaningful; `developer` alone no longer satisfies
  `backend developer`. This is deterministic text matching, not a semantic classifier.
- Explicit skills from the profile, work history, and education are deduplicated and
  used for the skill boost. Career titles do not become desired roles. Descriptions and
  other career prose are not sent to the matching endpoint. A failed career query falls
  back to the profile's explicit skills.
- Skill matching supports aliases, multiword skills and punctuation such as C++/C#.
  It checks the headline and up to 30,000 description characters using term boundaries.
- Location and skills are ranking preferences, not exclusion filters. Multiple geographic
  choices broaden the accepted area. Nearby uses the same region, not calculated distance.
  Remote uses the ad's explicit `remote` field. Remote-only does not reward local office jobs.
- No geographic preference is neutral (2 points). Local or explicitly remote matches get
  3 points; a supported wider area gets 2; outside the selected area gets 0. Any matched skill
  adds 1. Grades: A = 3–4, B = 1–2, C = 0. Scores are not probabilities or hiring predictions.
- Default ordering is grade, descending score, then ad ID. A nonzero seed intentionally
  shuffles within grade groups for the existing “load different jobs” action.

## Pagination, cache and errors

Matching lives in `ExternalJobsController.Matching.cs`; ordinary search/detail routes are
unchanged. Cache keys hash structured normalized inputs and include a strategy version.
Per-entry gates serialize initial loads and continuation, including response snapshots.
Each page is validated before its cursor advances. Empty pages end a search. Upstream
failures return 502 and leave the cursor available for retry. Zero matches and missing
roles return the same `matched`, `stats`, `thresholds`, and `profileUsed` structure as success.

The pool expires after 15 minutes. Continuation identifies an expired cache so the client
can recreate it. Background polling avoids overlapping requests, aborts on navigation,
and refreshes visible matches when jobs are added. Profile changes remount the match view;
client session keys include the authenticated profile identity. Errors offer an explicit retry.
`totalAfJobs` sums per-query upstream totals and can count overlapping ads; `totalMatched`
is the deduplicated pool size. Search coverage and remote metadata depend on JobTech.
Auth changes also clear the in-memory match session. Backend request limits are process-local (120 non-AI requests/minute), so polling can receive 429. Cache memory is not yet globally bounded; see the security audit for the remaining scaling risks.

## Verification

- `npm test` in `frontend`: includes preference validation, authenticated/versioned writes,
  draft/retry behavior, career skill inputs, profile changes, and background match refresh.
- `dotnet run --project tests/Aplifyr.Matching.Tests --configuration Release`: executable
  regression tests using deterministic upstream fixtures, including concurrency and retries.
- Frontend and backend production builds are required. Matching tests also run in CI.
- Live authenticated browser verification and live JobTech results require the configured
  application environment; fixture tests do not substitute for that integration check.
