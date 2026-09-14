# Cover letter generation

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

Successful responses retain the array shape:

```json
[{"title":"Developer","coverLetter":"Generated draft","provider":"Gemini"}]
```

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
