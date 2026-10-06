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

  roleEl.textContent = String(profile.role || "viewer").toUpperCase();
  nameEl.textContent = `Welcome, ${profile.full_name || user.email}`;
  accountEl.textContent = user.email || "";

  showApp();
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
  showLogin();
  loginForm.reset();
  msg.textContent = "";
});

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
