/* V3 customer/company logos for job sites */
(function () {
  const BUCKET = "site-logos";
  const MAX_FILE_BYTES = 5 * 1024 * 1024;
  let activeSiteId = null;

  function addStyles() {
    if (document.querySelector("#siteLogoStyles")) return;
    const style = document.createElement("style");
    style.id = "siteLogoStyles";
    style.textContent = `
      .site-card-with-logo{position:relative;}
      .site-logo-wrap{display:flex;justify-content:center;align-items:center;padding:8px;border-radius:10px;background:#fff;}
      .site-logo-img{display:block;max-width:200px;max-height:92px;width:auto;height:auto;object-fit:contain;}
      .site-logo-preview{display:block;max-width:220px;max-height:110px;width:auto;height:auto;object-fit:contain;margin:10px auto;border-radius:8px;background:#fff;padding:8px;border:1px solid #d7e0e7;}
      .site-logo-upload-box{margin-top:16px;}
      .site-logo-upload-box input[type=file]{margin-top:8px;}

      @media (min-width:721px){
        .site-card-with-logo{padding-right:290px !important;min-height:230px;}
        .site-card-with-logo .site-logo-wrap{
          position:absolute;
          right:34px;
          top:50%;
          transform:translateY(-50%);
          width:220px;
          min-height:110px;
          margin:0;
        }
      }

      @media (max-width:720px){
        .site-card-with-logo .site-logo-wrap{
          position:static;
          width:auto;
          min-height:86px;
          margin:14px 0 12px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function publicUrl(path) {
    if (!path) return null;
    const { data } = db.storage.from(BUCKET).getPublicUrl(path);
    return data?.publicUrl || null;
  }

  function fileExtension(file) {
    const name = String(file?.name || "");
    const ext = name.includes(".") ? name.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "") : "";
    if (ext) return ext;
    if (file?.type === "image/png") return "png";
    if (file?.type === "image/webp") return "webp";
    if (file?.type === "image/gif") return "gif";
    return "jpg";
  }

  function validateFile(file) {
    if (!file) return null;
    if (!String(file.type || "").startsWith("image/")) return "Choose an image file for the company logo.";
    if (file.size > MAX_FILE_BYTES) return "Logo image must be 5 MB or smaller.";
    return null;
  }

  async function uploadLogo(siteId, file) {
    const errorText = validateFile(file);
    if (errorText) throw new Error(errorText);

    const path = `${siteId}/logo-${Date.now()}.${fileExtension(file)}`;
    const { error } = await db.storage.from(BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || undefined
    });
    if (error) throw error;
    return path;
  }

  async function removeLogoFile(path) {
    if (!path) return;
    const { error } = await db.storage.from(BUCKET).remove([path]);
    if (error) console.error("Site logo file delete error:", error);
  }

  function previewSelectedFile(input, img, status) {
    const file = input?.files?.[0] || null;
    if (!file) return;
    const errorText = validateFile(file);
    if (errorText) {
      input.value = "";
      if (status) status.innerHTML = `<span class="error-text">${escapeHtml(errorText)}</span>`;
      return;
    }
    if (status) status.textContent = "";
    const reader = new FileReader();
    reader.onload = () => {
      img.src = reader.result;
      img.style.display = "block";
    };
    reader.readAsDataURL(file);
  }

  async function decorateSiteCards() {
    const list = document.querySelector("#sitesList");
    if (!list) return;

    const { data: sites, error } = await db.from("sites")
      .select("id,logo_path")
      .eq("archived", false);
    if (error || !sites) return;

    const byId = Object.fromEntries(sites.map(site => [site.id, site.logo_path]));
    list.querySelectorAll("button[onclick*='openSite']").forEach(openButton => {
      const card = openButton.closest("article");
      if (!card || card.querySelector(".site-logo-wrap")) return;
      const onclick = openButton.getAttribute("onclick") || "";
      const match = onclick.match(/openSite\('([^']+)'\)/);
      if (!match) return;
      const path = byId[match[1]];
      if (!path) return;
      const url = publicUrl(path);
      if (!url) return;

      card.classList.add("site-card-with-logo");
      const wrap = document.createElement("div");
      wrap.className = "site-logo-wrap";
      wrap.innerHTML = `<img class="site-logo-img" alt="Customer company logo">`;
      wrap.querySelector("img").src = url;
      const actions = card.querySelector(".form-actions");
      if (actions) card.insertBefore(wrap, actions);
      else card.appendChild(wrap);
    });
  }

  function injectAddLogoField() {
    const form = document.querySelector("#siteForm");
    if (!form || document.querySelector("#siteLogoFile")) return;
    const actions = form.querySelector(".form-actions");
    if (!actions) return;

    const box = document.createElement("div");
    box.className = "location-box site-logo-upload-box";
    box.innerHTML = `
      <strong>Customer / Company Logo</strong><br>
      <small>Optional. This logo will be centered on the Job Sites card.</small>
      <input id="siteLogoFile" type="file" accept="image/*">
      <img id="siteLogoPreview" class="site-logo-preview" alt="Logo preview" style="display:none;">
      <p id="siteLogoStatus" class="field-status"></p>`;
    form.insertBefore(box, actions);

    const input = box.querySelector("#siteLogoFile");
    const img = box.querySelector("#siteLogoPreview");
    const status = box.querySelector("#siteLogoStatus");
    input.addEventListener("change", () => previewSelectedFile(input, img, status));
  }

  const baseShowAddSiteForm = window.showAddSiteForm;
  if (typeof baseShowAddSiteForm === "function") {
    window.showAddSiteForm = function () {
      baseShowAddSiteForm();
      injectAddLogoField();
    };
  }

  const baseSaveSite = window.saveSite;
  if (typeof baseSaveSite === "function") {
    window.saveSite = async function (event) {
      const file = document.querySelector("#siteLogoFile")?.files?.[0] || null;
      const name = document.querySelector("#siteName")?.value?.trim() || "";
      const startedAt = new Date(Date.now() - 3000).toISOString();
      const fileError = validateFile(file);
      if (fileError) {
        event.preventDefault();
        const message = document.querySelector("#siteFormMessage");
        if (message) message.innerHTML = `<span class="error-text">${escapeHtml(fileError)}</span>`;
        return;
      }

      await baseSaveSite(event);
      if (!file || document.querySelector("#siteForm")) return;

      const { data: rows, error: findError } = await db.from("sites")
        .select("id")
        .eq("created_by", currentUser.id)
        .eq("name", name)
        .gte("created_at", startedAt)
        .order("created_at", { ascending: false })
        .limit(1);

      if (findError || !rows?.length) {
        console.error("New site lookup for logo failed:", findError);
        return;
      }

      try {
        const path = await uploadLogo(rows[0].id, file);
        const { error: updateError } = await db.from("sites")
          .update({ logo_path: path, updated_by: currentUser.id })
          .eq("id", rows[0].id);
        if (updateError) throw updateError;
        await decorateSiteCards();
      } catch (logoError) {
        console.error("Site logo save error:", logoError);
        const status = document.querySelector("#sitesStatus");
        if (status) status.innerHTML += ` <span class="error-text">Site saved, but the logo could not be uploaded.</span>`;
      }
    };
  }

  const baseRenderSites = window.renderSites;
  if (typeof baseRenderSites === "function") {
    window.renderSites = async function () {
      await baseRenderSites();
      await decorateSiteCards();
    };
  }

  const baseOpenSite = window.openSite;
  if (typeof baseOpenSite === "function") {
    window.openSite = async function (siteId) {
      activeSiteId = siteId;
      await baseOpenSite(siteId);
    };
  }

  async function injectEditLogoField() {
    const form = document.querySelector("#editSiteForm");
    if (!form || form.dataset.siteLogoReady === "true" || !activeSiteId) return;
    form.dataset.siteLogoReady = "true";

    const { data: site, error } = await db.from("sites")
      .select("logo_path")
      .eq("id", activeSiteId)
      .single();
    if (error || !document.querySelector("#editSiteForm")) return;

    let currentPath = site?.logo_path || null;
    let removeRequested = false;
    let logoProcessed = false;

    const notesLabel = document.querySelector("#editSiteAccessNotes")?.closest("label");
    const actions = form.querySelector(".form-actions");
    const anchor = notesLabel || actions;
    if (!anchor) return;

    const box = document.createElement("div");
    box.className = "location-box site-logo-upload-box";
    const currentUrl = publicUrl(currentPath);
    box.innerHTML = `
      <strong>Customer / Company Logo</strong><br>
      <small>Optional. Upload a replacement or remove the current logo.</small>
      ${currentUrl ? `<img id="editSiteLogoPreview" class="site-logo-preview" src="${escapeHtml(currentUrl)}" alt="Current company logo">` : `<img id="editSiteLogoPreview" class="site-logo-preview" alt="Logo preview" style="display:none;">`}
      <input id="editSiteLogoFile" type="file" accept="image/*">
      <div class="form-actions compact-actions" style="margin-top:8px;">
        ${currentPath ? `<button id="removeSiteLogoButton" type="button" class="secondary-button">Remove Logo</button>` : ""}
      </div>
      <p id="editSiteLogoStatus" class="field-status"></p>`;
    form.insertBefore(box, anchor);

    const input = box.querySelector("#editSiteLogoFile");
    const img = box.querySelector("#editSiteLogoPreview");
    const status = box.querySelector("#editSiteLogoStatus");
    input.addEventListener("change", () => {
      removeRequested = false;
      previewSelectedFile(input, img, status);
    });

    const removeButton = box.querySelector("#removeSiteLogoButton");
    if (removeButton) {
      removeButton.addEventListener("click", () => {
        removeRequested = true;
        input.value = "";
        img.removeAttribute("src");
        img.style.display = "none";
        status.textContent = "Logo will be removed when you save the site.";
      });
    }

    form.addEventListener("submit", event => {
      if (logoProcessed) return;
      const file = input.files?.[0] || null;
      if (!file && !removeRequested) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      const fileError = validateFile(file);
      if (fileError) {
        status.innerHTML = `<span class="error-text">${escapeHtml(fileError)}</span>`;
        return;
      }

      status.textContent = file ? "Uploading logo..." : "Removing logo...";
      (async () => {
        try {
          let newPath = currentPath;
          if (file) newPath = await uploadLogo(activeSiteId, file);
          if (removeRequested) newPath = null;

          const { error: updateError } = await db.from("sites")
            .update({ logo_path: newPath, updated_by: currentUser.id })
            .eq("id", activeSiteId);
          if (updateError) throw updateError;

          if (currentPath && currentPath !== newPath) await removeLogoFile(currentPath);
          currentPath = newPath;
          logoProcessed = true;
          status.textContent = "Logo saved.";
          form.requestSubmit();
        } catch (logoError) {
          console.error("Site logo update error:", logoError);
          status.innerHTML = `<span class="error-text">${escapeHtml(logoError.message || "Logo could not be saved.")}</span>`;
        }
      })();
    }, true);
  }

  const observer = new MutationObserver(() => {
    if (document.querySelector("#siteForm")) injectAddLogoField();
    if (document.querySelector("#editSiteForm")) injectEditLogoField();
    if (document.querySelector("#sitesList")) decorateSiteCards();
  });

  addStyles();
  observer.observe(document.body, { childList: true, subtree: true });
})();
