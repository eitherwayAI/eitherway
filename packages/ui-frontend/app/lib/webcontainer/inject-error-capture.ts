import type { WebContainer } from '@webcontainer/api';

/**
 * Inject error capture script into index.html
 * This script sends runtime errors to the parent window for auto-fix
 */
export async function injectErrorCapture(webcontainer: WebContainer, sessionRoot: string = '.') {
  console.log('[injectErrorCapture] Starting error capture injection in session:', sessionRoot);

  // Find index.html
  const candidates = ['index.html', 'public/index.html', 'src/index.html', 'dist/index.html'];
  let htmlPath: string | undefined;

  for (const path of candidates) {
    const fullPath = sessionRoot === '.' ? path : `${sessionRoot}/${path}`;
    try {
      await webcontainer.fs.readFile(fullPath);
      htmlPath = fullPath;
      console.log('[injectErrorCapture] Found index.html:', fullPath);
      break;
    } catch {
      continue;
    }
  }

  if (!htmlPath) {
    console.log('[injectErrorCapture] No index.html found, skipping');
    return;
  }

  try {
    let html = await webcontainer.fs.readFile(htmlPath, 'utf-8');

    // Remove broken/old error capture scripts first
    if (html.includes('ERROR_CAPTURE_SCRIPT')) {
      console.log('[injectErrorCapture] Removing old error capture script');
      // Remove the entire script block (from ERROR_CAPTURE_SCRIPT comment to closing </script>)
      html = html.replace(/<!-- ERROR_CAPTURE_SCRIPT -->[\s\S]*?<\/script>\s*/g, '');
      console.log('[injectErrorCapture] Old script removed, will re-inject fixed version');
    } else if (html.includes('UniversalErrorCapture')) {
      console.log('[injectErrorCapture] Error capture already present and valid, skipping');
      return;
    }

    // Error capture script (inline to avoid file path issues)
    const errorCaptureScript = `
<!-- ERROR_CAPTURE_SCRIPT -->
<script>
(function() {
  'use strict';
  class UniversalErrorCapture {
    constructor() {
      this.capturedErrors = [];
      this.errorCount = 0;
      this.initCapture();
      console.log('[ErrorCapture] Universal error handler initialized');
    }

    initCapture() {
      // 1. Capture runtime JavaScript errors
      window.addEventListener('error', (event) => {
        console.log('[ErrorCapture] Runtime error detected:', event);
        this.capture({
          message: event.message,
          stack: event.error?.stack || '',
          file: event.filename || '',
          line: event.lineno || 0,
          column: event.colno || 0
        }, 'runtime');
        event.preventDefault();
        return true;
      });

      // 2. Capture unhandled promise rejections
      window.addEventListener('unhandledrejection', (event) => {
        console.log('[ErrorCapture] Promise rejection detected:', event);
        this.capture({
          message: event.reason?.message || String(event.reason),
          stack: event.reason?.stack || ''
        }, 'promise');
        event.preventDefault();
        return true;
      });

      // 3. Override console.error to catch framework errors
      const originalError = console.error;
      console.error = (...args) => {
        const firstArg = args[0];
        if (firstArg && (firstArg instanceof Error || (typeof firstArg === 'object' && firstArg.message))) {
          this.capture({
            message: firstArg.message || String(firstArg),
            stack: firstArg.stack || ''
          }, 'console');
        } else if (typeof firstArg === 'string' && (firstArg.includes('Error') || firstArg.includes('Failed'))) {
          this.capture({
            message: args.join(' '),
            stack: new Error().stack || ''
          }, 'console');
        }
        originalError.apply(console, args);
      };

      console.log('[ErrorCapture] All error listeners registered');
    }

    capture(error, source) {
      this.errorCount++;
      const errorData = {
        message: error.message || String(error),
        stack: error.stack || '',
        source: source,
        timestamp: Date.now(),
        url: window.location.href,
        userAgent: navigator.userAgent,
        file: error.file || '',
        line: error.line || 0,
        column: error.column || 0,
        errorNumber: this.errorCount
      };

      console.log('[ErrorCapture] Captured error #' + this.errorCount + ':', errorData);

      try {
        window.parent.postMessage({
          type: 'PREVIEW_ERROR',
          error: errorData,
          sessionId: window.__SESSION_ID__ || 'unknown'
        }, '*');
        console.log('[ErrorCapture] Error sent to parent window');
      } catch (e) {
        console.error('[ErrorCapture] Failed to send error to parent:', e);
      }

      this.capturedErrors.push(errorData);
      if (this.capturedErrors.length > 10) {
        this.capturedErrors.shift();
      }
    }
  }

  try {
    window.__errorCapture = new UniversalErrorCapture();
    console.log('[ErrorCapture] System active and monitoring');

    // Send PREVIEW_LOADED only if no errors occurred during load
    window.addEventListener('load', () => {
      // Wait a bit for errors to be captured
      setTimeout(() => {
        try {
          const errorCount = window.__errorCapture.errorCount;
          if (errorCount === 0) {
            window.parent.postMessage({ type: 'PREVIEW_LOADED' }, '*');
            console.log('[ErrorCapture] PREVIEW_LOADED message sent (no errors)');
          } else {
            console.log('[ErrorCapture] Skipping PREVIEW_LOADED - ' + errorCount + ' errors detected');
          }
        } catch (e) {
          console.error('[ErrorCapture] Failed to send PREVIEW_LOADED:', e);
        }
      }, 500);
    });
  } catch (e) {
    console.error('[ErrorCapture] Failed to initialize:', e);
  }
})();
</script>
`;

    // Inject before closing </head> or at start of <body>
    let updatedHtml: string;
    if (html.includes('</head>')) {
      updatedHtml = html.replace('</head>', `${errorCaptureScript}\n</head>`);
    } else if (html.includes('<body>')) {
      updatedHtml = html.replace('<body>', `<body>\n${errorCaptureScript}`);
    } else {
      console.log('[injectErrorCapture] No <head> or <body> tag found, skipping');
      return;
    }

    await webcontainer.fs.writeFile(htmlPath, updatedHtml);
    console.log('[injectErrorCapture] Successfully injected error capture script');
  } catch (error) {
    console.error('[injectErrorCapture] Failed to inject error capture:', error);
  }
}
