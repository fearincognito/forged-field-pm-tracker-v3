/* Record service with optional automatic site-inventory deductions. */
(function () {
  const baseShowServiceForm = window.showServiceForm;
  if (typeof baseShowServiceForm !== "function") {
    console.error("service_inventory_usage.js loaded before pm.js");
    return;
  }

  const normalizePart = value => String(value || "").trim().toUpperCase();
  const friendly = value => String(value || "").replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());
  const UNSCHEDULED = "__unscheduled__";
  const displayHours = value => value.toLocaleString("en-US", { maximumFractionDigits: 3 });

  async function loadServiceInventory(machine, siteId) {
    const [filterResult, inventoryResult] = await Promise.all([
      db.from("equipment_filters")
        .select("id,filter_type,description,part_number,quantity")
        .eq("equipment_id", machine.id)
        .order("filter_type"),
      db.from("site_inventory")
        .select("id,part_number,description,category,quantity_on_hand")
        .eq("site_id", siteId)
        .order("part_number")
    ]);

    return {
      filters: filterResult.data || [],
      inventory: inventoryResult.data || [],
      error: filterResult.error || inventoryResult.error
    };
  }

  function buildRows(filters, inventory) {
    const inventoryTotals = {};
    inventory.forEach(item => {
      const key = normalizePart(item.part_number);
      if (!key) return;
      inventoryTotals[key] = (inventoryTotals[key] || 0) + Number(item.quantity_on_hand || 0);
    });

    const grouped = {};
    filters.forEach(filter => {
      const part = String(filter.part_number || "").trim();
      const key = normalizePart(part);
      if (!key) return;
      if (!grouped[key]) {
        grouped[key] = {
          part_number: part,
          quantity: 0,
          types: new Set(),
          descriptions: new Set()
        };
      }
      grouped[key].quantity += Math.max(1, Number(filter.quantity || 1));
      if (filter.filter_type) grouped[key].types.add(friendly(filter.filter_type));
      if (filter.description) grouped[key].descriptions.add(filter.description);
    });

    return Object.values(grouped)
      .sort((a, b) => a.part_number.localeCompare(b.part_number))
      .map(row => ({
        ...row,
        on_hand: inventoryTotals[normalizePart(row.part_number)] || 0
      }));
  }

  function inventoryRowsHtml(rows) {
    if (!rows.length) {
      return `<div class="empty-state"><strong>No saved filters or service parts for this equipment.</strong></div>`;
    }

    return rows.map(row => {
      const enough = row.on_hand >= row.quantity;
      const subtitle = [
        Array.from(row.types).join(" / "),
        Array.from(row.descriptions).join(" / ")
      ].filter(Boolean).join(" · ");

      return `
        <label class="inset-card compact-card" style="display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:9px;${enough ? "cursor:pointer;" : "opacity:.7;"}">
          <span style="display:flex;align-items:flex-start;gap:10px;min-width:0;">
            <input class="serviceInventoryCheck" type="checkbox"
              data-part="${escapeHtml(row.part_number)}"
              data-qty="${escapeHtml(row.quantity)}"
              ${enough ? "" : "disabled"}
              style="width:20px;height:20px;flex:0 0 auto;margin-top:2px;">
            <span style="min-width:0;">
              <strong>${escapeHtml(row.part_number)}</strong>
              ${subtitle ? `<br><small>${escapeHtml(subtitle)}</small>` : ""}
              <br><small>Service requires <strong>${escapeHtml(row.quantity)}</strong></small>
            </span>
          </span>
          <span style="text-align:right;flex:0 0 auto;">
            <strong>${escapeHtml(row.on_hand)}</strong><br>
            <small>${enough ? "On site" : "Not enough on site"}</small>
          </span>
        </label>`;
    }).join("");
  }

  window.showServiceForm = async function (machine, siteId, schedules) {
    const grid = appView.querySelector(".grid");
    grid.innerHTML = `<section class="card" style="grid-column:1/-1;"><p>Loading service form...</p></section>`;

    const { filters, inventory, error } = await loadServiceInventory(machine, siteId);
    const rows = buildRows(filters, inventory);
    const availableSchedules = (schedules || []).filter(s => s && s.id);
    const options = availableSchedules.map(s => `
      <option value="${escapeHtml(s.id)}">${escapeHtml(s.service_name)} (${escapeHtml(s.interval_hours)}-hour PM)</option>`).join("");
    const today = new Date().toISOString().slice(0, 10);

    grid.innerHTML = `
      <section class="card" style="grid-column:1/-1;">
        <div class="section-heading">
          <div><h2 style="margin:0;">Record Completed Service</h2><small>${escapeHtml(machine.unit_number || machine.name)}</small></div>
          <button id="serviceCancelTop" type="button">← Back to Equipment</button>
        </div>

        <form id="serviceForm" style="margin-top:18px;">
          <label>PM Schedule / Service Type (required)
            <select id="serviceSchedule" required aria-describedby="serviceScheduleHelp serviceSchedulePreview">
              <option value="" selected disabled>Choose a PM schedule or unscheduled work…</option>
              ${options}
              <option value="${UNSCHEDULED}">Manual / unscheduled work — does not reset PM</option>
            </select>
          </label>
          <p id="serviceScheduleHelp"><small>${availableSchedules.length ? "Choose the scheduled PM you completed, or deliberately select unscheduled work." : "No PM schedules are available for this equipment. Select unscheduled work to record it without resetting a PM, or go back and add a PM schedule first."}</small></p>
          <label>Service Name<input id="serviceName" required placeholder="Example: Engine Oil & Filter"></label>
          <div class="form-grid">
            <label>Service Hours<input id="serviceHours" type="number" min="0" step="0.1" required value="${machine.current_hours ?? ""}"></label>
            <label>Service Date<input id="serviceDate" type="date" required value="${today}"></label>
          </div>

          <div id="serviceSchedulePreview" class="location-box" role="status" aria-live="polite" style="margin-top:12px;"></div>

          <p><small>Service hours also update the equipment meter and restart its runtime estimate. A reading below the saved meter is kept in service history without lowering the equipment meter.</small></p>
          <div class="location-box" style="margin-top:16px;">
            <div class="section-heading" style="align-items:flex-start;">
              <div>
                <strong>Use Filters From Site Inventory</strong><br>
                <small>Check the filters you actually used. Their required quantity will be deducted automatically when the service record saves.</small>
              </div>
              ${rows.some(row => row.on_hand >= row.quantity) ? `<button id="selectAllServiceInventory" type="button" class="secondary-button">Select Available</button>` : ""}
            </div>
            ${error ? `<p class="error-text">Site inventory could not be checked: ${escapeHtml(error.message)}</p>` : `<div>${inventoryRowsHtml(rows)}</div>`}
          </div>

          <label>Other Parts Used
            <textarea id="serviceParts" rows="3" placeholder="Oil, seals, miscellaneous parts, etc. Selected site-inventory filters are added automatically."></textarea>
          </label>
          <label>Notes<textarea id="serviceNotes" rows="4" placeholder="Work completed, findings, follow-up"></textarea></label>
          <div class="form-actions">
            <button type="submit">Save Service Record</button>
            <button id="serviceCancelBottom" type="button" class="secondary-button">Cancel</button>
          </div>
          <p id="serviceMessage" class="field-status"></p>
        </form>
      </section>`;

    const back = () => openEquipment(machine.id, siteId);
    document.querySelector("#serviceCancelTop").addEventListener("click", back);
    document.querySelector("#serviceCancelBottom").addEventListener("click", back);

    document.querySelector("#selectAllServiceInventory")?.addEventListener("click", () => {
      document.querySelectorAll(".serviceInventoryCheck:not(:disabled)").forEach(input => { input.checked = true; });
    });

    const scheduleSelect = document.querySelector("#serviceSchedule");
    const hoursInput = document.querySelector("#serviceHours");
    const preview = document.querySelector("#serviceSchedulePreview");
    const form = document.querySelector("#serviceForm");
    const saveButton = form.querySelector("button[type=submit]");
    let saving = false;

    function serviceChoice() {
      const choice = scheduleSelect.value;
      const schedule = availableSchedules.find(s => s.id === choice);
      const hours = pmNumber(hoursInput.value);
      const interval = schedule ? pmNumber(schedule.interval_hours) : null;
      if (!choice) return { error: "Choose a PM schedule or explicitly select manual / unscheduled work before saving." };
      if (choice !== UNSCHEDULED && !schedule) return { error: "That PM schedule is unavailable. Go back to equipment and reopen the service form." };
      if (hours === null || hours < 0) return { error: "Enter valid, non-negative service hours to review this service." };
      if (schedule && (interval === null || interval <= 0 || !Number.isFinite(hours + interval))) {
        return { error: "This PM schedule needs a valid positive interval before service can be recorded. Go back and edit the schedule." };
      }
      return { schedule, hours, interval };
    }

    function updatePreview() {
      const state = serviceChoice();
      saveButton.disabled = saving || Boolean(state.error);
      if (scheduleSelect.value === UNSCHEDULED) {
        preview.textContent = "Unscheduled work: this records the service and updates the equipment meter, but does NOT reset any PM countdown or next-due hours.";
        if (state.error) preview.textContent += " " + state.error;
      } else if (state.error) {
        preview.textContent = state.error;
      } else {
        preview.textContent = `${displayHours(state.interval)}-hour ${state.schedule.service_name} PM: serviced at ${displayHours(state.hours)} hours; next due at ${displayHours(state.hours + state.interval)} hours. Saving resets this PM schedule only.`;
      }
      const savedMeter = pmNumber(machine.current_hours);
      if (!state.error && state.schedule && savedMeter !== null && state.hours < savedMeter) {
        preview.textContent += ` The equipment meter stays at ${displayHours(savedMeter)} hours, so fewer than ${displayHours(state.interval)} hours may remain.`;
      }
      return state;
    }

    scheduleSelect.addEventListener("change", () => {
      const schedule = availableSchedules.find(s => s.id === scheduleSelect.value);
      if (schedule) document.querySelector("#serviceName").value = schedule.service_name || "";
      updatePreview();
    });
    hoursInput.addEventListener("input", updatePreview);
    updatePreview();

    document.querySelector("#serviceForm").addEventListener("submit", async event => {
      event.preventDefault();
      if (saving) return;
      const message = document.querySelector("#serviceMessage");
      const state = updatePreview();
      if (state.error) {
        message.textContent = state.error;
        scheduleSelect.focus();
        return;
      }
      const scheduleId = state.schedule?.id || null;
      const serviceHours = state.hours;
      const scheduledDue = state.schedule ? pmNumber(state.schedule.next_due_hours) : null;
      const serviceName = document.querySelector("#serviceName").value.trim();
      const serviceDate = document.querySelector("#serviceDate").value;

      if (!serviceName || serviceHours === null || !serviceDate) {
        message.innerHTML = '<span class="error-text">Service name, hours and date are required.</span>';
        return;
      }

      const selectedParts = Array.from(document.querySelectorAll(".serviceInventoryCheck:checked"));
      const deductionsByPart = new Map();
      selectedParts.forEach(input => {
        const part = input.dataset.part || "";
        const key = normalizePart(part);
        const quantity = Math.max(1, Number(input.dataset.qty || 1));
        const existing = deductionsByPart.get(key) || { part_number: part, quantity: 0 };
        existing.quantity += quantity;
        deductionsByPart.set(key, existing);
      });

      const deductions = Array.from(deductionsByPart.values());
      const stockByPart = Object.fromEntries(rows.map(row => [normalizePart(row.part_number), row.on_hand]));
      const shortage = deductions.find(item => (stockByPart[normalizePart(item.part_number)] || 0) < item.quantity);
      if (shortage) {
        message.innerHTML = `<span class="error-text">Not enough ${escapeHtml(shortage.part_number)} is currently recorded on site. Refresh the equipment page and try again.</span>`;
        return;
      }

      const manualParts = document.querySelector("#serviceParts").value.trim();
      const inventoryPartsText = deductions.length
        ? `Site inventory: ${deductions.map(item => `${item.quantity} × ${item.part_number}`).join(", ")}`
        : "";
      const partsUsed = [inventoryPartsText, manualParts].filter(Boolean).join("; ") || null;

      saving = true;
      updatePreview();
      message.textContent = "Saving service record, equipment hours and site inventory...";
      // Keep the single transactional RPC: never save history or deduct inventory twice.
      try {
        const { error: saveError, status: saveStatus } = await db.rpc("record_service_with_inventory", {
          p_equipment_id: machine.id,
          p_pm_schedule_id: scheduleId,
          p_service_name: serviceName,
          p_service_hours: serviceHours,
          p_scheduled_due_hours: scheduledDue,
          p_service_date: serviceDate,
          p_parts_used: partsUsed,
          p_notes: document.querySelector("#serviceNotes").value.trim() || null,
          p_inventory_deductions: deductions
        });

        if (saveError && (saveStatus === 0 || [502, 503, 504].includes(saveStatus))) {
          throw saveError;
        }
        if (saveError) {
          console.error("Service + inventory save error:", saveError);
          message.innerHTML = `<span class="error-text">${escapeHtml(saveError.message)}</span>`;
          saving = false;
          updatePreview();
          return;
        }

        await openEquipment(machine.id, siteId);
      } catch (error) {
        console.error("Service save outcome could not be confirmed:", error);
        message.textContent = "The save result could not be confirmed. Reopen the equipment and check service history before trying again to avoid a duplicate service or parts deduction.";
        // Leave Save disabled after an uncertain transport/navigation failure.
      }
    });
  };
})();

