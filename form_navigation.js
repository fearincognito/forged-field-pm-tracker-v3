/* V3 form navigation improvements */
(function () {
  function enhanceAddSiteForm() {
    const form = document.querySelector("#siteForm");
    if (!form || document.querySelector("#siteFormBack")) return;

    const card = form.closest("section.card");
    if (!card) return;

    const heading = card.querySelector("h2");
    if (!heading || heading.textContent.trim() !== "Add Job Site") return;

    const headingRow = document.createElement("div");
    headingRow.className = "section-heading";

    const titleWrap = document.createElement("div");
    titleWrap.appendChild(heading.cloneNode(true));

    const backButton = document.createElement("button");
    backButton.id = "siteFormBack";
    backButton.type = "button";
    backButton.textContent = "← Back to Sites";
    backButton.addEventListener("click", () => {
      if (typeof window.renderSites === "function") window.renderSites();
    });

    headingRow.appendChild(titleWrap);
    headingRow.appendChild(backButton);
    heading.replaceWith(headingRow);
  }

  const observer = new MutationObserver(enhanceAddSiteForm);
  observer.observe(document.body, { childList: true, subtree: true });
  enhanceAddSiteForm();
})();
