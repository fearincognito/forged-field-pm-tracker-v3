/* Keep equipment-list thumbnails beside the equipment text without changing thumbnail size. */
(function () {
  if (document.querySelector("#equipmentListPhotoLayoutStyles")) return;

  const style = document.createElement("style");
  style.id = "equipmentListPhotoLayoutStyles";
  style.textContent = `
    .equipment-list-card:has(> .equipment-photo-thumb){
      display:grid !important;
      grid-template-columns:88px minmax(0,1fr);
      column-gap:12px;
      row-gap:2px;
      align-items:center;
      justify-items:start;
      text-align:left !important;
    }

    .equipment-list-card:has(> .equipment-photo-thumb) > .equipment-photo-thumb{
      grid-column:1;
      grid-row:1 / span 20;
      width:88px;
      height:66px;
      float:none !important;
      margin:0 !important;
      align-self:center;
      justify-self:start;
    }

    .equipment-list-card:has(> .equipment-photo-thumb) > :not(.equipment-photo-thumb){
      grid-column:2;
      min-width:0;
      text-align:left;
    }

    @media (max-width:640px){
      .equipment-list-card:has(> .equipment-photo-thumb){
        grid-template-columns:88px minmax(0,1fr);
        column-gap:10px;
      }
    }
  `;

  document.head.appendChild(style);
})();
