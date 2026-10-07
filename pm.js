/* V3 equipment preventive maintenance module */

function pmNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pmDisplay(value, fallback = "—") {
  return value === null || value === undefined || value === "" ? fallback : escapeHtml(value);
}

function pmFriendly(value) {
  return String(value || "").replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());
}

function pmStatusMeta(nextDue, currentHours) {
  const due = pmNumber(nextDue);
  const current = pmNumber(currentHours);
  if (due === null || current === null) {
    return { label: "Due hour not set", remaining: null, style: "border-left:5px solid #9aa7b2;" };
  }

  const remaining = due - current;
  if (remaining <= 0) {
    return {
      label: `${Math.abs(remaining).toFixed(1)} hrs overdue`,
      remaining,
      style: "border-left:5px solid #b42318;background:#fff1f0;"
    };
  }
  if (remaining <= 20) {
    return {
      label: `${remaining.toFixed(1)} hrs remaining`,
      remaining,
      style: "border-left:5px solid #d96b00;background:#fff4e5;"
    };
  }
  if (remaining <= 50) {
    return {
      label: `${remaining.toFixed(1)} hrs remaining`,
      remaining,
      style: "border-left:5px solid #d6a400;background:#fffbe6;"
    };
  }
  return {
    label: `${remaining.toFixed(1)} hrs remaining`,
    remaining,
    style: "border-left:5px solid #2f7d4a;background:#f3fbf6;"
  };
}

function pmRotationDays(site) {
  if (!site) return null;
  if (site.rotation_type === "14_7") return { on: 14, off: 7 };
  if (site.rotation_type === "20_10") return { on: 20, off: 10 };
  if (site.rotation_type === "custom" && site.rotation_on_days && site.rotation_off_days) {
    return { on: Number(site.rotation_on_days), off: Number(site.rotation_off_days) };
  }
  return null;
}

function pmEstimatedDueDate(machine, site, nextDueHours) {
  const current = pmNumber(machine.current_hours);
  const due = pmNumber(nextDueHours);
  const hoursPerDay = pmNumber(machine.operating_hours_per_day);
  if (current === null || due === null || hoursPerDay === null || hoursPerDay <= 0) return null;

  const remaining = due - current;
  if (remaining <= 0) return "Due now";

  const rotation = pmRotationDays(site);
  const anchor = site?.rotation_anchor_date ? new Date(`${site.rotation_anchor_date}T12:00:00`) : null;
  let accumulated = 0;
  let cursor = new Date();
  cursor.setHours(12, 0, 0, 0);

  for (let i = 0; i < 730; i++) {
    let workingDay = true;

    if (rotation && anchor) {
      const diffDays = Math.floor((cursor - anchor) / 86400000);
      const cycle = rotation.on + rotation.off;
      const phase = ((diffDays % cycle) + cycle) % cycle;
      workingDay = phase < rotation.on;
    }

    if (workingDay) {
      accumulated += hoursPerDay;
      if (accumulated >= remaining) {
        return cursor.toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric"
        });
      }
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return null;
}

window.openEquipment = async function(equipmentId, siteId) {
  const grid = appView.querySelector(".grid");
  grid.innerHTML = `<section class="card" style="grid-column:1/-1;"><p>Loading equipment...</p></section>`;

  const [
    { data: machine, error: machineError },
    { data: site, error: siteError },
    { data: schedules, error: schedulesError },
    { data: filters, error: filtersError },
    { data: history, error: historyError }
  ] = await Promise.all([
    db.from("equipment")
      .select(`id,site_id,unit_number,name,make,model,serial_number,engine_serial_number,vin,ownership,status,current_hours,operating_hours_per_day,oil_type,oil_capacity,notes,latitude,longitude,gps_accuracy_m,gps_captured_at,archived`)
      .eq("id", equipmentId)
      .single(),
    db.from("sites")
      .select(`id,name,rotation_type,rotation_on_days,rotation_off_days,rotation_anchor_date`)
      .eq("id", siteId)
      .single(),
    db.from("pm_schedules")
      .select(`id,service_name,description,interval_hours,last_service_hours,next_due_hours,active`)
      .eq("equipment_id", equipmentId)
      .eq("active", true)
      .order("next_due_hours", { ascending: true, nullsFirst: false }),
    db.from("equipment_filters")
      .select(`id,filter_type,description,part_number,quantity`)
      .eq("equipment_id", equipmentId)
      .order("filter_type"),
    db.from("service_history")
      .select(`id,pm_schedule_id,service_name,service_hours,scheduled_due_hours,service_date,notes,parts_used,created_at`)
      .eq("equipment_id", equipmentId)
      .order("service_date", { ascending: false })
      .limit(25)
  ]);

  if (machineError || !machine) {
    console.error("Equipment lookup error:", machineError);
    grid.innerHTML = `
      <section class="card" style="grid-column:1/-1;">
        <h2>Equipment could not be loaded</h2>
        <p>${escapeHtml(machineError?.message || "Unknown error")}</p>
        <button id="equipmentBackSite">← Back to Site</button>
      </section>`;
    document.querySelector("#equipmentBackSite").addEventListener("click", () => openSite(siteId));
    return;
  }

  if (siteError) console.error("Equipment site lookup error:", siteError);
  if (schedulesError) console.error("PM schedule lookup error:", schedulesError);
  if (filtersError) console.error("Filter lookup error:", filtersError);
  if (historyError) console.error("Service history lookup error:", historyError);

  const makeModel = [machine.make, machine.model].filter(Boolean).join(" ") || "—";
  const hasGps = machine.latitude != null && machine.longitude != null;

  const scheduleHtml = schedulesError
    ? `<div class="empty-state"><strong>PM schedules could not be loaded.</strong><br><small>${escapeHtml(schedulesError.message)}</small></div>`
    : schedules && schedules.length
      ? schedules.map(schedule => {
          const status = pmStatusMeta(schedule.next_due_hours, machine.current_hours);
          const estimated = pmEstimatedDueDate(machine, site, schedule.next_due_hours);
          return `
            <article class="inset-card compact-card" style="${status.style}margin-top:10px;">
              <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;">
                <div>
                  <strong>${escapeHtml(schedule.service_name)}</strong><br>
                  ${schedule.description ? `<small>${escapeHtml(schedule.description)}</small><br>` : ""}
                  <small><strong>Interval:</strong> ${pmDisplay(schedule.interval_hours)} hrs</small><br>
                  <small><strong>Last service:</strong> ${pmDisplay(schedule.last_service_hours)} hrs</small><br>
                  <small><strong>Next due:</strong> ${pmDisplay(schedule.next_due_hours)} hrs</small>
                </div>
                <div style="text-align:right;">
                  <strong>${escapeHtml(status.label)}</strong>
                  ${estimated ? `<br><small>Estimated: ${escapeHtml(estimated)}</small>` : ""}
                </div>
              </div>
            </article>`;
        }).join("")
      : `<div class="empty-state"><strong>No preventive maintenance schedules yet.</strong></div>`;

  const filterHtml = filtersError
    ? `<div class="empty-state"><strong>Filters could not be loaded.</strong><br><small>${escapeHtml(filtersError.message)}</small></div>`
    : filters && filters.length
      ? filters.map(filter => `
          <article class="inset-card compact-card" style="margin-top:10px;">
            <strong>${escapeHtml(pmFriendly(filter.filter_type))}</strong><br>
            <span>${escapeHtml(filter.part_number)}</span>
            ${filter.description ? `<br><small>${escapeHtml(filter.description)}</small>` : ""}
            <br><small><strong>Qty:</strong> ${escapeHtml(filter.quantity)}</small>
          </article>`).join("")
      : `<div class="empty-state"><strong>No filters or service parts saved yet.</strong></div>`;

  const historyHtml = historyError
    ? `<div class="empty-state"><strong>Service history could not be loaded.</strong><br><small>${escapeHtml(historyError.message)}</small></div>`
    : history && history.length
      ? history.map(record => {
          const late = pmNumber(record.scheduled_due_hours) !== null && pmNumber(record.service_hours) > pmNumber(record.scheduled_due_hours);
          const lateness = late ? pmNumber(record.service_hours) - pmNumber(record.scheduled_due_hours) : 0;
          return `
            <article class="inset-card compact-card" style="margin-top:10px;${late ? "border-left:5px solid #b42318;background:#fff1f0;" : ""}">
              <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">
                <div>
                  <strong>${escapeHtml(record.service_name)}</strong><br>
                  <small>${escapeHtml(record.service_date)} at ${escapeHtml(record.service_hours)} hrs</small>
                </div>
                ${late ? `<strong style="color:#b42318;">${escapeHtml(lateness.toFixed(1))} hrs late</strong>` : ""}
              </div>
              ${record.parts_used ? `<p><small><strong>Parts:</strong> ${escapeHtml(record.parts_used)}</small></p>` : ""}
              ${record.notes ? `<p><small>${escapeHtml(record.notes)}</small></p>` : ""}
            </article>`;
        }).join("")
      : `<div class="empty-state"><strong>No completed service recorded yet.</strong></div>`;

  grid.innerHTML = `
    <section class="card" style="grid-column:1/-1;">
      <div class="section-heading">
        <div>
          <small>${escapeHtml(site?.name || "Equipment")}</small>
          <h2 style="margin:2px 0 0;">${escapeHtml(machine.unit_number || machine.name)}</h2>
          ${machine.unit_number && machine.name ? `<p style="margin:4px 0 0;">${escapeHtml(machine.name)}</p>` : ""}
        </div>
        <div class="form-actions compact-actions">
          <button id="equipmentBackSite" type="button">← Back to Site</button>
          ${hasGps ? `<button id="equipmentNavigate" type="button">Navigate</button>` : ""}
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;margin-top:20px;">
        <div class="inset-card compact-card"><small>Make / Model</small><br><strong>${escapeHtml(makeModel)}</strong></div>
        <div class="inset-card compact-card"><small>Current Hours</small><br><strong>${pmDisplay(machine.current_hours)}</strong></div>
        <div class="inset-card compact-card"><small>Ownership</small><br><strong>${escapeHtml(pmFriendly(machine.ownership))}</strong></div>
        <div class="inset-card compact-card"><small>Status</small><br><strong>${escapeHtml(pmFriendly(machine.status))}</strong></div>
        <div class="inset-card compact-card"><small>Equipment Serial</small><br><strong>${pmDisplay(machine.serial_number)}</strong></div>
        <div class="inset-card compact-card"><small>Engine Serial</small><br><strong>${pmDisplay(machine.engine_serial_number)}</strong></div>
        <div class="inset-card compact-card"><small>VIN</small><br><strong>${pmDisplay(machine.vin, "N/A")}</strong></div>
        <div class="inset-card compact-card"><small>Expected Operation</small><br><strong>${machine.operating_hours_per_day ? `${escapeHtml(machine.operating_hours_per_day)} hrs/day` : "—"}</strong></div>
        <div class="inset-card compact-card"><small>Oil Type</small><br><strong>${pmDisplay(machine.oil_type)}</strong></div>
        <div class="inset-card compact-card"><small>Oil Capacity</small><br><strong>${machine.oil_capacity != null ? `${escapeHtml(machine.oil_capacity)}` : "—"}</strong></div>
      </div>

      ${machine.notes ? `<div class="location-box" style="margin-top:16px;"><strong>Notes</strong><p style="margin-bottom:0;">${escapeHtml(machine.notes)}</p></div>` : ""}
      ${hasGps ? `<div class="location-box" style="margin-top:16px;"><strong>Saved GPS Location</strong><p style="margin:6px 0 0;">${escapeHtml(machine.latitude)}, ${escapeHtml(machine.longitude)}${machine.gps_accuracy_m != null ? ` — ±${escapeHtml(machine.gps_accuracy_m)} m` : ""}</p></div>` : ""}

      <hr style="border:0;border-top:1px solid #d7e0e7;margin:24px 0;">

      <div class="section-heading">
        <div>
          <h3 style="margin:0;">Preventive Maintenance</h3>
          <small>50 hrs = yellow, 20 hrs = orange, overdue = red.</small>
        </div>
        <button id="addPmScheduleButton" type="button">+ Add PM Schedule</button>
      </div>
      <div>${scheduleHtml}</div>

      <hr style="border:0;border-top:1px solid #d7e0e7;margin:24px 0;">

      <div class="section-heading">
        <div><h3 style="margin:0;">Filters & Service Parts</h3><small>Part numbers used for maintenance and pack lists.</small></div>
        <button id="addFilterButton" type="button">+ Add Filter / Part</button>
      </div>
      <div>${filterHtml}</div>

      <hr style="border:0;border-top:1px solid #d7e0e7;margin:24px 0;">

      <div class="section-heading">
        <div><h3 style="margin:0;">Service History</h3><small>Completed service stays with this machine.</small></div>
        <button id="recordServiceButton" type="button">+ Record Service</button>
      </div>
      <div>${historyHtml}</div>
    </section>`;

  document.querySelector("#equipmentBackSite").addEventListener("click", () => openSite(siteId));
  if (hasGps) {
    document.querySelector("#equipmentNavigate").addEventListener("click", () => navigateToSite(machine.latitude, machine.longitude));
  }
  document.querySelector("#addPmScheduleButton").addEventListener("click", () => showPmScheduleForm(machine, siteId));
  document.querySelector("#addFilterButton").addEventListener("click", () => showEquipmentFilterForm(machine, siteId));
  document.querySelector("#recordServiceButton").addEventListener("click", () => showServiceForm(machine, siteId, schedules || []));
};

function showPmScheduleForm(machine, siteId) {
  const grid = appView.querySelector(".grid");
  grid.innerHTML = `
    <section class="card" style="grid-column:1/-1;">
      <div class="section-heading">
        <div><h2 style="margin:0;">Add PM Schedule</h2><small>${escapeHtml(machine.unit_number || machine.name)}</small></div>
        <button id="pmCancelTop">← Back to Equipment</button>
      </div>
      <form id="pmScheduleForm">
        <label>Service Name<input id="pmServiceName" required placeholder="Example: Engine Oil & Filter"></label>
        <label>Description<textarea id="pmDescription" rows="3" placeholder="Optional service details"></textarea></label>
        <div class="form-grid">
          <label>Interval Hours<input id="pmInterval" type="number" min="1" step="0.1" required placeholder="250"></label>
          <label>Last Service Hours<input id="pmLastHours" type="number" min="0" step="0.1" placeholder="Blank = current hours"></label>
        </div>
        <p><small>If Last Service Hours is blank, the current machine hours (${pmDisplay(machine.current_hours)}) will be used.</small></p>
        <div class="form-actions"><button type="submit">Save PM Schedule</button><button id="pmCancelBottom" type="button" class="secondary-button">Cancel</button></div>
        <p id="pmScheduleMessage" class="field-status"></p>
      </form>
    </section>`;

  const back = () => openEquipment(machine.id, siteId);
  document.querySelector("#pmCancelTop").addEventListener("click", back);
  document.querySelector("#pmCancelBottom").addEventListener("click", back);
  document.querySelector("#pmScheduleForm").addEventListener("submit", async event => {
    event.preventDefault();
    const message = document.querySelector("#pmScheduleMessage");
    message.textContent = "Saving schedule...";

    const interval = pmNumber(document.querySelector("#pmInterval").value);
    const enteredLast = pmNumber(document.querySelector("#pmLastHours").value);
    const current = pmNumber(machine.current_hours);
    const last = enteredLast !== null ? enteredLast : current;
    const next = last !== null && interval !== null ? last + interval : null;

    const { error } = await db.from("pm_schedules").insert({
      equipment_id: machine.id,
      service_name: document.querySelector("#pmServiceName").value.trim(),
      description: document.querySelector("#pmDescription").value.trim() || null,
      interval_hours: interval,
      last_service_hours: last,
      next_due_hours: next,
      active: true,
      created_by: currentUser.id,
      updated_by: currentUser.id
    });

    if (error) {
      console.error("PM schedule save error:", error);
      message.innerHTML = `<span class="error-text">${escapeHtml(error.message)}</span>`;
      return;
    }
    await openEquipment(machine.id, siteId);
  });
}

function showEquipmentFilterForm(machine, siteId) {
  const grid = appView.querySelector(".grid");
  grid.innerHTML = `
    <section class="card" style="grid-column:1/-1;">
      <div class="section-heading">
        <div><h2 style="margin:0;">Add Filter / Service Part</h2><small>${escapeHtml(machine.unit_number || machine.name)}</small></div>
        <button id="filterCancelTop">← Back to Equipment</button>
      </div>
      <form id="filterForm">
        <div class="form-grid">
          <label>Type<select id="filterType"><option value="oil">Oil Filter</option><option value="fuel">Fuel Filter</option><option value="fuel_water_separator">Fuel / Water Separator</option><option value="air">Air Filter</option><option value="hydraulic">Hydraulic Filter</option><option value="other">Other</option></select></label>
          <label>Part Number<input id="filterPartNumber" required></label>
          <label>Quantity<input id="filterQuantity" type="number" min="1" step="1" value="1" required></label>
        </div>
        <label>Description<input id="filterDescription" placeholder="Optional description or location"></label>
        <div class="form-actions"><button type="submit">Save Filter / Part</button><button id="filterCancelBottom" type="button" class="secondary-button">Cancel</button></div>
        <p id="filterMessage" class="field-status"></p>
      </form>
    </section>`;

  const back = () => openEquipment(machine.id, siteId);
  document.querySelector("#filterCancelTop").addEventListener("click", back);
  document.querySelector("#filterCancelBottom").addEventListener("click", back);
  document.querySelector("#filterForm").addEventListener("submit", async event => {
    event.preventDefault();
    const message = document.querySelector("#filterMessage");
    message.textContent = "Saving part...";
    const { error } = await db.from("equipment_filters").insert({
      equipment_id: machine.id,
      filter_type: document.querySelector("#filterType").value,
      part_number: document.querySelector("#filterPartNumber").value.trim(),
      quantity: Number(document.querySelector("#filterQuantity").value) || 1,
      description: document.querySelector("#filterDescription").value.trim() || null,
      created_by: currentUser.id,
      updated_by: currentUser.id
    });
    if (error) {
      console.error("Filter save error:", error);
      message.innerHTML = `<span class="error-text">${escapeHtml(error.message)}</span>`;
      return;
    }
    await openEquipment(machine.id, siteId);
  });
}

function showServiceForm(machine, siteId, schedules) {
  const grid = appView.querySelector(".grid");
  const options = schedules.map(s => `<option value="${s.id}" data-name="${escapeHtml(s.service_name)}" data-due="${s.next_due_hours ?? ""}" data-interval="${s.interval_hours}">${escapeHtml(s.service_name)}</option>`).join("");
  const today = new Date().toISOString().slice(0, 10);

  grid.innerHTML = `
    <section class="card" style="grid-column:1/-1;">
      <div class="section-heading">
        <div><h2 style="margin:0;">Record Completed Service</h2><small>${escapeHtml(machine.unit_number || machine.name)}</small></div>
        <button id="serviceCancelTop">← Back to Equipment</button>
      </div>
      <form id="serviceForm">
        <label>PM Schedule<select id="serviceSchedule"><option value="">Manual / unscheduled service</option>${options}</select></label>
        <label>Service Name<input id="serviceName" required placeholder="Example: Engine Oil & Filter"></label>
        <div class="form-grid">
          <label>Service Hours<input id="serviceHours" type="number" min="0" step="0.1" required value="${machine.current_hours ?? ""}"></label>
          <label>Service Date<input id="serviceDate" type="date" required value="${today}"></label>
        </div>
        <label>Parts Used<textarea id="serviceParts" rows="3" placeholder="Part numbers, quantities, oil, etc."></textarea></label>
        <label>Notes<textarea id="serviceNotes" rows="4" placeholder="Work completed, findings, follow-up"></textarea></label>
        <div class="form-actions"><button type="submit">Save Service Record</button><button id="serviceCancelBottom" type="button" class="secondary-button">Cancel</button></div>
        <p id="serviceMessage" class="field-status"></p>
      </form>
    </section>`;

  const back = () => openEquipment(machine.id, siteId);
  document.querySelector("#serviceCancelTop").addEventListener("click", back);
  document.querySelector("#serviceCancelBottom").addEventListener("click", back);

  const scheduleSelect = document.querySelector("#serviceSchedule");
  scheduleSelect.addEventListener("change", () => {
    const selected = scheduleSelect.selectedOptions[0];
    if (selected && selected.value) document.querySelector("#serviceName").value = selected.dataset.name || "";
  });

  document.querySelector("#serviceForm").addEventListener("submit", async event => {
    event.preventDefault();
    const message = document.querySelector("#serviceMessage");
    message.textContent = "Saving service record...";

    const selected = scheduleSelect.selectedOptions[0];
    const scheduleId = selected?.value || null;
    const serviceHours = pmNumber(document.querySelector("#serviceHours").value);
    const scheduledDue = selected?.dataset?.due ? pmNumber(selected.dataset.due) : null;

    const { error: historyInsertError } = await db.from("service_history").insert({
      equipment_id: machine.id,
      pm_schedule_id: scheduleId,
      service_name: document.querySelector("#serviceName").value.trim(),
      service_hours: serviceHours,
      scheduled_due_hours: scheduledDue,
      service_date: document.querySelector("#serviceDate").value,
      parts_used: document.querySelector("#serviceParts").value.trim() || null,
      notes: document.querySelector("#serviceNotes").value.trim() || null,
      completed_by: currentUser.id
    });

    if (historyInsertError) {
      console.error("Service history save error:", historyInsertError);
      message.innerHTML = `<span class="error-text">${escapeHtml(historyInsertError.message)}</span>`;
      return;
    }

    if (scheduleId) {
      const interval = pmNumber(selected.dataset.interval);
      const nextDue = serviceHours !== null && interval !== null ? serviceHours + interval : null;
      const { error: scheduleUpdateError } = await db.from("pm_schedules")
        .update({
          last_service_hours: serviceHours,
          next_due_hours: nextDue,
          updated_by: currentUser.id
        })
        .eq("id", scheduleId);

      if (scheduleUpdateError) {
        console.error("PM schedule refresh error:", scheduleUpdateError);
        message.innerHTML = `<span class="error-text">Service was saved, but the next due hours could not be updated: ${escapeHtml(scheduleUpdateError.message)}</span>`;
        return;
      }
    }

    await openEquipment(machine.id, siteId);
  });
}
