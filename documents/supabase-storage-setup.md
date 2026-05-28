# Supabase Storage Setup

## Purpose

The app stores uploaded CVs in a private Supabase Storage bucket named `cvs`.

Uploaded files are handled by `frontend/pages/api/upload-cv.ts` and opened through `frontend/pages/api/cv.ts`.

## What the App Expects

- bucket name: `cvs`
- bucket visibility: private
- path format inside the bucket: `{user_id}/cv-{timestamp}.pdf`
- profile columns present in `public.profiles`:
  - `cv_storage_path`
  - `cv_text`

## Create the Bucket

1. Open your Supabase project dashboard.
2. Go to Storage.
3. Create a new bucket named `cvs`.
4. Keep the bucket private.

## Required Storage Policies

Run the following policies for `storage.objects`.

### Insert

```sql
CREATE POLICY "Users can upload their own CVs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'cvs' AND
  auth.uid()::text = (storage.foldername(name))[1]
);
```

### Select

```sql
CREATE POLICY "Users can read their own CVs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'cvs' AND
  auth.uid()::text = (storage.foldername(name))[1]
);
```

### Update

```sql
CREATE POLICY "Users can update their own CVs"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'cvs' AND
  auth.uid()::text = (storage.foldername(name))[1]
);
```

### Delete

```sql
CREATE POLICY "Users can delete their own CVs"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'cvs' AND
  auth.uid()::text = (storage.foldername(name))[1]
);
```

## File Constraints Enforced by the App

- PDF only
- maximum file size: 5 MB
- the PDF must contain extractable text

If the PDF contains only scanned images and no readable text layer, the upload route returns `cv_parse_failed`.

## Verification Checklist

1. Sign in.
2. Open `/user`.
3. Upload a text-based PDF CV.
4. Confirm the upload succeeds.
5. Confirm `profiles.cv_storage_path` and `profiles.cv_text` are populated.
6. Open `/api/cv` while signed in and confirm it redirects to a signed Supabase URL.

## Cleanup Behavior

When a new CV is uploaded, the app updates `profiles.cv_storage_path` and attempts to delete the previous file from the bucket.

## Common Failures

### Upload says "Supabase not configured"

Set these values in `frontend/.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Upload says "Only PDF files are supported"

Use a `.pdf` file only.

### Upload says text could not be extracted

Use a PDF with selectable text, not an image-only scan.