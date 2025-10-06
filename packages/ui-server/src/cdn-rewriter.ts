/**
 * CDN URL Rewriter
 * Automatically rewrites external CDN URLs to use our proxy endpoint
 * Fixes COEP issues with WebContainer by proxying through /api/proxy-cdn
 */

const CDN_PATTERNS = [
  // Image CDNs
  /https?:\/\/via\.placeholder\.com\/[^\s"'`)]+/g,
  /https?:\/\/placehold\.co\/[^\s"'`)]+/g,
  /https?:\/\/ui-avatars\.com\/[^\s"'`)]+/g,
  /https?:\/\/api\.dicebear\.com\/[^\s"'`)]+/g,
  /https?:\/\/avatars\.githubusercontent\.com\/[^\s"'`)]+/g,
  /https?:\/\/source\.unsplash\.com\/[^\s"'`)]+/g,
  /https?:\/\/i\.imgur\.com\/[^\s"'`)]+/g,
  /https?:\/\/raw\.githubusercontent\.com\/[^\s"'`)]+/g,

  // Crypto coin images
  /https?:\/\/coin-images\.coingecko\.com\/[^\s"'`)]+/g,
  /https?:\/\/assets\.coingecko\.com\/[^\s"'`)]+/g,

  // JS/CSS CDNs
  /https?:\/\/cdn\.jsdelivr\.net\/[^\s"'`)]+/g,
  /https?:\/\/unpkg\.com\/[^\s"'`)]+/g,
  /https?:\/\/cdnjs\.cloudflare\.com\/[^\s"'`)]+/g,

  // Font CDNs
  /https?:\/\/fonts\.gstatic\.com\/[^\s"'`)]+/g,
];

export interface RewriteOptions {
  proxyBaseUrl?: string;
  skipFonts?: boolean;
  serverOrigin?: string;
  injectShim?: boolean;
  rewriteStaticUrls?: boolean;
}

/**
 * Rewrite external CDN URLs in content to use our proxy
 */
export function rewriteCDNUrls(
  content: string,
  options: RewriteOptions = {}
): string {
  const {
    proxyBaseUrl = '/api/proxy-cdn',
    skipFonts = false,
    serverOrigin
  } = options;

  // If serverOrigin is provided, make URLs absolute
  const proxyUrl = serverOrigin
    ? `${serverOrigin}${proxyBaseUrl}`
    : proxyBaseUrl;

  let rewritten = content;

  for (const pattern of CDN_PATTERNS) {
    // Skip font URLs if requested
    if (skipFonts && pattern.source.includes('fonts.gstatic')) {
      continue;
    }

    rewritten = rewritten.replace(pattern, (url) => {
      // Encode the URL for the query parameter
      const encodedUrl = encodeURIComponent(url);
      return `${proxyUrl}?url=${encodedUrl}`;
    });
  }

  return rewritten;
}

/**
 * Check if a file should have CDN URLs rewritten
 */
export function shouldRewriteFile(filename: string): boolean {
  const ext = filename.toLowerCase().split('.').pop() || '';
  return ['html', 'htm', 'js', 'jsx', 'ts', 'tsx', 'vue', 'svelte'].includes(ext);
}

function generateInlineShim(serverOrigin: string): string {
  return `<script>
(function() {
  var serverOrigin = ${JSON.stringify(serverOrigin)};
  var API_PATTERN_HOST = /^(?:api\\.|pro-api\\.)/;

  function isExternal(url) {
    try {
      var parsed = new URL(url, window.location.href);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
      if (parsed.origin === window.location.origin) return false;
      return true;
    } catch {
      return false;
    }
  }

  function toProxy(url) {
    if (!isExternal(url)) return null;
    try {
      var parsed = new URL(url, window.location.href);
      var fullUrl = parsed.toString();
      var endpoint = API_PATTERN_HOST.test(parsed.hostname) ? '/api/proxy-api' : '/api/proxy-cdn';
      return serverOrigin + endpoint + '?url=' + encodeURIComponent(fullUrl);
    } catch {
      return null;
    }
  }

  function handleProxyError(url, error) {
    console.error('[Proxy Error]', url, error);
    if (window.__EITHERWAY_PROXY_ERRORS) {
      window.__EITHERWAY_PROXY_ERRORS.push({ url: url, error: error.message, timestamp: Date.now() });
    }
  }

  var _fetch = window.fetch;
  window.fetch = function(input, init) {
    var url = typeof input === 'string' ? input : (input instanceof Request ? input.url : String(input));
    var proxied = toProxy(url);
    if (proxied) {
      input = proxied;
      init = Object.assign({ credentials: 'omit' }, init || {});
      return _fetch.call(this, input, init).catch(function(err) {
        handleProxyError(url, err);
        throw err;
      });
    }
    return _fetch.call(this, input, init);
  };

  var _xhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    var proxied = toProxy(url);
    if (proxied) {
      arguments[1] = proxied;
    }
    return _xhrOpen.apply(this, arguments);
  };

  window.__EITHERWAY_PROXY_ERRORS = [];
  console.log('[Eitherway Proxy] Initialized with backend origin:', serverOrigin);
})();
</script>`;
}

/**
 * Rewrite file content for WebContainer preview
 * - Rewrites static CDN URLs in all text files (HTML/JS/TS/etc)
 * - Optionally injects runtime shim for dynamic requests (HTML only)
 */
export function maybeRewriteFile(
  filename: string,
  content: string,
  options: RewriteOptions = {}
): string {
  const {
    serverOrigin,
    injectShim = true,
    rewriteStaticUrls = true
  } = options;

  if (!serverOrigin) {
    return content;
  }

  let processedContent = content;
  const isHtml = filename.toLowerCase().endsWith('.html') || filename.toLowerCase().endsWith('.htm');

  // Step 1: Rewrite static CDN URLs in text files
  if (rewriteStaticUrls && shouldRewriteFile(filename)) {
    processedContent = rewriteCDNUrls(processedContent, {
      serverOrigin,
      skipFonts: options.skipFonts
    });
  }

  // Step 2: HTML-specific processing
  if (isHtml) {
    // Normalize YouTube embeds
    processedContent = processedContent.replace(
      /<iframe([^>]*?)src=["']https?:\/\/(www\.)?youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})[^"']*["']([^>]*)><\/iframe>/gi,
      (_match, pre, _www, videoId, post) => {
        const mustAllow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
        let attrs = `${pre}src="https://www.youtube-nocookie.com/embed/${videoId}"`;

        if (!/allow=/i.test(pre + post)) {
          attrs += ` allow="${mustAllow}"`;
        }

        if (!/allowfullscreen/i.test(pre + post)) {
          attrs += ` allowfullscreen`;
        }

        return `<iframe${attrs}${post}></iframe>`;
      }
    );

    // Inject runtime shim for dynamic requests (preview only)
    if (injectShim) {
      const shimTag = generateInlineShim(serverOrigin);

      if (processedContent.includes('</head>')) {
        processedContent = processedContent.replace('</head>', `${shimTag}\n</head>`);
      } else if (processedContent.includes('</body>')) {
        processedContent = processedContent.replace('</body>', `${shimTag}\n</body>`);
      } else {
        processedContent = shimTag + '\n' + processedContent;
      }
    }
  }

  return processedContent;
}
