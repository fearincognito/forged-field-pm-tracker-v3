/* Compact equipment detail photo: thumbnail beside the equipment name with full-size lightbox. */
(function () {
  const baseOpenEquipment = window.openEquipment;
  if (typeof baseOpenEquipment !== "function") return;

  function installStyles() {
    if (document.querySelector("#equipmentPhotoLayoutStyles")) return;
    const style = document.createElement("style");
    style.id = "equipmentPhotoLayoutStyles";
    style.textContent = `
      .equipment-heading-with-photo{
        display:flex !important;
        align-items:flex-start !important;
        justify-content:flex-start !important;
        gap:14px;
        flex-wrap:wrap;
      }
      .equipment-heading-with-photo > :first-child{
        flex:0 1 auto;
        min-width:0;
      }
      .equipment-photo-inline-cluster{
        display:flex;
        align-items:flex-start;
        gap:8px;
        flex:0 0 auto;
      }
      .equipment-header-photo-button{
        display:block;
        flex:0 0 auto;
        padding:0;
        border:0;
        background:transparent;
        border-radius:10px;
        cursor:zoom-in;
        line-height:0;
        box-shadow:0 2px 8px rgba(15,36,54,.18);
      }
      .equipment-header-photo-button:hover,
      .equipment-header-photo-button:focus-visible{
        outline:3px solid rgba(42,102,145,.28);
        outline-offset:2px;
      }
      .equipment-header-photo{
        display:block;
        width:150px;
        height:100px;
        object-fit:cover;
        border-radius:10px;
      }
      .equipment-photo-inline-controls{
        display:flex;
        flex-direction:column;
        align-items:stretch;
        gap:5px;
        min-width:92px;
      }
      .equipment-photo-inline-controls .form-actions{
        display:flex !important;
        flex-direction:column;
        align-items:stretch;
        gap:5px;
        margin:0 !important;
      }
      .equipment-photo-inline-controls button{
        min-height:0 !important;
        padding:6px 9px !important;
        font-size:12px !important;
        line-height:1.15 !important;
        white-space:nowrap;
        border-radius:7px !important;
      }
      .equipment-photo-inline-controls .field-status{
        max-width:150px;
        margin:1px 0 0;
        font-size:11px;
        line-height:1.25;
      }
      .equipment-header-actions{
        width:100%;
        margin-top:10px;
        margin-bottom:0;
      }
      .equipment-photo-panel.compact-photo-controls{
        display:none !important;
      }
      .equipment-photo-lightbox{
        position:fixed;
        inset:0;
        z-index:10000;
        display:flex;
        align-items:center;
        justify-content:center;
        padding:24px;
        background:rgba(0,0,0,.86);
      }
      .equipment-photo-lightbox[hidden]{display:none !important;}
      .equipment-photo-lightbox img{
        display:block;
        max-width:94vw;
        max-height:88vh;
        width:auto;
        height:auto;
        object-fit:contain;
        border-radius:10px;
        box-shadow:0 8px 34px rgba(0,0,0,.45);
      }
      .equipment-photo-lightbox-close{
        position:fixed;
        top:14px;
        right:14px;
        min-width:46px;
        min-height:46px;
        border-radius:999px;
        font-size:24px;
        line-height:1;
      }
      @media (max-width:640px){
        .equipment-heading-with-photo{
          gap:10px;
        }
        .equipment-header-photo{
          width:112px;
          height:78px;
        }
        .equipment-photo-inline-cluster{
          gap:6px;
        }
        .equipment-photo-inline-controls{
          min-width:78px;
        }
        .equipment-photo-inline-controls button{
          padding:5px 7px !important;
          font-size:11px !important;
        }
        .equipment-photo-lightbox{
          padding:14px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureLightbox() {
    let lightbox = document.querySelector("#equipmentPhotoLightbox");
    if (lightbox) return lightbox;

    lightbox = document.createElement("div");
    lightbox.id = "equipmentPhotoLightbox";
    lightbox.className = "equipment-photo-lightbox";
    lightbox.hidden = true;
    lightbox.setAttribute("role", "dialog");
    lightbox.setAttribute("aria-modal", "true");
    lightbox.setAttribute("aria-label", "Equipment photo");
    lightbox.innerHTML = `
      <button type="button" class="equipment-photo-lightbox-close" aria-label="Close photo">×</button>
      <img alt="Full-size equipment photo">
    `;

    const close = () => {
      lightbox.hidden = true;
      document.body.style.overflow = "";
    };
    lightbox.querySelector(".equipment-photo-lightbox-close").addEventListener("click", close);
    lightbox.addEventListener("click", event => {
      if (event.target === lightbox) close();
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && !lightbox.hidden) close();
    });

    document.body.appendChild(lightbox);
    return lightbox;
  }

  function openLightbox(src) {
    const lightbox = ensureLightbox();
    const image = lightbox.querySelector("img");
    image.src = src;
    lightbox.hidden = false;
    document.body.style.overflow = "hidden";
    lightbox.querySelector(".equipment-photo-lightbox-close").focus();
  }

  function compactEquipmentPhoto() {
    const section = appView?.querySelector(".grid > section.card");
    const panel = document.querySelector("#equipmentPrimaryPhotoPanel");
    if (!section || !panel) return;

    const fullImage = panel.querySelector(".equipment-photo-image");
    if (!fullImage?.src) return;

    const heading = Array.from(section.children).find(child => child.classList?.contains("section-heading"));
    const actions = heading?.querySelector(".form-actions.compact-actions");
    if (!heading) return;

    heading.classList.add("equipment-heading-with-photo");

    if (!heading.querySelector("#equipmentPhotoInlineCluster")) {
      const cluster = document.createElement("div");
      cluster.id = "equipmentPhotoInlineCluster";
      cluster.className = "equipment-photo-inline-cluster";

      const thumbnailButton = document.createElement("button");
      thumbnailButton.id = "equipmentHeaderPhotoButton";
      thumbnailButton.type = "button";
      thumbnailButton.className = "equipment-header-photo-button";
      thumbnailButton.title = "View full-size equipment photo";
      thumbnailButton.setAttribute("aria-label", "View full-size equipment photo");
      thumbnailButton.innerHTML = `<img class="equipment-header-photo" alt="Equipment photo thumbnail">`;
      thumbnailButton.querySelector("img").src = fullImage.src;
      thumbnailButton.addEventListener("click", () => openLightbox(fullImage.src));
      cluster.appendChild(thumbnailButton);

      const panelActions = panel.querySelector(".form-actions");
      const panelStatus = panel.querySelector(".field-status");
      if (panelActions || panelStatus) {
        const controls = document.createElement("div");
        controls.className = "equipment-photo-inline-controls";

        if (panelActions) {
          const cameraButton = panelActions.querySelector("#equipmentPrimaryPhotoCameraButton");
          const chooseButton = panelActions.querySelector("#equipmentPrimaryPhotoChooseButton");
          const removeButton = panelActions.querySelector("#equipmentPrimaryPhotoRemoveButton");
          if (cameraButton) cameraButton.textContent = "📷 Retake";
          if (chooseButton) chooseButton.textContent = "Replace";
          if (removeButton) removeButton.textContent = "Remove";
          controls.appendChild(panelActions);
        }
        if (panelStatus) controls.appendChild(panelStatus);
        cluster.appendChild(controls);
      }

      const titleBlock = heading.firstElementChild;
      if (titleBlock) titleBlock.insertAdjacentElement("afterend", cluster);
      else heading.prepend(cluster);
    }

    // Keep the normal equipment actions directly underneath as their own row.
    if (actions && actions.parentElement === heading) {
      actions.classList.add("equipment-header-actions");
      heading.insertAdjacentElement("afterend", actions);
    }

    panel.classList.add("compact-photo-controls");
  }

  window.openEquipment = async function (equipmentId, siteId) {
    await baseOpenEquipment(equipmentId, siteId);
    compactEquipmentPhoto();
  };

  installStyles();
})();
