self.addEventListener("push",event=>{
 let data={title:"Forged PM Tracker",body:"A service needs attention.",url:"./"};
 try{if(event.data)data=Object.assign(data,event.data.json());}catch(_){}
 const scope=new URL(self.registration.scope);
 const target=new URL(data.url||"./",scope);
 if(target.origin!==scope.origin || !target.pathname.startsWith(scope.pathname)) target.href=scope.href;
 event.waitUntil(self.registration.showNotification(String(data.title).slice(0,120),{body:String(data.body).slice(0,320),icon:"./favicon.ico",tag:String(data.tag||"pm-alert"),data:{url:target.href}}));
});
self.addEventListener("notificationclick",event=>{
 event.notification.close();
 event.waitUntil(clients.openWindow(event.notification.data?.url||self.registration.scope));
});