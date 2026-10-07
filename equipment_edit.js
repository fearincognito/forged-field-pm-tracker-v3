/* V3 equipment quick-hours and edit workflow */

(function () {
  const baseOpenEquipment = window.openEquipment;

  if (typeof baseOpenEquipment !== "function") {
    console.error("equipment_edit.js loaded before pm.js");
    return;
  }

  function equipmentValue(value) {
    return value === null || value === undefined ? "" : String(value);
  }

  function equipmentNumberOrNull(id) {
    const raw = document.querySelector(`#${id}`)?.value ?? "";
    return raw === "" ? null : Number(raw);
  }

  function equipmentTextOrNull(id) {
    const value = document.querySelector(`#${id}`)?.value?.trim() ?? "";
    return value || null;
  }

  async function getEquipmentForEdit(equipmentId) {
    return db
      .from("equipment")
      .select(`id,site_id,unit_number,name,make,model,serial_number,engine_serial_number,vin,ownership,status,current_hours,operating_hours_per_day,oil_type,oil_capacity,notes,latitude,longitude,gps_accuracy_m,gps_captured_at,gps_captured_by,archived`)
      .eq("id", equipmentId)
      .single();
  }

  window.openEquipment = async function (equipmentId, siteId) {
    await baseOpenEquipment(equipmentId, siteId);

    const backButton = document.querySelector("#equipmentBackSite");
    if (!backButton || document.querySelector("#quickHoursButton")) return;

    const actions = backButton.parentElement;

    const quickButton = document.createElement("button");
    quickButton.id = "quickHoursButton";
    quickButton.type = "button";
    quickButton.textContent = "Update Hours";
    quickButton.addEventListener("click", () => showQuickHoursForm(equipmentId, siteId));

    const editButton = document.createElement("button");
    editButton.id = "editEquipmentButton";
    editButton.type = "button";
    editButton.textContent = "Edit Equipment";
    editButton.addEventListener("click", () => showEditEquipmentForm(equipmentId, siteId));

    const navigateButton = document.querySelector("#equipmentNavigate");
    if (navigateButton) {
      actions.insertBefore(quickButton, navigateButton);
      actions.insertBefore(editButton, navigateButton);
    } else {
      actions.appendChild(quickButton);
      actions.appendChild(editButton);
    }
  };

  async function showQuickHoursForm(equipmentId, siteId) {
    const grid = appView.querySelector(".grid");
    grid.innerHTML = `<section class="card" style="grid-column:1/-1;"><p>Loading equipment...</p></section>`;

    const { data: machine, error } = await getEquipmentForEdit(equipmentId);

    if (error || !machine) {
      grid.innerHTML = `
        <section class="card" style="grid-column:1/-1;">
          <h2>Equipment could not be loaded</h2>
          <p class="error-text">${escapeHtml(error?.message || "Unknown error")}</p>
          <button id="hoursBackButton" type="button">← Back to Equipment</button>
        </section>`;
      document.querySelector("#hoursBackButton").addEventListener("click", () => window.openEquipment(equipmentId, siteId));
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
          <button id="hoursBackButton" type="button">← Back to Equipment</button>
        </div>

        <div class="location-box" style="margin-top:18px;">
          <small>Current recorded hours</small><br>
          <strong style="font-size:24px;">${current == null ? "—" : escapeHtml(current)}</strong>
        </div>

        <form id="quickHoursForm" style="margin-top:18px;">
          <label>
            New Hour Meter Reading
            <input id="quickHoursValue" type="number" min="${current == null ? 0 : current}" step="0.1" required value="${current == null ? "" : escapeHtml(current)}">
          </label>

          <small>Normal hour updates cannot move the meter backwards. Use Edit Equipment only when correcting a mistaken reading.</small>

          <div class="form-actions">
            <button type="submit">Save Hours</button>
            <button id="hoursCancelButton" type="button" class="secondary-button">Cancel</button>
          </div>
          <p id="quickHoursMessage" class="field-status"></p>
        </form>
      </section>`;

    const goBack = () => window.openEquipment(equipmentId, siteId);
    document.querySelector("#hoursBackButton").addEventListener("click", goBack);
    document.querySelector("#hoursCancelButton").addEventListener("click", goBack);

    document.querySelector("#quickHoursForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const message = document.querySelector("#quickHoursMessage");
      const newHours = Number(document.querySelector("#quickHoursValue").value);

      if (!Number.isFinite(newHours) || newHours < 0) {
        message.innerHTML = '<span class="error-text">Enter a valid non-negative hour reading.</span>';
        return;
      }

      if (current != null && newHours < current) {
        message.innerHTML = `<span class="error-text">The new reading cannot be lower than ${escapeHtml(current)} hrs in Quick Update.</span>`;
        return;
      }

      message.textContent = "Saving hours...";

      const { error: updateError } = await db
        .from("equipment")
        .update({ current_hours: newHours, updated_by: currentUser.id })
        .eq("id", equipmentId);

      if (updateError) {
        console.error("Quick hours update error:", updateError);
        message.innerHTML = `<span class="error-text">${escapeHtml(updateError.message)}</span>`;
        return;
      }

      await window.openEquipment(equipmentId, siteId);
    });
  }

  async function showEditEquipmentForm(equipmentId, siteId) {
    const grid = appView.querySelector(".grid");
    grid.innerHTML = `<section class="card" style="grid-column:1/-1;"><p>Loading equipment...</p></section>`;

    const { data: machine, error } = await getEquipmentForEdit(equipmentId);

    if (error || !machine) {
      grid.innerHTML = `
        <section class="card" style="grid-column:1/-1;">
          <h2>Equipment could not be loaded</h2>
          <p class="error-text">${escapeHtml(error?.message || "Unknown error")}</p>
          <button id="editEquipmentBack" type="button">← Back to Equipment</button>
        </section>`;
      document.querySelector("#editEquipmentBack").addEventListener("click", () => window.openEquipment(equipmentId, siteId));
      return;
    }

    grid.innerHTML = `
      <section class="card" style="grid-column:1/-1;">
        <div class="section-heading">
          <div>
            <h2 style="margin:0;">Edit Equipment</h2>
            <small>${escapeHtml(machine.unit_number || machine.name)}</small>
          </div>
          <button id="editEquipmentBack" type="button">← Back to Equipment</button>
        </div>

        <form id="editEquipmentForm" style="margin-top:18px;">
          <div class="form-grid">
            <label>Unit Number
              <input id="editUnitNumber" type="text" value="${escapeHtml(equipmentValue(machine.unit_number))}">
            </label>

            <label>Equipment Name
              <input id="editEquipmentName" type="text" required value="${escapeHtml(equipmentValue(machine.name))}">
            </label>

            <label>Make
              <input id="editMake" type="text" value="${escapeHtml(equipmentValue(machine.make))}">
            </label>

            <label>Model
              <input id="editModel" type="text" value="${escapeHtml(equipmentValue(machine.model))}">
            </label>

            <label>Equipment Serial Number
              <input id="editSerial" type="text" value="${escapeHtml(equipmentValue(machine.serial_number))}">
            </label>

            <label>Engine Serial Number
              <input id="editEngineSerial" type="text" value="${escapeHtml(equipmentValue(machine.engine_serial_number))}">
            </label>

            <label>VIN
              <input id="editVin" type="text" value="${escapeHtml(equipmentValue(machine.vin || "N/A"))}">
            </label>

            <label>Rental / Owned
              <select id="editOwnership">
                <option value="owned" ${machine.ownership === "owned" ? "selected" : ""}>Owned</option>
                <option value="rental" ${machine.ownership === "rental" ? "selected" : ""}>Rental</option>
              </select>
            </label>

            <label>Status
              <select id="editStatus">
                <option value="active" ${machine.status === "active" ? "selected" : ""}>Active</option>
                <option value="rental" ${machine.status === "rental" ? "selected" : ""}>Rental</option>
                <option value="out_of_service" ${machine.status === "out_of_service" ? "selected" : ""}>Out of Service</option>
              </select>
            </label>

            <label>Current Engine Hours
              <input id="editHours" type="number" min="0" step="0.1" value="${escapeHtml(equipmentValue(machine.current_hours))}">
              <small>Use this field only to correct a mistaken meter reading.</small>
            </label>

            <label>Expected Operation
              <select id="editHoursPerDay">
                <option value="" ${machine.operating_hours_per_day == null ? "selected" : ""}>Not set</option>
                <option value="12" ${Number(machine.operating_hours_per_day) === 12 ? "selected" : ""}>12 hrs/day</option>
                <option value="24" ${Number(machine.operating_hours_per_day) === 24 ? "selected" : ""}>24 hrs/day</option>
              </select>
            </label>

            <label>Oil Type
              <input id="editOilType" type="text" value="${escapeHtml(equipmentValue(machine.oil_type))}">
            </label>

            <label>Oil Capacity
              <input id="editOilCapacity" type="number" min="0" step="0.01" value="${escapeHtml(equipmentValue(machine.oil_capacity))}">
            </label>
          </div>

          <label>Notes
            <textarea id="editNotes" rows="5">${escapeHtml(equipmentValue(machine.notes))}</textarea>
          </label>

          <div class="location-box">
            <div class="section-heading">
              <div>
                <strong>Equipment GPS Location</strong><br>
                <small>Update manually or stand beside the equipment and capture its current location.</small>
              </div>
              <button id="editSetLocation" type="button">📍 Set Current Location</button>
            </div>

            <div class="form-grid">
              <label>Latitude
                <input id="editLatitude" type="number" step="any" value="${escapeHtml(equipmentValue(machine.latitude))}">
              </label>
              <label>Longitude
                <input id="editLongitude" type="number" step="any" value="${escapeHtml(equipmentValue(machine.longitude))}">
              </label>
            </div>
            <input id="editGpsAccuracy" type="hidden" value="${escapeHtml(equipmentValue(machine.gps_accuracy_m))}">
            <p id="editLocationStatus" class="field-status"></p>
          </div>

          <div class="form-actions">
            <button type="submit">Save Equipment Changes</button>
            <button id="editEquipmentCancel" type="button" class="secondary-button">Cancel</button>
          </div>
          <p id="editEquipmentMessage" class="field-status"></p>
        </form>
      </section>`;

    const goBack = () => window.openEquipment(equipmentId, siteId);
    document.querySelector("#editEquipmentBack").addEventListener("click", goBack);
    document.querySelector("#editEquipmentCancel").addEventListener("click", goBack);

    document.querySelector("#editSetLocation").addEventListener("click", () => {
      captureCurrentLocation("editLatitude", "editLongitude", "editGpsAccuracy", "editLocationStatus");
    });

    document.querySelector("#editEquipmentForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const message = document.querySelector("#editEquipmentMessage");
      message.textContent = "Saving equipment changes...";

      const newLatitude = equipmentNumberOrNull("editLatitude");
      const newLongitude = equipmentNumberOrNull("editLongitude");
      const newAccuracy = equipmentNumberOrNull("editGpsAccuracy");
      const gpsChanged =
        newLatitude !== (machine.latitude == null ? null : Number(machine.latitude)) ||
        newLongitude !== (machine.longitude == null ? null : Number(machine.longitude)) ||
        newAccuracy !== (machine.gps_accuracy_m == null ? null : Number(machine.gps_accuracy_m));

      const updateRecord = {
        unit_number: equipmentTextOrNull("editUnitNumber"),
        name: document.querySelector("#editEquipmentName").value.trim(),
        make: equipmentTextOrNull("editMake"),
        model: equipmentTextOrNull("editModel"),
        serial_number: equipmentTextOrNull("editSerial"),
        engine_serial_number: equipmentTextOrNull("editEngineSerial"),
        vin: equipmentTextOrNull("editVin") || "N/A",
        ownership: document.querySelector("#editOwnership").value,
        status: document.querySelector("#editStatus").value,
        current_hours: equipmentNumberOrNull("editHours"),
        operating_hours_per_day: equipmentNumberOrNull("editHoursPerDay"),
        oil_type: equipmentTextOrNull("editOilType"),
        oil_capacity: equipmentNumberOrNull("editOilCapacity"),
        notes: equipmentTextOrNull("editNotes"),
        latitude: newLatitude,
        longitude: newLongitude,
        gps_accuracy_m: newAccuracy,
        gps_captured_at: gpsChanged && newLatitude != null && newLongitude != null ? new Date().toISOString() : machine.gps_captured_at,
        gps_captured_by: gpsChanged && newLatitude != null && newLongitude != null ? currentUser.id : machine.gps_captured_by,
        updated_by: currentUser.id
      };

      if (!updateRecord.name) {
        message.innerHTML = '<span class="error-text">Equipment name is required.</span>';
        return;
      }

      if (updateRecord.current_hours != null && (!Number.isFinite(updateRecord.current_hours) || updateRecord.current_hours < 0)) {
        message.innerHTML = '<span class="error-text">Engine hours must be a non-negative number.</span>';
        return;
      }

      const { error: updateError } = await db
        .from("equipment")
        .update(updateRecord)
        .eq("id", equipmentId);

      if (updateError) {
        console.error("Equipment edit error:", updateError);
        message.innerHTML = `<span class="error-text">${escapeHtml(updateError.message)}</span>`;
        return;
      }

      await window.openEquipment(equipmentId, siteId);
    });
  }
})();
