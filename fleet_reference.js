/* Private fleet reference selection. Source snapshots never replace live meters. */
(function () {
  const maintain = () => currentProfile && ["owner", "admin", "mechanic"].includes(currentProfile.role);
  const text = value => value == null ? "" : String(value).trim();
  const norm = value => text(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const identifier = value => !["", "NA", "NONE", "UNKNOWN", "0"].includes(norm(value));
  let selection = null;
  let generation = 0;
  let saving = false;

  function fields(record) {
    const d = record.data, info = d.equipment_information || {}, eq = d.equipment || {}, en = d.engine || {};
    const rawSerial = text(en.serial_source_text).replace(/^\s*(?:ESN|S\/N|SERIAL)\s*[:#]\s*/i, "");
    const year = Number(eq.year_raw ?? eq.year);
    return {
      unit_number: info.unit_number || record.unit_number,
      name: info.description || record.description,
      make: eq.make, model: eq.model, vin: eq.vin,
      serial_number: eq.drilling_rig?.serial_number || null,
      engine_serial_number: en.serial_number || (/^[A-Za-z0-9-]+$/.test(rawSerial) ? rawSerial : null),
      year: Number.isInteger(year) && year >= 1900 && year <= 2100 ? year : null,
      notes: d.notes_raw || null
    };
  }

  function matching(record, rows) {
    const f = fields(record);
    const values = [f.vin, f.serial_number, record.data.equipment?.drilling_rig?.serial_number];
    return rows.filter(row => row.fleet_reference_id === record.id || (
      norm(row.unit_number) === norm(f.unit_number) && (
        values.some(v => identifier(v) && [row.vin, row.serial_number].some(rv => identifier(rv) && norm(rv) === norm(v))) ||
        (identifier(f.engine_serial_number) && norm(row.engine_serial_number) === norm(f.engine_serial_number))
      )
    ));
  }

  function sourceHTML(record) {
    const d = record.data, eq = d.equipment || {}, en = d.engine || {};
    const pairs = [
      ["Description", d.equipment_information?.description],
      ["Source unit number", d.equipment_information?.source_unit_number],
      ["Source make / model", [eq.make, eq.model].filter(Boolean).join(" ")],
      ["Source year", eq.year_raw ?? eq.year], ["Source VIN / serial", eq.vin],
      ["Build month", eq.build_month_raw], ["Plate", eq.plate],
      ["Engine make", en.make], ["Engine model", en.model],
      ["Engine serial as recorded", en.serial_source_text],
      ["Source engine hours", en.engine_hours_raw], ["Source kilometres", en.kilometres_raw],
      ["MVI expiry as recorded", eq.mvi_expiration_raw]
    ].filter(([, value]) => text(value));
    return `<details><summary>Original fleet details — ${escapeHtml(record.unit_number)}</summary>
      <dl>${pairs.map(([label, value]) => `<dt><strong>${label}</strong></dt><dd>${escapeHtml(value)}</dd>`).join("")}</dl>
      ${d.notes_raw ? `<strong>Original notes</strong><p style="white-space:pre-wrap;overflow-wrap:anywhere">${escapeHtml(d.notes_raw)}</p>` : ""}
      <small>cbcstaff.ca record ${escapeHtml(d.source?.equipment_record_id)} · collected ${escapeHtml(d.source?.extracted_on)}.
      Historical reference; confirm meters and inspection dates at the machine.</small>
      ${d.data_quality_flags?.length ? `<p>${escapeHtml(d.data_quality_flags.map(x => typeof x === "string" ? x : JSON.stringify(x)).join("; "))}</p>` : ""}
      </details>`;
  }

  function message(node, error) {
    node.textContent = error.message || String(error);
    node.classList.add("error-text");
  }

  const baseShow = window.showAddEquipmentForm;
  window.showAddEquipmentForm = function (siteId) {
    generation++;
    selection = null;
    saving = false;
    baseShow(siteId);
    if (maintain()) installSelector(siteId, generation);
  };

  async function installSelector(siteId, token) {
    const form = document.querySelector("#equipmentForm");
    const panel = document.createElement("div");
    panel.className = "inset-card";
    panel.style.margin = "16px 0";
    panel.innerHTML = `<strong>Select from Fleet Reference</strong>
      <p>Search a unit, review its details, then save it to this site.</p>
      <label for="fleetSearch">Search fleet<input id="fleetSearch" type="search" placeholder="Unit, description, make or model" autocomplete="off"></label>
      <label for="fleetSelect">Fleet equipment<select id="fleetSelect" disabled><option value="">Loading fleet…</option></select></label>
      <p id="fleetStatus" role="status"></p><div id="fleetReview"></div>
      <button id="fleetManual" type="button" class="secondary-button">Add Manually / Clear Selection</button>`;
    form.prepend(panel);
    const search = panel.querySelector("#fleetSearch"), select = panel.querySelector("#fleetSelect"), status = panel.querySelector("#fleetStatus");
    panel.querySelector("#fleetManual").onclick = () => window.showAddEquipmentForm(siteId);
    try {
      const { data: rows, error } = await db.from("fleet_reference").select("id,unit_number,description,data->equipment").order("unit_number");
      if (error) throw error;
      if (token !== generation || !form.isConnected) return;
      const counts = new Map();
      rows.forEach(r => counts.set(r.unit_number, (counts.get(r.unit_number) || 0) + 1));
      const render = () => {
        const query = text(search.value).toLowerCase();
        const filtered = rows.filter(r => [r.unit_number, r.description, r.equipment?.make, r.equipment?.model].join(" ").toLowerCase().includes(query));
        select.replaceChildren(new Option("Choose fleet equipment…", ""));
        filtered.forEach(r => select.add(new Option(`${r.unit_number} — ${r.description}${counts.get(r.unit_number) > 1 ? ` [record ${r.id.split(":").pop()}]` : ""}`, r.id)));
        select.value = selection?.record.id || "";
        status.textContent = `${filtered.length} of ${rows.length} fleet records`;
        status.classList.remove("error-text");
      };
      select.disabled = false;
      render();
      search.oninput = render;
      select.onchange = () => choose(select.value, siteId, form, panel);
    } catch (error) {
      select.replaceChildren(new Option("Fleet unavailable — manual entry is available", ""));
      message(status, error);
    }
  }

  async function choose(id, siteId, form, panel) {
    const token = ++generation;
    selection = null;
    const status = panel.querySelector("#fleetStatus"), review = panel.querySelector("#fleetReview");
    const save = form.querySelector('[type="submit"]');
    save.disabled = true;
    review.replaceChildren();
    if (!id) { window.showAddEquipmentForm(siteId); return; }
    status.textContent = "Loading equipment details…";
    try {
      const [{ data: record, error }, { data: existing, error: existingError }] = await Promise.all([
        db.from("fleet_reference").select("*").eq("id", id).single(),
        db.from("equipment").select("id,site_id,unit_number,vin,serial_number,engine_serial_number,fleet_reference_id,archived")
      ]);
      if (error || existingError) throw error || existingError;
      if (token !== generation || !form.isConnected) return;
      const matches = matching(record, existing || []);
      review.innerHTML = sourceHTML(record);
      if (matches.length) {
        status.textContent = "This equipment already exists in the tracker. Open its record to keep its current hours, photo and site.";
        matches.forEach(row => {
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = `Open Existing ${row.unit_number}${row.archived ? " (archived)" : ""}`;
          button.onclick = () => window.openEquipment(row.id, row.site_id);
          review.prepend(button);
        });
        return;
      }
      const f = fields(record);
      const mapping = {equipmentUnitNumber:"unit_number", equipmentName:"name", equipmentMake:"make", equipmentModel:"model", equipmentVin:"vin", equipmentSerial:"serial_number", equipmentEngineSerial:"engine_serial_number", equipmentYear:"year", equipmentNotes:"notes"};
      Object.entries(mapping).forEach(([input, key]) => { const node = document.getElementById(input); if (node) node.value = f[key] ?? ""; });
      document.querySelector("#equipmentHours").value = "";
      window.equipmentPhotoWorkflow?.setPending(null);
      selection = { record, allowDuplicateUnit: false, ready: false };
      const sameUnit = existing.filter(row => norm(row.unit_number) === norm(f.unit_number));
      if (sameUnit.length) {
        const label = document.createElement("label");
        label.innerHTML = '<input type="checkbox" id="fleetDifferentMachine"> I checked: this is a different machine using the same unit number.';
        label.querySelector("input").onchange = event => { if (selection?.record.id === id) { selection.allowDuplicateUnit = event.target.checked; save.disabled = !event.target.checked || !selection.ready; } };
        review.prepend(label);
        sameUnit.forEach(row => {
          const button = document.createElement("button"); button.type = "button";
          button.textContent = `Check Existing ${row.unit_number}`;
          button.onclick = () => window.openEquipment(row.id, row.site_id);
          review.prepend(button);
        });
      }
      status.textContent = "Details filled. Enter the current hours and review before saving. Source hours are shown below.";
      if (record.has_photo) {
        status.textContent = "Details filled. Loading fleet photo…";
        const { data: photo, error: photoError } = await db.from("fleet_reference_photos").select("photos").eq("reference_id", id).single();
        if (photoError) throw photoError;
        if (token !== generation || !form.isConnected) return;
        const p = photo.photos[0];
        const bytes = Uint8Array.from(atob(p.data_base64), c => c.charCodeAt(0));
        const type = p.media_type || "image/jpeg";
        window.equipmentPhotoWorkflow.setPending({blob:new Blob([bytes], {type}), type, ext:type === "image/png" ? "png" : "jpg"});
      }
      if (token !== generation) return;
      selection.ready = true;
      status.textContent = `${sameUnit.length ? "Unit number already exists — check the existing machine first. " : ""}Details ready. Review and enter current hours before saving.`;
      save.disabled = sameUnit.length > 0 && !selection.allowDuplicateUnit;
    } catch (error) {
      if (token !== generation || !form.isConnected) return;
      // Keep a failed selection unsavable so missing reference photos are not silently dropped.
      selection = null;
      message(status, error);
    }
  }

  const baseSave = window.saveEquipment;
  window.saveEquipment = async function (event, siteId) {
    if (!selection) {
      if (document.querySelector("#fleetSelect")?.value) {
        event.preventDefault();
        return;
      }
      return baseSave(event, siteId);
    }
    event.preventDefault();
    if (saving || !selection.ready) return;
    const selected = selection, form = document.querySelector("#equipmentForm"), status = document.querySelector("#equipmentFormMessage");
    const save = form.querySelector('[type="submit"]');
    const str = id => text(document.getElementById(id)?.value) || null;
    const num = id => str(id) === null ? null : Number(str(id));
    const year = num("equipmentYear"), capacity = num("equipmentOilCapacity"), oilUnit = str("equipmentOilCapacityUnit");
    if (year !== null && (!Number.isInteger(year) || year < 1900 || year > 2100)) { message(status, new Error("Enter a valid equipment year.")); return; }
    if (capacity !== null && !oilUnit) { message(status, new Error("Select an oil capacity unit.")); return; }
    if (!form.reportValidity()) return;
    saving = true; save.disabled = true;
    status.textContent = "Saving equipment…";
    try {
      const { data: rows, error: findError } = await db.from("equipment").select("id,site_id,unit_number,vin,serial_number,engine_serial_number,fleet_reference_id,archived");
      if (findError) throw findError;
    const matched = matching(selected.record, rows || []);
      if (matched.length) { await window.openEquipment(matched[0].id, matched[0].site_id); return; }
      if (!selected.allowDuplicateUnit && rows.some(r => norm(r.unit_number) === norm(str("equipmentUnitNumber")))) throw new Error("That unit number is already in the tracker. Check the existing machine first.");
      const accuracy = num("equipmentGpsAccuracy");
      const record = {
        site_id:siteId, fleet_reference_id:selected.record.id,
        unit_number:str("equipmentUnitNumber"), name:str("equipmentName"), make:str("equipmentMake"), model:str("equipmentModel"),
        serial_number:str("equipmentSerial"), engine_serial_number:str("equipmentEngineSerial"), vin:str("equipmentVin") || "N/A", year,
        ownership:str("equipmentOwnership"), status:str("equipmentStatus"), current_hours:num("equipmentHours"),
        operating_hours_per_day:num("equipmentHoursPerDay"), oil_type:str("equipmentOilType"), oil_capacity:capacity,
        oil_capacity_unit:capacity === null ? null : oilUnit, notes:str("equipmentNotes"),
        latitude:num("equipmentLatitude"), longitude:num("equipmentLongitude"), gps_accuracy_m:accuracy,
        gps_captured_at:accuracy === null ? null : new Date().toISOString(), gps_captured_by:accuracy === null ? null : currentUser.id,
        created_by:currentUser.id, updated_by:currentUser.id, archived:false
      };
      const pending = window.equipmentPhotoWorkflow?.getPending();
      const { data: saved, error } = await db.from("equipment").insert(record).select("id").single();
      if (error) throw error;
      if (pending) {
        try { await window.equipmentPhotoWorkflow.upload(saved.id, pending); }
        catch (photoError) { alert(`Equipment saved. Photo upload failed; the original is preserved in Fleet Reference. Choose a photo on the equipment page to retry. ${photoError.message}`); }
      }
      selection = null;
      await window.openEquipment(saved.id, siteId);
    } catch (error) { message(status, error); }
    finally { saving = false; if (form.isConnected) save.disabled = false; }
  };

  const baseOpen = window.openEquipment;
  window.openEquipment = async function (equipmentId, siteId) {
    generation++;
    selection = null;
    await baseOpen(equipmentId, siteId);
    const marker = document.querySelector("#equipmentBackSite");
    if (!marker) return;
    const { data: equipment } = await db.from("equipment").select("fleet_reference_id,photo_path").eq("id", equipmentId).single();
    if (!equipment?.fleet_reference_id || !marker.isConnected) return;
    const { data: record } = await db.from("fleet_reference").select("*").eq("id", equipment.fleet_reference_id).single();
    if (!record || !marker.isConnected) return;
    const panel = document.createElement("div"); panel.className = "inset-card"; panel.style.marginTop = "16px";
    panel.innerHTML = sourceHTML(record);
    if (record.has_photo && maintain() && !equipment.photo_path) {
      const button = document.createElement("button"); button.type = "button"; button.textContent = "Use Original Fleet Photo";
      const status = document.createElement("p"); status.setAttribute("role", "status");
      button.onclick = async () => {
        button.disabled = true;
        try {
          const { data: sourcePhoto, error } = await db.from("fleet_reference_photos").select("photos").eq("reference_id", record.id).single();
          if (error) throw error;
          const p = sourcePhoto.photos[0], type = p.media_type || "image/jpeg";
          const blob = new Blob([Uint8Array.from(atob(p.data_base64), c => c.charCodeAt(0))], {type});
          await window.equipmentPhotoWorkflow.upload(equipmentId, {blob, type, ext:type === "image/png" ? "png" : "jpg"});
          if (marker.isConnected) await window.openEquipment(equipmentId, siteId);
        } catch (error) { message(status, error); button.disabled = false; }
      };
      panel.append(button, status);
    }
    marker.closest("section.card")?.appendChild(panel);
  };

  // Pure mapping helpers also exercised by the regression test harness.
  window.fleetReferenceMapping = { fields, matching };
})();
