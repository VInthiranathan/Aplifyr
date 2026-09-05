# Troubleshooting

## Backend Builds but Frontend Cannot Reach It

Check:

- backend is running on `http://localhost:5000`
- `BACKEND_URL` and `NEXT_PUBLIC_BACKEND_URL` in `frontend/.env.local` both point to the same backend URL

Note:

- the backend CORS policy can be configured through `CORS_ALLOWED_ORIGINS`

## "Supabase not configured"

This comes from frontend API routes or the Supabase browser client.

Set these in `frontend/.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Set these in `backend/.env` if you want Supabase-backed backend features:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Cover Letter Generation Fails Immediately

Cause:

- neither `GEMINI_API_KEY` nor `GROQ_API_KEY` is configured in `backend/.env`

Fix:

- add at least one provider key

## Jobs Page Loads but Results Are Empty

Check:

- Arbetsformedlingen API availability
- active filters, especially municipality and region combinations
- browser network requests to `/api/externaljobs`

Current limitation:

- the backend suppresses some exceptions while resolving municipality and job payload data, so certain bad responses can fail quietly

## CV Upload Fails

### "Only PDF files are supported"

- upload a `.pdf` file only

### "Could not extract text from the uploaded PDF"

- use a text-based PDF with selectable text

### Redirect to `/api/cv` fails

Check:

- the `cvs` bucket exists
- Storage policies are configured
- `profiles.cv_storage_path` contains a valid object path

## User Profile Changes Do Not Persist

Check:

- the user is authenticated
- the `profiles` table exists and migrations were applied
- `/api/profile` returns `200`

Known limitation:

- profile image upload is currently preview-only and does not persist to the backend

## Build Validation

Validated on May 28, 2026:

```powershell
Set-Location .\Aplifyr\backend
dotnet build

Set-Location ..\frontend
npm run build
```