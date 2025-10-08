# CDN Proxy Fix for WebContainer COEP Issues

## Problem

WebContainers require strict **COEP (Cross-Origin-Embedder-Policy)** headers for SharedArrayBuffer support. This causes external CDN resources to be blocked with the error:

```
Failed to load resource: net::ERR_BLOCKED_BY_RESPONSE.NotSameOriginAfterDefaultedToSameOriginByCoep
```

Common affected CDNs:
- Image placeholders: via.placeholder.com, placehold.co, ui-avatars.com
- Icon CDNs: Any external icon URL
- JS/CSS CDNs: cdn.jsdelivr.net, unpkg.com, cdnjs.cloudflare.com
- Font CDNs: fonts.gstatic.com

## Solution

Implemented a **transparent CDN proxy** that:
1. Automatically rewrites external CDN URLs in files before serving to WebContainer
2. Proxies requests through our backend with proper CORS headers
3. Works for ALL apps without agent modifications

## Architecture

### 1. CDN Proxy Endpoint (`/api/proxy-cdn`)

**Location:** `packages/ui-server/src/server.ts`

Proxies external CDN resources with proper headers:

```typescript
GET /api/proxy-cdn?url=https://via.placeholder.com/150/4CAF50
```

**Features:**
- Whitelist of allowed CDN hosts (prevents abuse)
- Sets `Cross-Origin-Resource-Policy: cross-origin`
- Sets `Access-Control-Allow-Origin: *`
- Caches responses for 24 hours
- Returns content with original MIME type

**Allowed CDN Hosts:**
- cdn.jsdelivr.net
- unpkg.com
- cdnjs.cloudflare.com
- fonts.googleapis.com, fonts.gstatic.com
- via.placeholder.com, placehold.co, ui-avatars.com
- api.dicebear.com
- raw.githubusercontent.com
- avatars.githubusercontent.com
- source.unsplash.com
- i.imgur.com

### 2. Automatic URL Rewriting

**Location:** `packages/ui-server/src/cdn-rewriter.ts`

Transparently rewrites CDN URLs in files before serving:

```typescript
// Before (in generated code):
<img src="https://via.placeholder.com/150/4CAF50" />

// After (rewritten automatically):
<img src="http://localhost:3001/api/proxy-cdn?url=https%3A%2F%2Fvia.placeholder.com%2F150%2F4CAF50" />
```

**How it works:**
1. When files are fetched via `/api/files/*`, content is scanned
2. External CDN URLs matching known patterns are rewritten
3. URLs become absolute paths to our proxy endpoint
4. Rewriting happens transparently - agent code unchanged

**Supported file types:**
- HTML, HTM
- JavaScript: JS, JSX
- TypeScript: TS, TSX
- Vue, Svelte

### 3. Integration with WebContainer

When the preview loads files:
1. Frontend requests `/api/files/App.jsx`
2. Backend reads file and rewrites CDN URLs
3. Rewritten content is sent to frontend
4. Frontend mounts files to WebContainer
5. WebContainer serves app with rewritten URLs
6. Browser loads images/assets via our proxy
7. Proxy fetches from actual CDN and returns with proper headers

## Usage

**No code changes required!** The fix works automatically for all apps.

### Example - Generated App

Agent generates:
```html
<!DOCTYPE html>
<html>
<head>
  <title>My App</title>
</head>
<body>
  <img src="https://via.placeholder.com/150/FF6B6B" alt="Red" />
  <img src="https://placehold.co/150x150/4ECDC4/white" alt="Teal" />
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</body>
</html>
```

Automatically becomes:
```html
<!DOCTYPE html>
<html>
<head>
  <title>My App</title>
</head>
<body>
  <img src="http://localhost:3001/api/proxy-cdn?url=https%3A%2F%2Fvia.placeholder.com%2F150%2FFF6B6B" alt="Red" />
  <img src="http://localhost:3001/api/proxy-cdn?url=https%3A%2F%2Fplacehold.co%2F150x150%2F4ECDC4%2Fwhite" alt="Teal" />
  <script src="http://localhost:3001/api/proxy-cdn?url=https%3A%2F%2Fcdn.jsdelivr.net%2Fnpm%2Fchart.js"></script>
</body>
</html>
```

## Configuration

### Adding New CDN Hosts

Edit `packages/ui-server/src/cdn-rewriter.ts`:

```typescript
const CDN_PATTERNS = [
  // Add new pattern
  /https?:\/\/your-cdn\.example\.com\/[^\s"'`)]+/g,
  // ... existing patterns
];
```

Edit `packages/ui-server/src/server.ts`:

```typescript
const allowedHosts = [
  // Add to whitelist
  'your-cdn.example.com',
  // ... existing hosts
];
```

### Skipping Font CDNs

If Google Fonts work directly (some COEP configs allow them):

```typescript
const rewrittenContent = maybeRewriteFile(filePath, content, {
  serverOrigin,
  skipFonts: true
});
```

## Testing

1. **Create test app with CDN resources:**
   ```bash
   curl http://localhost:3001/api/agent
   # Send: "Create an HTML page with placeholder images from via.placeholder.com"
   ```

2. **Verify URLs are rewritten:**
   ```bash
   curl http://localhost:3001/api/files/index.html
   # Check response contains proxy URLs
   ```

3. **Test proxy endpoint:**
   ```bash
   curl "http://localhost:3001/api/proxy-cdn?url=https://via.placeholder.com/150/FF6B6B"
   # Should return image with proper headers
   ```

4. **Load in WebContainer:**
   - Open UI at http://localhost:3001
   - Create app with external images
   - Preview should load without COEP errors

## Performance

- **Caching:** 24-hour cache on proxy responses
- **Overhead:** ~50ms per unique CDN resource (first load)
- **Subsequent loads:** Instant (browser cache + server cache)
- **Bandwidth:** Proxied through our server (minimal for most assets)

## Security

- **Whitelist:** Only approved CDN hosts are proxied
- **No arbitrary URLs:** Prevents abuse as proxy
- **Path traversal protection:** Already exists on file serving
- **Rate limiting:** Inherits from Fastify rate limits (if configured)

## Future Improvements

1. **Smart caching:** Use Redis/memcached for shared cache
2. **Conditional requests:** Support If-Modified-Since headers
3. **Image optimization:** Resize/compress images on-the-fly
4. **WebP conversion:** Convert to modern formats
5. **CDN fingerprinting:** Detect new CDN patterns automatically

## Troubleshooting

### URLs still blocked

**Check browser console for the exact URL being blocked.**

If it's a new CDN:
1. Add pattern to `CDN_PATTERNS` in `cdn-rewriter.ts`
2. Add host to `allowedHosts` in `server.ts`
3. Restart server

### Proxy returns 403

The CDN host is not whitelisted. Add it to `allowedHosts`.

### Proxy returns 500

Check server logs for the actual error. Likely:
- CDN is down
- CDN requires authentication
- Network issue

### Images load slowly

First load fetches from CDN. Subsequent loads use cache.

Consider:
- Adding Redis cache
- Preloading common assets
- Using local assets instead

## Related Files

- `packages/ui-server/src/server.ts` - Proxy endpoint
- `packages/ui-server/src/cdn-rewriter.ts` - URL rewriting logic
- `packages/ui-frontend/src/components/PreviewPane.tsx` - WebContainer file loading

## References

- [WebContainer COEP Requirements](https://webcontainers.io/guides/configuring-headers)
- [Cross-Origin-Embedder-Policy (MDN)](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cross-Origin-Embedder-Policy)
- [Cross-Origin-Resource-Policy (MDN)](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cross-Origin-Resource-Policy)
