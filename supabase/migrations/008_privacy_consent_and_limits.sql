-- Aplifyr: samlad uppföljning för ett befintligt schema efter migration 005.
-- Kan köras även om 006/007 redan införts. Bevarar befintliga policies och data.
-- Kör först i staging/med backup. Ingen produktionsdata raderas av installationen.
-- AI förblir AV tills ansvarig publicerat granskad information och godkänt leverantörerna.
-- Detta skript kan inte signera avtal, välja rättslig grund eller konfigurera hosting/Auth.
-- För befintlig installation: använd denna samlade fil; kör inte om 001-005.
-- Om du inför SQL manuellt, stäm av CLI-migrationshistoriken före nästa db push.
-- Säkerhetsbranchen måste också driftsättas; SQL ensam inför inte appens samtyckes-UI.
-- Behåll AI avstängt tills nedanstående operatörsuppgifter faktiskt är verifierade.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
do $$ begin
  if to_regclass('public.profiles') is null or to_regclass('public.profile_career_entries') is null then
    raise exception 'Requires existing profiles and profile_career_entries (migrations 001-005).';
  end if;
end $$;

-- Restrictive guards cannot broaden existing access. Preserve all existing policies.
alter table public.profiles enable row level security;
alter table public.profile_career_entries enable row level security;
revoke all on public.profiles, public.profile_career_entries from anon, public;
do $$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='aplifyr_verified_owner') then
    create policy aplifyr_verified_owner on public.profiles as restrictive for all to authenticated
      using ((select auth.uid())=id) with check ((select auth.uid())=id);
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='profile_career_entries' and policyname='aplifyr_verified_owner') then
    create policy aplifyr_verified_owner on public.profile_career_entries as restrictive for all to authenticated
      using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
  end if;
  -- No new permissive policy: the installation retains the owner's existing RLS.
  if to_regprocedure('public.handle_new_auth_user()') is not null then
    alter function public.handle_new_auth_user() set search_path='';
    revoke execute on function public.handle_new_auth_user() from public,anon,authenticated;
  end if;
  if to_regprocedure('public.profiles_updated_at()') is not null then
    alter function public.profiles_updated_at() set search_path='';
  end if;
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public,anon,authenticated;
  end if;
end $$;

create or replace function public.aplifyr_short_text_array(value text[])
returns boolean language sql immutable set search_path='' as $$
 select value is null or (cardinality(value)<=50 and not exists
   (select 1 from unnest(value) item where item is null or length(item)>100));
$$;
revoke all on function public.aplifyr_short_text_array(text[]) from public;
grant execute on function public.aplifyr_short_text_array(text[]) to authenticated,service_role;
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.profiles'::regclass and conname='profiles_personal_data_limits') then
  alter table public.profiles add constraint profiles_personal_data_limits check (
   (full_name is null or length(full_name)<=200) and (title is null or length(title)<=200)
   and (location is null or length(location)<=200) and (bio is null or length(bio)<=5000)
   and public.aplifyr_short_text_array(tech_stack) and public.aplifyr_short_text_array(roles)
   and public.aplifyr_short_text_array(location_preferences)) not valid;
 end if;
 if not exists(select 1 from pg_constraint where conrelid='public.profile_career_entries'::regclass and conname='career_skill_item_limits') then
  alter table public.profile_career_entries add constraint career_skill_item_limits
   check(public.aplifyr_short_text_array(skills)) not valid;
 end if;
end $$;

-- Atomic owner quota: direct Data API and simultaneous inserts are also covered.
lock table public.profile_career_entries in share row exclusive mode;
create table if not exists public.aplifyr_career_counts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 entries integer not null check(entries>=0)
);
alter table public.aplifyr_career_counts enable row level security;
revoke all on public.aplifyr_career_counts from public,anon,authenticated;
insert into public.aplifyr_career_counts(user_id,entries)
 select user_id,count(*)::int from public.profile_career_entries group by user_id
 on conflict(user_id) do update set entries=excluded.entries;
create or replace function public.aplifyr_career_quota() returns trigger
language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if TG_OP='UPDATE' then
  if new.user_id is distinct from old.user_id then raise exception 'Ownership cannot be transferred' using errcode='23514'; end if;
  return new;
 elsif TG_OP='DELETE' then
  update public.aplifyr_career_counts set entries=greatest(0,entries-1) where user_id=old.user_id;
  return old;
 end if;
 insert into public.aplifyr_career_counts(user_id,entries) values(new.user_id,1)
 on conflict(user_id) do update set entries=public.aplifyr_career_counts.entries+1 returning entries into n;
 if n>200 then raise exception 'Career quota exceeded' using errcode='23514'; end if;
 return new;
end $$;
revoke all on function public.aplifyr_career_quota() from public,anon,authenticated;
drop trigger if exists aplifyr_career_quota on public.profile_career_entries;
create trigger aplifyr_career_quota after insert or update or delete on public.profile_career_entries
 for each row execute function public.aplifyr_career_quota();

-- Reviewed notices are versioned. Seed disabled placeholders, never invented consent.
create table if not exists public.ai_privacy_notices (
 provider text not null check(provider in ('gemini','groq')),
 version text not null check(length(version) between 1 and 100),
 notice_sv text not null default '' check(length(notice_sv)<=20000),
 notice_en text not null default '' check(length(notice_en)<=20000),
 enabled boolean not null default false,
 primary key(provider,version),
 check(not enabled or (length(trim(notice_sv))>0 and length(trim(notice_en))>0))
);
create unique index if not exists ai_privacy_one_enabled on public.ai_privacy_notices(provider) where enabled;
alter table public.ai_privacy_notices enable row level security;
revoke all on public.ai_privacy_notices from public,anon,authenticated;
grant select on public.ai_privacy_notices to authenticated;
grant all on public.ai_privacy_notices to service_role;
drop policy if exists ai_notice_read on public.ai_privacy_notices;
create policy ai_notice_read on public.ai_privacy_notices for select to authenticated using(true);
insert into public.ai_privacy_notices(provider,version) values('gemini','2026-09-v1'),('groq','2026-09-v1') on conflict do nothing;
create or replace function public.aplifyr_immutable_notice() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.enabled or exists(select 1 from public.ai_consent_receipts where provider=old.provider and notice_version=old.version) then
  if new.notice_sv is distinct from old.notice_sv or new.notice_en is distinct from old.notice_en or new.version<>old.version or new.provider<>old.provider then
   raise exception 'Publish a new notice version instead of changing consent evidence';
  end if;
 end if;
 return new;
end $$;

create table if not exists public.ai_consents (
 user_id uuid not null references auth.users(id) on delete cascade,
 provider text not null,
 notice_version text not null,
 granted boolean not null,
 granted_at timestamptz,
 withdrawn_at timestamptz,
 changed_at timestamptz not null default now(),
 primary key(user_id,provider),
 foreign key(provider,notice_version) references public.ai_privacy_notices(provider,version)
);
revoke all on function public.aplifyr_immutable_notice() from public,anon,authenticated;
alter table public.ai_consents enable row level security;
revoke all on public.ai_consents from public,anon,authenticated;
grant select on public.ai_consents to authenticated;
drop policy if exists ai_consent_read on public.ai_consents;
create policy ai_consent_read on public.ai_consents for select to authenticated using((select auth.uid())=user_id);
-- Last grant/withdrawal receipt per reviewed version; bounded by operator-published versions.
create table if not exists public.ai_consent_receipts (
 user_id uuid not null references auth.users(id) on delete cascade,
 provider text not null,notice_version text not null,
 granted_at timestamptz not null,withdrawn_at timestamptz,
 primary key(user_id,provider,notice_version),
 foreign key(provider,notice_version) references public.ai_privacy_notices(provider,version)
);
alter table public.ai_consent_receipts enable row level security;
revoke all on public.ai_consent_receipts from public,anon,authenticated;
grant select on public.ai_consent_receipts to authenticated;
drop policy if exists ai_receipt_read on public.ai_consent_receipts;
create policy ai_receipt_read on public.ai_consent_receipts for select to authenticated using((select auth.uid())=user_id);
drop trigger if exists aplifyr_immutable_notice on public.ai_privacy_notices;
create trigger aplifyr_immutable_notice before update on public.ai_privacy_notices
 for each row execute function public.aplifyr_immutable_notice();

create or replace function public.set_ai_consent(p_provider text,p_version text,p_granted boolean)
returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();
begin
 if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_granted is null or p_provider not in ('gemini','groq') then raise exception 'Invalid consent'; end if;
 -- Serialize grants/withdrawals; withdrawal never needs an active notice.
 perform 1 from auth.users where id=uid for update;
 if not found then raise exception 'Authentication required' using errcode='42501'; end if;
 if not p_granted then
  update public.ai_consent_receipts set withdrawn_at=now() where user_id=uid and provider=p_provider and withdrawn_at is null;
  update public.ai_consents set granted=false,withdrawn_at=now(),changed_at=now() where user_id=uid and provider=p_provider;
  return;
 end if;
 perform 1 from public.ai_privacy_notices where provider=p_provider and version=p_version and enabled for share;
 if not found then raise exception 'Notice unavailable' using errcode='22023'; end if;
 update public.ai_consent_receipts set withdrawn_at=now() where user_id=uid and provider=p_provider and withdrawn_at is null;
 insert into public.ai_consent_receipts(user_id,provider,notice_version,granted_at)
 values(uid,p_provider,p_version,now()) on conflict(user_id,provider,notice_version)
 do update set granted_at=now(),withdrawn_at=null;
 insert into public.ai_consents(user_id,provider,notice_version,granted,granted_at)
 values(uid,p_provider,p_version,true,now()) on conflict(user_id,provider) do update
 set notice_version=excluded.notice_version,granted=true,granted_at=now(),withdrawn_at=null,changed_at=now();
end $$;
revoke all on function public.set_ai_consent(text,text,boolean) from public,anon;
grant execute on function public.set_ai_consent(text,text,boolean) to authenticated;

create or replace function public.export_ai_consents() returns jsonb
language sql security definer set search_path='' as $$
 select jsonb_build_object(
  'current',coalesce((select jsonb_agg(jsonb_build_object('provider',c.provider,'version',c.notice_version,
    'granted',c.granted,'grantedAt',c.granted_at,'withdrawnAt',c.withdrawn_at))
    from public.ai_consents c where c.user_id=auth.uid()),'[]'::jsonb),
  'receipts',coalesce((select jsonb_agg(jsonb_build_object('provider',r.provider,'version',r.notice_version,
    'grantedAt',r.granted_at,'withdrawnAt',r.withdrawn_at,'noticeSv',n.notice_sv,'noticeEn',n.notice_en))
    from public.ai_consent_receipts r join public.ai_privacy_notices n on n.provider=r.provider and n.version=r.notice_version
    where r.user_id=auth.uid()),'[]'::jsonb));
$$;
revoke all on function public.export_ai_consents() from public,anon;
grant execute on function public.export_ai_consents() to authenticated;

-- Private counters and expiring leases: one atomic reservation per external AI call.
create table if not exists public.ai_usage (
 user_id uuid primary key references auth.users(id) on delete cascade,
 day date not null,calls integer not null default 0,lease_until timestamptz not null default '-infinity',lease_id uuid
);
create table if not exists public.ai_budget (
 id boolean primary key default true check(id),day date not null default current_date,calls integer not null default 0,
 daily_limit integer not null default 1000 check(daily_limit between 1 and 100000),
 per_user_limit integer not null default 20 check(per_user_limit between 1 and 1000),
 concurrency_limit integer not null default 4 check(concurrency_limit between 1 and 100)
);
insert into public.ai_budget(id) values(true) on conflict do nothing;
alter table public.ai_usage enable row level security;
alter table public.ai_budget enable row level security;
revoke all on public.ai_usage,public.ai_budget from public,anon,authenticated;
grant all on public.ai_usage,public.ai_budget to service_role;
create or replace function public.reserve_ai_call(p_user uuid,p_provider text)
returns uuid language plpgsql security definer set search_path='' as $$
declare b public.ai_budget; u public.ai_usage; ticket uuid:=gen_random_uuid();
begin
 -- Only backend service_role can call this RPC, after verifying the user's Auth identity.
 select * into b from public.ai_budget where id=true for update;
 if not found then return null; end if;
 perform 1 from auth.users where id=p_user for update;
 if not found then return null; end if;
 if not exists(select 1 from public.ai_consents c join public.ai_privacy_notices n
  on n.provider=c.provider and n.version=c.notice_version
  where c.user_id=p_user and c.provider=p_provider and c.granted and n.enabled) then return null; end if;
 if b.day<>current_date then update public.ai_budget set day=current_date,calls=0 where id=true; b.calls:=0; end if;
 insert into public.ai_usage(user_id,day) values(p_user,current_date) on conflict do nothing;
 select * into u from public.ai_usage where user_id=p_user for update;
 if u.lease_until>now() or (u.day=current_date and u.calls>=b.per_user_limit) or b.calls>=b.daily_limit
  or (select count(*) from public.ai_usage where lease_until>now())>=b.concurrency_limit then return null; end if;
 update public.ai_usage set calls=case when day=current_date then calls+1 else 1 end,day=current_date,
  lease_until=now()+interval '60 seconds',lease_id=ticket where user_id=p_user;
 update public.ai_budget set calls=calls+1 where id=true;
 return ticket;
end $$;
create or replace function public.release_ai_call(p_user uuid,p_ticket uuid) returns void
language sql security definer set search_path='' as $$
 update public.ai_usage set lease_until='-infinity',lease_id=null where user_id=p_user and lease_id=p_ticket;
$$;
revoke all on function public.reserve_ai_call(uuid,text),public.release_ai_call(uuid,uuid) from public,anon,authenticated;
grant execute on function public.reserve_ai_call(uuid,text),public.release_ai_call(uuid,uuid) to service_role;

-- Operator activation AFTER reviewed contracts, purposes, retention and transfers:
-- Populate both texts for the disabled version, then enable that provider.
-- Text must describe actual recipients/data/purpose, withdrawal and retention/transfer details.
-- Set backend AI_ALLOWED_PROVIDERS and server-only SUPABASE_SERVICE_ROLE_KEY.
-- Also publish PRIVACY_NOTICE_SV/EN and PRIVACY_CONTACT_EMAIL in frontend hosting.
-- Exempel (avsiktligt utkommenterat, fyll först med juridiskt granskad fulltext):
-- update public.ai_privacy_notices set notice_sv=$sv$GRANSKAD SVENSK TEXT$sv$,
--   notice_en=$en$REVIEWED ENGLISH TEXT$en$ where provider='gemini' and version='2026-09-v1';
-- update public.ai_privacy_notices set enabled=true where provider='gemini' and version='2026-09-v1';
-- Aktivera Groq separat endast efter egen bedömning. Nya ändamål/mottagare kräver ny version.
-- Nästa version: disable old row, insert a NEW version with reviewed texts, enable it in one transaction.
-- Ange beslutade lagringstider/raderingsrutiner, testa rättighetskontakten och verifiera
-- EU/EES-överföringar/biträdesavtal, hosted Auth/MFA, HTTPS/HSTS, backup och incidentberedskap.
-- Kostnadsspärr: ai_budget.daily_limit är anropsantal, inte valuta. Sätt leverantörernas
-- kostnadslarm och konto-/budgettak separat utifrån modellen och faktiska avtalspriser.
-- No blanket consent for necessary account operation. No consent preselected.
-- Old issued external requests cannot be recalled; withdrawal prevents new reservations.
-- Counters use one row/account and are reset on next use; no prompts/IPs/tokens stored.
-- Existing oversized rows remain NOT VALID: review/correct before VALIDATE CONSTRAINT.
commit;
