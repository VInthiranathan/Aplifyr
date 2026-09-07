-- Apply after deploying the application without the retired upload/read endpoints.
-- Historical migrations remain unchanged so existing installations can upgrade.
begin;
alter table public.profiles
  drop column if exists cv_url,
  drop column if exists cv_storage_path,
  drop column if exists cv_text;

-- Some local installations have never configured Supabase Storage.
-- Restrictive policies also block older permissive policies with custom names.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    update storage.buckets set public = false where id = 'cvs';
  end if;
  if to_regclass('storage.objects') is not null then
    drop policy if exists retired_cv_bucket on storage.objects;
    create policy retired_cv_bucket on storage.objects as restrictive
      for all to anon, authenticated
      using (bucket_id <> 'cvs') with check (bucket_id <> 'cvs');
  end if;
end;
$$;
-- Delete stored binaries through the Storage API/dashboard, never SQL metadata deletes.
-- See documents/retire-file-storage.md for deployment and physical cleanup order.
commit;
