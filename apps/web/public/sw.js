const cacheName = "club-pwa-v193";
const appShell = ["/manifest.webmanifest", "/icons/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(appShell)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== cacheName).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request, { cache: "no-store" }).catch(
        () =>
          new Response(
            (request.headers.get("Accept-Language") || "").toLowerCase().startsWith("ru")
              ? "Приложение временно недоступно без интернета. Обновите страницу, когда сеть вернётся."
              : "The app is temporarily unavailable offline. Refresh the page when your connection returns.",
            { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }
          )
      )
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (request.url.includes("/assets/")) {
          const copy = response.clone();
          caches.open(cacheName).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});

self.addEventListener("push", (event) => {
  const payload = event.data?.json() || {};
  const isRussian = (self.navigator?.language || "").toLowerCase().startsWith("ru");
  const title = payload.title || (isRussian ? "Клуб" : "Club");
  const options = {
    body: payload.body || (isRussian ? "Новое уведомление" : "New notification"),
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: {
      url: payload.url || "/"
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => "focus" in client);
      if (existing) {
        existing.focus();
        if ("navigate" in existing) {
          return existing.navigate(targetUrl);
        }
        return undefined;
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
