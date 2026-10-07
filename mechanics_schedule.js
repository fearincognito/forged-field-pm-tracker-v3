/* Mechanics schedule dashboard view for October and November 2026. */
(function () {
  const schedule = {
    "2026-10": {
      label: "October 2026",
      year: 2026,
      monthIndex: 9,
      days: 31,
      people: [
        {
          name: "Harley Niedzielski",
          blocks: [
            { start: 1, end: 1, status: "FI" },
            { start: 2, end: 15, status: "Days" },
            { start: 16, end: 16, status: "FO" },
            { start: 17, end: 21, status: "OFF" },
            { start: 22, end: 22, status: "FI" },
            { start: 23, end: 31, status: "Days" }
          ]
        },
        {
          name: "Josh Wiome",
          blocks: [
            { start: 1, end: 1, status: "FI" },
            { start: 2, end: 22, status: "Days" },
            { start: 23, end: 23, status: "FO" },
            { start: 24, end: 28, status: "OFF" },
            { start: 29, end: 29, status: "FI" },
            { start: 30, end: 31, status: "Days" }
          ]
        },
        {
          name: "Ryker Thacyk",
          blocks: [
            { start: 1, end: 1, status: "FI" },
            { start: 2, end: 22, status: "Days" },
            { start: 23, end: 23, status: "FO" },
            { start: 24, end: 28, status: "OFF" },
            { start: 29, end: 29, status: "FI" },
            { start: 30, end: 31, status: "Days" }
          ]
        }
      ]
    },
    "2026-11": {
      label: "November 2026",
      year: 2026,
      monthIndex: 10,
      days: 30,
      people: [
        {
          name: "Harley Niedzielski",
          blocks: [
            { start: 1, end: 5, status: "Days" },
            { start: 6, end: 6, status: "FO" },
            { start: 7, end: 11, status: "OFF" },
            { start: 12, end: 12, status: "FI" },
            { start: 13, end: 26, status: "Days" },
            { start: 27, end: 27, status: "FO" },
            { start: 28, end: 30, status: "OFF" }
          ]
        },
        {
          name: "Josh Wiome",
          blocks: [
            { start: 1, end: 12, status: "Days" },
            { start: 13, end: 13, status: "FO" },
            { start: 14, end: 18, status: "OFF" },
            { start: 19, end: 19, status: "FI" },
            { start: 20, end: 30, status: "Days" }
          ]
        },
        {
          name: "Ryker Thacyk",
          blocks: [
            { start: 1, end: 12, status: "Days" },
            { start: 13, end: 13, status: "FO" },
            { start: 14, end: 18, status: "OFF" },
            { start: 19, end: 19, status: "FI" },
            { start: 20, end: 30, status: "Days" }
          ]
        }
      ]
    }
  };

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  let selectedMonth = "2026-10";

  function installStyles() {
    if (document.querySelector("#mechanicsScheduleStyles")) return;
    const style = document.createElement("style");
    style.id = "mechanicsScheduleStyles";
    style.textContent = `
      .mechanics-schedule-toolbar{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0 12px;}
      .mechanics-schedule-toolbar button{min-width:140px;}
      .mechanics-schedule-toolbar button.active{box-shadow:inset 0 0 0 3px rgba(255,255,255,.35);}
      .schedule-legend{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 14px;}
      .schedule-legend span{display:inline-flex;align-items:center;gap:6px;font-size:12px;}
      .schedule-swatch{width:18px;height:18px;border-radius:4px;border:1px solid #c7d0d8;display:inline-block;}
      .schedule-table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid #d7e0e7;border-radius:10px;}
      .schedule-table{border-collapse:separate;border-spacing:0;min-width:1180px;width:100%;font-size:12px;background:#fff;}
      .schedule-table th,.schedule-table td{border-right:1px solid #d7e0e7;border-bottom:1px solid #d7e0e7;padding:5px 4px;text-align:center;white-space:nowrap;}
      .schedule-table tr:last-child td{border-bottom:0;}
      .schedule-table th:last-child,.schedule-table td:last-child{border-right:0;}
      .schedule-table thead th{background:#f4f7f9;font-weight:700;}
      .schedule-table .schedule-name{position:sticky;left:0;z-index:2;text-align:left;min-width:150px;background:#fff;font-weight:700;padding-left:10px;}
      .schedule-table thead .schedule-name{z-index:3;background:#f4f7f9;}
      .schedule-day-head small{display:block;font-weight:500;color:#667785;margin-top:2px;}
      .schedule-cell{min-width:42px;font-weight:700;}
      .schedule-days{background:#fff1c9;}
      .schedule-off{background:#f1f3f5;color:#4d5963;}
      .schedule-fi{background:#939393;color:#111;}
      .schedule-fo{background:#737373;color:#fff;}
      .schedule-today{outline:3px solid #2b6f9d;outline-offset:-3px;}
      .schedule-mobile{display:none;}
      .schedule-person-card{border:1px solid #d7e0e7;border-radius:10px;padding:12px;margin-top:10px;}
      .schedule-blocks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:10px;}
      .schedule-block{border-radius:8px;padding:9px 10px;border:1px solid rgba(0,0,0,.08);}
      .schedule-block strong{display:block;font-size:13px;}
      .schedule-block small{display:block;margin-top:2px;}
      @media (max-width:700px){
        .schedule-table-wrap{display:none;}
        .schedule-mobile{display:block;}
        .mechanics-schedule-toolbar{display:grid;grid-template-columns:1fr 1fr;}
        .mechanics-schedule-toolbar button{min-width:0;width:100%;}
        .schedule-blocks{grid-template-columns:1fr 1fr;}
      }
      @media (max-width:420px){
        .schedule-blocks{grid-template-columns:1fr;}
      }
    `;
    document.head.appendChild(style);
  }

  function statusClass(status) {
    if (status === "Days") return "schedule-days";
    if (status === "OFF") return "schedule-off";
    if (status === "FI") return "schedule-fi";
    if (status === "FO") return "schedule-fo";
    return "";
  }

  function statusForDay(person, day) {
    const block = person.blocks.find(item => day >= item.start && day <= item.end);
    return block?.status || "";
  }

  function todayMatches(month, day) {
    const today = new Date();
    return today.getFullYear() === month.year && today.getMonth() === month.monthIndex && today.getDate() === day;
  }

  function rangeLabel(month, block) {
    const monthName = month.label.split(" ")[0];
    return block.start === block.end ? `${monthName} ${block.start}` : `${monthName} ${block.start}–${block.end}`;
  }

  function renderScheduleMonth() {
    const host = document.querySelector("#mechanicsScheduleBody");
    const month = schedule[selectedMonth];
    if (!host || !month) return;

    document.querySelectorAll(".scheduleMonthButton").forEach(button => {
      button.classList.toggle("active", button.dataset.month === selectedMonth);
    });

    const headerDays = Array.from({ length: month.days }, (_, index) => {
      const day = index + 1;
      const date = new Date(month.year, month.monthIndex, day);
      return `<th class="schedule-day-head ${todayMatches(month, day) ? "schedule-today" : ""}">${day}<small>${dayNames[date.getDay()]}</small></th>`;
    }).join("");

    const rows = month.people.map(person => `
      <tr>
        <td class="schedule-name">${escapeHtml(person.name)}</td>
        ${Array.from({ length: month.days }, (_, index) => {
          const day = index + 1;
          const status = statusForDay(person, day);
          return `<td class="schedule-cell ${statusClass(status)} ${todayMatches(month, day) ? "schedule-today" : ""}">${escapeHtml(status)}</td>`;
        }).join("")}
      </tr>`).join("");

    const mobile = month.people.map(person => `
      <section class="schedule-person-card">
        <strong>${escapeHtml(person.name)}</strong>
        <div class="schedule-blocks">
          ${person.blocks.map(block => `
            <div class="schedule-block ${statusClass(block.status)}">
              <strong>${escapeHtml(block.status)}</strong>
              <small>${escapeHtml(rangeLabel(month, block))}</small>
            </div>`).join("")}
        </div>
      </section>`).join("");

    host.innerHTML = `
      <div class="schedule-table-wrap">
        <table class="schedule-table">
          <thead><tr><th class="schedule-name">Mechanic</th>${headerDays}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="schedule-mobile">${mobile}</div>`;
  }

  window.showMechanicsSchedule = function () {
    const grid = appView.querySelector(".grid");
    if (!grid) return;

    const now = new Date();
    const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    selectedMonth = schedule[currentKey] ? currentKey : "2026-10";

    grid.innerHTML = `
      <section class="card" style="grid-column:1/-1;">
        <div class="section-heading">
          <div>
            <h2 style="margin:0;">Mechanics Schedule</h2>
            <small>October & November 2026</small>
          </div>
          <button id="mechanicsScheduleBack" type="button">← Dashboard</button>
        </div>

        <div class="mechanics-schedule-toolbar">
          ${Object.entries(schedule).map(([key, month]) => `<button type="button" class="scheduleMonthButton" data-month="${key}">${escapeHtml(month.label)}</button>`).join("")}
        </div>

        <div class="schedule-legend">
          <span><i class="schedule-swatch schedule-days"></i> Days</span>
          <span><i class="schedule-swatch schedule-off"></i> OFF</span>
          <span><i class="schedule-swatch schedule-fi"></i> FI</span>
          <span><i class="schedule-swatch schedule-fo"></i> FO</span>
        </div>

        <div id="mechanicsScheduleBody"></div>
      </section>`;

    document.querySelector("#mechanicsScheduleBack")?.addEventListener("click", window.renderDashboard);
    document.querySelectorAll(".scheduleMonthButton").forEach(button => {
      button.addEventListener("click", () => {
        selectedMonth = button.dataset.month;
        renderScheduleMonth();
      });
    });

    renderScheduleMonth();
  };

  function injectDashboardCard() {
    const grid = appView?.querySelector(".grid");
    if (!grid || document.querySelector("#mechanicsScheduleCard")) return;

    const card = document.createElement("button");
    card.id = "mechanicsScheduleCard";
    card.type = "button";
    card.className = "card dashboard-card";
    card.innerHTML = `<strong>Mechanics Schedule</strong><small>October & November 2026</small>`;
    card.addEventListener("click", window.showMechanicsSchedule);
    grid.appendChild(card);
  }

  const baseRenderDashboard = window.renderDashboard;
  if (typeof baseRenderDashboard === "function") {
    window.renderDashboard = function () {
      baseRenderDashboard();
      injectDashboardCard();
    };
  }

  installStyles();
  setTimeout(injectDashboardCard, 0);
})();
