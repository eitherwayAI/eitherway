import type { AppLoadContext, EntryContext } from '@remix-run/node';
import { RemixServer } from '@remix-run/react';
import { renderToString } from 'react-dom/server';
import { renderHeadToString } from 'remix-island';
import { Head } from './root';
import { themeStore } from '~/lib/stores/theme';

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixContext: EntryContext,
  _loadContext: AppLoadContext,
) {
  const html = renderToString(<RemixServer context={remixContext as any} url={request.url} />);

  const head = renderHeadToString({ request, remixContext, Head });

  const body = `<!DOCTYPE html><html lang="en" data-theme="${themeStore.get()}"><head>${head}</head><body><div id="root" class="w-full h-full">${html}</div></body></html>`;

  responseHeaders.set('Content-Type', 'text/html');

  // Додаємо заголовки тільки для WASM файлів та SharedArrayBuffer
  const url = new URL(request.url);

  if (url.pathname.endsWith('.wasm') || url.pathname.includes('action-runner')) {
    responseHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');
    responseHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp');
  }

  return new Response(body, {
    headers: responseHeaders,
    status: responseStatusCode,
  });
}
