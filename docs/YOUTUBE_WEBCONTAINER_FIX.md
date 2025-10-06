# YouTube Embed + WebContainer COEP Fix Guide

## Table of Contents
- [Overview](#overview)
- [Problems Encountered](#problems-encountered)
- [Root Cause Analysis](#root-cause-analysis)
- [Solutions Implemented](#solutions-implemented)
- [Technical Deep Dive](#technical-deep-dive)
- [Code Changes](#code-changes)
- [Testing & Verification](#testing--verification)
- [References](#references)

---

## Overview

This guide documents the comprehensive fixes applied to enable YouTube video embeds within WebContainer-powered applications. The issues stemmed from Cross-Origin-Embedder-Policy (COEP) restrictions required by WebContainer's SharedArrayBuffer usage.

**Date:** October 2025
**Affected Components:** Runtime Agent, Preview Pane, WebContainer Integration
**Technologies:** WebContainer API, COEP Credentialless, Iframe Security Policies

---

## Problems Encountered

### 1. **Permissions Policy Violations**
```
[Violation] Potential permissions policy violation: autoplay is not allowed
[Violation] Potential permissions policy violation: encrypted-media is not allowed
[Violation] Potential permissions policy violation: fullscreen is not allowed
[Violation] Potential permissions policy violation: accelerometer is not allowed
[Violation] Potential permissions policy violation: gyroscope is not allowed
[Violation] Potential permissions policy violation: clipboard-write is not allowed
[Violation] Potential permissions policy violation: web-share is not allowed
```

**Symptom:** Console warnings indicating iframe permissions were not properly configured.

---

### 2. **YouTube Refused to Connect**
```
www.youtube-nocookie.com refused to connect
```

**Symptom:** YouTube embeds completely blocked from loading in the WebContainer preview iframe.

---

### 3. **Port Already in Use (EADDRINUSE)**
```
Error: listen EADDRINUSE: address already in use :::3000
```

**Symptom:** Static server attempting to start multiple times on the same port, causing crashes.

---

## Root Cause Analysis

### COEP + WebContainer + YouTube Triple-Constraint

```
┌─────────────────────────────────────────────────────────────┐
│ WebContainer Requirements                                   │
│ ├─ Requires SharedArrayBuffer for browser-based Node.js    │
│ └─ SharedArrayBuffer requires COEP: credentialless          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ COEP: credentialless Policy                                 │
│ ├─ Blocks cross-origin resources without proper headers    │
│ ├─ YouTube doesn't send CORP headers for embeds            │
│ └─ Nested iframes inherit parent's COEP restrictions        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Solution: Iframe credentialless Attribute                   │
│ ├─ Loads iframe in separate context without credentials    │
│ ├─ Bypasses COEP restrictions for that specific iframe     │
│ └─ Supported in Chrome 110+, Edge, Opera                   │
└─────────────────────────────────────────────────────────────┘
```

### Why This Happens

1. **WebContainer boots with COEP: credentialless**
   ```typescript
   bootPromise = WebContainer.boot({
     coep: 'credentialless',  // Required for SharedArrayBuffer
     workdirName: 'project'
   });
   ```

2. **COEP propagates to nested contexts**
   - The preview iframe inherits COEP restrictions
   - User-generated HTML inside WebContainer also inherits restrictions
   - YouTube iframes get blocked unless explicitly allowed

3. **YouTube doesn't support COEP**
   - YouTube's embed endpoints don't send `Cross-Origin-Resource-Policy` headers
   - Issue tracked: https://issuetracker.google.com/issues/351843802
   - No timeline for YouTube to add COEP support

### The credentialless Attribute Solution

The `credentialless` iframe attribute (formerly "anonymous iframe") allows embedding cross-origin content in COEP environments:

```html
<iframe credentialless src="https://youtube.com/embed/..."></iframe>
```

**How it works:**
- Loads iframe in a fresh, empty context
- Strips all credentials (cookies, storage)
- Server only responds with public data
- Bypasses COEP embedding restrictions

**Browser Support:**
- ✅ Chrome 110+ (default, no flags)
- ✅ Edge 110+
- ✅ Opera 96+
- ⚠️ Firefox: Under consideration
- ⚠️ Safari: No signal yet

---

## Solutions Implemented

### Solution 1: Agent System Prompt (PRIMARY FIX)
**Location:** `packages/runtime/src/agent.ts`
**Strategy:** Teach the AI to generate correct YouTube embeds from the start

### Solution 2: Preview Iframe Permissions
**Location:** `packages/ui-frontend/src/components/PreviewPane.tsx`
**Strategy:** Configure preview iframe with proper sandbox and permissions policies

### Solution 3: Static Server Fix
**Location:** `packages/ui-frontend/src/components/PreviewPane.tsx`
**Strategy:** Prevent duplicate server starts causing EADDRINUSE errors

---

## Code Changes

### Change 1: Agent System Prompt (CRITICAL)

**File:** `packages/runtime/src/agent.ts`

**Before:**
```typescript
YOUTUBE EMBED REQUIREMENTS (CRITICAL):
  - ALWAYS use /embed/VIDEO_ID URL, NEVER /watch?v=VIDEO_ID
  - Use youtube-nocookie.com for privacy (not youtube.com)
  - MUST include ALL these attributes or video will fail:

  Correct YouTube embed template:
  <iframe
    width="560"
    height="315"
    src="https://www.youtube-nocookie.com/embed/VIDEO_ID"
    title="YouTube video player"
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
    allowfullscreen
  ></iframe>

  Replace VIDEO_ID with actual video ID (from youtube.com/watch?v=VIDEO_ID)
  The allow attribute is REQUIRED - without it the video will be blocked
  Permissions-Policy warnings in console are expected and can be ignored
```

**After:**
```typescript
YOUTUBE EMBED REQUIREMENTS (CRITICAL):
  - ALWAYS use /embed/VIDEO_ID URL, NEVER /watch?v=VIDEO_ID
  - Use youtube-nocookie.com for privacy (not youtube.com)
  - MUST include ALL these attributes or video will fail in WebContainer:

  Correct YouTube embed template:
  <iframe
    width="560"
    height="315"
    src="https://www.youtube-nocookie.com/embed/VIDEO_ID"
    title="YouTube video player"
    frameborder="0"
    credentialless
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
    allowfullscreen
  ></iframe>

  Replace VIDEO_ID with actual video ID (from youtube.com/watch?v=VIDEO_ID)
  The credentialless attribute is REQUIRED for WebContainer COEP policy
  The allow attribute is REQUIRED - without these the video will be blocked
```

**Changes:**
- ✅ Added `credentialless` attribute to template (line 43)
- ✅ Updated explanation to mention WebContainer COEP policy (line 34, 49-50)
- ✅ Clarified that both attributes are required (line 50)

**Why This is the Primary Fix:**
- AI generates code with correct attributes from the start
- No runtime manipulation needed
- Code is portable and works outside WebContainer
- Users see proper HTML in their generated files

**Build Step Required:**
```bash
cd packages/runtime
npm run build
```

---

### Change 2: Preview Iframe Permissions

**File:** `packages/ui-frontend/src/components/PreviewPane.tsx`

#### Desktop Preview Iframe

**Before (Line ~601):**
```tsx
<iframe
  key={refreshKey}
  ref={iframeRef}
  className="preview-frame"
  src={previewUrl}
  title="Preview"
  onLoad={() => setIframeLoaded(true)}
  style={{...}}
/>
```

**After (Line 605-624):**
```tsx
<iframe
  key={refreshKey}
  ref={iframeRef}
  className="preview-frame"
  src={previewUrl}
  title="Preview"
  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-popups-to-escape-sandbox allow-presentation"
  allow="autoplay; encrypted-media; fullscreen; accelerometer; gyroscope; clipboard-write; web-share; picture-in-picture"
  onLoad={() => setIframeLoaded(true)}
  style={{...}}
/>
```

#### Mobile Preview Iframe

**Before (Line ~545):**
```tsx
<iframe
  key={refreshKey}
  ref={iframeRef}
  className="preview-frame-mobile"
  src={previewUrl}
  title="Preview"
  onLoad={() => setIframeLoaded(true)}
  style={{...}}
/>
```

**After (Line 549-562):**
```tsx
<iframe
  key={refreshKey}
  ref={iframeRef}
  className="preview-frame-mobile"
  src={previewUrl}
  title="Preview"
  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-popups-to-escape-sandbox allow-presentation"
  allow="autoplay; encrypted-media; fullscreen; accelerometer; gyroscope; clipboard-write; web-share; picture-in-picture"
  onLoad={() => setIframeLoaded(true)}
  style={{...}}
/>
```

**Attributes Added:**

**`sandbox` attribute:**
```
allow-scripts              - Enable JavaScript execution
allow-same-origin          - Allow same-origin access
allow-forms                - Allow form submissions
allow-popups               - Allow popup windows
allow-modals               - Allow modal dialogs
allow-popups-to-escape-sandbox - Allow unrestricted popups
allow-presentation         - Allow Presentation API (fullscreen)
```

**`allow` attribute (Permissions Policy):**
```
autoplay                   - Allow video autoplay
encrypted-media            - Allow DRM/encrypted content playback
fullscreen                 - Allow fullscreen mode
accelerometer              - Allow device orientation access
gyroscope                  - Allow gyroscope access
clipboard-write            - Allow clipboard operations
web-share                  - Allow Web Share API
picture-in-picture         - Allow Picture-in-Picture mode
```

**Why These Are Needed:**
- `sandbox` allows secure execution while maintaining security boundaries
- `allow` grants specific permissions that YouTube embeds require
- Both work together to enable rich media features

---

### Change 3: Static Server EADDRINUSE Fix

**File:** `packages/ui-frontend/src/components/PreviewPane.tsx`

**Problem:** Server was being started multiple times on port 3000, causing crashes.

**Before (Line ~448):**
```typescript
await containerRef.current.fs.writeFile('/server.js', serverScript);

// Start the static server
const serverProcess = await containerRef.current.spawn('node', ['server.js']);
```

**After (Line 448-454):**
```typescript
await containerRef.current.fs.writeFile('/server.js', serverScript);

// Mark server as started BEFORE spawning to prevent duplicate starts
serverStartedRef.current = true;

// Start the static server
const serverProcess = await containerRef.current.spawn('node', ['server.js']);
```

**Why This Works:**
- Sets `serverStartedRef.current = true` BEFORE spawning
- Prevents duplicate server starts in the same session
- Line 236 checks: `serverAlreadyRunning = currentRunningSessionId === sessionId && serverStartedRef.current`
- If already running, skips server spawn and just syncs files

---

## Technical Deep Dive

### Understanding COEP Modes

| COEP Value | Behavior | Use Case |
|------------|----------|----------|
| `unsafe-none` | No restrictions (default) | Regular websites |
| `require-corp` | Requires CORP on all cross-origin resources | Strict isolation |
| `credentialless` | Allows cross-origin without CORP, strips credentials | WebContainer, modern apps |

### WebContainer Boot Configuration

```typescript
// packages/ui-frontend/src/components/PreviewPane.tsx (Line 26-29)
bootPromise = WebContainer.boot({
  coep: 'credentialless',  // Required for SharedArrayBuffer
  workdirName: 'project'
});
```

**Why credentialless?**
- Enables SharedArrayBuffer (needed for WebAssembly, threading)
- Less strict than `require-corp` (would break most embeds)
- Strips credentials from cross-origin requests (security win)
- Browser default for cross-origin isolation

### Iframe Security Policies Hierarchy

```
┌────────────────────────────────────────────┐
│ Top-level Document                         │
│ COEP: credentialless                       │
│                                            │
│  ┌──────────────────────────────────────┐ │
│  │ Preview Iframe                       │ │
│  │ sandbox="allow-scripts allow-..."    │ │
│  │ allow="autoplay; encrypted-media..." │ │
│  │                                      │ │
│  │  ┌────────────────────────────────┐ │ │
│  │  │ User's HTML (in WebContainer)  │ │ │
│  │  │                                │ │ │
│  │  │  <iframe credentialless        │ │ │
│  │  │    src="youtube.com/embed/...">│ │ │
│  │  │                                │ │ │
│  │  │  ↓ Loads in isolated context   │ │ │
│  │  │  ✅ YouTube video works!        │ │ │
│  │  └────────────────────────────────┘ │ │
│  └──────────────────────────────────────┘ │
└────────────────────────────────────────────┘
```

### Permission Policy Propagation

Without proper configuration:
```
Parent COEP → Child Iframe → Nested YouTube Iframe
credentialless → inherits → BLOCKED ❌
```

With credentialless attribute:
```
Parent COEP → Child Iframe → Nested YouTube Iframe (credentialless)
credentialless → inherits → isolated context ✅
```

---

## Testing & Verification

### Test Case 1: Generate YouTube App

**Prompt to AI:**
```
Create a simple HTML page with a YouTube video embed showing Rick Astley's "Never Gonna Give You Up"
```

**Expected Generated Code:**
```html
<!DOCTYPE html>
<html>
<head>
  <title>YouTube Test</title>
</head>
<body>
  <h1>YouTube Embed Test</h1>
  <iframe
    width="560"
    height="315"
    src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"
    title="YouTube video player"
    frameborder="0"
    credentialless
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
    allowfullscreen
  ></iframe>
</body>
</html>
```

**Verification Checklist:**
- ✅ `credentialless` attribute present
- ✅ `allow` attribute with all permissions
- ✅ Uses `youtube-nocookie.com` (privacy-enhanced)
- ✅ Uses `/embed/VIDEO_ID` format
- ✅ Includes `allowfullscreen`

### Test Case 2: Verify Preview Loads

**Steps:**
1. Create app with YouTube video
2. Open Live Preview
3. Check browser console for errors

**Expected Results:**
- ✅ No "refused to connect" errors
- ✅ No permissions policy violation errors
- ✅ YouTube video loads and plays
- ⚠️ Minor CORS warnings are OK (fetch.worker.96435430.js preload warning)

### Test Case 3: Multiple Video Test

**HTML:**
```html
<iframe credentialless src="https://youtube-nocookie.com/embed/VIDEO1"></iframe>
<iframe credentialless src="https://youtube-nocookie.com/embed/VIDEO2"></iframe>
<iframe credentialless src="https://youtube-nocookie.com/embed/VIDEO3"></iframe>
```

**Expected:**
- ✅ All videos load simultaneously
- ✅ No port conflicts (EADDRINUSE)
- ✅ Smooth playback

### Test Case 4: Session Switching

**Steps:**
1. Create conversation with YouTube app
2. Switch to different conversation
3. Switch back to original conversation

**Expected:**
- ✅ Server doesn't restart (no EADDRINUSE)
- ✅ Video still loads
- ✅ Preview URL reused from cache

---

## Browser Compatibility

### credentialless Attribute Support

| Browser | Version | Status | Notes |
|---------|---------|--------|-------|
| Chrome | 110+ | ✅ Supported | Default, no flags |
| Edge | 110+ | ✅ Supported | Chromium-based |
| Opera | 96+ | ✅ Supported | Chromium-based |
| Firefox | - | ⚠️ Under consideration | See [Bug 1629122](https://bugzilla.mozilla.org/show_bug.cgi?id=1629122) |
| Safari | - | ❌ No signal | Use fallback |

### Fallback Strategy

For browsers without credentialless support:

```html
<!-- Option 1: Detect and warn user -->
<script>
  const iframe = document.createElement('iframe');
  if (!('credentialless' in iframe)) {
    alert('Your browser may not support YouTube embeds in this environment. Please use Chrome 110+ or Edge.');
  }
</script>

<!-- Option 2: Proxy through your own backend -->
<!-- (Not recommended for this use case) -->
```

---

## References

### Official Documentation
- [Chrome Developers: Iframe credentialless](https://developer.chrome.com/blog/iframe-credentialless)
- [MDN: IFrame credentialless](https://developer.mozilla.org/en-US/docs/Web/Security/IFrame_credentialless)
- [WICG Spec: Anonymous iframe](https://wicg.github.io/anonymous-iframe/)
- [Chrome: COEP credentialless](https://developer.chrome.com/blog/coep-credentialless-origin-trial)

### Related Issues
- [Google Issue Tracker: YouTube COEP Support](https://issuetracker.google.com/issues/351843802)
- [Stack Overflow: COEP credentialless YouTube](https://stackoverflow.com/questions/79017843/)
- [StackBlitz Blog: WebContainer COEP](https://blog.stackblitz.com/posts/bringing-webcontainers-to-all-browsers/)

### WebContainer Documentation
- [WebContainer API Docs](https://webcontainers.io/api)
- [Cross-Browser Support with COOP/COEP](https://blog.stackblitz.com/posts/cross-browser-with-coop-coep/)

---

## Summary

### What We Fixed

| Issue | Root Cause | Solution | File Changed |
|-------|------------|----------|--------------|
| Permissions violations | Missing `allow` attribute | Added permissions policy | PreviewPane.tsx:555, 612 |
| YouTube refused to connect | COEP blocking cross-origin | Added `credentialless` to AI template | agent.ts:43 |
| EADDRINUSE errors | Duplicate server starts | Set flag before spawn | PreviewPane.tsx:451 |

### Key Takeaways

1. **Fix at the source** - Teach the AI to generate correct code, not runtime patches
2. **Understanding COEP** - WebContainer requires credentialless for SharedArrayBuffer
3. **Iframe security** - Both `sandbox` and `allow` attributes matter
4. **Browser support** - credentialless is Chromium-only for now
5. **Testing matters** - Always verify across different scenarios

### Architecture Decision

We chose to fix this at the **AI agent level** rather than runtime manipulation because:

✅ **Correctness** - Generated code is portable and correct
✅ **Transparency** - Users see proper HTML in their files
✅ **Performance** - No runtime overhead parsing/modifying HTML
✅ **Maintainability** - Single source of truth in system prompt
✅ **Education** - Users learn best practices from AI examples

---

## Changelog

**2025-10-06** - Initial implementation
- Added credentialless attribute to agent system prompt
- Added sandbox and allow attributes to preview iframes
- Fixed EADDRINUSE errors in static server
- Removed runtime HTML injection workaround
- Compiled runtime package with updated agent prompt

---

**End of Guide**

For questions or issues, check:
- Console errors in browser DevTools
- WebContainer logs in preview pane
- Agent transcript files in `./transcripts/`
