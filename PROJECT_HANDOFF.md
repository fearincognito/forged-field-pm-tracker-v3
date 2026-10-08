# Forged Field PM Tracker V3 — Project Handoff

_Last updated: 2026-10-07 (America/Los_Angeles)_

This file is the continuity document for the Forged Field PM Tracker V3 project. Read this first when returning to the project after a break or when a new ChatGPT session needs to continue development.

## 1. Project purpose

Forged Field PM Tracker V3 is a field-maintenance web app for drilling operations. It is being designed around how mechanics actually work in the field: company dashboard → job sites → equipment / site items → maintenance, work tickets, inventory, service history, GPS, schedules, and access controls.

The owner describes the desired workflow and tests the live site. ChatGPT handles the GitHub/Supabase implementation directly whenever possible. The owner should not be asked to edit code manually.

## 2. Critical rule: do not touch V2

V2 must remain completely untouched.

- V3 repository: `fearincognito/forged-field-pm-tracker-v3`
- V3 live site: `https://fearincognito.github.io/forged-field-pm-tracker-v3/`
- V2 repository: `fearincognito/-field-pm-tracker`
- V2 live site: `https://fearincognito.github.io/-field-pm-tracker/`

All development described in this file is V3 only.

## 3. Technology / architecture

- Frontend: static HTML/CSS/JavaScript hosted by GitHub Pages.
- Database/auth/storage: Supabase.
- Supabase project ID: `eaehrhqsqmlcjcuzeyoh`
- Supabase region: `us-west-2`
- Supabase URL: `https://eaehrhqsqmlcjcuzeyoh.supabase.co`
- The browser uses a Supabase publishable key under RLS.
- Never put a service-role key, database password, user password, or other secret into this repository or this handoff.

The frontend is intentionally modular. Many JS files wrap existing global functions such as `renderDashboard`, `openSite`, and `openEquipment`. Preserve wrapper chains and script load order when adding features.

### Development rule

Always fetch the current GitHub version of a file immediately before updating it. Do not rely on an old SHA from this document or a prior chat summary.

## 4. Working style / UX direction

Keep the app practical and mechanic-friendly:

- clean, simple controls
- mobile-first behavior for field use
- obvious Back / Cancel navigation
- large enough touch targets
- no unnecessary data clutter
- hide empty equipment details while keeping fields available in edit forms
- use drilling/mechanic terminology rather than generic software language
- test changes in small, concrete steps: refresh → open the feature → say worked / did not work

The owner commonly tests in desktop Firefox and on iPhone.

## 5. Main product hierarchy

Company Dashboard
→ Job Sites
→ Equipment / Site Items
→ Equipment Details / Work Tickets / PM / Service / Inventory / GPS

### Job Sites

Sites support:

- location and access notes
- saved GPS and navigation
- rotations: 14/7, 20/10, and custom
- rotation anchor date
- customer/company logo
- live drilling/shutdown rotation strip
- equipment list
- site items
- site inventory
- pack lists
- work tickets

### Site Items

Supported categories include:

- supply trailer
- bathroom
- laydown
- connex / sea can
- fuel tank
- water tank
- storage
- other

Supply-trailer detail/edit/GPS/navigation/ticket flow was previously tested successfully.

### Equipment

Equipment can contain:

- owned or rental
- unit number / name
- equipment year
- make / model
- equipment serial
- engine serial
- VIN
- status
- current hours
- expected operating hours/day
- oil type
- oil capacity + unit
- filters / service parts
- notes
- saved GPS
- photo

Equipment can move between sites and can be archived/restored rather than hard-deleted.

## 6. Roles and permissions

Roles:

- Owner
- Admin
- Mechanic
- Operator
- Viewer

### Owner / Admin

Account administration, invitations, role changes, user enable/disable, and broad operational access. Owner has some additional destructive actions such as service-history deletion.

### Mechanic

Operational access across all sites. Intended to support equipment/site maintenance work, including equipment edits, filters, site items, inventory, PM/service functions, work tickets, moves, archive/restore, and site edits. Mechanics do not manage Users & Access.

### Operator

Assigned-site access. Can view site/equipment/maintenance information and create/update work tickets. A narrow permission was added so Operators can update **current machine hours only** on assigned sites. They cannot edit the rest of the equipment record or move hours backward.

### Viewer

Assigned-site read-only access.

### Account terminology

The UI uses **Enabled / Disabled** instead of Active / Inactive for account status. The underlying database field is still `active`.

## 7. Supabase data model — high-level

Important enums include:

- `app_role`: owner / admin / mechanic / operator / viewer
- `equipment_status`: active / rental / out_of_service / archived
- `ownership_type`: owned / rental
- `site_item_type`: supply_trailer / bathroom / laydown / connex / fuel_tank / water_tank / storage / other
- `ticket_status`: open / in_progress / completed / cancelled
- `ticket_priority`: normal / urgent / equipment_down
- `audit_action`: created / updated / completed / archived / restored / deleted

Important tables include:

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

Important helpers include:

- `set_updated_at`
- `handle_new_user`
- `current_user_role`
- `is_admin`
- `can_access_site`
- `is_mechanic_or_above`
- `can_work_at_site`

RLS is enabled. Preserve backend enforcement when adding UI permissions; do not rely on hiding buttons alone.

## 8. Preventive maintenance model

PM is hour-meter based; the meter is authoritative.

Existing threshold convention:

- within 50 hours: yellow
- within 20 hours: orange
- due / overdue: red

Service completion stores the scheduled due point so a late service advances the next due from the intended schedule rather than drifting forever.

Historical tests included a 250-hour schedule and verified late-service behavior.

Expected hours/day can be combined with site rotation to estimate a calendar due date. Custom decimal usage such as 0.5 / 1.5 hours per day is supported, but remains on the test list.

## 9. Work tickets

Work tickets can attach to equipment or a site item.

Typical fields:

- What’s Broken?
- description / context
- posted by
- status
- priority
- repair / resolution
- completed by
- completion date
- completed equipment hours
- comments / updates

Statuses:

- Open
- In Progress
- Completed
- Cancelled

Priorities:

- Normal
- Urgent
- Equipment Down

Completed equipment hours are prefilled from current machine hours but remain editable. Completing a ticket does **not** automatically update equipment current hours.

## 10. Site inventory and pack lists

Site inventory tracks required quantity, quantity on site, and quantity to bring.

The pack-list workflow supports selecting specific equipment before generating the list. All machines are checked by default, with Select All / Clear All. Only selected machines contribute parts. Duplicate part numbers are aggregated and the list shows which machines use each part.

A service workflow was also added so a mechanic can select filters consumed from site inventory while recording service. Selected filters are deducted from inventory and recorded with the service. This still needs careful real-world testing with an intentional service record.

## 11. Equipment photos

Equipment photos use the private `equipment-photos` storage bucket and signed URLs.

Implemented behavior includes:

- upload / replace / remove
- image compression before upload
- primary photo on equipment detail
- thumbnails in site equipment lists and Company Equipment
- click detail image for larger view
- compact Retake / Replace / Remove controls

Potential remaining edge case: iPhone HEIC / canvas handling should still be tested.

## 12. Site customer logos

Site logos use the public `site-logos` bucket.

Implemented:

- upload from Add/Edit Site
- replace/remove from Edit Site
- logo shown on site cards
- desktop positioning centered in open space to the right of site information
- mobile stacking

## 13. Mechanics Schedule

A Mechanics Schedule card exists on the dashboard with October and November 2026 schedule data currently entered from supplied screenshots.

Features include:

- desktop calendar/table view
- mobile mechanic cards
- month switching
- current-day highlighting
- “Mechanics On Today” section
- only `Days` counts as on-duty; FI / FO / OFF are excluded
- Call, SMS, and FaceTime Audio actions for the currently stored mechanic contacts

Do not copy personal phone numbers into this handoff. They already exist in the schedule module where required.

Additional months can be added later from new schedule screenshots.

## 14. Live site rotation strip

File: `site_rotation_strip.js`

Current behavior:

- shown beside the Rotation summary on an open Job Site
- uses rotation type + anchor date
- green = **Drilling**
- red = **Shut Down**
- current month/year at top-left
- `Today: Drilling` / `Today: Shut Down` pill at top-right
- no weekday/date numbers in the strip
- current day has a dark outline
- current month is represented by compact colored day segments
- on phones the entire month compresses to fit the screen; no horizontal page swiping is required
- it updates when the local browser date changes

Most recent relevant commit:

- `0684f0de9eef9d3bbad0f6ab60255ed8e9153e78` — Fit site rotation strip within phone screen

The owner confirmed the phone layout works.

## 15. Dashboard Job Sites map

File: `dashboard_sites_map.js`

The dashboard now contains a full-width map of active sites with saved GPS coordinates.

Behavior:

- all accessible active sites with valid GPS are shown as pins
- map auto-fits the active site pins
- green pin = Drilling
- red pin = Shut Down
- blue pin = no rotation configured
- hover labels automatically point inward when a pin is close to a map edge
- clicking a pin opens a popup with site name/status, Open Site, and Google Maps navigation
- mobile map height is reduced appropriately
- selected map layer is remembered in `localStorage`

Selectable base layers:

- Street — OpenStreetMap
- Satellite — Esri World Imagery
- Terrain — topo/terrain layer

Recent map commits:

- `3e75faa92c2d43c9a9f1b135c4836d4c21ae574b` — Add live job sites map to dashboard
- `ca8706a087c390fffae3cd90dfd4009500dbe5d2` — Keep site map hover labels inside map edges
- `e3e8850ba734ae5227587d47ab59811d934aef13` — Add selectable satellite layer
- `2b7e264e56030b9c2d22a07725a72eeb80bbc458` — Add terrain layer

## 16. Login / password recovery

### Show / Hide password

File: `password_toggle.js`

The login password field now has a Show / Hide button inside the field.

Recent commits:

- `cb4f2b003a6e5b2834bd191a97c5d36e96d6caa3` — Add show-hide password button to login
- `026152be9f9bbb6dd15b7ba419b7ed7e859db230` — Load login password show-hide control

### Forgot password

File: `password_reset.js`

A Supabase password-recovery flow exists with new-password confirmation and minimum-length validation. A previous recovery test hit an email rate limit; a clean final end-to-end recovery retest is still desirable.

## 17. Manual Viewer demo account workflow

Users & Access has an Owner-only workflow to create a manual/shared Viewer login without sending an invitation email.

Important rules:

- Viewer only
- selected current sites only
- credentials are returned once
- no passwords should ever be copied into this handoff
- shared accounts are less auditable and should be disabled after a demo

A backend permission issue during the first attempt was fixed and the partial failed demo account was disabled. A later retry successfully produced credentials, but actual login/read-only behavior still needs confirmation.

## 18. Other implemented modules worth knowing

These files are important parts of the current V3 build:

- `app.js` — core app / base navigation and site/equipment rendering
- `pm.js` — PM/service functions
- `equipment_edit.js`
- `equipment_usage.js` — expected operating hours/day
- `gps_nav.js` — saved GPS / navigation / map preview
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

Before modifying any of these, fetch the current file first.

## 19. Known successful tests / confirmations

Historically confirmed working:

- Company Equipment fuzzy search
- equipment archive / restore
- Supply Trailer 1 detail/edit/GPS/navigation/tickets flow
- PM threshold behavior and late-service next-due behavior in earlier tests
- site rotation calculations for 14/7, 20/10, and custom rotations
- compact phone rotation strip now fits without horizontal page swiping
- site/company logo positioning was adjusted after screenshot feedback
- login password Show/Hide was implemented (needs only normal user confirmation after deployment if not already checked)

## 20. Current testing priority / unresolved checks

When resuming, these are the best outstanding items to verify before assuming they are finished:

1. Dashboard map: confirm Street / Satellite / Terrain selector on desktop and phone.
2. Login Show / Hide password control.
3. Mechanics Schedule SMS + FaceTime Audio on iPhone.
4. Manual Viewer actual login and read-only site access.
5. Service inventory deduction with an intentional real/test service.
6. Operator Update Hours from an Operator login.
7. Equipment list/detail photo behavior, especially iPhone HEIC.
8. Saved GPS mini-map preview.
9. Custom decimal expected equipment operation.
10. Owner service-history delete and PM rollback behavior.
11. Oil capacity unit selector/display.
12. Password recovery full end-to-end retest.
13. Mechanic-role permissions from a separate/incognito login.
14. Inter-site equipment move with more than one active site.
15. Filter edit/delete, including duplicate-identical-filter edge cases.

Do not run destructive tests against real records unless the owner clearly intends it.

## 21. Known future ideas / roadmap

Possible future work discussed or implied:

- work-ticket assignment
- ticket reopen / edit priority / edit title
- in-app / email / push notifications
- richer site-status visualization
- continued monthly mechanics schedule updates
- more field-friendly mobile refinements as screenshots reveal issues

Do not implement speculative features without the owner asking for them.

## 22. Recent project commits at the time of this handoff

Newest relevant commits when this file was created:

- `026152be9f9bbb6dd15b7ba419b7ed7e859db230` — Load login password show-hide control
- `cb4f2b003a6e5b2834bd191a97c5d36e96d6caa3` — Add show-hide password button to login
- `2b7e264e56030b9c2d22a07725a72eeb80bbc458` — Add terrain layer to dashboard site map
- `e3e8850ba734ae5227587d47ab59811d934aef13` — Add selectable satellite layer to dashboard site map
- `ca8706a087c390fffae3cd90dfd4009500dbe5d2` — Keep site map hover labels inside map edges
- `29dea8cc029157926fd9d79c11ce5709ff780135` — Load dashboard job sites map
- `0684f0de9eef9d3bbad0f6ab60255ed8e9153e78` — Fit site rotation strip within phone screen
- `de0655a2483a72ae74eae6f8cb9f1c125b9fe9e9` — Make site rotation strip compact and rename statuses
- `07ea9dadc6f57a0923037a94399ad236d32f0b1c` — Add SMS and FaceTime Audio buttons to on-duty mechanics

These commit IDs are historical anchors only. Always inspect the current default branch before coding.

## 23. How to resume this project later

If returning after weeks or months, the ideal instruction is:

> Open `PROJECT_HANDOFF.md` in `fearincognito/forged-field-pm-tracker-v3`, inspect the current GitHub files, and continue the V3 build from there. Do not touch V2.

Then:

1. Read this handoff.
2. Fetch the current `index.html` to confirm script load order.
3. Fetch any file that will be modified immediately before editing it.
4. Inspect recent commits if the handoff is old.
5. Preserve Supabase RLS and backend role enforcement.
6. Make the change directly.
7. Give the owner only simple refresh/test instructions.
8. Update this handoff after a meaningful milestone or major architecture/permission change.

## 24. Security and privacy rules

Do not place any of the following in this file or repository:

- user passwords
- generated demo passwords
- Supabase service-role key
- database password
- private API keys
- authentication tokens

The browser-visible Supabase publishable key is expected to be public and protected by RLS, but there is no reason to duplicate it here.

## 25. Continuity note

This handoff is not meant to replace the full ChatGPT conversation. The best continuity setup is:

- keep the original project conversation in ChatGPT
- keep this file in the V3 repository
- optionally export ChatGPT account data for an offline conversation backup

The repository handoff preserves the technical state; the original conversation preserves screenshots, design discussion, wording preferences, and the reasoning behind individual UI decisions.
