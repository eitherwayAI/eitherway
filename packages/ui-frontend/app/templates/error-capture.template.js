/**
 * Universal Error Capture System
 * Captures all types of errors and reports them to the parent window
 * Injected into every preview to enable automatic error fixing
 */
(function() {
  'use strict';

  class UniversalErrorCapture {
    constructor() {
      this.capturedErrors = [];
      this.errorCount = 0;
      this.initCapture();
      console.log('[ErrorCapture] Universal error handler initialized');
    }

    /**
     * Initialize all error capture mechanisms
     */
    initCapture() {
      // 1. Capture Vite build/import errors
      if (typeof import.meta !== 'undefined' && import.meta.hot) {
        import.meta.hot.on('vite:error', (payload) => {
          console.log('[ErrorCapture] Vite error detected:', payload);
          this.capture({
            message: payload.err?.message || String(payload),
            stack: payload.err?.stack || '',
            file: payload.err?.file || '',
            line: payload.err?.line || 0,
            column: payload.err?.column || 0
          }, 'build');
        });

        // Override Vite's error overlay display
        import.meta.hot.on('vite:beforeUpdate', () => {
          try {
            const overlay = document.querySelector('vite-error-overlay');
            if (overlay) {
              overlay.style.display = 'none';
              console.log('[ErrorCapture] Hid Vite error overlay');
            }
          } catch (e) {
            // Ignore
          }
        });
      }

      // 2. Capture runtime JavaScript errors
      window.addEventListener('error', (event) => {
        console.log('[ErrorCapture] Runtime error detected:', event);
        this.capture({
          message: event.message,
          stack: event.error?.stack || '',
          file: event.filename || '',
          line: event.lineno || 0,
          column: event.colno || 0
        }, 'runtime');

        // Prevent default error display
        event.preventDefault();
        return true;
      });

      // 3. Capture unhandled promise rejections
      window.addEventListener('unhandledrejection', (event) => {
        console.log('[ErrorCapture] Promise rejection detected:', event);
        this.capture({
          message: event.reason?.message || String(event.reason),
          stack: event.reason?.stack || ''
        }, 'promise');

        // Prevent default handling
        event.preventDefault();
        return true;
      });

      // 4. Override console.error to catch framework errors
      const originalError = console.error;
      console.error = (...args) => {
        // Check if this looks like an error object
        const firstArg = args[0];
        if (firstArg && (firstArg instanceof Error || (typeof firstArg === 'object' && firstArg.message))) {
          this.capture({
            message: firstArg.message || String(firstArg),
            stack: firstArg.stack || ''
          }, 'console');
        } else if (typeof firstArg === 'string' && (firstArg.includes('Error') || firstArg.includes('Failed'))) {
          // Looks like an error message string
          this.capture({
            message: args.join(' '),
            stack: new Error().stack || ''
          }, 'console');
        }

        // Always call original console.error
        originalError.apply(console, args);
      };

      console.log('[ErrorCapture] All error listeners registered');
    }

    /**
     * Capture and report an error
     */
    capture(error, source) {
      this.errorCount++;

      const errorData = {
        // Raw error info - no processing or categorization
        message: error.message || String(error),
        stack: error.stack || '',
        source: source, // 'build', 'runtime', 'promise', 'console'
        timestamp: Date.now(),

        // Environment snapshot
        url: window.location.href,
        userAgent: navigator.userAgent,

        // File context if available
        file: error.file || '',
        line: error.line || 0,
        column: error.column || 0,

        // Error count for deduplication
        errorNumber: this.errorCount
      };

      console.log('[ErrorCapture] Captured error #' + this.errorCount + ':', errorData);

      // Send to parent window immediately
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

      // Store locally
      this.capturedErrors.push(errorData);

      // Keep only last 10 errors
      if (this.capturedErrors.length > 10) {
        this.capturedErrors.shift();
      }
    }
  }

  // Initialize error capture immediately
  try {
    window.__errorCapture = new UniversalErrorCapture();
    console.log('[ErrorCapture] System active and monitoring');
  } catch (e) {
    console.error('[ErrorCapture] Failed to initialize:', e);
  }
})();
