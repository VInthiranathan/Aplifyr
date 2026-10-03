# Retiring legacy file storage

This guide remains relevant only for installations with old uploaded CV/avatar objects. File uploads are disabled; current CV generation and local PDF export do not use that legacy storage.

The canonical cleanup procedure is now in [the operations runbook, section 10](gdpr-supabase-runbook.md#10-äldre-filstorage--endast-berörda-installationer). It covers inventory, separately approved Storage API deletion, signed links and backups. Removing profile columns does not prove binary objects were deleted. Physical cleanup has not been verified in this documentation review.

This entry point is retained because historical migration 005 references it. Do not replay that migration or delete a bucket merely because this document exists.
