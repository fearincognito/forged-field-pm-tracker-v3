/* Rental company selector reused by manual/fleet additions and equipment edits. */
(function () {
  window.setupRentalCompanyField = async function (ownershipId, selectedId=null) {
    const ownership=document.getElementById(ownershipId);
    if(!ownership) return;
    const label=document.createElement('label');label.id='rentalCompanyField';
    label.innerHTML='Rental Company<select id="equipmentRentalCompany"><option value="">Not selected</option></select><small id="rentalCompanyHelp" style="display:block;font-weight:400">Loading saved companies…</small>';
    ownership.closest('label').after(label);
    const select=label.querySelector('select'),help=label.querySelector('small');
    const sync=()=>{label.hidden=ownership.value!=='rental';select.disabled=label.hidden;};
    ownership.addEventListener('change',sync);sync();
    // Keep existing links even if options fail to load; saving other edits must not clear them.
    if(selectedId){const option=new Option('Saved rental company',selectedId,true,true);select.appendChild(option);}
    try {
      const {data,error}=await db.rpc('rental_company_options');if(error)throw error;
      if(!label.isConnected) return;
      select.innerHTML='<option value="">Not selected</option>';
      (data || []).forEach(row=>select.appendChild(new Option(row.company_name,row.id)));
      if(selectedId && !(data || []).some(row=>row.id===selectedId))select.appendChild(new Option('Saved company unavailable',selectedId));
      select.value=selectedId || '';
      help.textContent=data?.length?'Select the company supplying this rental.':'No saved companies yet. Ask an admin to add one in Rental Companies.';
    }catch(error){if(label.isConnected)help.textContent=`Could not load companies: ${error.message}`;}
  };
  window.selectedRentalCompany = function (ownershipId) {
    return document.getElementById(ownershipId)?.value==='rental' ? document.querySelector('#equipmentRentalCompany')?.value || null : null;
  };
})();
