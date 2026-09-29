begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Remove only unnecessary inherited historical privileges; preserve owner policies.
revoke truncate, references, trigger on public.profiles, public.profile_career_entries from authenticated;
create index if not exists ai_consents_notice_idx on public.ai_consents(provider,notice_version);
create index if not exists ai_consent_receipts_notice_idx on public.ai_consent_receipts(provider,notice_version);
-- Only optimize verified historical policies when present; fresh installs use different names.
do $$ begin
 if exists(select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_select_own') then
  alter policy profiles_select_own on public.profiles using ((select auth.uid()) = id);
 end if;
 if exists(select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_insert_own') then
  alter policy profiles_insert_own on public.profiles with check ((select auth.uid()) = id);
 end if;
 if exists(select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_update_own') then
  alter policy profiles_update_own on public.profiles using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
 end if;
end $$;

-- Read-only production preflight found zero violations; fail atomically if that changed.
alter table public.profiles validate constraint profiles_personal_data_limits;
alter table public.profile_career_entries validate constraint career_skill_item_limits;

lock table public.job_applications in share row exclusive mode;
create table public.aplifyr_application_counts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 entries integer not null check(entries >= 0)
);
alter table public.aplifyr_application_counts enable row level security;
revoke all on public.aplifyr_application_counts from public,anon,authenticated;
insert into public.aplifyr_application_counts(user_id,entries)
 select user_id,count(*)::integer from public.job_applications group by user_id;
create function public.aplifyr_application_quota() returns trigger
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
 if TG_OP = 'UPDATE' then
  if new.user_id is distinct from old.user_id or new.job_id is distinct from old.job_id then
   raise exception 'Application identity cannot be transferred' using errcode='23514';
  end if;
  return new;
 elsif TG_OP = 'DELETE' then
  update public.aplifyr_application_counts set entries=greatest(0,entries-1) where user_id=old.user_id;
  return old;
 end if;
 insert into public.aplifyr_application_counts(user_id,entries) values(new.user_id,1)
 on conflict(user_id) do update set entries=public.aplifyr_application_counts.entries+1 returning entries into n;
 if n > 1000 then raise exception 'Application quota exceeded' using errcode='54000'; end if;
 return new;
end $$;
revoke all on function public.aplifyr_application_quota() from public,anon,authenticated;
create trigger aplifyr_application_quota after insert or update or delete on public.job_applications
 for each row execute function public.aplifyr_application_quota();

-- Return the actual row while the v2 transaction/advisory lock still holds.
-- Keep v2 available during rolling deployment; never fabricate revisions in the API.
create function public.save_generated_cv_v3(p_user uuid,p_job text,p_content jsonb,p_context jsonb,p_metadata jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare saved jsonb;
begin
 perform public.save_generated_cv_v2(p_user,p_job,p_content,p_context,p_metadata);
 select jsonb_build_object('job_id',job_id,'content',content,'job_context',job_context,
  'metadata',metadata,'created_at',created_at,'updated_at',updated_at,'expires_at',expires_at)
 into saved from public.generated_cvs where user_id=p_user and job_id=p_job;
 return saved;
end $$;
revoke all on function public.save_generated_cv_v3(uuid,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.save_generated_cv_v3(uuid,text,jsonb,jsonb,jsonb) to service_role;

-- Version check and reservation share the same locks/order as the existing quota RPC.
create function public.reserve_ai_call_v2(p_user uuid,p_provider text,p_version text)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
 perform 1 from public.ai_budget where id=true for update;
 perform 1 from auth.users where id=p_user for update;
 if not exists(select 1 from public.ai_consents c join public.ai_privacy_notices n
  on n.provider=c.provider and n.version=c.notice_version
  where c.user_id=p_user and c.provider=p_provider and c.notice_version=p_version and c.granted and n.enabled) then
  return null;
 end if;
 return public.reserve_ai_call(p_user,p_provider);
end $$;
revoke all on function public.reserve_ai_call_v2(uuid,text,text) from public,anon,authenticated;
grant execute on function public.reserve_ai_call_v2(uuid,text,text) to service_role;
-- Reviewed activation is a separate operator action. Never overwrite accepted text or grant consent.
insert into public.ai_privacy_notices(provider,version,notice_sv,notice_en,enabled) values (
 'gemini','2026-09-documents-v2',
 $sv$Frivillig AI-hjälp – Aplifyr under utveckling
Aplifyr drivs i utvecklings- och testsyfte av Vithunan Inthiranathan. Kontaktmejl är ännu inte angiven. Tjänsten är inte klar för offentlig lansering.

Om du godkänner skickas relevanta profiluppgifter och jobbannonsen till Google Gemini för att formulera personliga brev och jobbanpassade CV:n. Brev kan använda namn, yrkesroll, ort, profilbeskrivning, kompetenser och de karriäruppgifter du väljer. CV använder utvalda uppgifter om arbete och utbildning, organisationer, arbetsuppgifter, prestationer, lärdomar och kompetenser. CV-genereringen kan göra ett extra Gemini-anrop för faktagranskning. AI kan göra fel; granska resultatet.

Det senaste CV:t och det senaste personliga brevet per jobb sparas på ditt konto i sju dagar från respektive generering. Du kan ta bort dem tidigare. Ny generering ersätter motsvarande dokument och börjar en ny sjudagarsperiod. Redigering av ett sparat CV förlänger inte tiden. Dokumenten blir otillgängliga vid utgångstiden och tas bort från den aktiva databasen av ett schemalagt jobb, normalt inom ytterligare en timme. Jobbet visas som förberett så länge minst ett dokument är aktivt.

CV:t kan innehålla ditt namn, din ort och frivilliga kontaktuppgifter som e-post, telefon, webbplats och LinkedIn. Kontaktfälten läggs till av Aplifyr och skickas inte som separata fält till Gemini i CV-flödet. Fritext kan ändå innehålla personuppgifter. Profiländringar ändrar inte redan sparade CV:n. Brevredigering i förhandsvisningen sparas inte tillbaka; den ändrade texten kan exporteras. Nedladdade PDF-filer finns kvar på din enhet tills du själv tar bort dem.

Google behandlar indata och svar enligt Gemini API-villkoren: https://ai.google.dev/gemini-api/terms. Lagring hos Google, säkerhetsloggar, eventuella överföringar utanför EU/EES och säkerhetskopior omfattas inte av appens sjudagarsrensning. Aplifyr lovar inte omedelbar eller fullständig radering i dessa system. Operatören måste verifiera tillämpliga villkor och skydd före offentlig lansering.

AI-hjälpen är frivillig. Du kan söka jobb och hantera din profil utan AI-samtycke. Samtyckesversioner, kvitton och anropsräknare sparas separat och följer inte dokumentens sjudagarsperiod. Du kan återkalla samtycket under Integritet i menyn. Det blockerar nya AI-anrop men återkallar inte redan skickade uppgifter. Återkallande raderar inte automatiskt sparade dokument; använd dokumentets raderingsfunktion. Ange inte känsliga uppgifter som inte behövs.$sv$,
 $en$Optional AI assistance – Aplifyr in development
Aplifyr is operated for development and testing by Vithunan Inthiranathan. A contact email has not yet been provided. The service is not ready for public launch.

If you consent, relevant profile information and the job advertisement are sent to Google Gemini to draft cover letters and job-specific CVs. Letters may use your name, role, location, biography, skills and selected career information. CVs use selected work and education information, organizations, responsibilities, achievements, learning and skills. CV generation may make an additional Gemini call for factual review. AI can make mistakes; review the result.

The latest CV and latest cover letter for each job are saved to your account for seven days from their respective generation. You can delete them earlier. Regeneration replaces that document and starts a new seven-day period. Editing a saved CV does not extend its expiry. Documents become inaccessible at expiry and are removed from the active database by a scheduled job, normally within one additional hour. A job remains prepared while at least one document is active.

A CV may contain your name, location and optional contact email, phone, website and LinkedIn. Aplifyr attaches the contact fields itself; they are not sent as separate fields to Gemini in the CV flow. Free text may still contain personal information. Profile changes do not rewrite saved CVs. Cover-letter edits in the preview are not saved back; you can export the edited text. Downloaded PDFs remain on your device until you delete them.

Google processes inputs and outputs under the Gemini API terms: https://ai.google.dev/gemini-api/terms. Google retention, security logs, possible transfers outside the EU/EEA and backups are outside the application's seven-day cleanup. Aplifyr does not promise immediate or complete deletion in those systems. The operator must verify applicable terms and safeguards before public launch.

AI assistance is optional. Job search and profile management do not require AI consent. Consent versions, receipts and call counters are stored separately and do not follow the documents' seven-day period. You can withdraw consent under Privacy in the menu. This blocks new AI calls but cannot recall data already sent. Withdrawal does not automatically delete saved documents; use their delete action. Do not enter sensitive information that is unnecessary.$en$,false
) on conflict(provider,version) do nothing;
commit;
