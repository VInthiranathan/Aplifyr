# Retiring legacy file storage

The app no longer uploads, reads or parses CV files. The upload and read API routes,
PDF dependencies, UI, translations and cover-letter inputs have been removed.
The generic backend upload action is also removed; its health endpoint remains.

Deployment order for an existing installation:

1. Deploy the frontend and backend together. Both profile reads and writes return an
   explicit list of supported fields, so legacy document data is not exposed even
   before the database upgrade. The backend ignores unrecognized profile inputs.
2. Apply migration `005_remove_cv_feature.sql` after migrations 001–004. It drops
   the three legacy profile columns, makes the old `cvs` bucket private and adds
   a restrictive policy denying anonymous/authenticated access to that bucket,
   including direct SDK uploads. Other buckets and career entries are unaffected.
3. In Supabase Storage, empty the retired `cvs` bucket and delete it, or use the
   Storage API with administrative credentials. Do not delete `storage.objects`
   rows through SQL: that does not remove the stored binaries. Previously issued
   signed links can remain valid until their expiry or object deletion.
4. Verify the profile overview and create/edit/delete in both career tabs with a
   signed-in account. Verify the retired application endpoints return 404.

No remote migration or deletion is performed by checking out this branch. Database
column removal and physical object cleanup are irreversible; an application rollback
alone cannot restore removed data. The numbered historical migrations are retained
for a consistent upgrade path and clean installations.
