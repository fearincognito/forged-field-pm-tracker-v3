/* V3 equipment move / archive / restore workflow */
(function () {
  const baseOpenEquipment = window.openEquipment;
  const baseShowDashboardEquipment = window.showDashboardEquipment;

  if (typeof baseOpenEquipment !== "function" || typeof baseShowDashboardEquipment !== "function") {
    console.error("equipment_lifecycle.js loaded before equipment workflows");
    return;
  }

  const canManageLifecycle = () => ["owner", "admin"].includes(String(currentProfile?.role || "").toLowerCase());
  const eqLabel = machine => machine.unit_number || machine.name || "Equipment";

  async function getMachine(equipmentId) {
    return db.from("equipment")
      .select("id,site_id,unit_number,name,status,archived,latitude,longitude")
      .eq("id", equipmentId)
      .single();
  }

  async function getActiveSites() {
    return db.from("sites").select("id,name,archived").eq("archived", false).order("name");
  }

  window.openEquipment = async function (equipmentId, siteId) {
    await baseOpenEquipment(equipmentId, siteId);
    if (!canManageLifecycle()) return;

    const back = document.querySelector("#equipmentBackSite");
    const actions = back?.parentElement;
    if (!actions || document.querySelector("#moveEquipmentButton")) return;

    const move = document.createElement("button");
    move.id = "moveEquipmentButton";
    move.type = "button";
    move.textContent = "Move Equipment";
    move.addEventListener("click", () => showMoveEquipmentForm(equipmentId, siteId));

    const archive = document.createElement("button");
    archive.id = "archiveEquipmentButton";
    archive.type = "button";
    archive.className = "secondary-button";
    archive.textContent = "Archive Equipment";
    archive.addEventListener("click", () => archiveEquipment(equipmentId));

    const navigate = document.querySelector("#equipmentNavigate");
    if (navigate) {
      actions.insertBefore(move, navigate);
      actions.insertBefore(archive, navigate);
    } else {
      actions.appendChild(move);
      actions.appendChild(archive);
    }
  };

  async function showMoveEquipmentForm(equipmentId, originalSiteId) {
    const grid = appView.querySelector(".grid");
    grid.innerHTML = '<section class="card" style="grid-column:1/-1;"><p>Loading equipment move...</p></section>';

    const [machineResult, sitesResult] = await Promise.all([getMachine(equipmentId), getActiveSites()]);
    const error = machineResult.error || sitesResult.error;
    const machine = machineResult.data;
    const sites = sitesResult.data || [];

    if (error || !machine) {
      grid.innerHTML = `<section class="card" style="grid-column:1/-1;"><h2>Move Equipment could not be loaded</h2><p class="error-text">${escapeHtml(error?.message || "Equipment not found")}</p><button id="moveBack">← Back to Equipment</button></section>`;
      document.querySelector("#moveBack").addEventListener("click", () => window.openEquipment(equipmentId, originalSiteId));
      return;
    }

    const currentSite = sites.find(site => site.id === machine.site_id);
    const destinations = sites.filter(site => site.id !== machine.site_id);

    grid.innerHTML = `
      <section class="card" style="grid-column:1/-1;">
        <div class="section-heading">
          <div><h2 style="margin:0;">Move Equipment</h2><small>${escapeHtml(eqLabel(machine))}</small></div>
          <button id="moveBack" type="button">← Back to Equipment</button>
        </div>

        <div class="location-box" style="margin-top:18px;">
          <strong>Current Site</strong><br>
          <span>${escapeHtml(currentSite?.name || "Current site")}</span>
        </div>

        ${destinations.length ? `
          <form id="moveEquipmentForm" style="margin-top:18px;">
            <label>Move To Site
              <select id="moveDestination" required>
                <option value="">Select destination site</option>
                ${destinations.map(site => `<option value="${escapeHtml(site.id)}">${escapeHtml(site.name)}</option>`).join("")}
              </select>
            </label>

            <label style="display:flex;gap:10px;align-items:flex-start;margin-top:14px;">
              <input id="clearMoveGps" type="checkbox" checked style="width:auto;margin-top:4px;">
              <span><strong>Clear the old GPS location</strong><br><small>Recommended when equipment physically moves. Set its new location after it arrives.</small></span>
            </label>

            <div class="location-box" style="margin-top:18px;">
              <strong>History stays with the machine.</strong>
              <p style="margin-bottom:0;">PM schedules, filters, service history and existing work tickets remain attached to this equipment record.</p>
            </div>

            <div class="form-actions">
              <button type="submit">Move Equipment</button>
              <button id="moveCancel" type="button" class="secondary-button">Cancel</button>
            </div>
            <p id="moveMessage" class="field-status"></p>
          </form>` : `
          <div class="empty-state" style="margin-top:18px;">
            <strong>No other active sites are available.</strong><br>
            <small>Add another job site before moving this equipment.</small>
          </div>`}
      </section>`;

    const goBack = () => window.openEquipment(equipmentId, originalSiteId);
    document.querySelector("#moveBack").addEventListener("click", goBack);
    document.querySelector("#moveCancel")?.addEventListener("click", goBack);

    document.querySelector("#moveEquipmentForm")?.addEventListener("submit", async event => {
      event.preventDefault();
      const message = document.querySelector("#moveMessage");
      const destination = document.querySelector("#moveDestination").value;
      const clearGps = document.querySelector("#clearMoveGps").checked;
      if (!destination) {
        message.innerHTML = '<span class="error-text">Select the destination site.</span>';
        return;
      }

      const updateRecord = { site_id: destination, updated_by: currentUser.id };
      if (clearGps) {
        Object.assign(updateRecord, {
          latitude: null,
          longitude: null,
          gps_accuracy_m: null,
          gps_captured_at: null,
          gps_captured_by: null
        });
      }

      message.textContent = "Moving equipment...";
      const { error: updateError } = await db.from("equipment").update(updateRecord).eq("id", equipmentId);
      if (updateError) {
        message.innerHTML = `<span class="error-text">${escapeHtml(updateError.message)}</span>`;
        return;
      }

      await window.openEquipment(equipmentId, destination);
    });
  }

  async function archiveEquipment(equipmentId) {
    const { data: machine, error } = await getMachine(equipmentId);
    if (error || !machine) {
      alert(error?.message || "Equipment could not be loaded.");
      return;
    }

    const okay = window.confirm(`Archive ${eqLabel(machine)}?\n\nIt will disappear from active equipment lists, but its PM schedules, filters, tickets and service history will be kept.`);
    if (!okay) return;

    const { error: updateError } = await db.from("equipment").update({
      archived: true,
      status: "archived",
      updated_by: currentUser.id
    }).eq("id", equipmentId);

    if (updateError) {
      alert(`Could not archive equipment: ${updateError.message}`);
      return;
    }

    await window.showDashboardEquipment();
  }

  window.showDashboardEquipment = async function () {
    await baseShowDashboardEquipment();
    if (!canManageLifecycle()) return;

    const heading = document.querySelector("#companyEquipmentBack")?.parentElement;
    if (!heading || document.querySelector("#archivedEquipmentButton")) return;

    const button = document.createElement("button");
    button.id = "archivedEquipmentButton";
    button.type = "button";
    button.className = "secondary-button";
    button.textContent = "Archived Equipment";
    button.addEventListener("click", () => window.showArchivedEquipment());

    const back = document.querySelector("#companyEquipmentBack");
    const wrapper = document.createElement("div");
    wrapper.className = "form-actions compact-actions";
    back.replaceWith(wrapper);
    wrapper.appendChild(back);
    wrapper.appendChild(button);
  };

  window.showArchivedEquipment = async function () {
    const grid = appView.querySelector(".grid");
    grid.innerHTML = '<section class="card" style="grid-column:1/-1;"><p>Loading archived equipment...</p></section>';

    const [sitesResult, equipmentResult] = await Promise.all([
      getActiveSites(),
      db.from("equipment").select("id,site_id,unit_number,name,make,model,current_hours,status,archived").eq("archived", true).order("name")
    ]);
    const error = sitesResult.error || equipmentResult.error;
    if (error) {
      grid.innerHTML = `<section class="card" style="grid-column:1/-1;"><h2>Archived Equipment could not be loaded</h2><p class="error-text">${escapeHtml(error.message)}</p><button id="archivedBack">← Company Equipment</button></section>`;
      document.querySelector("#archivedBack").addEventListener("click", () => window.showDashboardEquipment());
      return;
    }

    const sites = sitesResult.data || [];
    const machines = equipmentResult.data || [];
    const siteById = Object.fromEntries(sites.map(site => [site.id, site.name]));

    const cards = machines.length ? machines.map(machine => {
      const currentSiteActive = sites.some(site => site.id === machine.site_id);
      const options = sites.map(site => `<option value="${escapeHtml(site.id)}" ${site.id === machine.site_id ? "selected" : ""}>${escapeHtml(site.name)}</option>`).join("");
      const makeModel = [machine.make, machine.model].filter(Boolean).join(" ");
      return `
        <div class="inset-card compact-card" style="margin-top:12px;">
          <strong>${escapeHtml(eqLabel(machine))}</strong>
          ${machine.unit_number && machine.name ? `<div>${escapeHtml(machine.name)}</div>` : ""}
          <small>${makeModel ? `${escapeHtml(makeModel)} · ` : ""}${machine.current_hours != null ? `${escapeHtml(machine.current_hours)} hrs` : "Hours not entered"}</small>
          <p><small><strong>Last site:</strong> ${escapeHtml(siteById[machine.site_id] || "Archived/inactive site")}</small></p>
          ${sites.length ? `
            <div class="form-grid">
              <label>Restore To Site
                <select class="restoreSite" data-id="${escapeHtml(machine.id)}">
                  ${!currentSiteActive ? '<option value="">Select active site</option>' : ""}
                  ${options}
                </select>
              </label>
            </div>
            <button type="button" class="restoreEquipmentButton" data-id="${escapeHtml(machine.id)}">Restore Equipment</button>` : '<small>No active site is available for restoration.</small>'}
        </div>`;
    }).join("") : '<div class="empty-state"><strong>No archived equipment.</strong></div>';

    grid.innerHTML = `
      <section class="card" style="grid-column:1/-1;">
        <div class="section-heading">
          <div><h2 style="margin:0;">Archived Equipment</h2><small>Stored records remain available and can be restored later.</small></div>
          <button id="archivedBack" type="button">← Company Equipment</button>
        </div>
        <div style="margin-top:18px;">${cards}</div>
      </section>`;

    document.querySelector("#archivedBack").addEventListener("click", () => window.showDashboardEquipment());
    document.querySelectorAll(".restoreEquipmentButton").forEach(button => {
      button.addEventListener("click", async () => {
        const equipmentId = button.dataset.id;
        const select = document.querySelector(`.restoreSite[data-id="${CSS.escape(equipmentId)}"]`);
        const destination = select?.value;
        if (!destination) {
          alert("Select an active site before restoring this equipment.");
          return;
        }

        button.disabled = true;
        button.textContent = "Restoring...";
        const { error: restoreError } = await db.from("equipment").update({
          archived: false,
          status: "active",
          site_id: destination,
          updated_by: currentUser.id
        }).eq("id", equipmentId);

        if (restoreError) {
          alert(`Could not restore equipment: ${restoreError.message}`);
          button.disabled = false;
          button.textContent = "Restore Equipment";
          return;
        }
        await window.showArchivedEquipment();
      });
    });
  };
})();
