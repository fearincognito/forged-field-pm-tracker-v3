/* V3 equipment primary-photo workflow */
(function () {
  const BUCKET = "equipment-photos";
  const MAX_DIMENSION = 1600;
  const JPEG_QUALITY = 0.82;

  let pendingAddPhoto = null;
  let activeEquipmentId = null;
  let activeSiteId = null;

  const canMaintain = () => currentProfile && ["owner", "admin", "mechanic"].includes(currentProfile.role);

  function installStyles() {
    if (document.querySelector("#equipmentPhotoStyles")) return;
    const style = document.createElement("style");
    style.id = "equipmentPhotoStyles";
    style.textContent = `
      .equipment-photo-panel{margin-top:18px;padding:14px;border:1px solid #d7e0e7;border-radius:12px;}
      .equipment-photo-image{display:block;width:100%;max-width:760px;max-height:430px;object-fit:cover;border-radius:10px;margin-top:12px;}
      .equipment-photo-placeholder{margin-top:12px;padding:28px 14px;border:1px dashed #aebbc5;border-radius:10px;text-align:center;}
      .equipment-photo-thumb{width:88px;height:66px;object-fit:cover;border-radius:8px;float:right;margin:0 0 8px 12px;pointer-events:none;}
      .equipment-photo-preview{display:block;width:100%;max-width:420px;max-height:280px;object-fit:cover;border-radius:10px;margin-top:12px;}
      .equipment-photo-input{display:none !important;}
    `;
    document.head.appendChild(style);
  }

  function extensionForType(type) {
    if (type === "image/png") return "png";
    if (type === "image/webp") return "webp";
    if (type === "image/heic") return "heic";
    if (type === "image/heif") return "heif";
    return "jpg";
  }

  async function prepareImage(file) {
    if (!file || !String(file.type || "").startsWith("image/")) {
      throw new Error("Choose an image file.");
    }

    try {
      const objectUrl = URL.createObjectURL(file);
      const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("This image could not be opened on this device."));
        img.src = objectUrl;
      });

      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(objectUrl);

      const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
      if (blob) return { blob, type: "image/jpeg", ext: "jpg" };
    } catch (error) {
      console.warn("Photo compression fallback:", error);
    }

    if (file.size > 8 * 1024 * 1024) {
      throw new Error("Photo is too large to upload. Try taking another photo or choose a smaller image.");
    }

    return { blob: file, type: file.type || "image/jpeg", ext: extensionForType(file.type) };
  }

  async function signedUrl(path) {
    if (!path) return null;
    const { data, error } = await db.storage.from(BUCKET).createSignedUrl(path, 3600);
    if (error) {
      console.warn("Equipment photo signed URL error:", error);
      return null;
    }
    return data?.signedUrl || null;
  }

  async function uploadPhoto(equipmentId, prepared) {
    const { data: existing } = await db.from("equipment").select("photo_path").eq("id", equipmentId).single();
    const oldPath = existing?.photo_path || null;
    const path = `${equipmentId}/main.${prepared.ext}`;

    const { error: uploadError } = await db.storage.from(BUCKET).upload(path, prepared.blob, {
      upsert: true,
      cacheControl: "3600",
      contentType: prepared.type
    });
    if (uploadError) throw uploadError;

    const { error: updateError } = await db.from("equipment")
      .update({ photo_path: path, updated_by: currentUser.id })
      .eq("id", equipmentId);

    if (updateError) {
      await db.storage.from(BUCKET).remove([path]);
      throw updateError;
    }

    if (oldPath && oldPath !== path) {
      await db.storage.from(BUCKET).remove([oldPath]);
    }

    return path;
  }

  async function removePhoto(equipmentId) {
    const { data, error } = await db.from("equipment").select("photo_path").eq("id", equipmentId).single();
    if (error) throw error;
    if (data?.photo_path) {
      const { error: removeError } = await db.storage.from(BUCKET).remove([data.photo_path]);
      if (removeError) throw removeError;
    }
    const { error: updateError } = await db.from("equipment")
      .update({ photo_path: null, updated_by: currentUser.id })
      .eq("id", equipmentId);
    if (updateError) throw updateError;
  }

  function photoButtons(prefix, hasPhoto) {
    return `
      <div class="form-actions compact-actions" style="margin-top:12px;">
        <button type="button" id="${prefix}CameraButton">📷 ${hasPhoto ? "Retake Photo" : "Take Photo"}</button>
        <button type="button" id="${prefix}ChooseButton" class="secondary-button">${hasPhoto ? "Choose Replacement" : "Choose Photo"}</button>
        ${hasPhoto ? `<button type="button" id="${prefix}RemoveButton" class="secondary-button">Remove Photo</button>` : ""}
      </div>
      <input id="${prefix}CameraInput" class="equipment-photo-input" type="file" accept="image/*" capture="environment">
      <input id="${prefix}ChooseInput" class="equipment-photo-input" type="file" accept="image/*">
    `;
  }

  function wirePhotoInputs(prefix, onFile) {
    const cameraButton = document.querySelector(`#${prefix}CameraButton`);
    const chooseButton = document.querySelector(`#${prefix}ChooseButton`);
    const cameraInput = document.querySelector(`#${prefix}CameraInput`);
    const chooseInput = document.querySelector(`#${prefix}ChooseInput`);
    cameraButton?.addEventListener("click", () => cameraInput?.click());
    chooseButton?.addEventListener("click", () => chooseInput?.click());
    cameraInput?.addEventListener("change", () => cameraInput.files?.[0] && onFile(cameraInput.files[0]));
    chooseInput?.addEventListener("change", () => chooseInput.files?.[0] && onFile(chooseInput.files[0]));
  }

  function injectAddPhotoPicker() {
    const form = document.querySelector("#equipmentForm");
    if (!form || document.querySelector("#addEquipmentPhotoPanel")) return;

    const notes = document.querySelector("#equipmentNotes")?.closest("label");
    const panel = document.createElement("div");
    panel.id = "addEquipmentPhotoPanel";
    panel.className = "equipment-photo-panel";
    panel.innerHTML = `
      <strong>Equipment Photo</strong><br>
      <small>Optional. Take a photo while standing at the machine or choose one already on your phone.</small>
      <div id="addEquipmentPhotoPreview" class="equipment-photo-placeholder">No photo selected.</div>
      ${photoButtons("addEquipmentPhoto", false)}
      <p id="addEquipmentPhotoStatus" class="field-status"></p>
    `;
    if (notes) notes.insertAdjacentElement("afterend", panel);
    else form.prepend(panel);

    wirePhotoInputs("addEquipmentPhoto", async file => {
      const status = document.querySelector("#addEquipmentPhotoStatus");
      status.textContent = "Preparing photo...";
      try {
        pendingAddPhoto = await prepareImage(file);
        const preview = document.querySelector("#addEquipmentPhotoPreview");
        const url = URL.createObjectURL(pendingAddPhoto.blob);
        preview.className = "";
        preview.innerHTML = `<img class="equipment-photo-preview" alt="Equipment photo preview">`;
        preview.querySelector("img").src = url;
        status.textContent = "Photo ready — it will upload when the equipment is saved.";
      } catch (error) {
        pendingAddPhoto = null;
        status.innerHTML = `<span class="error-text">${escapeHtml(error.message)}</span>`;
      }
    });
  }

  const baseShowAddEquipmentForm = window.showAddEquipmentForm;
  if (typeof baseShowAddEquipmentForm === "function") {
    window.showAddEquipmentForm = function (siteId) {
      pendingAddPhoto = null;
      baseShowAddEquipmentForm(siteId);
      injectAddPhotoPicker();
    };
  }

  const baseSaveEquipment = window.saveEquipment;
  if (typeof baseSaveEquipment === "function") {
    window.saveEquipment = async function (event, siteId) {
      if (!pendingAddPhoto) return baseSaveEquipment(event, siteId);

      event.preventDefault();
      const message = document.querySelector("#equipmentFormMessage");
      message.textContent = "Saving equipment and photo...";

      const numberOrNull = id => {
        const value = document.querySelector(`#${id}`).value;
        return value === "" ? null : Number(value);
      };
      const textOrNull = id => document.querySelector(`#${id}`).value.trim() || null;
      const latitude = numberOrNull("equipmentLatitude");
      const longitude = numberOrNull("equipmentLongitude");
      const accuracy = numberOrNull("equipmentGpsAccuracy");

      const record = {
        site_id: siteId,
        unit_number: textOrNull("equipmentUnitNumber"),
        name: document.querySelector("#equipmentName").value.trim(),
        make: textOrNull("equipmentMake"),
        model: textOrNull("equipmentModel"),
        serial_number: textOrNull("equipmentSerial"),
        engine_serial_number: textOrNull("equipmentEngineSerial"),
        vin: textOrNull("equipmentVin") || "N/A",
        ownership: document.querySelector("#equipmentOwnership").value,
        status: document.querySelector("#equipmentStatus").value,
        current_hours: numberOrNull("equipmentHours"),
        operating_hours_per_day: numberOrNull("equipmentHoursPerDay"),
        oil_type: textOrNull("equipmentOilType"),
        oil_capacity: numberOrNull("equipmentOilCapacity"),
        notes: textOrNull("equipmentNotes"),
        latitude,
        longitude,
        gps_accuracy_m: accuracy,
        gps_captured_at: accuracy != null ? new Date().toISOString() : null,
        gps_captured_by: accuracy != null ? currentUser.id : null,
        archived: false,
        created_by: currentUser.id,
        updated_by: currentUser.id
      };

      const { data, error } = await db.from("equipment").insert(record).select("id").single();
      if (error) {
        message.innerHTML = `<span class="error-text">${escapeHtml(error.message)}</span>`;
        return;
      }

      try {
        await uploadPhoto(data.id, pendingAddPhoto);
      } catch (photoError) {
        alert(`Equipment was saved, but the photo could not be uploaded: ${photoError.message}`);
      }

      pendingAddPhoto = null;
      await window.openEquipment(data.id, siteId);
    };
  }

  async function renderEquipmentPhotoPanel(equipmentId, siteId) {
    const section = appView.querySelector(".grid > section.card");
    if (!section || document.querySelector("#equipmentPrimaryPhotoPanel")) return;

    const { data, error } = await db.from("equipment").select("photo_path").eq("id", equipmentId).single();
    if (error || !document.querySelector("#equipmentBackSite")) return;

    const url = data?.photo_path ? await signedUrl(data.photo_path) : null;
    if (!document.querySelector("#equipmentBackSite")) return;

    const heading = section.querySelector(".section-heading");
    const panel = document.createElement("div");
    panel.id = "equipmentPrimaryPhotoPanel";
    panel.className = "equipment-photo-panel";
    panel.innerHTML = `
      <div class="section-heading">
        <div><strong>Equipment Photo</strong><br><small>Visual identification for mechanics in the field.</small></div>
      </div>
      ${url ? `<img class="equipment-photo-image" alt="Equipment photo" src="${escapeHtml(url)}">` : `<div class="equipment-photo-placeholder">No equipment photo saved yet.</div>`}
      ${canMaintain() ? photoButtons("equipmentPrimaryPhoto", Boolean(data?.photo_path)) : ""}
      <p id="equipmentPrimaryPhotoStatus" class="field-status"></p>
    `;
    heading?.insertAdjacentElement("afterend", panel);

    if (!canMaintain()) return;

    const uploadSelected = async file => {
      const status = document.querySelector("#equipmentPrimaryPhotoStatus");
      status.textContent = "Preparing and uploading photo...";
      try {
        const prepared = await prepareImage(file);
        await uploadPhoto(equipmentId, prepared);
        await window.openEquipment(equipmentId, siteId);
      } catch (uploadError) {
        status.innerHTML = `<span class="error-text">${escapeHtml(uploadError.message)}</span>`;
      }
    };

    wirePhotoInputs("equipmentPrimaryPhoto", uploadSelected);
    document.querySelector("#equipmentPrimaryPhotoRemoveButton")?.addEventListener("click", async () => {
      if (!window.confirm("Remove the equipment photo?")) return;
      const status = document.querySelector("#equipmentPrimaryPhotoStatus");
      status.textContent = "Removing photo...";
      try {
        await removePhoto(equipmentId);
        await window.openEquipment(equipmentId, siteId);
      } catch (removeError) {
        status.innerHTML = `<span class="error-text">${escapeHtml(removeError.message)}</span>`;
      }
    });
  }

  async function signedMap(rows) {
    const result = {};
    await Promise.all((rows || []).filter(r => r.photo_path).map(async row => {
      result[row.id] = await signedUrl(row.photo_path);
    }));
    return result;
  }

  async function decorateSiteEquipment(siteId) {
    const list = document.querySelector("#siteEquipmentList");
    if (!list) return;
    const { data } = await db.from("equipment").select("id,photo_path").eq("site_id", siteId).eq("archived", false).not("photo_path", "is", null);
    const urls = await signedMap(data || []);
    if (document.querySelector("#siteEquipmentList") !== list) return;

    list.querySelectorAll(".equipment-list-card").forEach(button => {
      if (button.querySelector(".equipment-photo-thumb")) return;
      const onclick = button.getAttribute("onclick") || "";
      const match = onclick.match(/openEquipment\('([^']+)'/);
      const id = match?.[1];
      const url = id ? urls[id] : null;
      if (!url) return;
      const img = document.createElement("img");
      img.className = "equipment-photo-thumb";
      img.alt = "";
      img.src = url;
      button.prepend(img);
    });
  }

  async function decorateCompanyEquipment() {
    const list = document.querySelector("#companyEquipmentList");
    if (!list) return;
    const buttons = Array.from(list.querySelectorAll(".companyEquipmentOpen"));
    const ids = buttons.map(b => b.dataset.id).filter(Boolean);
    if (!ids.length) return;
    const { data } = await db.from("equipment").select("id,photo_path").in("id", ids).not("photo_path", "is", null);
    const urls = await signedMap(data || []);
    if (document.querySelector("#companyEquipmentList") !== list) return;

    buttons.forEach(button => {
      if (button.querySelector(".equipment-photo-thumb")) return;
      const url = urls[button.dataset.id];
      if (!url) return;
      const img = document.createElement("img");
      img.className = "equipment-photo-thumb";
      img.alt = "";
      img.src = url;
      button.prepend(img);
    });
  }

  const baseOpenSite = window.openSite;
  if (typeof baseOpenSite === "function") {
    window.openSite = async function (siteId) {
      await baseOpenSite(siteId);
      await decorateSiteEquipment(siteId);
    };
  }

  const baseOpenEquipment = window.openEquipment;
  if (typeof baseOpenEquipment === "function") {
    window.openEquipment = async function (equipmentId, siteId) {
      activeEquipmentId = equipmentId;
      activeSiteId = siteId;
      await baseOpenEquipment(equipmentId, siteId);
      await renderEquipmentPhotoPanel(equipmentId, siteId);
    };
  }

  const baseShowDashboardEquipment = window.showDashboardEquipment;
  if (typeof baseShowDashboardEquipment === "function") {
    window.showDashboardEquipment = async function () {
      await baseShowDashboardEquipment();
      await decorateCompanyEquipment();
      const list = document.querySelector("#companyEquipmentList");
      if (list && !list.dataset.photoObserver) {
        list.dataset.photoObserver = "true";
        const observer = new MutationObserver(() => decorateCompanyEquipment());
        observer.observe(list, { childList: true });
      }
    };
  }

  // If Edit Equipment is opened, add a reminder/action area there too.
  const observer = new MutationObserver(() => {
    const form = document.querySelector("#editEquipmentForm");
    if (!form || form.dataset.photoWired || !activeEquipmentId) return;
    form.dataset.photoWired = "true";
    const notes = document.querySelector("#editNotes")?.closest("label");
    const panel = document.createElement("div");
    panel.className = "equipment-photo-panel";
    panel.innerHTML = `<strong>Equipment Photo</strong><br><small>Photo changes are made from the Equipment Details page.</small><div class="form-actions compact-actions" style="margin-top:10px;"><button type="button" id="editPhotoBackToEquipment">Open Photo Controls</button></div>`;
    if (notes) notes.insertAdjacentElement("afterend", panel);
    else form.prepend(panel);
    document.querySelector("#editPhotoBackToEquipment")?.addEventListener("click", () => window.openEquipment(activeEquipmentId, activeSiteId));
  });
  observer.observe(document.body, { childList: true, subtree: true });

  installStyles();
})();
