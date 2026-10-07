/* V3 flexible equipment expected-operation hours */
(function () {
  const FIELD_IDS = ["equipmentHoursPerDay", "editHoursPerDay"];

  function ensureSuggestions() {
    if (document.querySelector("#equipmentUsageSuggestions")) return;
    const list = document.createElement("datalist");
    list.id = "equipmentUsageSuggestions";
    ["0.5", "1", "2", "4", "8", "12", "24"].forEach(value => {
      const option = document.createElement("option");
      option.value = value;
      list.appendChild(option);
    });
    document.body.appendChild(list);
  }

  function relabel(label) {
    if (!label || label.dataset.usageLabelEnhanced === "1") return;
    label.dataset.usageLabelEnhanced = "1";

    for (const node of label.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
        node.textContent = "Expected Operation — Hours per Active Day\n";
        break;
      }
    }

    const note = document.createElement("small");
    note.className = "equipment-usage-help";
    note.style.display = "block";
    note.style.marginTop = "6px";
    note.textContent = "Average engine hours this machine runs on each active day. PM date estimates still follow the job site's 14/7, 20/10, or custom rotation.";
    label.appendChild(note);
  }

  function enhanceField(id) {
    const existing = document.querySelector(`#${id}`);
    if (!existing || existing.dataset.usageEnhanced === "1") return;

    ensureSuggestions();

    let input = existing;
    if (existing.tagName === "SELECT") {
      input = document.createElement("input");
      input.id = id;
      input.name = existing.name || "";
      input.value = existing.value || "";
      input.className = existing.className || "";
      existing.replaceWith(input);
    }

    input.type = "number";
    input.min = "0.1";
    input.max = "24";
    input.step = "0.1";
    input.placeholder = "Example: 1";
    input.setAttribute("list", "equipmentUsageSuggestions");
    input.setAttribute("inputmode", "decimal");
    input.dataset.usageEnhanced = "1";

    relabel(input.closest("label"));
  }

  function enhanceEquipmentDetails() {
    document.querySelectorAll(".inset-card.compact-card, .detail-item").forEach(card => {
      const label = card.querySelector("small");
      const value = card.querySelector("strong");
      if (!label || !value || label.textContent.trim() !== "Expected Operation") return;
      if (card.dataset.usageDisplayEnhanced === "1") return;

      card.dataset.usageDisplayEnhanced = "1";
      const match = value.textContent.match(/([0-9]+(?:\.[0-9]+)?)/);
      if (!match) return;

      const hours = Number(match[1]);
      const display = Number.isInteger(hours) ? String(hours) : String(hours).replace(/0+$/, "").replace(/\.$/, "");
      value.textContent = `${display} hr${hours === 1 ? "" : "s"} / active site day`;

      const note = document.createElement("small");
      note.style.display = "block";
      note.style.marginTop = "4px";
      note.textContent = "Used with the site's rotation for PM date estimates.";
      card.appendChild(note);
    });
  }

  function enhance() {
    FIELD_IDS.forEach(enhanceField);
    enhanceEquipmentDetails();
  }

  enhance();
  const observer = new MutationObserver(enhance);
  observer.observe(document.body, { childList: true, subtree: true });
})();
