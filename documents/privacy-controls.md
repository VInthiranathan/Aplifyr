# Privacy controls and safe profile updates

## Consent and enforcement — migration 008

`AiConsent` on job detail and `/privacy` provides separate, initially unchecked choices for Gemini and Groq. Users can withdraw even when the provider is disabled. Search/profile access do not require AI consent. Failed writes do not optimistically grant consent. No blanket account, analytics or marketing consent is added. [IMY consent requirements](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/rattslig-grund/samtycke/).

`GET/PUT /api/account/consent` uses verified cookie identity, the anon key, no-store and safe JSON mutations. PUT validates provider/version/boolean and calls `set_ai_consent`; SQL assigns the owner. Direct table mutations are revoked. `ai_consents` records current choices; `ai_consent_receipts` retains the last grant/withdrawal per reviewed provider/version, not every toggle. Accepted notice texts are immutable. New processing requires a new reviewed version and new consent. Receipts/texts are included in export via `export_ai_consents()` and cascade on account deletion. The controller must define their retention while the account exists.

`ai_privacy_notices` starts disabled with empty texts. Populate both languages and enable each provider only after verifying purpose, recipients, contracts, retention and international transfers. Configure the main privacy notice/contact as well. These operational facts are not invented by the migration.

Backend `AiPrivacyGate` reserves before EACH external attempt, including fallback, through service-role-only `reserve_ai_call`. The verified Auth subject is passed server-side. SQL atomically checks user existence, active notice/current consent, quotas and leases. Defaults: 20 attempts/user/day, 1,000 globally/day, one simultaneous attempt/user and four globally. Reserved failures count; these are call ceilings, not currency budgets. Withdrawal prevents subsequent reservations but cannot recall already authorized/in-flight requests. Leases expire at 60 seconds, provider calls timeout at 30 seconds, and release is scoped by ticket. Missing configuration, denied reservation and DB errors fail closed. `AI_ALLOWED_PROVIDERS`, provider keys and the backend-only `SUPABASE_SERVICE_ROLE_KEY` are independently required.

Users can explicitly choose up to three career entries. Only kind/title/organization/dates/skills are sent; backend strips other career fields. JSON source data is separated from Gemini `systemInstruction` / Groq system instructions prohibiting source-instruction execution and fabricated applicant facts. This reduces injection exposure but cannot guarantee model truthfulness. Human review remains required; no model tools/URL execution are enabled. [Gemini instructions](https://ai.google.dev/api/generate-content).

Match capacity: 32 cached entries/process, at most 1,000 jobs and 512 Ki serialized characters per pool; eight concurrent backend requests/process. JobTech HTTP response buffers are capped at 4 MiB with 20-second timeout. Capacity violations return 422 before page mutation, stop frontend polling and explicitly label results incomplete. Cache eviction or 15-minute expiry may restart a search. Search/filter upstream failures return errors rather than fabricated empty success. Production load testing/tuning remains an operator gate.

CSP uses a fresh request nonce on Next scripts and next-themes; production script-src excludes unsafe-inline/unsafe-eval. Pages are dynamic/no-store, including previously static favorites/jobs. Connections permit configured Supabase/backend origins. Styles retain unsafe-inline for existing animations/theme. Hosting must enforce HTTPS/HSTS. Profile/letter dialogs and mobile settings trap Tab, support Escape and restore focus; desktop resize closes the drawer. Support uses configured mailto instead of the unconnected form; no mail is claimed sent by the app.

`008_privacy_consent_and_limits.sql` is the single manual upgrade for an existing 001–005 schema. It includes 007 limits when absent, adds restrictive guards while preserving existing profile/career policies, and enforces a transactionally counted 200-entry career quota even for direct writes. Existing over-quota entries remain editable/deletable; new inserts are blocked. NOT VALID preserves oversized legacy rows for reviewed correction. Reconcile CLI history after manual SQL; do not replay old creation migrations.

Verification: 48 frontend/database tests plus the focus regression passed; production frontend build passed. Current backend source compiled offline with .NET 10 reference assemblies and cached dependency binaries; 16 matching regressions, nine Auth tests and privacy reservation checks passed. Normal MSBuild/restore was blocked by the execution environment; CI must run standard restore/Release/Docker gates. HTML smoke checks verify nonce alignment on `/auth`, `/privacy`, `/sv/privacy`. Local PostgreSQL fixtures cover migration repeatability, policy preservation, direct-write limits, quota, consent/withdrawal, immutable notices, owner isolation and deletion cascade. Live Supabase, provider calls and full browser accessibility/compatibility testing remain unverified.

No production deletion, processor erasure, contract signature, legal-basis/retention decision or hosted Auth configuration was performed. See the runbook for those owner responsibilities.

## Scope and configuration

`frontend/pages/privacy.tsx` is a public Pages Router route, including localized paths. `proxy.ts` permits it before authentication; `_app.tsx` renders it without the authenticated layout. AuthShell, Sidebar and SettingsDrawer provide links. No new provider, analytics, external images or server-side data store is introduced. Employer logo requests on home/jobs/detail have been removed in favor of local icons.

The page loads plain-text, reviewed notices from server-side `PRIVACY_NOTICE_SV` / `PRIVACY_NOTICE_EN`, and a syntactically checked contact address from `PRIVACY_CONTACT_EMAIL`. All are empty by default. Missing notice/contact are explicitly disclosed, not replaced with fabricated legal information. This does not itself disable signup: the operator must hold public launch until complete. The unconnected support form has been replaced with a configured mailto link; the rights contact opens the user's mail client rather than delivering mail itself.

## Export contract

`GET /api/account/export` uses cookie-aware `lib/serverSupabase.ts` with the anon key and `auth.getUser()`. Client-supplied owner IDs are ignored. Responses are `private, no-store`; POST and other methods return 405, unauthenticated calls 401, unavailable auth/database or incomplete reads 503 with generic errors.

Response: `{ exportedAt, account: { id, email, createdAt }, profile, career, aiConsent }`. Profile and career fields are explicitly selected. No full Auth object, tokens, hashes or admin metadata are exported. The browser adds `localFavorites` from the authenticated owner's storage key; unavailable/malformed storage becomes null, distinguishable from an empty list. The page downloads a JSON Blob, then revokes its object URL. It creates no export record on the server.

Purpose is user access to their stored facts; the controller must document the applicable legal basis and retention for the broader processing. This is not a complete Article 15 response or a guarantee of Article 20 applicability. Logs, provider copies, backups, other devices and required processing information need the manual rights process. Protect the downloaded file; it contains personal data.

## Pagination and concurrency

`readCareerEntries` is shared by export and career GET. It uses `id > cursor` with owner filtering and 100 rows/request, continuing until an empty page even when hosted max_rows is smaller. At most 100 requests and 8 Mi serialized characters are allowed; exceeding either fails explicitly, with no partial success response. Larger datasets need an administrator-assisted export. This bounds accumulated data, not the upstream server's per-response allocation. Migration 008 additionally enforces a 200-entry owner quota; older over-quota data is preserved.

Rows may change during pagination: this is not a transactionally consistent cross-table snapshot. Ask users to stop editing during download; a legally complete request may need an authorized consistent snapshot export.

General `PUT /api/profile` now requires `updatedAt` just like preference PATCH: null attempts creation; an ISO timestamp performs an owner- and updated_at-filtered UPDATE. A stale/missing row or duplicate create returns 409. Omitted profile fields remain untouched. The profile editor passes its last version and retains the draft when conflicts occur; its message asks the user to copy changes and reload. Older clients without versions now receive 400 and must be deployed with the updated frontend.

Migration 007 adds database field limits without replacing RLS or truncating existing records. Its NOT VALID rollout and validation are described in [the Swedish runbook](gdpr-supabase-runbook.md). Migration execution is not part of this code change.

## Verification

Run `npm test` and `npm run build` in `frontend/`. Tests cover owner filtering, unsupported/unauthenticated export, generic failures, secret omission, multiple short pages, repeated cursors, database-direct oversized writes, legacy preservation, translations and profile conflicts. These are local fixtures/PGlite tests, not proof of hosted policy settings.

In staging test signup/tokenrefresh, anonymous access, two-user direct Data API isolation, export download and contents, a two-tab profile conflict, both notices before login, a real privacy-contact email, and no external employer-image requests. Verify keyboard/mobile layout separately. Production access, complete deletion, contracts, legal bases, retention, incident handling and transfer assessments remain operator tasks listed in the runbook and audit.

## Deployment verification — 2026-09-09

The owner explicitly elected to proceed without a backup. Live inspection confirmed the expected 001–005 schema, owner policies and cascade constraints; the hosted migrations ledger was empty. A rollback-only test with two synthetic Auth identities verified the signup profile trigger, own-profile updates, career CRUD and cross-owner denial under the authenticated database role. This is a database-role test, not a browser login or direct HTTP API test. No test fixtures were retained.

CI run 34310446353 passed frontend tests/build, backend Release build, security/matching tests and Docker build. Migration 008 now also revokes direct client execution of the existing optional rls_auto_enable event-trigger function and the immutable-notice trigger, and uses a 5-second lock timeout and 60-second statement timeout. Its PostgreSQL consent/quota regression passed after these changes. Production migration and post-migration verification are tracked in PR #13. Hosted environment variables, browser login/consent flows and processor/notice decisions still require operational verification; optional AI remains disabled until configured and approved.

## CV generation extension (migration 009)

See [CV generation](cv-generation.md). CV shares selected career statements with Gemini for job-specific rewriting and a separate source-only factual review, then
stores validated content plus job context. Both calls reserve independently through the existing privacy gate. This broader disclosure requires a reviewed notice
version configured in `GEMINI_CV_NOTICE_VERSION`; the existing reservation and withdrawal rules
remain mandatory. Export now includes `generatedCvs`. New records cascade on Auth account deletion;
provider/backups and retention remain operational responsibilities. No new legal basis is asserted.
