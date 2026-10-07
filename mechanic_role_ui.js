/* V3 mechanic role: full operational access, no user administration */
(function () {
  const baseShowUsersManagement = window.showUsersManagement;

  const setTextIfChanged = (el, value) => {
    if (el && el.textContent !== value) el.textContent = value;
  };

  const setHtmlIfChanged = (el, value) => {
    if (el && el.innerHTML !== value) el.innerHTML = value;
  };

  function roleText(card) {
    const el = card.querySelector(".section-heading span strong");
    return String(el?.textContent || "").trim().toLowerCase();
  }

  function decorateUserCards() {
    document.querySelectorAll("article.inset-card.compact-card").forEach(card => {
      if (roleText(card) !== "mechanic") return;
      const accessLine = Array.from(card.querySelectorAll("p small")).find(el =>
        String(el.textContent || "").trim().toLowerCase().startsWith("site access:")
      );
      setHtmlIfChanged(accessLine, "<strong>Site access:</strong> All sites");
    });
  }

  function configureRoleForm() {
    const inviteRole = document.querySelector("#inviteRole");
    const editRole = document.querySelector("#editUserRole");
    const roleSelect = inviteRole || editRole;
    if (!roleSelect) return;

    const section = document.querySelector(inviteRole ? "#inviteSiteSection" : "#editUserSiteSection");
    const description = document.querySelector(inviteRole ? "#inviteRoleDescription" : "#editUserRoleDescription");
    if (!section) return;

    const sync = () => {
      const role = roleSelect.value;
      const checkboxes = section.querySelectorAll("input.userSiteCheck");
      const note = section.querySelector(".siteRoleNote");

      if (role === "mechanic") {
        checkboxes.forEach(input => {
          input.checked = true;
          input.disabled = true;
        });
        section.style.opacity = ".55";
        setTextIfChanged(note, "Mechanics automatically have access to all sites. User management remains Owner/Admin only.");
        setTextIfChanged(description, "Full operational access across all sites, except user management.");
        return;
      }

      if (["owner", "admin"].includes(role)) {
        checkboxes.forEach(input => { input.disabled = true; });
        section.style.opacity = ".55";
        setTextIfChanged(note, "Owner and Admin roles automatically have access to all sites.");
        return;
      }

      checkboxes.forEach(input => { input.disabled = false; });
      section.style.opacity = "1";
      setTextIfChanged(note, "Select the job sites this user can access.");
    };

    if (!roleSelect.dataset.mechanicRolePatched) {
      roleSelect.dataset.mechanicRolePatched = "true";
      roleSelect.addEventListener("change", () => setTimeout(sync, 0));
    }
    sync();
  }

  if (typeof baseShowUsersManagement === "function") {
    window.showUsersManagement = async function () {
      await baseShowUsersManagement();
      decorateUserCards();
      configureRoleForm();
    };
  }

  // Users/forms are rendered dynamically. Observe child changes, but keep every
  // patch idempotent so our own UI updates cannot trigger a render loop.
  const observer = new MutationObserver(() => {
    decorateUserCards();
    configureRoleForm();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  setTimeout(() => {
    decorateUserCards();
    configureRoleForm();
  }, 0);
})();
