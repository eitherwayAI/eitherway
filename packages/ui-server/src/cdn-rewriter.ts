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
  const port = serverOrigin.split(':').pop() || '3001';
  return `<script>
(function() {
  var serverOrigin = window.location.protocol + '//' + window.location.hostname + ':${port}';
  var API_PATTERN = /^https?:\\/\\/(?:api\\.|pro-api\\.)/;

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
      var endpoint = API_PATTERN.test(parsed.hostname) ? '/api/proxy-api' : '/api/proxy-cdn';
      return serverOrigin + endpoint + '?url=' + encodeURIComponent(fullUrl);
    } catch {
      return null;
    }
  }

  var _fetch = window.fetch;
  window.fetch = function(input, init) {
    var url = typeof input === 'string' ? input : (input instanceof Request ? input.url : String(input));
    var proxied = toProxy(url);
    if (proxied) {
      input = proxied;
      init = Object.assign({ credentials: 'omit' }, init || {});
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

  ['src', 'href'].forEach(function(prop) {
    ['HTMLImageElement', 'HTMLScriptElement', 'HTMLLinkElement'].forEach(function(ctor) {
      if (!window[ctor]) return;
      var desc = Object.getOwnPropertyDescriptor(window[ctor].prototype, prop);
      if (!desc || !desc.set) return;
      Object.defineProperty(window[ctor].prototype, prop, {
        set: function(value) {
          var proxied = toProxy(value);
          return desc.set.call(this, proxied || value);
        },
        get: desc.get
      });
    });
  });
})();
</script>`;
}

/**
 * Inject runtime shim into HTML files (no URL rewriting)
 */
export function maybeRewriteFile(
  filename: string,
  content: string,
  options: RewriteOptions = {}
): string {
  const isHtml = filename.toLowerCase().endsWith('.html') || filename.toLowerCase().endsWith('.htm');

  if (!isHtml || !options.serverOrigin) {
    return content;
  }

  const shimTag = generateInlineShim(options.serverOrigin);

  if (content.includes('</head>')) {
    return content.replace('</head>', `${shimTag}\n</head>`);
  } else if (content.includes('</body>')) {
    return content.replace('</body>', `${shimTag}\n</body>`);
  } else {
    return shimTag + '\n' + content;
  }
}
