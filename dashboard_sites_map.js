/* Dashboard map showing all accessible active job sites with saved GPS coordinates. */
(function () {
  let dashboardMap = null;
  let leafletPromise = null;
  const layerPreferenceKey = "forged-dashboard-map-layer";

  function installStyles() {
    if (document.querySelector("#dashboardSitesMapStyles")) return;
    const style = document.createElement("style");
    style.id = "dashboardSitesMapStyles";
    style.textContent = `
      .dashboard-sites-map-card{grid-column:1/-1;padding:18px;}
      .dashboard-sites-map-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:10px;}
      .dashboard-sites-map-heading h3{margin:0;}
      .dashboard-sites-map-heading small{display:block;margin-top:3px;color:#667785;}
      .dashboard-sites-map-legend{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:11px;color:#5f6f7b;}
      .dashboard-sites-map-legend span{display:inline-flex;align-items:center;gap:4px;white-space:nowrap;}
      .dashboard-sites-map-dot{width:9px;height:9px;border-radius:50%;display:inline-block;}
      .dashboard-sites-map-dot.drilling{background:#2f8a4c;}
      .dashboard-sites-map-dot.shutdown{background:#c4473c;}
      .dashboard-sites-map-dot.other{background:#2b6f9d;}
      #dashboardSitesMap{height:340px;width:100%;border-radius:12px;border:1px solid #d6e0e7;overflow:hidden;background:#eef2f4;}
      .dashboard-sites-map-status{padding:16px;border:1px dashed #c9d5dd;border-radius:10px;background:#f8fafb;color:#667785;text-align:center;}
      .dashboard-sites-map-note{margin:8px 0 0;font-size:11px;color:#667785;}
      .site-map-pin{width:22px;height:22px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.35);}
      .site-map-pin.drilling{background:#2f8a4c;}
      .site-map-pin.shutdown{background:#c4473c;}
      .site-map-pin.other{background:#2b6f9d;}
      .site-map-popup strong{font-size:14px;}
      .site-map-popup-status{margin:4px 0 8px;font-size:12px;}
      .site-map-popup-actions{display:flex;gap:6px;flex-wrap:wrap;}
      .site-map-popup-actions button,.site-map-popup-actions a{display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:7px;padding:7px 9px;background:#2b6f9d;color:#fff;text-decoration:none;font:inherit;font-size:12px;font-weight:700;cursor:pointer;}
      .dashboard-sites-map-card .leaflet-control-layers{border-radius:8px;box-shadow:0 1px 5px rgba(0,0,0,.28);}
      .dashboard-sites-map-card .leaflet-control-layers-expanded{padding:7px 9px;font-size:12px;}
      @media(max-width:650px){
        .dashboard-sites-map-card{padding:14px;}
        #dashboardSitesMap{height:265px;}
        .dashboard-sites-map-heading{margin-bottom:8px;}
      }
    `;
    document.head.appendChild(style);
  }

  function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (leafletPromise) return leafletPromise;

    leafletPromise = new Promise((resolve, reject) => {
      if (!document.querySelector('link[data-forged-leaflet]')) {
        const css = document.createElement("link");
        css.rel = "stylesheet";
        css.href = "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css";
        css.dataset.forgedLeaflet = "true";
        document.head.appendChild(css);
      }

      const existing = document.querySelector('script[data-forged-leaflet]');
      if (existing) {
        existing.addEventListener("load", () => resolve(window.L), { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js";
      script.dataset.forgedLeaflet = "true";
      script.onload = () => resolve(window.L);
      script.onerror = () => reject(new Error("Map library could not be loaded."));
      document.head.appendChild(script);
    });

    return leafletPromise;
  }

  function rotationDays(site) {
    if (site.rotation_type === "14_7") return { on: 14, off: 7 };
    if (site.rotation_type === "20_10") return { on: 20, off: 10 };
    if (site.rotation_type === "custom") {
      const on = Number(site.rotation_on_days);
      const off = Number(site.rotation_off_days);
      if (on > 0 && off > 0) return { on, off };
    }
    return null;
  }

  function siteState(site) {
    const rotation = rotationDays(site);
    const match = String(site.rotation_anchor_date || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!rotation || !match) return { key: "other", label: "Rotation not set" };

    const anchor = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    const now = new Date();
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDays = Math.round((today - anchor) / 86400000);
    const cycle = rotation.on + rotation.off;
    const phase = ((diffDays % cycle) + cycle) % cycle;
    return phase < rotation.on
      ? { key: "drilling", label: "Drilling" }
      : { key: "shutdown", label: "Shut Down" };
  }

  function pinIcon(L, state) {
    return L.divIcon({
      className: "",
      html: `<div class="site-map-pin ${state}"></div>`,
      iconSize: [26, 30],
      iconAnchor: [13, 28],
      popupAnchor: [0, -25]
    });
  }

  function inwardTooltipDirection(map, marker) {
    const point = map.latLngToContainerPoint(marker.getLatLng());
    const size = map.getSize();
    const edgeX = Math.max(80, Math.min(140, size.x * 0.24));
    const edgeY = Math.max(50, Math.min(90, size.y * 0.22));

    if (point.x < edgeX) return "right";
    if (point.x > size.x - edgeX) return "left";
    if (point.y < edgeY) return "bottom";
    return "top";
  }

  async function renderMapCard() {
    const grid = appView?.querySelector(".grid");
    if (!grid || document.querySelector("#dashboardSitesMapCard")) return;

    const card = document.createElement("section");
    card.id = "dashboardSitesMapCard";
    card.className = "card dashboard-sites-map-card";
    card.innerHTML = `
      <div class="dashboard-sites-map-heading">
        <div>
          <h3>Job Sites Map</h3>
          <small>Active sites with saved GPS locations</small>
        </div>
        <div class="dashboard-sites-map-legend">
          <span><i class="dashboard-sites-map-dot drilling"></i>Drilling</span>
          <span><i class="dashboard-sites-map-dot shutdown"></i>Shut Down</span>
          <span><i class="dashboard-sites-map-dot other"></i>No rotation</span>
        </div>
      </div>
      <div id="dashboardSitesMapStatus" class="dashboard-sites-map-status">Loading site map…</div>`;

    const scheduleCard = document.querySelector("#mechanicsScheduleCard");
    if (scheduleCard && scheduleCard.parentElement === grid) grid.insertBefore(card, scheduleCard.nextSibling);
    else grid.appendChild(card);

    const { data: sites, error } = await db
      .from("sites")
      .select("id,name,latitude,longitude,rotation_type,rotation_on_days,rotation_off_days,rotation_anchor_date,archived")
      .eq("archived", false)
      .order("name");

    if (!document.querySelector("#dashboardSitesMapCard") || card !== document.querySelector("#dashboardSitesMapCard")) return;

    const status = card.querySelector("#dashboardSitesMapStatus");
    if (error) {
      console.warn("Dashboard sites map lookup error:", error);
      status.textContent = "Site map could not be loaded.";
      return;
    }

    const rows = sites || [];
    const mapped = rows.filter(site => Number.isFinite(Number(site.latitude)) && Number.isFinite(Number(site.longitude)));
    const missing = rows.length - mapped.length;

    if (!mapped.length) {
      status.textContent = "No active sites have saved GPS coordinates yet.";
      return;
    }

    status.outerHTML = `<div id="dashboardSitesMap" aria-label="Active job sites map"></div>${missing ? `<p class="dashboard-sites-map-note">${missing} active site${missing === 1 ? " does" : "s do"} not have GPS saved yet.</p>` : ""}`;

    try {
      const L = await loadLeaflet();
      const host = document.querySelector("#dashboardSitesMap");
      if (!host || !L) return;

      if (dashboardMap) {
        try { dashboardMap.remove(); } catch (_) {}
        dashboardMap = null;
      }

      dashboardMap = L.map(host, { scrollWheelZoom: false, tap: true });

      const streetLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors"
      });
      const satelliteLayer = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        maxZoom: 19,
        attribution: "Tiles &copy; Esri"
      });

      let preferredLayer = "Street";
      try {
        const saved = localStorage.getItem(layerPreferenceKey);
        if (saved === "Satellite") preferredLayer = saved;
      } catch (_) {}

      if (preferredLayer === "Satellite") satelliteLayer.addTo(dashboardMap);
      else streetLayer.addTo(dashboardMap);

      L.control.layers(
        { Street: streetLayer, Satellite: satelliteLayer },
        null,
        { position: "topright", collapsed: window.matchMedia("(max-width:650px)").matches }
      ).addTo(dashboardMap);

      dashboardMap.on("baselayerchange", event => {
        try { localStorage.setItem(layerPreferenceKey, event.name); } catch (_) {}
      });

      const bounds = [];
      mapped.forEach(site => {
        const lat = Number(site.latitude);
        const lng = Number(site.longitude);
        const state = siteState(site);
        bounds.push([lat, lng]);

        const googleUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
        const popup = `
          <div class="site-map-popup">
            <strong>${escapeHtml(site.name)}</strong>
            <div class="site-map-popup-status">${escapeHtml(state.label)}</div>
            <div class="site-map-popup-actions">
              <button type="button" onclick="openSite('${escapeHtml(site.id)}')">Open Site</button>
              <a href="${googleUrl}" target="_blank" rel="noopener">Google Maps</a>
            </div>
          </div>`;

        const marker = L.marker([lat, lng], { icon: pinIcon(L, state.key), title: site.name })
          .addTo(dashboardMap)
          .bindTooltip(site.name, { direction: "top", offset: [0, -22], opacity: 0.95 })
          .bindPopup(popup, { autoPan: true, keepInView: true, autoPanPadding: [24, 24] });

        marker.on("mouseover", () => {
          const tooltip = marker.getTooltip();
          if (!tooltip) return;
          tooltip.options.direction = inwardTooltipDirection(dashboardMap, marker);
          const direction = tooltip.options.direction;
          tooltip.options.offset = direction === "left" ? [-14, -10]
            : direction === "right" ? [14, -10]
            : direction === "bottom" ? [0, 10]
            : [0, -22];
          marker.openTooltip();
        });
      });

      if (bounds.length === 1) dashboardMap.setView(bounds[0], 10);
      else dashboardMap.fitBounds(bounds, { padding: [52, 52], maxZoom: 11 });

      setTimeout(() => dashboardMap?.invalidateSize(), 100);
    } catch (mapError) {
      console.warn("Dashboard map load error:", mapError);
      const host = document.querySelector("#dashboardSitesMap");
      if (host) host.outerHTML = '<div class="dashboard-sites-map-status">Map tiles could not be loaded. Site GPS data is still saved.</div>';
    }
  }

  installStyles();

  const baseRenderDashboard = window.renderDashboard;
  if (typeof baseRenderDashboard === "function") {
    window.renderDashboard = function () {
      const result = baseRenderDashboard.apply(this, arguments);
      setTimeout(renderMapCard, 0);
      return result;
    };
  }

  setTimeout(renderMapCard, 0);
})();
