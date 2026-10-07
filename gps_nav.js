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

  function mapsEmbedUrl(latitude, longitude) {
    const point = `${latitude},${longitude}`;
    return `https://maps.google.com/maps?q=${encodeURIComponent(point)}&z=16&t=k&output=embed`;
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

    if (!gpsBox || gpsBox.querySelector("#equipmentGpsMapPreview")) {
      return;
    }

    const details = document.createElement("div");
    details.style.flex = "1 1 260px";
    details.style.minWidth = "0";

    // Preserve the existing heading/coordinates rendered by the equipment page.
    while (gpsBox.firstChild) {
      details.appendChild(gpsBox.firstChild);
    }

    const navigateButton = document.createElement("button");
    navigateButton.id = "equipmentGpsNavigateInline";
    navigateButton.type = "button";
    navigateButton.textContent = "🧭 Navigate to Equipment";
    navigateButton.style.marginTop = "10px";
    navigateButton.addEventListener("click", () => {
      window.open(url, "_blank", "noopener");
    });
    details.appendChild(navigateButton);

    const mapFrame = document.createElement("iframe");
    mapFrame.id = "equipmentGpsMapPreview";
    mapFrame.title = "Saved equipment location on Google Maps";
    mapFrame.src = mapsEmbedUrl(machine.latitude, machine.longitude);
    mapFrame.loading = "lazy";
    mapFrame.referrerPolicy = "no-referrer-when-downgrade";
    mapFrame.setAttribute("allowfullscreen", "");
    mapFrame.style.width = "180px";
    mapFrame.style.height = "180px";
    mapFrame.style.maxWidth = "100%";
    mapFrame.style.border = "0";
    mapFrame.style.borderRadius = "10px";
    mapFrame.style.flex = "0 0 180px";
    mapFrame.style.background = "#dbe8f2";

    gpsBox.style.display = "flex";
    gpsBox.style.alignItems = "center";
    gpsBox.style.justifyContent = "space-between";
    gpsBox.style.gap = "16px";
    gpsBox.style.flexWrap = "wrap";
    gpsBox.appendChild(details);
    gpsBox.appendChild(mapFrame);
  };
})();
