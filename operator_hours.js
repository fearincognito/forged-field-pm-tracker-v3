/* V3 operator permission: assigned-site operators may update hour meters only. */
(function () {
  const baseOpenEquipment = window.openEquipment;
  if (typeof baseOpenEquipment !== "function") return;

  function role() {
    return String(currentProfile?.role || "").toLowerCase();
  }

  async function showOperatorHoursForm(equipmentId, siteId) {
    const grid = appView.querySelector(".grid");
    grid.innerHTML = `<section class="card" style="grid-column:1/-1;"><p>Loading equipment...</p></section>`;

    const { data: machine, error } = await db
      .from("equipment")
      .select("id,unit_number,name,current_hours")
      .eq("id", equipmentId)
      .single();

    if (error || !machine) {
      grid.innerHTML = `
        <section class="card" style="grid-column:1/-1;">
          <h2>Equipment could not be loaded</h2>
          <p class="error-text">${escapeHtml(error?.message || "Unknown error")}</p>
          <button id="operatorHoursBack" type="button">← Back to Equipment</button>
        </section>`;
      document.querySelector("#operatorHoursBack").addEventListener("click", () => window.openEquipment(equipmentId, siteId));
      return;
    }

    const current = machine.current_hours == null ? null : Number(machine.current_hours);

    grid.innerHTML = `
      <section class="card" style="grid-column:1/-1;">
        <div class="section-heading">
          <div>
            <h2 style="margin:0;">Update Engine Hours</h2>
            <small>${escapeHtml(machine.unit_number || machine.name)}</small>
          </div>
          <button id="operatorHoursBack" type="button">← Back to Equipment</button>
        </div>

        <div class="location-box" style="margin-top:18px;">
          <small>Current recorded hours</small><br>
          <strong style="font-size:24px;">${current == null ? "—" : escapeHtml(current)}</strong>
        </div>

        <form id="operatorHoursForm" style="margin-top:18px;">
          <label>
            New Hour Meter Reading
            <input id="operatorHoursValue" type="number" min="${current == null ? 0 : current}" step="0.1" required value="${current == null ? "" : escapeHtml(current)}">
          </label>
          <small>Operators can update the hour meter only. The reading cannot be moved backwards.</small>

          <div class="form-actions">
            <button type="submit">Save Hours</button>
            <button id="operatorHoursCancel" type="button" class="secondary-button">Cancel</button>
          </div>
          <p id="operatorHoursMessage" class="field-status"></p>
        </form>
      </section>`;

    const goBack = () => window.openEquipment(equipmentId, siteId);
    document.querySelector("#operatorHoursBack").addEventListener("click", goBack);
    document.querySelector("#operatorHoursCancel").addEventListener("click", goBack);

    document.querySelector("#operatorHoursForm").addEventListener("submit", async event => {
      event.preventDefault();
      const message = document.querySelector("#operatorHoursMessage");
      const newHours = Number(document.querySelector("#operatorHoursValue").value);

      if (!Number.isFinite(newHours) || newHours < 0) {
        message.innerHTML = '<span class="error-text">Enter a valid non-negative hour reading.</span>';
        return;
      }
      if (current != null && newHours < current) {
        message.innerHTML = `<span class="error-text">The new reading cannot be lower than ${escapeHtml(current)} hrs.</span>`;
        return;
      }

      message.textContent = "Saving hours...";
      const { error: updateError } = await db.rpc("update_equipment_hours", {
        p_equipment_id: equipmentId,
        p_new_hours: newHours
      });

      if (updateError) {
        console.error("Operator hours update error:", updateError);
        message.innerHTML = `<span class="error-text">${escapeHtml(updateError.message)}</span>`;
        return;
      }

      await window.openEquipment(equipmentId, siteId);
    });
  }

  window.openEquipment = async function (equipmentId, siteId) {
    await baseOpenEquipment(equipmentId, siteId);

    const currentRole = role();
    if (currentRole === "viewer") {
      document.querySelector("#quickHoursButton")?.remove();
      document.querySelector("#editEquipmentButton")?.remove();
      return;
    }

    if (currentRole !== "operator") return;

    // Operators get the narrow hour-meter workflow, not full equipment editing.
    document.querySelector("#editEquipmentButton")?.remove();

    const oldButton = document.querySelector("#quickHoursButton");
    if (!oldButton) return;
    const newButton = oldButton.cloneNode(true);
    oldButton.replaceWith(newButton);
    newButton.addEventListener("click", () => showOperatorHoursForm(equipmentId, siteId));
  };

  function updateOperatorRoleDescription() {
    const inviteRole = document.querySelector("#inviteRole");
    const editRole = document.querySelector("#editUserRole");
    const select = inviteRole || editRole;
    if (!select || select.value !== "operator") return;
    const description = document.querySelector(inviteRole ? "#inviteRoleDescription" : "#editUserRoleDescription");
    if (description) description.textContent = "Can view assigned sites, update equipment hours and report work tickets.";
  }

  const observer = new MutationObserver(updateOperatorRoleDescription);
  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener("change", event => {
    if (event.target?.id === "inviteRole" || event.target?.id === "editUserRole") {
      setTimeout(updateOperatorRoleDescription, 0);
    }
  });
})();
