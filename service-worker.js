self.addEventListener("install", event => { event.waitUntil(self.skipWaiting()); });
self.addEventListener("activate", event => { event.waitUntil(clients.claim()); });
self.addEventListener("push", event => {
  let data={title:"Daymark",body:"You have an update.",url:"./"};
  try{data=event.data.json();}catch{}
  event.waitUntil(self.registration.showNotification(data.title,{body:data.body,icon:"./icons/daymark.svg",badge:"./icons/daymark.svg",tag:data.tag||"daymark",renotify:true,data:{url:data.url||"./"}}));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async()=>{
    const scope = new URL(self.registration.scope);
    const target = new URL(event.notification.data?.url || "./", scope);
    if (target.origin !== scope.origin || !target.pathname.startsWith(scope.pathname)) {
      target.href = scope.href;
    }

    const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
    const appWindow = windows.find(client => {
      try {
        const url = new URL(client.url);
        return url.origin === scope.origin && url.pathname.startsWith(scope.pathname);
      } catch {
        return false;
      }
    });

    if (appWindow) {
      if (appWindow.url !== target.href && "navigate" in appWindow) {
        await appWindow.navigate(target.href);
      }
      if ("focus" in appWindow) return appWindow.focus();
    }
    if (clients.openWindow) return clients.openWindow(target.href);
  })());
});
