/* Record service with optional automatic site-inventory deductions. */
(function () {
  const baseShowServiceForm = window.showServiceForm;
  if (typeof baseShowServiceForm !== "function") {
    console.error("service_inventory_usage.js loaded before pm.js");
    return;
  }

  const normalizePart = value => String(value || "").trim().toUpperCase();
  const friendly = value => String(value || "").replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());

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
    const options = (schedules || []).map(s => `
      <option value="${s.id}" data-name="${escapeHtml(s.service_name)}" data-due="${s.next_due_hours ?? ""}" data-interval="${s.interval_hours}">${escapeHtml(s.service_name)}</option>`).join("");
    const today = new Date().toISOString().slice(0, 10);

    grid.innerHTML = `
      <section class="card" style="grid-column:1/-1;">
        <div class="section-heading">
          <div><h2 style="margin:0;">Record Completed Service</h2><small>${escapeHtml(machine.unit_number || machine.name)}</small></div>
          <button id="serviceCancelTop" type="button">← Back to Equipment</button>
        </div>

        <form id="serviceForm" style="margin-top:18px;">
          <label>PM Schedule
            <select id="serviceSchedule"><option value="">Manual / unscheduled service</option>${options}</select>
          </label>
          <label>Service Name<input id="serviceName" required placeholder="Example: Engine Oil & Filter"></label>
          <div class="form-grid">
            <label>Service Hours<input id="serviceHours" type="number" min="0" step="0.1" required value="${machine.current_hours ?? ""}"></label>
            <label>Service Date<input id="serviceDate" type="date" required value="${today}"></label>
          </div>

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
    scheduleSelect.addEventListener("change", () => {
      const selected = scheduleSelect.selectedOptions[0];
      if (selected && selected.value) document.querySelector("#serviceName").value = selected.dataset.name || "";
    });

    document.querySelector("#serviceForm").addEventListener("submit", async event => {
      event.preventDefault();
      const message = document.querySelector("#serviceMessage");
      const submitButton = event.submitter || document.querySelector("#serviceForm button[type=submit]");
      if (submitButton) submitButton.disabled = true;
      message.textContent = "Saving service record and updating site inventory...";

      const selectedSchedule = scheduleSelect.selectedOptions[0];
      const scheduleId = selectedSchedule?.value || null;
      const serviceHours = pmNumber(document.querySelector("#serviceHours").value);
      const scheduledDue = selectedSchedule?.dataset?.due ? pmNumber(selectedSchedule.dataset.due) : null;
      const serviceName = document.querySelector("#serviceName").value.trim();
      const serviceDate = document.querySelector("#serviceDate").value;

      if (!serviceName || serviceHours === null || !serviceDate) {
        message.innerHTML = '<span class="error-text">Service name, hours and date are required.</span>';
        if (submitButton) submitButton.disabled = false;
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
        if (submitButton) submitButton.disabled = false;
        return;
      }

      const manualParts = document.querySelector("#serviceParts").value.trim();
      const inventoryPartsText = deductions.length
        ? `Site inventory: ${deductions.map(item => `${item.quantity} × ${item.part_number}`).join(", ")}`
        : "";
      const partsUsed = [inventoryPartsText, manualParts].filter(Boolean).join("; ") || null;

      const { error: saveError } = await db.rpc("record_service_with_inventory", {
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

      if (saveError) {
        console.error("Service + inventory save error:", saveError);
        message.innerHTML = `<span class="error-text">${escapeHtml(saveError.message)}</span>`;
        if (submitButton) submitButton.disabled = false;
        return;
      }

      await openEquipment(machine.id, siteId);
    });
  };
})();
