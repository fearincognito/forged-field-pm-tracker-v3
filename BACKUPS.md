# Off-site database backups

Run **Actions → Backblaze database backup → Run workflow** for an on-demand copy. Automatic schedule: daily at **11:17 UTC** (03:17 PST / 04:17 PDT). GitHub may delay scheduled runs and can disable schedules on inactive public repositories; check Actions periodically.

The five credentials (including SUPABASE_SERVICE_ROLE_KEY) belong exclusively in repository Actions secrets. No credential belongs in frontend JavaScript or this document.

## Contents and verification

Each private, server-side-encrypted Backblaze archive includes:
- `database.dump`: PostgreSQL 17 custom dump of public, auth and storage schemas and data, without ownership/ACL restoration statements.
- `source.tar`: tracked source at the workflow commit.
- `manifest.json`: checksums, timestamp and declared coverage/limitations.

The workflow checks the dump table of contents, then downloads the completed B2 upload and compares SHA-256. This verifies archive readability and transfer integrity, not a complete restore.

**Uploaded Supabase Storage files are included.** All buckets are enumerated recursively, with a second inventory check to detect changes during the export. Embedded fleet-reference photo data in public tables is also included.

- `storage/manifest.json`: bucket configuration, original bucket/object paths, sizes and per-object SHA-256 hashes.
- `storage/objects/<hash>`: exact uploaded file bytes, mapped to original names by the Storage manifest.

For image recovery, verify each object checksum, then use the Supabase Storage API to upload the archived bytes to their recorded bucket/name. Recreate bucket settings as needed. Do not insert Storage metadata rows directly as a substitute for uploading actual objects. No automated production restore is performed.

Database and Storage copies are sequential, not one atomic snapshot. Avoid uploads/replacements during backup; detected changes fail the job for retry. First full successful run: November 5, 2026, run 42131363810; 15 files backed up, full archive 38,918,600 bytes, download checksum verified.

No pruning is configured; timestamped backups accumulate until a retention policy is explicitly set. Backups do not include managed infrastructure settings, database role passwords, Edge Function secrets, or full Git history.

## Restore preparation

Use a disposable compatible Supabase project first. Download the desired archive privately and extract it in a protected directory. Verify the database/source checksums against the manifest. PostgreSQL 17 `pg_restore --list database.dump` shows archived objects without changing any database.

A production restore requires a tested plan for managed auth/storage schemas, roles, extensions, foreign keys, triggers and application grants. Do not run a blanket restore against the live tracker. Never paste backup contents or connection strings into public GitHub logs/issues.

## Failure handling

An Actions failure is not a successful backup. Open the failed run for the safe error classification. Password changes require updating SUPABASE_DB_URL, with URL-reserved password characters percent-encoded. Use the Session pooler URL for IPv4-compatible GitHub runners. Private bucket and upload readback verification are required; failures stop the job.


## Verified restore rehearsal — November 5, 2026

**PASS:** [Actions run 42131998054](https://github.com/fearincognito/forged-field-pm-tracker-v3/actions/runs/42131998054).

Latest private Backblaze archive downloaded, components/checksums validated, database restored into disposable network-isolated PostgreSQL 17, and source plus all uploaded files recovered to temporary directories. Test receives only B2 credentials; live Supabase cannot be reached with production credentials.

Recovered 13 equipment, 2 sites, 4 profiles, 1 service record, 10 PM schedules and 15 uploaded files. 68 foreign keys restored; zero unvalidated constraints; 15 public tables with RLS and 46 policies. Anonymous and owner RLS checks passed. Storage database paths match recovered-file manifest exactly.

Re-run via **Actions → Backblaze restore rehearsal → Run workflow**. No recurring restore test is scheduled. Container and temporary backup copies are deleted afterward.

This validates data/source/file recovery. Hosted sign-in, managed Supabase configuration, SMTP, API redeployment, Storage API re-upload and production failover were not tested. The test recreates necessary local roles/extensions and adds local grants because ownership/ACL statements are intentionally excluded from the dump.


## Local application recovery verified — November 5, 2026 (Pacific)

**PASS:** [Actions run 42136725105](https://github.com/fearincognito/forged-field-pm-tracker-v3/actions/runs/42136725105).

A temporary self-hosted Auth/REST/Storage stack was started against the restored backup. All 15 image files were uploaded and downloaded through its Storage API and checksum-verified. Temporary owner/viewer accounts signed in; restored permission checks blocked viewer writes; owner service recording updated the equipment meter and estimate baseline. The recovered frontend was opened in Chrome for owner/viewer login, equipment viewing, viewer-control checks and PM working-day calculation.

Run again via **Actions → Local application recovery test → Run workflow**. The job receives only B2 credentials; local test accounts/tokens are generated at runtime and deleted with the containers. No separate cloud project is created. Only a recovered temporary copy of frontend configuration is changed.

Auth and Storage require their appropriate database search paths. The harness supplies these explicitly and reconstructs local roles/grants/extensions; the backup intentionally omits ownership and ACL restoration statements. Production recovery must apply equivalent platform setup before testing.

This is a functioning local application recovery smoke test, not exhaustive coverage or a hosted production switchover. Real email/SMS, external services, production keys/DNS and cloud provisioning remain outside its scope.
