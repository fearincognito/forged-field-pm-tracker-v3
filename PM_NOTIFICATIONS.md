# V3 PM notifications

Status (verified 2026-11-13): **email delivery is enabled; Supabase Cron now requests the daily check at 07:00 America/Regina (13:00 UTC)**. Its private dispatcher invokes the existing GitHub worker, preserving recipients, thresholds and delivery deduplication. The older GitHub schedule remains temporarily as a fallback until the first production morning run is verified.
The workflow job has a protective repository variable gate `PM_ALERTS_ENABLED=true`. Do not enable it until the secrets, public VAPID key, and sender are tested.

## Behavior

The existing PM thresholds are 50 hours (yellow), 20 hours (orange), and due/overdue (red). The scheduled worker is requested every day at 13:00 UTC, which is 07:00 Saskatchewan time (America/Regina, UTC-6 year-round). Supabase Cron triggers the worker directly to bypass GitHub cron-event delays; GitHub runner availability and email-provider delivery can still add latency. Qualifying emails are sent when the worker actually executes. It evaluates active PM schedules for non-archived equipment/sites and uses actual machine hours plus elapsed working days according to the site's rotation, matching the frontend estimate. Out-of-service equipment does not accumulate estimated hours.

Recipients: active Owner, Admin and Mechanic accounts with an Auth email. By default email alerts are enabled; each recipient can change email/push preferences in Dashboard → PM Notifications. Push is only sent to devices that the user explicitly registers. Viewer and Operator roles are not enrolled in these alerts.

A unique database index limits each channel/device, user, PM schedule, next-due-hour point and alert threshold to one successful alert. The sender reserves an event before sending and stores sent/failed status. Failed deliveries can retry; Resend receives an idempotency key derived from the stable event ID (provider retains keys for 24 hours). A crash after reservation may leave a pending event requiring operator reconciliation rather than automatically replaying it, intentionally preferring no duplicate over aggressive retries. Push provider acknowledgments do not guarantee phone display. When a service advances the schedule to a new due-hour point, that new cycle can alert again.

**The worker does not run from the user's browser.** Alerts do not depend on opening the tracker. There is no historical backfill; the first enabled run can alert on any currently due/overdue schedule once.

## Required administrator setup

1. Set up [Resend](https://resend.com/) and verify a domain authorized for sending from a company address. Create a sending-only API key. This is independent of Supabase Auth's existing login emails.
2. Create a single Web Push VAPID P-256 key pair securely. Keep its 32-byte raw/base64url **private** key out of the repository and chat. The matching base64url uncompressed **public** key is safe to display (normally 87 characters).
3. In GitHub repo → Settings → Secrets and variables → Actions → Secrets, store these values:
   - `RESEND_API_KEY` (secret)
   - `PM_EMAIL_FROM` (verified sender, e.g. `Forged PM <alerts@your-verified-domain>`)
   - `VAPID_PRIVATE_KEY` (base64url raw private key, secret)
   - `VAPID_SUBJECT` (contact mailto URI, e.g. `mailto:alerts@your-verified-domain`)
   - `SUPABASE_DB_URL` is already used by the V3 backup workflow; reuse its existing secret, do not copy it elsewhere.
4. Set the *matching public* VAPID key in Supabase SQL editor:
   `update public.pm_notification_config set vapid_public_key='<YOUR_PUBLIC_KEY>', updated_at=now() where singleton=true;`
   Do **not** insert the private key into this table.
5. On iPhone (iOS 16.4+): in Safari open the V3 site, Share → Add to Home Screen, then launch the installed icon, sign in → Dashboard → PM Notifications → Enable Notifications on This Device, and allow push. Desktop supported browsers can register directly. Each user's email settings should be confirmed.
6. After confirming that the Resend domain and keys are configured, create GitHub Actions **repository variable** `PM_ALERTS_ENABLED` with value `true` under Settings → Secrets and variables → Actions → Variables. The workflow remains skipped until this is enabled.
7. Actions → V3 PM service notifications → Run workflow. Check counts (never email addresses or keys) and confirm a legitimate qualifying PM warning on a registered account. Do not insert false service history or alter real equipment to test it.

File locations: `scripts/pm_notifications.py`, `.github/workflows/pm-notifications.yml`, `pm_notifications.js`, `pm-sw.js`, `manifest.webmanifest`, `tests/pm_notifications_test.py`.

Security: subscriptions and preferences are self-service via Supabase RLS; delivery logs are read-only for the authenticated recipient; only the server-side worker can send or create delivery rows. No VAPID private keys, Resend keys, database passwords or private push endpoints belong in client JavaScript or GitHub source.

## Current limitations

- Live catch-up run 42911146844 on November 10 sent six emails and three pushes with zero provider errors after the reservation fix (5895a78). Three emails were verified in the owner's work inbox. Other recipients' inbox arrival and individual phone display are not established by provider acceptance.
- Scheduled runs on November 11 and 12 succeeded. November 12 run 43314220640 checked 10 schedules and 2 recipients, sent 0 new alerts and reported 0 failures.
- The November 13 scheduler change preserves recipients, thresholds and deduplication. No test emails were sent. The first 07:00 production execution remains to be observed.
- GitHub runner queues, Supabase availability (including Free-plan inactivity pausing), and provider delivery remain dependencies; this is not a guaranteed inbox-delivery SLA.
- Push requires user permission, a supported installed app/browser and normal delivery by OS push services.
- Severe overdue status triggers once for the current due-hour point, not a daily repeat. Weekly overdue reminders can be added later if desired.
- This does not send alerts to operators or viewers.


## Private daily scheduler (2026-11-13)

- Supabase Cron job `pm-v3-daily-0700-saskatchewan`: `0 13 * * *` (server Cron timezone GMT), invokes `pm_scheduler_private.dispatch_pm(false)`.
- Synchronous `http` in a private schema replaces `pg_net`; the shared network queue extension was removed before any credential was used. App roles cannot use this schema or dispatcher; Vault reads are denied to anonymous/authenticated roles. The dispatcher is SECURITY INVOKER, with a fixed endpoint and bounded connect/request timeouts.
- The GitHub token is encrypted in Vault as `pm_v3_github_actions_token`. Scope: V3 repo only, Actions read/write plus mandatory metadata read. Expires **2026-12-13** and must be renewed before then. Never put the token in SQL source, cron text, logs or this repository.
- `pm_scheduler_private.dispatch_log` stores only timestamp, dry-run flag, HTTP status, run ID and sanitized SQLSTATE, not request headers or response bodies. RLS without policies is intentional default-deny defense in depth for this private log.
- Manual dispatch verification run `43495648926` succeeded: 10 schedules, 2 recipients, 0 would-deliver; delivery step skipped. Cron-fired verification started at `2026-11-13T19:50:00.104Z` and received HTTP200/run `43495884030`. Temporary verification job removed itself.
- Dry-run input is boolean `dry_run=true`; worker uses a READ ONLY transaction and skips reservations/sends. Provider secrets are not supplied to the dry-run step. Run the 11-test suite with `python tests/pm_notifications_test.py`.
- During handover the GitHub concurrency group serializes workers; the existing unique delivery key and atomic reservation skip already sent/pending alerts. After confirming the first morning production run, remove only the GitHub `schedule` stanza, retaining `workflow_dispatch`.
