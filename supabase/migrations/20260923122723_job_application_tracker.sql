begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table public.job_applications (
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id text not null check (job_id ~ '^[A-Za-z0-9_-]{1,100}$'),
  job_context jsonb not null check (
    jsonb_typeof(job_context) = 'object'
    and coalesce(job_context->>'id' = job_id, false)
    and char_length(coalesce(job_context->>'title', '')) between 1 and 200
    and char_length(coalesce(job_context->>'company', '')) <= 200
    and char_length(coalesce(job_context->>'location', '')) <= 200
    and octet_length(job_context::text) <= 4096
  ),
  status text not null default 'applied' check (
    status in ('applied', 'screening', 'interview', 'offer', 'accepted', 'rejected', 'withdrawn')
  ),
  applied_at date not null default current_date,
  next_step text check (next_step is null or char_length(next_step) between 1 and 500),
  next_step_at date,
  notes text not null default '' check (char_length(notes) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, job_id)
);

create index job_applications_user_status_updated_idx
  on public.job_applications (user_id, status, updated_at desc);
create index job_applications_user_next_step_idx
  on public.job_applications (user_id, next_step_at)
  where next_step_at is not null;

create function public.job_applications_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = clock_timestamp();
  return new;
end;
$$;
revoke all on function public.job_applications_set_updated_at() from public, anon, authenticated;

create trigger set_job_applications_updated_at
before update on public.job_applications
for each row execute function public.job_applications_set_updated_at();

alter table public.job_applications enable row level security;
revoke all on public.job_applications from public, anon, authenticated;
grant select, insert, update, delete on public.job_applications to authenticated;

create policy job_applications_select_owner on public.job_applications
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy job_applications_insert_owner on public.job_applications
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy job_applications_update_owner on public.job_applications
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy job_applications_delete_owner on public.job_applications
  for delete to authenticated
  using ((select auth.uid()) = user_id);

commit;
