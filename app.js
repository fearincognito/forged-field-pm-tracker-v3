const SUPABASE_URL = "https://eaehrhqsqmlcjcuzeyoh.supabase.co";
const SUPABASE_KEY = "sb_publishable_QOyuqtY9-qvW4X8nIzBi1w_RHVqjU7f";

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const loginView = document.querySelector("#loginView");
const appView = document.querySelector("#appView");
const loginForm = document.querySelector("#loginForm");
const msg = document.querySelector("#msg");
const roleEl = document.querySelector("#role");
const nameEl = document.querySelector("#name");
const accountEl = document.querySelector("#account");
const logoutBtn = document.querySelector("#logout");

let currentUser = null;
let currentProfile = null;

/* --------------------------------------------------
   LOGIN / AUTH
-------------------------------------------------- */

function showLogin() {
  loginView.classList.remove("hidden");
  appView.classList.add("hidden");
}

function showApp() {
  loginView.classList.add("hidden");
  appView.classList.remove("hidden");
}

async function loadProfile(user) {
  msg.textContent = "";

  const { data: profile, error } = await db
    .from("profiles")
    .select("id, full_name, role, active")
    .eq("id", user.id)
    .single();

  if (error) {
    console.error("Profile lookup error:", error);
    msg.textContent = "Account profile could not be loaded.";
    await db.auth.signOut();
    showLogin();
    return;
  }

  if (!profile) {
    msg.textContent = "No account profile was found.";
    await db.auth.signOut();
    showLogin();
    return;
  }

  if (!profile.active) {
    msg.textContent = "This account has been disabled.";
    await db.auth.signOut();
    showLogin();
    return;
  }

  currentUser = user;
  currentProfile = profile;

  roleEl.textContent = String(profile.role || "viewer").toUpperCase();
  nameEl.textContent = `Welcome, ${profile.full_name || user.email}`;
  accountEl.textContent = user.email || "";

  showApp();
  renderDashboard();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  msg.textContent = "Signing in...";

  const email = document.querySelector("#email").value.trim();
  const password = document.querySelector("#password").value;

  const { data, error } = await db.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    console.error("Sign-in error:", error);
    msg.textContent = error.message;
    return;
  }

  if (!data.user) {
    msg.textContent = "Sign in failed.";
    return;
  }

  await loadProfile(data.user);
});

logoutBtn.addEventListener("click", async () => {
  await db.auth.signOut();

  currentUser = null;
  currentProfile = null;

  showLogin();
  loginForm.reset();
  msg.textContent = "";
});

/* --------------------------------------------------
   DASHBOARD
-------------------------------------------------- */

function renderDashboard() {
  const grid = appView.querySelector(".grid");

  grid.innerHTML = `
    <button class="card dashboard-card" id="sitesCard" type="button">
      <strong>Sites</strong>
      <small>Manage job sites</small>
    </button>

    <button class="card dashboard-card" id="equipmentCard" type="button">
      <strong>Equipment</strong>
      <small>V3 database ready</small>
    </button>

    <button class="card dashboard-card" id="ticketsCard" type="button">
      <strong>Work Tickets</strong>
      <small>V3 database ready</small>
    </button>

    <button class="card dashboard-card" id="historyCard" type="button">
      <strong>Service History</strong>
      <small>V3 database ready</small>
    </button>
  `;

  document
    .querySelector("#sitesCard")
    .addEventListener("click", renderSites);
}

/* --------------------------------------------------
   SITES
-------------------------------------------------- */

async function renderSites() {
  const grid = appView.querySelector(".grid");

  grid.innerHTML = `
    <section class="card" style="grid-column:1/-1;">
      <div style="
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:12px;
        flex-wrap:wrap;
      ">
        <div>
          <h2 style="margin:0;">Job Sites</h2>
          <small>Forged Drilling field locations</small>
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button id="backDashboard" type="button">← Dashboard</button>
          <button id="addSite" type="button">+ Add Site</button>
        </div>
      </div>

      <div id="sitesStatus" style="margin-top:18px;">
        Loading sites...
      </div>

      <div id="sitesList" style="margin-top:12px;"></div>
    </section>
  `;

  document
    .querySelector("#backDashboard")
    .addEventListener("click", renderDashboard);

  document
    .querySelector("#addSite")
    .addEventListener("click", showAddSiteForm);

  await loadSites();
}

async function loadSites() {
  const status = document.querySelector("#sitesStatus");
  const list = document.querySelector("#sitesList");

  const { data: sites, error } = await db
    .from("sites")
    .select(`
      id,
      name,
      description,
      latitude,
      longitude,
      access_notes,
      rotation_type,
      rotation_on_days,
      rotation_off_days,
      rotation_anchor_date,
      archived
    `)
    .eq("archived", false)
    .order("name");

  if (error) {
    console.error("Sites lookup error:", error);

    status.innerHTML = `
      <span style="color:#b42318;">
        Sites could not be loaded.
      </span>
    `;

    return;
  }

  if (!sites || sites.length === 0) {
    status.textContent = "No active job sites yet.";

    list.innerHTML = `
      <div style="
        border:1px dashed #aab8c5;
        border-radius:10px;
        padding:20px;
        text-align:center;
      ">
        <strong>No sites have been added.</strong>
        <br>
        <small>Use + Add Site to create the first field location.</small>
      </div>
    `;

    return;
  }

  status.textContent =
    `${sites.length} active job site${sites.length === 1 ? "" : "s"}`;

  list.innerHTML = sites.map(site => {

    let rotation = "No rotation set";

    if (site.rotation_type === "14_7") {
      rotation = "14 days on / 7 days off";
    }

    if (site.rotation_type === "20_10") {
      rotation = "20 days on / 10 days off";
    }

    if (site.rotation_type === "custom") {
      rotation =
        `${site.rotation_on_days || "?"} days on / ` +
        `${site.rotation_off_days || "?"} days off`;
    }

    return `
      <article class="card" style="
        margin-top:10px;
        box-shadow:none;
        border:1px solid #d7e0e7;
      ">
        <h3 style="margin-top:0;">
          ${escapeHtml(site.name)}
        </h3>

        ${
          site.description
            ? `<p>${escapeHtml(site.description)}</p>`
            : ""
        }

        <small>
          <strong>Rotation:</strong>
          ${escapeHtml(rotation)}
        </small>

        ${
          site.access_notes
            ? `
              <p>
                <small>
                  <strong>Access notes:</strong>
                  ${escapeHtml(site.access_notes)}
                </small>
              </p>
            `
            : ""
        }

        <div style="
          margin-top:14px;
          display:flex;
          gap:8px;
          flex-wrap:wrap;
        ">
          <button
            type="button"
            onclick="openSite('${site.id}')"
          >
            Open Site
          </button>

          ${
            site.latitude != null && site.longitude != null
              ? `
                <button
                  type="button"
                  onclick="navigateToSite(${site.latitude}, ${site.longitude})"
                >
                  Navigate
                </button>
              `
              : ""
          }
        </div>
      </article>
    `;
  }).join("");
}

/* --------------------------------------------------
   ADD SITE
-------------------------------------------------- */

function showAddSiteForm() {
  const grid = appView.querySelector(".grid");

  grid.innerHTML = `
    <section class="card" style="grid-column:1/-1;">
      <h2>Add Job Site</h2>

      <form id="siteForm">

        <label>
          Site Name
          <input
            id="siteName"
            type="text"
            required
            placeholder="Example: Nev Gold"
          >
        </label>

        <label>
          Description
          <textarea
            id="siteDescription"
            rows="3"
            placeholder="Optional site description"
          ></textarea>
        </label>

        <label>
          Site Rotation
          <select id="rotationType">
            <option value="none">No rotation</option>
            <option value="14_7">14 days on / 7 days off</option>
            <option value="20_10">20 days on / 10 days off</option>
            <option value="custom">Custom</option>
          </select>
        </label>

        <div id="customRotation" style="display:none;">
          <label>
            Days On
            <input id="rotationOn" type="number" min="1">
          </label>

          <label>
            Days Off
            <input id="rotationOff" type="number" min="1">
          </label>
        </div>

        <label>
          Rotation Anchor Date
          <input id="rotationAnchor" type="date">
        </label>

        <label>
          Latitude
          <input
            id="siteLatitude"
            type="number"
            step="any"
            placeholder="Optional"
          >
        </label>

        <label>
          Longitude
          <input
            id="siteLongitude"
            type="number"
            step="any"
            placeholder="Optional"
          >
        </label>

        <label>
          Site Access Notes
          <textarea
            id="siteAccessNotes"
            rows="5"
            placeholder="Gate instructions, mine entrance, staging area, security requirements, etc."
          ></textarea>
        </label>

        <div style="
          display:flex;
          gap:8px;
          flex-wrap:wrap;
          margin-top:15px;
        ">
          <button type="submit">
            Save Site
          </button>

          <button
            id="cancelSite"
            type="button"
          >
            Cancel
          </button>
        </div>

        <p id="siteFormMessage"></p>

      </form>
    </section>
  `;

  const rotationType =
    document.querySelector("#rotationType");

  const customRotation =
    document.querySelector("#customRotation");

  rotationType.addEventListener("change", () => {
    customRotation.style.display =
      rotationType.value === "custom"
        ? "block"
        : "none";
  });

  document
    .querySelector("#cancelSite")
    .addEventListener("click", renderSites);

  document
    .querySelector("#siteForm")
    .addEventListener("submit", saveSite);
}

async function saveSite(event) {
  event.preventDefault();

  const message =
    document.querySelector("#siteFormMessage");

  message.textContent = "Saving site...";

  const rotationType =
    document.querySelector("#rotationType").value;

  let rotationOnDays = null;
  let rotationOffDays = null;

  if (rotationType === "14_7") {
    rotationOnDays = 14;
    rotationOffDays = 7;
  }

  if (rotationType === "20_10") {
    rotationOnDays = 20;
    rotationOffDays = 10;
  }

  if (rotationType === "custom") {
    rotationOnDays =
      Number(document.querySelector("#rotationOn").value) || null;

    rotationOffDays =
      Number(document.querySelector("#rotationOff").value) || null;
  }

  const latitudeValue =
    document.querySelector("#siteLatitude").value;

  const longitudeValue =
    document.querySelector("#siteLongitude").value;

  const newSite = {
    name:
      document.querySelector("#siteName").value.trim(),

    description:
      document.querySelector("#siteDescription").value.trim() || null,

    latitude:
      latitudeValue === ""
        ? null
        : Number(latitudeValue),

    longitude:
      longitudeValue === ""
        ? null
        : Number(longitudeValue),

    access_notes:
      document.querySelector("#siteAccessNotes").value.trim() || null,

    rotation_type:
      rotationType,

    rotation_on_days:
      rotationOnDays,

    rotation_off_days:
      rotationOffDays,

    rotation_anchor_date:
      document.querySelector("#rotationAnchor").value || null,

    archived: false,

    created_by:
      currentUser.id,

    updated_by:
      currentUser.id
  };

  const { error } = await db
    .from("sites")
    .insert(newSite);

  if (error) {
    console.error("Site save error:", error);

    message.innerHTML = `
      <span style="color:#b42318;">
        ${escapeHtml(error.message)}
      </span>
    `;

    return;
  }

  await renderSites();
}

/* --------------------------------------------------
   SITE DETAILS
-------------------------------------------------- */

window.openSite = async function(siteId) {
  const grid = appView.querySelector(".grid");

  grid.innerHTML = `
    <section class="card" style="grid-column:1/-1;">
      <p>Loading site...</p>
    </section>
  `;

  const [
    { data: site, error: siteError },
    { data: equipment, error: equipmentError },
    { data: siteItems, error: siteItemsError }
  ] = await Promise.all([
    db
      .from("sites")
      .select(`
        id,
        name,
        description,
        latitude,
        longitude,
        access_notes,
        rotation_type,
        rotation_on_days,
        rotation_off_days,
        rotation_anchor_date
      `)
      .eq("id", siteId)
      .single(),

    db
      .from("equipment")
      .select(`
        id,
        unit_number,
        name,
        make,
        model,
        ownership,
        status,
        current_hours,
        archived
      `)
      .eq("site_id", siteId)
      .eq("archived", false)
      .order("name"),

    db
      .from("site_items")
      .select(`
        id,
        name,
        item_type,
        description,
        latitude,
        longitude,
        archived
      `)
      .eq("site_id", siteId)
      .eq("archived", false)
      .order("name")
  ]);

  if (siteError) {
    console.error("Site lookup error:", siteError);

    grid.innerHTML = `
      <section class="card" style="grid-column:1/-1;">
        <h2>Site could not be loaded</h2>
        <p>${escapeHtml(siteError.message)}</p>

        <button id="backSites" type="button">
          ← Back to Sites
        </button>
      </section>
    `;

    document
      .querySelector("#backSites")
      .addEventListener("click", renderSites);

    return;
  }

  if (equipmentError) {
    console.error("Equipment lookup error:", equipmentError);
  }

  if (siteItemsError) {
    console.error("Site items lookup error:", siteItemsError);
  }

  let rotationText = "No rotation set";

  if (site.rotation_type === "14_7") {
    rotationText = "14 days on / 7 days off";
  }

  if (site.rotation_type === "20_10") {
    rotationText = "20 days on / 10 days off";
  }

  if (site.rotation_type === "custom") {
    rotationText =
      `${site.rotation_on_days || "?"} days on / ` +
      `${site.rotation_off_days || "?"} days off`;
  }

  const equipmentList =
    equipment && equipment.length
      ? equipment.map(machine => {
          const makeModel = [
            machine.make,
            machine.model
          ].filter(Boolean).join(" ");

          return `
            <article style="
              border:1px solid #d7e0e7;
              border-radius:10px;
              padding:14px;
              margin-top:10px;
            ">
              <strong>
                ${escapeHtml(machine.unit_number || machine.name)}
              </strong>

              ${
                machine.unit_number && machine.name
                  ? `<div>${escapeHtml(machine.name)}</div>`
                  : ""
              }

              ${
                makeModel
                  ? `<small>${escapeHtml(makeModel)}</small><br>`
                  : ""
              }

              ${
                machine.current_hours != null
                  ? `<small><strong>Hours:</strong> ${escapeHtml(machine.current_hours)}</small><br>`
                  : ""
              }

              <small>
                <strong>Status:</strong>
                ${escapeHtml(machine.status || "active")}
              </small>
            </article>
          `;
        }).join("")
      : `
        <div style="
          border:1px dashed #aab8c5;
          border-radius:10px;
          padding:18px;
          text-align:center;
          margin-top:10px;
        ">
          <strong>No equipment assigned yet.</strong>
        </div>
      `;

  const siteItemsList =
    siteItems && siteItems.length
      ? siteItems.map(item => {
          return `
            <article style="
              border:1px solid #d7e0e7;
              border-radius:10px;
              padding:14px;
              margin-top:10px;
            ">
              <strong>${escapeHtml(item.name)}</strong><br>

              <small>
                ${escapeHtml(
                  String(item.item_type || "other")
                    .replaceAll("_", " ")
                )}
              </small>

              ${
                item.description
                  ? `<p>${escapeHtml(item.description)}</p>`
                  : ""
              }
            </article>
          `;
        }).join("")
      : `
        <div style="
          border:1px dashed #aab8c5;
          border-radius:10px;
          padding:18px;
          text-align:center;
          margin-top:10px;
        ">
          <strong>No site items added yet.</strong>
        </div>
      `;

  const hasLocation =
    site.latitude != null &&
    site.longitude != null;

  grid.innerHTML = `
    <section class="card" style="grid-column:1/-1;">

      <div style="
        display:flex;
        justify-content:space-between;
        align-items:flex-start;
        gap:12px;
        flex-wrap:wrap;
      ">
        <div>
          <h2 style="margin:0;">
            ${escapeHtml(site.name)}
          </h2>

          ${
            site.description
              ? `<p>${escapeHtml(site.description)}</p>`
              : ""
          }

          <small>
            <strong>Rotation:</strong>
            ${escapeHtml(rotationText)}
          </small>
        </div>

        <div style="
          display:flex;
          gap:8px;
          flex-wrap:wrap;
        ">
          <button id="backSites" type="button">
            ← Sites
          </button>

          ${
            hasLocation
              ? `
                <button id="navigateSite" type="button">
                  Navigate
                </button>
              `
              : ""
          }
        </div>
      </div>

      ${
        site.access_notes
          ? `
            <div style="
              margin-top:18px;
              padding:12px;
              border-radius:10px;
              background:#eef3f6;
            ">
              <strong>Site Access Notes</strong>
              <p style="margin-bottom:0;">
                ${escapeHtml(site.access_notes)}
              </p>
            </div>
          `
          : ""
      }

      <div style="
        display:grid;
        grid-template-columns:repeat(auto-fit,minmax(150px,1fr));
        gap:10px;
        margin-top:20px;
      ">
        <button type="button" id="workTicketsButton">
          Work Tickets
        </button>

        <button type="button" id="inventoryButton">
          Inventory
        </button>

        <button type="button" id="packListButton">
          Pack List
        </button>
      </div>

      <hr style="
        border:0;
        border-top:1px solid #d7e0e7;
        margin:24px 0;
      ">

      <div style="
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:10px;
        flex-wrap:wrap;
      ">
        <div>
          <h3 style="margin:0;">Equipment</h3>
          <small>
            ${equipment?.length || 0}
            active piece${equipment?.length === 1 ? "" : "s"} of equipment
          </small>
        </div>

        <button id="addEquipmentButton" type="button">
          + Add Equipment
        </button>
      </div>

      <div id="siteEquipmentList">
        ${equipmentList}
      </div>

      <hr style="
        border:0;
        border-top:1px solid #d7e0e7;
        margin:24px 0;
      ">

      <div style="
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:10px;
        flex-wrap:wrap;
      ">
        <div>
          <h3 style="margin:0;">Site Items</h3>
          <small>
            Supply trailers, bathrooms, laydowns, connexes and other fixed items
          </small>
        </div>

        <button id="addSiteItemButton" type="button">
          + Add Site Item
        </button>
      </div>

      <div id="siteItemsList">
        ${siteItemsList}
      </div>

    </section>
  `;

  document
    .querySelector("#backSites")
    .addEventListener("click", renderSites);

  if (hasLocation) {
    document
      .querySelector("#navigateSite")
      .addEventListener("click", () => {
        navigateToSite(site.latitude, site.longitude);
      });
  }

  document
    .querySelector("#addEquipmentButton")
    .addEventListener("click", () => {
      showAddEquipmentForm(siteId);
    });

  document
    .querySelector("#addSiteItemButton")
    .addEventListener("click", () => {
      showAddSiteItemForm(siteId);
    });

  document
    .querySelector("#workTicketsButton")
    .addEventListener("click", () => {
      alert("Site Work Tickets are coming next.");
    });

  document
    .querySelector("#inventoryButton")
    .addEventListener("click", () => {
      alert("Site Inventory is coming next.");
    });

  document
    .querySelector("#packListButton")
    .addEventListener("click", () => {
      alert("Site Pack List is coming next.");
    });
};

/* --------------------------------------------------
   ADD EQUIPMENT
-------------------------------------------------- */

function showAddEquipmentForm(siteId) {
  const grid = appView.querySelector(".grid");

  grid.innerHTML = `
    <section class="card" style="grid-column:1/-1;">
      <div class="section-heading">
        <div>
          <h2 style="margin:0;">Add Equipment</h2>
          <small>Add a powered or maintained asset to this site.</small>
        </div>
        <button id="cancelEquipment" type="button">← Back to Site</button>
      </div>

      <form id="equipmentForm">
        <div class="form-grid">
          <label>Unit Number
            <input id="equipmentUnitNumber" type="text" placeholder="Example: LP-12">
          </label>

          <label>Equipment Name
            <input id="equipmentName" type="text" required placeholder="Example: Light Plant">
          </label>

          <label>Make
            <input id="equipmentMake" type="text" placeholder="Example: Wacker Neuson">
          </label>

          <label>Model
            <input id="equipmentModel" type="text">
          </label>

          <label>Equipment Serial Number
            <input id="equipmentSerial" type="text">
          </label>

          <label>Engine Serial Number
            <input id="equipmentEngineSerial" type="text">
          </label>

          <label>VIN
            <input id="equipmentVin" type="text" value="N/A">
          </label>

          <label>Rental / Owned
            <select id="equipmentOwnership">
              <option value="owned">Owned</option>
              <option value="rental">Rental</option>
            </select>
          </label>

          <label>Status
            <select id="equipmentStatus">
              <option value="active">Active</option>
              <option value="rental">Rental</option>
              <option value="out_of_service">Out of Service</option>
            </select>
          </label>

          <label>Current Engine Hours
            <input id="equipmentHours" type="number" min="0" step="0.1">
          </label>

          <label>Expected Operation
            <select id="equipmentHoursPerDay">
              <option value="">Not set</option>
              <option value="12">12 hrs/day</option>
              <option value="24">24 hrs/day</option>
            </select>
          </label>

          <label>Oil Type
            <input id="equipmentOilType" type="text" placeholder="Example: 15W-40">
          </label>

          <label>Oil Capacity
            <input id="equipmentOilCapacity" type="number" min="0" step="0.01">
          </label>
        </div>

        <label>Notes
          <textarea id="equipmentNotes" rows="5" placeholder="Optional equipment notes"></textarea>
        </label>

        <div class="location-box">
          <div class="section-heading">
            <div>
              <strong>Equipment GPS Location</strong><br>
              <small>Optional. Stand beside the equipment and capture its current location.</small>
            </div>
            <button id="setEquipmentLocation" type="button">📍 Set Current Location</button>
          </div>

          <div class="form-grid">
            <label>Latitude
              <input id="equipmentLatitude" type="number" step="any">
            </label>
            <label>Longitude
              <input id="equipmentLongitude" type="number" step="any">
            </label>
          </div>
          <input id="equipmentGpsAccuracy" type="hidden">
          <p id="equipmentLocationStatus" class="field-status"></p>
        </div>

        <div class="form-actions">
          <button type="submit">Save Equipment</button>
          <button id="cancelEquipmentBottom" type="button" class="secondary-button">Cancel</button>
        </div>
        <p id="equipmentFormMessage" class="field-status"></p>
      </form>
    </section>
  `;

  const back = () => openSite(siteId);
  document.querySelector("#cancelEquipment").addEventListener("click", back);
  document.querySelector("#cancelEquipmentBottom").addEventListener("click", back);
  document.querySelector("#setEquipmentLocation").addEventListener("click", () => {
    captureCurrentLocation(
      "equipmentLatitude",
      "equipmentLongitude",
      "equipmentGpsAccuracy",
      "equipmentLocationStatus"
    );
  });
  document.querySelector("#equipmentForm").addEventListener("submit", (event) => {
    saveEquipment(event, siteId);
  });
}

async function saveEquipment(event, siteId) {
  event.preventDefault();
  const message = document.querySelector("#equipmentFormMessage");
  message.textContent = "Saving equipment...";

  const numberOrNull = (id) => {
    const value = document.querySelector(`#${id}`).value;
    return value === "" ? null : Number(value);
  };
  const textOrNull = (id) => document.querySelector(`#${id}`).value.trim() || null;

  const latitude = numberOrNull("equipmentLatitude");
  const longitude = numberOrNull("equipmentLongitude");
  const accuracy = numberOrNull("equipmentGpsAccuracy");

  const record = {
    site_id: siteId,
    unit_number: textOrNull("equipmentUnitNumber"),
    name: document.querySelector("#equipmentName").value.trim(),
    make: textOrNull("equipmentMake"),
    model: textOrNull("equipmentModel"),
    serial_number: textOrNull("equipmentSerial"),
    engine_serial_number: textOrNull("equipmentEngineSerial"),
    vin: textOrNull("equipmentVin") || "N/A",
    ownership: document.querySelector("#equipmentOwnership").value,
    status: document.querySelector("#equipmentStatus").value,
    current_hours: numberOrNull("equipmentHours"),
    operating_hours_per_day: numberOrNull("equipmentHoursPerDay"),
    oil_type: textOrNull("equipmentOilType"),
    oil_capacity: numberOrNull("equipmentOilCapacity"),
    notes: textOrNull("equipmentNotes"),
    latitude,
    longitude,
    gps_accuracy_m: accuracy,
    gps_captured_at: accuracy != null ? new Date().toISOString() : null,
    gps_captured_by: accuracy != null ? currentUser.id : null,
    archived: false,
    created_by: currentUser.id,
    updated_by: currentUser.id
  };

  const { error } = await db.from("equipment").insert(record);

  if (error) {
    console.error("Equipment save error:", error);
    message.innerHTML = `<span class="error-text">${escapeHtml(error.message)}</span>`;
    return;
  }

  await openSite(siteId);
}

/* --------------------------------------------------
   ADD SITE ITEM
-------------------------------------------------- */

function showAddSiteItemForm(siteId) {
  const grid = appView.querySelector(".grid");

  grid.innerHTML = `
    <section class="card" style="grid-column:1/-1;">
      <div class="section-heading">
        <div>
          <h2 style="margin:0;">Add Site Item</h2>
          <small>For fixed or non-powered items that do not need full equipment records.</small>
        </div>
        <button id="cancelSiteItem" type="button">← Back to Site</button>
      </div>

      <form id="siteItemForm">
        <div class="form-grid">
          <label>Name / ID
            <input id="siteItemName" type="text" required placeholder="Example: Supply Trailer 1">
          </label>

          <label>Type
            <select id="siteItemType">
              <option value="supply_trailer">Supply Trailer</option>
              <option value="bathroom">Bathroom</option>
              <option value="laydown">Laydown</option>
              <option value="connex">Connex / Sea Can</option>
              <option value="fuel_tank">Fuel Tank</option>
              <option value="water_tank">Water Tank</option>
              <option value="storage">Storage</option>
              <option value="other">Other</option>
            </select>
          </label>
        </div>

        <label>Description
          <textarea id="siteItemDescription" rows="4" placeholder="Optional description"></textarea>
        </label>

        <label>Notes
          <textarea id="siteItemNotes" rows="5" placeholder="Optional notes"></textarea>
        </label>

        <div class="location-box">
          <div class="section-heading">
            <div>
              <strong>Site Item GPS Location</strong><br>
              <small>Stand beside the item and save where it is located.</small>
            </div>
            <button id="setSiteItemLocation" type="button">📍 Set Current Location</button>
          </div>

          <div class="form-grid">
            <label>Latitude
              <input id="siteItemLatitude" type="number" step="any">
            </label>
            <label>Longitude
              <input id="siteItemLongitude" type="number" step="any">
            </label>
          </div>
          <input id="siteItemGpsAccuracy" type="hidden">
          <p id="siteItemLocationStatus" class="field-status"></p>
        </div>

        <div class="form-actions">
          <button type="submit">Save Site Item</button>
          <button id="cancelSiteItemBottom" type="button" class="secondary-button">Cancel</button>
        </div>
        <p id="siteItemFormMessage" class="field-status"></p>
      </form>
    </section>
  `;

  const back = () => openSite(siteId);
  document.querySelector("#cancelSiteItem").addEventListener("click", back);
  document.querySelector("#cancelSiteItemBottom").addEventListener("click", back);
  document.querySelector("#setSiteItemLocation").addEventListener("click", () => {
    captureCurrentLocation(
      "siteItemLatitude",
      "siteItemLongitude",
      "siteItemGpsAccuracy",
      "siteItemLocationStatus"
    );
  });
  document.querySelector("#siteItemForm").addEventListener("submit", (event) => {
    saveSiteItem(event, siteId);
  });
}

async function saveSiteItem(event, siteId) {
  event.preventDefault();
  const message = document.querySelector("#siteItemFormMessage");
  message.textContent = "Saving site item...";

  const valueOrNull = (id) => document.querySelector(`#${id}`).value.trim() || null;
  const numericOrNull = (id) => {
    const value = document.querySelector(`#${id}`).value;
    return value === "" ? null : Number(value);
  };

  const latitude = numericOrNull("siteItemLatitude");
  const longitude = numericOrNull("siteItemLongitude");
  const accuracy = numericOrNull("siteItemGpsAccuracy");

  const record = {
    site_id: siteId,
    name: document.querySelector("#siteItemName").value.trim(),
    item_type: document.querySelector("#siteItemType").value,
    description: valueOrNull("siteItemDescription"),
    notes: valueOrNull("siteItemNotes"),
    latitude,
    longitude,
    gps_accuracy_m: accuracy,
    gps_captured_at: accuracy != null ? new Date().toISOString() : null,
    gps_captured_by: accuracy != null ? currentUser.id : null,
    archived: false,
    created_by: currentUser.id,
    updated_by: currentUser.id
  };

  const { error } = await db.from("site_items").insert(record);

  if (error) {
    console.error("Site item save error:", error);
    message.innerHTML = `<span class="error-text">${escapeHtml(error.message)}</span>`;
    return;
  }

  await openSite(siteId);
}

/* --------------------------------------------------
   GPS SNAPSHOT
-------------------------------------------------- */

function captureCurrentLocation(latitudeId, longitudeId, accuracyId, statusId) {
  const status = document.querySelector(`#${statusId}`);

  if (!navigator.geolocation) {
    status.innerHTML = '<span class="error-text">Location is not supported by this device/browser.</span>';
    return;
  }

  status.textContent = "Getting current location...";

  navigator.geolocation.getCurrentPosition(
    (position) => {
      document.querySelector(`#${latitudeId}`).value = position.coords.latitude.toFixed(6);
      document.querySelector(`#${longitudeId}`).value = position.coords.longitude.toFixed(6);
      document.querySelector(`#${accuracyId}`).value = Math.round(position.coords.accuracy * 10) / 10;
      status.textContent = `Location captured — accuracy ±${Math.round(position.coords.accuracy)} m`;
    },
    (error) => {
      status.innerHTML = `<span class="error-text">Could not get location: ${escapeHtml(error.message)}</span>`;
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0
    }
  );
}

window.navigateToSite = function(latitude, longitude) {
  const destination =
    `${latitude},${longitude}`;

  window.open(
    `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`,
    "_blank",
    "noopener"
  );
};

/* --------------------------------------------------
   HELPERS
-------------------------------------------------- */

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* --------------------------------------------------
   START APP
-------------------------------------------------- */

async function startApp() {
  const {
    data: { session },
    error
  } = await db.auth.getSession();

  if (error) {
    console.error("Session error:", error);
    showLogin();
    return;
  }

  if (session?.user) {
    await loadProfile(session.user);
  } else {
    showLogin();
  }
}

startApp();
