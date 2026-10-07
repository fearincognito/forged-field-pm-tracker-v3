/* V3 dashboard-wide service history view */

(function () {
  const baseRenderDashboard = window.renderDashboard;

  if (typeof baseRenderDashboard !== "function") {
    console.error("dashboard_service_history.js loaded before dashboard workflow");
    return;
  }

  function replaceButton(button, handler) {
    if (!button) return null;
    const next = button.cloneNode(true);
    button.replaceWith(next);
    next.addEventListener("click", handler);
    return next;
  }

  function formatServiceDate(value) {
    if (!value) return "—";
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
    const date = dateOnly
      ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
      : new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString(undefined, {
      year: "numeric", month: "short", day: "numeric"
    });
  }

  function hoursText(value) {
    if (value == null || value === "") return "—";
    const number = Number(value);
    return Number.isFinite(number) ? `${number.toFixed(1)} hrs` : `${value} hrs`;
  }

  function scheduleMeta(record) {
    if (record.service_hours == null || record.scheduled_due_hours == null) {
      return { label: "No scheduled due hours recorded", late: false, difference: null };
    }
    const serviceHours = Number(record.service_hours);
    const dueHours = Number(record.scheduled_due_hours);
    if (!Number.isFinite(serviceHours) || !Number.isFinite(dueHours)) {
      return { label: "Schedule comparison unavailable", late: false, difference: null };
    }
    const difference = Math.round((serviceHours - dueHours) * 10) / 10;
    if (difference > 0) return { label: `${difference.toFixed(1)} hrs late`, late: true, difference };
    if (difference < 0) return { label: `${Math.abs(difference).toFixed(1)} hrs before scheduled`, late: false, difference };
    return { label: "Completed at scheduled hours", late: false, difference: 0 };
  }

  window.renderDashboard = function () {
    baseRenderDashboard();
    wireDashboardHistoryCard();
  };

  async function wireDashboardHistoryCard() {
    const original = document.querySelector("#historyCard");
    if (!original) return;

    const card = replaceButton(original, () => window.showDashboardServiceHistory());
    if (!card) return;

    const { data, error } = await db.from("service_history")
      .select("id,service_date")
      .order("service_date", { ascending: false })
      .limit(250);

    if (error || document.querySelector("#historyCard") !== card) return;

    const records = data || [];
    const small = card.querySelector("small");
    if (!small) return;
    if (!records.length) {
      small.textContent = "No service history recorded";
      return;
    }
    small.textContent = `${records.length} service record${records.length === 1 ? "" : "s"} · latest ${formatServiceDate(records[0].service_date)}`;
  }

  window.showDashboardServiceHistory = async function () {
    const grid = appView.querySelector(".grid");
    grid.innerHTML = `<section class="card" style="grid-column:1/-1;"><p>Loading company service history...</p></section>`;

    const [sitesResult, equipmentResult, historyResult] = await Promise.all([
      db.from("sites").select("id,name,archived").order("name"),
      db.from("equipment").select("id,site_id,unit_number,name,archived").order("name"),
      db.from("service_history")
        .select("id,equipment_id,pm_schedule_id,service_name,service_hours,scheduled_due_hours,service_date,notes,parts_used,completed_by,created_at")
        .order("service_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(250)
    ]);

    const error = sitesResult.error || equipmentResult.error || historyResult.error;
    if (error) {
      grid.innerHTML = `
        <section class="card" style="grid-column:1/-1;">
          <h2>Company Service History could not be loaded</h2>
          <p class="error-text">${escapeHtml(error.message)}</p>
          <button id="dashboardHistoryBack" type="button">← Dashboard</button>
        </section>`;
      document.querySelector("#dashboardHistoryBack").addEventListener("click", window.renderDashboard);
      return;
    }

    const sites = sitesResult.data || [];
    const equipment = equipmentResult.data || [];
    const history = historyResult.data || [];

    const siteById = Object.fromEntries(sites.map(site => [site.id, site]));
    const equipmentById = Object.fromEntries(equipment.map(machine => [machine.id, machine]));

    const enriched = history.map(record => {
      const machine = equipmentById[record.equipment_id] || null;
      const site = machine ? siteById[machine.site_id] || null : null;
      const schedule = scheduleMeta(record);
      return { ...record, machine, site, schedule };
    });

    const lateCount = enriched.filter(record => record.schedule.late).length;
    const equipmentServiced = new Set(enriched.map(record => record.equipment_id).filter(Boolean)).size;
    const thisMonthKey = (() => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    })();
    const thisMonthCount = enriched.filter(record => String(record.service_date || "").startsWith(thisMonthKey)).length;

    const activeSiteIds = new Set(enriched.map(record => record.machine?.site_id).filter(Boolean));
    const filterSites = sites.filter(site => activeSiteIds.has(site.id));

    const recordCards = list => list.length ? list.map(record => {
      const machineName = record.machine ? (record.machine.unit_number || record.machine.name) : "Equipment record unavailable";
      const siteName = record.site?.name || "Site unavailable";
      const completedBy = record.completed_by && currentUser && record.completed_by === currentUser.id
        ? (currentProfile?.full_name || "You")
        : null;
      const accent = record.schedule.late
        ? "border-left:5px solid #b54708;background:#fff8ed;"
        : "border-left:5px solid #2f7d4a;background:#f5fbf7;";
      return `
        <article class="inset-card compact-card serviceHistoryRecord" data-site-id="${escapeHtml(record.machine?.site_id || "")}" data-equipment-id="${escapeHtml(record.equipment_id || "")}" style="${accent}margin-top:10px;">
          <div class="section-heading">
            <div>
              <strong>${escapeHtml(record.service_name || "Service")}</strong><br>
              <small><strong>${escapeHtml(siteName)}</strong> · ${escapeHtml(machineName)}</small>
            </div>
            <div style="text-align:right;min-width:150px;">
              <strong>${escapeHtml(formatServiceDate(record.service_date))}</strong><br>
              <small>${escapeHtml(record.schedule.label)}</small>
            </div>
          </div>
          <div class="detail-grid" style="margin-top:12px;">
            <div class="detail-item"><small>Service Hours</small><strong>${escapeHtml(hoursText(record.service_hours))}</strong></div>
            <div class="detail-item"><small>Scheduled Due</small><strong>${escapeHtml(hoursText(record.scheduled_due_hours))}</strong></div>
          </div>
          ${record.parts_used ? `<p style="margin-bottom:6px;"><small><strong>Parts Used:</strong> ${escapeHtml(record.parts_used)}</small></p>` : ""}
          ${record.notes ? `<p style="margin-bottom:6px;"><small><strong>Notes:</strong> ${escapeHtml(record.notes)}</small></p>` : ""}
          ${completedBy ? `<small><strong>Completed by:</strong> ${escapeHtml(completedBy)}</small>` : ""}
        </article>`;
    }).join("") : `<div class="empty-state"><strong>No matching service history.</strong></div>`;

    grid.innerHTML = `
      <section class="card" style="grid-column:1/-1;">
        <div class="section-heading">
          <div>
            <h2 style="margin:0;">Company Service History</h2>
            <small>Completed preventive maintenance across every site you can access</small>
          </div>
          <button id="dashboardHistoryBack" type="button">← Dashboard</button>
        </div>

        <div class="detail-grid" style="margin-top:18px;">
          <div class="detail-item"><small>Total Records</small><strong>${escapeHtml(enriched.length)}</strong></div>
          <div class="detail-item"><small>This Month</small><strong>${escapeHtml(thisMonthCount)}</strong></div>
          <div class="detail-item"><small>Equipment Serviced</small><strong>${escapeHtml(equipmentServiced)}</strong></div>
          <div class="detail-item"><small>Late Services</small><strong>${escapeHtml(lateCount)}</strong></div>
        </div>

        <div class="form-grid" style="margin-top:18px;">
          <label>Filter by Site
            <select id="dashboardHistorySiteFilter">
              <option value="all">All Sites</option>
              ${filterSites.map(site => `<option value="${escapeHtml(site.id)}">${escapeHtml(site.name)}${site.archived ? " (Archived)" : ""}</option>`).join("")}
            </select>
          </label>
          <label>Filter by Equipment
            <select id="dashboardHistoryEquipmentFilter">
              <option value="all">All Equipment</option>
            </select>
          </label>
        </div>

        <div class="section-heading" style="margin-top:22px;">
          <div>
            <h3 style="margin:0;">Completed Services</h3>
            <small id="dashboardHistoryCount">${escapeHtml(enriched.length)} record${enriched.length === 1 ? "" : "s"}</small>
          </div>
        </div>
        <div id="dashboardHistoryRecords">${recordCards(enriched)}</div>
      </section>`;

    document.querySelector("#dashboardHistoryBack").addEventListener("click", window.renderDashboard);

    const siteFilter = document.querySelector("#dashboardHistorySiteFilter");
    const equipmentFilter = document.querySelector("#dashboardHistoryEquipmentFilter");
    const recordsContainer = document.querySelector("#dashboardHistoryRecords");
    const count = document.querySelector("#dashboardHistoryCount");

    function rebuildEquipmentOptions() {
      const selectedSite = siteFilter.value;
      const relevantIds = new Set(
        enriched
          .filter(record => selectedSite === "all" || record.machine?.site_id === selectedSite)
          .map(record => record.equipment_id)
          .filter(Boolean)
      );
      const relevantEquipment = equipment
        .filter(machine => relevantIds.has(machine.id))
        .sort((a, b) => String(a.unit_number || a.name || "").localeCompare(String(b.unit_number || b.name || "")));
      equipmentFilter.innerHTML = `<option value="all">All Equipment</option>${relevantEquipment.map(machine => `
        <option value="${escapeHtml(machine.id)}">${escapeHtml(machine.unit_number || machine.name)}${machine.archived ? " (Archived)" : ""}</option>`).join("")}`;
    }

    function applyFilters() {
      const selectedSite = siteFilter.value;
      const selectedEquipment = equipmentFilter.value;
      const filtered = enriched.filter(record => {
        if (selectedSite !== "all" && record.machine?.site_id !== selectedSite) return false;
        if (selectedEquipment !== "all" && record.equipment_id !== selectedEquipment) return false;
        return true;
      });
      recordsContainer.innerHTML = recordCards(filtered);
      count.textContent = `${filtered.length} record${filtered.length === 1 ? "" : "s"}`;
    }

    rebuildEquipmentOptions();
    siteFilter.addEventListener("change", () => {
      rebuildEquipmentOptions();
      applyFilters();
    });
    equipmentFilter.addEventListener("change", applyFilters);
  };

  setTimeout(() => {
    if (document.querySelector("#historyCard")) wireDashboardHistoryCard();
  }, 0);
})();
