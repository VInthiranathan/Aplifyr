set lock_timeout = '5s';
set statement_timeout = '60s';

alter table public.profiles
  add column if not exists contact_email text,
  add column if not exists phone text,
  add column if not exists website_url text,
  add column if not exists linkedin_url text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_contact_details_valid'
  ) then
    alter table public.profiles
      add constraint profiles_contact_details_valid check (
        (contact_email is null or (
          contact_email = btrim(contact_email)
          and length(contact_email) between 3 and 254
          and contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
        ))
        and (phone is null or (
          phone = btrim(phone)
          and length(phone) between 3 and 32
          and phone ~ '^[0-9+(). /-]+$'
        ))
        and (website_url is null or (
          website_url = btrim(website_url)
          and length(website_url) <= 2048
          and website_url ~ '^https://[^[:space:]]+$'
        ))
        and (linkedin_url is null or (
          linkedin_url = btrim(linkedin_url)
          and length(linkedin_url) <= 2048
          and linkedin_url ~ '^https://([[:alnum:]-]+\.)?linkedin\.com/[^[:space:]]+$'
        ))
      );
  end if;
end $$;

comment on column public.profiles.contact_email is 'Optional public contact email selected by the user for generated CVs.';
comment on column public.profiles.phone is 'Optional public telephone number selected by the user for generated CVs.';
comment on column public.profiles.website_url is 'Optional HTTPS portfolio or personal website selected by the user for generated CVs.';
comment on column public.profiles.linkedin_url is 'Optional HTTPS LinkedIn profile URL selected by the user for generated CVs.';
