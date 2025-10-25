/**
 * Universal Error Capture System v2
 * Captures all error types and reports to parent window for auto-fixing
 * MUST be injected as <script type="module">
 */

class UniversalErrorCapture {
  constructor() {
    this.capturedErrors = [];
    this.errorCount = 0;
    this.sessionId = window.__SESSION_ID__ || 'unknown';
    this.viteOverlayObserver = null;

    console.log('[ErrorCapture] Initializing v2 with session:', this.sessionId);
    this.initCapture();
    this.hideViteOverlay();
    console.log('[ErrorCapture] Ready and monitoring');
  }

  /**
   * Initialize all error capture mechanisms
   */
  initCapture() {
    // 1. Capture Vite build/HMR errors
    if (import.meta.hot) {
      console.log('[ErrorCapture] Vite HMR detected, installing hooks');

      // Capture vite errors
      import.meta.hot.on('vite:error', (payload) => {
        console.log('[ErrorCapture] Vite error event:', payload);

        // Extract error details from payload
        const error = payload.err || payload.error || payload;

        this.capture({
          message: error.message || String(payload),
          stack: error.stack || (payload.stack) || '',
          file: error.file || error.id || '',
          line: error.line || error.loc?.line || 0,
          column: error.column || error.loc?.column || 0
        }, 'build');
      });

      // Hide overlay before HMR updates
      import.meta.hot.on('vite:beforeUpdate', () => {
        this.hideViteOverlay();
      });
    }

    // 2. Capture runtime JavaScript errors
    window.addEventListener('error', (event) => {
      console.log('[ErrorCapture] Runtime error:', event);

      this.capture({
        message: event.message || 'Runtime error',
        stack: event.error?.stack || '',
        file: event.filename || '',
        line: event.lineno || 0,
        column: event.colno || 0
      }, 'runtime');

      // Prevent default error display
      event.preventDefault();
      return true;
    }, true); // Use capture phase to catch before other handlers

    // 3. Capture unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      console.log('[ErrorCapture] Promise rejection:', event);

      const reason = event.reason;
      this.capture({
        message: reason?.message || String(reason),
        stack: reason?.stack || new Error(String(reason)).stack || ''
      }, 'promise');

      event.preventDefault();
      return true;
    });

    // 4. Intercept console.error
    const originalError = console.error;
    console.error = (...args) => {
      const firstArg = args[0];

      // Check if this looks like an error
      if (firstArg instanceof Error) {
        this.capture({
          message: firstArg.message,
          stack: firstArg.stack || ''
        }, 'console');
      } else if (typeof firstArg === 'object' && firstArg?.message) {
        this.capture({
          message: firstArg.message || String(firstArg),
          stack: firstArg.stack || ''
        }, 'console');
      } else if (typeof firstArg === 'string') {
        // Check if it's an error message
        const msg = args.join(' ');
        if (msg.includes('Error') || msg.includes('Failed') || msg.includes('failed')) {
          this.capture({
            message: msg,
            stack: new Error().stack || ''
          }, 'console');
        }
      }

      // Always call original
      originalError.apply(console, args);
    };

    console.log('[ErrorCapture] All error listeners registered');
  }

  /**
   * Aggressively hide Vite's error overlay using MutationObserver
   */
  hideViteOverlay() {
    // Immediately hide any existing overlay
    const existing = document.querySelector('vite-error-overlay');
    if (existing) {
      existing.style.display = 'none';
      console.log('[ErrorCapture] Hid existing Vite overlay');
    }

    // Set up observer to catch overlays as they're added
    if (!this.viteOverlayObserver) {
      this.viteOverlayObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (node.nodeName === 'VITE-ERROR-OVERLAY') {
              node.style.display = 'none';
              console.log('[ErrorCapture] Intercepted and hid Vite overlay');
            }
          }
        }
      });

      this.viteOverlayObserver.observe(document.documentElement, {
        childList: true,
        subtree: true
      });

      console.log('[ErrorCapture] MutationObserver watching for Vite overlays');
    }
  }

  /**
   * Capture and report an error
   */
  capture(errorData, source) {
    this.errorCount++;

    const error = {
      message: errorData.message || 'Unknown error',
      stack: errorData.stack || '',
      source: source,
      timestamp: Date.now(),
      url: window.location.href,
      file: errorData.file || '',
      line: errorData.line || 0,
      column: errorData.column || 0,
      errorNumber: this.errorCount
    };

    console.log(`[ErrorCapture] Captured error #${this.errorCount} (${source}):`, error.message);
    console.log('[ErrorCapture] Full error data:', error);

    // Send to parent window
    try {
      window.parent.postMessage({
        type: 'PREVIEW_ERROR',
        error: error,
        sessionId: this.sessionId
      }, '*');

      console.log('[ErrorCapture] Error sent to parent window');
    } catch (err) {
      console.error('[ErrorCapture] Failed to send error to parent:', err);
    }

    // Store locally (limit to 10 most recent)
    this.capturedErrors.push(error);
    if (this.capturedErrors.length > 10) {
      this.capturedErrors.shift();
    }
  }

  /**
   * Get all captured errors
   */
  getErrors() {
    return this.capturedErrors;
  }

  /**
   * Clear all captured errors
   */
  clearErrors() {
    this.capturedErrors = [];
    this.errorCount = 0;
    console.log('[ErrorCapture] Cleared all errors');
  }
}

// Initialize the error capture system
try {
  window.__errorCapture = new UniversalErrorCapture();
  console.log('[ErrorCapture] System active');

  // Notify parent that we're loaded and ready
  window.parent.postMessage({
    type: 'PREVIEW_LOADED',
    timestamp: Date.now()
  }, '*');
} catch (error) {
  console.error('[ErrorCapture] Failed to initialize:', error);
}
