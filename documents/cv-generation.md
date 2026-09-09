# Job-specific ATS CV generation

## Scope and user flow

`frontend/pages/jobs/[id].tsx` links to `/jobs/[id]/cv`. The Pages Router CV page obtains
canonical JobTech context from `GET /api/cvs/{jobId}` with a bearer session. The stable
ID in the route survives refresh. Job title, company, municipality and a link to the
same job remain above the generator and preview. An existing session match grade is
shown when available; it is not fabricated or treated as authorization. No CV upload.

Gemini **rewrites** the professional summary, work-experience bullets and education
bullets to emphasize the facts relevant to the job. It can summarize, combine evidence
and improve wording without changing meaning. Employer names, titles, qualifications,
dates and the skills list remain deterministically sourced. Generated prose must cite
supporting profile facts and pass a separate source-only factual review before saving.

Generation uses the shared consent UI (Gemini only), preserves the old preview while
regenerating and after failure, and saves one latest CV per user/job. The progress
message describes the combined operation; it does not pretend to stream individual
backend stages. Refresh retrieves the saved result. A canceled request is not a durable
background task: after refreshing, inspect the saved result before retrying.

## Pipeline and source boundaries

`CvsController` verifies identity through `AiAuthenticationMiddleware`. Only the route
job ID is accepted: there are no client-supplied profiles, owners or job descriptions.
`CvStore` reads the owner's profile and career entries using the user's bearer token,
anon API key, explicit owner predicates and RLS. Career reads use keyset pagination,
including under a hosted row limit below 100; oversized legacy profiles fail explicitly.

Jobs are public JobTech resources, not user-owned database jobs. Generation fetches
`/ad/{id}` from the fixed JobTech host and verifies the exact response ID. It never
falls back to fuzzy search hits or arbitrary URLs. Deleted/unavailable jobs cannot be
regenerated; saved CVs retain their original job context and remain readable.

No persisted AI job analysis existed before this feature. Existing deterministic
`ScoreTechBoost` logic is reused via `ExternalJobsController.CvMatchedSkills`. It ranks
career entries by matched explicit skills, then recency. Up to 20 entries, 100 whole
source statements and 100 explicit skills are supplied. Description limit: 60,000
characters; combined prompt limit: 90,000 characters. No silent truncation of a job.
`sourceLimited` warns when source selection was limited. Names/location are added by
the renderer payload; they are not sent as dedicated fields to Gemini. Free-text
profile statements can still contain personal information.

`CvContent.Facts` assigns stable source field/statement references. Complete sentences
or lines of at most 800 characters become candidates; longer statements are omitted.
Negations inside a statement are retained. Splitting sentences does not guarantee
that all contextual nuance survives selection: users must review the result.

Gemini receives separate `systemInstruction`, external job data, verified profile facts
and `responseSchema`. No tools, URL fetching or generated HTML are enabled. Output
contains `professionalSummary: [{text, sourceFactIds}]`, explicit `skills`, and
`experience`/`education: [{sourceId, bullets: [{text, sourceFactIds}]}]`, plus job analysis.
Each statement is 1–600 characters and cites 1–5 facts. Summary statements may combine
sources; entry bullets may only cite their own entry. Facts carry work/education/profile
kind so academic work cannot be silently treated as professional employment.

Runtime validation rejects unknown/duplicate properties, invalid shapes, missing or
unknown source IDs, cross-entry references, duplicate text, invented skills-list values,
HTML/URLs, excess lengths and new numeric tokens absent from the cited evidence.
Numbers in source text are not by themselves proof of an outcome; this is only a guard.
Titles, employers, qualifications and dates remain taken directly from source entries.
Validated output retains `sourceFactId` for compatibility and adds `sourceFactIds`;
the renderer displays the newly generated `text`, not the source wording.

`CvGeneration` then calls `CvGrounding` with the candidate statements and their cited
evidence only, without the ad or generation conversation. The separate Gemini request
must explicitly approve every claim. It checks changed meaning, negation, responsibility,
seniority, technologies, qualifications, achievements and academic/professional context.
Missing/duplicate decisions, rejection, quota, malformed JSON or provider failures prevent
saving; the old CV remains. Each call independently reserves through `AiPrivacyGate`
and uses `GEMINI_CV_API_KEY`. Reviews are bounded to 90,000 input characters. Normally
two paid attempts are used; if there is no generated prose, the review is skipped.
No automatic correction loop or retry is added.

**Limit:** semantic review is model-based, not a mathematical truth guarantee. It can
reject valid wording or miss an unsupported implication. Evidence IDs do not alone
prove entailment. Users still review the CV before applying; tests exercise the
application's rejection paths with synthetic reviewer decisions, not real-model accuracy.

The JSON job analysis contains keywords, responsibilities, mandatory/desirable
requirements and domain; these describe the job only. It is not rendered as applicant
qualifications. Matching job hashes reuse the previously saved analysis in the prompt.
A full-source hash is checked again before saving to reject profile edits during
most of the generation window. This is an optimistic check, not a cross-table SQL
snapshot: a concurrent edit after the final check is still possible.

## API contracts and failures

- `GET /api/cvs/{jobId}` -> `{ job: { id, title, company, location }, cv: GeneratedCv | null }`.
  Saved job context is authoritative for an existing preview; otherwise fetch live job.
- `POST /api/cvs/{jobId}/generate` -> the same shape after validation and saving.
  No JSON payload or `user_id` is accepted/needed.
- Response headers are `private, no-store`.
- 400 invalid ID; 401 missing/invalid authentication; 403 CV notice consent missing;
  409 profile changed; 410 removed job; 422 empty/oversized source;
  429 provider quota or shared reservation denial; 502 provider/invalid model output;
  503 configuration/storage/unavailable service; 504 timeout.
- Missing/invalid CV credentials fail closed; no fallback key or provider.
- Per-call Gemini timeout 30 seconds, overall CV operation deadline 90 seconds.
  No automatic paid retry. User-triggered regeneration reserves fresh attempts for generation and review.
- Existing process rate limits include CV routes. `AiPrivacyGate` and migration 008
  share per-user/global reservations and budgets with letters. Distinct API keys
  do not guarantee distinct Google project quotas; configure Google usage budgets.

## Persistence and RLS

Migration `009_generated_cvs.sql` creates `public.generated_cvs`:

- composite primary key `(user_id, job_id)`; `user_id` cascades from `auth.users`
- bounded `content`, `job_context`, `metadata` JSONB; schema version 1
- created/updated timestamps; regeneration retains created_at
- authenticated owner-only SELECT/DELETE policies; no client INSERT/UPDATE grants
- anon/PUBLIC have no table access
- backend-only `save_generated_cv` RPC uses SECURITY INVOKER with a fixed search path;
  EXECUTE is granted only to service_role, never public/anon/authenticated
- the verified backend supplies the owner. A per-owner transaction advisory lock serializes the
  100-CV capacity check. Existing user/job is updated atomically; failures preserve it.

The migration is additive, transactional, uses bounded lock/statement timeouts and
changes no existing policies. Apply 008 first. It has not been applied in production.
The existing account export now includes paginated `generatedCvs`; migration 009 must
therefore be installed before deploying this frontend. No new retention policy is
invented. Account deletion cascades database records, but provider copies/backups
remain subject to the existing operational rights process. Individual owners may
DELETE their records through the Data API; no CV management/delete UI is added yet.

## Configuration and consent

Backend only:

- **`GEMINI_CV_API_KEY`**: CV-specific key, mandatory for CV. Never fallback.
- **`GEMINI_API_KEY`**: existing Gemini flows, including cover letters.
- **`GEMINI_MODEL`**: configured shared model supporting structured JSON responses.
- **`AI_ALLOWED_PROVIDERS`** must include `gemini`.
- **`GEMINI_CV_NOTICE_VERSION`**: exact active reviewed notice version covering CV
  generation and factual review, selected career descriptions/achievements/learning and CV storage.
- existing `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

Do not reuse a letter-only notice as consent for broader CV disclosure. Configure a
new reviewed Gemini notice/version through the existing operational process, then
users grant that version via `AiConsent`. The privacy reservation independently
checks that the notice is active/current and the user has consented. No notices are
automatically enabled and no legal/processor terms are invented by this migration.

`GeminiProvider` is the shared transport for letters and CV. Feature-based credentials
are resolved only server-side and sent in `x-goog-api-key`; never persisted or returned.
Provider response bodies and personal source text are not logged by this code.

## Renderer and future work

`CvContent` in shared frontend API types is versioned. `CvPreview` consumes deterministic
plain content using semantic headings/lists and a single-column paper preview. It is
responsive and lives in the existing light/dark application shell; the CV paper stays
white. No external image/font assets or multi-column ATS layout are added.

Future PDF exporters/templates should consume this validated content, not the model
response. A future editing API must retain source provenance and define what counts
as user-added facts. History requires extending persistence rather than treating the
current upsert as history. Section regeneration/language selection/export are not
implemented. Original profile language is retained. ATS parsing results vary by ATS;
there is no external ATS score or certification.

## Verification

- `node --test frontend/tests/cv-ui.test.cjs frontend/tests/cv-database.test.cjs`
- `dotnet run --project tests/Aplifyr.CvTests --configuration Release`
- `npm test` / `npm run build` in frontend
- existing backend security/matching tests and Release build; CI includes CV tests

Local tests use synthetic fixtures and PGlite for grants, ownership, constraints,
regeneration and deletion cascade. Provider tests inject a fake HTTP transport and
verify credentials/errors without real secrets or paid requests. UI tests remount
the page to verify URL recovery and preserve previews after failed regeneration.

Live Gemini, authenticated browser flows, hosted CV RLS and production migration
remain deployment checks. Test two users, missing/revoked credentials, active notice
renewal, quota exhaustion and mobile keyboard behavior in staging before merging.

### Verification in this implementation session

Frontend type checking and production build passed with the locally available locked
Next.js 16.3.4 dependencies. All 52 frontend/database tests passed. The CV database
test was rerun after correcting the per-owner lock and adding capacity/same-job
cross-owner fixtures. 34 CV assertions after the rewriting update, 18 authentication boundary cases, privacy
reservation checks and 16 matching regressions passed against the compiled backend.

Standard .NET MSBuild execution was blocked by this environment. Current backend
sources were instead compiled with the installed .NET 10 compiler/reference assemblies
and cached dependency binaries (one existing DotNetEnv assembly-version warning).
This does not replace CI restore/Release/Docker validation. No real Gemini calls or
browser visual checks were performed. Live read-only inspection confirmed existing
profile/career owner policies, absence of generated_cvs and absence of service_role
SELECT/UPDATE privileges on auth.users; the migration therefore uses an advisory
lock rather than requiring new Auth privileges. No live migration was applied.
