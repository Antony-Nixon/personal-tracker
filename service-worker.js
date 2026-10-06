self.addEventListener("install", event => { event.waitUntil(self.skipWaiting()); });
self.addEventListener("activate", event => { event.waitUntil(clients.claim()); });
self.addEventListener("push", event => {
  let data={title:"My Tracker",body:"You have an update.",url:"./"};
  try{data=event.data.json();}catch{}
  event.waitUntil(self.registration.showNotification(data.title,{body:data.body,icon:"./icons/icon-192.png",badge:"./icons/icon-192.png",tag:data.tag||"tracker",renotify:true,data:{url:data.url||"./"}}));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async()=>{
    const target=new URL(event.notification.data?.url||"./",self.registration.scope).href;
    const list=await clients.matchAll({type:"window",includeUncontrolled:true});
    for(const c of list){
      if("navigate" in c){await c.navigate(target);}
      if("focus" in c)return c.focus();
    }
    if(clients.openWindow) return clients.openWindow(target);
  })());
});
