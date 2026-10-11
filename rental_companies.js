/* Company contact directory: Owner/Admin only, enforced by database RLS. */
(function () {
  const base = window.renderDashboard;
  const allowed = () => currentProfile && ['owner','admin'].includes(currentProfile.role);
  const esc = value => escapeHtml(String(value ?? ''));
  const fields = [
    ['company_name','Company name','text'],
    ['salesperson_name','Salesperson name','text'],
    ['salesperson_phone','Salesperson phone','tel'],
    ['salesperson_email','Salesperson email','email'],
    ['parts_service_phone','Parts / service phone','tel'],
    ['parts_service_email','Parts / service email','email']
  ];
  window.renderDashboard = function () {
    base();
    if (!allowed()) return;
    const button = document.createElement('button');
    button.id='rentalCompaniesCard'; button.type='button'; button.className='card dashboard-card';
    button.innerHTML='<strong>Rental Companies</strong><small>Salespeople and parts / service contacts</small>';
    button.onclick=window.showRentalCompanies;
    appView.querySelector('.grid').appendChild(button);
  };
  function contact(label,phone,email) {
    const dial = String(phone || '').replace(/[^+\d]/g,'');
    return `<div class="detail-item"><small>${esc(label)}</small>${phone ? `<a href="tel:${esc(dial)}">${esc(phone)}</a>` : '<span>Phone —</span>'}${email ? `<a style="overflow-wrap:anywhere" href="mailto:${esc(encodeURIComponent(email))}">${esc(email)}</a>` : '<span>Email —</span>'}</div>`;
  }
  window.showRentalCompanies = async function () {
    if (!allowed()) return;
    const grid=appView.querySelector('.grid');
    grid.innerHTML='<section class="card" style="grid-column:1/-1"><div class="section-heading"><h2>Rental Companies</h2><div class="form-actions compact-actions"><button id="rentalBack">← Dashboard</button><button id="rentalAdd">+ Add Company</button></div></div><label>Search companies / contacts<input id="rentalSearch" type="search" placeholder="Company, salesperson, phone or email"></label><p id="rentalStatus" role="status">Loading contacts…</p><div id="rentalList"></div></section>';
    document.querySelector('#rentalBack').onclick=window.renderDashboard;
    document.querySelector('#rentalAdd').onclick=()=>showForm();
    const list=document.querySelector('#rentalList'),status=document.querySelector('#rentalStatus'),search=document.querySelector('#rentalSearch');
    try {
      const rows=[];
      for (let offset=0;;offset+=500) {
        const {data,error}=await db.from('rental_companies').select('*').order('company_name').order('id').range(offset,offset+499);
        if(error) throw error;
        rows.push(...(data || [])); if(!data || data.length<500) break;
      }
      if(!list.isConnected || !allowed()) return;
      function render() {
        const term=search.value.trim().toLowerCase();
        const filtered=rows.filter(row=>[...fields.map(([key])=>row[key]),row.notes].join(' ').toLowerCase().includes(term));
        status.textContent=`${filtered.length} compan${filtered.length===1?'y':'ies'}`;
        list.innerHTML=filtered.length?filtered.map(row=>`<article class="inset-card compact-card"><div class="section-heading"><h3 style="margin:0">${esc(row.company_name)}</h3><button type="button" class="secondary-button rentalEdit" data-id="${esc(row.id)}">Edit</button></div><p>Salesperson: ${esc(row.salesperson_name || '—')}</p><div class="detail-grid">${contact('Salesperson',row.salesperson_phone,row.salesperson_email)}${contact('Parts / service',row.parts_service_phone,row.parts_service_email)}</div>${row.notes?`<p style="white-space:pre-wrap;overflow-wrap:anywhere;font-weight:400">${esc(row.notes)}</p>`:''}</article>`).join(''):'<p class="empty-state">No companies found. Use Add Company to save a contact.</p>';
        list.querySelectorAll('.rentalEdit').forEach(button=>button.onclick=()=>showForm(rows.find(row=>row.id===button.dataset.id)));
      }
      render();search.addEventListener('input',render);
    } catch(error) { if(list.isConnected) status.textContent=`Contacts could not be loaded: ${error.message}`; }
  };
  function showForm(row=null) {
    if(!allowed()) return;
    const grid=appView.querySelector('.grid');
    grid.innerHTML=`<section class="card" style="grid-column:1/-1"><h2>${row?'Edit':'Add'} Rental Company</h2><form id="rentalForm"><div class="form-grid">${fields.map(([key,label,type])=>`<label>${label}<input name="${key}" type="${type}" maxlength="${type==='email'?254:200}" ${key==='company_name'?'required':''} value="${esc(row?.[key])}"></label>`).join('')}</div><label>Notes<textarea name="notes" rows="3" maxlength="5000">${esc(row?.notes)}</textarea></label><div class="form-actions"><button id="rentalSave">Save Company</button><button type="button" id="rentalCancel" class="secondary-button">Cancel</button>${row?'<button type="button" id="rentalDelete" class="secondary-button">Delete Company</button>':''}</div><p id="rentalMessage" role="status" aria-live="polite"></p></form></section>`;
    const form=document.querySelector('#rentalForm'),message=document.querySelector('#rentalMessage');
    let busy=false;
    const setBusy=value=>{busy=value;form.querySelectorAll('button').forEach(b=>b.disabled=value);};
    document.querySelector('#rentalCancel').onclick=window.showRentalCompanies;
    form.onsubmit=async event=>{
      event.preventDefault();if(busy || !allowed()) return;
      const values=Object.fromEntries([...fields.map(([key])=>key),'notes'].map(key=>[key,form.elements.namedItem(key).value.trim() || null]));
      if(!values.company_name){message.textContent='Enter a company name.';return;}
      setBusy(true);message.textContent='Saving…';
      try {
        const query=row?db.from('rental_companies').update(values).eq('id',row.id):db.from('rental_companies').insert(values);
        const {data,error}=await query.select('id').single();if(error) throw error;if(!data) throw new Error('Company could not be saved.');
        if(form.isConnected) window.showRentalCompanies();
      } catch(error){if(form.isConnected){setBusy(false);message.textContent=`Could not save: ${error.message}`;}}
    };
    document.querySelector('#rentalDelete')?.addEventListener('click',async()=>{
      if(busy || !allowed() || !confirm(`Delete ${row.company_name} from Rental Companies?`)) return;
      setBusy(true);message.textContent='Deleting…';
      try {
        const {data,error}=await db.from('rental_companies').delete().eq('id',row.id).select('id').single();if(error)throw error;if(!data)throw new Error('Company could not be deleted.');
        if(form.isConnected)window.showRentalCompanies();
      }catch(error){if(form.isConnected){setBusy(false);message.textContent=`Could not delete: ${error.message}`;}}
    });
  }
})();
