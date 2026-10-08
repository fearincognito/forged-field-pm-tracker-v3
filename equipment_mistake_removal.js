/* Discard accidentally added equipment; immutable fleet snapshots stay intact. */
(function () {
  const baseOpen = window.openEquipment;
  const canMaintain = () => currentProfile && ["owner", "admin", "mechanic"].includes(currentProfile.role);
  window.openEquipment = async function (equipmentId, siteId) {
    await baseOpen(equipmentId, siteId);
    if (!canMaintain()) return;
    const back = document.querySelector("#equipmentBackSite");
    if (!back || document.querySelector("#removeMistakenEquipment")) return;
    const [{data: machine, error}, history, tickets] = await Promise.all([
      db.from("equipment").select("id,unit_number,name,photo_path").eq("id", equipmentId).single(),
      db.from("service_history").select("id").eq("equipment_id", equipmentId).limit(1),
      db.from("work_tickets").select("id").eq("equipment_id", equipmentId).limit(1)
    ]);
    if (!back.isConnected || error || !machine || history.error || tickets.error) return;
    const panel = document.createElement("div");
    panel.className = "inset-card";
    panel.style.marginTop = "18px";
    const button = document.createElement("button");
    button.id = "removeMistakenEquipment";
    button.type = "button";
    button.className = "secondary-button";
    button.textContent = "Remove Added by Mistake";
    const note = document.createElement("p");
    note.textContent = "Discard this equipment record and its entered values. The original fleet reference stays available.";
    const status = document.createElement("p");
    status.setAttribute("role", "status");
    if (history.data?.length || tickets.data?.length) {
      button.disabled = true;
      note.textContent = "This equipment has service history or work tickets. Use Move Equipment or Archive Equipment to preserve its records.";
    }
    let removed = false;
    button.onclick = async () => {
      if (!removed && !window.confirm(`Remove ${machine.unit_number || machine.name} added by mistake?\n\nThis permanently discards its entered hours, notes, equipment setup, filters/PM schedules and copied photo. The original fleet reference remains available. Equipment with service history or work tickets cannot be removed.`)) return;
      button.disabled = true;
      status.textContent = removed ? "Cleaning up photo…" : "Removing equipment…";
      try {
        if (!removed) {
          const {data: rows, error: deleteError} = await db.from("equipment").delete().eq("id", equipmentId).select("id");
          if (deleteError) throw deleteError;
          if (!rows?.length) throw new Error("Equipment was not removed. Refresh the page and check your access.");
          removed = true;
        }
        if (machine.photo_path) {
          const {error: photoError} = await db.storage.from("equipment-photos").remove([machine.photo_path]);
          if (photoError) throw new Error(`Equipment and entered values were discarded. Photo cleanup failed: ${photoError.message}. Tap Retry Photo Cleanup.`);
        }
        await window.openSite(siteId);
      } catch (error) {
        status.textContent = error.code === "23503" ? "This equipment now has service history or work tickets. Use Move Equipment or Archive Equipment instead." : error.message;
        status.className = "error-text";
        button.textContent = removed ? "Retry Photo Cleanup" : "Remove Added by Mistake";
        button.disabled = false;
      }
    };
    panel.append(button, note, status);
    back.closest("section.card")?.appendChild(panel);
  };
})();
