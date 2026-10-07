/* V3 forgot-password and password recovery flow */
(function () {
  const baseUrl = `${window.location.origin}${window.location.pathname}`;
  const hash = String(window.location.hash || "");
  let recoveryMode = hash.includes("type=recovery");
  let recoveryShown = false;

  function addForgotPasswordControl() {
    if (!loginForm || document.querySelector("#forgotPasswordButton")) return;

    const signInButton = loginForm.querySelector('button[type="submit"], button:not([type])');
    if (!signInButton) return;

    const actions = document.createElement("div");
    actions.className = "form-actions";
    signInButton.parentNode.insertBefore(actions, signInButton);
    actions.appendChild(signInButton);

    const forgot = document.createElement("button");
    forgot.id = "forgotPasswordButton";
    forgot.type = "button";
    forgot.className = "secondary-button";
    forgot.textContent = "Forgot password?";
    forgot.addEventListener("click", showResetRequest);
    actions.appendChild(forgot);
  }

  function showResetRequest() {
    if (!loginView) return;

    const existing = document.querySelector("#passwordResetRequest");
    if (existing) {
      existing.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    const panel = document.createElement("div");
    panel.id = "passwordResetRequest";
    panel.className = "location-box";
    panel.style.marginTop = "18px";
    panel.innerHTML = `
      <strong>Reset your password</strong>
      <p><small>Enter your Forged Field PM Tracker email. We will send you a secure reset link.</small></p>
      <form id="passwordResetRequestForm">
        <label>Email
          <input id="passwordResetEmail" type="email" autocomplete="email" required value="${escapeHtml(document.querySelector("#email")?.value || "")}">
        </label>
        <div class="form-actions">
          <button type="submit">Send Reset Link</button>
          <button id="passwordResetCancel" type="button" class="secondary-button">Cancel</button>
        </div>
        <p id="passwordResetRequestMessage" class="field-status"></p>
      </form>`;

    loginForm.insertAdjacentElement("afterend", panel);

    document.querySelector("#passwordResetCancel").addEventListener("click", () => panel.remove());
    document.querySelector("#passwordResetRequestForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = document.querySelector("#passwordResetEmail").value.trim();
      const message = document.querySelector("#passwordResetRequestMessage");
      const submit = event.currentTarget.querySelector('button[type="submit"]');

      if (!email) return;

      submit.disabled = true;
      message.textContent = "Sending reset link...";

      const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: baseUrl });

      submit.disabled = false;
      if (error) {
        console.error("Password reset email error:", error);
        message.innerHTML = `<span class="error-text">${escapeHtml(error.message)}</span>`;
        return;
      }

      message.innerHTML = '<strong>Reset link sent. Check your email and open the link to choose a new password.</strong>';
    });
  }

  async function showRecoveryForm(session) {
    if (recoveryShown || !session?.user) return;
    recoveryShown = true;

    showLogin();
    loginView.innerHTML = `
      <h1>Forged Field PM Tracker <b>V3</b></h1>
      <p>Create a new password</p>
      <form id="passwordRecoveryForm">
        <label>New Password
          <input id="passwordRecoveryNew" type="password" minlength="8" autocomplete="new-password" required>
        </label>
        <label>Confirm Password
          <input id="passwordRecoveryConfirm" type="password" minlength="8" autocomplete="new-password" required>
        </label>
        <button type="submit">Save New Password</button>
        <p id="passwordRecoveryMessage" class="field-status"></p>
      </form>`;

    document.querySelector("#passwordRecoveryForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const password = document.querySelector("#passwordRecoveryNew").value;
      const confirm = document.querySelector("#passwordRecoveryConfirm").value;
      const message = document.querySelector("#passwordRecoveryMessage");
      const submit = event.currentTarget.querySelector('button[type="submit"]');

      if (password.length < 8) {
        message.innerHTML = '<span class="error-text">Use at least 8 characters.</span>';
        return;
      }
      if (password !== confirm) {
        message.innerHTML = '<span class="error-text">The passwords do not match.</span>';
        return;
      }

      submit.disabled = true;
      message.textContent = "Saving new password...";

      const { error } = await db.auth.updateUser({ password });
      if (error) {
        submit.disabled = false;
        message.innerHTML = `<span class="error-text">${escapeHtml(error.message)}</span>`;
        return;
      }

      message.innerHTML = '<strong>Password changed. Returning to sign in...</strong>';
      await db.auth.signOut();
      setTimeout(() => window.location.replace(baseUrl), 700);
    });
  }

  addForgotPasswordControl();

  if (recoveryMode) {
    db.auth.getSession().then(({ data }) => {
      if (data?.session?.user) showRecoveryForm(data.session);
    });
  }

  db.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") {
      recoveryMode = true;
      setTimeout(() => showRecoveryForm(session), 0);
    }
  });
})();
