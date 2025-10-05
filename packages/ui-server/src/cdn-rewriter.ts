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

  // JS/CSS CDNs
  /https?:\/\/cdn\.jsdelivr\.net\/[^\s"'`)]+/g,
  /https?:\/\/unpkg\.com\/[^\s"'`)]+/g,
  /https?:\/\/cdnjs\.cloudflare\.com\/[^\s"'`)]+/g,

  // Font CDNs (fonts.gstatic.com URLs)
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

/**
 * Rewrite CDN URLs in file content if applicable
 */
export function maybeRewriteFile(
  filename: string,
  content: string,
  options: RewriteOptions = {}
): string {
  if (!shouldRewriteFile(filename)) {
    return content;
  }

  return rewriteCDNUrls(content, options);
}
