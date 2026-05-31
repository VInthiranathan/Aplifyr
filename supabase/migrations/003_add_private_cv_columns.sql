alter table public.profiles
  add column if not exists cv_storage_path text,
  add column if not exists cv_text text;