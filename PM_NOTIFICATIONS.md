# V3 PM notifications

Status: **code deployed; delivery disabled until provider setup and device registration are completed**.
The workflow job has a protective repository variable gate `PM_ALERTS_ENABLED=true`. Do not enable it until the secrets, public VAPID key, and sender are tested.

## Behavior

The existing PM thresholds are 50 hours (yellow), 20 hours (orange), and due/overdue (red). The scheduled worker runs every day at 15:17 UTC (GitHub Actions schedules can be delayed). It evaluates active PM schedules for non-archived equipment/sites and uses actual machine hours plus elapsed working days according to the site's rotation, matching the frontend estimate. Out-of-service equipment does not accumulate estimated hours.

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

- The system has not yet sent a live email/push test until provider credentials and a device subscription are configured.
- A scheduled workflow run may be delayed by GitHub.
- Push requires user permission, a supported installed app/browser and normal delivery by OS push services.
- Severe overdue status triggers once for the current due-hour point, not a daily repeat. Weekly overdue reminders can be added later if desired.
- This does not send alerts to operators or viewers.
