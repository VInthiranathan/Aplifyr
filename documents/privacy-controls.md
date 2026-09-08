# Privacy controls and safe profile updates

## Scope and configuration

`frontend/pages/privacy.tsx` is a public Pages Router route, including localized paths. `proxy.ts` permits it before authentication; `_app.tsx` renders it without the authenticated layout. AuthShell, Sidebar and SettingsDrawer provide links. No new provider, analytics, external images or server-side data store is introduced. Employer logo requests on home/jobs/detail have been removed in favor of local icons.

The page loads plain-text, reviewed notices from server-side `PRIVACY_NOTICE_SV` / `PRIVACY_NOTICE_EN`, and a syntactically checked contact address from `PRIVACY_CONTACT_EMAIL`. All are empty by default. Missing notice/contact are explicitly disclosed, not replaced with fabricated legal information. This does not itself disable signup: the operator must hold public launch until complete. The ordinary support form remains disabled; the rights contact opens the user's mail client rather than delivering mail itself.

## Export contract

`GET /api/account/export` uses cookie-aware `lib/serverSupabase.ts` with the anon key and `auth.getUser()`. Client-supplied owner IDs are ignored. Responses are `private, no-store`; POST and other methods return 405, unauthenticated calls 401, unavailable auth/database or incomplete reads 503 with generic errors.

Response: `{ exportedAt, account: { id, email, createdAt }, profile, career }`. Profile and career fields are explicitly selected. No full Auth object, tokens, hashes or admin metadata are exported. The browser adds `localFavorites` from the authenticated owner's storage key; unavailable/malformed storage becomes null, distinguishable from an empty list. The page downloads a JSON Blob, then revokes its object URL. It creates no export record on the server.

Purpose is user access to their stored facts; the controller must document the applicable legal basis and retention for the broader processing. This is not a complete Article 15 response or a guarantee of Article 20 applicability. Logs, provider copies, backups, other devices and required processing information need the manual rights process. Protect the downloaded file; it contains personal data.

## Pagination and concurrency

`readCareerEntries` is shared by export and career GET. It uses `id > cursor` with owner filtering and 100 rows/request, continuing until an empty page even when hosted max_rows is smaller. At most 100 requests and 8 Mi serialized characters are allowed; exceeding either fails explicitly, with no partial success response. Larger datasets need an administrator-assisted export. This bounds accumulated data, not the upstream server's per-response allocation. No total per-owner database quota is introduced.

Rows may change during pagination: this is not a transactionally consistent cross-table snapshot. Ask users to stop editing during download; a legally complete request may need an authorized consistent snapshot export.

General `PUT /api/profile` now requires `updatedAt` just like preference PATCH: null attempts creation; an ISO timestamp performs an owner- and updated_at-filtered UPDATE. A stale/missing row or duplicate create returns 409. Omitted profile fields remain untouched. The profile editor passes its last version and retains the draft when conflicts occur; its message asks the user to copy changes and reload. Older clients without versions now receive 400 and must be deployed with the updated frontend.

Migration 007 adds database field limits without replacing RLS or truncating existing records. Its NOT VALID rollout and validation are described in [the Swedish runbook](gdpr-supabase-runbook.md). Migration execution is not part of this code change.

## Verification

Run `npm test` and `npm run build` in `frontend/`. Tests cover owner filtering, unsupported/unauthenticated export, generic failures, secret omission, multiple short pages, repeated cursors, database-direct oversized writes, legacy preservation, translations and profile conflicts. These are local fixtures/PGlite tests, not proof of hosted policy settings.

In staging test signup/tokenrefresh, anonymous access, two-user direct Data API isolation, export download and contents, a two-tab profile conflict, both notices before login, a real privacy-contact email, and no external employer-image requests. Verify keyboard/mobile layout separately. Production access, complete deletion, contracts, legal bases, retention, incident handling and transfer assessments remain operator tasks listed in the runbook and audit.
