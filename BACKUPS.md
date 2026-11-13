# Off-site database backups

Run **Actions → Backblaze database backup → Run workflow** for an on-demand copy. Primary schedule: daily at **00:00 America/Regina (midnight Saskatchewan), 06:00 UTC year-round**, via the private Supabase dispatcher. The old GitHub 11:17 UTC schedule remains temporarily as a fallback until the first midnight production run is verified. GitHub runner availability can still delay execution; check Actions periodically.

The five credentials (including SUPABASE_SERVICE_ROLE_KEY) belong exclusively in repository Actions secrets. No credential belongs in frontend JavaScript or this document.

## Contents and verification

Each private, server-side-encrypted Backblaze archive includes:
- `database.dump`: PostgreSQL 17 custom dump of public, auth, storage and account_audit_private schemas and data, without ownership/ACL restoration statements.
- `source.tar`: tracked source at the workflow commit.
- `manifest.json`: checksums, timestamp and declared coverage/limitations.

The workflow checks the dump table of contents, then downloads the completed B2 upload and compares SHA-256. This verifies archive readability and transfer integrity, not a complete restore.

**Uploaded Supabase Storage files are included.** All buckets are enumerated recursively, with a second inventory check to detect changes during the export. Embedded fleet-reference photo data in public tables is also included.

- `storage/manifest.json`: bucket configuration, original bucket/object paths, sizes and per-object SHA-256 hashes.
- `storage/objects/<hash>`: exact uploaded file bytes, mapped to original names by the Storage manifest.

For image recovery, verify each object checksum, then use the Supabase Storage API to upload the archived bytes to their recorded bucket/name. Recreate bucket settings as needed. Do not insert Storage metadata rows directly as a substitute for uploading actual objects. No automated production restore is performed.

Database and Storage copies are sequential, not one atomic snapshot. Avoid uploads/replacements during backup; detected changes fail the job for retry. First full successful run: November 5, 2026, run 42131363810; 15 files backed up, full archive 38,918,600 bytes, download checksum verified.

Retention is configured as described below: all daily archives for 30 days and one monthly snapshot for 12 months. Backups do not include managed infrastructure settings, database role passwords, Edge Function secrets, or full Git history.

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


## Retention policy — configured November 5, 2026 (Pacific)

After each successful full-archive upload and download checksum check, the backup job writes a private verification marker. It then keeps:
- Every archive version uploaded within the previous 30 days, including the exact cutoff.
- One archive per UTC calendar month for the current month and previous 11 months. The newest verified archive in that month is selected; older unmarked archives are a fallback only where no verified monthly copy exists.
- The newly verified archive unconditionally.

Daily and monthly copies overlap; this does not create duplicate archives. As months pass, monthly snapshots advance to the latest verified copy from each month.

Only exact timestamp/run-shaped archive names under forged-pm/ and associated verification marker versions are eligible for cleanup. Other bucket objects and hide markers are untouched. Deletion uses exact file version IDs and never bypasses Object Lock. Listing is fully paginated. No pruning occurs after an unsuccessful export, upload, or verification; missing permissions or a missing new verification marker stop cleanup. Retention is in the workflow, not a bucket-wide lifecycle expiration rule.

Tests: tests/backup_retention_test.py covers 30-day cutoff, monthly/year boundaries, exact-version duplicates, verified-copy preference, protection of unrelated objects, and failure without current verification. Actions failure notifications were enabled by the owner.


## Private midnight scheduler — November 13, 2026

Supabase Cron job `pm-v3-backup-midnight-saskatchewan` invokes `pm_scheduler_private.dispatch_backup()` at `0 6 * * *` (Cron timezone GMT). It uses the existing encrypted Vault Actions credential for the V3 repository only, with a fixed workflow endpoint; no credential values are present in cron text, source, or logs. The shared credential expires December 13, 2026 and requires renewal before then.

The function is SECURITY INVOKER with fixed search_path and bounded synchronous HTTP timeouts. Anonymous, authenticated and service_role roles have no schema, function or log access. RLS without policies on the private log is intentional default deny. Logs contain only timestamps, HTTP status, run IDs and sanitized SQLSTATE. An advisory lock prevents concurrent dispatcher calls. The existing GitHub `backblaze-database-backup` concurrency group (cancel-in-progress false) serializes all backup/retention executions, including fallback invocations. The handover can produce extra sequential verified copies, never overlapping retention workers.

A one-shot Cron verification fired at 2026-11-13 20:00:00.054 UTC, received HTTP 200, and triggered [run 43497415874](https://github.com/fearincognito/forged-field-pm-tracker-v3/actions/runs/43497415874). Backup succeeded at 20:00:44 UTC: database/source plus 15 Storage files, full download checksum verified; 12 archive versions retained, none deleted. The one-shot job removed itself. First actual midnight occurrence remains to be observed. After verifying that run, remove only the old GitHub schedule stanza, retaining manual and push triggers.

This bypasses delayed GitHub cron events but is not a guaranteed completion SLA: Supabase availability, token validity, GitHub queues and Backblaze remain dependencies. The database dump covers public/auth/storage/account_audit_private, not private scheduler schemas or Vault; scheduler setup and secrets must be recreated during disaster recovery. No production records were changed by verification.

Latest isolated application recovery test also passed November 13, 2026, [attempt 2 of run 42136725105](https://github.com/fearincognito/forged-field-pm-tracker-v3/actions/runs/42136725105/attempts/2), including login, viewer write restrictions, service/meter checks, PM calculations and all 15 file readbacks. This remains a local drill, not a production cutover.


## Account audit backup coverage — November 13, 2026

The allowlisted `account_audit_private` schema is now included in the PostgreSQL dump and manifest, covering events, operation records, sequences, functions, triggers and table definitions/RLS. No Vault or private scheduler schema/credential was added. The archive TOC validation fails closed if either audit table's data section is missing. Older archives created before this change do not contain Account History; the recovery test now rejects those as current complete-audit recovery candidates.

[Backup 43501918626](https://github.com/fearincognito/forged-field-pm-tracker-v3/actions/runs/43501918626) succeeded with full download checksum verification. The existing production audit tables contained zero rows, as no historical events were fabricated. [Database restore 43502111581](https://github.com/fearincognito/forged-field-pm-tracker-v3/actions/runs/43502111581) and [application recovery 43502122836](https://github.com/fearincognito/forged-field-pm-tracker-v3/actions/runs/43502122836) passed. Within disposable PostgreSQL only, a synthetic operation/event pair was inserted, dumped with the same four-schema selection, restored into a second disposable database, and exact ordered row fingerprints/counts compared. RLS and private-schema access restrictions were checked. Synthetic data never reached production or Backblaze. The application test also passed login, viewer write denial, service/meter update, PM calculation and all 15 Storage API readbacks.

Syntax checks and four retention regression tests passed; retention and daily scheduling are unchanged. Application recovery now also triggers when the shared restore script changes. ACL/ownership remains intentionally excluded, so production recovery still requires restoring appropriate grants as documented.
