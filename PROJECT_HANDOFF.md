# Forged Field PM Tracker V3 — Project Handoff

_Last updated: 2026-10-08 (America/Los_Angeles)_

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
