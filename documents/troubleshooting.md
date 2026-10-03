# Troubleshooting

## Frontend cannot reach the backend

Confirm the backend is running locally on `http://localhost:5000`. Set both `BACKEND_URL` and `NEXT_PUBLIC_BACKEND_URL` to the correct backend; use the shared URL helpers. Check configured CORS origins. For hosted incidents, inspect the actual frontend/backend revisions before assuming a merged change has deployed.

## Authentication or Supabase unavailable

Frontend requires `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Private backend operations require `SUPABASE_URL` and `SUPABASE_ANON_KEY`; privileged document saves and AI reservations additionally require server-only `SUPABASE_SERVICE_ROLE_KEY`. Never put service credentials in public variables. Check login/token refresh and private-route status without copying tokens into logs.

## AI generation or rewriting fails

Check the controlled error category, not only the API key:

- 401: missing/invalid session.
- 403 `consent`, or 429 `consentOrQuota`: verify active code-pinned notice `2026-10-documents-v3`, the user's own current consent and quotas. Do not grant consent administratively.
- 422 `profileEmpty`: save name plus background, skills or career history.
- 409: profile/document changed; retain the draft and reload the current revision.
- 503 `configuration`: verify `AI_ALLOWED_PROVIDERS=gemini`, available `GEMINI_MODEL`, the feature key and Supabase server configuration.
- 502/504: inspect sanitized provider/configuration/timeout categories. Do not log provider bodies or personal text.

Letters use `GEMINI_API_KEY`; CV uses `GEMINI_CV_API_KEY` without key fallback. Each generation/review attempt reserves independently. Do not enable Groq or weaken validation to bypass a failure. The active notice does not prove a successful hosted provider call. See [letter setup](cover-letter-setup.md), [CV generation](cv-generation.md) and [the runbook](gdpr-supabase-runbook.md).

## Missing advertisement or failed document list

A removed ad prevents new generation and rewriting. Owner notes and saved letters remain accessible on a valid job route; an unexpired saved CV is read using its saved context. Failed prepared-document reads show an error and retry rather than an empty queue or zero ready count. Check the failed API response separately from JobTech availability and filters.

## Profile or document changes do not persist

Verify authentication, schema and the mutation response. A stale revision returns 409; keep the draft and reload rather than removing concurrency checks. Letters and CVs require explicit Save changes; PDF export alone does not save. Manual saves preserve original expiry. Profile images are initials-only and file uploads are disabled.

## Job route fails with ERR_REQUIRE_ESM

Use the pinned Node 24 runtime and retain `transpilePackages` for the sanitizer dependencies. From `frontend/`, run `npm run build` followed by `node --no-experimental-require-module scripts/check-job-runtime.cjs`. Keep HTML sanitization enabled. A successful module check does not verify live authenticated data fetching.

## Validation

See [quick start](quick-start.md) for commands and the runbook for dated evidence. No fresh application test run is implied by a documentation-only correction.
