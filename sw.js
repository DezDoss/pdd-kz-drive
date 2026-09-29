/* Офлайн-кэш автодрома: всё нужное для игры лежит рядом, сеть после первого открытия не нужна.
   VERSION и список шрифтов подставляет сборка — новая сборка ставит новый кэш.
   Карточки ПДД живут на том же домене, поэтому трогаем только кэши с префиксом autodrom-,
   а если наш кэш удалил кто-то другой — при первом же открытии с сетью собираем его заново. */
var VERSION = '2d353c7fa7';
var CACHE = 'autodrom-' + VERSION;
var CORE = ['./', './index.html', './manifest.webmanifest', './vendor/three.min.js',
            './icon-192.png', './icon-512.png', './apple-touch-icon.png'].concat(["./fonts/fira-mono-cyrillic-500-normal.woff2","./fonts/fira-mono-latin-500-normal.woff2","./fonts/fira-sans-cyrillic-400-normal.woff2","./fonts/fira-sans-cyrillic-500-normal.woff2","./fonts/fira-sans-cyrillic-600-normal.woff2","./fonts/fira-sans-extra-condensed-cyrillic-600-normal.woff2","./fonts/fira-sans-extra-condensed-cyrillic-700-normal.woff2","./fonts/fira-sans-extra-condensed-cyrillic-800-normal.woff2","./fonts/fira-sans-extra-condensed-latin-600-normal.woff2","./fonts/fira-sans-extra-condensed-latin-700-normal.woff2","./fonts/fira-sans-extra-condensed-latin-800-normal.woff2","./fonts/fira-sans-latin-400-normal.woff2","./fonts/fira-sans-latin-500-normal.woff2","./fonts/fira-sans-latin-600-normal.woff2","./fonts/fonts.css"]);

// cache: 'reload' — мимо HTTP-кэша: GitHub Pages разрешает хранить файлы 10 минут,
// и без этого новый кэш мог бы получить старый index.html
function precache(c) {
  return c.addAll(CORE.map(function (u) { return new Request(u, { cache: 'reload' }); }));
}

function heal() {
  return caches.open(CACHE).then(function (c) {
    return c.match('./vendor/three.min.js').then(function (hit) {
      return hit ? null : precache(c).catch(function () {});
    });
  });
}

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(precache).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) {
      return k.indexOf('autodrom-') === 0 && k !== CACHE;
    }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function keep(cacheName, req, res) {
  if (res && res.ok) {
    var copy = res.clone();
    caches.open(cacheName).then(function (c) { c.put(req, copy); });
  }
  return res;
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  // Страница: сначала сеть, чтобы обновления приходили сразу; без сети — из кэша
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(function (res) { e.waitUntil(heal()); return keep(CACHE, req, res); })
      .catch(function () {
        return caches.open(CACHE).then(function (c) {
          return c.match(req, { ignoreSearch: true }).then(function (hit) { return hit || c.match('./index.html'); });
        });
      }));
    return;
  }

  // Свои файлы (three.js, шрифты, иконки, манифест): из кэша, иначе из сети
  if (url.origin === self.location.origin) {
    e.respondWith(caches.open(CACHE).then(function (c) {
      return c.match(req, { ignoreSearch: true }).then(function (hit) {
        return hit || fetch(req).then(function (res) { return keep(CACHE, req, res); });
      });
    }));
  }
});
