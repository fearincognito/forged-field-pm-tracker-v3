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
   SITE DETAILS PLACEHOLDER
-------------------------------------------------- */

window.openSite = function(siteId) {
  const grid = appView.querySelector(".grid");

  grid.innerHTML = `
    <section class="card" style="grid-column:1/-1;">
      <h2>Site Details</h2>

      <p>
        Site ID:
        <strong>${escapeHtml(siteId)}</strong>
      </p>

      <p>
        Site equipment, inventory, pack lists and maintenance
        information will connect here next.
      </p>

      <button id="backSites" type="button">
        ← Back to Sites
      </button>
    </section>
  `;

  document
    .querySelector("#backSites")
    .addEventListener("click", renderSites);
};

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
