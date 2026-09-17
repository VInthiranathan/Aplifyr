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
supporting profile facts and pass a separate source-only factual review before returning the result.

Generation uses the shared consent UI (Gemini only), preserves the old preview while
regenerating and after failure, and returns the validated CV only to the requesting browser. The progress
message describes the combined operation; it does not pretend to stream individual
backend stages. The preview exists only in React memory. Refresh or navigation removes it; download it first.
A canceled request is not a durable background task.

## Document language

Both CV and cover-letter generation use `JobLanguage.Detect` on the advertisement
body. Whole Unicode word counts distinguish Swedish and English; a tied/empty body
uses the headline, with Swedish as the final fallback. For mixed advertisements the
language with more recognized words wins. This is a heuristic for the two supported
languages, not general multilingual detection. Profile language and UI locale are never inputs.

System instructions explicitly require generated prose in the selected language,
including faithful translation of profile facts. The CV factual review already accepts
faithful translations and still checks the original evidence. Official source titles,
qualifications, names, dates and explicit skill names remain unchanged to preserve identity
and credentials. Generated summaries and bullets use the advertisement language.

The backend assigns `content.language` (`en` or `sv`) after review; the model cannot
supply this field. Preview headings and PDF labels (including Present/Pågående) use
that language through shared translation resources, independently of the app language.
Legacy content without the field keeps the UI-language fallback. No extra provider
call, stored CV, consent change or environment variable is needed.

Regression tests cover Swedish/English advertisements, misleading substrings, opposing
profile/UI languages, prompt selection, translated statements surviving review, and
preview/export label selection. They test application behavior with synthetic AI responses;
model adherence still needs review of the generated document.

## Pipeline and source boundaries

`CvsController` verifies identity through `AiAuthenticationMiddleware`. Only the route
job ID is accepted: there are no client-supplied profiles, owners or job descriptions.
`CvStore` reads the owner's profile and career entries using the user's bearer token,
anon API key, explicit owner predicates and RLS. Career reads use keyset pagination,
including under a hosted row limit below 100; oversized legacy profiles fail explicitly.

Jobs are public JobTech resources, not user-owned database jobs. Generation fetches
`/ad/{id}` from the fixed JobTech host and verifies the exact response ID. It never
falls back to fuzzy search hits or arbitrary URLs. Deleted/unavailable jobs cannot be generated. The page fetches live job context, never a stored CV.

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
duplicate text, HTML/URLs and excess lengths. During generation, statements with unknown
source IDs, cross-entry references or new numeric tokens are omitted; unknown career
entries and skills not in the explicit source list are also omitted. Strict validation
remains available to callers. No unsupported content is changed into an approved claim.
Numbers in source text are not by themselves proof of an outcome; this is only a guard.
Titles, employers, qualifications and dates remain taken directly from source entries.
Validated output retains `sourceFactId` for compatibility and adds `sourceFactIds`;
the renderer displays the newly generated `text`, not the source wording.

`CvGeneration` then calls `CvGrounding` with the candidate statements and their cited
evidence only, without the ad or generation conversation. The separate Gemini request
must explicitly approve every retained claim. Once the complete review has been validated,
explicitly rejected statements are removed individually; approved statements and source-backed
entry headings/skills remain. The response sets `content.omittedUnsupportedContent` when
anything was removed, and the page displays a translated notice before the preview.
The PDF contains only retained content; the app notice is not part of the CV.
No extra Gemini requests or automatic retries are introduced. If nothing substantive
remains, generation fails rather than returning an empty CV. A malformed or missing
review is never treated as an approval. It checks changed meaning, negation, responsibility,
seniority, technologies, qualifications, achievements and academic/professional context.
Missing/duplicate decisions, quota, malformed JSON or provider failures prevent
returning a result; the current in-memory preview remains. Each call independently reserves through `AiPrivacyGate`
and uses `GEMINI_CV_API_KEY`. Reviews are bounded to 90,000 input characters. Normally
two paid attempts are used; if there is no generated prose, the review is skipped.
No automatic correction loop or retry is added.

**Limit:** semantic review is model-based, not a mathematical truth guarantee. It can
reject valid wording or miss an unsupported implication. Evidence IDs do not alone
prove entailment. Users still review the CV before applying; tests exercise the
application's rejection paths with synthetic reviewer decisions, not real-model accuracy.

The JSON job analysis contains keywords, responsibilities, mandatory/desirable
requirements and domain; these describe the job only. It is not rendered as applicant
qualifications. No saved analysis is read or reused.
A full-source hash is checked again before returning to reject profile edits during
most of the generation window. This is an optimistic check, not a cross-table SQL
snapshot: a concurrent edit after the final check is still possible.

## API contracts and failures

- `GET /api/cvs/{jobId}` -> `{ job: { id, title, company, location }, cv: GeneratedCv | null }`.
  `cv` is always null; the endpoint fetches live job context.
- `POST /api/cvs/{jobId}/generate` -> the same shape after validation, without a database write.
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

## No new CV persistence

Generation never reads or writes `generated_cvs` or calls `save_generated_cv`.
The response retains `job_id`, `content`, `job_context`, `metadata`, `created_at` and
`updated_at` for renderer compatibility; timestamps describe generation, not storage.
Responses remain private/no-store. The preview is not written to browser storage.
Profile reads, consent receipts and privacy quota reservations still use Supabase.
Google's processing/retention is separate from Aplifyr's no-CV-storage behavior.

Historical migration 009 and existing records are retained; no destructive cleanup
is applied as part of this change. Account export still includes any historical CV
records, and existing owner RLS and account-deletion cascade remain intact.
A separate, explicitly authorized cleanup would be required to remove historical data.

## PDF download

The download button creates a text-based A4 PDF in the browser using jsPDF and a
same-origin, embedded DejaVu Sans font (license in `public/fonts`). No CV content is
sent to a PDF service. Long text wraps and paginates in a single column. Users review
the preview and explicitly download; no automatic download or paid regeneration.

Filename: full profile name, company, and download sequence, for example
`Jonas_Axelsson_sigma_1.pdf`. Unicode letters/numbers and hyphens are preserved;
other runs become underscores, empty parts have fallbacks and lengths are bounded.
The sequence increases after download initiation within the current page; refreshing
resets it. The browser controls disk conflict handling and may modify the filename.
The app cannot inspect existing files or confirm that a user finished saving.
A failed PDF export preserves the preview for retry. Download assets use request
cancellation, so navigation/sign-out prevents a pending download from starting.

## Configuration and consent

Backend only:

- **`GEMINI_CV_API_KEY`**: CV-specific key, mandatory for CV. Never fallback.
- **`GEMINI_API_KEY`**: existing Gemini flows, including cover letters.
- **`GEMINI_MODEL`**: configured shared model supporting structured JSON responses.
- **`AI_ALLOWED_PROVIDERS`** must include `gemini`.
- **`GEMINI_CV_NOTICE_VERSION`**: exact active reviewed notice version covering CV
  generation and factual review, selected career descriptions/achievements/learning and temporary browser preview/download.
- existing `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

Do not reuse a letter-only notice as consent for broader CV disclosure. Configure a
new reviewed Gemini notice/version through the existing operational process, then
users grant that version via `AiConsent`. The privacy reservation independently
checks that the notice is active/current and the user has consented. No notices are
automatically enabled and no legal/processor terms are invented by this migration.

`GeminiProvider` is the shared transport for letters and CV. Feature-based credentials
are resolved only server-side and sent in `x-goog-api-key`; never persisted or returned.
Provider response bodies and personal source text are not logged by this code.

### Provider diagnostics

Provider failures log only the feature, controlled error code and upstream HTTP
status. Missing models (Google HTTP 404) are configuration failures. Credentials,
raw error bodies and generated/source text are never logged or returned.
`AI_DIAGNOSTICS_UNTIL` is an optional ISO UTC expiry within the next 30 minutes.
When explicitly set by an operator, the backend performs a synthetic letter and the complete synthetic CV generation
and factual-review pipeline on process startup (at most three provider calls).
It logs success/failure and a validated model identifier. It does not access user
data or grant consent. These diagnostic calls use provider quota outside user
reservations; restart within the window repeats them. It is disabled when absent,
expired or more than 30 minutes ahead. Clear it after troubleshooting.
This verifies provider connectivity, not an authenticated user's complete CV flow.

## Renderer

`CvContent` is versioned structured plain text shared by preview and PDF export.
The preview uses semantic headings/lists in a single column. No external images or
fonts are fetched. ATS parsing varies; no external score or certification is claimed.

## Verification

- `node --test frontend/tests/cv-ui.test.cjs frontend/tests/cv-database.test.cjs`
- `dotnet run --project tests/Aplifyr.CvTests --configuration Release`
- `npm test` / `npm run build` in frontend
- existing backend security/matching tests and Release build; CI includes CV tests

Local tests use synthetic fixtures and PGlite for grants, ownership, constraints,
historical regeneration and deletion cascade. Provider tests inject a fake HTTP transport and
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

## Generation consent dialog

Clicking generate or regenerate checks the current Gemini notice and saved consent
before making an AI request. Valid saved consent continues directly without reopening
the dialog. `AiGenerationConsent` opens only when consent is missing, withdrawn or
stale because the active notice version changed. The user can cancel; continuing is
disabled while loading, after a failed consent write, or when Gemini has no enabled notice.
A successful explicit checkbox update enables a separate continue button. Existing
current consent is stored server-side; it is never fabricated or granted automatically.
The shared dialog uses the existing focus trap, Escape dismissal and focus restoration.
The backend still verifies consent/version and reserves every provider call, including
CV factual review, so client UI is not an authorization boundary. Withdrawal remains
available from the desktop and mobile menu at `/privacy#ai-consent`. No Groq fallback
is enabled by this UI.

Live inspection on 2026-09-13 confirmed that `generated_cvs` exists, but all Gemini
notices are disabled. `2026-09-cv-v1` contains an explicitly incomplete draft.
Activation requires completing and reviewing the operator/contact/retention/provider
processing facts and matching backend `GEMINI_CV_NOTICE_VERSION`; this UI change
does not enable those incomplete notices or grant consent for any user.

### Local download verification — 2026-09-13

57 frontend/database tests and the frontend production build passed. PDF tests cover
full-name filenames, unsafe characters, Swedish glyphs and multi-page output. A
four-page synthetic export was rendered and its text extracted through the final
bullet. Production dependency audit reported zero vulnerabilities. The .NET SDK
is unavailable in this environment, so the changed backend requires CI Release
build/tests before deployment. No live AI requests or database mutations were made.

### Development activation update

The owner subsequently authorized development/test activation with unpaid Gemini
projects and empty contact email. `2026-09-cv-v1` is now enabled with updated
Swedish/English disclosures for transient output. No user consent was pre-granted.
See [privacy controls](privacy-controls.md) for activation scope and outstanding
backend environment/live-generation checks. CI run 34752948672 passed all jobs.

### CV schema compatibility — 2026-09-14

The full live synthetic pipeline exposed Google HTTP 400 `INVALID_ARGUMENT` with
its nested, bounded response schema, while the small JSON connectivity check passed.
The wire schema now specifies object properties, required fields and item types
without array-count constraints. The generation prompt and local validator retain
all existing counts, lengths, source ownership and factual-review checks. Output is
still rejected before return when any structural bound fails. Unsupported individual
items are now omitted as described above; they never reach the returned CV. This reduces
provider schema complexity without weakening application validation.

## CV design templates

The CV page offers Classic (monochrome dividers), Modern (dark cyan accent and more whitespace), and Compact (tighter spacing, at least 10 pt body text). Native radio cards with illustrative previews support keyboard selection before or after generation. Selection is page-local, resets for a new job, and is disabled during PDF export. Switching styles never triggers AI, changes facts or writes to storage.

`lib/cvTemplates.ts` shares allowlisted colors, sizes, margins and spacing across `CvPreview` and PDF export. The backend's `ats-basic` schema marker remains unchanged; design is an independent renderer option. Every design uses one column and the same semantic reading order, standard localized headings, selectable PDF text and the embedded Unicode font. No photos, skill bars, tables or document sidebars. Long content wraps and paginates without truncation. Preview is responsive continuous content; PDF uses A4 pagination, so screen line breaks need not match exactly. ATS compatibility varies by parser and is not certified.
