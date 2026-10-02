begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create table public.job_notes (
 user_id uuid not null references auth.users(id) on delete cascade,
 job_id text not null check(job_id ~ '^[A-Za-z0-9_-]{1,100}$'),
 notes text not null check(char_length(btrim(notes)) between 1 and 5000 and octet_length(notes)<=20000 and notes !~ '[\x01-\x08\x0b\x0c\x0e-\x1f]'),
 updated_at timestamptz not null default clock_timestamp(),
 primary key(user_id,job_id)
);
alter table public.job_notes enable row level security;
revoke all on public.job_notes from public,anon,authenticated;
grant select,insert,update,delete on public.job_notes to authenticated;
create policy job_notes_select_owner on public.job_notes for select to authenticated using((select auth.uid())=user_id);
create policy job_notes_insert_owner on public.job_notes for insert to authenticated with check((select auth.uid())=user_id);
create policy job_notes_update_owner on public.job_notes for update to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy job_notes_delete_owner on public.job_notes for delete to authenticated using((select auth.uid())=user_id);
create trigger job_notes_revision before update on public.job_notes for each row execute function public.job_applications_set_updated_at();
-- Private transactional counter protects the direct Data API as well as the application.
create table public.aplifyr_note_counts(user_id uuid primary key references auth.users(id) on delete cascade,entries integer not null check(entries>=0));
alter table public.aplifyr_note_counts enable row level security;
revoke all on public.aplifyr_note_counts from public,anon,authenticated;
create function public.aplifyr_note_quota() returns trigger language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if TG_OP='UPDATE' then
  if new.user_id is distinct from old.user_id or new.job_id is distinct from old.job_id then raise exception 'Note identity cannot be transferred' using errcode='23514'; end if;
  return new;
 elsif TG_OP='DELETE' then
  update public.aplifyr_note_counts set entries=greatest(0,entries-1) where user_id=old.user_id; return old;
 end if;
 insert into public.aplifyr_note_counts(user_id,entries) values(new.user_id,1)
 on conflict(user_id) do update set entries=public.aplifyr_note_counts.entries+1 returning entries into n;
 if n>1000 then raise exception 'Note quota exceeded' using errcode='54000'; end if;
 return new;
end $$;
revoke all on function public.aplifyr_note_quota() from public,anon,authenticated;
create trigger job_notes_quota after insert or update or delete on public.job_notes for each row execute function public.aplifyr_note_quota();

insert into public.ai_privacy_notices(provider,version,notice_sv,notice_en,enabled) values (
 'gemini','2026-10-documents-v3',
 $sv$Frivillig AI-hjälp – Aplifyr under utveckling
Aplifyr drivs i utvecklings- och testsyfte av Vithunan Inthiranathan. Kontaktmejl är ännu inte angiven. Tjänsten är inte klar för offentlig lansering.

Om du godkänner skickas relevanta profiluppgifter och jobbannonsen till Google Gemini för att formulera personliga brev och jobbanpassade CV:n. Brev kan använda namn, yrkesroll, ort, profilbeskrivning, kompetenser och de karriäruppgifter du väljer. CV använder utvalda uppgifter om arbete och utbildning, organisationer, arbetsuppgifter, prestationer, lärdomar och kompetenser. CV-genereringen kan göra ett extra Gemini-anrop för faktagranskning. AI kan göra fel; granska resultatet.

Det senaste CV:t och det senaste personliga brevet per jobb sparas på ditt konto i sju dagar från respektive generering. Du kan ta bort dem tidigare. Ny generering ersätter motsvarande dokument och börjar en ny sjudagarsperiod. Redigering av ett sparat CV förlänger inte tiden. Dokumenten blir otillgängliga vid utgångstiden och tas bort från den aktiva databasen av ett schemalagt jobb, normalt inom ytterligare en timme. Jobbet visas som förberett så länge minst ett dokument är aktivt.

CV:t kan innehålla ditt namn, din ort och frivilliga kontaktuppgifter som e-post, telefon, webbplats och LinkedIn. Kontaktfälten läggs till av Aplifyr och skickas inte som separata fält till Gemini i CV-flödet. Fritext kan ändå innehålla personuppgifter. Profiländringar ändrar inte redan sparade CV:n. Ändringar i CV och personligt brev kan sparas utan att deras ursprungliga giltighetstid förlängs. Du kan be om AI-formuleringsförslag för en CV-rad eller ett brevstycke. Den valda texten, relevanta sparade profiluppgifter och den aktuella annonsen skickas till Gemini. Ett separat anrop granskar förslaget mot profilens uppgifter. Förslaget sparas inte automatiskt: du granskar och accepterar det och sparar sedan dokumentet. Privata jobbanteckningar och ansökningsspårning skickas aldrig till Gemini. Förslag använder upp till två reserverade provideranrop. Ändrade profil- eller dokumentversioner gör förslaget ogiltigt. Nedladdade PDF-filer finns kvar på din enhet tills du själv tar bort dem.

Google behandlar indata och svar enligt Gemini API-villkoren: https://ai.google.dev/gemini-api/terms. Lagring hos Google, säkerhetsloggar, eventuella överföringar utanför EU/EES och säkerhetskopior omfattas inte av appens sjudagarsrensning. Aplifyr lovar inte omedelbar eller fullständig radering i dessa system. Operatören måste verifiera tillämpliga villkor och skydd före offentlig lansering.

AI-hjälpen är frivillig. Du kan söka jobb och hantera din profil utan AI-samtycke. Samtyckesversioner, kvitton och anropsräknare sparas separat och följer inte dokumentens sjudagarsperiod. Du kan återkalla samtycket under Integritet i menyn. Det blockerar nya AI-anrop men återkallar inte redan skickade uppgifter. Återkallande raderar inte automatiskt sparade dokument; använd dokumentets raderingsfunktion. Ange inte känsliga uppgifter som inte behövs.$sv$,
 $en$Optional AI assistance – Aplifyr in development
Aplifyr is operated for development and testing by Vithunan Inthiranathan. A contact email has not yet been provided. The service is not ready for public launch.

If you consent, relevant profile information and the job advertisement are sent to Google Gemini to draft cover letters and job-specific CVs. Letters may use your name, role, location, biography, skills and selected career information. CVs use selected work and education information, organizations, responsibilities, achievements, learning and skills. CV generation may make an additional Gemini call for factual review. AI can make mistakes; review the result.

The latest CV and latest cover letter for each job are saved to your account for seven days from their respective generation. You can delete them earlier. Regeneration replaces that document and starts a new seven-day period. Editing a saved CV does not extend its expiry. Documents become inaccessible at expiry and are removed from the active database by a scheduled job, normally within one additional hour. A job remains prepared while at least one document is active.

A CV may contain your name, location and optional contact email, phone, website and LinkedIn. Aplifyr attaches the contact fields itself; they are not sent as separate fields to Gemini in the CV flow. Free text may still contain personal information. Profile changes do not rewrite saved CVs. CV and cover-letter edits can be saved without extending their original expiry. You can request AI wording suggestions for one CV statement or letter paragraph. The selected text, relevant saved profile facts and the canonical advertisement are sent to Gemini. A separate source-only factual review checks each suggestion. Suggestions are not saved automatically: you review and accept them, then save the document. Private job notes and application tracking are never sent to Gemini. Suggestions use up to two reserved provider attempts. Changed profile or document revisions invalidate the suggestion. Downloaded PDFs remain on your device until you delete them.

Google processes inputs and outputs under the Gemini API terms: https://ai.google.dev/gemini-api/terms. Google retention, security logs, possible transfers outside the EU/EEA and backups are outside the application's seven-day cleanup. Aplifyr does not promise immediate or complete deletion in those systems. The operator must verify applicable terms and safeguards before public launch.

AI assistance is optional. Job search and profile management do not require AI consent. Consent versions, receipts and call counters are stored separately and do not follow the documents' seven-day period. You can withdraw consent under Privacy in the menu. This blocks new AI calls but cannot recall data already sent. Withdrawal does not automatically delete saved documents; use their delete action. Do not enter sensitive information that is unnecessary.$en$,false
) on conflict(provider,version) do nothing;
commit;
