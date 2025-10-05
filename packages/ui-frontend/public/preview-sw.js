const CDN_HOSTS = [
  'cdn.jsdelivr.net',
  'unpkg.com',
  'cdnjs.cloudflare.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'raw.githubusercontent.com',
  'i.imgur.com',
  'via.placeholder.com',
  'placehold.co',
  'ui-avatars.com',
  'api.dicebear.com',
  'avatars.githubusercontent.com',
  'source.unsplash.com',
  'cdn.simpleicons.org',
  'cdn.tailwindcss.com',
  'stackpath.bootstrapcdn.com',
  'maxcdn.bootstrapcdn.com',
  'code.jquery.com',
  'ajax.googleapis.com'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  const shouldProxy = CDN_HOSTS.some(host =>
    url.hostname === host || url.hostname.endsWith('.' + host)
  );

  if (shouldProxy && url.protocol === 'https:') {
    const proxyUrl = new URL('/api/proxy-cdn', self.location.origin);
    proxyUrl.searchParams.set('url', event.request.url);

    event.respondWith(
      fetch(proxyUrl.toString(), {
        method: 'GET',
        headers: {
          'Accept': event.request.headers.get('Accept') || '*/*'
        }
      })
    );
  }
});
