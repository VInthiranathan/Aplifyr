# Application workspace

## Scope and user flow

All ten product improvements were merged in PR #34. See [the runbook](gdpr-supabase-runbook.md) for dated deployment evidence and remaining checks:

1. Shared job-card progress distinguishes no saved activity, preparation, both documents ready and the actual submitted-application stage. Active CV/letter badges are shown separately. Preparing never creates a submitted application.
2. Job detail and the existing CV route share five workspace destinations: Overview, CV, Cover letter, Application and Notes. The job stays visible above navigation. Overview shows three preparation steps and the next relevant action.
3. Matched cards explain existing role/location/skill signals without numeric scores. Authenticated detail offers deterministic skill overlap, relevant career entries and technologies mentioned in the ad but absent from explicit profile skills. Mentions are not inferred mandatory requirements or proof that a user lacks ability. No AI is used for matching explanations.
4. Profile readiness reuses the server's basic readiness rule and provides optional, concrete recommendations for biography, competencies, responsibilities, education learnings and contact links. No percentage or compulsory employment history.
5. CV statements and letter paragraphs offer improve, shorter, technical and tailor wording suggestions. These operate on a saved statement/revision; save existing edits before requesting another proposal. The user reviews and accepts or discards a suggestion, then explicitly saves the document. No automatic full-document regeneration or persistence.
6. Saved CVs expose actual selected skills/career entries and fact references. Newly generated CV metadata records matched skills retained in the CV and how many final statements differ from source wording. This is deterministic reporting, not a generated explanation of why the AI made a choice. After manual edits the original rewriting metadata is not presented as current.
7. Home groups active prepared documents into needs preparation and both documents ready, excluding jobs already applied for. Submitted history appears separately, with the full Applications list linked. Seven-day expiry is evaluated independently for each artifact.
8. Primary navigation order is Home, Jobs, Applications, Profile; Favorites and supporting destinations remain secondary on desktop/settings. CV and letters remain job-specific.
9. Owner-only job notes work before and after submission. Legacy application notes remain accessible and are preserved when editing application status from the workspace. New job notes are separate records, not a fake submitted application.
10. Home suggests the next step through ready-document counts, active follow-ups whose local calendar date is today/past, and currently loaded matches without saved document/application activity. Match counts describe loaded results, not unseen/newly published jobs. The follow-up link filters the actual application list.

Having both documents is a preparation convenience, not a claim that the employer requires a cover letter. The UI asks the user to check the employer's requirements. Applications are only marked submitted by the user; an external link/PDF download never changes submission status.

## Frontend boundaries

- `features/jobs/WorkspaceNav`, `ApplicationPanel`, `JobNotes`, `MatchExplanation`, `CvAdaptations` compose job routes.
- `features/home/WorkQueue` and `NextActions` compose Home. Existing prepared-document controls and matching lifecycle remain reused.
- `JobProgressProvider` makes one shared owner-bound supplementary read for list badges, refreshes on focus/page restoration/workspace mutations and while a visible page remains open. Account/route changes isolate document state.
- `ProfileReadiness` reads saved facts from the existing career context; it never treats unsaved input as generation authorization.
- `RewriteSuggestion` owns consent/proposal state and request cancellation. Draft edits are local until the existing CV PATCH or new cover-letter PATCH succeeds. A failed save retains the user's draft.
- All new strings are in `workspace` in both locales; all surfaces support dark/light and horizontal native navigation on narrow screens.

## API contracts

All private responses are `private, no-store`; cookie routes independently verify `auth.getUser()`. No client-supplied owner is trusted.

- `GET /api/workspace`: `{owner, progress}`; submitted stages, active prepared-document flags and job-note existence only. No notes or document contents.
- `GET /api/work-queue`: owner application summaries including context, dates and next step; complete keyset reads, without notes.
- `GET /api/prepared-jobs`: bounded complete owner summaries, excluding expired artifacts. These and notes continue after short hosted pages and fail explicitly rather than return partial success.
- `GET /api/job-notes?jobId=...`: `{note: {job_id,notes,updated_at} | null}`.
- `PUT /api/job-notes`: `{jobId,notes,updatedAt}`. Null revision creates; existing revision updates via compare-and-swap. Duplicate/stale requests return 409. A full capacity returns 409 `capacity`.
- `DELETE /api/job-notes`: `{jobId,updatedAt}`, with revision and explicit user confirmation.
- `GET /api/jobinsights/{jobId}`: verified owner facts plus canonical ad, deterministic matching output. Uses the shared matching rules/technology vocabulary. No profile => the explanation is unavailable; public browsing remains available.
- `POST /api/documentrewrites/{jobId}`: `{kind,section,entry,index,text,mode,updatedAt}`. Returns `{text,original,updatedAt}` after generation and separate source-only review. Index/text must match the owner's unexpired saved document. Output is bounded plain text (600 chars CV, 2,000 letter). Unsupported review, changed profile/revision, missing consent, quota or transport failure rejects the proposal. Nothing is persisted by this endpoint.
- `PATCH /api/coverletters/{jobId}`: `{content,updatedAt}` -> `{letter}`. Owner/expiry/revision-filtered write changes content and revision only. Up to 16,000 characters. It preserves original expiry, preparation markers, metadata and job context.

## Persistence and privacy

Migration `20261002075427_application_workspace.sql` creates `job_notes` with CRUD owner RLS, bounded text, account cascade, immutable identity and a transactional 1,000-note quota including direct Data API writes. The private counter is inaccessible to clients. Updates receive a database revision. Empty notes are removed via explicit DELETE, not retained as blank records.

Job notes remain until the user deletes them or the account; no new arbitrary retention period is assigned. They are included in account export and never passed to Gemini. The public privacy UI explains this behavior. The operator must confirm/document the legal basis and any organizational retention policy; this change does not claim GDPR conformity or end-to-end provider/backup deletion.

The migration inserts a new immutable **disabled** Gemini notice `2026-10-documents-v3`, matching frontend/backend constants. Existing notices/receipts are unchanged. The new text describes statement/paragraph AI revisions, a separate review and saved letter edits. The hosted project activated v3 on 2026-10-03 after explicit owner approval; v2 is disabled. Fresh installations still require separate review and activation. All optional AI generation fails closed until the pinned version is enabled and the user gives fresh consent. Existing documents, manual edits, notes and public browsing do not need AI consent.

Each rewrite provider attempt reserves independently through `AiPrivacyGate`, including review; no automatic retries or provider fallback. CV uses its separate key, letters use the letter key. Only selected prose, bounded relevant saved profile facts and the canonical ad are disclosed. Contact fields, job notes and tracking are excluded. Free text may still contain personal data. AI review is probabilistic, not a truth guarantee, and a small race after the final optimistic source/revision check remains possible. The final document save remains revision protected.

## Rollout and verification

1. Confirm previous migrations/current relevant tables and notice state; run owner-isolation, quota, CAS and retention checks in staging.
2. Apply the new migration only after explicit execution approval. Preserve old receipts and do not replay historical migrations against production.
3. Deploy matching application code via an approved merge. No hosting settings/runtime versions change.
4. Review both notice languages and operator/provider facts, approve notice activation separately and collect fresh user consent. Do not reuse v2 for changed AI processing.
5. Verify real auth, both document pipelines, paragraph acceptance/save/reload, expiry unchanged after edits, two-tab conflicts, note export/deletion/account cascade and mobile keyboard/scrolling.

Run frontend tests/build, backend Release build, existing CV/security/matching regressions and `dotnet run --project tests/Aplifyr.WorkspaceTests --configuration Release`. Local PGlite fixtures omit pg_cron and do not prove hosted Auth/provider/deletion settings. The dated runbook records the completed migration/notice activation and CI/Vercel evidence separately from unverified Render, browser and real provider flows.

## Review corrections — 2026-10-02

- Missing/expired advertisements no longer hide authenticated notes or saved letters. The workspace remains available using the job ID and any owner application context; notes can be edited/deleted and letters manually edited without an ad or AI consent. New generation/rewrite actions stay disabled without an available advertisement. Saved CV access continues through the existing owner document route.
- Editing or deleting an application from the Applications page immediately invalidates shared job progress, including mounted list badges. Failed writes do not announce a successful change.
- Prepared-document read errors are tracked separately from application-queue errors, including SSR failures. The work queue and ready count show failure instead of empty/zero success, with a retry that refreshes both sources.
- Rewrite evidence includes explicit saved profile/career skills, with the same source restrictions as prose. At most 40 skill facts share the existing 100-fact budget; entry bullets retain only that entry's evidence. Listed skills do not imply proficiency, duration or achievements. Generation and independent factual review receive the same evidence. Contact fields, notes and tracking remain excluded; consent, quota and revision guards are unchanged.

Regression coverage: missing-ad notes CRUD/account switching, manual letter edits with generation disabled, failed prepared reads and retry, immediate shared status refresh after successful edits/deletions, and skills-only profiles through both reserved provider attempts. Migration and notice activation were completed as separately authorized operations; see the runbook.
