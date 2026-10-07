/* Make saved equipment GPS coordinates directly actionable. */

(function () {
  const baseOpenEquipment = window.openEquipment;

  if (typeof baseOpenEquipment !== "function") {
    console.error("gps_nav.js loaded before equipment page scripts");
    return;
  }

  function mapsUrl(latitude, longitude) {
    const destination = `${latitude},${longitude}`;
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
  }

  window.openEquipment = async function (equipmentId, siteId) {
    await baseOpenEquipment(equipmentId, siteId);

    const { data: machine, error } = await db
      .from("equipment")
      .select("latitude,longitude,gps_accuracy_m")
      .eq("id", equipmentId)
      .single();

    if (error || !machine || machine.latitude == null || machine.longitude == null) {
      return;
    }

    const url = mapsUrl(machine.latitude, machine.longitude);

    // Keep a clear navigation action in the equipment header even if another
    // equipment-page module did not render one for some reason.
    const headerBackButton = document.querySelector("#equipmentBackSite");
    const headerActions = headerBackButton?.parentElement;
    if (headerActions && !document.querySelector("#equipmentNavigate")) {
      const headerNavigate = document.createElement("button");
      headerNavigate.id = "equipmentNavigate";
      headerNavigate.type = "button";
      headerNavigate.textContent = "Navigate";
      headerNavigate.addEventListener("click", () => {
        window.open(url, "_blank", "noopener");
      });
      headerActions.appendChild(headerNavigate);
    }

    // Make the saved GPS section itself useful instead of displaying dead text.
    const locationBoxes = Array.from(document.querySelectorAll(".location-box"));
    const gpsBox = locationBoxes.find(box => {
      const heading = box.querySelector("strong")?.textContent?.trim().toLowerCase();
      return heading === "saved gps location" || heading === "gps location";
    });

    if (!gpsBox || gpsBox.querySelector("#equipmentGpsNavigateInline")) {
      return;
    }

    const navigateButton = document.createElement("button");
    navigateButton.id = "equipmentGpsNavigateInline";
    navigateButton.type = "button";
    navigateButton.textContent = "🧭 Navigate to Equipment";
    navigateButton.style.marginTop = "10px";
    navigateButton.addEventListener("click", () => {
      window.open(url, "_blank", "noopener");
    });

    gpsBox.appendChild(navigateButton);
  };
})();
