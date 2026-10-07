/* Keep equipment detail action buttons uniform, especially on phones. */
(function () {
  const baseOpenEquipment = window.openEquipment;
  if (typeof baseOpenEquipment !== "function") return;

  function installStyles() {
    if (document.querySelector("#equipmentActionButtonStyles")) return;
    const style = document.createElement("style");
    style.id = "equipmentActionButtonStyles";
    style.textContent = `
      .equipment-uniform-actions{
        display:grid !important;
        grid-template-columns:repeat(auto-fit,minmax(140px,1fr));
        gap:8px !important;
        width:100%;
        align-items:stretch;
      }
      .equipment-uniform-actions > button{
        width:100% !important;
        min-width:0 !important;
        min-height:44px;
        height:44px;
        margin:0 !important;
        padding:8px 10px !important;
        display:flex;
        align-items:center;
        justify-content:center;
        text-align:center;
        line-height:1.15;
        white-space:normal;
      }
      @media (max-width:640px){
        .equipment-uniform-actions{
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:7px !important;
        }
        .equipment-uniform-actions > button{
          min-height:48px;
          height:48px;
          padding:7px 6px !important;
          font-size:13px !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function normalizeEquipmentActions() {
    const backButton = document.querySelector("#equipmentBackSite");
    const actions = backButton?.closest(".form-actions");
    if (!actions) return;
    actions.classList.add("equipment-uniform-actions");
  }

  window.openEquipment = async function (equipmentId, siteId) {
    await baseOpenEquipment(equipmentId, siteId);
    normalizeEquipmentActions();
  };

  installStyles();
})();
