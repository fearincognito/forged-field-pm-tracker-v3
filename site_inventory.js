/* V3 site inventory and pack-list workflow */

(function () {
  const baseOpenSite = window.openSite;
  if (typeof baseOpenSite !== "function") {
    console.error("site_inventory.js loaded before app.js");
    return;
  }

  const categoryLabel = value => String(value || "other").replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());
  const textOrNull = id => document.querySelector(`#${id}`)?.value?.trim() || null;
  const numberOrZero = id => Math.max(0, Number(document.querySelector(`#${id}`)?.value || 0));

  window.openSite = async function(siteId) {
    await baseOpenSite(siteId);
    wireSiteTools(siteId);
  };

  function replaceButton(id, handler) {
    const oldButton = document.querySelector(`#${id}`);
    if (!oldButton) return;
    const newButton = oldButton.cloneNode(true);
    oldButton.replaceWith(newButton);
    newButton.addEventListener("click", handler);
  }

  function wireSiteTools(siteId) {
    replaceButton("inventoryButton", () => showSiteInventory(siteId));
    replaceButton("packListButton", () => showPackList(siteId));
  }

  async function getSite(siteId) {
    return db.from("sites").select("id,name").eq("id", siteId).single();
  }

  window.showSiteInventory = async function(siteId) {
    const grid = appView.querySelector(".grid");
    grid.innerHTML = `<section class="card" style="grid-column:1/-1;"><p>Loading inventory...</p></section>`;

    const [{ data: site }, { data: items, error }] = await Promise.all([
      getSite(siteId),
      db.from("site_inventory").select("id,part_number,category,description,quantity_on_hand,notes").eq("site_id", siteId).order("part_number")
    ]);

    if (error) {
      grid.innerHTML = `<section class="card" style="grid-column:1/-1;"><h2>Inventory could not be loaded</h2><p class="error-text">${escapeHtml(error.message)}</p><button id="inventoryBack">← Back to Site</button></section>`;
      document.querySelector("#inventoryBack").addEventListener("click", () => window.openSite(siteId));
      return;
    }

    const cards = items?.length ? items.map(item => `
      <article class="inset-card compact-card" style="margin-top:10px;">
        <div class="section-heading">
          <div>
            <strong>${escapeHtml(item.part_number)}</strong><br>
            <small>${escapeHtml(categoryLabel(item.category))}${item.description ? ` · ${escapeHtml(item.description)}` : ""}</small>
          </div>
          <div style="text-align:right;">
            <strong style="font-size:22px;">${escapeHtml(item.quantity_on_hand)}</strong><br><small>On site</small>
          </div>
        </div>
        ${item.notes ? `<p><small>${escapeHtml(item.notes)}</small></p>` : ""}
        <button type="button" class="editInventoryItem" data-id="${escapeHtml(item.id)}">Edit</button>
      </article>`).join("") : `<div class="empty-state"><strong>No inventory recorded for this site yet.</strong></div>`;

    grid.innerHTML = `
      <section class="card" style="grid-column:1/-1;">
        <div class="section-heading">
          <div><h2 style="margin:0;">Site Inventory</h2><small>${escapeHtml(site?.name || "Site")}</small></div>
          <div class="form-actions compact-actions">
            <button id="inventoryBack" type="button">← Back to Site</button>
            <button id="addInventoryItem" type="button">+ Add Inventory</button>
          </div>
        </div>
        <p><small>Track filters, oil and other maintenance stock physically available at this site.</small></p>
        <div>${cards}</div>
      </section>`;

    document.querySelector("#inventoryBack").addEventListener("click", () => window.openSite(siteId));
    document.querySelector("#addInventoryItem").addEventListener("click", () => showInventoryForm(siteId, null));
    document.querySelectorAll(".editInventoryItem").forEach(button => {
      button.addEventListener("click", () => showInventoryForm(siteId, button.dataset.id));
    });
  };

  async function showInventoryForm(siteId, itemId) {
    const grid = appView.querySelector(".grid");
    let item = null;
    if (itemId) {
      const result = await db.from("site_inventory").select("*").eq("id", itemId).single();
      if (result.error) {
        grid.innerHTML = `<section class="card" style="grid-column:1/-1;"><p class="error-text">${escapeHtml(result.error.message)}</p></section>`;
        return;
      }
      item = result.data;
    }

    grid.innerHTML = `
      <section class="card" style="grid-column:1/-1;">
        <div class="section-heading">
          <div><h2 style="margin:0;">${item ? "Edit Inventory" : "Add Inventory"}</h2><small>Site maintenance stock</small></div>
          <button id="inventoryFormBack" type="button">← Inventory</button>
        </div>
        <form id="inventoryForm" style="margin-top:18px;">
          <div class="form-grid">
            <label>Part Number<input id="inventoryPart" required value="${escapeHtml(item?.part_number || "")}"></label>
            <label>Category
              <select id="inventoryCategory">
                ${["oil_filter","fuel_filter","fuel_water_separator","air_filter","hydraulic_filter","oil","other"].map(c => `<option value="${c}" ${item?.category === c ? "selected" : ""}>${categoryLabel(c)}</option>`).join("")}
              </select>
            </label>
            <label>Quantity On Site<input id="inventoryQty" type="number" min="0" step="1" required value="${escapeHtml(item?.quantity_on_hand ?? 0)}"></label>
            <label>Description<input id="inventoryDescription" value="${escapeHtml(item?.description || "")}"></label>
          </div>
          <label>Notes<textarea id="inventoryNotes" rows="4">${escapeHtml(item?.notes || "")}</textarea></label>
          <div class="form-actions">
            <button type="submit">${item ? "Save Changes" : "Add to Inventory"}</button>
            <button id="inventoryCancel" type="button" class="secondary-button">Cancel</button>
          </div>
          <p id="inventoryMessage" class="field-status"></p>
        </form>
      </section>`;

    const back = () => window.showSiteInventory(siteId);
    document.querySelector("#inventoryFormBack").addEventListener("click", back);
    document.querySelector("#inventoryCancel").addEventListener("click", back);
    document.querySelector("#inventoryForm").addEventListener("submit", async event => {
      event.preventDefault();
      const message = document.querySelector("#inventoryMessage");
      const record = {
        site_id: siteId,
        part_number: document.querySelector("#inventoryPart").value.trim(),
        category: document.querySelector("#inventoryCategory").value,
        description: textOrNull("inventoryDescription"),
        quantity_on_hand: numberOrZero("inventoryQty"),
        notes: textOrNull("inventoryNotes"),
        updated_by: currentUser.id
      };
      if (!record.part_number) {
        message.innerHTML = '<span class="error-text">Part number is required.</span>';
        return;
      }
      message.textContent = "Saving inventory...";
      let result;
      if (item) {
        result = await db.from("site_inventory").update(record).eq("id", item.id);
      } else {
        result = await db.from("site_inventory").insert({ ...record, created_by: currentUser.id });
      }
      if (result.error) {
        message.innerHTML = `<span class="error-text">${escapeHtml(result.error.message)}</span>`;
        return;
      }
      await window.showSiteInventory(siteId);
    });
  }

  window.showPackList = async function(siteId) {
    const grid = appView.querySelector(".grid");
    grid.innerHTML = `<section class="card" style="grid-column:1/-1;"><p>Building pack list...</p></section>`;

    const [{ data: site }, equipmentResult, inventoryResult] = await Promise.all([
      getSite(siteId),
      db.from("equipment").select("id,unit_number,name").eq("site_id", siteId).eq("archived", false),
      db.from("site_inventory").select("part_number,quantity_on_hand,description,category").eq("site_id", siteId)
    ]);

    if (equipmentResult.error || inventoryResult.error) {
      const error = equipmentResult.error || inventoryResult.error;
      grid.innerHTML = `<section class="card" style="grid-column:1/-1;"><h2>Pack list could not be built</h2><p class="error-text">${escapeHtml(error.message)}</p><button id="packBack">← Back to Site</button></section>`;
      document.querySelector("#packBack").addEventListener("click", () => window.openSite(siteId));
      return;
    }

    const equipment = equipmentResult.data || [];
    const ids = equipment.map(e => e.id);
    let filters = [];
    if (ids.length) {
      const filterResult = await db.from("equipment_filters").select("equipment_id,filter_type,description,part_number,quantity").in("equipment_id", ids);
      if (filterResult.error) {
        grid.innerHTML = `<section class="card" style="grid-column:1/-1;"><h2>Pack list could not be built</h2><p class="error-text">${escapeHtml(filterResult.error.message)}</p><button id="packBack">← Back to Site</button></section>`;
        document.querySelector("#packBack").addEventListener("click", () => window.openSite(siteId));
        return;
      }
      filters = filterResult.data || [];
    }

    const equipmentById = Object.fromEntries(equipment.map(e => [e.id, e.unit_number || e.name]));
    const inventoryByPart = {};
    (inventoryResult.data || []).forEach(item => {
      const key = String(item.part_number).trim().toUpperCase();
      inventoryByPart[key] = (inventoryByPart[key] || 0) + Number(item.quantity_on_hand || 0);
    });

    const grouped = {};
    filters.forEach(filter => {
      const part = String(filter.part_number || "").trim();
      if (!part) return;
      const key = part.toUpperCase();
      if (!grouped[key]) grouped[key] = { part_number: part, description: filter.description, category: filter.filter_type, required: 0, equipment: new Set() };
      grouped[key].required += Number(filter.quantity || 1);
      grouped[key].equipment.add(equipmentById[filter.equipment_id] || "Equipment");
    });

    const rows = Object.values(grouped).sort((a,b) => a.part_number.localeCompare(b.part_number));
    const html = rows.length ? rows.map(row => {
      const onSite = inventoryByPart[row.part_number.toUpperCase()] || 0;
      const bring = Math.max(row.required - onSite, 0);
      return `
        <article class="inset-card compact-card" style="margin-top:10px;${bring > 0 ? "border-left:5px solid #d96b00;background:#fff4e5;" : ""}">
          <div class="section-heading">
            <div>
              <strong>${escapeHtml(row.part_number)}</strong><br>
              <small>${escapeHtml(categoryLabel(row.category))}${row.description ? ` · ${escapeHtml(row.description)}` : ""}</small><br>
              <small><strong>Used by:</strong> ${escapeHtml(Array.from(row.equipment).join(", "))}</small>
            </div>
            <div style="text-align:right;min-width:170px;">
              <small>Required</small> <strong>${escapeHtml(row.required)}</strong><br>
              <small>On Site</small> <strong>${escapeHtml(onSite)}</strong><br>
              <small>Bring</small> <strong style="${bring > 0 ? "color:#b54708;" : ""}">${escapeHtml(bring)}</strong>
            </div>
          </div>
        </article>`;
    }).join("") : `<div class="empty-state"><strong>No saved equipment filters or service parts to pack yet.</strong></div>`;

    grid.innerHTML = `
      <section class="card" style="grid-column:1/-1;">
        <div class="section-heading">
          <div><h2 style="margin:0;">Site Pack List</h2><small>${escapeHtml(site?.name || "Site")}</small></div>
          <div class="form-actions compact-actions">
            <button id="packBack" type="button">← Back to Site</button>
            <button id="packInventory" type="button">Inventory</button>
          </div>
        </div>
        <p><small>Required quantities are consolidated across all active equipment. Bring turns orange when site stock is short.</small></p>
        <div>${html}</div>
      </section>`;

    document.querySelector("#packBack").addEventListener("click", () => window.openSite(siteId));
    document.querySelector("#packInventory").addEventListener("click", () => window.showSiteInventory(siteId));
  };
})();
