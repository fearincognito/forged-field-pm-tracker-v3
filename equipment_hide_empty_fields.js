/* Hide empty equipment detail fields while keeping all fields available in Add/Edit forms. */
(function () {
  const baseOpenEquipment = window.openEquipment;
  if (typeof baseOpenEquipment !== "function") return;

  const DETAIL_LABELS = new Set([
    "Make / Model",
    "Current Hours",
    "Ownership",
    "Status",
    "Equipment Serial",
    "Engine Serial",
    "VIN",
    "Expected Operation",
    "Oil Type",
    "Oil Capacity",
    "Equipment Year"
  ]);

  const EMPTY_TEXT = new Set([
    "",
    "—",
    "-",
    "not entered",
    "not set",
    "n/a",
    "na",
    "null",
    "undefined"
  ]);

  function hideEmptyEquipmentFields() {
    if (!document.querySelector("#equipmentBackSite")) return;

    document.querySelectorAll(".inset-card.compact-card").forEach(card => {
      const label = card.querySelector("small")?.textContent?.trim() || "";
      if (!DETAIL_LABELS.has(label)) return;

      const value = card.querySelector("strong")?.textContent?.trim() || "";
      const normalized = value.toLowerCase();
      card.style.display = EMPTY_TEXT.has(normalized) ? "none" : "";
    });
  }

  window.openEquipment = async function (equipmentId, siteId) {
    await baseOpenEquipment(equipmentId, siteId);
    hideEmptyEquipmentFields();
  };
})();
