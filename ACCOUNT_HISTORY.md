# Account History

Activated November 13, 2026. Open Users & Access → Account History as an enabled Owner. Times are displayed in America/Regina (Saskatchewan). History begins at activation; previous events are not reconstructed.

## Coverage

Database triggers capture account creation/deletion and changes to full name, role, enabled state, and site assignments. Unchanged saves create no history. Access edits and their events are committed together, so an audit failure rolls back the edit. Direct browser profile and membership changes are blocked; normal changes use the guarded admin_update_user RPC.

The invite-user Edge Function records a trusted, verified caller through service-only begin/finalize/fail RPCs. It records requested, succeeded, and safe failure outcomes for invitations and manual Viewer accounts. Profile/site provisioning and success history are atomic. Auth/email provider operations are external and cannot join that transaction. A provider timeout can leave delivery uncertain; an audit service outage may leave a requested event without its final outcome. Such pending requests must be reconciled rather than automatically resent. The function does not include provider error text, passwords, tokens or links in history.

System/database/service changes without a verified caller are explicitly labelled System / administrator, not attributed to a guessed person. Account names, roles and site assignments are snapshots. Account deletion does not cascade-delete history.

## Protection

account_audit_private is unexposed and has no app/service-role direct schema or table access. Events are append-only for app users, including Owners. Owner-only owner_account_history provides bounded newest-first pagination. Trusted database functions can write events; database administrators can technically modify the data, so this is not immutable external storage.

No prior audit entries were fabricated. No real accounts or email recipients were used as test fixtures. This is account-access history, not comprehensive sign-in, password-change or suspicious-attempt monitoring. Existing public.audit_log remains separate.

## Tests

- `cd tests/security && npm ci --ignore-scripts && node admin_update_user.mjs && node account_audit.mjs`
- `node tests/invite_user_audit_test.cjs` (Node 24)
- `node --test tests/account_history.test.cjs` (root dependencies installed)

Database tests run in isolated PGlite/PostgreSQL with synthetic accounts. They reproduce the old inactive-role and direct-admin bypasses, verify rejection after correction, exercise permitted Owner/Admin flows, audit transaction failure, actor binding, private access, paging, idempotent provisioning and safe outcomes. Edge mocks send no actual email.

Do not rerun sql/account_history.sql on an already-migrated database. Applied as protected_owner_account_history in Supabase migration history.
