const SUPABASE_URL = "https://eaehrhqsqmlcjcuzeyoh.supabase.co";
const SUPABASE_KEY = "sb_publishable_QOyuqtY9-qvW4X8nIzBi1w_RHVqjU7f";

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --------------------------------------------------
// ELEMENTS
// --------------------------------------------------

const loginView = document.querySelector("#loginView");
const appView = document.querySelector("#appView");
const dashboardView = document.querySelector("#dashboardView");
const sitesView = document.querySelector("#sitesView");

const loginForm = document.querySelector("#loginForm");
const msg = document.querySelector("#msg");

const roleEl = document.querySelector("#role");
const nameEl = document.querySelector("#name");
const accountEl = document.querySelector("#account");

const logoutBtn = document.querySelector("#logout");

const sitesButton = document.querySelector("#sitesButton");
const backDashboard = document.querySelector("#backDashboard");
const addSiteButton = document.querySelector("#addSiteButton");

const sitesList = document.querySelector("#sitesList");
const sitesMessage = document.querySelector("#sitesMessage");


// --------------------------------------------------
// MAIN VIEWS
// --------------------------------------------------

function showLogin() {
  loginView.classList.remove("hidden");
  appView.classList.add("hidden");
}

function showApp() {
  loginView.classList.add("hidden");
  appView.classList.remove("hidden");

  showDashboard();
}

function showDashboard() {
  dashboardView.classList.remove("hidden");
  sitesView.classList.add("hidden");
}

function showSites() {
  dashboardView.classList.add("hidden");
  sitesView.classList.remove("hidden");

  loadSites();
}


// --------------------------------------------------
// PROFILE
// --------------------------------------------------

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

  roleEl.textContent = String(profile.role || "viewer").toUpperCase();
  nameEl.textContent = `Welcome, ${profile.full_name || user.email}`;
  accountEl.textContent = user.email || "";

  showApp();
}


// --------------------------------------------------
// SITES
// --------------------------------------------------

async function loadSites() {
  sitesMessage.textContent = "";
  sitesList.innerHTML = "<p>Loading sites...</p>";

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
    .order("name", { ascending: true });

  if (error) {
    console.error("Sites lookup error:", error);

    sitesList.innerHTML = "";
    sitesMessage.textContent =
      "Sites could not be loaded. Check the database connection and permissions.";

    return;
  }

  if (!sites || sites.length === 0) {
    sitesList.innerHTML = `
      <div class="empty-state">
        <h3>No job sites yet</h3>
        <p>Add your first Forged Drilling job site.</p>
      </div>
    `;

    return;
  }

  sitesList.innerHTML = "";

  sites.forEach((site) => {
    const siteCard = document.createElement("div");
    siteCard.className = "site-card";

    let rotation = "No rotation";

    if (site.rotation_type === "14_7") {
      rotation = "14 days on / 7 days off";
    } else if (site.rotation_type === "20_10") {
      rotation = "20 days on / 10 days off";
    } else if (site.rotation_type === "custom") {
      rotation =
        `${site.rotation_on_days || 0} days on / ` +
        `${site.rotation_off_days || 0} days off`;
    }

    const description = site.description
      ? `<p>${escapeHtml(site.description)}</p>`
      : "";

    const accessNotes = site.access_notes
      ? `<small><strong>Access:</strong> ${escapeHtml(site.access_notes)}</small>`
      : "";

    siteCard.innerHTML = `
      <div>
        <h3>${escapeHtml(site.name)}</h3>
        ${description}
        <small><strong>Rotation:</strong> ${rotation}</small><br>
        ${accessNotes}
      </div>

      <button
        type="button"
        class="open-site-button"
        data-site-id="${site.id}">
        Open Site
      </button>
    `;

    sitesList.appendChild(siteCard);
  });
}


// --------------------------------------------------
// SAFE TEXT OUTPUT
// --------------------------------------------------

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


// --------------------------------------------------
// LOGIN
// --------------------------------------------------

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


// --------------------------------------------------
// LOGOUT
// --------------------------------------------------

logoutBtn.addEventListener("click", async () => {
  await db.auth.signOut();

  showLogin();

  loginForm.reset();
  msg.textContent = "";
});


// --------------------------------------------------
// NAVIGATION
// --------------------------------------------------

sitesButton.addEventListener("click", () => {
  showSites();
});

backDashboard.addEventListener("click", () => {
  showDashboard();
});


// --------------------------------------------------
// ADD SITE
// --------------------------------------------------

addSiteButton.addEventListener("click", () => {
  sitesMessage.textContent =
    "Add Site form is the next V3 feature.";
});


// --------------------------------------------------
// START APP
// --------------------------------------------------

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
