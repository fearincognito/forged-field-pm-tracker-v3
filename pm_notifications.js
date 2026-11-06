/* V3 PM notification settings. Loaded after the dashboard wrappers. */
(function () {
  const base = window.renderDashboard;
  if (typeof base !== "function") return;
  window.renderDashboard = function (...args) {
    const result = base.apply(this, args);
    queueMicrotask(() => {
      const grid = appView?.querySelector(".grid");
      if (!grid || !currentUser || grid.querySelector("#pmNotifyCard")) return;
      const card = document.createElement("section");
      card.id = "pmNotifyCard";
      card.className = "card";
      card.style.gridColumn = "1/-1";
      card.innerHTML = '<h3>PM Notifications</h3><p>Get email and phone alerts when a service reaches 50 hours, 20 hours or becomes due.</p><button type="button" id="pmNotifySettings">Notification Settings</button>';
      grid.append(card);
      card.querySelector("button").addEventListener("click", showPmNotifySettings);
    });
    return result;
  };

  const keyBytes = key => {
    const b64 = key.replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(b64 + "=".repeat((4 - b64.length % 4) % 4));
    return Uint8Array.from(raw, char => char.charCodeAt(0));
  };

  async function showPmNotifySettings() {
    const grid = appView.querySelector(".grid");
    grid.innerHTML = '<section class="card" style="grid-column:1/-1"><button type="button" id="pmNotifyBack">← Dashboard</button><h2>PM Notification Settings</h2><p id="pmNotifyStatus">Loading…</p><div id="pmNotifyForm"></div></section>';
    document.querySelector("#pmNotifyBack").onclick = () => renderDashboard();
    const status = document.querySelector("#pmNotifyStatus");
    const panel = document.querySelector("#pmNotifyForm");
    const [{data: prefs,error:prefError},{data:config,error:configError},{data:existing,error:subError}] = await Promise.all([
      db.from("pm_notification_preferences").select("email_enabled,push_enabled").eq("user_id",currentUser.id).maybeSingle(),
      db.from("pm_notification_config").select("vapid_public_key").eq("singleton",true).maybeSingle(),
      db.from("pm_push_subscriptions").select("endpoint").eq("user_id",currentUser.id)
    ]);
    if (prefError || configError || subError) {status.textContent = "Unable to load notification settings. Please retry.";return;}
    status.textContent = "Alerts are based on actual or estimated machine hours. Email goes to your account email.";
    panel.innerHTML = '<label style="display:block;margin:14px 0"><input type="checkbox" id="pmEmailOn"> Email alerts</label><label style="display:block;margin:14px 0"><input type="checkbox" id="pmPushOn"> Phone push alerts</label><button type="button" id="pmSavePrefs">Save Preferences</button><hr><p id="pmPhoneStatus"></p><button type="button" id="pmEnablePhone">Enable Notifications on This Device</button> <button type="button" id="pmDisablePhone" class="secondary-button">Remove This Device</button>';
    const email = panel.querySelector("#pmEmailOn"),push=panel.querySelector("#pmPushOn");
    email.checked=prefs?.email_enabled ?? true; push.checked=prefs?.push_enabled ?? true;
    panel.querySelector("#pmSavePrefs").onclick=async()=>{
      const {error}=await db.from("pm_notification_preferences").upsert({user_id:currentUser.id,email_enabled:email.checked,push_enabled:push.checked,updated_at:new Date().toISOString()},{onConflict:"user_id"});
      status.textContent=error?"Could not save: "+error.message:"Preferences saved.";
    };
    const phoneStatus=panel.querySelector("#pmPhoneStatus");
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      phoneStatus.textContent="Push is not supported in this browser. On iPhone, add the tracker to your Home Screen and open it from there.";
    } else if (!config?.vapid_public_key) {
      phoneStatus.textContent="Phone push is not yet configured by the administrator. Email preferences can still be saved.";
    } else {
      phoneStatus.textContent=(existing?.length||0)+" device subscription(s) registered for your account.";
    }
    panel.querySelector("#pmEnablePhone").disabled= !config?.vapid_public_key || !("PushManager" in window);
    panel.querySelector("#pmEnablePhone").onclick=async()=>{
      try {
        phoneStatus.textContent="Requesting permission…";
        const permission=await Notification.requestPermission();
        if(permission!=="granted") {phoneStatus.textContent="Permission not granted. Check device notification settings.";return;}
        const reg=await navigator.serviceWorker.register("./pm-sw.js");
        const sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(config.vapid_public_key)});
        const json=sub.toJSON();
        const {error}=await db.from("pm_push_subscriptions").upsert({user_id:currentUser.id,endpoint:sub.endpoint,p256dh:json.keys.p256dh,auth_secret:json.keys.auth,updated_at:new Date().toISOString()},{onConflict:"endpoint"});
        if(error)throw error;
        phoneStatus.textContent="This device is subscribed. You will receive PM alerts when delivery is configured.";
      }catch(e){phoneStatus.textContent="Could not enable push: "+(e.message||String(e));}
    };
    panel.querySelector("#pmDisablePhone").onclick=async()=>{
      try {
        const reg=await navigator.serviceWorker.getRegistration("./");
        const sub=await reg?.pushManager.getSubscription();
        if (!sub){phoneStatus.textContent="No local subscription found.";return;}
        const {error}=await db.from("pm_push_subscriptions").delete().eq("endpoint",sub.endpoint).eq("user_id",currentUser.id);
        if(error)throw error;
        await sub.unsubscribe();phoneStatus.textContent="This device was removed.";
      }catch(e){phoneStatus.textContent="Unable to remove device: "+(e.message||String(e));}
    };
  }
})();