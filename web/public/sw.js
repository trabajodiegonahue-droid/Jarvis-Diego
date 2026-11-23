// Guarda la página en el teléfono para que abra sin internet.
// Las llamadas a Gemini nunca se guardan: siempre van a la red.
const CACHE = "vida-v2";
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["./", "./index.html", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-180.png"])).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== "vida-avisos").map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.endsWith("__avisos.json")) return;
  // Red primero (para recibir las versiones nuevas) y, sin conexión, lo guardado.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("./index.html"))),
  );
});

// ---------- Avisos (notificaciones push) ----------
// El intermediario manda un "toque" sin contenido; aquí se pide el texto con la clave de este aparato.
self.addEventListener("push", (e) => {
  e.waitUntil(
    (async () => {
      let mensajes = [];
      try {
        const cfg = await (await caches.match("./__avisos.json"))?.json();
        if (cfg?.url) {
          const r = await fetch(`${cfg.url}/avisos/pendientes?id=${encodeURIComponent(cfg.id)}&k=${encodeURIComponent(cfg.k)}`);
          if (r.ok) mensajes = (await r.json()).mensajes || [];
        }
      } catch {}
      if (!mensajes.length) mensajes = [{ titulo: "JARVIS", cuerpo: "Tienes un aviso. Abre Vida para verlo." }];
      for (const m of mensajes.slice(-3)) await self.registration.showNotification(m.titulo, { body: m.cuerpo, icon: "icons/icon-192.png", badge: "icons/icon-192.png", tag: m.titulo + m.cuerpo });
    })(),
  );
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
      for (const c of cs) if ("focus" in c) return c.focus();
      return self.clients.openWindow("./#/");
    }),
  );
});
