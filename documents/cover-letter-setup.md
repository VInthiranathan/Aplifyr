# Cover Letter Setup

## What This Feature Depends On

Cover letter generation is handled by `backend/Controllers/CoverLettersController.cs` and invoked from `frontend/pages/jobs/[id].tsx`.

The feature needs:

- at least one AI provider key in `backend/.env`
- a reachable backend URL from the frontend
- optional but recommended Supabase profile data so the prompt can include the user's bio, roles, tech stack, and extracted CV text

## Required Backend Configuration

Set at least one of the following in `backend/.env`:

```env
GEMINI_API_KEY=your_gemini_api_key_here
GROQ_API_KEY=your_groq_api_key_here
```

Recommended:

- configure both keys so Gemini is used first and Groq can act as a fallback

If neither key is configured, `POST /api/coverletters/generate-all` returns a `400` response.

## Prompt Inputs Used by the App

The frontend sends:

- the selected job ad
- profile fields such as name, title, location, bio, tech stack, and roles
- `cv_text` when a readable PDF CV has already been uploaded

The backend then:

1. extracts job title, employer, description, and location from the request body
2. detects whether the job description is Swedish or English
3. builds a prompt using the job data plus profile and CV data
4. calls Gemini first when available
5. falls back to Groq if Gemini fails

## Local Test Flow

1. Start backend and frontend.
2. Sign in.
3. Save profile data on `/user`.
4. Upload a readable PDF CV if you want CV grounding.
5. Open any job detail page.
6. Click the cover letter generation action.

## Expected Backend Response

Successful responses are arrays and typically look like this:

```json
[
  {
    "title": "Junior Developer",
    "coverLetter": "...generated text...",
    "provider": "Gemini"
  }
]
```

If both providers fail, the response still returns an array entry, but with an error payload.

## Troubleshooting

### Neither AI key is configured

Symptom:

- the UI shows a backend error when trying to generate a cover letter

Fix:

- add `GEMINI_API_KEY` and or `GROQ_API_KEY` to `backend/.env`

### User profile does not affect the letter

Possible causes:

- the user is not signed in
- `/api/profile` is failing because Supabase is not configured
- no profile data has been saved yet
- no readable PDF has been uploaded, so `cv_text` is empty

### Generated letter is too generic

Current code risk:

- the backend has several silent `catch {}` blocks while extracting job fields, so malformed job payloads can reduce prompt quality without obvious logs

See `documents/app-review-2026-05-28.md` for the full review notes.