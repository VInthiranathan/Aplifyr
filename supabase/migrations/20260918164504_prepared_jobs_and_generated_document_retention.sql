begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.generated_cvs
  add column expires_at timestamptz;

update public.generated_cvs
set expires_at = updated_at + interval '7 days'
where expires_at is null;

alter table public.generated_cvs
  alter column expires_at set default (now() + interval '7 days'),
  alter column expires_at set not null;

create index generated_cvs_expires_at_idx on public.generated_cvs (expires_at);

drop policy cv_select_owner on public.generated_cvs;
create policy cv_select_owner on public.generated_cvs
  for select to authenticated
  using ((select auth.uid()) = user_id and expires_at > now());
drop policy cv_delete_owner on public.generated_cvs;
revoke delete on public.generated_cvs from authenticated;

create table public.generated_cover_letters (
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id text not null check (job_id ~ '^[A-Za-z0-9_-]{1,100}$'),
  content text not null check (char_length(content) between 1 and 32000),
  job_context jsonb not null check (
    jsonb_typeof(job_context) = 'object'
    and coalesce(job_context->>'id' = job_id, false)
    and octet_length(job_context::text) <= 4096
  ),
  metadata jsonb not null check (
    jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 4096
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  primary key (user_id, job_id)
);
alter table public.generated_cover_letters enable row level security;
revoke all on public.generated_cover_letters from public, anon, authenticated;
grant select on public.generated_cover_letters to authenticated;
grant select, insert, update, delete on public.generated_cover_letters to service_role;
create policy cover_letter_select_owner on public.generated_cover_letters
  for select to authenticated
  using ((select auth.uid()) = user_id and expires_at > now());
create index generated_cover_letters_expires_at_idx
  on public.generated_cover_letters (expires_at);

-- One row summarizes which retained application material exists for a job.
create table public.prepared_jobs (
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id text not null check (job_id ~ '^[A-Za-z0-9_-]{1,100}$'),
  job_context jsonb not null check (
    jsonb_typeof(job_context) = 'object'
    and coalesce(job_context->>'id' = job_id, false)
    and octet_length(job_context::text) <= 4096
  ),
  has_cv boolean not null default false,
  cv_expires_at timestamptz,
  has_cover_letter boolean not null default false,
  cover_letter_expires_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, job_id),
  check (has_cv = (cv_expires_at is not null)),
  check (has_cover_letter = (cover_letter_expires_at is not null)),
  check (has_cv or has_cover_letter)
);

alter table public.prepared_jobs enable row level security;
revoke all on public.prepared_jobs from public, anon, authenticated;
grant select on public.prepared_jobs to authenticated;
grant select, insert, update, delete on public.prepared_jobs to service_role;
create policy prepared_jobs_select_owner on public.prepared_jobs
  for select to authenticated
  using (
    (select auth.uid()) = user_id
    and ((has_cover_letter and cover_letter_expires_at > now()) or (has_cv and cv_expires_at > now()))
  );
create index prepared_jobs_user_updated_idx
  on public.prepared_jobs (user_id, updated_at desc);

create function public.sync_deleted_generated_cv()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.prepared_jobs
  where user_id = old.user_id and job_id = old.job_id and not has_cover_letter;

  update public.prepared_jobs
  set has_cv = false, cv_expires_at = null, updated_at = clock_timestamp()
  where user_id = old.user_id and job_id = old.job_id and has_cover_letter;
  return old;
end;
$$;
revoke all on function public.sync_deleted_generated_cv() from public, anon, authenticated;

create trigger sync_prepared_job_after_cv_delete
after delete on public.generated_cvs
for each row execute function public.sync_deleted_generated_cv();

create function public.sync_deleted_generated_cover_letter()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.prepared_jobs
  where user_id = old.user_id and job_id = old.job_id and not has_cv;

  update public.prepared_jobs
  set has_cover_letter = false, cover_letter_expires_at = null, updated_at = clock_timestamp()
  where user_id = old.user_id and job_id = old.job_id and has_cv;
  return old;
end;
$$;
revoke all on function public.sync_deleted_generated_cover_letter() from public, anon, authenticated;

create trigger sync_prepared_job_after_cover_letter_delete
after delete on public.generated_cover_letters
for each row execute function public.sync_deleted_generated_cover_letter();

create function public.save_generated_cv_v2(
  p_user uuid,
  p_job text,
  p_content jsonb,
  p_context jsonb,
  p_metadata jsonb
)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  deadline timestamptz := clock_timestamp() + interval '7 days';
begin
  if p_user is null then raise exception 'Unknown owner'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text, 901));

  delete from public.generated_cvs
  where user_id = p_user and expires_at <= clock_timestamp();

  if not exists (
    select 1 from public.generated_cvs where user_id = p_user and job_id = p_job
  ) and (
    select count(*) from public.generated_cvs where user_id = p_user
  ) >= 100 then
    raise exception 'CV capacity reached';
  end if;

  insert into public.generated_cvs (
    user_id, job_id, content, job_context, metadata, expires_at
  ) values (
    p_user, p_job, p_content, p_context, p_metadata, deadline
  )
  on conflict (user_id, job_id) do update
  set content = excluded.content,
      job_context = excluded.job_context,
      metadata = excluded.metadata,
      updated_at = clock_timestamp(),
      expires_at = deadline;

  insert into public.prepared_jobs (
    user_id, job_id, job_context, has_cv, cv_expires_at, updated_at
  ) values (
    p_user, p_job, p_context, true, deadline, clock_timestamp()
  )
  on conflict (user_id, job_id) do update
  set job_context = excluded.job_context,
      has_cv = true,
      cv_expires_at = deadline,
      updated_at = clock_timestamp();

  return deadline;
end;
$$;
revoke all on function public.save_generated_cv_v2(uuid,text,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.save_generated_cv_v2(uuid,text,jsonb,jsonb,jsonb) to service_role;

-- Keep the currently deployed backend compatible while Render rolls out the v2 caller.
-- The legacy RPC delegates to the same retention-aware atomic write.
create or replace function public.save_generated_cv(
  p_user uuid,
  p_job text,
  p_content jsonb,
  p_context jsonb,
  p_metadata jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform public.save_generated_cv_v2(p_user, p_job, p_content, p_context, p_metadata);
end;
$$;
revoke all on function public.save_generated_cv(uuid,text,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.save_generated_cv(uuid,text,jsonb,jsonb,jsonb) to service_role;

create function public.save_generated_cover_letter(
  p_user uuid,
  p_job text,
  p_content text,
  p_context jsonb,
  p_metadata jsonb
)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  deadline timestamptz := clock_timestamp() + interval '7 days';
begin
  if p_user is null then raise exception 'Unknown owner'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text, 902));

  delete from public.generated_cover_letters
  where user_id = p_user and expires_at <= clock_timestamp();

  if not exists (
    select 1 from public.generated_cover_letters where user_id = p_user and job_id = p_job
  ) and (
    select count(*) from public.generated_cover_letters where user_id = p_user
  ) >= 100 then
    raise exception 'Cover letter capacity reached';
  end if;

  insert into public.generated_cover_letters (
    user_id, job_id, content, job_context, metadata, expires_at
  ) values (
    p_user, p_job, p_content, p_context, p_metadata, deadline
  )
  on conflict (user_id, job_id) do update
  set content = excluded.content,
      job_context = excluded.job_context,
      metadata = excluded.metadata,
      updated_at = clock_timestamp(),
      expires_at = deadline;

  insert into public.prepared_jobs (
    user_id, job_id, job_context, has_cover_letter,
    cover_letter_expires_at, updated_at
  ) values (
    p_user, p_job, p_context, true, deadline, clock_timestamp()
  )
  on conflict (user_id, job_id) do update
  set job_context = excluded.job_context,
      has_cover_letter = true,
      cover_letter_expires_at = deadline,
      updated_at = clock_timestamp();

  return deadline;
end;
$$;
revoke all on function public.save_generated_cover_letter(uuid,text,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.save_generated_cover_letter(uuid,text,text,jsonb,jsonb) to service_role;

create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule(
  'aplifyr-expired-application-material-cleanup',
  '17 * * * *',
  $$delete from public.generated_cvs where expires_at <= now();
    delete from public.generated_cover_letters where expires_at <= now()$$
);

commit;
