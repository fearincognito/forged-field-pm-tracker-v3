/* Admin reporting, using the existing RLS-protected read-only data API. */
(function () {
  const base = window.renderDashboard;
  const allowed = () => currentProfile && ['owner', 'admin'].includes(currentProfile.role);
  const esc = value => escapeHtml(String(value ?? '—'));
  const dateText = value => value ? new Date(String(value).slice(0,10) + 'T12:00:00').toLocaleDateString(undefined, {year:'numeric',month:'short',day:'numeric'}) : '—';
  const hours = value => value == null ? '—' : `${Number(value).toFixed(1)} hrs`;
  async function allRows(table, fields, start, end) {
    const rows = [];
    for (let offset = 0;; offset += 500) {
      let query = db.from(table).select(fields).order('id').range(offset, offset + 499);
      if (start) query = query.gte('service_date', start).lte('service_date', end);
      const {data,error} = await query;
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < 500) return rows;
    }
  }
  window.renderDashboard = function () {
    base();
    if (!allowed()) return;
    const button = document.createElement('button');
    button.id = 'serviceReportsCard'; button.type = 'button'; button.className = 'card dashboard-card';
    button.innerHTML = '<strong>Service Reports</strong><small>Yearly or custom date range · PDF / CSV export</small>';
    button.addEventListener('click', window.showServiceReports);
    appView.querySelector('.grid').appendChild(button);
  };
  const reportCSS = `
    .pm-report{font:14px/1.5 system-ui;color:#17212b;background:white;font-weight:400}
    .pm-report h1{font-size:26px;margin:0}.pm-report h2{font-size:19px;margin:24px 0 8px}
    .pm-report h3{font-size:16px;margin:0}.pm-report p{margin:6px 0}
    .pm-report table{border-collapse:collapse;width:100%;font-size:12px;margin:12px 0}
    .pm-report th,.pm-report td{text-align:left;border-bottom:1px solid #d7e0e7;padding:9px;vertical-align:top;overflow-wrap:anywhere}
    .pm-report th{background:#edf2f6;color:#17212b}.pm-report thead{display:table-header-group}
    .pm-report .report-service{border:1px solid #d7e0e7;border-left:4px solid #24618a;padding:12px;margin:10px 0;break-inside:avoid}
    .pm-report .report-notes{white-space:pre-wrap;overflow-wrap:anywhere}
    .pm-report .report-heading{border-bottom:3px solid #24618a;padding-bottom:14px}
    .pm-report .report-scroll{overflow-x:auto}.pm-report .report-muted{color:#526575}
    @page{size:letter;margin:16mm}
    @media print{body{margin:0;padding:0;background:white}.no-print{display:none!important}.pm-report .report-scroll{overflow:visible}.pm-report h2,.pm-report h3{break-after:avoid}.pm-report tr{break-inside:avoid}}
  `;
  function reportHTML(records, equipment, sites, users, start, end) {
    const machines = new Map(equipment.map(e => [e.id,e]));
    const siteMap = new Map(sites.map(s => [s.id,s.name]));
    const userMap = new Map(users.map(u => [u.id || u.user_id,u.full_name]));
    const groups = new Map();
    records.forEach(r => { if (!groups.has(r.equipment_id)) groups.set(r.equipment_id,[]); groups.get(r.equipment_id).push(r); });
    const ordered = [...groups].sort(([a],[b]) => String(machines.get(a)?.unit_number || machines.get(a)?.name || a).localeCompare(String(machines.get(b)?.unit_number || machines.get(b)?.name || b),undefined,{numeric:true}));
    const title = id => { const e = machines.get(id); return e ? `${e.unit_number || e.name}${e.unit_number && e.name ? ' · ' + e.name : ''}${e.archived ? ' (Archived)' : ''}` : `Unavailable equipment (${id})`; };
    const late = records.filter(r => r.service_hours != null && r.scheduled_due_hours != null && Number(r.service_hours)>Number(r.scheduled_due_hours)).length;
    return `<article class="pm-report"><div class="report-heading"><p>FORGED DRILLING · FIELD PM TRACKER</p><h1>Equipment Service Report</h1><p>${esc(dateText(start))} – ${esc(dateText(end))} (inclusive)</p><p class="report-muted">Generated ${esc(new Date().toLocaleString())}</p></div><p><strong>${records.length} completed services · ${groups.size} equipment serviced · ${late} completed after scheduled hours</strong></p><p class="report-muted">Includes recorded services only. Site names reflect current equipment assignments. Missing details are shown as —.</p>${!records.length ? '<p>No completed services in this date range.</p>' : `<h2>Fleet Summary</h2><div class="report-scroll"><table><thead><tr><th>Equipment</th><th>Current site</th><th>Services</th><th>First service</th><th>Last service</th></tr></thead><tbody>${ordered.map(([id,list]) => `<tr><td>${esc(title(id))}</td><td>${esc(siteMap.get(machines.get(id)?.site_id))}</td><td>${list.length}</td><td>${esc(dateText(list[0].service_date))}</td><td>${esc(dateText(list[list.length-1].service_date))}</td></tr>`).join('')}</tbody></table></div><h2>Individual Completed PMs / Services</h2>${ordered.map(([id,list]) => `<section><h3>${esc(title(id))}</h3><p class="report-muted">${esc(siteMap.get(machines.get(id)?.site_id))} · ${list.length} completed services</p>${list.map(r => `<div class="report-service"><strong>${esc(dateText(r.service_date))} · ${esc(r.service_name || 'Service')}</strong><p>Meter: ${esc(hours(r.service_hours))} · Scheduled due: ${esc(hours(r.scheduled_due_hours))}</p><p>Completed by: ${esc(userMap.get(r.completed_by) || (r.completed_by === currentUser?.id ? currentProfile?.full_name : null))}</p><p class="report-notes"><strong>Parts used:</strong> ${esc(r.parts_used)}</p><p class="report-notes"><strong>Notes:</strong> ${esc(r.notes)}</p></div>`).join('')}</section>`).join('')}`}</article>`;
  }
  window.showServiceReports = function () {
    if (!allowed()) return;
    const year = new Date().getFullYear();
    const grid = appView.querySelector('.grid');
    grid.innerHTML = `<section class="card" style="grid-column:1/-1"><div class="section-heading"><h2>Service Reports</h2><button id="reportBack">← Dashboard</button></div><p>Generate a report of all completed equipment services for a year or your own date range.</p><form id="reportForm"><div class="form-grid"><label>Start date<input id="reportStart" type="date" required value="${year}-01-01"></label><label>End date<input id="reportEnd" type="date" required value="${year}-12-31"></label></div><div class="form-actions"><button type="button" id="reportThisYear" class="secondary-button">This Year</button><button type="button" id="reportLastYear" class="secondary-button">Last Year</button><button id="reportGenerate">Generate Report</button></div></form><p id="reportMessage" role="status" aria-live="polite"></p><div id="reportExports" class="form-actions hidden"><button id="reportPrint">Print / Save as PDF</button><button id="reportCSV" class="secondary-button">Export CSV</button></div><div id="reportPreview"></div></section>`;
    document.querySelector('#reportBack').onclick = window.renderDashboard;
    const start = document.querySelector('#reportStart'), end = document.querySelector('#reportEnd');
    const preview = document.querySelector('#reportPreview'), exports = document.querySelector('#reportExports'), message = document.querySelector('#reportMessage');
    let generated = null, run = 0;
    const invalidate = () => { run++; generated = null; exports.classList.add('hidden'); preview.innerHTML = ''; message.textContent = ''; };
    [start,end].forEach(input => input.addEventListener('change',invalidate));
    const setYear = y => { start.value = `${y}-01-01`; end.value = `${y}-12-31`; invalidate(); };
    document.querySelector('#reportThisYear').onclick = () => setYear(year);
    document.querySelector('#reportLastYear').onclick = () => setYear(year-1);
    document.querySelector('#reportForm').onsubmit = async event => {
      event.preventDefault(); invalidate();
      if (!allowed()) return;
      if (!start.value || !end.value || start.value > end.value) { message.textContent = 'Choose a valid date range: start must be on or before end.'; return; }
      const token = run, from = start.value, to = end.value;
      message.textContent = 'Loading all completed services…';
      try {
        const [records,equipment,sites,people] = await Promise.all([
          allRows('service_history','id,equipment_id,service_name,service_hours,scheduled_due_hours,service_date,parts_used,notes,completed_by',from,to),
          allRows('equipment','id,unit_number,name,site_id,archived'), allRows('sites','id,name'), db.rpc('admin_list_users')
        ]);
        if (run !== token || !preview.isConnected || !allowed()) return;
        if (people.error) throw people.error;
        records.sort((a,b) => String(a.service_date).localeCompare(String(b.service_date)) || String(a.id).localeCompare(String(b.id)));
        generated = {records,equipment,sites,users:people.data || [],from,to};
        preview.innerHTML = `<style>${reportCSS}</style>` + reportHTML(records,equipment,sites,generated.users,from,to);
        exports.classList.remove('hidden'); message.textContent = `${records.length} completed services loaded. PDF opens your browser’s print dialog; choose Save as PDF.`;
      } catch (error) { if (token === run && preview.isConnected) message.textContent = `Report could not be generated: ${error.message}`; }
    };
    document.querySelector('#reportPrint').onclick = () => {
      if (!generated || !allowed()) return;
      const pop = window.open('','_blank');
      if (!pop) { message.textContent = 'Allow pop-ups for this site to print the report.'; return; }
      pop.opener = null;
      pop.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Forged-Service-Report-${generated.from}-to-${generated.to}</title><style>${reportCSS}</style></head><body><button class="no-print" onclick="window.print()">Print / Save as PDF</button>${preview.querySelector('.pm-report').outerHTML}</body></html>`);
      pop.document.close(); pop.focus(); pop.print();
    };
    document.querySelector('#reportCSV').onclick = () => {
      if (!generated || !allowed()) return;
      const e = new Map(generated.equipment.map(x => [x.id,x])), s = new Map(generated.sites.map(x => [x.id,x.name])), u = new Map(generated.users.map(x => [x.id || x.user_id,x.full_name]));
      const cell = value => { let text = String(value ?? ''); if (/^[\s]*[=+@-]/.test(text)) text = "'" + text; return '"' + text.replace(/"/g,'""') + '"'; };
      const rows = [['Service date','Unit','Equipment','Current site','Service / PM','Meter hours','Scheduled due hours','Completed by','Parts used','Notes','Service record ID'],...generated.records.map(r => [r.service_date,e.get(r.equipment_id)?.unit_number,e.get(r.equipment_id)?.name,s.get(e.get(r.equipment_id)?.site_id),r.service_name,r.service_hours,r.scheduled_due_hours,u.get(r.completed_by),r.parts_used,r.notes,r.id])];
      const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(r => r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
      const a = document.createElement('a'); a.href=url; a.download=`Forged-Service-Report-${generated.from}-to-${generated.to}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
    };
  };
})();
