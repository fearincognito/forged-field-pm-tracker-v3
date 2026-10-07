/* V3 filter / service-part edit and delete actions for maintenance roles */
(function () {
  const baseOpenEquipment = window.openEquipment;
  if (typeof baseOpenEquipment !== "function") return;

  const canMaintain = () => currentProfile && ["owner", "admin", "mechanic"].includes(currentProfile.role);
  const typeOptions = [
    ["oil", "Oil Filter"],
    ["fuel", "Fuel Filter"],
    ["fuel_water_separator", "Fuel / Water Separator"],
    ["air", "Air Filter"],
    ["hydraulic", "Hydraulic Filter"],
    ["other", "Other"]
  ];

  window.openEquipment = async function (equipmentId, siteId) {
    await baseOpenEquipment(equipmentId, siteId);
    if (!canMaintain()) return;
    await decorateFilters(equipmentId, siteId);
  };

  async function decorateFilters(equipmentId, siteId) {
    const heading = Array.from(document.querySelectorAll(".section-heading")).find(section =>
      String(section.querySelector("h3")?.textContent || "").trim() === "Filters & Service Parts"
    );
    const container = heading?.nextElementSibling;
    if (!container) return;

    const { data: filters, error } = await db.from("equipment_filters")
      .select("id,filter_type,description,part_number,quantity")
      .eq("equipment_id", equipmentId)
      .order("filter_type")
      .order("part_number");

    if (error || !container.isConnected) return;

    if (!filters?.length) {
      container.innerHTML = `<div class="empty-state"><strong>No filters or service parts saved yet.</strong></div>`;
      return;
    }

    container.innerHTML = filters.map(filter => `
      <article class="inset-card compact-card" style="margin-top:10px;">
        <strong>${escapeHtml(pmFriendly(filter.filter_type))}</strong><br>
        <span>${escapeHtml(filter.part_number)}</span>
        ${filter.description ? `<br><small>${escapeHtml(filter.description)}</small>` : ""}
        <br><small><strong>Qty:</strong> ${escapeHtml(filter.quantity)}</small>
        <div class="form-actions compact-actions" style="margin-top:10px;">
          <button type="button" class="editEquipmentFilter" data-id="${escapeHtml(filter.id)}">Edit</button>
          <button type="button" class="secondary-button deleteEquipmentFilter" data-id="${escapeHtml(filter.id)}">Delete</button>
        </div>
      </article>`).join("");

    container.querySelectorAll(".editEquipmentFilter").forEach(button => {
      button.addEventListener("click", () => {
        const filter = filters.find(row => row.id === button.dataset.id);
        if (filter) showFilterEditForm(equipmentId, siteId, filter);
      });
    });

    container.querySelectorAll(".deleteEquipmentFilter").forEach(button => {
      button.addEventListener("click", async () => {
        const filter = filters.find(row => row.id === button.dataset.id);
        if (!filter) return;
        if (!window.confirm(`Delete ${filter.part_number}? This removes it from this equipment and future pack lists.`)) return;

        button.disabled = true;
        button.textContent = "Deleting...";
        const { error: deleteError } = await db.from("equipment_filters").delete().eq("id", filter.id);
        if (deleteError) {
          alert(`Could not delete filter / part: ${deleteError.message}`);
          button.disabled = false;
          button.textContent = "Delete";
          return;
        }
        await window.openEquipment(equipmentId, siteId);
      });
    });
  }

  function showFilterEditForm(equipmentId, siteId, filter) {
    const grid = appView.querySelector(".grid");
    grid.innerHTML = `
      <section class="card" style="grid-column:1/-1;">
        <div class="section-heading">
          <div><h2 style="margin:0;">Edit Filter / Service Part</h2><small>${escapeHtml(filter.part_number)}</small></div>
          <button id="filterEditBack" type="button">← Back to Equipment</button>
        </div>
        <form id="filterEditForm" style="margin-top:18px;">
          <div class="form-grid">
            <label>Type
              <select id="filterEditType">
                ${typeOptions.map(([value, label]) => `<option value="${value}" ${filter.filter_type === value ? "selected" : ""}>${label}</option>`).join("")}
              </select>
            </label>
            <label>Part Number<input id="filterEditPartNumber" required value="${escapeHtml(filter.part_number || "")}"></label>
            <label>Quantity<input id="filterEditQuantity" type="number" min="1" step="1" required value="${escapeHtml(filter.quantity || 1)}"></label>
          </div>
          <label>Description<input id="filterEditDescription" value="${escapeHtml(filter.description || "")}" placeholder="Optional description or location"></label>
          <div class="form-actions">
            <button type="submit">Save Changes</button>
            <button id="filterEditCancel" type="button" class="secondary-button">Cancel</button>
          </div>
          <p id="filterEditMessage" class="field-status"></p>
        </form>
      </section>`;

    const back = () => window.openEquipment(equipmentId, siteId);
    document.querySelector("#filterEditBack").addEventListener("click", back);
    document.querySelector("#filterEditCancel").addEventListener("click", back);
    document.querySelector("#filterEditForm").addEventListener("submit", async event => {
      event.preventDefault();
      const message = document.querySelector("#filterEditMessage");
      const partNumber = document.querySelector("#filterEditPartNumber").value.trim();
      const quantity = Number(document.querySelector("#filterEditQuantity").value);

      if (!partNumber || !Number.isFinite(quantity) || quantity < 1) {
        message.innerHTML = '<span class="error-text">Enter a part number and a quantity of at least 1.</span>';
        return;
      }

      message.textContent = "Saving changes...";
      const { error } = await db.from("equipment_filters").update({
        filter_type: document.querySelector("#filterEditType").value,
        part_number: partNumber,
        quantity,
        description: document.querySelector("#filterEditDescription").value.trim() || null,
        updated_by: currentUser.id
      }).eq("id", filter.id);

      if (error) {
        message.innerHTML = `<span class="error-text">${escapeHtml(error.message)}</span>`;
        return;
      }
      await window.openEquipment(equipmentId, siteId);
    });
  }
})();
