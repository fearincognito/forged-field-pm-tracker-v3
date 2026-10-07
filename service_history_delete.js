/* Owner-only service history deletion with PM schedule rollback */
(function () {
  const baseOpenEquipment = window.openEquipment;

  if (typeof baseOpenEquipment !== "function") {
    console.error("service_history_delete.js loaded before equipment workflow");
    return;
  }

  function numbersEqual(a, b) {
    if (a === null || a === undefined || b === null || b === undefined) return false;
    const x = Number(a);
    const y = Number(b);
    return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) < 0.000001;
  }

  async function rollbackScheduleIfNeeded(record) {
    if (!record.pm_schedule_id) return { rolledBack: false };

    const { data: schedule, error: scheduleError } = await db
      .from("pm_schedules")
      .select("id,interval_hours,last_service_hours,next_due_hours")
      .eq("id", record.pm_schedule_id)
      .single();

    if (scheduleError || !schedule) {
      console.warn("Could not inspect PM schedule before service deletion:", scheduleError);
      return { rolledBack: false, warning: "The service record was deleted, but the linked PM schedule could not be checked." };
    }

    // Only roll back when the deleted record is the one currently driving the schedule.
    if (!numbersEqual(schedule.last_service_hours, record.service_hours)) {
      return { rolledBack: false };
    }

    const { data: previousRecords, error: previousError } = await db
      .from("service_history")
      .select("id,service_hours,service_date,created_at")
      .eq("pm_schedule_id", record.pm_schedule_id)
      .order("service_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1);

    if (previousError) {
      console.warn("Could not find previous PM service after deletion:", previousError);
      return { rolledBack: false, warning: "The service record was deleted, but the linked PM schedule could not be recalculated." };
    }

    const interval = schedule.interval_hours == null ? null : Number(schedule.interval_hours);
    let lastService = null;
    let nextDue = null;

    if (previousRecords && previousRecords.length && previousRecords[0].service_hours != null) {
      lastService = Number(previousRecords[0].service_hours);
      nextDue = interval != null && Number.isFinite(interval) ? lastService + interval : null;
    } else if (record.scheduled_due_hours != null && interval != null && Number.isFinite(interval)) {
      // The deleted record stored the due hour it was completing. Reconstruct the
      // schedule state that existed immediately before that service was recorded.
      nextDue = Number(record.scheduled_due_hours);
      lastService = nextDue - interval;
    } else {
      return {
        rolledBack: false,
        warning: "The service record was deleted. Check the linked PM schedule because there was not enough history to automatically restore its previous due hours."
      };
    }

    const { error: updateError } = await db
      .from("pm_schedules")
      .update({
        last_service_hours: lastService,
        next_due_hours: nextDue,
        updated_by: currentUser.id
      })
      .eq("id", record.pm_schedule_id);

    if (updateError) {
      console.warn("PM schedule rollback failed after service deletion:", updateError);
      return { rolledBack: false, warning: "The service record was deleted, but the linked PM schedule could not be rolled back automatically." };
    }

    return { rolledBack: true };
  }

  async function deleteServiceRecord(record, equipmentId, siteId, button) {
    const detail = `${record.service_name || "Service"} — ${record.service_date || "no date"}${record.service_hours != null ? ` at ${record.service_hours} hrs` : ""}`;
    const confirmed = window.confirm(
      `Delete this service history record?\n\n${detail}\n\nThis cannot be undone. If this record currently controls a PM schedule, the tracker will try to restore the previous due hours.`
    );
    if (!confirmed) return;

    button.disabled = true;
    const originalText = button.textContent;
    button.textContent = "Deleting...";

    // Read the schedule before deleting so we know whether this history row is the
    // current service that advanced the PM schedule.
    let linkedSchedule = null;
    if (record.pm_schedule_id) {
      const { data } = await db
        .from("pm_schedules")
        .select("id,interval_hours,last_service_hours,next_due_hours")
        .eq("id", record.pm_schedule_id)
        .single();
      linkedSchedule = data || null;
    }

    const { error: deleteError } = await db
      .from("service_history")
      .delete()
      .eq("id", record.id);

    if (deleteError) {
      console.error("Service history delete error:", deleteError);
      window.alert(`Service history could not be deleted: ${deleteError.message}`);
      button.disabled = false;
      button.textContent = originalText;
      return;
    }

    let rollbackResult = { rolledBack: false };
    if (linkedSchedule && numbersEqual(linkedSchedule.last_service_hours, record.service_hours)) {
      rollbackResult = await rollbackScheduleIfNeeded(record);
    }

    if (rollbackResult.warning) window.alert(rollbackResult.warning);
    await window.openEquipment(equipmentId, siteId);
  }

  async function addOwnerDeleteButtons(equipmentId, siteId) {
    if (!currentProfile || currentProfile.role !== "owner") return;

    const serviceHeading = Array.from(document.querySelectorAll("h3"))
      .find(el => el.textContent.trim() === "Service History");
    if (!serviceHeading) return;

    const historyContainer = serviceHeading.closest(".section-heading")?.nextElementSibling;
    if (!historyContainer) return;

    const cards = Array.from(historyContainer.querySelectorAll("article.inset-card"));
    if (!cards.length) return;

    const { data: history, error } = await db
      .from("service_history")
      .select("id,pm_schedule_id,service_name,service_hours,scheduled_due_hours,service_date,notes,parts_used,created_at")
      .eq("equipment_id", equipmentId)
      .order("service_date", { ascending: false })
      .limit(25);

    if (error || !history?.length) {
      if (error) console.warn("Could not load service history delete controls:", error);
      return;
    }

    cards.forEach((card, index) => {
      const record = history[index];
      if (!record || card.querySelector(".owner-service-delete")) return;

      const actions = document.createElement("div");
      actions.className = "form-actions compact-actions";
      actions.style.marginTop = "10px";

      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary-button owner-service-delete";
      button.textContent = "Delete Service Record";
      button.addEventListener("click", () => deleteServiceRecord(record, equipmentId, siteId, button));

      actions.appendChild(button);
      card.appendChild(actions);
    });
  }

  window.openEquipment = async function (equipmentId, siteId) {
    await baseOpenEquipment(equipmentId, siteId);
    await addOwnerDeleteButtons(equipmentId, siteId);
  };
})();
