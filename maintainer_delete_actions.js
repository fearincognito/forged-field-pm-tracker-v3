/* V3 delete actions for Owner/Admin/Mechanic operational roles */
(function () {
  const canMaintain = () => currentProfile && ["owner", "admin", "mechanic"].includes(currentProfile.role);

  const baseShowSiteInventory = window.showSiteInventory;
  if (typeof baseShowSiteInventory === "function") {
    window.showSiteInventory = async function (siteId) {
      await baseShowSiteInventory(siteId);
      if (!canMaintain()) return;

      document.querySelectorAll(".editInventoryItem").forEach(editButton => {
        if (editButton.parentElement?.querySelector(`.deleteInventoryItem[data-id="${editButton.dataset.id}"]`)) return;
        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "secondary-button deleteInventoryItem";
        deleteButton.dataset.id = editButton.dataset.id;
        deleteButton.textContent = "Delete";
        deleteButton.style.marginLeft = "8px";
        deleteButton.addEventListener("click", async () => {
          if (!window.confirm("Delete this inventory item? This permanently removes the inventory record.")) return;
          deleteButton.disabled = true;
          deleteButton.textContent = "Deleting...";
          const { error } = await db.from("site_inventory").delete().eq("id", deleteButton.dataset.id);
          if (error) {
            alert(`Could not delete inventory item: ${error.message}`);
            deleteButton.disabled = false;
            deleteButton.textContent = "Delete";
            return;
          }
          await window.showSiteInventory(siteId);
        });
        editButton.insertAdjacentElement("afterend", deleteButton);
      });
    };
  }

  const baseOpenWorkTicket = window.openWorkTicket;
  if (typeof baseOpenWorkTicket === "function") {
    window.openWorkTicket = async function (ticketId, siteId, assetFilter = null) {
      await baseOpenWorkTicket(ticketId, siteId, assetFilter);
      if (!canMaintain() || document.querySelector("#deleteWorkTicketButton")) return;

      const backButton = document.querySelector("#ticketDetailBack");
      if (!backButton) return;

      const deleteButton = document.createElement("button");
      deleteButton.id = "deleteWorkTicketButton";
      deleteButton.type = "button";
      deleteButton.className = "secondary-button";
      deleteButton.textContent = "Delete Ticket";
      deleteButton.addEventListener("click", async () => {
        if (!window.confirm("Delete this work ticket? This permanently removes the ticket and its comments.")) return;
        deleteButton.disabled = true;
        deleteButton.textContent = "Deleting...";
        const { error } = await db.from("work_tickets").delete().eq("id", ticketId);
        if (error) {
          alert(`Could not delete work ticket: ${error.message}`);
          deleteButton.disabled = false;
          deleteButton.textContent = "Delete Ticket";
          return;
        }

        if (assetFilter?.type === "dashboard" && typeof window.showDashboardTickets === "function") {
          await window.showDashboardTickets();
        } else if ((assetFilter?.type === "equipment" || assetFilter?.type === "site_item") && typeof window.showAssetTickets === "function") {
          await window.showAssetTickets(siteId, assetFilter.type, assetFilter.id);
        } else if (typeof window.showSiteTickets === "function") {
          await window.showSiteTickets(siteId);
        } else if (typeof window.openSite === "function") {
          await window.openSite(siteId);
        }
      });

      backButton.insertAdjacentElement("afterend", deleteButton);
    };
  }
})();
