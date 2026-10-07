/* Prefill work-ticket completion hours from the equipment's latest saved meter. */
(function () {
  const baseOpenWorkTicket = window.openWorkTicket;
  if (typeof baseOpenWorkTicket !== "function") {
    console.error("ticket_hours_prefill.js loaded before work_tickets.js");
    return;
  }

  let currentEquipmentHours = null;

  function applyHoursPrefill() {
    const input = document.querySelector("#ticketCompletedHours");
    if (!input || currentEquipmentHours === null || currentEquipmentHours === undefined) return;

    // Only prefill an empty field so the mechanic can always type a different reading over it.
    if (input.value === "") input.value = String(currentEquipmentHours);

    const label = input.closest("label");
    if (label && !label.querySelector(".hours-prefill-note")) {
      const note = document.createElement("small");
      note.className = "hours-prefill-note";
      note.style.display = "block";
      note.style.marginTop = "6px";
      note.textContent = "Pre-filled from the latest saved equipment hours. Edit this reading if the meter is different.";
      label.appendChild(note);
    }
  }

  window.openWorkTicket = async function (ticketId, siteId, assetFilter = null) {
    currentEquipmentHours = null;

    // Load the ticket's equipment and current meter before rendering the ticket page.
    const { data: ticket } = await db
      .from("work_tickets")
      .select("equipment_id")
      .eq("id", ticketId)
      .single();

    if (ticket?.equipment_id) {
      const { data: equipment } = await db
        .from("equipment")
        .select("current_hours")
        .eq("id", ticket.equipment_id)
        .single();
      if (equipment?.current_hours !== null && equipment?.current_hours !== undefined) {
        currentEquipmentHours = equipment.current_hours;
      }
    }

    await baseOpenWorkTicket(ticketId, siteId, assetFilter);
    applyHoursPrefill();
  };

  // The completion form is inserted after the user clicks Complete Ticket.
  // Watch for that form and prefill the meter as soon as it appears.
  const observer = new MutationObserver(() => applyHoursPrefill());
  observer.observe(document.body, { childList: true, subtree: true });
})();
