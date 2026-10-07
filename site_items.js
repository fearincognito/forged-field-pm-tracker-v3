/* V3 site item detail workflow */

(function () {
  const baseOpenSite = window.openSite;
  if (typeof baseOpenSite !== "function") {
    console.error("site_items.js loaded before site workflow");
    return;
  }

  const typeLabel = value => String(value || "other")
    .replaceAll("_", " ")
    .replace(/\b\w/g, c => c.toUpperCase());

  window.openSite = async function(siteId) {
    await baseOpenSite(siteId);
    await makeSiteItemsClickable(siteId);
  };

  async function makeSiteItemsClickable(siteId) {
    const list = document.querySelector("#siteItemsList");
    if (!list) return;

    const [{ data: items, error }, { data: tickets }] = await Promise.all([
      db.from("site_items")
        .select("id,name,item_type,description,notes,latitude,longitude,archived")
        .eq("site_id", siteId)
        .eq("archived", false)
        .order("name"),
      db.from("work_tickets")
        .select("site_item_id,status")
        .eq("site_id", siteId)
    ]);

    if (!document.querySelector("#siteItemsList")) return;
    if (error) {
      list.innerHTML = `<div class="empty-state"><strong>Site items could not be loaded.</strong><br><small>${escapeHtml(error.message)}</small></div>`;
      return;
    }

    if (!items?.length) {
      list.innerHTML = `<div class="empty-state"><strong>No site items added yet.</strong></div>`;
      return;
    }

    const activeCounts = {};
    (tickets || []).forEach(ticket => {
      if (!ticket.site_item_id) return;
      if (ticket.status !== "open" && ticket.status !== "in_progress") return;
      activeCounts[ticket.site_item_id] = (activeCounts[ticket.site_item_id] || 0) + 1;
    });

    list.innerHTML = items.map(item => {
      const count = activeCounts[item.id] || 0;
      const gps = item.latitude != null && item.longitude != null;
      return `
        <button class="equipment-list-card" type="button" data-site-item-id="${escapeHtml(item.id)}" style="text-align:left;">
          <span class="equipment-title">${escapeHtml(item.name)}</span>
          <small>${escapeHtml(typeLabel(item.item_type))}</small>
          ${item.description ? `<small>${escapeHtml(item.description)}</small>` : ""}
          <small>${gps ? "📍 GPS location saved" : "GPS location not set"}${count ? ` · ${count} open ticket${count === 1 ? "" : "s"}` : ""}</small>
          <small class="open-hint">Open site item →</small>
        </button>`;
    }).join("");

    list.querySelectorAll("[data-site-item-id]").forEach(button => {
      button.addEventListener("click", () => window.openSiteItem(button.dataset.siteItemId, siteId));
    });
  }

  async function loadSiteItem(itemId) {
    return db.from("site_items")
      .select("id,site_id,name,item_type,description,notes,latitude,longitude,gps_accuracy_m,gps_captured_at,gps_captured_by,archived")
      .eq("id", itemId)
      .single();
  }

  window.openSiteItem = async function(itemId, siteId) {
    const grid = appView.querySelector(".grid");
    grid.innerHTML = `<section class="card" style="grid-column:1/-1;"><p>Loading site item...</p></section>`;

    const [{ data: item, error }, { data: tickets }] = await Promise.all([
      loadSiteItem(itemId),
      db.from("work_tickets").select("id,status").eq("site_item_id", itemId)
    ]);

    if (error || !item) {
      grid.innerHTML = `<section class="card" style="grid-column:1/-1;"><h2>Site item could not be loaded</h2><p class="error-text">${escapeHtml(error?.message || "Record not found")}</p><button id="siteItemBackError" type="button">← Back to Site</button></section>`;
      document.querySelector("#siteItemBackError").addEventListener("click", () => window.openSite(siteId));
      return;
    }

    const hasGps = item.latitude != null && item.longitude != null;
    const openCount = (tickets || []).filter(t => t.status === "open" || t.status === "in_progress").length;

    grid.innerHTML = `
      <section class="card" style="grid-column:1/-1;">
        <div class="section-heading">
          <div>
            <small>Site Item</small>
            <h2 style="margin:4px 0 0;">${escapeHtml(item.name)}</h2>
            <p style="margin:6px 0 0;">${escapeHtml(typeLabel(item.item_type))}</p>
          </div>
          <div class="form-actions compact-actions">
            <button id="siteItemBack" type="button">← Back to Site</button>
            ${hasGps ? `<button id="siteItemNavigate" type="button">Navigate</button>` : ""}
          </div>
        </div>

        ${item.description ? `<div class="notes-box"><strong>Description</strong><p>${escapeHtml(item.description)}</p></div>` : ""}
        ${item.notes ? `<div class="notes-box"><strong>Notes</strong><p>${escapeHtml(item.notes)}</p></div>` : ""}

        <div class="equipment-action-grid">
          <button id="editSiteItemButton" type="button">Edit Site Item</button>
          <button id="setSiteItemGpsNow" type="button">📍 ${hasGps ? "Update Current Location" : "Set Current Location"}</button>
          <button id="siteItemTicketsButton" type="button">Work Tickets${openCount ? ` (${openCount})` : ""}</button>
        </div>

        ${hasGps ? `
          <div class="location-box" style="margin-top:18px;">
            <strong>Saved GPS Location</strong>
            <p style="margin-bottom:4px;">${escapeHtml(item.latitude)}, ${escapeHtml(item.longitude)}${item.gps_accuracy_m != null ? ` · ±${escapeHtml(item.gps_accuracy_m)} m` : ""}</p>
            ${item.gps_captured_at ? `<small>Captured ${escapeHtml(new Date(item.gps_captured_at).toLocaleString())}</small>` : ""}
          </div>` : `
          <div class="empty-state" style="margin-top:18px;"><strong>No GPS location saved.</strong><br><small>Stand beside the item and use Set Current Location.</small></div>`}

        <p id="siteItemDetailMessage" class="field-status"></p>
      </section>`;

    document.querySelector("#siteItemBack").addEventListener("click", () => window.openSite(siteId));
    document.querySelector("#editSiteItemButton").addEventListener("click", () => showEditSiteItem(itemId, siteId));
    document.querySelector("#siteItemTicketsButton").addEventListener("click", () => {
      if (typeof window.showAssetTickets === "function") window.showAssetTickets(siteId, "site_item", itemId);
    });
    if (hasGps) document.querySelector("#siteItemNavigate").addEventListener("click", () => navigateToSite(item.latitude, item.longitude));
    document.querySelector("#setSiteItemGpsNow").addEventListener("click", () => saveCurrentLocation(itemId, siteId));
  };

  function geolocationPromise() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Location is not supported by this device/browser."));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      });
    });
  }

  async function saveCurrentLocation(itemId, siteId) {
    const message = document.querySelector("#siteItemDetailMessage");
    if (message) message.textContent = "Getting current location...";

    try {
      const position = await geolocationPromise();
      const record = {
        latitude: Number(position.coords.latitude.toFixed(6)),
        longitude: Number(position.coords.longitude.toFixed(6)),
        gps_accuracy_m: Math.round(position.coords.accuracy * 10) / 10,
        gps_captured_at: new Date().toISOString(),
        gps_captured_by: currentUser.id,
        updated_by: currentUser.id
      };
      const { error } = await db.from("site_items").update(record).eq("id", itemId);
      if (error) throw error;
      await window.openSiteItem(itemId, siteId);
    } catch (error) {
      if (message) message.innerHTML = `<span class="error-text">Could not save location: ${escapeHtml(error.message)}</span>`;
    }
  }

  async function showEditSiteItem(itemId, siteId) {
    const grid = appView.querySelector(".grid");
    const { data: item, error } = await loadSiteItem(itemId);
    if (error || !item) {
      grid.innerHTML = `<section class="card" style="grid-column:1/-1;"><p class="error-text">${escapeHtml(error?.message || "Site item not found")}</p></section>`;
      return;
    }

    const types = ["supply_trailer","bathroom","laydown","connex","fuel_tank","water_tank","storage","other"];

    grid.innerHTML = `
      <section class="card" style="grid-column:1/-1;">
        <div class="section-heading">
          <div><h2 style="margin:0;">Edit Site Item</h2><small>${escapeHtml(item.name)}</small></div>
          <button id="editSiteItemBack" type="button">← Site Item</button>
        </div>
        <form id="editSiteItemForm" style="margin-top:18px;">
          <div class="form-grid">
            <label>Name / ID<input id="editSiteItemName" required value="${escapeHtml(item.name)}"></label>
            <label>Type
              <select id="editSiteItemType">
                ${types.map(type => `<option value="${type}" ${item.item_type === type ? "selected" : ""}>${escapeHtml(typeLabel(type))}</option>`).join("")}
              </select>
            </label>
          </div>
          <label>Description<textarea id="editSiteItemDescription" rows="4">${escapeHtml(item.description || "")}</textarea></label>
          <label>Notes<textarea id="editSiteItemNotes" rows="5">${escapeHtml(item.notes || "")}</textarea></label>

          <div class="location-box">
            <div class="section-heading">
              <div><strong>GPS Location</strong><br><small>Coordinates stay editable if a manual correction is needed.</small></div>
              <button id="editSiteItemCurrentLocation" type="button">📍 Set Current Location</button>
            </div>
            <div class="form-grid">
              <label>Latitude<input id="editSiteItemLatitude" type="number" step="any" value="${item.latitude ?? ""}"></label>
              <label>Longitude<input id="editSiteItemLongitude" type="number" step="any" value="${item.longitude ?? ""}"></label>
            </div>
            <input id="editSiteItemAccuracy" type="hidden" value="${item.gps_accuracy_m ?? ""}">
            <p id="editSiteItemLocationStatus" class="field-status"></p>
          </div>

          <div class="form-actions">
            <button type="submit">Save Changes</button>
            <button id="editSiteItemCancel" type="button" class="secondary-button">Cancel</button>
          </div>
          <p id="editSiteItemMessage" class="field-status"></p>
        </form>
      </section>`;

    const back = () => window.openSiteItem(itemId, siteId);
    document.querySelector("#editSiteItemBack").addEventListener("click", back);
    document.querySelector("#editSiteItemCancel").addEventListener("click", back);

    let gpsWasCaptured = false;
    document.querySelector("#editSiteItemCurrentLocation").addEventListener("click", async () => {
      const status = document.querySelector("#editSiteItemLocationStatus");
      status.textContent = "Getting current location...";
      try {
        const position = await geolocationPromise();
        document.querySelector("#editSiteItemLatitude").value = position.coords.latitude.toFixed(6);
        document.querySelector("#editSiteItemLongitude").value = position.coords.longitude.toFixed(6);
        document.querySelector("#editSiteItemAccuracy").value = Math.round(position.coords.accuracy * 10) / 10;
        gpsWasCaptured = true;
        status.textContent = `Location captured — accuracy ±${Math.round(position.coords.accuracy)} m`;
      } catch (error) {
        status.innerHTML = `<span class="error-text">Could not get location: ${escapeHtml(error.message)}</span>`;
      }
    });

    document.querySelector("#editSiteItemForm").addEventListener("submit", async event => {
      event.preventDefault();
      const message = document.querySelector("#editSiteItemMessage");
      const latRaw = document.querySelector("#editSiteItemLatitude").value;
      const lonRaw = document.querySelector("#editSiteItemLongitude").value;
      const accRaw = document.querySelector("#editSiteItemAccuracy").value;
      const locationChanged = latRaw !== String(item.latitude ?? "") || lonRaw !== String(item.longitude ?? "");

      const record = {
        name: document.querySelector("#editSiteItemName").value.trim(),
        item_type: document.querySelector("#editSiteItemType").value,
        description: document.querySelector("#editSiteItemDescription").value.trim() || null,
        notes: document.querySelector("#editSiteItemNotes").value.trim() || null,
        latitude: latRaw === "" ? null : Number(latRaw),
        longitude: lonRaw === "" ? null : Number(lonRaw),
        gps_accuracy_m: accRaw === "" ? null : Number(accRaw),
        updated_by: currentUser.id
      };

      if (!record.name) {
        message.innerHTML = '<span class="error-text">Name / ID is required.</span>';
        return;
      }

      if (gpsWasCaptured || locationChanged) {
        record.gps_captured_at = new Date().toISOString();
        record.gps_captured_by = currentUser.id;
      }

      message.textContent = "Saving site item...";
      const { error: saveError } = await db.from("site_items").update(record).eq("id", itemId);
      if (saveError) {
        message.innerHTML = `<span class="error-text">${escapeHtml(saveError.message)}</span>`;
        return;
      }
      await window.openSiteItem(itemId, siteId);
    });
  }
})();
