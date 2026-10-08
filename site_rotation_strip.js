/* Live site rotation strip calendar shown beside the site rotation summary. */
(function () {
  let activeSiteRotation = null;
  let dayWatcher = null;

  function installStyles() {
    if (document.querySelector("#siteRotationStripStyles")) return;

    const style = document.createElement("style");
    style.id = "siteRotationStripStyles";
    style.textContent = `
      .site-rotation-info-column{flex:1 1 auto;min-width:0;max-width:100%;}
      .site-rotation-row{display:flex;align-items:center;gap:18px;margin-top:10px;max-width:980px;min-width:0;}
      .site-rotation-summary{flex:0 0 auto;min-width:190px;}
      .site-rotation-calendar{flex:1 1 620px;min-width:0;max-width:760px;border:1px solid #d6e0e7;border-radius:9px;background:#f8fafb;padding:5px 8px 6px;box-sizing:border-box;overflow:hidden;}
      .site-rotation-calendar-top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:4px;min-height:20px;min-width:0;}
      .site-rotation-month{font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#314250;white-space:nowrap;}
      .site-rotation-today-status{display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:800;padding:2px 7px;border-radius:999px;white-space:nowrap;}
      .site-rotation-today-status.on{background:#dff4e5;color:#176337;}
      .site-rotation-today-status.off{background:#fde6e3;color:#972b21;}
      .site-rotation-days{display:flex;gap:2px;overflow-x:auto;overscroll-behavior-x:contain;-webkit-overflow-scrolling:touch;padding:1px 1px 2px;scrollbar-width:none;scroll-snap-type:x proximity;max-width:100%;}
      .site-rotation-days::-webkit-scrollbar{display:none;}
      .site-rotation-day{position:relative;flex:1 0 12px;min-width:12px;height:8px;border-radius:3px;border:1px solid transparent;box-sizing:border-box;scroll-snap-align:center;}
      .site-rotation-day.on{background:#58a96d;border-color:#3f8e55;}
      .site-rotation-day.off{background:#d55b50;border-color:#b8453b;}
      .site-rotation-day.today{height:12px;margin-top:-2px;box-shadow:0 0 0 2px #1f2d3a;z-index:1;}
      .site-rotation-anchor-warning{font-size:11px;color:#667785;padding:2px 2px 1px;}
      @media (max-width:850px){
        .site-rotation-row{display:block;width:100%;max-width:100%;min-width:0;}
        .site-rotation-summary{min-width:0;margin-bottom:6px;}
        .site-rotation-calendar{max-width:100%;width:100%;min-width:0;}
      }
      @media (max-width:520px){
        .site-rotation-calendar{padding:4px 6px 5px;}
        .site-rotation-calendar-top{gap:6px;min-width:0;}
        .site-rotation-month{font-size:10px;}
        .site-rotation-today-status{font-size:9px;padding:2px 6px;}
        .site-rotation-days{display:grid;grid-template-columns:repeat(var(--rotation-day-count,31),minmax(0,1fr));gap:1px;overflow:hidden;width:100%;padding:1px 0 2px;scroll-snap-type:none;}
        .site-rotation-day{width:auto;min-width:0;max-width:none;flex:none;height:7px;border-radius:2px;}
        .site-rotation-day.today{height:11px;margin-top:-2px;box-shadow:0 0 0 2px #1f2d3a;}
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

  function stateLabel(state) {
    return state === "on" ? "Drilling" : "Shut Down";
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

    calendar.style.setProperty("--rotation-day-count", String(daysInMonth));

    if (!rotation || !hasAnchor) {
      calendar.innerHTML = `
        <div class="site-rotation-calendar-top">
          <span class="site-rotation-month">${escapeHtml(monthLabel)}</span>
        </div>
        <div class="site-rotation-anchor-warning">Set a Rotation Anchor Date in Edit Site to activate the live drilling/shut down strip.</div>`;
      return;
    }

    const todayState = dayState(site, year, monthIndex, today);
    const days = Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;
      const state = dayState(site, year, monthIndex, day);
      const date = new Date(year, monthIndex, day);
      const dayLabel = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      const isToday = day === today;
      return `<div class="site-rotation-day ${state || ""} ${isToday ? "today" : ""}" title="${escapeHtml(`${dayLabel} — ${stateLabel(state)}`)}" aria-label="${escapeHtml(`${dayLabel} — ${stateLabel(state)}${isToday ? ", today" : ""}`)}"></div>`;
    }).join("");

    calendar.dataset.currentDate = dateKey(now);
    calendar.innerHTML = `
      <div class="site-rotation-calendar-top">
        <span class="site-rotation-month">${escapeHtml(monthLabel)}</span>
        <span class="site-rotation-today-status ${todayState}">Today: ${escapeHtml(stateLabel(todayState))}</span>
      </div>
      <div class="site-rotation-days" aria-label="${escapeHtml(monthLabel)} site rotation strip">${days}</div>`;

    if (window.matchMedia("(min-width:521px)").matches) {
      requestAnimationFrame(() => {
        const scroller = calendar.querySelector(".site-rotation-days");
        const todayCell = calendar.querySelector(".site-rotation-day.today");
        if (!scroller || !todayCell) return;
        scroller.scrollLeft = Math.max(0, todayCell.offsetLeft - (scroller.clientWidth / 2) + (todayCell.offsetWidth / 2));
      });
    }
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
