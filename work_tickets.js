/* V3 work ticket workflow */

(function () {
  const baseOpenSite = window.openSite;
  const baseOpenEquipment = window.openEquipment;

  if (typeof baseOpenSite !== "function") {
    console.error("work_tickets.js loaded before site workflow");
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

  function formatTicketDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString(undefined, {
      year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
    });
  }

  function replaceButton(id, handler) {
    const oldButton = document.querySelector(`#${id}`);
    if (!oldButton) return;
    const newButton = oldButton.cloneNode(true);
    oldButton.replaceWith(newButton);
    newButton.addEventListener("click", handler);
  }

  async function getSiteAssets(siteId) {
    const [siteResult, equipmentResult, itemResult] = await Promise.all([
      db.from("sites").select("id,name").eq("id", siteId).single(),
      db.from("equipment").select("id,unit_number,name,current_hours,archived").eq("site_id", siteId).eq("archived", false).order("name"),
      db.from("site_items").select("id,name,item_type,archived").eq("site_id", siteId).eq("archived", false).order("name")
    ]);
    return {
      site: siteResult.data,
      equipment: equipmentResult.data || [],
      siteItems: itemResult.data || [],
      error: siteResult.error || equipmentResult.error || itemResult.error
    };
  }

  function assetName(ticket, equipmentById, itemById) {
    if (ticket.equipment_id) return equipmentById[ticket.equipment_id] || "Equipment";
    if (ticket.site_item_id) return itemById[ticket.site_item_id] || "Site item";
    return "Site";
  }

  window.openSite = async function(siteId) {
    await baseOpenSite(siteId);
    replaceButton("workTicketsButton", () => window.showSiteTickets(siteId));

    // Show the number of currently open/in-progress tickets directly on the site button.
    const button = document.querySelector("#workTicketsButton");
    if (button) {
      const { data } = await db.from("work_tickets").select("id,status").eq("site_id", siteId);
      if (document.querySelector("#workTicketsButton") !== button) return;
      const openCount = (data || []).filter(t => t.status === "open" || t.status === "in_progress").length;
      button.textContent = openCount ? `Work Tickets (${openCount})` : "Work Tickets";
    }
  };

  if (typeof baseOpenEquipment === "function") {
    window.openEquipment = async function(equipmentId, siteId) {
      await baseOpenEquipment(equipmentId, siteId);
      const backButton = document.querySelector("#equipmentBackSite");
      const actions = backButton?.parentElement;
      if (!actions || document.querySelector("#equipmentTicketsButton")) return;

      const { data } = await db.from("work_tickets")
        .select("id,status")
        .eq("equipment_id", equipmentId);

      if (!document.querySelector("#equipmentBackSite")) return;
      const openCount = (data || []).filter(t => t.status === "open" || t.status === "in_progress").length;
      const button = document.createElement("button");
      button.id = "equipmentTicketsButton";
      button.type = "button";
      button.textContent = openCount ? `Work Tickets (${openCount})` : "Work Tickets";
      button.addEventListener("click", () => window.showAssetTickets(siteId, "equipment", equipmentId));

      const navigate = document.querySelector("#equipmentNavigate");
      if (navigate) actions.insertBefore(button, navigate);
      else actions.appendChild(button);
    };
  }

  window.showSiteTickets = async function(siteId) {
    const grid = appView.querySelector(".grid");
    grid.innerHTML = `<section class="card" style="grid-column:1/-1;"><p>Loading work tickets...</p></section>`;

    const assets = await getSiteAssets(siteId);
    const { data: tickets, error: ticketsError } = await db.from("work_tickets")
      .select("id,site_id,equipment_id,site_item_id,title,description,priority,status,posted_by,assigned_to,repair_performed,completed_by,completed_at,completed_hours,created_at,updated_at")
      .eq("site_id", siteId)
      .order("created_at", { ascending: false });

    const error = assets.error || ticketsError;
    if (error) {
      grid.innerHTML = `<section class="card" style="grid-column:1/-1;"><h2>Work tickets could not be loaded</h2><p class="error-text">${escapeHtml(error.message)}</p><button id="ticketsBack">← Back to Site</button></section>`;
      document.querySelector("#ticketsBack").addEventListener("click", () => window.openSite(siteId));
      return;
    }

    renderTicketList(siteId, assets.site, assets.equipment, assets.siteItems, tickets || [], null);
  };

  window.showAssetTickets = async function(siteId, assetType, assetId) {
    const grid = appView.querySelector(".grid");
    grid.innerHTML = `<section class="card" style="grid-column:1/-1;"><p>Loading work tickets...</p></section>`;

    const assets = await getSiteAssets(siteId);
    let query = db.from("work_tickets")
      .select("id,site_id,equipment_id,site_item_id,title,description,priority,status,posted_by,assigned_to,repair_performed,completed_by,completed_at,completed_hours,created_at,updated_at")
      .eq("site_id", siteId)
      .order("created_at", { ascending: false });
    query = assetType === "equipment" ? query.eq("equipment_id", assetId) : query.eq("site_item_id", assetId);
    const { data: tickets, error } = await query;

    if (assets.error || error) {
      grid.innerHTML = `<section class="card" style="grid-column:1/-1;"><h2>Work tickets could not be loaded</h2><p class="error-text">${escapeHtml((assets.error || error).message)}</p></section>`;
      return;
    }

    renderTicketList(siteId, assets.site, assets.equipment, assets.siteItems, tickets || [], { type: assetType, id: assetId });
  };

  function renderTicketList(siteId, site, equipment, siteItems, tickets, assetFilter) {
    const grid = appView.querySelector(".grid");
    const equipmentById = Object.fromEntries(equipment.map(e => [e.id, e.unit_number || e.name]));
    const itemById = Object.fromEntries(siteItems.map(i => [i.id, i.name]));
    let assetHeading = "";
    if (assetFilter?.type === "equipment") assetHeading = equipmentById[assetFilter.id] || "Equipment";
    if (assetFilter?.type === "site_item") assetHeading = itemById[assetFilter.id] || "Site item";

    const openTickets = tickets.filter(t => t.status === "open" || t.status === "in_progress");
    const closedTickets = tickets.filter(t => t.status === "completed" || t.status === "cancelled");

    const cards = list => list.length ? list.map(ticket => `
      <button type="button" class="equipment-list-card ticketOpenButton" data-id="${escapeHtml(ticket.id)}" style="${ticketAccent(ticket)}text-align:left;margin-top:10px;width:100%;">
        <span class="equipment-title">${escapeHtml(ticket.title)}</span>
        <small><strong>${escapeHtml(assetName(ticket, equipmentById, itemById))}</strong></small>
        <small>${escapeHtml(priorityLabel(ticket.priority))} · ${escapeHtml(statusLabel(ticket.status))}</small>
        ${ticket.description ? `<small>${escapeHtml(ticket.description)}</small>` : ""}
        <small>Posted ${escapeHtml(formatTicketDate(ticket.created_at))}</small>
        <small class="open-hint">Open ticket →</small>
      </button>`).join("") : `<div class="empty-state"><strong>None.</strong></div>`;

    grid.innerHTML = `
      <section class="card" style="grid-column:1/-1;">
        <div class="section-heading">
          <div>
            <h2 style="margin:0;">Work Tickets</h2>
            <small>${escapeHtml(site?.name || "Site")}${assetHeading ? ` · ${escapeHtml(assetHeading)}` : ""}</small>
          </div>
          <div class="form-actions compact-actions">
            <button id="ticketsBack" type="button">← ${assetFilter?.type === "equipment" ? "Equipment" : "Back to Site"}</button>
            <button id="newTicketButton" type="button">+ New Ticket</button>
          </div>
        </div>

        <div class="section-heading" style="margin-top:20px;"><div><h3 style="margin:0;">Open / In Progress</h3><small>${openTickets.length} active ticket${openTickets.length === 1 ? "" : "s"}</small></div></div>
        <div>${cards(openTickets)}</div>

        <hr style="border:0;border-top:1px solid #d7e0e7;margin:24px 0;">
        <div class="section-heading"><div><h3 style="margin:0;">Completed / Cancelled</h3><small>Ticket history</small></div></div>
        <div>${cards(closedTickets)}</div>
      </section>`;

    document.querySelector("#ticketsBack").addEventListener("click", () => {
      if (assetFilter?.type === "equipment") window.openEquipment(assetFilter.id, siteId);
      else window.openSite(siteId);
    });
    document.querySelector("#newTicketButton").addEventListener("click", () => showNewTicketForm(siteId, equipment, siteItems, assetFilter));
    document.querySelectorAll(".ticketOpenButton").forEach(button => {
      button.addEventListener("click", () => window.openWorkTicket(button.dataset.id, siteId, assetFilter));
    });
  }

  function showNewTicketForm(siteId, equipment, siteItems, assetFilter) {
    const grid = appView.querySelector(".grid");
    const equipmentOptions = equipment.map(e => `<option value="equipment:${escapeHtml(e.id)}" ${assetFilter?.type === "equipment" && assetFilter.id === e.id ? "selected" : ""}>Equipment — ${escapeHtml(e.unit_number || e.name)}</option>`).join("");
    const itemOptions = siteItems.map(i => `<option value="site_item:${escapeHtml(i.id)}" ${assetFilter?.type === "site_item" && assetFilter.id === i.id ? "selected" : ""}>Site Item — ${escapeHtml(i.name)}</option>`).join("");

    grid.innerHTML = `
      <section class="card" style="grid-column:1/-1;">
        <div class="section-heading">
          <div><h2 style="margin:0;">New Work Ticket</h2><small>Report a breakdown, deficiency or repair need.</small></div>
          <button id="newTicketBack" type="button">← Work Tickets</button>
        </div>

        <form id="newTicketForm" style="margin-top:18px;">
          <label>What’s Broken?
            <input id="ticketTitle" type="text" required placeholder="Example: Engine will not crank">
          </label>
          <label>Description
            <textarea id="ticketDescription" rows="5" placeholder="Symptoms, what happened, troubleshooting already done, parts suspected, etc."></textarea>
          </label>
          <div class="form-grid">
            <label>Asset
              <select id="ticketAsset" required>
                <option value="">Select equipment or site item</option>
                ${equipmentOptions}
                ${itemOptions}
              </select>
            </label>
            <label>Priority
              <select id="ticketPriority">
                <option value="normal">Normal</option>
                <option value="urgent">Urgent</option>
                <option value="equipment_down">Equipment Down</option>
              </select>
            </label>
          </div>
          <div class="form-actions">
            <button type="submit">Post Work Ticket</button>
            <button id="newTicketCancel" type="button" class="secondary-button">Cancel</button>
          </div>
          <p id="newTicketMessage" class="field-status"></p>
        </form>
      </section>`;

    const back = () => assetFilter ? window.showAssetTickets(siteId, assetFilter.type, assetFilter.id) : window.showSiteTickets(siteId);
    document.querySelector("#newTicketBack").addEventListener("click", back);
    document.querySelector("#newTicketCancel").addEventListener("click", back);
    document.querySelector("#newTicketForm").addEventListener("submit", async event => {
      event.preventDefault();
      const message = document.querySelector("#newTicketMessage");
      const asset = document.querySelector("#ticketAsset").value;
      if (!asset) {
        message.innerHTML = '<span class="error-text">Select the equipment or site item this ticket belongs to.</span>';
        return;
      }
      const [type, id] = asset.split(":");
      const record = {
        site_id: siteId,
        equipment_id: type === "equipment" ? id : null,
        site_item_id: type === "site_item" ? id : null,
        title: document.querySelector("#ticketTitle").value.trim(),
        description: document.querySelector("#ticketDescription").value.trim() || null,
        priority: document.querySelector("#ticketPriority").value,
        status: "open",
        posted_by: currentUser.id
      };
      message.textContent = "Posting work ticket...";
      const { data, error } = await db.from("work_tickets").insert(record).select("id").single();
      if (error) {
        message.innerHTML = `<span class="error-text">${escapeHtml(error.message)}</span>`;
        return;
      }
      await window.openWorkTicket(data.id, siteId, assetFilter);
    });
  }

  window.openWorkTicket = async function(ticketId, siteId, assetFilter = null) {
    const grid = appView.querySelector(".grid");
    grid.innerHTML = `<section class="card" style="grid-column:1/-1;"><p>Loading ticket...</p></section>`;

    const [{ data: ticket, error: ticketError }, assets, { data: updates, error: updatesError }] = await Promise.all([
      db.from("work_tickets").select("*").eq("id", ticketId).single(),
      getSiteAssets(siteId),
      db.from("work_ticket_updates").select("id,message,posted_by,created_at").eq("ticket_id", ticketId).order("created_at", { ascending: true })
    ]);

    const error = ticketError || assets.error || updatesError;
    if (error || !ticket) {
      grid.innerHTML = `<section class="card" style="grid-column:1/-1;"><h2>Ticket could not be loaded</h2><p class="error-text">${escapeHtml(error?.message || "Ticket not found")}</p></section>`;
      return;
    }

    const equipmentById = Object.fromEntries(assets.equipment.map(e => [e.id, e]));
    const itemById = Object.fromEntries(assets.siteItems.map(i => [i.id, i]));
    const asset = ticket.equipment_id ? equipmentById[ticket.equipment_id] : itemById[ticket.site_item_id];
    const assetText = ticket.equipment_id ? (asset?.unit_number || asset?.name || "Equipment") : (asset?.name || "Site item");
    const active = ticket.status === "open" || ticket.status === "in_progress";

    const updatesHtml = (updates || []).length ? (updates || []).map(update => `
      <article class="inset-card compact-card" style="margin-top:10px;">
        <small><strong>${update.posted_by === currentUser.id ? "You" : "Team member"}</strong> · ${escapeHtml(formatTicketDate(update.created_at))}</small>
        <p style="margin-bottom:0;">${escapeHtml(update.message)}</p>
      </article>`).join("") : `<div class="empty-state"><strong>No comments yet.</strong></div>`;

    grid.innerHTML = `
      <section class="card" style="grid-column:1/-1;">
        <div class="section-heading">
          <div>
            <small>${escapeHtml(assets.site?.name || "Site")} · ${escapeHtml(assetText)}</small>
            <h2 style="margin:4px 0;">${escapeHtml(ticket.title)}</h2>
            <small>${escapeHtml(priorityLabel(ticket.priority))} · ${escapeHtml(statusLabel(ticket.status))}</small>
          </div>
          <button id="ticketDetailBack" type="button">← Work Tickets</button>
        </div>

        <div class="inset-card compact-card" style="${ticketAccent(ticket)}margin-top:18px;">
          <p><strong>What’s Broken?</strong><br>${escapeHtml(ticket.title)}</p>
          ${ticket.description ? `<p><strong>Description</strong><br>${escapeHtml(ticket.description)}</p>` : ""}
          <p><small><strong>Posted by:</strong> ${ticket.posted_by === currentUser.id ? "You" : "Team member"}<br><strong>Posted:</strong> ${escapeHtml(formatTicketDate(ticket.created_at))}</small></p>
          ${ticket.repair_performed ? `<p><strong>Repair Performed</strong><br>${escapeHtml(ticket.repair_performed)}</p>` : ""}
          ${ticket.completed_at ? `<p><small><strong>Completed:</strong> ${escapeHtml(formatTicketDate(ticket.completed_at))}${ticket.completed_hours != null ? ` at ${escapeHtml(ticket.completed_hours)} hrs` : ""}</small></p>` : ""}
        </div>

        ${active ? `
          <div class="form-actions" style="margin-top:16px;">
            ${ticket.status === "open" ? `<button id="ticketStartButton" type="button">Start Work</button>` : ""}
            <button id="ticketCompleteButton" type="button">Complete Ticket</button>
            <button id="ticketCancelButton" type="button" class="secondary-button">Cancel Ticket</button>
          </div>` : ""}

        <hr style="border:0;border-top:1px solid #d7e0e7;margin:24px 0;">
        <div class="section-heading"><div><h3 style="margin:0;">Comments / Updates</h3><small>Troubleshooting notes and repair updates stay with the ticket.</small></div></div>
        <div>${updatesHtml}</div>

        ${active ? `
          <form id="ticketCommentForm" style="margin-top:16px;">
            <label>Add Comment / Update
              <textarea id="ticketComment" rows="3" required placeholder="Example: Checked battery voltage, found loose ground cable."></textarea>
            </label>
            <div class="form-actions"><button type="submit">Post Update</button></div>
            <p id="ticketCommentMessage" class="field-status"></p>
          </form>` : ""}
      </section>`;

    const back = () => assetFilter ? window.showAssetTickets(siteId, assetFilter.type, assetFilter.id) : window.showSiteTickets(siteId);
    document.querySelector("#ticketDetailBack").addEventListener("click", back);

    if (active) {
      const startButton = document.querySelector("#ticketStartButton");
      if (startButton) startButton.addEventListener("click", () => setTicketStatus(ticketId, siteId, "in_progress", assetFilter));
      document.querySelector("#ticketCompleteButton").addEventListener("click", () => showCompleteTicketForm(ticket, siteId, assetFilter));
      document.querySelector("#ticketCancelButton").addEventListener("click", () => setTicketStatus(ticketId, siteId, "cancelled", assetFilter));
      document.querySelector("#ticketCommentForm").addEventListener("submit", async event => {
        event.preventDefault();
        const message = document.querySelector("#ticketCommentMessage");
        const text = document.querySelector("#ticketComment").value.trim();
        if (!text) return;
        message.textContent = "Posting update...";
        const { error } = await db.from("work_ticket_updates").insert({ ticket_id: ticketId, message: text, posted_by: currentUser.id });
        if (error) {
          message.innerHTML = `<span class="error-text">${escapeHtml(error.message)}</span>`;
          return;
        }
        await window.openWorkTicket(ticketId, siteId, assetFilter);
      });
    }
  };

  async function addAutomaticUpdate(ticketId, message) {
    const { error } = await db.from("work_ticket_updates").insert({ ticket_id: ticketId, message, posted_by: currentUser.id });
    if (error) console.warn("Ticket automatic update could not be saved:", error);
  }

  async function setTicketStatus(ticketId, siteId, status, assetFilter) {
    const update = { status };
    if (status !== "completed") {
      update.completed_by = null;
      update.completed_at = null;
      update.completed_hours = null;
    }
    const { error } = await db.from("work_tickets").update(update).eq("id", ticketId);
    if (error) {
      alert(`Could not update ticket: ${error.message}`);
      return;
    }
    await addAutomaticUpdate(ticketId, `Status changed to ${statusLabel(status)}.`);
    await window.openWorkTicket(ticketId, siteId, assetFilter);
  }

  function showCompleteTicketForm(ticket, siteId, assetFilter) {
    const grid = appView.querySelector(".grid");
    grid.innerHTML = `
      <section class="card" style="grid-column:1/-1;">
        <div class="section-heading">
          <div><h2 style="margin:0;">Complete Work Ticket</h2><small>${escapeHtml(ticket.title)}</small></div>
          <button id="completeTicketBack" type="button">← Back to Ticket</button>
        </div>
        <form id="completeTicketForm" style="margin-top:18px;">
          <label>Repair Performed
            <textarea id="ticketRepair" rows="5" required placeholder="Describe the repair, adjustment or corrective action completed."></textarea>
          </label>
          <label>Completed Equipment Hours
            <input id="ticketCompletedHours" type="number" min="0" step="0.1" placeholder="Optional if this is powered equipment">
          </label>
          <div class="form-actions">
            <button type="submit">Complete Ticket</button>
            <button id="completeTicketCancel" type="button" class="secondary-button">Cancel</button>
          </div>
          <p id="completeTicketMessage" class="field-status"></p>
        </form>
      </section>`;

    const back = () => window.openWorkTicket(ticket.id, siteId, assetFilter);
    document.querySelector("#completeTicketBack").addEventListener("click", back);
    document.querySelector("#completeTicketCancel").addEventListener("click", back);
    document.querySelector("#completeTicketForm").addEventListener("submit", async event => {
      event.preventDefault();
      const message = document.querySelector("#completeTicketMessage");
      const repair = document.querySelector("#ticketRepair").value.trim();
      const hoursRaw = document.querySelector("#ticketCompletedHours").value;
      const completedHours = hoursRaw === "" ? null : Number(hoursRaw);
      if (!repair) {
        message.innerHTML = '<span class="error-text">Repair performed is required.</span>';
        return;
      }
      message.textContent = "Completing ticket...";
      const { error } = await db.from("work_tickets").update({
        status: "completed",
        repair_performed: repair,
        completed_by: currentUser.id,
        completed_at: new Date().toISOString(),
        completed_hours: completedHours
      }).eq("id", ticket.id);
      if (error) {
        message.innerHTML = `<span class="error-text">${escapeHtml(error.message)}</span>`;
        return;
      }
      await addAutomaticUpdate(ticket.id, `Ticket completed. Repair performed: ${repair}`);
      await window.openWorkTicket(ticket.id, siteId, assetFilter);
    });
  }
})();
