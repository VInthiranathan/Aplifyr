# Cover letter generation and persistence

The job detail page calls `POST /api/coverletters/generate-all` on the backend.
The generate button first requires sign-in and a saved profile with name plus background, skills or career history, then opens the shared consent dialog; saving consent and choosing
continue are separate actions. Sign-in is verified server-side before generation.

## Configuration

The development deployment uses Gemini only:

- `AI_ALLOWED_PROVIDERS=gemini`
- `GEMINI_API_KEY`: server-only letter key
- `GEMINI_MODEL`: an available Gemini text model
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- an enabled Gemini notice and the user's current saved consent

CV additionally requires its separate `GEMINI_CV_API_KEY`. Both features require
the source-pinned `2026-09-documents-v2` notice through `reserve_ai_call_v2`; see [CV generation](cv-generation.md).
An API key alone does not enable processing. Do not configure Groq as a workaround.
The legacy Groq path executes only when explicitly allowed, keyed and consented.

## Data and response

The request contains one to three job ads and allowlisted profile facts. The UI
includes up to three explicitly selected career entries (kind, title, employer,
dates and skills). Career narrative fields are excluded from letters. No uploads
are used. The backend separates source data from instructions and reserves every
provider call through the existing consent and quota checks.

Successful responses retain the array shape and add the seven-day deadline:

```json
[{"title":"Developer","coverLetter":"Generated draft","provider":"Gemini","expiresAt":"2026-09-25T12:00:00Z"}]
```

The required job ID is validated server-side. After a successful provider response, the backend
stores the latest letter through the service-role-only `save_generated_cover_letter` RPC. The
write also adds the job to `prepared_jobs`. Regeneration replaces the previous letter and restarts
its seven-day retention; it does not create history.

- `GET /api/coverletters/{jobId}` returns `{ letter: GeneratedCoverLetter | null }` for the verified owner.
- `DELETE /api/coverletters/{jobId}` deletes that owner's saved letter and its marker, while preserving a prepared job that still has an active CV.
- Responses are `private, no-store`; no owner ID from the client is trusted.

RLS hides an expired letter immediately, and the hourly cleanup job from migration
`20260918164504_prepared_jobs_and_generated_document_retention.sql` physically deletes it. Direct authenticated
writes are revoked, JSON/text sizes and per-owner capacity are bounded, and Auth account deletion
cascades to the saved letter. Account export includes active `generatedCoverLetters`.

Because the earlier consent text described generated output as temporary, activate a newly reviewed
notice version covering seven-day storage and deletion, then obtain fresh consent before deploying
this behavior. The migration does not activate a notice or grant consent.

For a single-job Gemini failure, the backend returns an HTTP error and a controlled
`error` code: 503 `configuration`, 429 `quota` or `consentOrQuota`, 502
`configuration` (upstream rejected settings), `provider` or `invalidOutput`, and
504 `timeout`. Authentication can return 401 before the controller. Multi-job
requests retain per-item error entries. Raw provider messages and keys are not
returned. The frontend displays translated categories rather than claiming that
every failure concerns consent; non-JSON responses receive a safe fallback.

## Verification and diagnosis

The security tests cover missing model and denied reservation as HTTP errors.
Frontend error tests cover both payload shapes, middleware statuses and rejection
of arbitrary error strings. Provider tests cover upstream errors and safe logging
labels. See the opt-in, expiring synthetic provider check in [CV generation](cv-generation.md).

Live diagnosis on 2026-09-14 returned Google HTTP 404 `NOT_FOUND` for
`gemini-2.5-flash` with both feature keys. This proves that model was unavailable
for those calls, not that user consent was rejected or that all Gemini API access
was disabled. The backend model setting was changed to `gemini-3.5-flash-lite`,
a stable model with structured output and free-tier availability according to
[Google's model page](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite)
and [pricing](https://ai.google.dev/gemini-api/docs/pricing).
Live checks must confirm the keys and full pipeline after each model change.

## Saved-letter action and PDF export

The job page uses one primary cover-letter action. While the saved-letter lookup is
pending it is disabled; when a letter exists it reads **Open cover letter** and opens
that letter without a consent dialog or AI request. Otherwise it generates through
the existing consent flow. The former separate open button is removed. Successful
deletion returns the action to generation. Generation errors are shown separately
and never become letter content; a failed regeneration preserves the previous letter.

The modal's **Export PDF** downloads a selectable-text A4 PDF of the currently
edited letter. It embeds the same local DejaVu Sans font as CV export and wraps and
paginates long text. Export loads only same-origin font assets, makes no AI call and
sends no letter content to a PDF service. Closing/unmounting cancels pending downloads;
an export failure preserves the text for retry. Letter edits remain local to the
modal (existing behavior); exporting does not persist them or extend seven-day storage.

## Hardening rollout

The September 26 migration creates the replacement notice disabled; review/activation and fresh user consent are required. The API does not silently accept the older transient-output notice. `CvStore.SaveLetter` and `DeleteLetter` derive the owner from the verified session. Letter profile/job facts are still bounded client-supplied inputs; they are not an authoritative profile lookup or proof that a statement is true.

## Application-service boundary

The controller delegates generation to `LetterApplicationService`. `LetterJobFacts` parses allowlisted ad fields, `LetterPrompt` contains the language/injection/grounding instructions, and `LetterProvider` performs provider calls with a separate reservation per attempt. HTTP status mapping and private-cache headers remain at the controller. Existing result arrays, expiry and optional-provider behavior are preserved; no fallback is enabled by this extraction. The frontend `useCoverLetter` hook owns retrieval, consent-dialog state, generation, cancellation and deletion; the job page composes its UI.

## Saved editing and paragraph proposals — 2026-10-02

The letter can be opened inline in its job workspace or through the existing modal. Manual edits now persist through authenticated `PATCH /api/coverletters/{jobId}` with `{content,updatedAt}`; owner, unexpired document and revision are independently required. A stale version returns `409 editConflict`, preserving the draft. Content/revision change, while original expiry, prepared flags and context remain unchanged. PDF still exports locally.

Each saved paragraph can request improve/shorter/technical/tailor AI wording. The canonical ad and bounded saved profile facts provide context; generated wording must pass an independent source-only review. No automatic overwrite: review, accept/discard, then save. Uses the letter Gemini key and two independently reserved attempts. Requires the new disabled-until-reviewed `2026-10-documents-v3` notice. See [Application workspace](application-workspace.md) for limits and rollout. This supersedes earlier local-only letter-edit descriptions.
