# Forged Field PM Tracker V3 — Project Handoff

_Last updated: 2026-11-05 (America/Los_Angeles)_Angeles)_

This is the living continuity document for Forged Field PM Tracker V3. Read it first when returning to the project after a break or when a new ChatGPT session needs to continue development.

## 1. Project purpose

Forged Field PM Tracker V3 is a field-maintenance web app for drilling operations. The workflow is built around how mechanics actually work in the field:

Company Dashboard → Job Sites → Equipment / Site Items → PM / Service / Work Tickets / Inventory / GPS / History / Access Controls.

The owner describes the desired workflow and tests the live site. ChatGPT handles GitHub/Supabase implementation directly whenever possible. Do not ask the owner to edit code manually.

## 2. Critical rule: V2 stays untouched

- V3 repo: `fearincognito/forged-field-pm-tracker-v3`
- V3 live site: `https://fearincognito.github.io/forged-field-pm-tracker-v3/`
- V2 repo: `fearincognito/-field-pm-tracker`
- V2 live site: `https://fearincognito.github.io/-field-pm-tracker/`

Never modify V2.

## 3. Architecture and security

- Frontend: static HTML/CSS/JavaScript on GitHub Pages.
- Backend/auth/storage: Supabase.
- Supabase project ID: `eaehrhqsqmlcjcuzeyoh`
- Region: `us-west-2`
- URL: `https://eaehrhqsqmlcjcuzeyoh.supabase.co`
- Browser uses a public Supabase publishable key protected by RLS.

Never place service-role keys, database passwords, user passwords, generated demo credentials, private API keys, auth tokens, or personal phone numbers in this file or the repo.

The frontend is modular. Several files wrap globals such as `renderDashboard`, `openSite`, and `openEquipment`. Preserve wrapper chains and script order.

### Development rule

Always fetch the current GitHub version of any file immediately before updating it. Do not rely on old SHAs from this document or a prior chat.

## 4. UX / working style

Keep the app practical and field-friendly:

- mobile-first
- simple, mechanic-friendly wording
- obvious Back / Cancel controls
- large touch targets
- minimal clutter
- hide empty equipment details while keeping fields in edit forms
- direct changes in GitHub/Supabase, then simple user testing
- typical test flow: refresh → open feature → worked / did not work

Primary test environments are desktop Firefox and iPhone.

## 5. Main site/equipment workflow

### Job Sites

Sites support:

- location / access notes
- saved GPS and navigation
- rotation types 14/7, 20/10, custom
- rotation anchor date
- company/customer logo
- live Drilling / Shut Down rotation strip
- equipment
- site items
- inventory
- pack lists
- work tickets

### Site Items

Supported categories include supply trailer, bathroom, laydown, connex/sea can, fuel tank, water tank, storage, and other.

Supply Trailer 1 detail/edit/GPS/navigation/ticket flow was previously confirmed working.

### Equipment

Equipment can contain:

- owned / rental
- unit number / name
- year
- make / model
- equipment serial
- engine serial
- VIN
- status
- current hours
- expected operating hours/day
- oil type
- oil capacity + unit
- filters/service parts
- notes
- GPS
- photo

Equipment can move between sites and can be archived/restored rather than hard-deleted.

## 6. Roles and permissions

Roles:

- Owner
- Admin
- Mechanic
- Operator
- Viewer

Owner/Admin: account management plus broad operational access. Owner has extra destructive actions such as service-history deletion.

Mechanic: operational access across sites, including equipment/site maintenance, filters, site items, inventory, PM/service, work tickets, moves, archive/restore, and site edits. No Users & Access administration.

Operator: assigned-site access, read operational information, create/update work tickets, and update **current machine hours only** on assigned sites. Operators cannot edit the rest of the equipment record or move hours backward.

Viewer: assigned-site read-only.

UI account status wording is **Enabled / Disabled**; underlying DB field remains `active`.

## 7. Supabase high-level model

Important tables:

- profiles
- sites
- site_members
- equipment
- site_items
- equipment_filters
- pm_schedules
- service_history
- site_inventory
- work_tickets
- work_ticket_updates
- audit_log

Important helpers:

- `set_updated_at`
- `handle_new_user`
- `current_user_role`
- `is_admin`
- `can_access_site`
- `is_mechanic_or_above`
- `can_work_at_site`

Important enums include app_role, equipment_status, ownership_type, site_item_type, ticket_status, ticket_priority, and audit_action.

RLS is enabled. Preserve backend enforcement; never rely only on hiding UI buttons.

## 8. PM model

PM is hour-meter based; the meter is authoritative.

Threshold convention:

- within 50 hours = yellow
- within 20 hours = orange
- due/overdue = red

Late service advances from the scheduled due point rather than drifting from the late completion hour.

Expected hours/day combines with site rotation to estimate calendar due date. Decimal values such as 0.5 / 1.5 are supported but still need clean verification.

## 9. Work Tickets

Tickets can attach to equipment or site items.

Statuses: Open / In Progress / Completed / Cancelled.

Priorities: Normal / Urgent / Equipment Down.

Completed equipment hours prefill from current machine hours but remain editable. Completing a ticket does **not** automatically change equipment current hours.

## 10. Site inventory and pack lists

Inventory tracks Required / On Site / Bring.

Pack lists can be generated for selected equipment only. All equipment starts checked, with Select All / Clear All. Duplicate part numbers aggregate quantities and show which machines use each part.

Service recording also has a workflow to select filters used from site inventory and deduct them automatically. This still needs careful real-world testing with an intentional service record.

## 11. Photos and logos

### Equipment photos

Private bucket: `equipment-photos`.

Features:

- upload / replace / remove
- client image compression
- detail photo
- site/company equipment thumbnails
- click for larger view
- compact Retake / Replace / Remove controls

Remaining edge case: iPhone HEIC/canvas behavior should still be tested.

### Site logos

Public bucket: `site-logos`.

Features:

- upload in Add/Edit Site
- replace/remove
- logo on site cards
- centered in desktop open space
- stacked on mobile

## 12. Mechanics Schedule

Dashboard Mechanics Schedule currently contains October and November 2026 data entered from user screenshots.

Features:

- desktop calendar/table
- mobile mechanic cards
- month switching
- current-day highlight
- Mechanics On Today section
- only `Days` counts as on-duty; FI / FO / OFF do not
- Call / SMS / FaceTime Audio actions

Do not copy mechanic phone numbers into this handoff.

## 13. Live site rotation strip

File: `site_rotation_strip.js`

Current behavior:

- appears beside Rotation on open site
- green = Drilling
- red = Shut Down
- month/year top-left
- Today status top-right
- compact colored daily segments
- no weekday/date labels
- current day outlined
- full month compresses to fit phone width with no page-level horizontal scrolling
- updates when browser date changes

Recent relevant commits:

- `de0655a2483a72ae74eae6f8cb9f1c125b9fe9e9` — compact strip / renamed statuses
- `0684f0de9eef9d3bbad0f6ab60255ed8e9153e78` — fit strip to phone screen

Owner confirmed phone layout works.

## 14. Dashboard Job Sites map

File: `dashboard_sites_map.js`

Dashboard contains a full-width map of active sites with saved GPS coordinates.

Behavior:

- auto-fits active site pins
- green pin = Drilling
- red pin = Shut Down
- blue pin = no rotation
- hover labels point inward near map edges
- pin popup includes site name/status, Open Site, and Google Maps
- reduced mobile height
- selected base layer remembered in localStorage

Selectable layers:

- Street — OpenStreetMap
- Satellite — Esri World Imagery
- Terrain — topo/terrain layer

Recent commits:

- `3e75faa92c2d43c9a9f1b135c4836d4c21ae574b` — add dashboard sites map
- `ca8706a087c390fffae3cd90dfd4009500dbe5d2` — inward hover labels
- `e3e8850ba734ae5227587d47ab59811d934aef13` — satellite layer
- `2b7e264e56030b9c2d22a07725a72eeb80bbc458` — terrain layer

## 15. Login / password recovery

### Show / Hide password

File: `password_toggle.js`.

Login password now has a Show / Hide control.

Recent commits:

- `cb4f2b003a6e5b2834bd191a97c5d36e96d6caa3` — add show/hide control
- `026152be9f9bbb6dd15b7ba419b7ed7e859db230` — load control

### Forgot password

File: `password_reset.js`.

Supabase recovery flow exists with new-password confirmation and minimum-length validation. Previous test hit an email rate limit; clean end-to-end retest remains desirable.

## 16. Manual Viewer demo workflow

Owner-only workflow can create a manual/shared Viewer login without email invitation.

Rules:

- Viewer only
- selected current sites only
- credentials returned once
- never copy passwords into this handoff
- disable shared account after demo when appropriate

Initial backend permission failure was fixed. Later retry produced credentials, but actual login/read-only behavior still needs confirmation.

## 17. Important frontend modules

Key current files include:

- `app.js`
- `pm.js`
- `equipment_edit.js`
- `equipment_usage.js`
- `gps_nav.js`
- `site_edit.js`
- `site_logos.js`
- `site_inventory.js`
- `service_inventory_usage.js`
- `work_tickets.js`
- `ticket_hours_prefill.js`
- `cloud_status.js`
- `site_items.js`
- `dashboard_tickets.js`
- `dashboard_service_history.js`
- `dashboard_equipment.js`
- `mechanics_schedule.js`
- `equipment_lifecycle.js`
- `users_permissions.js`
- `account_status_labels.js`
- `mechanic_role_ui.js`
- `maintainer_delete_actions.js`
- `form_navigation.js`
- `filter_actions.js`
- `equipment_photos.js`
- `equipment_photo_layout.js`
- `equipment_list_photo_layout.js`
- `oil_capacity_units.js`
- `equipment_year.js`
- `service_history_delete.js`
- `equipment_action_buttons.js`
- `operator_hours.js`
- `equipment_hide_empty_fields.js`
- `site_rotation_strip.js`
- `dashboard_sites_map.js`
- `password_reset.js`
- `password_toggle.js`
- `invite_setup.js`

Always fetch the current version before modifying any of them.

## 18. Confirmed working / historical tests

Confirmed historically:

- Company Equipment fuzzy search
- equipment archive / restore
- Supply Trailer 1 detail/edit/GPS/navigation/tickets
- PM thresholds and late-service schedule behavior
- 14/7, 20/10, and custom rotation calculations
- phone rotation strip fits without page horizontal scrolling
- site logo positioning adjusted successfully after screenshot feedback

## 19. Current testing priority

Do not assume these are complete until verified:

1. Dashboard map Street / Satellite / Terrain on desktop and phone.
2. Login Show / Hide password control.
3. Mechanics Schedule SMS + FaceTime Audio on iPhone.
4. Manual Viewer login + read-only site access.
5. Service inventory deduction with intentional service.
6. Operator Update Hours using Operator login.
7. Equipment photos, especially iPhone HEIC.
8. Saved GPS mini-map preview.
9. Custom decimal expected operation.
10. Owner service-history delete / PM rollback.
11. Oil capacity units.
12. Password recovery end-to-end.
13. Mechanic permissions in separate/incognito login.
14. Inter-site equipment move.
15. Filter edit/delete duplicate-edge case.

Do not run destructive tests against real records unless clearly intended.

## 20. Future ideas discussed

Possible later work:

- work-ticket assignment
- ticket reopen / edit priority / edit title
- in-app / email / push notifications
- richer site-status visualization
- more mechanics schedule months
- continued mobile refinements

Do not implement speculative features until requested.

## 21. Recent project commits at this checkpoint

Useful recent anchors:

- `026152be9f9bbb6dd15b7ba419b7ed7e859db230` — load login password show/hide
- `cb4f2b003a6e5b2834bd191a97c5d36e96d6caa3` — add login password show/hide
- `2b7e264e56030b9c2d22a07725a72eeb80bbc458` — terrain map layer
- `e3e8850ba734ae5227587d47ab59811d934aef13` — satellite map layer
- `ca8706a087c390fffae3cd90dfd4009500dbe5d2` — inward map labels
- `29dea8cc029157926fd9d79c11ce5709ff780135` — load dashboard sites map
- `0684f0de9eef9d3bbad0f6ab60255ed8e9153e78` — phone rotation strip fit
- `de0655a2483a72ae74eae6f8cb9f1c125b9fe9e9` — compact rotation strip
- `07ea9dadc6f57a0923037a94399ad236d32f0b1c` — SMS / FaceTime Audio

Commit IDs are historical anchors only. Inspect the current default branch before coding.

## 22. How to resume later

Best restart instruction:

> Open `PROJECT_HANDOFF.md` in `fearincognito/forged-field-pm-tracker-v3`, inspect the current GitHub files, and continue the V3 build from there. Do not touch V2.

Then:

1. Read this handoff.
2. Fetch current `index.html` to confirm script order.
3. Fetch any file immediately before editing it.
4. Inspect recent commits if this handoff is old.
5. Preserve Supabase RLS and backend role enforcement.
6. Make changes directly.
7. Give the owner simple refresh/test instructions.
8. Keep this handoff current.

## 23. Hourly handoff auto-save

An hourly ChatGPT Automation named **V3 Handoff Autosave** is enabled as a safety net for this project.

Every hour it should:

- check `fearincognito/forged-field-pm-tracker-v3` for meaningful V3 changes since the last handoff checkpoint
- read the current `PROJECT_HANDOFF.md`, recent commits, and relevant changed files
- update this handoff only when meaningful project state changed
- refresh the last-updated timestamp when it writes
- preserve useful existing history
- update completed/tested items, unresolved checks, important module references, and useful recent commit anchors
- make no commit when nothing meaningful changed
- never touch V2
- never add passwords, credentials, secrets, auth tokens, or personal phone numbers
- report only if the automated save itself fails

This automation is a **repo-level safety net**, not a perfect transcript recorder. It can reliably capture changes that reach GitHub. Design decisions discussed in chat but not yet reflected in code may not be visible to the hourly check, so the live development conversation should still update this file after major decisions or meaningful milestones.

If the automation is ever paused or removed, resume manual handoff updates until it is re-enabled.

## 24. Continuity and backup

Best continuity setup:

- keep the original ChatGPT project conversation
- keep this handoff in the V3 repo
- let the hourly autosave maintain repo-level checkpoints
- optionally export ChatGPT account data for an offline conversation backup

The handoff preserves technical state. The original conversation preserves screenshots, design discussion, wording preferences, and the context behind UI decisions.

## 25. Fleet reference selector (2026-10-08)

Add Equipment now includes a searchable **Select from Fleet Reference** list plus **Add Manually / Clear Selection**. Search covers unit, description, make and model. Selecting a source record fills available unit/name/make/model/year/VIN/equipment serial/engine serial/notes and loads its screenshot photo into the existing private photo workflow. Current hours stay blank for the mechanic to enter; historical source hours appear separately. GPS, ownership/status and operating assumptions remain reviewable.

- Source catalog: 277 cbcstaff.ca equipment records, A01 through YT07; 198 exact screenshot photos and 79 records without equipment photos.
- Private tables: `fleet_reference` (immutable source JSON excluding photos) and `fleet_reference_photos` (exact original photo JSON, fetched only on selection). No source data/photos are published in GitHub.
- DDL migration: `add_fleet_reference_catalog`; schema reference in `sql/fleet_reference.sql`.
- RLS: active owner/admin/mechanic can read the whole catalog; other active users can read references linked to equipment accessible through existing equipment RLS. Anonymous users have no catalog access. Clients cannot modify source snapshots.
- `equipment.fleet_reference_id` links to the source record, with a unique index preventing concurrent duplicate imports of the same reference.
- Recognizable unit numbers from descriptions take precedence over legacy source unit fields (for example A803 → A581). Duplicate display units remain separate source records, labelled with source record ID.
- Confirmed existing matches R411 (source 576) and TSU411 (source 283) were linked only. No meters, names, manufacturer, notes, photos or site assignments were overwritten. Operational equipment count remains five.
- Existing confirmed matches open the current equipment record. Same-unit records with different/uncertain identifiers require checking the existing machine and explicitly acknowledging a different machine before saving.
- Saving a new selection inserts equipment only when the mechanic saves it to the chosen site. Year and oil-capacity unit are included in that insert. The selected photo is copied into `equipment-photos` using the normal equipment photo upload helper.
- Original fleet details and notes remain available in a collapsed panel on linked equipment. If a photo upload failed and no primary photo exists, **Use Original Fleet Photo** retries from the preserved snapshot.
- Parsed filters/components from the R602 source snapshot are preserved as reference data; this release does not infer PM intervals or automatically convert free-text parts notes into operational filters/inventory.

Modules: `fleet_reference.js` loads last, preserving all existing wrappers. `equipment_photos.js` exposes a small `equipmentPhotoWorkflow` API for pending preview and upload reuse.

Verification completed: database comparison of all 277 source JSON records and 198 photo base64 hashes (zero mismatches); mechanic/viewer/anonymous permissions; rollback-only unique-source insert check; existing equipment meters/sites/photos preserved. DOM integration tests load the complete production script order and exercise R602 autofill/photo save, source-hours separation, TSU411 existing match, renumbering, duplicate identifiers, ambiguous matches, failed photo loading, manual reset, and original-detail rendering. Browser visual/iPhone verification remains for the owner: refresh → Nev Gold → Add Equipment → search R602 → select → review.

Test command (Node 24.15+): `npm ci` then `npm run test:fleet -- /absolute/path/to/Forged-equipment-reference-COMPLETE-A01-YT07.json`. The private collected file remains separate from the repository. Frontend has no new runtime dependencies.


## 26. Discard equipment added by mistake (2026-10-08)

Equipment detail now has **Remove Added by Mistake** for Owner/Admin/Mechanic. One confirmation identifies the unit and explains permanent removal of entered hours, notes, setup, filters/PM schedules and the copied primary photo. The private immutable fleet reference remains unchanged, and deleting the operational link allows selecting that fleet record afresh. Unsaved additions can still be cancelled normally.

Equipment with service history or any work ticket has a disabled removal button and guidance to Move/Archive. Backend `service_history` and `work_tickets` equipment foreign keys now use ON DELETE RESTRICT, preventing history loss including concurrent additions. Existing filter/PM schedule cascades remove setup records on an eligible deletion. DELETE RLS requires an active maintainer and accessible site; operator/viewer cannot delete equipment.

Module: `equipment_mistake_removal.js`, loaded after fleet reference. Schema reference: `sql/equipment_mistake_removal.sql`; applied migration: `equipment_mistake_removal`. After DB deletion the private primary photo is removed using the Storage API. Failed photo cleanup presents **Retry Photo Cleanup** without recreating the equipment or keeping entered DB values. No equipment is automatically deleted by deployment.

Verified: DOM confirmation cancellation, removal and return to site, source retention, ticket protection, operator visibility; rollback-only database cascade cleanup, service-history protection, mechanic delete permissions; security advisor showed no new removal-related warning. Existing live equipment remains intact. Owner test: open accidentally added equipment → Remove Added by Mistake → confirm → select the same fleet unit again and check that only source details prefill.


## 27. Delete a mistaken PM schedule (2026-10-08)

Each active PM schedule card now offers **Delete PM Schedule** to Owner/Admin/Mechanic. Confirmation names the schedule and explains that its interval/due-hour setup is removed while completed service history and current equipment hours are retained. Successful deletion refreshes the equipment page and due calculations.

`pm.js` renders/wires the action. `sql/pm_schedule_delete.sql` records migration `pm_schedule_mistake_delete`: DELETE RLS matches existing maintenance access through `can_work_at_site`. Operator/Viewer do not get the action or backend deletion permission. The existing service-history FK uses ON DELETE SET NULL, preserving all completed service fields if their schedule is removed. No live schedule was deleted by implementation or verification.

Verified: rollback-only mechanic delete with linked completed service (retained with null schedule link) and unchanged equipment hours; DOM delete/cancel/role checks alongside fleet/removal regression suite. Owner test: refresh → open equipment → find the incorrect schedule → Delete PM Schedule → confirm.


## 28. One-stock backup rule for pack lists (2026-10-08)

All existing pack-list modes (selected equipment and full site) share the builder in `site_inventory.js`. After consolidating site inventory by part number, a part with exactly **1 On Site** now has **Bring at least 1** for a backup. Bring remains the larger of the actual shortage and this one-unit minimum. Example: Required 1 / On Site 1 → Bring 1; Required 3 / On Site 1 → Bring 2. With zero or two-plus on site, existing shortage calculation remains unchanged. Inventory quantities are not modified by generating a pack list.

Affected rows show **Bring at least 1 backup — only 1 on site** and the pack-list explanation describes the rule. `npm run test:pack` checks selected/full-site modes, one-stock backup, shortages, sufficient stock, and consolidated duplicate inventory rows using the actual rendered pack-list workflow.


## 29. Calendar contrast and admin service reports (2026-10-10)

FI uses pale blue with dark navy text; FO uses dark navy with white text. Explicit strong/small selectors override the grid-wide small-text colour on mobile calendar cards, fixing blended labels. Desktop and mobile share these status styles.

New module `service_reports.js` loads last and adds an Owner/Admin-only **Service Reports** dashboard button. Choose inclusive start/end dates, This Year or Last Year, then Generate Report. Report includes fleet summary and every individual completed service grouped by equipment, meter/scheduled due hours, completion name, parts and notes. Includes archived equipment. Current site assignments are explicitly labelled (history does not snapshot the service site). Read-only paginated queries use existing RLS; no database schema or permissions changed. PDF uses a separate professional print layout and browser Save as PDF; CSV exports all detailed rows, with formula-injection escaping. Date changes invalidate old previews/exports; async results are discarded after navigation or date changes. Reports load the entire range, without the history dashboard's 250-record limit.

Verified schema and existing SELECT RLS; live service_history was empty at implementation. `npm run test:reports` checks admin/viewer guards, inclusive year dates, pagination across 501 records, archived equipment, escaped content, and invalidated exports. `npm run test:pack` confirms the already-published one-stock backup rule. Visual browser/iPhone and print-dialog checks remain for owner. Refresh → Service Reports → dates → Generate → Print / Save as PDF. No live operational records were changed.


## 30. Rental Companies admin directory (2026-10-10)

New Owner/Admin dashboard button **Rental Companies** opens a searchable shared contact directory. Add/Edit Company fields: company name (required), salesperson name/phone/email, parts/service phone/email, optional notes. Phone and email links open the device dialler/mail app. Cancel returns to the directory; deleting requires confirmation. Failed requests retain entered values; save/delete use returned IDs to detect denied or missing writes.

`rental_companies.js` loads last. Migration `rental_companies_admin_directory` creates `public.rental_companies` with updated-at trigger and SELECT/INSERT/UPDATE/DELETE RLS restricted to active Owner/Admin through existing `is_admin()`. Anonymous access revoked. Mechanic/operator/viewer cannot read or modify the directory. No existing equipment/service data changed.

Verification: DOM tests for admin visibility, add/edit/save/cancel, search, escaping, phone links and viewer guard; rollback-only backend write/access test; schema/RLS checks. Owner visual check: refresh → Rental Companies → Add Company → save → edit. Test: `npm run test:rentals`.


## 31. Equipment rental company selector (2026-10-10)

Add Equipment now reveals a Rental Company dropdown when Rental ownership is selected. Shared helper `equipment_rental_company.js` supports manual addition, fleet-reference addition and existing equipment edits. Saved FK `equipment.rental_company_id` persists selection; Owned saves null. Optional selection supports existing rentals and empty directories. Existing links are retained if option loading fails.

Migration `equipment_rental_company_link`: nullable company FK with ON DELETE SET NULL; no existing records changed. `rental_company_options()` is a narrowly scoped read-only SECURITY DEFINER lookup returning only company IDs/names for active owner/admin/mechanic via existing `is_mechanic_or_above()`, with empty search_path and no PUBLIC/anon execute grant. Contact directory remains Owner/Admin-only. No write permissions expanded.

Test: `node tests/equipment_rental_company.test.cjs` verifies conditional visibility, saved selection and owned clearing. Owner check: refresh → Add Equipment → Rental → choose company → save; Edit Equipment should retain that selection.


## 32. Rental contact information on equipment (2026-10-10)

Selecting a rental company in Add/Edit Equipment shows its salesperson, sales phone/email, parts/service phone/email and notes beneath the selector. Saved rental equipment also displays this contact panel under the ownership/status strip. Tappable links support dialling/email composition. Company changes refresh contacts; Owned/blank selections clear/hide them. Request tokens and DOM connection checks prevent stale company information after rapid changes/navigation.

Migration `rental_company_contact_details` supplies a read-only ID-scoped lookup: active maintainers may view selected-company contacts; other users may view only companies linked to rental equipment at an accessible site. Directory editing stays Owner/Admin-only. Function has empty search_path, explicit qualified references and no PUBLIC/anon EXECUTE. No operational records changed. Selector DOM tests cover rendered contacts, links and escaped notes; backend authorization checked with rollback-only temporary contact.


## 33. Edit PM schedules (2026-10-11)

Active schedule cards offer **Edit PM Schedule** for Owner/Admin/Mechanic. Prefilled form edits service name/description/interval/last service hours/next due hours. Next due is preserved on ordinary edits; optional Calculate Next Due explicitly sets last+interval. Cancel/Back return to equipment. Saving updates only the schedule, retaining completed history, machine hours and creation metadata. Existing maintenance UPDATE RLS retained. Optimistic filters on original interval/last/next detect concurrent service advancement and prevent stale due-hour overwrite. Zero/negative invalid interval and negative hour values rejected. Returned ID required to confirm success.

Test `node tests/pm_edit.test.cjs`: prefill, preserved due point, schedule-only update, explicit calculation, cancellation and viewer guard. Syntax check passed. Browser visual check remains: refresh → equipment → PM → Edit PM Schedule → Save Changes.


## 34. Rotation-based automatic runtime estimates (2026-10-11)

PM counters and company equipment PM badges now use estimated accumulated hours, calculated from actual `current_hours`, new `hours_recorded_at`, runtime/day and site rotation. Daily estimate credits elapsed calendar days (not the current partial day), skips rotation shutdown days, and uses America/Los_Angeles calendar days for consistent DST/viewer-timezone arithmetic. Due date uses the same estimated baseline and future working days. Actual meter is never automatically overwritten; detail labels estimated meter/remaining separately and shows the actual entered reading/date.

Migration `equipment_hours_estimate_baseline` stamps all existing readings at deployment time to avoid invented historical accumulation. Trigger refreshes timestamp on every INSERT or UPDATE OF current_hours, including operator RPC and same-reading quick submissions. Full equipment edits omit unchanged hours so unrelated edits do not reset estimates. Missing runtime/rotation anchor falls back to actual hours. Out-of-service/archived records use actual hours without accumulating. Calculation is evaluated when equipment screens load; refresh/reopen to update on a new day. Historical unscheduled stoppages and past rotation/runtime changes are not logged by this model.

Tests `node tests/pm_estimate.test.cjs`: workday accumulation, shutdown pause, manual reset, decimal runtime, missing anchor, consistent due date. PM edit regression passed; rollback-only YT07 check confirms meter timestamp reset without changing saved readings. All current readings remain unchanged.


## 35. Record Service updates equipment meter (2026-10-16)

Migration `service_updates_equipment_hours` adds an AFTER INSERT trigger on service_history. A service reading at or above the saved meter updates equipment.current_hours and updated_by atomically with service/inventory/PM recording. Existing hours-stamp trigger restarts automatic runtime estimates. Lower historical readings are retained in service history without rewinding the equipment meter. No existing service records or meters were backfilled. Trigger function is SECURITY INVOKER, empty search_path, qualified objects and no PUBLIC/anon execute; existing service permissions unchanged.

Production Record Service form explains the behaviour. Verified via rollback-only authenticated owner RPC calls: greater reading updates meter/timestamp; older lower reading leaves meter unchanged. Syntax check passed. No test service persisted. User check: refresh → Record Service → enter hours → Save → equipment meter matches (unless higher hours are already saved).


## 36. Daily off-site database backups (2026-11-05)

Workflow `.github/workflows/backblaze-backup.yml` runs daily at 11:17 UTC, manually via Actions, and on backup-script/workflow pushes. Secrets are configured in GitHub Actions only: SUPABASE_DB_URL, B2_APPLICATION_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET_NAME. Never read, print, or store their values in source.

`scripts/backup_to_b2.py` exports public/auth/storage schemas in PostgreSQL 17 custom format, validates archive table-of-contents for equipment data, bundles a tracked-source snapshot and checksum manifest, uploads to a verified private Backblaze bucket using SSE-B2, downloads the uploaded archive and verifies SHA-256. Temporary files are removed when the runner exits; no database backups are published as GitHub artifacts or repository files. Credentials are parsed into libpq environment variables and passed to Docker by variable name only, not command arguments. Sensitive exception details are suppressed.

First successful end-to-end run: 42130524908, November 5, 2026; 29,833,515-byte database/source archive uploaded and full download checksum verified. Earlier connection-variable error was corrected. Live database records were not modified.

Coverage: application data/schema/functions/RLS in public; auth tables; Storage metadata; source files. IMPORTANT: uploaded Storage photo/logo file bytes are not yet copied. Fleet-reference photos embedded in public-table data are included. Full restore rehearsal remains outstanding; managed Supabase roles/extensions/configuration require a compatible target and careful restore procedure. GitHub source is a snapshot, not full git history. Backups use unique timestamp/run names, no automatic deletion or retention pruning.

Next step for complete image-file coverage: configure a server-side Supabase Storage credential securely, then add read-only Storage object export and test it. Do not tell the owner that uploaded images are already protected. Owner informed database/source backup succeeded and image backup remains separate.


## 37. Uploaded photo/logo backup completed (2026-11-05)

Supersedes the Storage-byte limitation in section 36. SUPABASE_SERVICE_ROLE_KEY is configured only in GitHub Actions secrets and passed only to the backup job. The backup enumerates all Supabase Storage buckets recursively with pagination, downloads object bytes to safe hashed filenames, and preserves bucket configuration, original object names, byte counts and SHA-256 hashes in storage/manifest.json. Both expected photo/logo buckets must be present; failures do not silently produce a partial-success backup.

Bucket/object inventory is compared before and after export to detect concurrent modifications. Database and Storage copies remain sequential rather than a transactionally atomic snapshot; full disaster-recovery restore rehearsal is still outstanding. Object contents are never uploaded to GitHub or logged. Bundle remains in a private SSE-B2 encrypted bucket, checked by full readback SHA-256.

Verified live workflow run 42131363810: SUCCESS; 15 uploaded Storage files, 9,083,813 source bytes; full database/source/Storage archive 38,918,600 bytes uploaded to Backblaze and download checksum verified. Daily schedule remains 11:17 UTC. No live source files or database records were modified. Bounded local test verified safe mapping of unusual nested object names, exact bytes and per-object checksum.


## 38. Successful isolated restore rehearsal (2026-11-05)

Workflow `.github/workflows/backblaze-restore-test.yml` and `scripts/restore_backup_test.py` download the latest archive from private Backblaze. The workflow has only B2 secrets: no Supabase database URL or service key, so it cannot connect to the live backend. It restores the dump into a disposable PostgreSQL 17 container with no network and no published ports; temporary data/container are deleted afterward.

Verification: downloaded archive SHA-1 matches B2; component SHA-256 hashes match manifest; Storage files are copied to original bucket/name paths and each file checksum checked; source is safely extracted and index.html/app.js present. Database is restored with pg_restore --exit-on-error, retaining all archived constraints/functions/policies. Standard Supabase role names and uuid-ossp/pgcrypto extension dependencies are provisioned in the isolated target. Backup omits ACL/ownership, so test grants are added locally to exercise preserved RLS: anonymous cannot read equipment; active owner can.

Run 42131998054 PASSED. Restored counts: equipment 13; sites 2; profiles 4; service_history 1; pm_schedules 10; Storage objects/files 15; foreign keys 68; unvalidated constraints 0; RLS-enabled public tables 15; policies 46. Critical table counts match the read-only live baseline observed before the test. Exact restored Storage bucket/name mapping matches the file manifest. No production writes or service requests occurred in the restore job.

Scope limit: verifies database, source, file recovery and basic RLS. Does not test managed Supabase hosting setup, SMTP/login, API keys, browser workflows, Storage API re-upload, or a live production cutover. Those still need a separate compatible hosted staging environment for a complete application disaster-recovery drill. Re-run manually via Actions → Backblaze restore rehearsal → Run workflow.


## 39. Self-hosted application recovery drill PASSED (2026-11-05 Pacific)

Workflow `.github/workflows/backblaze-app-recovery.yml` restores the latest Backblaze archive, then starts local Auth (supabase/gotrue v2.197.0), PostgREST (v14.18) and Storage API (v1.89.12) against disposable PostgreSQL 17. Internal Docker network has no Internet egress; loopback-only frontend proxy reaches private container addresses. Only Backblaze secrets are provided to the job; production Supabase credentials are absent. The browser blocks production/external requests except jsDelivr script assets. Source URL and anonymous key are replaced only in the recovered temporary app.js response.

Successful Actions run: **42136725105**. Verified:
- Latest database/source/file backup restoration.
- All 15 uploaded files re-uploaded via local Storage API and read back with matching SHA-256.
- New temporary owner/viewer users created through local Auth admin API and password login tested.
- Viewer assigned-site read succeeds; viewer equipment edit and Record Service RPC are denied by restored RLS/backend logic.
- Owner records a disposable service through PostgREST; saved equipment hours and baseline timestamp update correctly.
- Recovered tracker opens in headless installed Chrome; owner and viewer login, equipment page opening, viewer edit-control removal, and working-day PM runtime calculation pass.
- Containers, private network, generated test credentials and recovered data are deleted after the job. No production records changed.

Recovery prerequisites discovered: PostgreSQL roles/grants/search paths are outside the selected-schema dump. The harness recreates local roles/grants, and Auth/Storage use explicit auth/public/extensions and storage/public/extensions search paths. Initial default search path caused Auth to attempt replaying existing migrations; explicit paths fixed it. Browser installation uses a bounded isolated npm package install; installed Chrome avoids slow system-font downloads. Final browser selector targets Sign in explicitly.

Code: scripts/app_recovery_test.py, scripts/recovery_browser_test.cjs; optional RESTORE_APPLICATION_TEST hook in restore_backup_test.py. Manual re-run: Actions → Local application recovery test → Run workflow. No recurring application test is scheduled. Database-only restore retains network-none isolation.

Scope: real local Auth/REST/Storage and browser smoke coverage, not every screen/role/operation. Does not test real email/SMS, external map services, hosted platform provisioning, DNS, production keys, or production failover. Test environment grants are explicit reconstruction steps, not restoration of original ACLs (archive omits ownership/privileges).


## 40. Backup retention configured (2026-11-05 Pacific)

Owner approved 30 days of daily backups plus 12 monthly copies. Retention is implemented in scripts/backup_to_b2.py after successful full upload/readback SHA-256 verification. Each verified backup gets an encrypted private .verified.json sidecar with the archive version ID and checksum. All archives within 30 days are kept; one monthly archive is kept for current UTC month + previous 11 months, preferring latest verified snapshot over unmarked legacy uploads. Current verified archive is always kept. Daily/monthly copies overlap.

Cleanup paginates B2 file versions and permanently deletes exact expired archive IDs and related marker IDs only. Strict namespace/name matching protects unrelated bucket objects. No hide-marker deletion, bucket-wide expiration, or Object Lock bypass. Missing listFiles/deleteFiles capabilities or missing current archive/marker stops cleanup; failed backup export/upload/readback never reaches pruning. User-enabled GitHub Actions failure email is the notification path.

Tests: tests/backup_retention_test.py, four focused tests for day/month/year cutoffs, duplicate versions, unknown file protection, verified monthly preference and verification-required fail-closed behaviour. Verified live backup run 42138243678 PASSED: full database/source/15-file Storage archive uploaded and checksum-readback verified; retention kept all 3 current archive versions and removed 0 expired archives/markers because no backups are old enough yet. The application key has the required list/delete capabilities; future eligible expired version deletion follows the tested planner.


## 41. Conversation checkpoint / next-chat handoff (2026-11-05 Pacific)

Owner asked to save this conversation's project state before starting a new chat for further app edits.

### Confirmed current state
- V3 live tracker: https://fearincognito.github.io/forged-field-pm-tracker-v3/
- Repository: fearincognito/forged-field-pm-tracker-v3. V2 remains untouched.
- All feature changes from sections 25–35 are deployed: fleet-reference selection, mistaken equipment/PM removal, one-stock pack-list backup rule, calendar contrast, admin date-range service reports, rental company directory and equipment linkage/contact display, PM schedule editing, rotation-based runtime estimates, and Record Service meter updates.
- Backup setup is complete: daily 11:17 UTC; private encrypted Backblaze archive of database, tracked source and uploaded Storage files; full download checksum verification; approved retention of 30 days of all daily archives plus one monthly snapshot for current UTC month and prior 11 months.
- Latest retention-enabled backup run 42138243678 succeeded; 15 Storage files included; all 3 current archive versions kept, zero expired objects deleted.
- Isolated database restore rehearsal passed (42131998054); local Auth/REST/Storage + Chrome application recovery drill passed (42136725105). See sections 38–40 and BACKUPS.md for scope and setup.
- GitHub failure notifications are confirmed delivered. Owner connected their personal Gmail separately from work Gmail; newest failure alert read in personal inbox at 4:25 PM Pacific on Nov 5 referred to failed test run 42136471814, before the final successful recovery run. These are earlier test-setup failures, not current backup failures.
- Personal and work Gmail are distinct connections; choose intended account explicitly from the tool-provided account list. Do not send messages or alter mail without explicit instruction.
- Secret VALUES remain exclusively in GitHub Actions secrets. Never request them in chat or write them into repository files. Names are documented in BACKUPS.md.

### Useful future verification (discussed, not yet requested to execute)
Scheduled-PM completion including due-hour progression, service inventory deduction + pack-list quantities, all five roles (owner/admin/mechanic/operator/viewer), date-range service-report exports, and backup failure-email delivery. Email delivery is now verified; remaining workflow checks can be addressed in future work. Existing recovery drill covers a subset, not exhaustive app testing. Real email delivery from Supabase, external map services and production failover are outside the local drill.

### Resume instruction
Read the current PROJECT_HANDOFF.md in fearincognito/forged-field-pm-tracker-v3, fetch the latest repository state, and continue editing V3. Do not touch V2. Before modifying source, inspect the live default-branch version rather than relying on stale local commits. Preserve existing real equipment/service data and role enforcement. This checkpoint is a project summary, not a verbatim chat transcript.


## 42. PM email + phone push notification foundation (2026-11-05 Pacific)

Owner requested automatic email and phone push notifications as PM approaches/due, with V2 untouched and no duplicate alerts. V3 implementation committed to main:

- DB migration `pm_notification_delivery_foundation`: new RLS-protected `pm_notification_preferences`, `pm_push_subscriptions`, `pm_notification_delivery`, and `pm_notification_config` tables. Self-only preference/subscription access; logged deliveries recipient read-only; config public VAPID key read-only to enabled users. No original maintenance/service/equipment data modified. Live policy check confirmed 3/4/1/1 policies for preferences/subscriptions/delivery/config; delivery log initially 0 rows.
- Frontend `pm_notifications.js` loaded last from `index.html`; a dashboard PM Notification Settings card appears to Owner/Admin/Mechanic. Users may save email/push preference and register/remove their own browser push subscription. `pm-sw.js` displays push notifications and opens the scoped V3 page. Installable `manifest.webmanifest` + iPhone web-app meta tags added. On iPhone, install from Safari via Add to Home Screen to request push permission.
- Server `scripts/pm_notifications.py` + daily GitHub workflow `.github/workflows/pm-notifications.yml` (15:17 UTC). Uses rotation-adjusted estimated hours with the existing 50/20/due thresholds; only active Owner/Admin/Mechanic accounts are eligible; archived sites/equipment excluded. Email through Resend; Web Push through pywebpush VAPID. Email requests have deterministic idempotency keys; a unique database index constrains threshold-per-due-cycle-per-recipient-per-channel/device. Failed deliveries retry; unexpected pending states require reconciliation to avoid duplicate sends.
- Regression source `tests/pm_notifications_test.py`; `.github/workflows/pm-notifications-tests.yml` runs syntax/threshold/rotation checks on commits. Setup and limitations documented in `PM_NOTIFICATIONS.md`.

**Not yet live for delivery**: `PM_ALERTS_ENABLED` repository variable intentionally not set to `true` until administrator creates/verifies Resend sender/API key, VAPID pair, secrets, publishes matching public VAPID key in DB config, registers an iPhone and performs a real end-to-end delivery test. Workflow job is gated to skip while not enabled; no email or push was sent during implementation. Credentials remain outside source/repo; never request private credentials in chat. Current user should be guided one setup step at a time. Do not claim delivery is complete until live tests succeed. V2 untouched.
