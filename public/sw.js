const CACHE_VERSION = "autoinstructor-shell-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", () => {
  // The app stays network-first for now. This keeps PWA installation enabled
  // without caching private cabinet data on the device.
});

self.addEventListener("push", (event) => {
  const fallback = {
    title: "Автоинструктор",
    body: "В кабинете есть новое уведомление.",
    url: "/admin",
  };

  const payload = event.data ? event.data.json() : fallback;
  const title = typeof payload.title === "string" ? payload.title : fallback.title;
  const options = {
    body: typeof payload.body === "string" ? payload.body : fallback.body,
    data: {
      url: typeof payload.url === "string" ? payload.url : fallback.url,
    },
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || "/admin";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const existingClient = clients.find((client) =>
          client.url.includes(targetUrl),
        );

        if (existingClient && "focus" in existingClient) {
          return existingClient.focus();
        }

        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }

        return undefined;
      }),
  );
});
