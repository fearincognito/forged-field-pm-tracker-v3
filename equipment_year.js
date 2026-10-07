/* V3 equipment model/manufacture year field */
(function () {
  let activeEquipmentId = null;

  function yearValueOrNull(id) {
    const raw = document.querySelector(`#${id}`)?.value ?? "";
    if (raw === "") return null;
    const year = Number(raw);
    return Number.isInteger(year) ? year : NaN;
  }

  function validYear(year) {
    return year === null || (Number.isInteger(year) && year >= 1900 && year <= 2100);
  }

  function injectAddYearField() {
    const model = document.querySelector("#equipmentModel");
    if (!model || document.querySelector("#equipmentYear")) return;

    const label = document.createElement("label");
    label.innerHTML = `Equipment Year
      <input id="equipmentYear" type="number" min="1900" max="2100" step="1" inputmode="numeric" placeholder="Example: 2018">`;
    model.closest("label")?.insertAdjacentElement("afterend", label);
  }

  const baseShowAddEquipmentForm = window.showAddEquipmentForm;
  if (typeof baseShowAddEquipmentForm === "function") {
    window.showAddEquipmentForm = function (siteId) {
      baseShowAddEquipmentForm(siteId);
      injectAddYearField();
    };
  }

  const baseSaveEquipment = window.saveEquipment;
  if (typeof baseSaveEquipment === "function") {
    window.saveEquipment = async function (event, siteId) {
      const year = yearValueOrNull("equipmentYear");
      const message = document.querySelector("#equipmentFormMessage");

      if (!validYear(year)) {
        event.preventDefault();
        if (message) message.innerHTML = '<span class="error-text">Enter a valid equipment year between 1900 and 2100.</span>';
        return;
      }

      const startedAt = new Date(Date.now() - 2500).toISOString();
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
      const { error: yearError } = await db.from("equipment")
        .update({ year, updated_by: currentUser.id })
        .eq("id", equipmentId);

      if (yearError) {
        console.error("Equipment year save error:", yearError);
        return;
      }

      if (document.querySelector("#equipmentBackSite")) {
        await decorateEquipmentYear(equipmentId);
      }
    };
  }

  async function decorateEquipmentYear(equipmentId) {
    const { data, error } = await db.from("equipment")
      .select("year")
      .eq("id", equipmentId)
      .single();
    if (error || !document.querySelector("#equipmentBackSite")) return;

    const cards = Array.from(document.querySelectorAll(".inset-card.compact-card"));
    const makeModelCard = cards.find(card => card.querySelector("small")?.textContent?.trim() === "Make / Model");
    if (!makeModelCard) return;

    let yearCard = cards.find(card => card.querySelector("small")?.textContent?.trim() === "Equipment Year");
    if (!yearCard) {
      yearCard = document.createElement("div");
      yearCard.className = "inset-card compact-card";
      yearCard.innerHTML = `<small>Equipment Year</small><br><strong>—</strong>`;
      makeModelCard.insertAdjacentElement("afterend", yearCard);
    }

    const strong = yearCard.querySelector("strong");
    if (strong) strong.textContent = data?.year ?? "—";
  }

  const baseOpenEquipment = window.openEquipment;
  if (typeof baseOpenEquipment === "function") {
    window.openEquipment = async function (equipmentId, siteId) {
      activeEquipmentId = equipmentId;
      await baseOpenEquipment(equipmentId, siteId);
      await decorateEquipmentYear(equipmentId);
    };
  }

  async function injectEditYearField() {
    const form = document.querySelector("#editEquipmentForm");
    const model = document.querySelector("#editModel");
    if (!form || !model || document.querySelector("#editEquipmentYear") || !activeEquipmentId) return;

    const { data, error } = await db.from("equipment")
      .select("year")
      .eq("id", activeEquipmentId)
      .single();
    if (error || !document.querySelector("#editEquipmentForm") || document.querySelector("#editEquipmentYear")) return;

    const label = document.createElement("label");
    label.innerHTML = `Equipment Year
      <input id="editEquipmentYear" type="number" min="1900" max="2100" step="1" inputmode="numeric" placeholder="Example: 2018" value="${data?.year ?? ""}">`;
    model.closest("label")?.insertAdjacentElement("afterend", label);

    form.addEventListener("submit", event => {
      const year = yearValueOrNull("editEquipmentYear");
      const message = document.querySelector("#editEquipmentMessage");

      if (!validYear(year)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (message) message.innerHTML = '<span class="error-text">Enter a valid equipment year between 1900 and 2100.</span>';
        return;
      }

      db.from("equipment")
        .update({ year, updated_by: currentUser.id })
        .eq("id", activeEquipmentId)
        .then(({ error: updateError }) => {
          if (updateError) {
            console.error("Equipment year edit error:", updateError);
            return;
          }
          if (document.querySelector("#equipmentBackSite")) decorateEquipmentYear(activeEquipmentId);
        });
    }, true);
  }

  const observer = new MutationObserver(() => {
    if (document.querySelector("#equipmentForm")) injectAddYearField();
    if (document.querySelector("#editEquipmentForm")) injectEditYearField();
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();
