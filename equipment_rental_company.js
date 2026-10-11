/* Rental company selector reused by manual/fleet additions and equipment edits. */
(function () {
  const esc = value => escapeHtml(String(value ?? ''));
  function contactHTML(company) {
    const phone = value => value ? `<a href="tel:${esc(String(value).replace(/[^+\d]/g,''))}">${esc(value)}</a>` : '—';
    const email = value => value ? `<a style="overflow-wrap:anywhere" href="mailto:${esc(encodeURIComponent(value))}">${esc(value)}</a>` : '—';
    return `<div class="inset-card compact-card" style="font-weight:400"><h3 style="margin:0">${esc(company.company_name)}</h3><div class="detail-grid"><div class="detail-item"><small>Salesperson</small><strong>${esc(company.salesperson_name || '—')}</strong><div>${phone(company.salesperson_phone)}</div><div>${email(company.salesperson_email)}</div></div><div class="detail-item"><small>Parts / Service</small><div>${phone(company.parts_service_phone)}</div><div>${email(company.parts_service_email)}</div></div></div>${company.notes ? `<p style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(company.notes)}</p>` : ''}</div>`;
  }
  async function showContacts(container, companyId) {
    const token = String(Number(container.dataset.request || 0)+1);container.dataset.request=token;
    container.innerHTML='';
    if(!companyId) return;
    container.textContent='Loading rental company contacts…';
    try {
      const {data,error}=await db.rpc('rental_company_contact_details',{p_company_id:companyId});if(error)throw error;
      if(!container.isConnected || container.dataset.request!==token) return;
      container.innerHTML=data?.[0] ? contactHTML(data[0]) : '<p>Rental company information is unavailable.</p>';
    }catch(error){if(container.isConnected && container.dataset.request===token)container.textContent=`Could not load rental company information: ${error.message}`;}
  }
  window.setupRentalCompanyField = async function (ownershipId, selectedId=null) {
    const ownership=document.getElementById(ownershipId);
    if(!ownership) return;
    const label=document.createElement('label');label.id='rentalCompanyField';
    label.innerHTML='Rental Company<select id="equipmentRentalCompany"><option value="">Not selected</option></select><small id="rentalCompanyHelp" style="display:block;font-weight:400">Loading saved companies…</small>';
    ownership.closest('label').after(label);
    const contacts=document.createElement('div');contacts.id='rentalCompanyContacts';contacts.style.gridColumn='1/-1';label.after(contacts);
    const select=label.querySelector('select'),help=label.querySelector('small');
    const sync=()=>{label.hidden=ownership.value!=='rental';select.disabled=label.hidden;contacts.hidden=label.hidden;showContacts(contacts,label.hidden ? null : select.value);};
    select.addEventListener('change',sync);
    ownership.addEventListener('change',sync);sync();
    // Keep existing links even if options fail to load; saving other edits must not clear them.
    if(selectedId){const option=new Option('Saved rental company',selectedId,true,true);select.appendChild(option);}
    try {
      const {data,error}=await db.rpc('rental_company_options');if(error)throw error;
      if(!label.isConnected) return;
      select.innerHTML='<option value="">Not selected</option>';
      (data || []).forEach(row=>select.appendChild(new Option(row.company_name,row.id)));
      if(selectedId && !(data || []).some(row=>row.id===selectedId))select.appendChild(new Option('Saved company unavailable',selectedId));
      select.value=selectedId || '';sync();
      help.textContent=data?.length?'Select the company supplying this rental.':'No saved companies yet. Ask an admin to add one in Rental Companies.';
    }catch(error){if(label.isConnected)help.textContent=`Could not load companies: ${error.message}`;}
  };
  window.selectedRentalCompany = function (ownershipId) {
    return document.getElementById(ownershipId)?.value==='rental' ? document.querySelector('#equipmentRentalCompany')?.value || null : null;
  };
  const baseOpenEquipment=window.openEquipment;
  window.openEquipment=async function(equipmentId,siteId) {
    await baseOpenEquipment(equipmentId,siteId);
    const strip=appView.querySelector('.status-strip');
    if(!strip) return;
    const container=document.createElement('section');container.id='equipmentRentalContacts';strip.after(container);
    try {
      const {data,error}=await db.from('equipment').select('ownership,rental_company_id').eq('id',equipmentId).single();if(error)throw error;
      if(!container.isConnected) return;
      if(data?.ownership==='rental' && data.rental_company_id) await showContacts(container,data.rental_company_id);
      else container.remove();
    }catch(error){if(container.isConnected)container.textContent=`Could not load rental company: ${error.message}`;}
  };
})();
