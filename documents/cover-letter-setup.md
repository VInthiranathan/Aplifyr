# Cover letter generation and persistence

The job detail page calls `POST /api/coverletters/generate-all` on the backend.
The generate button opens the shared consent dialog; saving consent and choosing
continue are separate actions. Sign-in is verified server-side before generation.

## Configuration

The development deployment uses Gemini only:

- `AI_ALLOWED_PROVIDERS=gemini`
- `GEMINI_API_KEY`: server-only letter key
- `GEMINI_MODEL`: an available Gemini text model
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- an enabled Gemini notice and the user's current saved consent

CV additionally requires its separate `GEMINI_CV_API_KEY` and exact
`GEMINI_CV_NOTICE_VERSION`; see [CV generation](cv-generation.md).
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
