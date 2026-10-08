# Privacy controls and safe profile updates

## Password recovery hardening — 2026-10-08

The recovery request preserves the selected locale, trims the email address, rejects concurrent submissions and applies a 60-second UI cooldown after successful requests. Its success text does not assert that the address has an account or that mail arrived. Provider/transport errors map to local translation keys; raw messages are never rendered.

The reset page exchanges bounded PKCE callback input through the shared `authCallback`/cookie-aware server client, with a ten-second outbound timeout, private/no-store and no-referrer headers, then redirects to a clean URL without code/error payloads. The outcome parameter is presentation only: it cannot create a session or authorize a password change. Invalid callback outcomes disable the form. Password mutation still relies on Supabase Auth's current session and hosted password/reauthentication policy; this is not an additional recovery-only authorization policy.

Password drafts are memory-only and cleared when the account identity changes and after successful mutation. Late initial reads cannot restore a logged-out account, and previous-account completions cannot display success or navigate the current account. Duplicate mutation is blocked during an attempt and after success. Failed app navigation preserves the successful result and a continuation link. Both locales provide accessible labels and password-visibility controls.

Purpose, users and recipient remain existing account access/recovery through Supabase Auth. The app sends the email for recovery and new password only to the existing Auth service; it adds no processor, analytics, new profile field or retention deadline. The code/verifier are temporary Auth transport, and provider text is excluded from UI/log output. Hosted Auth configuration, real email delivery, session revocation and applicable processor retention have not been established by these local tests. Account legal basis and public identity/contact still require the operator decisions below; AI consent is not their legal basis.

## Public identity and notice completion — operator decisions pending

The owner supplied **Aplifyr support** as the contact display name. No monitored email address or full legal identity was supplied. The existing public page remains configuration-driven; no fictional name, address, contract, legal basis or retention period has been published.

The reviewed public notices in Swedish and English must cover the following verified data map, with the remaining decisions completed before `PRIVACY_NOTICE_SV`, `PRIVACY_NOTICE_EN` and `PRIVACY_CONTACT_EMAIL` are configured:

| Purpose | Actual data/processing | Missing notice/operational decision |
|---|---|---|
| Registration, login and recovery | Email, Auth account/session data; password handled by Supabase Auth | Legal identity, legal basis, SMTP provider, session/account retention and monitored contact |
| Saved profile and career | Owner-entered name, biography, skills, preferences, optional contact fields and career entries | Applicable legal basis and inactive-account retention |
| Application workspace | Owner-bound applications, status, notes and follow-ups | Legal basis and retention criterion; deletion is available for these records |
| Optional AI documents/rewrite | Selected facts sent only to the specifically consented provider/version; saved CV/letter expire after seven days | Actual commercial provider terms, processing roles, agreements, transfers, provider retention/deletion and final informed notice |
| Browser features | Account-scoped local favorites and theme; PDF/JSON downloads remain on the user's device | Explain browser cleanup and downloaded-copy scope |
| Operation and rights requests | Hosting/Auth/provider diagnostics and support requests | Actual access, log retention, responsible contact, case retention and incident route |
| Backups/restoration | Copies can predate account deletion | Actual provider backup retention, verified restore plan and separate minimal deletion ledger |

The seven-day deadline is for generated documents in the application; it is not a claim about providers, log records, downloads or backups. The application has authenticated export and owner CRUD, but account deletion remains an operator workflow. Describe that workflow and monitored contact accurately, including provider requests and restoration replay. Explain withdrawal, relevant rights and complaints to IMY; do not promise immediate erasure from every system.

For every provider, record the exact contracted service/tier, agreement/version and acceptance evidence, regions/subprocessors and remote access, training/use terms, retention/deletion route and transfer mechanism where needed. This cannot be inferred from a provider name or EU region. Current sources and an operator decision are required before finalizing those claims. See the [runbook](gdpr-supabase-runbook.md) for the rollout and launch evidence.

## Account-state isolation corrections — 2026-10-07

The launch review tightens existing profile/CV display boundaries: active account identity scopes mounted profile editors and their career context, superseded reads are cancelled, and late CV sessions cannot load another account's document into the current UI. The existing server authentication, owner RLS and export/deletion contracts remain authoritative. These corrections use the same profile, career and saved-document sources and fields for the same users and purposes; recipients, processors and provider notices are unchanged. Previous account drafts are removed on unmount. Navigation warnings keep unsaved document/note/application text in memory only and add no persistence or retention period. The documented operator decisions on legal basis, retention, backups and processor deletion remain unresolved where stated below.

Notes and post-generation letter recovery reread the same owner records via existing authenticated GET endpoints. Recovering a letter's persisted revision makes no extra AI attempt, grants no consent and sends no additional personal text to a provider. Until recovery succeeds, document editing/regeneration is disabled; the already returned generated text can be copied/downloaded locally. Existing expiry, export, deletion and downstream-copy limitations are unchanged.

## Consent and enforcement — migration 008

`AiConsent` on job detail and `/privacy` provides separate, initially unchecked choices for Gemini and Groq. Users can withdraw even when the provider is disabled. Search/profile access do not require AI consent. Failed writes do not optimistically grant consent. No blanket account, analytics or marketing consent is added. [IMY consent requirements](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/rattslig-grund/samtycke/).

Optional CV contact email, telephone, website and LinkedIn values are ordinary profile
data, not a new external-processing purpose. Registration therefore does not add a bundled
consent checkbox. The controller must document and confirm the applicable legal basis,
purpose and retention in the public privacy notice; this implementation does not invent
those decisions. Fields are optional, owner-scoped by the existing profile RLS, included
in account export, editable and removed with the cascading profile row on account deletion.
Their database constraints reduce malformed/direct writes but do not establish compliance.

`GET/PUT /api/account/consent` uses verified cookie identity, the anon key, no-store and safe JSON mutations. PUT validates provider/version/boolean and calls `set_ai_consent`; SQL assigns the owner. Direct table mutations are revoked. `ai_consents` records current choices; `ai_consent_receipts` retains the last grant/withdrawal per reviewed provider/version, not every toggle. Accepted notice texts are immutable. New processing requires a new reviewed version and new consent. Receipts/texts are included in export via `export_ai_consents()` and cascade on account deletion. The controller must define their retention while the account exists.

Migration 008 originally seeds disabled empty notices; later migrations add reviewed versioned development text. The hosted project has only Gemini v3 enabled as of 2026-10-03; see the runbook. For new processing, populate both languages and enable each provider only after verifying purpose, recipients, contracts, retention and international transfers. Configure the main privacy notice/contact as well. These operational facts are not invented by the migration.

Backend `AiPrivacyGate` reserves before EACH external attempt, including fallback, through service-role-only `reserve_ai_call_v2` with the code-pinned document notice version. The verified Auth subject is passed server-side. SQL atomically checks user existence, active notice/current consent, quotas and leases. Defaults: 20 attempts/user/day, 1,000 globally/day, one simultaneous attempt/user and four globally. Reserved failures count; these are call ceilings, not currency budgets. Withdrawal prevents subsequent reservations but cannot recall already authorized/in-flight requests. Leases expire at 60 seconds, provider calls timeout at 30 seconds, and release is scoped by ticket. Missing configuration, denied reservation and DB errors fail closed. `AI_ALLOWED_PROVIDERS`, provider keys and the backend-only `SUPABASE_SERVICE_ROLE_KEY` are independently required.

For ordinary cover-letter generation, users can explicitly choose up to three career entries. Only kind/title/organization/dates/skills are sent; backend strips other career fields. JSON source data is separated from Gemini `systemInstruction` / Groq system instructions prohibiting source-instruction execution and fabricated applicant facts. This reduces injection exposure but cannot guarantee model truthfulness. Human review remains required; no model tools/URL execution are enabled. [Gemini instructions](https://ai.google.dev/api/generate-content).

Match capacity: 32 cached entries/process, at most 1,000 jobs and 512 Ki serialized characters per pool. Admission is partitioned by traffic category; public requests have a separate four-request process concurrency pool. JobTech HTTP response buffers are capped at 4 MiB with 20-second timeout. Capacity violations return 422 before page mutation, stop frontend polling and explicitly label results incomplete. Cache eviction or 15-minute expiry may restart a search. Search/filter upstream failures return errors rather than fabricated empty success. Production load testing/tuning remains an operator gate.

CSP uses a fresh request nonce on Next scripts and next-themes; production script-src excludes unsafe-inline/unsafe-eval. Pages are dynamic/no-store, including previously static favorites/jobs. Connections permit configured Supabase/backend origins. Styles retain unsafe-inline for existing animations/theme. Hosting must enforce HTTPS/HSTS. Profile/letter dialogs and mobile settings trap Tab, support Escape and restore focus; desktop resize closes the drawer. Support uses configured mailto instead of the unconnected form; no mail is claimed sent by the app.

`008_privacy_consent_and_limits.sql` is the single manual upgrade for an existing 001–005 schema. It includes 007 limits when absent, adds restrictive guards while preserving existing profile/career policies, and enforces a transactionally counted 200-entry career quota even for direct writes. Existing over-quota entries remain editable/deletable; new inserts are blocked. NOT VALID preserves oversized legacy rows for reviewed correction. Reconcile CLI history after manual SQL; do not replay old creation migrations.

Current validation and live activation evidence are recorded in [the runbook](gdpr-supabase-runbook.md). Provider erasure, contracts, legal bases, retention decisions and hosted Auth configuration remain operator responsibilities.

## Scope and configuration

`frontend/pages/privacy.tsx` is a public Pages Router route, including localized paths. `proxy.ts` permits it before authentication; `_app.tsx` renders it without the authenticated layout. AuthShell, Sidebar and SettingsDrawer provide links. No new provider, analytics, external images or server-side data store is introduced. Employer logo requests on home/jobs/detail have been removed in favor of local icons.

The page loads plain-text, reviewed notices from server-side `PRIVACY_NOTICE_SV` / `PRIVACY_NOTICE_EN`, and a syntactically checked contact address from `PRIVACY_CONTACT_EMAIL`. All are empty by default. Missing notice/contact are explicitly disclosed, not replaced with fabricated legal information. This does not itself disable signup: the operator must hold public launch until complete. The unconnected support form has been replaced with a configured mailto link; the rights contact opens the user's mail client rather than delivering mail itself.

## Export contract

`GET /api/account/export` uses cookie-aware `lib/serverSupabase.ts` with the anon key and `auth.getUser()`. Client-supplied owner IDs are ignored. Responses are `private, no-store`; POST and other methods return 405, unauthenticated calls 401, unavailable auth/database or incomplete reads 503 with generic errors.

Response: `{ exportedAt, account: { id, email, createdAt }, profile, career, aiConsent, generatedCvs, generatedCoverLetters, jobApplications, jobNotes }`. Profile, career, active generated-document, application-tracking and job-note fields are explicitly selected. No full Auth object, tokens, hashes or admin metadata are exported. The browser adds `localFavorites` from the authenticated owner's storage key; unavailable/malformed storage becomes null, distinguishable from an empty list. The page downloads a JSON Blob, then revokes its object URL. It creates no export record on the server.

Application tracking stores job context, process status, dates, next action and optional notes as owner-scoped personal data. It is not sent to an AI provider. Records remain until the user deletes them or deletes the account; the operator must document the actual purpose, legal basis and organizational retention policy before launch. The implementation adds no bundled consent checkbox and does not claim that consent is the applicable legal basis.

The profile export includes the four optional CV contact fields. During CV generation,
the backend reads them with the owner's bearer session but excludes them from the Gemini
input and factual-review input. They are deterministically attached only after the AI
response has passed validation. The saved seven-day CV snapshot and locally downloaded
PDF can therefore contain those details; changing the profile does not rewrite an already
saved CV. Users must regenerate or delete it, and downloaded files remain outside app
retention controls.

Supabase Auth can deliberately obscure whether an email already exists. The registration
UI recognizes only the documented signup response/error signals and provides a localized
sign-in/reset message. It does not query `auth.users`, expose a service-role key or add a
public account-lookup endpoint. This preserves Supabase's server-side anti-enumeration
behavior where the hosted configuration withholds a definitive result.

Email-confirmation recovery uses the existing account-access purpose and Supabase Auth
processor; it adds no AI processing, tracking, account-lookup endpoint or service-role
access. Resend sends only the entered email, signup type, PKCE security fields and a
controlled callback URL with an allowlisted app destination to Supabase. The email
is held in React state and is not placed in URLs or new persistent app storage.
Passwords are cleared from form state after successful authentication. PKCE verifier
and session cookies remain managed by `@supabase/ssr`; callback exchanges use the
shared server helper and preserve its cookie writes. Callback codes are removed before
rendering, raw Auth errors are not displayed/logged, private responses are no-store,
and redirects suppress inherited error fragments. Result URL values are presentation
only and confer no access; protected routes/APIs retain independent authentication.
There is no new database data, retention policy, legal basis or processor. Existing
account correction/export/deletion and operator decisions for account/email/log/backup
retention and legal basis remain unchanged. Upstream hosting/Auth request logs may
contain callback URLs and require the existing operator access/retention controls.

Purpose is user access to their stored facts; the controller must document the applicable legal basis and retention for the broader processing. This is not a complete Article 15 response or a guarantee of Article 20 applicability. Logs, provider copies, backups, other devices and required processing information need the manual rights process. Protect the downloaded file; it contains personal data.

## Pagination and concurrency

`readCareerEntries` is shared by export and career GET. It uses `id > cursor` with owner filtering and 100 rows/request, continuing until an empty page even when hosted max_rows is smaller. At most 100 requests and 8 Mi serialized characters are allowed; exceeding either fails explicitly, with no partial success response. Larger datasets need an administrator-assisted export. This bounds accumulated data, not the upstream server's per-response allocation. Migration 008 additionally enforces a 200-entry owner quota; older over-quota data is preserved.

Rows may change during pagination: this is not a transactionally consistent cross-table snapshot. Ask users to stop editing during download; a legally complete request may need an authorized consistent snapshot export.

General `PUT /api/profile` now requires `updatedAt` just like preference PATCH: null attempts creation; an ISO timestamp performs an owner- and updated_at-filtered UPDATE. A stale/missing row or duplicate create returns 409. Omitted profile fields remain untouched. The profile editor passes its last version and retains the draft when conflicts occur; its message asks the user to copy changes and reload. Older clients without versions now receive 400 and must be deployed with the updated frontend.

Migration 007 adds database field limits without replacing RLS or truncating existing records. Its NOT VALID rollout and validation are described in [the Swedish runbook](gdpr-supabase-runbook.md). Migration execution is not part of this code change.

## Verification

Run `npm test` and `npm run build` in `frontend/`. Tests cover owner filtering, unsupported/unauthenticated export, generic failures, secret omission, multiple short pages, repeated cursors, database-direct oversized writes, legacy preservation, translations and profile conflicts. These are local fixtures/PGlite tests, not proof of hosted policy settings.

In staging test signup/tokenrefresh, anonymous access, two-user direct Data API isolation, export download and contents, a two-tab profile conflict, both notices before login, a real privacy-contact email, and no external employer-image requests. Verify keyboard/mobile layout separately. Production access, complete deletion, contracts, legal bases, retention, incident handling and transfer assessments remain operator tasks listed in the runbook.

## Generated documents and seven-day retention (migrations 009 and 20260918164504)

See [CV generation](cv-generation.md). CV shares selected career statements with Gemini for job-specific rewriting and a separate source-only factual review, then
returns validated content plus job context for an owner-only preview and local PDF download.
The latest generated CV and cover letter are stored in Supabase for seven days, hidden at their
independent expiry and physically deleted by an hourly database job. Users can delete either one earlier.
Both AI calls reserve independently through the existing privacy gate. This broader disclosure and retention requires a reviewed notice
version `2026-10-documents-v3`, pinned in frontend/backend source; the existing reservation and withdrawal rules
remain mandatory. Changing from transient output to stored output requires a new notice version and fresh consent; a transient-only notice must not be reused. Export includes active `generatedCvs` and `generatedCoverLetters`. Records cascade on Auth account deletion;
provider/backups and retention remain operational responsibilities. No new legal basis is asserted.

## Generation consent dialog

Clicking generate or regenerate makes a no-store check of the current Gemini notice
and saved consent before making an AI request. Current saved consent continues directly
without reopening the dialog. `AiGenerationConsent` opens only when consent is missing,
withdrawn or stale because the active notice version changed. The user can cancel;
continuing is disabled while loading, after a failed consent write, or when Gemini has
no enabled notice.
A successful explicit checkbox update enables a separate continue button. Existing
current consent is stored server-side; it is never fabricated or granted automatically.
The shared dialog uses the existing focus trap, Escape dismissal and focus restoration.
The backend still verifies consent/version and reserves every provider call, including
CV factual review, so client UI is not an authorization boundary. Withdrawal remains
available from the desktop and mobile menu at `/privacy#ai-consent`. No Groq fallback
is enabled by this UI.

### Manual document edits and PDF export

Users can save edits to CV summary statements and career bullets without sending
those edits to Gemini. The existing saved CV is updated for its authenticated owner;
its original seven-day deadline is not extended. User edits are marked separately
from AI-reviewed statements. CV and cover-letter PDFs are generated locally with
same-origin font assets. Downloaded files are outside the application's deletion
and expiry controls. Both CV and cover-letter edits persist only after explicit Save changes, without extending expiry. See the respective feature documents.

## Shared security boundaries

`readApplications` is shared by application SSR, status badges and account export. It uses owner-filtered `job_id` keyset pagination, continues after short pages, and fails explicitly on database errors, repeated cursors or safety bounds (1,001 requests, 10,000 rows, 16 MiB UTF-8). It never silently exports only the first 500 records. Concurrent writes can still change the result between pages; this is not a snapshot export. The new database quota is 1,000 applications; legacy excess rows remain editable/deletable.

Backend public access is explicit endpoint metadata, not a path-name allowlist. Verified users have separate generation/document budgets; unverified tokens consume only bounded authentication capacity. Public search, generation and documents have separate concurrency pools. Limits remain process-local; database AI reservations remain shared. Correct trusted-proxy configuration and staging load tests remain necessary.

The hardening migration validates the earlier NOT VALID constraints transactionally. The hosted ledger and remaining password-protection/runtime checks are recorded in the runbook.

## Guest browsing

Job search and advertisements can be read without registration or AI consent. Guest navigation does not request private profile, application or document records. Generation continues to require a verified account, a saved profile with name and source material, and the existing separate AI consent. Optional contact fields stay optional. No new storage, provider, consent purpose, retention period or database policy is introduced. See the guest flow in `project-overview.md`.

## Workspace privacy

Owner-only `job_notes` are included as `jobNotes` in account export, retained until user/account deletion, and never sent to AI. Saved letter edits now persist without changing the original document expiry. Single-statement/paragraph AI proposals introduce changed processing covered by new immutable notice `2026-10-documents-v3`, initially disabled. Both code constants are aligned; old notices and receipts are preserved. The hosted notice was activated after explicit approval on 2026-10-03. Fresh user consent is required before optional AI is used. Manual edits and notes require authentication and owner checks, independently of AI consent. See [Application workspace](application-workspace.md) for disclosure bounds, verification and remaining operational responsibilities.
