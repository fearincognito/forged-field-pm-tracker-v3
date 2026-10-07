/* V3 live cloud connection indicator */

(function () {
  const statusEl = document.querySelector("#cloudConnectionStatus");
  if (!statusEl || typeof db === "undefined") return;

  let checking = false;

  function setStatus(state) {
    if (state === "active") {
      statusEl.textContent = "● Cloud connection active";
      statusEl.style.color = "#1f8a4c";
      statusEl.title = "Connected to the Forged Field PM cloud database";
      return;
    }

    if (state === "lost") {
      statusEl.textContent = "● Cloud connection lost";
      statusEl.style.color = "#b42318";
      statusEl.title = "The app cannot currently reach the cloud database";
      return;
    }

    statusEl.textContent = "● Checking cloud connection…";
    statusEl.style.color = "#687784";
    statusEl.title = "Checking cloud database connection";
  }

  async function checkCloudConnection() {
    if (checking) return;

    if (!navigator.onLine) {
      setStatus("lost");
      return;
    }

    checking = true;
    try {
      const { error } = await db.from("sites").select("id").limit(1);
      setStatus(error ? "lost" : "active");
    } catch (error) {
      setStatus("lost");
    } finally {
      checking = false;
    }
  }

  window.addEventListener("offline", () => setStatus("lost"));
  window.addEventListener("online", () => {
    setStatus("checking");
    checkCloudConnection();
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) checkCloudConnection();
  });

  setStatus(navigator.onLine ? "checking" : "lost");
  checkCloudConnection();
  setInterval(checkCloudConnection, 15000);
})();
