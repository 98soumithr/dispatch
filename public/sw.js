/* Dispatch service worker — handles incoming web-push notifications. */

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    payload = { title: "Dispatch", body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "Dispatch";
  const options = {
    body: payload.body || "",
    icon: "/favicon.ico",
    data: payload.data || {},
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const url = data.url || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const c of clients) {
          if (c.url.includes(url) && "focus" in c) return c.focus();
        }
        if (self.clients.openWindow) return self.clients.openWindow(url);
      }),
  );
});
