/* V3 dashboard-wide work ticket view */

(function () {
  const baseRenderDashboard = window.renderDashboard;
  const baseOpenWorkTicket = window.openWorkTicket;

  if (typeof baseRenderDashboard !== "function" || typeof baseOpenWorkTicket !== "function") {
    console.error("dashboard_tickets.js loaded before dashboard/work ticket workflow");
    return;
  }

  const statusLabel = value => String(value || "open").replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());
  const priorityLabel = value => value === "equipment_down" ? "Equipment Down" : statusLabel(value);

  function ticketAccent(ticket) {
    if (ticket.status === "completed") return "border-left:5px solid #2f7d4a;background:#f3fbf6;";
    if (ticket.status === "cancelled") return "border-left:5px solid #9aa7b2;background:#f6f7f8;";
    if (ticket.priority === "equipment_down") return "border-left:5px solid #b42318;background:#fff1f0;";
    if (ticket.priority === "urgent") return "border-left:5px solid #d96b00;background:#fff4e5;";
    if (ticket.status === "in_progress") return "border-left:5px solid #1f6fb2;background:#f1f7fc;";
    return "border-left:5px solid #9aa7b2;";
  }

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString(undefined, {
      year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
    });
  }

  function replaceButton(button, handler) {
    if (!button) return null;
    const next = button.cloneNode(true);
    button.replaceWith(next);
    next.addEventListener("click", handler);
    return next;
  }

  window.renderDashboard = function () {
    baseRenderDashboard();
    wireDashboardTicketCard();
  };

  async function wireDashboardTicketCard() {
    const original = document.querySelector("#ticketsCard");
    if (!original) return;

    const card = replaceButton(original, () => window.showDashboardTickets());
    if (!card) return;

    const { data, error } = await db.from("work_tickets").select("id,status,priority");
    if (error || document.querySelector("#ticketsCard") !== card) return;

    const active = (data || []).filter(t => t.status === "open" || t.status === "in_progress");
    const equipmentDown = active.filter(t => t.priority === "equipment_down").length;
    const small = card.querySelector("small");
    if (small) {
      if (!active.length) small.textContent = "No active work tickets";
      else if (equipmentDown) small.textContent = `${active.length} active · ${equipmentDown} equipment down`;
      else small.textContent = `${active.length} active work ticket${active.length === 1 ? "" : "s"}`;
    }
  }

  window.showDashboardTickets = async function () {
    const grid = appView.querySelector(".grid");
    grid.innerHTML = `<section class="card" style="grid-column:1/-1;"><p>Loading company work tickets...</p></section>`;

    const [sitesResult, equipmentResult, siteItemsResult, ticketsResult] = await Promise.all([
      db.from("sites").select("id,name").eq("archived", false).order("name"),
      db.from("equipment").select("id,site_id,unit_number,name").eq("archived", false),
      db.from("site_items").select("id,site_id,name").eq("archived", false),
      db.from("work_tickets")
        .select("id,site_id,equipment_id,site_item_id,title,description,priority,status,created_at,updated_at,completed_at")
        .order("updated_at", { ascending: false })
    ]);

    const error = sitesResult.error || equipmentResult.error || siteItemsResult.error || ticketsResult.error;
    if (error) {
      grid.innerHTML = `
        <section class="card" style="grid-column:1/-1;">
          <h2>Company Work Tickets could not be loaded</h2>
          <p class="error-text">${escapeHtml(error.message)}</p>
          <button id="dashboardTicketsBack" type="button">← Dashboard</button>
        </section>`;
      document.querySelector("#dashboardTicketsBack").addEventListener("click", window.renderDashboard);
      return;
    }

    const sites = sitesResult.data || [];
    const equipment = equipmentResult.data || [];
    const siteItems = siteItemsResult.data || [];
    const tickets = ticketsResult.data || [];

    const siteById = Object.fromEntries(sites.map(site => [site.id, site.name]));
    const equipmentById = Object.fromEntries(equipment.map(machine => [machine.id, machine.unit_number || machine.name]));
    const siteItemById = Object.fromEntries(siteItems.map(item => [item.id, item.name]));

    const active = tickets.filter(ticket => ticket.status === "open" || ticket.status === "in_progress");
    const closed = tickets.filter(ticket => ticket.status === "completed" || ticket.status === "cancelled");
    const equipmentDown = active.filter(ticket => ticket.priority === "equipment_down").length;
    const urgent = active.filter(ticket => ticket.priority === "urgent").length;

    const priorityRank = { equipment_down: 0, urgent: 1, normal: 2 };
    active.sort((a, b) => {
      const rank = (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9);
      if (rank !== 0) return rank;
      return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at);
    });

    const assetName = ticket => {
      if (ticket.equipment_id) return equipmentById[ticket.equipment_id] || "Equipment";
      if (ticket.site_item_id) return siteItemById[ticket.site_item_id] || "Site item";
      return "Site";
    };

    const ticketCards = list => list.length ? list.map(ticket => `
      <button type="button" class="equipment-list-card dashboardTicketOpen" data-id="${escapeHtml(ticket.id)}" data-site-id="${escapeHtml(ticket.site_id)}" style="${ticketAccent(ticket)}text-align:left;margin-top:10px;width:100%;">
        <span class="equipment-title">${escapeHtml(ticket.title)}</span>
        <small><strong>${escapeHtml(siteById[ticket.site_id] || "Site")}</strong> · ${escapeHtml(assetName(ticket))}</small>
        <small>${escapeHtml(priorityLabel(ticket.priority))} · ${escapeHtml(statusLabel(ticket.status))}</small>
        ${ticket.description ? `<small>${escapeHtml(ticket.description)}</small>` : ""}
        <small>${ticket.status === "completed" && ticket.completed_at ? `Completed ${escapeHtml(formatDate(ticket.completed_at))}` : `Updated ${escapeHtml(formatDate(ticket.updated_at || ticket.created_at))}`}</small>
        <small class="open-hint">Open ticket →</small>
      </button>`).join("") : `<div class="empty-state"><strong>None.</strong></div>`;

    grid.innerHTML = `
      <section class="card" style="grid-column:1/-1;">
        <div class="section-heading">
          <div>
            <h2 style="margin:0;">Company Work Tickets</h2>
            <small>Open breakdowns and repair history across every site you can access</small>
          </div>
          <button id="dashboardTicketsBack" type="button">← Dashboard</button>
        </div>

        <div class="detail-grid" style="margin-top:18px;">
          <div class="detail-item"><small>Active</small><strong>${escapeHtml(active.length)}</strong></div>
          <div class="detail-item"><small>Equipment Down</small><strong>${escapeHtml(equipmentDown)}</strong></div>
          <div class="detail-item"><small>Urgent</small><strong>${escapeHtml(urgent)}</strong></div>
          <div class="detail-item"><small>Completed / Cancelled</small><strong>${escapeHtml(closed.length)}</strong></div>
        </div>

        <div class="form-grid" style="margin-top:18px;">
          <label>Filter by Site
            <select id="dashboardTicketSiteFilter">
              <option value="all">All Sites</option>
              ${sites.map(site => `<option value="${escapeHtml(site.id)}">${escapeHtml(site.name)}</option>`).join("")}
            </select>
          </label>
        </div>

        <div class="section-heading" style="margin-top:22px;">
          <div><h3 style="margin:0;">Open / In Progress</h3><small>Equipment Down and Urgent tickets are shown first.</small></div>
        </div>
        <div id="dashboardActiveTickets">${ticketCards(active)}</div>

        <hr style="border:0;border-top:1px solid #d7e0e7;margin:26px 0;">
        <div class="section-heading">
          <div><h3 style="margin:0;">Completed / Cancelled</h3><small>Most recently updated first</small></div>
        </div>
        <div id="dashboardClosedTickets">${ticketCards(closed)}</div>
      </section>`;

    document.querySelector("#dashboardTicketsBack").addEventListener("click", window.renderDashboard);

    function wireTicketButtons() {
      document.querySelectorAll(".dashboardTicketOpen").forEach(button => {
        button.addEventListener("click", () => {
          window.openWorkTicket(button.dataset.id, button.dataset.siteId, { type: "dashboard", id: "all" });
        });
      });
    }
    wireTicketButtons();

    document.querySelector("#dashboardTicketSiteFilter").addEventListener("change", event => {
      const selected = event.target.value;
      const activeFiltered = selected === "all" ? active : active.filter(ticket => ticket.site_id === selected);
      const closedFiltered = selected === "all" ? closed : closed.filter(ticket => ticket.site_id === selected);
      document.querySelector("#dashboardActiveTickets").innerHTML = ticketCards(activeFiltered);
      document.querySelector("#dashboardClosedTickets").innerHTML = ticketCards(closedFiltered);
      wireTicketButtons();
    });
  };

  // Keep a ticket opened from the company dashboard returning to the company dashboard.
  window.openWorkTicket = async function (ticketId, siteId, assetFilter = null) {
    await baseOpenWorkTicket(ticketId, siteId, assetFilter);

    if (assetFilter?.type !== "dashboard") return;
    const oldBack = document.querySelector("#ticketDetailBack");
    if (!oldBack) return;
    const back = oldBack.cloneNode(true);
    oldBack.replaceWith(back);
    back.textContent = "← Company Work Tickets";
    back.addEventListener("click", () => window.showDashboardTickets());
  };

  // In case the dashboard was rendered before this file finished loading.
  setTimeout(() => {
    if (document.querySelector("#ticketsCard")) wireDashboardTicketCard();
  }, 0);
})();
