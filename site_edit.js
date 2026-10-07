/* V3 site editing and operating rotation workflow */

(function () {
  const baseOpenSite = window.openSite;

  if (typeof baseOpenSite !== "function") {
    console.error("site_edit.js loaded before app.js");
    return;
  }

  function textValue(value) {
    return value === null || value === undefined ? "" : String(value);
  }

  function numberOrNull(id) {
    const raw = document.querySelector(`#${id}`)?.value ?? "";
    return raw === "" ? null : Number(raw);
  }

  window.openSite = async function (siteId) {
    await baseOpenSite(siteId);

    const backButton = document.querySelector("#backSites");
    const addEquipmentButton = document.querySelector("#addEquipmentButton");
    if (!backButton || !addEquipmentButton || document.querySelector("#editSiteButton")) return;

    const actions = backButton.parentElement;
    const editButton = document.createElement("button");
    editButton.id = "editSiteButton";
    editButton.type = "button";
    editButton.textContent = "Edit Site";
    editButton.addEventListener("click", () => showEditSiteForm(siteId));

    const navigateButton = document.querySelector("#navigateSite");
    if (navigateButton) actions.insertBefore(editButton, navigateButton);
    else actions.appendChild(editButton);
  };

  async function showEditSiteForm(siteId) {
    const grid = appView.querySelector(".grid");
    grid.innerHTML = `<section class="card" style="grid-column:1/-1;"><p>Loading site...</p></section>`;

    const { data: site, error } = await db
      .from("sites")
      .select(`id,name,description,latitude,longitude,access_notes,rotation_type,rotation_on_days,rotation_off_days,rotation_anchor_date`)
      .eq("id", siteId)
      .single();

    if (error || !site) {
      grid.innerHTML = `
        <section class="card" style="grid-column:1/-1;">
          <h2>Site could not be loaded</h2>
          <p class="error-text">${escapeHtml(error?.message || "Unknown error")}</p>
          <button id="editSiteBack" type="button">← Back to Site</button>
        </section>`;
      document.querySelector("#editSiteBack").addEventListener("click", () => window.openSite(siteId));
      return;
    }

    const rotationType = site.rotation_type || "none";

    grid.innerHTML = `
      <section class="card" style="grid-column:1/-1;">
        <div class="section-heading">
          <div>
            <h2 style="margin:0;">Edit Site</h2>
            <small>${escapeHtml(site.name)}</small>
          </div>
          <button id="editSiteBack" type="button">← Back to Site</button>
        </div>

        <form id="editSiteForm" style="margin-top:18px;">
          <label>Site Name
            <input id="editSiteName" type="text" required value="${escapeHtml(textValue(site.name))}">
          </label>

          <label>Description
            <textarea id="editSiteDescription" rows="3">${escapeHtml(textValue(site.description))}</textarea>
          </label>

          <label>Site Rotation
            <select id="editRotationType">
              <option value="none" ${rotationType === "none" ? "selected" : ""}>No rotation</option>
              <option value="14_7" ${rotationType === "14_7" ? "selected" : ""}>14 days on / 7 days off</option>
              <option value="20_10" ${rotationType === "20_10" ? "selected" : ""}>20 days on / 10 days off</option>
              <option value="custom" ${rotationType === "custom" ? "selected" : ""}>Custom</option>
            </select>
          </label>

          <div id="editCustomRotation" class="form-grid" style="${rotationType === "custom" ? "" : "display:none;"}">
            <label>Days On
              <input id="editRotationOn" type="number" min="1" step="1" value="${escapeHtml(textValue(site.rotation_on_days))}">
            </label>
            <label>Days Off
              <input id="editRotationOff" type="number" min="1" step="1" value="${escapeHtml(textValue(site.rotation_off_days))}">
            </label>
          </div>

          <label>Rotation Anchor Date
            <input id="editRotationAnchor" type="date" value="${escapeHtml(textValue(site.rotation_anchor_date))}">
            <small>This is the first ON day of the rotation cycle.</small>
          </label>

          <div class="location-box">
            <div class="section-heading">
              <div>
                <strong>Site GPS Location</strong><br>
                <small>Optional. Used for site navigation and mapping.</small>
              </div>
              <button id="editSiteSetLocation" type="button">📍 Set Current Location</button>
            </div>
            <div class="form-grid">
              <label>Latitude
                <input id="editSiteLatitude" type="number" step="any" value="${escapeHtml(textValue(site.latitude))}">
              </label>
              <label>Longitude
                <input id="editSiteLongitude" type="number" step="any" value="${escapeHtml(textValue(site.longitude))}">
              </label>
            </div>
            <input id="editSiteGpsAccuracy" type="hidden">
            <p id="editSiteLocationStatus" class="field-status"></p>
          </div>

          <label>Site Access Notes
            <textarea id="editSiteAccessNotes" rows="5">${escapeHtml(textValue(site.access_notes))}</textarea>
          </label>

          <div class="form-actions">
            <button type="submit">Save Site Changes</button>
            <button id="editSiteCancel" type="button" class="secondary-button">Cancel</button>
          </div>
          <p id="editSiteMessage" class="field-status"></p>
        </form>
      </section>`;

    const goBack = () => window.openSite(siteId);
    document.querySelector("#editSiteBack").addEventListener("click", goBack);
    document.querySelector("#editSiteCancel").addEventListener("click", goBack);

    const rotationSelect = document.querySelector("#editRotationType");
    const customRotation = document.querySelector("#editCustomRotation");
    rotationSelect.addEventListener("change", () => {
      customRotation.style.display = rotationSelect.value === "custom" ? "grid" : "none";
    });

    document.querySelector("#editSiteSetLocation").addEventListener("click", () => {
      captureCurrentLocation("editSiteLatitude", "editSiteLongitude", "editSiteGpsAccuracy", "editSiteLocationStatus");
    });

    document.querySelector("#editSiteForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const message = document.querySelector("#editSiteMessage");
      message.textContent = "Saving site changes...";

      const selectedRotation = rotationSelect.value;
      let onDays = null;
      let offDays = null;

      if (selectedRotation === "14_7") {
        onDays = 14;
        offDays = 7;
      } else if (selectedRotation === "20_10") {
        onDays = 20;
        offDays = 10;
      } else if (selectedRotation === "custom") {
        onDays = numberOrNull("editRotationOn");
        offDays = numberOrNull("editRotationOff");
        if (!Number.isFinite(onDays) || onDays < 1 || !Number.isFinite(offDays) || offDays < 1) {
          message.innerHTML = '<span class="error-text">Custom rotation requires valid Days On and Days Off.</span>';
          return;
        }
      }

      const latitude = numberOrNull("editSiteLatitude");
      const longitude = numberOrNull("editSiteLongitude");
      if ((latitude == null) !== (longitude == null)) {
        message.innerHTML = '<span class="error-text">Enter both latitude and longitude, or leave both blank.</span>';
        return;
      }

      const anchor = selectedRotation === "none" ? null : (document.querySelector("#editRotationAnchor").value || null);
      if (selectedRotation !== "none" && !anchor) {
        message.innerHTML = '<span class="error-text">Choose a rotation anchor date so PM estimates know when the ON cycle starts.</span>';
        return;
      }

      const updateRecord = {
        name: document.querySelector("#editSiteName").value.trim(),
        description: document.querySelector("#editSiteDescription").value.trim() || null,
        rotation_type: selectedRotation,
        rotation_on_days: onDays,
        rotation_off_days: offDays,
        rotation_anchor_date: anchor,
        latitude,
        longitude,
        access_notes: document.querySelector("#editSiteAccessNotes").value.trim() || null,
        updated_by: currentUser.id
      };

      if (!updateRecord.name) {
        message.innerHTML = '<span class="error-text">Site name is required.</span>';
        return;
      }

      const { error: updateError } = await db
        .from("sites")
        .update(updateRecord)
        .eq("id", siteId);

      if (updateError) {
        console.error("Site edit error:", updateError);
        message.innerHTML = `<span class="error-text">${escapeHtml(updateError.message)}</span>`;
        return;
      }

      await window.openSite(siteId);
    });
  }
})();
