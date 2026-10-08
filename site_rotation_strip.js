/* Live site rotation strip calendar shown beside the site rotation summary. */
(function () {
  let activeSiteRotation = null;
  let dayWatcher = null;

  function installStyles() {
    if (document.querySelector("#siteRotationStripStyles")) return;

    const style = document.createElement("style");
    style.id = "siteRotationStripStyles";
    style.textContent = `
      .site-rotation-info-column{flex:1 1 auto;min-width:0;}
      .site-rotation-row{display:flex;align-items:flex-end;gap:18px;margin-top:14px;max-width:980px;}
      .site-rotation-summary{flex:0 0 auto;min-width:190px;padding-bottom:8px;}
      .site-rotation-calendar{flex:1 1 620px;min-width:0;max-width:760px;border:1px solid #d6e0e7;border-radius:12px;background:#f8fafb;padding:9px 10px 8px;}
      .site-rotation-calendar-top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:7px;}
      .site-rotation-month{font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#314250;}
      .site-rotation-today-status{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:800;padding:4px 8px;border-radius:999px;white-space:nowrap;}
      .site-rotation-today-status.on{background:#dff4e5;color:#176337;}
      .site-rotation-today-status.off{background:#fde6e3;color:#972b21;}
      .site-rotation-days{display:flex;gap:4px;overflow-x:auto;overscroll-behavior-x:contain;-webkit-overflow-scrolling:touch;padding:3px 2px 6px;scrollbar-width:thin;scroll-snap-type:x proximity;}
      .site-rotation-day{position:relative;flex:0 0 43px;min-height:48px;border-radius:8px;border:1px solid transparent;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.05;scroll-snap-align:center;}
      .site-rotation-day .dow{font-size:9px;font-weight:800;text-transform:uppercase;opacity:.75;}
      .site-rotation-day .dom{font-size:16px;font-weight:900;margin-top:3px;}
      .site-rotation-day.on{background:#dff4e5;border-color:#7ec595;color:#155b33;}
      .site-rotation-day.off{background:#fde6e3;border-color:#df8e86;color:#8e2a21;}
      .site-rotation-day.today{box-shadow:0 0 0 3px #1f2d3a;z-index:1;}
      .site-rotation-day.today::after{content:"TODAY";position:absolute;left:50%;top:-11px;transform:translateX(-50%);font-size:7px;font-weight:900;letter-spacing:.04em;background:#1f2d3a;color:#fff;border-radius:4px;padding:2px 4px;}
      .site-rotation-anchor-warning{font-size:12px;color:#667785;padding:8px 4px 5px;}
      @media (max-width:850px){
        .site-rotation-row{display:block;max-width:none;}
        .site-rotation-summary{min-width:0;padding-bottom:0;margin-bottom:10px;}
        .site-rotation-calendar{max-width:none;width:100%;box-sizing:border-box;}
      }
      @media (max-width:520px){
        .site-rotation-calendar-top{align-items:flex-start;flex-direction:column;gap:5px;}
        .site-rotation-day{flex-basis:44px;}
      }
    `;

    document.head.appendChild(style);
  }

  function rotationDays(site) {
    if (!site) return null;
    if (site.rotation_type === "14_7") return { on: 14, off: 7 };
    if (site.rotation_type === "20_10") return { on: 20, off: 10 };
    if (site.rotation_type === "custom") {
      const on = Number(site.rotation_on_days);
      const off = Number(site.rotation_off_days);
      if (on > 0 && off > 0) return { on, off };
    }
    return null;
  }

  function anchorUtc(anchorDate) {
    const match = String(anchorDate || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  function dayState(site, year, monthIndex, day) {
    const rotation = rotationDays(site);
    const anchor = anchorUtc(site?.rotation_anchor_date);
    if (!rotation || anchor === null) return null;

    const target = Date.UTC(year, monthIndex, day);
    const diffDays = Math.round((target - anchor) / 86400000);
    const cycle = rotation.on + rotation.off;
    const phase = ((diffDays % cycle) + cycle) % cycle;
    return phase < rotation.on ? "on" : "off";
  }

  function dateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function renderCalendar(site) {
    const calendar = document.querySelector("#siteRotationCalendar");
    if (!calendar) return;

    const now = new Date();
    const year = now.getFullYear();
    const monthIndex = now.getMonth();
    const today = now.getDate();
    const monthLabel = now.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const rotation = rotationDays(site);
    const hasAnchor = Boolean(site?.rotation_anchor_date && anchorUtc(site.rotation_anchor_date) !== null);

    if (!rotation || !hasAnchor) {
      calendar.innerHTML = `
        <div class="site-rotation-calendar-top">
          <span class="site-rotation-month">${escapeHtml(monthLabel)}</span>
        </div>
        <div class="site-rotation-anchor-warning">Set a Rotation Anchor Date in Edit Site to activate the live ON/OFF calendar.</div>`;
      return;
    }

    const todayState = dayState(site, year, monthIndex, today);
    const days = Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;
      const state = dayState(site, year, monthIndex, day);
      const date = new Date(year, monthIndex, day);
      const dow = date.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 3);
      const isToday = day === today;
      return `
        <div class="site-rotation-day ${state || ""} ${isToday ? "today" : ""}" title="${escapeHtml(`${dow} ${day} — ${state === "on" ? "ON" : "OFF"}`)}">
          <span class="dow">${escapeHtml(dow)}</span>
          <span class="dom">${day}</span>
        </div>`;
    }).join("");

    calendar.dataset.currentDate = dateKey(now);
    calendar.innerHTML = `
      <div class="site-rotation-calendar-top">
        <span class="site-rotation-month">${escapeHtml(monthLabel)}</span>
        <span class="site-rotation-today-status ${todayState}">Today: ${todayState === "on" ? "ON" : "OFF"}</span>
      </div>
      <div class="site-rotation-days" aria-label="${escapeHtml(monthLabel)} site rotation calendar">${days}</div>`;

    requestAnimationFrame(() => {
      const scroller = calendar.querySelector(".site-rotation-days");
      const todayCell = calendar.querySelector(".site-rotation-day.today");
      if (!scroller || !todayCell) return;
      scroller.scrollLeft = Math.max(0, todayCell.offsetLeft - (scroller.clientWidth / 2) + (todayCell.offsetWidth / 2));
    });
  }

  function findRotationSummary() {
    return Array.from(appView.querySelectorAll("small")).find(element => {
      const strong = element.querySelector("strong");
      return strong && strong.textContent.trim() === "Rotation:";
    }) || null;
  }

  async function addRotationStrip(siteId) {
    const rotationSummary = findRotationSummary();
    if (!rotationSummary || document.querySelector("#siteRotationRow")) return;

    const { data: site, error } = await db
      .from("sites")
      .select("id,rotation_type,rotation_on_days,rotation_off_days,rotation_anchor_date")
      .eq("id", siteId)
      .single();

    if (error || !site) {
      if (error) console.warn("Rotation strip site lookup error:", error);
      return;
    }

    const rotation = rotationDays(site);
    if (!rotation) return;

    activeSiteRotation = site;

    const infoColumn = rotationSummary.parentElement;
    if (!infoColumn) return;
    infoColumn.classList.add("site-rotation-info-column");

    const row = document.createElement("div");
    row.id = "siteRotationRow";
    row.className = "site-rotation-row";

    const summary = document.createElement("div");
    summary.className = "site-rotation-summary";

    const calendar = document.createElement("div");
    calendar.id = "siteRotationCalendar";
    calendar.className = "site-rotation-calendar";

    rotationSummary.replaceWith(row);
    summary.appendChild(rotationSummary);
    row.append(summary, calendar);

    renderCalendar(site);

    if (dayWatcher) clearInterval(dayWatcher);
    dayWatcher = setInterval(() => {
      const visibleCalendar = document.querySelector("#siteRotationCalendar");
      if (!visibleCalendar || !activeSiteRotation) return;
      const currentDate = dateKey(new Date());
      if (visibleCalendar.dataset.currentDate !== currentDate) renderCalendar(activeSiteRotation);
    }, 60000);
  }

  installStyles();

  const baseOpenSite = window.openSite;
  if (typeof baseOpenSite === "function") {
    window.openSite = async function (siteId) {
      const result = await baseOpenSite.apply(this, arguments);
      await addRotationStrip(siteId);
      return result;
    };
  }
})();
