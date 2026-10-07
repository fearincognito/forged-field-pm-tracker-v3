/* V3 oil-capacity units for equipment */
(function () {
  const UNIT_LABELS = {
    litres: "L",
    us_gallons: "US gal",
    us_quarts: "US qt"
  };

  let activeEquipmentId = null;
  let activeSiteId = null;

  const unitOptions = selected => `
    <option value="" ${!selected ? "selected" : ""}>Select unit</option>
    <option value="litres" ${selected === "litres" ? "selected" : ""}>Litres (L)</option>
    <option value="us_gallons" ${selected === "us_gallons" ? "selected" : ""}>US gallons (US gal)</option>
    <option value="us_quarts" ${selected === "us_quarts" ? "selected" : ""}>US quarts (US qt)</option>
  `;

  function injectAddUnitSelector() {
    const capacity = document.querySelector("#equipmentOilCapacity");
    if (!capacity || document.querySelector("#equipmentOilCapacityUnit")) return;

    const label = document.createElement("label");
    label.innerHTML = `Oil Capacity Unit
      <select id="equipmentOilCapacityUnit">${unitOptions("")}</select>`;
    capacity.closest("label")?.insertAdjacentElement("afterend", label);
  }

  const baseShowAddEquipmentForm = window.showAddEquipmentForm;
  if (typeof baseShowAddEquipmentForm === "function") {
    window.showAddEquipmentForm = function (siteId) {
      baseShowAddEquipmentForm(siteId);
      injectAddUnitSelector();
    };
  }

  const baseSaveEquipment = window.saveEquipment;
  if (typeof baseSaveEquipment === "function") {
    window.saveEquipment = async function (event, siteId) {
      const capacityRaw = document.querySelector("#equipmentOilCapacity")?.value ?? "";
      const unit = document.querySelector("#equipmentOilCapacityUnit")?.value || null;
      const message = document.querySelector("#equipmentFormMessage");

      if (capacityRaw !== "" && !unit) {
        event.preventDefault();
        if (message) message.innerHTML = '<span class="error-text">Select whether the oil capacity is litres, US gallons, or US quarts.</span>';
        return;
      }

      const startedAt = new Date(Date.now() - 2000).toISOString();
      const unitNumber = document.querySelector("#equipmentUnitNumber")?.value?.trim() || null;
      const name = document.querySelector("#equipmentName")?.value?.trim() || null;

      await baseSaveEquipment(event, siteId);

      let query = db.from("equipment")
        .select("id,created_at")
        .eq("site_id", siteId)
        .eq("created_by", currentUser.id)
        .gte("created_at", startedAt)
        .order("created_at", { ascending: false })
        .limit(1);

      if (unitNumber) query = query.eq("unit_number", unitNumber);
      else if (name) query = query.eq("name", name);

      const { data: rows, error: findError } = await query;
      if (findError || !rows?.length) return;

      const equipmentId = rows[0].id;
      const { error: unitError } = await db.from("equipment")
        .update({ oil_capacity_unit: capacityRaw === "" ? null : unit, updated_by: currentUser.id })
        .eq("id", equipmentId);

      if (unitError) {
        console.error("Oil capacity unit save error:", unitError);
        return;
      }

      if (document.querySelector("#equipmentBackSite")) {
        await window.openEquipment(equipmentId, siteId);
      }
    };
  }

  async function decorateOilCapacity(equipmentId) {
    const { data, error } = await db.from("equipment")
      .select("oil_capacity,oil_capacity_unit")
      .eq("id", equipmentId)
      .single();
    if (error || !data) return;

    const cards = Array.from(document.querySelectorAll(".inset-card.compact-card"));
    const oilCard = cards.find(card => card.querySelector("small")?.textContent?.trim() === "Oil Capacity");
    const strong = oilCard?.querySelector("strong");
    if (!strong) return;

    if (data.oil_capacity == null) {
      strong.textContent = "—";
      return;
    }

    const label = UNIT_LABELS[data.oil_capacity_unit];
    strong.textContent = label ? `${data.oil_capacity} ${label}` : `${data.oil_capacity} (unit not set)`;
  }

  const baseOpenEquipment = window.openEquipment;
  if (typeof baseOpenEquipment === "function") {
    window.openEquipment = async function (equipmentId, siteId) {
      activeEquipmentId = equipmentId;
      activeSiteId = siteId;
      await baseOpenEquipment(equipmentId, siteId);
      await decorateOilCapacity(equipmentId);
    };
  }

  async function injectEditUnitSelector() {
    const form = document.querySelector("#editEquipmentForm");
    const capacity = document.querySelector("#editOilCapacity");
    if (!form || !capacity || document.querySelector("#editOilCapacityUnit") || !activeEquipmentId) return;

    const { data } = await db.from("equipment")
      .select("oil_capacity_unit")
      .eq("id", activeEquipmentId)
      .single();

    if (!document.querySelector("#editEquipmentForm") || document.querySelector("#editOilCapacityUnit")) return;

    const label = document.createElement("label");
    label.innerHTML = `Oil Capacity Unit
      <select id="editOilCapacityUnit">${unitOptions(data?.oil_capacity_unit || "")}</select>`;
    capacity.closest("label")?.insertAdjacentElement("afterend", label);

    form.addEventListener("submit", event => {
      const capacityRaw = document.querySelector("#editOilCapacity")?.value ?? "";
      const unit = document.querySelector("#editOilCapacityUnit")?.value || null;
      const message = document.querySelector("#editEquipmentMessage");

      if (capacityRaw !== "" && !unit) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (message) message.innerHTML = '<span class="error-text">Select whether the oil capacity is litres, US gallons, or US quarts.</span>';
        return;
      }

      db.from("equipment")
        .update({ oil_capacity_unit: capacityRaw === "" ? null : unit, updated_by: currentUser.id })
        .eq("id", activeEquipmentId)
        .then(({ error }) => {
          if (error) console.error("Oil capacity unit edit error:", error);
        });
    }, true);
  }

  const observer = new MutationObserver(() => {
    if (document.querySelector("#equipmentForm")) injectAddUnitSelector();
    if (document.querySelector("#editEquipmentForm")) injectEditUnitSelector();
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();
