/* Compact equipment detail photo: thumbnail in header with full-size lightbox. */
(function () {
  const baseOpenEquipment = window.openEquipment;
  if (typeof baseOpenEquipment !== "function") return;

  function installStyles() {
    if (document.querySelector("#equipmentPhotoLayoutStyles")) return;
    const style = document.createElement("style");
    style.id = "equipmentPhotoLayoutStyles";
    style.textContent = `
      .equipment-header-photo-stack{
        display:flex;
        flex-direction:column;
        align-items:flex-end;
        gap:10px;
        margin-left:auto;
      }
      .equipment-header-photo-button{
        display:block;
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
      .equipment-photo-panel.compact-photo-controls{
        margin-top:12px;
        padding:8px 10px;
      }
      .equipment-photo-panel.compact-photo-controls > .section-heading,
      .equipment-photo-panel.compact-photo-controls > .equipment-photo-image{
        display:none !important;
      }
      .equipment-photo-panel.compact-photo-controls > .form-actions{
        margin-top:0 !important;
      }
      .equipment-photo-panel.compact-photo-controls > .field-status{
        margin-bottom:0;
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
        .equipment-header-photo{
          width:128px;
          height:88px;
        }
        .equipment-header-photo-stack{
          align-items:flex-end;
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
    if (!heading || !actions) return;

    if (!heading.querySelector("#equipmentHeaderPhotoButton")) {
      const stack = document.createElement("div");
      stack.className = "equipment-header-photo-stack";

      const thumbnailButton = document.createElement("button");
      thumbnailButton.id = "equipmentHeaderPhotoButton";
      thumbnailButton.type = "button";
      thumbnailButton.className = "equipment-header-photo-button";
      thumbnailButton.title = "View full-size equipment photo";
      thumbnailButton.setAttribute("aria-label", "View full-size equipment photo");
      thumbnailButton.innerHTML = `<img class="equipment-header-photo" alt="Equipment photo thumbnail">`;
      thumbnailButton.querySelector("img").src = fullImage.src;
      thumbnailButton.addEventListener("click", () => openLightbox(fullImage.src));

      heading.replaceChild(stack, actions);
      stack.appendChild(thumbnailButton);
      stack.appendChild(actions);
    }

    panel.classList.add("compact-photo-controls");
  }

  window.openEquipment = async function (equipmentId, siteId) {
    await baseOpenEquipment(equipmentId, siteId);
    compactEquipmentPhoto();
  };

  installStyles();
})();
