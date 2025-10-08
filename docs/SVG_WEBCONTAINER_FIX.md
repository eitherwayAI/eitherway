# SVG Rendering and Icons in WebContainer Environments

## Problem

SVG images fail to display in WebContainer live preview, even though the same code works perfectly when opened locally in a browser. No console errors appear, making this issue particularly difficult to diagnose.

Additionally, emojis used as icons may have inconsistent rendering across different platforms and browsers, appearing unprofessional in user-facing applications.

### Symptoms
- ✅ SVGs display correctly when HTML file is opened locally
- ❌ SVGs don't appear in WebContainer preview
- ❌ No error messages in console
- ❌ No network request failures

## Root Cause

WebContainer uses **COEP (Cross-Origin-Embedder-Policy): credentialless** to enable SharedArrayBuffer and cross-origin isolation. This security policy creates several issues with SVG rendering:

### Issue 1: Data URI Restrictions
SVG data URIs (`data:image/svg+xml,...`) may be blocked by:
- **CSP (Content Security Policy)** - Many CSP configurations block `data:` URIs in `img-src` directive
- **COEP credentialless bugs** - Known Chromium bugs with image loading in credentialless mode
- **SVG `<use>` restrictions** - As of December 2023, `<use xlink:href="data:...">` is explicitly blocked

### Issue 2: Missing CORS Headers
Even same-origin resources may require explicit CORS headers in COEP environments to be loaded correctly.

### Issue 3: SVG Namespace
Dynamically created SVG elements must include the `xmlns="http://www.w3.org/2000/svg"` namespace attribute or they may not render.

## Solution

### 1. Agent System Prompt Updates
Updated `packages/runtime/src/agent.ts` with comprehensive SVG guidance:

```
SVG USAGE IN WEBCONTAINER (CRITICAL):
  - WebContainer uses COEP credentialless which can block improperly formatted SVGs
  - ALWAYS prefer inline SVG over data URIs for reliability
  - Data URIs (data:image/svg+xml,...) may be blocked by CSP or COEP policies

  Option 1 - Inline SVG (PREFERRED):
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
    <path d="..."/>
  </svg>

  Option 2 - External SVG file:
  Create icon.svg as a separate file, then reference it:
  <img src="icon.svg" alt="Icon">

  AVOID these patterns in WebContainer:
  ❌ <img src="data:image/svg+xml,..."> (may be blocked by COEP/CSP)
  ❌ background: url('data:image/svg+xml,...') (may be blocked)
  ❌ <use xlink:href="data:..."> (explicitly blocked since Dec 2023)
```

### 2. Static Server CORS Headers
Updated `packages/ui-frontend/src/components/PreviewPane.tsx` to add CORS headers to all static file responses:

```javascript
res.writeHead(200, {
  'Content-Type': contentType,
  'Access-Control-Allow-Origin': '*',
  'Cross-Origin-Resource-Policy': 'cross-origin'
});
```

This ensures SVG files (and all other resources) can be loaded even in strict COEP environments.

## Icon Guidelines: No Emojis

### ❌ DON'T: Use Emojis or Unicode Symbols as Icons
```html
<!-- Emojis are unreliable and unprofessional -->
<h1>🚀 CryptoVerse</h1>
<button>💰 Buy Now</button>
<div class="status">✅ Success</div>

<!-- Unicode symbols are too simple and unprofessional -->
<h1>▲ CryptoVerse</h1>
<button>$ Buy Now</button>
<div class="status">✓ Success</div>
<div>• Bitcoin ★ Ethereum ◆ Solana</div>
```

**Why avoid emojis:**
- Inconsistent rendering across platforms (Windows, Mac, Linux, mobile)
- May not render correctly in WebContainer environment
- Appear unprofessional in production applications
- Accessibility issues (screen readers may not interpret them well)
- Color and style cannot be controlled via CSS

**Why avoid Unicode symbols (•, ◆, ★, →, ✓, etc.):**
- Too simple and primitive for modern web applications
- Limited styling options
- Inconsistent appearance across fonts
- Cannot be colored or animated like SVG
- Appear unprofessional compared to proper SVG icons

### ✅ DO: Use Proper SVG Icons

#### Option 1: Inline SVG Icons (BEST for WebContainer)
```html
<h1>
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
  </svg>
  CryptoVerse
</h1>

<button>
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82zM7 7a1 1 0 100-2 1 1 0 000 2z"/>
  </svg>
  Buy Now
</button>
```

**Why inline SVG is best:**
- Most reliable in WebContainer COEP environments
- No external requests or CORS issues
- Fully customizable via CSS (colors, sizes, animations)
- Professional appearance
- Works identically across all platforms

#### Option 2: Find SVG Icons Online Using Web Search

The agent can use `web_search` to find professional SVG icons:

**Search queries:**
- "free SVG rocket icon Heroicons"
- "open source SVG icons chart"
- "Feather Icons SVG checkmark"
- "Material Icons SVG download"

**Popular open-source icon libraries:**
- **Heroicons** (https://heroicons.com) - Clean, modern, MIT licensed
- **Feather Icons** (https://feathericons.com) - Minimalist, open source
- **Material Icons** (https://fonts.google.com/icons) - Google's icon set
- **Bootstrap Icons** (https://icons.getbootstrap.com) - 1,800+ icons
- **Lucide** (https://lucide.dev) - Fork of Feather with more icons

**Workflow:**
1. Use `web_search` to find icon: "Heroicons rocket SVG"
2. Copy the SVG code from the source
3. Paste inline in HTML or create separate .svg file
4. Customize colors via `fill` or `stroke` attributes

#### Option 3: External SVG Files (for reusable icon sets)
```html
<!-- icons/rocket.svg -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
</svg>

<!-- icons/chart.svg -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <path d="M3 3v18h18M9 17V9m4 8V5m4 12v-7"/>
</svg>

<!-- index.html -->
<h1><img src="icons/rocket.svg" width="24" height="24" alt="Rocket"> CryptoVerse</h1>
<div><img src="icons/chart.svg" width="20" height="20" alt="Chart"> Market Data</div>
```

**Benefits:**
- Organize icons in dedicated directory
- Reuse same icon across multiple pages
- Easy to update icons globally
- Proper CORS headers from WebContainer server

## Best Practices for SVG in WebContainer

### ✅ DO: Use Inline SVG
```html
<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="40" fill="#3498db"/>
  <path d="M30 50 L50 70 L70 30" stroke="white" stroke-width="4" fill="none"/>
</svg>
```

**Why it works:**
- No external requests
- No CORS or COEP issues
- Always includes namespace
- Full control over styling

### ✅ DO: Use External SVG Files
```html
<!-- icon.svg -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
</svg>

<!-- index.html -->
<img src="icon.svg" alt="Shield icon">
```

**Why it works:**
- Served through WebContainer's static server with CORS headers
- Reusable across pages
- Can be cached
- No CSP restrictions

### ✅ DO: Create SVG Sprites
```html
<!-- sprites.svg -->
<svg xmlns="http://www.w3.org/2000/svg" style="display: none;">
  <symbol id="icon-home" viewBox="0 0 24 24">
    <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
  </symbol>
  <symbol id="icon-user" viewBox="0 0 24 24">
    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
  </symbol>
</svg>

<!-- Usage -->
<svg width="24" height="24">
  <use href="#icon-home"/>
</svg>
```

**Why it works:**
- Single file for all icons
- Uses same-origin `<use>` references (not data URIs)
- Efficient and maintainable

### ❌ DON'T: Use Data URI in img src
```html
<!-- This may be blocked by COEP/CSP -->
<img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E...%3C/svg%3E">
```

### ❌ DON'T: Use Data URI in CSS
```css
/* This may be blocked by CSP */
.icon {
  background: url('data:image/svg+xml,...');
}
```

### ❌ DON'T: Use Data URI with SVG `<use>`
```html
<!-- Explicitly blocked since December 2023 -->
<svg>
  <use xlink:href="data:image/svg+xml,..."/>
</svg>
```

## Testing SVG Rendering

### Test Case 1: Inline SVG
```html
<!DOCTYPE html>
<html>
<head>
  <title>SVG Test - Inline</title>
</head>
<body>
  <h1>Inline SVG Test</h1>
  <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="40" fill="#e74c3c"/>
    <text x="50" y="55" text-anchor="middle" fill="white" font-size="20">OK</text>
  </svg>
</body>
</html>
```

**Expected result:** Red circle with "OK" text displays in WebContainer

### Test Case 2: External SVG File
```html
<!-- test.svg -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#2ecc71"/>
  <text x="50" y="55" text-anchor="middle" fill="white" font-size="20">OK</text>
</svg>

<!-- index.html -->
<!DOCTYPE html>
<html>
<head>
  <title>SVG Test - External</title>
</head>
<body>
  <h1>External SVG Test</h1>
  <img src="test.svg" alt="Test SVG">
</body>
</html>
```

**Expected result:** Green square with "OK" text displays in WebContainer

## Technical Details

### COEP: credentialless
WebContainer uses this COEP mode to enable SharedArrayBuffer while allowing cross-origin resources:

```
Cross-Origin-Embedder-Policy: credentialless
Cross-Origin-Opener-Policy: same-origin
```

This policy:
- ✅ Allows cross-origin requests without credentials
- ✅ Enables SharedArrayBuffer
- ❌ May block data: URIs depending on CSP
- ❌ May have browser-specific bugs with image loading

### Known Browser Issues
- **Chromium bug**: COEP credentialless incorrectly blocks cross-origin images proxied through service workers
- **SVG `<use>` restriction**: Data URIs in `<use>` elements blocked since December 2023 for security
- **CSP interaction**: Some CSP configurations block `data:` URIs even in credentialless mode

## Migration Guide

### From Emojis/Unicode to SVG Icons

#### Example 1: Emoji to SVG (using web_search)

**Before (Emoji - unprofessional):**
```html
<h1>🚀 CryptoVerse</h1>
```

**After (SVG - professional):**
```html
<!-- Use web_search: "Heroicons rocket SVG" -->
<h1>
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
    <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
    <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/>
    <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>
  </svg>
  CryptoVerse
</h1>
```

#### Example 2: Unicode Symbol to SVG

**Before (Unicode - too simple):**
```html
<button>✓ Confirm</button>
```

**After (SVG - professional):**
```html
<!-- Use web_search: "Feather Icons checkmark SVG" -->
<button>
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
  Confirm
</button>
```

#### Example 3: Complete Crypto Dashboard

**Before (Emojis/Unicode - unprofessional):**
```html
<div class="crypto-card">
  <h2>💰 Bitcoin</h2>
  <p class="price">$45,000 ↑</p>
  <div class="stats">
    <span>📊 Volume: $1.2B</span>
    <span>★ Favorite</span>
  </div>
</div>
```

**After (SVG icons - professional):**
```html
<div class="crypto-card">
  <h2>
    <!-- Bitcoin icon from web_search: "cryptocurrency SVG icons" -->
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.09 12.76L17.58 10.2C15.83 9.5 14.21 9.61 12.75 10.74L13.24 8.18C14.7 7.05 16.32 6.94 18.07 7.64L18.56 5.09L20.31 5.59L19.82 8.14C21.57 8.84 22.93 10.19 23.63 11.94L21.08 12.43C20.38 10.68 19.03 9.32 17.28 8.62L16.79 11.18C18.54 11.88 19.9 13.23 20.6 14.98L18.05 15.47C17.35 13.72 16 12.36 14.25 11.66L13.76 14.22C15.51 14.92 16.87 16.27 17.57 18.02L15.02 18.51C14.32 16.76 12.97 15.4 11.22 14.7L10.73 17.26C12.48 17.96 13.84 19.31 14.54 21.06L11.99 21.55C11.29 19.8 9.94 18.44 8.19 17.74L7.7 20.3L5.95 19.8L6.44 17.24C4.69 16.54 3.33 15.19 2.63 13.44L5.18 12.95C5.88 14.7 7.23 16.06 8.98 16.76L9.47 14.2C7.72 13.5 6.36 12.15 5.66 10.4L8.21 9.91C8.91 11.66 10.26 13.02 12.01 13.72L12.5 11.16C10.75 10.46 9.39 9.11 8.69 7.36L11.24 6.87C11.94 8.62 13.29 9.98 15.04 10.68L15.53 8.12L17.28 8.62L16.79 11.18L17.09 12.76Z"/>
    </svg>
    Bitcoin
  </h2>
  <p class="price">
    $45,000
    <!-- Trend up arrow from Heroicons -->
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="3">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
      <polyline points="17 6 23 6 23 12"/>
    </svg>
  </p>
  <div class="stats">
    <span>
      <!-- Chart icon from Feather Icons -->
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" y1="20" x2="12" y2="10"/>
        <line x1="18" y1="20" x2="18" y2="4"/>
        <line x1="6" y1="20" x2="6" y2="16"/>
      </svg>
      Volume: $1.2B
    </span>
    <span>
      <!-- Star icon from Heroicons -->
      <svg width="16" height="16" viewBox="0 0 24 24" fill="gold" stroke="currentColor" stroke-width="1">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      </svg>
      Favorite
    </span>
  </div>
</div>
```

### From SVG Data URIs to Inline SVG

If you have existing code using SVG data URIs:

**Before (Data URI - may be blocked by COEP/CSP):**
```html
<img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z'/%3E%3C/svg%3E">
```

**After (Inline SVG - reliable in WebContainer):**
```html
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
  <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
</svg>
```

**Or (External file - reusable):**
```html
<!-- shield.svg -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
</svg>

<!-- index.html -->
<img src="shield.svg" alt="Shield">
```

## Summary

**Root causes:**
1. COEP credentialless + CSP policies block SVG data URIs
2. Emojis and Unicode symbols are unprofessional and inconsistent

**Solutions:**
1. Use inline SVG or external .svg files instead of data URIs
2. Never use emojis or Unicode symbols as icons
3. Use `web_search` to find professional SVG icons from Heroicons, Feather Icons, Material Icons, etc.

**Prevention:** Agent system prompt now guides AI to:
- Generate WebContainer-compatible SVG code
- Use professional SVG icons instead of emojis/Unicode
- Search for proper icon libraries when needed

**Impact:** All future apps will use:
- Reliable SVG patterns that work in WebContainer
- Professional icons with consistent cross-platform rendering
- Modern, clean UI with proper icon libraries

## Related Documentation
- [YouTube WebContainer Fix](./YOUTUBE_WEBCONTAINER_FIX.md) - Similar COEP credentialless issues
- [HTTPS Setup](./HTTPS_SETUP.md) - WebContainer security configuration
- [WebContainer Fixes](../WEBCONTAINER_FIXES.md) - Comprehensive CORS/COEP solutions
