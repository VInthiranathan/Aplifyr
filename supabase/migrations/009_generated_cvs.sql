begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Public JobTech IDs are not user-owned jobs. Ownership is the composite user + job key.
create table public.generated_cvs (
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id text not null check (job_id ~ '^[A-Za-z0-9_-]{1,100}$'),
  content jsonb not null check (jsonb_typeof(content) = 'object' and coalesce(content->>'schemaVersion' = '1', false) and octet_length(content::text) <= 65536),
  job_context jsonb not null check (jsonb_typeof(job_context) = 'object' and coalesce(job_context->>'id' = job_id, false) and octet_length(job_context::text) <= 4096),
  metadata jsonb not null check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 4096),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, job_id)
);
alter table public.generated_cvs enable row level security;
revoke all on public.generated_cvs from public, anon, authenticated;
grant select, delete on public.generated_cvs to authenticated;
grant select, insert, update, delete on public.generated_cvs to service_role;
create policy cv_select_owner on public.generated_cvs for select to authenticated using ((select auth.uid()) = user_id);
create policy cv_delete_owner on public.generated_cvs for delete to authenticated using ((select auth.uid()) = user_id);

-- Only the authenticated backend may store validated output. Serialize per-owner capacity checks.
create function public.save_generated_cv(p_user uuid, p_job text, p_content jsonb, p_context jsonb, p_metadata jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if p_user is null then raise exception 'Unknown owner'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text, 901));
  if not exists (select 1 from public.generated_cvs where user_id = p_user and job_id = p_job)
     and (select count(*) from public.generated_cvs where user_id = p_user) >= 100 then
    raise exception 'CV capacity reached';
  end if;
  insert into public.generated_cvs(user_id,job_id,content,job_context,metadata)
    values(p_user,p_job,p_content,p_context,p_metadata)
  on conflict (user_id,job_id) do update set content=excluded.content,job_context=excluded.job_context,
    metadata=excluded.metadata,updated_at=clock_timestamp();
end;
$$;
revoke all on function public.save_generated_cv(uuid,text,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.save_generated_cv(uuid,text,jsonb,jsonb,jsonb) to service_role;
commit;
