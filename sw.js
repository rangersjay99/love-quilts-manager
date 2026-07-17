// Copyright © 2026 Jay. All rights reserved. See LICENSE.txt.
const CACHE_NAME = "love-quilts-v7-5-5-copyright";
const APP_SHELL = [
  "./",
  "./index.html?v=7.5.5",
  "./app.js?v=7.5.5",
  "./manifest-v7.json?v=7.5.5",
  "./GOOGLE_BACKUP_SETUP.txt",
  "./LICENSE.txt",
  "./icons/love-quilts-manager-180-v7.png?v=7.5.5",
  "./icons/love-quilts-manager-192-v7.png?v=7.5.5",
  "./icons/love-quilts-manager-512-v7.png?v=7.5.5"
];

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(async cache => {
    await Promise.allSettled(APP_SHELL.map(url => cache.add(url)));
  }));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(names.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const request = event.request;
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request, {cache:"no-store"})
        .then(response => {
          const copy=response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put("./index.html?v=7.5.5",copy));
          return response;
        })
        .catch(() => caches.match("./index.html?v=7.5.5"))
    );
    return;
  }
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response && response.status === 200) {
          const copy=response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request,copy));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
