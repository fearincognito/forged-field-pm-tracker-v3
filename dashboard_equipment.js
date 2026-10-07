/* V3 company-wide equipment dashboard */
(function(){
  const baseRenderDashboard = window.renderDashboard;
  if (typeof baseRenderDashboard !== "function") return;

  const label = v => String(v || "active").replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());
  const replace = (button,handler) => {
    if(!button) return null;
    const next = button.cloneNode(true);
    button.replaceWith(next);
    next.addEventListener("click",handler);
    return next;
  };

  function pmState(machine,schedules){
    const rows=schedules.filter(s=>s.equipment_id===machine.id && s.next_due_hours!=null);
    if(!rows.length || machine.current_hours==null) return {rank:9,text:"No PM due data",color:"#9aa7b2"};
    let best={rank:8,text:"PM OK",color:"#2f7d4a"};
    rows.forEach(s=>{
      const r=Number(s.next_due_hours)-Number(machine.current_hours);
      let x;
      if(r<0) x={rank:0,text:`${Math.abs(r).toFixed(1)} hrs overdue`,color:"#b42318"};
      else if(r===0) x={rank:0,text:"PM due now",color:"#b42318"};
      else if(r<=20) x={rank:1,text:`${r.toFixed(1)} hrs to PM`,color:"#d96b00"};
      else if(r<=50) x={rank:2,text:`${r.toFixed(1)} hrs to PM`,color:"#c58a00"};
      else x={rank:7,text:`${r.toFixed(1)} hrs to PM`,color:"#2f7d4a"};
      if(x.rank<best.rank) best=x;
    });
    return best;
  }

  window.renderDashboard=function(){
    baseRenderDashboard();
    wireCard();
  };

  async function wireCard(){
    const old=document.querySelector("#equipmentCard");
    if(!old) return;
    const card=replace(old,()=>window.showDashboardEquipment());
    const {data,error}=await db.from("equipment").select("id,status").eq("archived",false);
    if(error || document.querySelector("#equipmentCard")!==card) return;
    const rows=data||[];
    const down=rows.filter(x=>x.status==="out_of_service").length;
    const small=card.querySelector("small");
    if(small) small.textContent=down?`${rows.length} equipment · ${down} out of service`:`${rows.length} equipment`;
  }

  window.showDashboardEquipment=async function(){
    const grid=appView.querySelector(".grid");
    grid.innerHTML='<section class="card" style="grid-column:1/-1;"><p>Loading company equipment...</p></section>';

    const [sitesR,equipmentR,pmR,ticketsR]=await Promise.all([
      db.from("sites").select("id,name").eq("archived",false).order("name"),
      db.from("equipment").select("id,site_id,unit_number,name,make,model,ownership,status,current_hours").eq("archived",false),
      db.from("pm_schedules").select("equipment_id,next_due_hours").eq("active",true),
      db.from("work_tickets").select("equipment_id,status,priority").not("equipment_id","is",null)
    ]);
    const error=sitesR.error||equipmentR.error||pmR.error||ticketsR.error;
    if(error){
      grid.innerHTML=`<section class="card" style="grid-column:1/-1;"><h2>Company Equipment could not be loaded</h2><p class="error-text">${escapeHtml(error.message)}</p><button id="companyEquipmentBack">← Dashboard</button></section>`;
      document.querySelector("#companyEquipmentBack").addEventListener("click",window.renderDashboard);
      return;
    }

    const sites=sitesR.data||[], schedules=pmR.data||[], tickets=ticketsR.data||[];
    const siteNames=Object.fromEntries(sites.map(s=>[s.id,s.name]));
    const machines=(equipmentR.data||[]).map(m=>{
      const activeTickets=tickets.filter(t=>t.equipment_id===m.id && (t.status==="open"||t.status==="in_progress"));
      return {...m,pm:pmState(m,schedules),activeTickets};
    }).sort((a,b)=>a.pm.rank-b.pm.rank || String(a.unit_number||a.name).localeCompare(String(b.unit_number||b.name)));

    const pmAttention=machines.filter(m=>m.pm.rank<=2).length;
    const out=machines.filter(m=>m.status==="out_of_service").length;
    const rental=machines.filter(m=>m.ownership==="rental"||m.status==="rental").length;

    grid.innerHTML=`<section class="card" style="grid-column:1/-1;">
      <div class="section-heading"><div><h2 style="margin:0;">Company Equipment</h2><small>All equipment across accessible sites</small></div><button id="companyEquipmentBack">← Dashboard</button></div>
      <div class="detail-grid" style="margin-top:18px;">
        <div class="detail-item"><small>Total</small><strong>${machines.length}</strong></div>
        <div class="detail-item"><small>PM Attention</small><strong>${pmAttention}</strong></div>
        <div class="detail-item"><small>Out of Service</small><strong>${out}</strong></div>
        <div class="detail-item"><small>Rental</small><strong>${rental}</strong></div>
      </div>
      <div class="form-grid" style="margin-top:18px;">
        <label>Site<select id="equipmentSiteFilter"><option value="all">All Sites</option>${sites.map(s=>`<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`).join("")}</select></label>
        <label>Status<select id="equipmentStatusFilter"><option value="all">All Statuses</option><option value="active">Active</option><option value="rental">Rental</option><option value="out_of_service">Out of Service</option></select></label>
        <label>Search<input id="equipmentSearch" type="search" placeholder="Unit, name, make or model"></label>
      </div>
      <div id="companyEquipmentList" style="margin-top:18px;"></div>
    </section>`;

    document.querySelector("#companyEquipmentBack").addEventListener("click",window.renderDashboard);
    const siteF=document.querySelector("#equipmentSiteFilter"), statusF=document.querySelector("#equipmentStatusFilter"), search=document.querySelector("#equipmentSearch"), list=document.querySelector("#companyEquipmentList");

    function render(){
      const q=search.value.trim().toLowerCase();
      const rows=machines.filter(m=>{
        if(siteF.value!=="all"&&m.site_id!==siteF.value) return false;
        if(statusF.value!=="all"&&m.status!==statusF.value) return false;
        if(q){
          const hay=[m.unit_number,m.name,m.make,m.model,siteNames[m.site_id]].filter(Boolean).join(" ").toLowerCase();
          if(!hay.includes(q)) return false;
        }
        return true;
      });
      list.innerHTML=rows.length?rows.map(m=>{
        const makeModel=[m.make,m.model].filter(Boolean).join(" ");
        const down=m.activeTickets.some(t=>t.priority==="equipment_down");
        const accent=down?"#b42318":m.pm.color;
        const ticketText=m.activeTickets.length?`${m.activeTickets.length} open ticket${m.activeTickets.length===1?"":"s"}${down?" · Equipment Down":""}`:"No open tickets";
        return `<button class="equipment-list-card companyEquipmentOpen" data-id="${escapeHtml(m.id)}" data-site="${escapeHtml(m.site_id)}" style="border-left:5px solid ${accent};text-align:left;margin-top:10px;width:100%;">
          <span class="equipment-title">${escapeHtml(m.unit_number||m.name)}</span>
          ${m.unit_number&&m.name?`<span>${escapeHtml(m.name)}</span>`:""}
          <small><strong>${escapeHtml(siteNames[m.site_id]||"Site")}</strong>${makeModel?` · ${escapeHtml(makeModel)}`:""}</small>
          <small>${escapeHtml(label(m.status))}${m.current_hours!=null?` · ${escapeHtml(m.current_hours)} hrs`:""}</small>
          <small><strong>PM:</strong> ${escapeHtml(m.pm.text)}</small>
          <small><strong>Tickets:</strong> ${escapeHtml(ticketText)}</small>
          <small class="open-hint">Open equipment →</small>
        </button>`;
      }).join(""):'<div class="empty-state"><strong>No equipment matches those filters.</strong></div>';
      document.querySelectorAll(".companyEquipmentOpen").forEach(b=>b.addEventListener("click",()=>window.openEquipment(b.dataset.id,b.dataset.site)));
    }
    siteF.addEventListener("change",render); statusF.addEventListener("change",render); search.addEventListener("input",render); render();
  };

  setTimeout(()=>{if(document.querySelector("#equipmentCard")) wireCard();},0);
})();
