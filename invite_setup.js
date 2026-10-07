/* Invited-user password setup flow */
(function () {
  const params = new URLSearchParams(window.location.search);
  const inviteMode = params.get("invite") === "1" || window.location.hash.includes("type=invite");
  if (!inviteMode) return;

  let shown = false;

  async function showPasswordSetup() {
    if (shown) return;
    const { data: { session } } = await db.auth.getSession();
    if (!session?.user) return;
    shown = true;

    showApp();
    const grid = appView.querySelector(".grid");
    grid.innerHTML = `
      <section class="card" style="grid-column:1/-1;max-width:620px;margin:0 auto;">
        <h2 style="margin-top:0;">Finish Account Setup</h2>
        <p>Your Forged Field PM Tracker invitation has been accepted. Create the password you will use to sign in.</p>
        <form id="invitePasswordForm">
          <label>New Password
            <input id="invitePassword" type="password" minlength="8" autocomplete="new-password" required>
          </label>
          <label>Confirm Password
            <input id="invitePasswordConfirm" type="password" minlength="8" autocomplete="new-password" required>
          </label>
          <div class="form-actions"><button type="submit">Save Password</button></div>
          <p id="invitePasswordMessage" class="field-status"></p>
        </form>
      </section>`;

    document.querySelector("#invitePasswordForm").addEventListener("submit", async event => {
      event.preventDefault();
      const message = document.querySelector("#invitePasswordMessage");
      const password = document.querySelector("#invitePassword").value;
      const confirm = document.querySelector("#invitePasswordConfirm").value;

      if (password.length < 8) {
        message.innerHTML = '<span class="error-text">Use at least 8 characters.</span>';
        return;
      }
      if (password !== confirm) {
        message.innerHTML = '<span class="error-text">The passwords do not match.</span>';
        return;
      }

      message.textContent = "Saving password...";
      const { error } = await db.auth.updateUser({ password });
      if (error) {
        message.innerHTML = `<span class="error-text">${escapeHtml(error.message)}</span>`;
        return;
      }

      history.replaceState({}, "", window.location.pathname);
      message.innerHTML = '<strong>Password saved. Loading your dashboard...</strong>';

      const { data: { user } } = await db.auth.getUser();
      if (user && typeof loadProfile === "function") {
        await loadProfile(user);
      } else if (typeof window.renderDashboard === "function") {
        window.renderDashboard();
      }
    });
  }

  showPasswordSetup();
  db.auth.onAuthStateChange((_event, session) => {
    if (session?.user) setTimeout(showPasswordSetup, 0);
  });
})();
