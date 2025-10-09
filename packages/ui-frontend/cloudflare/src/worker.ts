interface ExecutionContext {
  waitUntil(promise: Promise<any>): void;
  passThroughOnException(): void;
}

export default {
  async fetch(req: Request, env: Record<string, string>, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const ua = req.headers.get('user-agent') || '';
    const isSafari = /Safari\//.test(ua) && !/Chrome\//.test(ua) && !/Chromium\//.test(ua);
    const isMobile = /iPhone|iPad|iPod|Android/i.test(ua);
    const isAsset =
      url.pathname.startsWith('/build/client/') ||
      url.pathname.startsWith('/assets/') ||
      /\.(css|js|mjs|wasm|png|jpg|jpeg|gif|svg|ico|webp|avif|woff2?)$/i.test(url.pathname);
    const isApi = url.pathname.startsWith('/api');
    const host = url.hostname;
    const isPreviewHost = host.startsWith('preview.') || host.startsWith('dev-preview.');

    const upstreamHeaders = new Headers(req.headers);

    if (isApi) {
      upstreamHeaders.set('Accept-Encoding', 'identity');
      upstreamHeaders.set('Cache-Control', 'no-cache, no-transform');
    }

    const fetchInit: RequestInit = { method: req.method, headers: upstreamHeaders, body: req.body };

    if (isAsset) {
      (fetchInit as any).cf = { cacheTtl: 31536000, cacheEverything: true };
    } else if (isApi) {
      (fetchInit as any).cf = { cacheTtl: 0, cacheEverything: false, minify: { javascript: false } } as any;
    }

    const upstream = await fetch(req.url, fetchInit as any);
    const resHeaders = new Headers(upstream.headers);

    // Додаємо заголовки тільки для WASM файлів та SharedArrayBuffer
    if (url.pathname.endsWith('.wasm') || url.pathname.includes('action-runner')) {
      resHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');
      resHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp');
    }

    if (isAsset) {
      resHeaders.set('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (isApi) {
      resHeaders.set('Cache-Control', 'no-cache, no-transform');
      resHeaders.set('Vary', 'Accept');

      const ct = resHeaders.get('Content-Type') || '';

      if (ct.includes('event-stream')) {
        resHeaders.set('X-Accel-Buffering', 'no');
      }
    } else {
      resHeaders.set('Cache-Control', 'no-cache');
    }

    return new Response(upstream.body, { status: upstream.status, headers: resHeaders });
  },
};
