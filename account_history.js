/* Owner-only account audit history. Authorization is enforced by the RPC. */
(function () {
  const baseUsers = window.showUsersManagement;
  if (typeof baseUsers !== "function") return;
  let viewSequence = 0;
  const PAGE_SIZE = 50;
  const isOwner = () => typeof currentProfile !== "undefined" && currentProfile?.role === "owner" && currentProfile.active !== false;
  const labels = { full_name: "Name", role: "Role", active: "Account enabled", site_ids: "Site IDs", site_names: "Sites" };
  const eventLabels = { account_created: "Account created", account_updated: "Account updated", account_deleted: "Account deleted", site_access_added: "Site access added", site_access_removed: "Site access removed", invitation_requested: "Invitation requested", invitation_succeeded: "Invitation sent", invitation_failed: "Invitation failed", manual_account_requested: "Manual account requested", manual_account_succeeded: "Manual account created", manual_account_failed: "Manual account failed" };
  const outcomeLabels = { succeeded: "Succeeded", requested: "Requested", failed: "Failed" };
  const detailLabels = { provider_failed: "The invitation provider could not complete the request.", setup_failed: "Account setup could not be completed.", cleanup_failed: "Cleanup needs administrator review." };
  const safeText = value => String(value ?? "").slice(0, 1000);
  function textElement(tag, text, className) {
    const element = document.createElement(tag);
    element.textContent = text;
    if (className) element.className = className;
    return element;
  }
  function displayDate(value) {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) return "Time unavailable";
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Regina", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" }).format(date) + " CST";
  }
  function valueText(value) {
    if (value === null || value === undefined) return "Not set";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (Array.isArray(value)) return value.map(v => typeof v === "string" ? safeText(v) : "").filter(Boolean).join(", ") || "None";
    return typeof value === "string" || typeof value === "number" ? safeText(value) : "Not shown";
  }
  function renderEvent(row) {
    const item = textElement("article", "", "inset-card compact-card");
    item.style.marginTop = "12px";
    item.style.overflowWrap = "anywhere";
    item.append(textElement("strong", eventLabels[row.event_type] || "Account event"));
    item.append(textElement("p", displayDate(row.occurred_at)));
    item.append(textElement("p", `By: ${safeText(row.actor_name || "System / unavailable")} · Account: ${safeText(row.target_name || "Unavailable")}`));
    item.append(textElement("p", `Result: ${outcomeLabels[row.outcome] || "Not recorded"}`));
    if (detailLabels[row.detail]) item.append(textElement("p", detailLabels[row.detail]));
    const before = row.before_values || {}, after = row.after_values || {};
    for (const [key, label] of Object.entries(labels)) {
      if (!Object.hasOwn(before, key) && !Object.hasOwn(after, key)) continue;
      if (JSON.stringify(before[key]) === JSON.stringify(after[key])) continue;
      item.append(textElement("p", `${label}: ${valueText(before[key])} → ${valueText(after[key])}`));
    }
    // Arbitrary detail/JSON, credentials and invitation links are intentionally not rendered.
    return item;
  }
  window.showUsersManagement = async function (...args) {
    const sequence = ++viewSequence;
    await baseUsers.apply(this, args);
    if (sequence !== viewSequence || !isOwner()) return;
    const invite = appView.querySelector("#inviteUserButton");
    if (!invite || appView.querySelector("#accountHistoryButton")) return;
    const button = textElement("button", "Account History");
    button.id = "accountHistoryButton";
    button.type = "button";
    button.addEventListener("click", () => window.showAccountHistory());
    invite.parentElement.append(button);
  };
  window.showAccountHistory = function () {
    if (!isOwner()) return;
    const grid = appView.querySelector(".grid");
    if (!grid) return;
    const sequence = ++viewSequence;
    const section = textElement("section", "", "card");
    section.style.gridColumn = "1/-1";
    section.append(textElement("h2", "Account History"));
    section.append(textElement("p", "Owner-only account changes, newest first. History starts when tracking was enabled; earlier changes are not reconstructed. Times are Saskatchewan (CST, UTC−6)."));
    const back = textElement("button", "← Users & Access");
    back.type = "button";
    back.addEventListener("click", () => { ++viewSequence; window.showUsersManagement(); });
    section.append(back);
    const status = textElement("p", "", "field-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const events = document.createElement("div");
    const more = textElement("button", "Load older events");
    more.type = "button";
    section.append(status, events, more);
    grid.replaceChildren(section);
    let cursor = null, busy = false, finished = false;
    const seen = new Set();
    const current = () => sequence === viewSequence && section.isConnected && grid.contains(section) && isOwner();
    async function load() {
      if (busy || finished || !current()) return;
      busy = true;
      more.disabled = true;
      status.textContent = "Loading account history…";
      try {
        const { data, error } = await db.rpc("owner_account_history", { p_limit: PAGE_SIZE, p_before_id: cursor });
        if (!current()) return;
        if (error || !Array.isArray(data)) throw new Error("Account history could not be loaded.");
        for (const row of data) {
          const id = String(row.id ?? "");
          if (!/^\d+$/.test(id) || seen.has(id)) continue;
          seen.add(id);
          events.append(renderEvent(row));
        }
        const next = data.length ? String(data[data.length - 1].id ?? "") : null;
        finished = data.length < PAGE_SIZE || !/^\d+$/.test(next || "") || next === cursor;
        cursor = next;
        status.textContent = seen.size ? `${seen.size} event${seen.size === 1 ? "" : "s"} shown.${finished ? " End of recorded history." : ""}` : "No account events have been recorded since tracking was enabled.";
        more.hidden = finished;
        more.textContent = "Load older events";
      } catch (_) {
        if (!current()) return;
        status.textContent = "Account history could not be loaded. Try again or return to Users & Access.";
        more.hidden = false;
        more.textContent = "Retry";
      } finally {
        busy = false;
        if (current()) more.disabled = false;
      }
    }
    more.addEventListener("click", load);
    load();
  };
})();
