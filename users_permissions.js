/* V3 users, roles and site access management */
(function () {
  const baseRenderDashboard = window.renderDashboard;
  if (typeof baseRenderDashboard !== "function") return;

  const roleLabel = value => String(value || "viewer").replace(/\b\w/g, c => c.toUpperCase());
  const formatDate = value => {
    if (!value) return "Never";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString(undefined, {
      year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
    });
  };

  const roleDescription = {
    owner: "Full control of the tracker, users and every site.",
    admin: "Administrative access to all sites and user management.",
    mechanic: "Can maintain equipment, PMs and work tickets on assigned sites.",
    operator: "Can access assigned sites and report work tickets.",
    viewer: "Read-only access to assigned sites."
  };

  window.renderDashboard = function () {
    baseRenderDashboard();
    addUsersCard();
  };

  async function addUsersCard() {
    if (!currentProfile || !["owner", "admin"].includes(currentProfile.role)) return;
    const grid = appView.querySelector(".grid");
    if (!grid || document.querySelector("#usersCard")) return;

    const card = document.createElement("button");
    card.className = "card dashboard-card";
    card.id = "usersCard";
    card.type = "button";
    card.innerHTML = `<strong>Users & Access</strong><small>Loading team access…</small>`;
    card.addEventListener("click", () => window.showUsersManagement());
    grid.appendChild(card);

    const { data, error } = await db.rpc("admin_list_users");
    if (error || !document.querySelector("#usersCard")) return;
    const active = (data || []).filter(user => user.active).length;
    const small = card.querySelector("small");
    if (small) small.textContent = `${active} active user${active === 1 ? "" : "s"}`;
  }

  async function loadUsersAndSites() {
    const [usersResult, sitesResult] = await Promise.all([
      db.rpc("admin_list_users"),
      db.from("sites").select("id,name").eq("archived", false).order("name")
    ]);
    return {
      users: usersResult.data || [],
      sites: sitesResult.data || [],
      error: usersResult.error || sitesResult.error
    };
  }

  function siteNamesFor(user, sites) {
    if (["owner", "admin"].includes(user.role)) return "All sites";
    const ids = new Set(user.site_ids || []);
    const names = sites.filter(site => ids.has(site.id)).map(site => site.name);
    return names.length ? names.join(", ") : "No sites assigned";
  }

  window.showUsersManagement = async function () {
    const grid = appView.querySelector(".grid");
    grid.innerHTML = `<section class="card" style="grid-column:1/-1;"><p>Loading users and permissions...</p></section>`;

    const { users, sites, error } = await loadUsersAndSites();
    if (error) {
      grid.innerHTML = `<section class="card" style="grid-column:1/-1;"><h2>Users could not be loaded</h2><p class="error-text">${escapeHtml(error.message)}</p><button id="usersBack">← Dashboard</button></section>`;
      document.querySelector("#usersBack").addEventListener("click", window.renderDashboard);
      return;
    }

    const activeCount = users.filter(user => user.active).length;
    const disabledCount = users.filter(user => !user.active).length;

    const cards = users.length ? users.map(user => {
      const protectedFromAdmin = currentProfile.role === "admin" && ["owner", "admin"].includes(user.role);
      const self = currentUser && user.user_id === currentUser.id;
      return `
        <article class="inset-card compact-card" style="margin-top:10px;${user.active ? "" : "opacity:.68;"}">
          <div class="section-heading">
            <div>
              <strong>${escapeHtml(user.full_name || user.email)}</strong><br>
              <small>${escapeHtml(user.email || "")}</small>
            </div>
            <span><strong>${escapeHtml(roleLabel(user.role))}</strong>${user.active ? "" : " · Disabled"}</span>
          </div>
          <p><small><strong>Site access:</strong> ${escapeHtml(siteNamesFor(user, sites))}</small></p>
          <p><small><strong>Last sign in:</strong> ${escapeHtml(formatDate(user.last_sign_in_at))}</small></p>
          <div class="form-actions compact-actions">
            ${protectedFromAdmin ? `<small>Owner/Admin accounts are managed by an Owner.</small>` : `<button type="button" class="editUserAccess" data-id="${escapeHtml(user.user_id)}">Edit Access</button>`}
            ${self ? `<small>This is your account.</small>` : ""}
          </div>
        </article>`;
    }).join("") : `<div class="empty-state"><strong>No user accounts found.</strong></div>`;

    grid.innerHTML = `
      <section class="card" style="grid-column:1/-1;">
        <div class="section-heading">
          <div>
            <h2 style="margin:0;">Users & Access</h2>
            <small>Invite-only access, roles and job-site permissions</small>
          </div>
          <div class="form-actions compact-actions">
            <button id="usersBack" type="button">← Dashboard</button>
            ${currentProfile.role === "owner" ? `<button id="manualViewerButton" type="button">+ Manual Viewer Login</button>` : ""}
            <button id="inviteUserButton" type="button">+ Invite User</button>
          </div>
        </div>

        <div class="detail-grid" style="margin-top:18px;">
          <div class="detail-item"><small>Total</small><strong>${users.length}</strong></div>
          <div class="detail-item"><small>Active</small><strong>${activeCount}</strong></div>
          <div class="detail-item"><small>Disabled</small><strong>${disabledCount}</strong></div>
        </div>

        <div style="margin-top:20px;">${cards}</div>
      </section>`;

    document.querySelector("#usersBack").addEventListener("click", window.renderDashboard);
    document.querySelector("#inviteUserButton").addEventListener("click", () => showInviteUserForm(sites));
    const manualViewerButton = document.querySelector("#manualViewerButton");
    if (manualViewerButton) manualViewerButton.addEventListener("click", () => showManualViewerForm(sites));
    document.querySelectorAll(".editUserAccess").forEach(button => {
      button.addEventListener("click", () => {
        const user = users.find(row => row.user_id === button.dataset.id);
        if (user) showEditUserForm(user, sites);
      });
    });
  };

  function siteCheckboxes(sites, selectedIds = []) {
    const selected = new Set(selectedIds || []);
    if (!sites.length) return `<div class="empty-state"><strong>No active sites are available.</strong></div>`;
    return sites.map(site => `
      <label class="inset-card compact-card" style="display:flex;align-items:center;gap:10px;margin-top:8px;">
        <input class="userSiteCheck" type="checkbox" value="${escapeHtml(site.id)}" ${selected.has(site.id) ? "checked" : ""} style="width:auto;">
        <span>${escapeHtml(site.name)}</span>
      </label>`).join("");
  }

  function selectedSiteIds() {
    return Array.from(document.querySelectorAll(".userSiteCheck:checked")).map(input => input.value);
  }

  function updateRoleSiteUi(roleSelectId, siteSectionId) {
    const role = document.querySelector(`#${roleSelectId}`)?.value;
    const section = document.querySelector(`#${siteSectionId}`);
    if (!section) return;
    const allSites = role === "owner" || role === "admin";
    section.style.opacity = allSites ? ".55" : "1";
    section.querySelectorAll("input[type=checkbox]").forEach(input => { input.disabled = allSites; });
    const note = section.querySelector(".siteRoleNote");
    if (note) note.textContent = allSites ? "Owner and Admin roles automatically have access to all sites." : "Select the job sites this user can access.";
  }

  function allowedRoleOptions(selected = "viewer") {
    const roles = currentProfile.role === "owner"
      ? ["owner", "admin", "mechanic", "operator", "viewer"]
      : ["mechanic", "operator", "viewer"];
    return roles.map(role => `<option value="${role}" ${role === selected ? "selected" : ""}>${escapeHtml(roleLabel(role))}</option>`).join("");
  }

  function showManualViewerForm(sites) {
    const grid = appView.querySelector(".grid");
    const allSiteIds = sites.map(site => site.id);
    grid.innerHTML = `
      <section class="card" style="grid-column:1/-1;">
        <div class="section-heading">
          <div>
            <h2 style="margin:0;">Create Manual Viewer Login</h2>
            <small>Create a read-only login now and send the credentials yourself whenever you are ready.</small>
          </div>
          <button id="manualViewerBack" type="button">← Users</button>
        </div>

        <div class="location-box" style="margin-top:18px;">
          <strong>Read-only test account</strong>
          <p style="margin-bottom:0;">No invitation email is sent. A login and random password are created and shown to you once so you can copy them into a text or email later.</p>
        </div>

        <form id="manualViewerForm" style="margin-top:18px;">
          <div class="form-grid">
            <label>Display Name<input id="manualViewerName" type="text" required value="Manager Demo"></label>
            <label>Login Label<input id="manualViewerLoginName" type="text" required value="manager-demo"><small>This becomes part of the sign-in email.</small></label>
            <label>Role<input type="text" value="Viewer — Read Only" disabled></label>
          </div>

          <div class="location-box" style="margin-top:18px;">
            <strong>Site Access</strong><br>
            <small>All current active sites are selected by default. Uncheck any you do not want the demo account to see.</small>
            <div style="margin-top:8px;">${siteCheckboxes(sites, allSiteIds)}</div>
          </div>

          <div class="form-actions">
            <button type="submit">Create Manual Viewer Login</button>
            <button id="manualViewerCancel" type="button" class="secondary-button">Cancel</button>
          </div>
          <p id="manualViewerMessage" class="field-status"></p>
        </form>
      </section>`;

    const goBack = () => window.showUsersManagement();
    document.querySelector("#manualViewerBack").addEventListener("click", goBack);
    document.querySelector("#manualViewerCancel").addEventListener("click", goBack);

    document.querySelector("#manualViewerForm").addEventListener("submit", async event => {
      event.preventDefault();
      const message = document.querySelector("#manualViewerMessage");
      const siteIds = selectedSiteIds();
      if (!siteIds.length) {
        message.innerHTML = '<span class="error-text">Select at least one site for the Viewer account.</span>';
        return;
      }

      message.textContent = "Creating read-only login...";
      const { data, error } = await db.functions.invoke("invite-user", {
        body: {
          mode: "manual_viewer",
          full_name: document.querySelector("#manualViewerName").value.trim(),
          login_name: document.querySelector("#manualViewerLoginName").value.trim(),
          role: "viewer",
          site_ids: siteIds
        }
      });

      if (error || data?.error) {
        const text = data?.error || error?.message || "Manual Viewer login could not be created.";
        message.innerHTML = `<span class="error-text">${escapeHtml(text)}</span>`;
        return;
      }

      const siteUrl = "https://fearincognito.github.io/forged-field-pm-tracker-v3/";
      const loginText = `Forged Field PM Tracker V3\n${siteUrl}\n\nLogin: ${data.email}\nPassword: ${data.password}\n\nAccess: Viewer (read only)`;

      grid.innerHTML = `
        <section class="card" style="grid-column:1/-1;">
          <div class="section-heading">
            <div><h2 style="margin:0;">Manual Viewer Login Created</h2><small>Copy these details before leaving this page.</small></div>
            <button id="manualViewerDone" type="button">Done</button>
          </div>

          <div class="location-box" style="margin-top:18px;">
            <strong>Important</strong>
            <p style="margin-bottom:0;">The password is only displayed here. The account itself remains available in Users & Access and can be disabled later.</p>
          </div>

          <div class="detail-grid" style="margin-top:18px;">
            <div class="detail-item"><small>Website</small><strong>${escapeHtml(siteUrl)}</strong></div>
            <div class="detail-item"><small>Login</small><strong>${escapeHtml(data.email)}</strong></div>
            <div class="detail-item"><small>Password</small><strong>${escapeHtml(data.password)}</strong></div>
            <div class="detail-item"><small>Access</small><strong>Viewer — Read Only</strong></div>
          </div>

          <div class="form-actions" style="margin-top:18px;">
            <button id="copyManualViewerLogin" type="button">Copy Login Details</button>
            <button id="manualViewerDoneBottom" type="button" class="secondary-button">Done</button>
          </div>
          <p id="copyManualViewerMessage" class="field-status"></p>
        </section>`;

      const done = () => window.showUsersManagement();
      document.querySelector("#manualViewerDone").addEventListener("click", done);
      document.querySelector("#manualViewerDoneBottom").addEventListener("click", done);
      document.querySelector("#copyManualViewerLogin").addEventListener("click", async () => {
        const copyMessage = document.querySelector("#copyManualViewerMessage");
        try {
          await navigator.clipboard.writeText(loginText);
          copyMessage.innerHTML = "<strong>Login details copied.</strong>";
        } catch (copyError) {
          console.error("Copy login details error:", copyError);
          copyMessage.textContent = "Copy was blocked by the browser. Select the login and password above and copy them manually.";
        }
      });
    });
  }

  function showInviteUserForm(sites) {
    const grid = appView.querySelector(".grid");
    grid.innerHTML = `
      <section class="card" style="grid-column:1/-1;">
        <div class="section-heading">
          <div><h2 style="margin:0;">Invite User</h2><small>The user will receive an email invitation to create their password.</small></div>
          <button id="inviteBack" type="button">← Users</button>
        </div>

        <form id="inviteUserForm" style="margin-top:18px;">
          <div class="form-grid">
            <label>Full Name<input id="inviteFullName" type="text" required placeholder="Example: Adam Smith"></label>
            <label>Email<input id="inviteEmail" type="email" required placeholder="name@forgeddrilling.com"></label>
            <label>Role
              <select id="inviteRole">${allowedRoleOptions("mechanic")}</select>
              <small id="inviteRoleDescription">${escapeHtml(roleDescription.mechanic)}</small>
            </label>
          </div>

          <div id="inviteSiteSection" class="location-box" style="margin-top:18px;">
            <strong>Site Access</strong><br>
            <small class="siteRoleNote">Select the job sites this user can access.</small>
            <div style="margin-top:8px;">${siteCheckboxes(sites)}</div>
          </div>

          <div class="form-actions">
            <button type="submit">Send Invitation</button>
            <button id="inviteCancel" type="button" class="secondary-button">Cancel</button>
          </div>
          <p id="inviteMessage" class="field-status"></p>
        </form>
      </section>`;

    const goBack = () => window.showUsersManagement();
    document.querySelector("#inviteBack").addEventListener("click", goBack);
    document.querySelector("#inviteCancel").addEventListener("click", goBack);
    const roleSelect = document.querySelector("#inviteRole");
    roleSelect.addEventListener("change", () => {
      document.querySelector("#inviteRoleDescription").textContent = roleDescription[roleSelect.value] || "";
      updateRoleSiteUi("inviteRole", "inviteSiteSection");
    });
    updateRoleSiteUi("inviteRole", "inviteSiteSection");

    document.querySelector("#inviteUserForm").addEventListener("submit", async event => {
      event.preventDefault();
      const message = document.querySelector("#inviteMessage");
      const role = roleSelect.value;
      const sitesSelected = selectedSiteIds();
      if (!["owner", "admin"].includes(role) && !sitesSelected.length) {
        message.innerHTML = '<span class="error-text">Select at least one site for this user.</span>';
        return;
      }

      message.textContent = "Sending invitation...";
      const { data, error } = await db.functions.invoke("invite-user", {
        body: {
          full_name: document.querySelector("#inviteFullName").value.trim(),
          email: document.querySelector("#inviteEmail").value.trim(),
          role,
          site_ids: ["owner", "admin"].includes(role) ? [] : sitesSelected
        }
      });

      if (error || data?.error) {
        const text = data?.error || error?.message || "Invitation could not be sent.";
        message.innerHTML = `<span class="error-text">${escapeHtml(text)}</span>`;
        return;
      }

      message.innerHTML = '<strong>Invitation sent. The user can finish setup from the email link.</strong>';
      setTimeout(() => window.showUsersManagement(), 1200);
    });
  }

  function showEditUserForm(user, sites) {
    const grid = appView.querySelector(".grid");
    const self = currentUser && user.user_id === currentUser.id;
    grid.innerHTML = `
      <section class="card" style="grid-column:1/-1;">
        <div class="section-heading">
          <div><h2 style="margin:0;">Edit User Access</h2><small>${escapeHtml(user.email || "")}</small></div>
          <button id="editUserBack" type="button">← Users</button>
        </div>

        <form id="editUserForm" style="margin-top:18px;">
          <div class="form-grid">
            <label>Full Name<input id="editUserName" type="text" required value="${escapeHtml(user.full_name || "")}"></label>
            <label>Role
              <select id="editUserRole">${allowedRoleOptions(user.role)}</select>
              <small id="editUserRoleDescription">${escapeHtml(roleDescription[user.role] || "")}</small>
            </label>
            <label>Account Status
              <select id="editUserActive" ${self ? "disabled" : ""}>
                <option value="true" ${user.active ? "selected" : ""}>Active</option>
                <option value="false" ${!user.active ? "selected" : ""}>Disabled</option>
              </select>
              ${self ? `<small>You cannot disable your own account.</small>` : `<small>Disabled users cannot sign in, but their history is preserved.</small>`}
            </label>
          </div>

          <div id="editUserSiteSection" class="location-box" style="margin-top:18px;">
            <strong>Site Access</strong><br>
            <small class="siteRoleNote">Select the job sites this user can access.</small>
            <div style="margin-top:8px;">${siteCheckboxes(sites, user.site_ids || [])}</div>
          </div>

          <div class="form-actions">
            <button type="submit">Save User Access</button>
            <button id="editUserCancel" type="button" class="secondary-button">Cancel</button>
          </div>
          <p id="editUserMessage" class="field-status"></p>
        </form>
      </section>`;

    const goBack = () => window.showUsersManagement();
    document.querySelector("#editUserBack").addEventListener("click", goBack);
    document.querySelector("#editUserCancel").addEventListener("click", goBack);
    const roleSelect = document.querySelector("#editUserRole");
    roleSelect.addEventListener("change", () => {
      document.querySelector("#editUserRoleDescription").textContent = roleDescription[roleSelect.value] || "";
      updateRoleSiteUi("editUserRole", "editUserSiteSection");
    });
    updateRoleSiteUi("editUserRole", "editUserSiteSection");

    document.querySelector("#editUserForm").addEventListener("submit", async event => {
      event.preventDefault();
      const message = document.querySelector("#editUserMessage");
      const role = roleSelect.value;
      const sitesSelected = selectedSiteIds();
      if (!["owner", "admin"].includes(role) && !sitesSelected.length) {
        message.innerHTML = '<span class="error-text">Select at least one site for this user.</span>';
        return;
      }

      message.textContent = "Saving user access...";
      const activeSelect = document.querySelector("#editUserActive");
      const active = self ? true : activeSelect.value === "true";
      const { error } = await db.rpc("admin_update_user", {
        p_user_id: user.user_id,
        p_full_name: document.querySelector("#editUserName").value.trim(),
        p_role: role,
        p_active: active,
        p_site_ids: ["owner", "admin"].includes(role) ? [] : sitesSelected
      });

      if (error) {
        message.innerHTML = `<span class="error-text">${escapeHtml(error.message)}</span>`;
        return;
      }

      message.innerHTML = '<strong>User access saved.</strong>';
      setTimeout(() => window.showUsersManagement(), 900);
    });
  }

  setTimeout(() => addUsersCard(), 0);
})();