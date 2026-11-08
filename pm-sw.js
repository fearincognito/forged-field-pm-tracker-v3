self.addEventListener("install", event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("push",event=>{
 let data={title:"Forged PM Tracker",body:"A service needs attention.",url:"./"};
 try{if(event.data)data=Object.assign(data,event.data.json());}catch(_){}
 const scope=new URL(self.registration.scope);
 const target=new URL(data.url||"./",scope);
 if(target.origin!==scope.origin || !target.pathname.startsWith(scope.pathname)) target.href=scope.href;
 event.waitUntil(self.registration.showNotification(String(data.title).slice(0,120),{body:String(data.body).slice(0,320),icon:"./favicon.ico",tag:String(data.tag||"pm-alert"),data:{url:target.href}}));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(openNotification(event.notification.data?.url));
});

async function openNotification(url) {
  const scope = new URL(self.registration.scope);
  const target = new URL(url || scope.href, scope);
  if (target.origin !== scope.origin || !target.pathname.startsWith(scope.pathname)) {
    return self.clients.openWindow(scope.href);
  }

  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of windows) {
    const page = new URL(client.url);
    if (page.origin !== scope.origin || !page.pathname.startsWith(scope.pathname)) continue;
    try {
      const opened = await client.navigate(target.href);
      if (opened) return opened.focus();
    } catch {
      // A window may close during the tap. Try another window or open a new one.
    }
  }
  return self.clients.openWindow(target.href);
}
