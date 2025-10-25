/**
 * WebContainer command runner
 * Executes npm install and dev server commands in WebContainer
 * Now with session namespacing for isolation
 */

import type { WebContainer } from '@webcontainer/api';
import { createScopedLogger } from './logger';
import { workbenchStore } from '~/lib/stores/workbench';
import { ensureDevHeaders } from '~/lib/webcontainer/ensure-dev-headers';
import { PREVIEW_REGISTRATION_TIMEOUT_MS, WEBCONTAINER_DEFAULT_PORT } from './constants';
import type { WebContainerProcess, ExtendedWebContainer } from '~/types/webcontainer';
import serverTemplate from '~/templates/webcontainer-server.template.js?raw';
import { getSessionRoot, validateSessionOperation } from '~/lib/stores/sessionContext';
import { getWebContainerUnsafe } from '~/lib/webcontainer';

const logger = createScopedLogger('WebContainerRunner');

let devServerProcess: WebContainerProcess | null = null;
let serverRunning = false; // Track if server is already running

// Package.json change detection for auto-install
let lastPackageJsonHash: string | null = null;
let installInProgress = false;
let pendingInstall: NodeJS.Timeout | null = null;
const INSTALL_DEBOUNCE_MS = 1000; // 1 second debounce

// Build error detection debouncing
let lastErrorHash: string | null = null;
let lastErrorTime = 0;
const ERROR_DEBOUNCE_MS = 2000; // Don't report same error within 2 seconds
let hasActiveError = false; // Track if we currently have an error

/**
 * Compute hash of package.json content for change detection
 */
async function hashPackageJson(webcontainer: WebContainer, sessionRoot: string): Promise<string | null> {
  try {
    const packageJsonPath = `${sessionRoot}/package.json`;
    const content = await webcontainer.fs.readFile(packageJsonPath, 'utf8');
    // Simple hash using crypto if available, otherwise use content length + first/last chars
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const encoder = new TextEncoder();
      const data = encoder.encode(content);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } else {
      // Fallback: simple hash using content
      return `${content.length}-${content.substring(0, 50)}-${content.substring(content.length - 50)}`;
    }
  } catch {
    return null; // package.json doesn't exist
  }
}

/**
 * Clear Vite's dependency optimization cache
 * This forces Vite to re-optimize dependencies on next request
 */
async function clearViteCache(webcontainer: WebContainer, sessionRoot: string): Promise<void> {
  try {
    // Check if node_modules/.vite exists
    const viteCache = `${sessionRoot}/node_modules/.vite`;

    try {
      const stats = await webcontainer.fs.readdir(viteCache, { withFileTypes: true });

      // Directory exists, try to remove it
      // WebContainer doesn't have rm -rf, so we need to remove files first
      for (const entry of stats) {
        const entryPath = `${viteCache}/${entry.name}`;
        try {
          if (entry.isDirectory()) {
            // For directories, remove recursively (this is a best effort)
            await webcontainer.spawn('rm', ['-rf', entryPath], { cwd: sessionRoot });
          } else {
            await webcontainer.fs.rm(entryPath);
          }
        } catch {
          // Some files might be in use, continue
        }
      }

      // Remove the .vite directory itself
      try {
        await webcontainer.fs.rm(viteCache, { recursive: true });
      } catch {
        // Might fail if not empty, that's ok
      }

      logger.info('🧹 Cleared Vite cache (node_modules/.vite) to force dependency re-optimization');
    } catch {
      // .vite directory doesn't exist yet, nothing to clear
      logger.debug('No Vite cache to clear (first run or cache already cleared)');
    }
  } catch (error) {
    logger.warn('Failed to clear Vite cache:', error);
    // Non-fatal, continue anyway
  }
}

/**
 * Run npm install if package.json has changed (debounced)
 */
async function checkAndRunInstall(webcontainer: WebContainer, sessionRoot: string): Promise<void> {
  // Clear any pending install
  if (pendingInstall) {
    clearTimeout(pendingInstall);
    pendingInstall = null;
  }

  // Debounce the install
  pendingInstall = setTimeout(async () => {
    if (installInProgress) {
      logger.info('Install already in progress, skipping');
      return;
    }

    const currentHash = await hashPackageJson(webcontainer, sessionRoot);

    // No package.json or hash unchanged
    if (!currentHash || currentHash === lastPackageJsonHash) {
      return;
    }

    // Hash changed - run install
    logger.info('📦 package.json changed, running npm install...');
    installInProgress = true;

    try {
      const installProcess = await webcontainer.spawn('npm', ['install'], { cwd: sessionRoot });

      installProcess.output.pipeTo(
        new WritableStream({
          write(data) {
            logger.debug('[npm install]', data);
          },
        }),
      );

      const exitCode = await installProcess.exit;

      if (exitCode === 0) {
        logger.info('✅ npm install completed successfully');
        lastPackageJsonHash = currentHash; // Update hash only on success

        // CRITICAL: Clear Vite cache to prevent "Outdated Optimize Dep" errors
        // When new dependencies are installed, Vite's pre-bundled cache becomes stale
        // Clearing it forces Vite to re-optimize deps on next request
        await clearViteCache(webcontainer, sessionRoot);

        // Give Vite a moment to detect the cache is gone
        await new Promise(resolve => setTimeout(resolve, 500));

        logger.info('💡 Tip: If you see module errors, the preview will auto-refresh once Vite re-optimizes dependencies');
      } else {
        logger.error(`❌ npm install failed with exit code ${exitCode}`);
        // Don't update hash so it will retry next time
      }
    } catch (error) {
      logger.error('❌ npm install error:', error);
      // Don't update hash so it will retry next time
    } finally {
      installInProgress = false;
      pendingInstall = null;
    }
  }, INSTALL_DEBOUNCE_MS);
}

/**
 * Register preview URL with fallback if port event doesn't fire
 * WebContainer should automatically emit 'port' events, but this provides a safety net
 */
async function ensurePreviewRegistered(
  webcontainer: WebContainer,
  port: number = WEBCONTAINER_DEFAULT_PORT,
): Promise<void> {
  // Wait for server to start and port event to fire
  await new Promise((resolve) => setTimeout(resolve, PREVIEW_REGISTRATION_TIMEOUT_MS));

  const previews = workbenchStore.previews.get();
  const existingPreview = previews.find((p) => p.port === port);

  if (existingPreview) {
    logger.info(`✅ Preview already registered for port ${port} via port event`);
    return;
  }

  // Port event didn't fire, try manual registration
  logger.warn(`⚠️ Port event didn't fire for port ${port}, attempting manual registration...`);

  try {
    // Try to get server URL - WebContainer exposes this through the origin property
    const wcExtended = webcontainer as ExtendedWebContainer;
    let url: string | undefined;

    // Try different methods to get the URL
    if (typeof wcExtended.origin === 'string') {
      url = wcExtended.origin;
      logger.debug('Got URL from webcontainer.origin:', url);
    } else if (typeof wcExtended.serverOrigin === 'string') {
      url = wcExtended.serverOrigin;
      logger.debug('Got URL from webcontainer.serverOrigin:', url);
    }

    if (url) {
      workbenchStore.registerPreview(port, url);
      logger.info(`✅ Preview manually registered at ${url}`);
    } else {
      logger.error('❌ Could not determine WebContainer URL - preview may not load');
      logger.error(
        '   WebContainer properties:',
        Object.keys(wcExtended as any).filter((k) => !k.startsWith('_')),
      );
    }
  } catch (error) {
    logger.error('❌ Error during manual preview registration:', error);
  }
}

async function fileExists(webcontainer: WebContainer, filePath: string): Promise<boolean> {
  try {
    await webcontainer.fs.readFile(filePath, 'utf8');
    return true;
  } catch {
    return false;
  }
}

/**
 * Find package.json in the file tree
 */
function findPackageJson(files: any[]): any | null {
  for (const file of files) {
    if (file.type === 'file' && file.name === 'package.json') {
      return file;
    }
    if (file.type === 'directory' && file.children) {
      const found = findPackageJson(file.children);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Find index.html in the file tree
 */
function findIndexHtml(files: any[]): any | null {
  for (const file of files) {
    if (file.type === 'file' && file.name === 'index.html') {
      return file;
    }
    if (file.type === 'directory' && file.children) {
      const found = findIndexHtml(file.children);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Find any HTML file in the file tree
 */
function findAnyHtmlFile(files: any[]): any | null {
  for (const file of files) {
    if (file.type === 'file' && file.name.toLowerCase().endsWith('.html')) {
      return file;
    }
    if (file.type === 'directory' && file.children) {
      const found = findAnyHtmlFile(file.children);
      if (found) return found;
    }
  }
  return null;
}

// REMOVED: No proxy plugin needed - external resources load directly with COEP headers

/**
 * Start a static server for simple HTML apps with proxy endpoints and binary file handling
 */
async function startStaticServer(
  webcontainer: WebContainer,
  sessionRoot: string,
  baseDir: string = '.',
  htmlFileName: string = 'index.html',
): Promise<void> {
  logger.info('Starting static server in session:', sessionRoot, 'directory:', baseDir, 'HTML file:', htmlFileName);

  // Load server template and replace placeholders
  const serverScript = serverTemplate
    .replace(/__BASE_DIR__/g, baseDir)
    .replace(/__HTML_FILE__/g, htmlFileName)
    .replace(/__PORT__/g, String(WEBCONTAINER_DEFAULT_PORT));

  /* OLD EMBEDDED SERVER - NOW EXTRACTED TO TEMPLATE FILE
  const serverScript = `
const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE_DIR = '${baseDir}';
const PORT = ${WEBCONTAINER_DEFAULT_PORT};
const DEFAULT_FILE = '${htmlFileName}';

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, \`http://localhost:\${PORT}\`);

  // Regular static file serving - no proxying, external resources load directly
  let reqPath = url.pathname === '/' ? DEFAULT_FILE : url.pathname;
  // Strip leading slashes to ensure relative paths for WebContainer
  reqPath = reqPath.replace(/^\\/+/, '');

  // If the request targets a conventional top-level static dir, resolve from project root
  // This ensures paths like "/public/*" work even when index.html is nested (e.g., src/index.html)
  const topDir = reqPath.split('/')[0];
  const treatAsRoot = ['public', 'assets', 'static', 'images', 'media'].includes(topDir);

  const filePath = (BASE_DIR === '.' || treatAsRoot)
    ? reqPath
    : path.join(BASE_DIR, reqPath);
  const extname = path.extname(filePath);
  const contentType = mimeTypes[extname] || 'application/octet-stream';

  console.log('[Server] Request:', req.url, '-> File:', filePath);

  const tryServeFile = (attemptPath, isRetry) => {
    fs.readFile(attemptPath, (error, content) => {
      if (error) {
        if (!isRetry && (contentType.startsWith('image/') || contentType.startsWith('video/') || contentType.startsWith('audio/'))) {
          const filename = path.basename(filePath);
          const roots = ['public', 'assets', 'images', 'media', 'static'];
          const fallbackPaths = [
            // Prefer project-root fallbacks first
            ...roots.map(dir => path.join(dir, filename)),
            // Then try baseDir fallbacks (for nested setups)
            ...roots.map(dir => BASE_DIR === '.' ? path.join(dir, filename) : path.join(BASE_DIR, dir, filename))
          ];

          const tryNext = (index) => {
            if (index >= fallbackPaths.length) {
              console.error('[Server] Error: File not found after fallback search:', filePath);
              res.writeHead(404, { 'Access-Control-Allow-Origin': '*' });
              res.end('File not found: ' + filePath);
              return;
            }

            fs.readFile(fallbackPaths[index], (err, data) => {
              if (!err) {
                console.log('[Server] Found file at fallback path:', fallbackPaths[index]);
                res.writeHead(200, {
                  'Content-Type': contentType,
                  'Access-Control-Allow-Origin': '*',
                  'Cross-Origin-Resource-Policy': 'cross-origin'
                });
                res.end(data);
              } else {
                tryNext(index + 1);
              }
            });
          };

          tryNext(0);
        } else {
          console.error('[Server] Error:', error.message);
          res.writeHead(404, { 'Access-Control-Allow-Origin': '*' });
          res.end('File not found: ' + attemptPath);
        }
      } else {
        const ct = contentType.toLowerCase();
        const isBinaryContent = ct.startsWith('image/') ||
                               ct.startsWith('video/') ||
                               ct.startsWith('audio/') ||
                               ct === 'application/octet-stream';

        console.log('[Server] Serving file:', attemptPath,
                   'Type:', contentType,
                   'Binary:', isBinaryContent,
                   'Content type:', content.constructor.name,
                   'Length:', content.length);

        const contentStr = content.toString('utf-8');
        let bodyBuf;

        if (contentStr.startsWith('__BASE64__')) {
          // Decode base64 to binary Buffer
          const base64Data = contentStr.substring(10); // Remove __BASE64__ prefix
          console.log('[Server] Detected base64 marker, decoding...');
          bodyBuf = Buffer.from(base64Data, 'base64');
          console.log('[Server] Decoded from base64, buffer length:', bodyBuf.length);
        } else {
          // Regular content
          bodyBuf = Buffer.isBuffer(content) ? content : Buffer.from(content);
        }

        const headers = {
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*',
          'Cross-Origin-Resource-Policy': 'cross-origin',
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'no-store',
          'Content-Length': String(bodyBuf.length),
        };

        res.writeHead(200, headers);

        if (isBinaryContent) {
          // Debug: log magic bytes for verification
          try {
            const head = Array.from(bodyBuf.slice(0, 8))
              .map(b => b.toString(16).padStart(2, '0')).join(' ');
            console.log('[Server] Binary head:', head);
          } catch {}
          res.end(bodyBuf);
        } else {
          res.end(bodyBuf.toString('utf-8'));
        }
      }
    });
  };

  tryServeFile(filePath, false);
});

server.listen(PORT, () => {
  console.log('[Server] Static server with proxy running on port ' + PORT);
});
`;
  */ // END OLD EMBEDDED SERVER

  // Write the server script in session directory
  const serverPath = `${sessionRoot}/server.js`;
  await webcontainer.fs.writeFile(serverPath, serverScript);

  // Kill any existing dev server
  if (devServerProcess) {
    try {
      devServerProcess.kill();
    } catch (error) {
      logger.debug('Error killing previous server:', error);
    }
    devServerProcess = null;
  }

  // Start the static server with cwd set to session root
  devServerProcess = await webcontainer.spawn('node', ['server.js'], { cwd: sessionRoot });

  devServerProcess.output.pipeTo(
    new WritableStream({
      write(data) {
        logger.debug('[Static Server]', data);
      },
    }),
  );

  logger.info('Static server process started in session:', sessionRoot);

  // Ensure preview is registered (fallback if port event doesn't fire)
  ensurePreviewRegistered(webcontainer).catch((error) => {
    logger.error('Failed to ensure preview registration:', error);
  });
}

/**
 * Simple hash function for error deduplication
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(16);
}

/**
 * Strip ANSI color codes and control sequences from terminal output
 */
function stripAnsi(str: string): string {
  // Remove all ANSI escape sequences comprehensively
  return str
    .replace(/\x1B\[[0-9;?]*[a-zA-Z]/g, '') // CSI sequences: ESC [ ... letter (includes cursor positioning)
    .replace(/\x1B\][^\x07]*\x07/g, '') // OSC sequences: ESC ] ... BEL
    .replace(/\x1B\]/g, '') // Incomplete OSC
    .replace(/\x1B[=>]/g, ''); // Mode switches
}

/**
 * Detect and parse build errors from dev server output
 */
function detectBuildError(output: string, sessionRoot: string): void {
  // Strip ANSI codes for cleaner pattern matching
  const cleanOutput = stripAnsi(output);

  // Don't try to detect build success from terminal output - it's unreliable
  // Success is detected when the iframe actually loads (PREVIEW_LOADED message)
  // This prevents false positives from "VITE ready" messages that appear at server start

  // Common Vite/build error patterns (check on clean output without ANSI codes)
  const errorPatterns = [
    // Vite error with plugin: Internal server error: /path/file.jsx: Error message
    /Internal server error:\s+(.+?\.(?:jsx?|tsx?|vue|svelte)):\s+(.+?)$/mi,
    // Vite plugin errors with full details: [plugin:vite:react-babel] /path/file.jsx: error message (line:col)
    /\[plugin:([^\]]+)\]\s+(.+?)\.(?:jsx?|tsx?|vue|svelte):\s*(.+?)(?:\s+\((\d+):(\d+)\))?/s,
    // ESBuild errors: Expected ">" but found "<"
    /ERROR.*Expected\s+"(.+?)"\s+but\s+found\s+"(.+?)"/i,
    // Syntax errors with file location
    /([^\s]+\.(?:js|jsx|ts|tsx|vue|svelte)):\s+(.+?)\s+\((\d+):(\d+)\)/,
    // Unexpected token errors
    /Unexpected\s+token\s+\((\d+):(\d+)\)/i,
    // Failed to scan dependencies
    /Failed to scan for dependencies/i,
  ];

  let errorMatch = null;
  let matchedPattern = null;

  for (const pattern of errorPatterns) {
    const match = cleanOutput.match(pattern);
    if (match) {
      errorMatch = match;
      matchedPattern = pattern;
      break;
    }
  }

  if (!errorMatch) {
    return; // No recognizable error pattern
  }

  logger.error('🚨 Build error pattern matched:', errorMatch[0].substring(0, 100));

  // Extract error details
  let message = '';
  let file = '';
  let line = 0;
  let column = 0;
  let stack = '';

  // Parse based on which pattern matched
  if (errorMatch[0].includes('[plugin:')) {
    // Plugin error format: [plugin:vite:react-babel] /path/to/file.jsx: error message (line:col)
    const pluginName = errorMatch[1];
    let errorText = errorMatch[2];

    // Extract the full error message - look for the complete error description
    // Format: [plugin:name] /path/file.ext: 'message' (line:col)
    const fullErrorMatch = output.match(/\[plugin:[^\]]+\]\s+([^\n:]+\.(?:js|jsx|ts|tsx|vue|svelte)):\s*(.+?)(?:\s+\((\d+):(\d+)\))?/);

    if (fullErrorMatch) {
      file = fullErrorMatch[1];
      // Remove session path prefix for cleaner display
      file = file.replace(sessionRoot, '').replace(/^\//, '').replace(/^__session_[^_]+__\//, '');

      errorText = fullErrorMatch[2].trim();

      if (fullErrorMatch[3] && fullErrorMatch[4]) {
        line = parseInt(fullErrorMatch[3], 10);
        column = parseInt(fullErrorMatch[4], 10);
      }
    } else {
      // Fallback: Try to find any file path in the output
      const filePathMatch = output.match(/([^\s]+\.(?:js|jsx|ts|tsx|vue|svelte))(?::(\d+):(\d+))?/);
      if (filePathMatch) {
        file = filePathMatch[1].replace(sessionRoot, '').replace(/^\//, '').replace(/^__session_[^_]+__\//, '');
        if (filePathMatch[2]) line = parseInt(filePathMatch[2], 10);
        if (filePathMatch[3]) column = parseInt(filePathMatch[3], 10);
      }
    }

    message = errorText || `Build error in ${file || 'unknown file'}`;

    // Extract code snippet if available (Vite shows code with line numbers and caret)
    const snippetMatch = output.match(/(\d+)\s*\|[^\n]*\n[^\n]*\^\n?/);
    if (snippetMatch) {
      stack = snippetMatch[0];
    } else {
      // Try to get a longer context from the output
      const lines = output.split('\n');
      const errorLineIndex = lines.findIndex(l => l.includes('^'));
      if (errorLineIndex > 0) {
        stack = lines.slice(Math.max(0, errorLineIndex - 3), errorLineIndex + 2).join('\n');
      }
    }
  } else if (errorMatch[0].includes('Error:')) {
    message = errorMatch[1];
  } else if (errorMatch[0].includes('failed')) {
    message = `Failed to ${errorMatch[1]}`;
  }

  // If we couldn't extract a message, use a generic one
  if (!message) {
    message = 'Build error occurred';
  }

  // Try to extract file location from the full output if not already found
  if (!file) {
    const filePathMatch = output.match(/(?:\/[^\s:]+|[a-zA-Z]:[^\s:]+)\.(?:js|jsx|ts|tsx|vue|svelte)/);
    if (filePathMatch) {
      file = filePathMatch[0].replace(sessionRoot, '').replace(/^\//, '');
    }
  }

  // Construct a comprehensive error object
  const errorData = {
    message,
    stack: stack || output.slice(-500), // Last 500 chars of output as fallback stack
    source: 'build',
    timestamp: Date.now(),
    file,
    line,
    column,
  };

  // Debounce duplicate errors
  const errorHash = simpleHash(message + file + line);
  const now = Date.now();

  if (errorHash === lastErrorHash && (now - lastErrorTime) < ERROR_DEBOUNCE_MS) {
    // Same error within debounce window - skip
    return;
  }

  // Update tracking
  lastErrorHash = errorHash;
  lastErrorTime = now;
  hasActiveError = true; // Mark that we have an active error

  logger.error('🚨 Build error detected:', errorData);

  // Emit error to the window for Preview component to catch
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('webcontainer:build-error', {
        detail: errorData,
      }),
    );
  }
}

/**
 * Run npm install and start dev server in WebContainer
 */
export async function runDevServer(webcontainer: WebContainer, files: any[]): Promise<void> {
  try {
    validateSessionOperation('run dev server');

    logger.info('Running dev server setup...');

    const sessionRoot = getSessionRoot();
    const wc = await getWebContainerUnsafe();

    const hasPackageJson = findPackageJson(files);
    const isStaticServer = !hasPackageJson;

    // ALWAYS ensure dev headers are correct, even if server is running
    // This fixes the issue where agent overwrites vite.config without headers
    if (hasPackageJson) {
      await ensureDevHeaders(wc, sessionRoot);
    }

    // For npm-based apps with HMR, skip restart if already running
    // But still check if package.json changed and run install if needed
    if (serverRunning && !isStaticServer) {
      logger.info('Server already running - skipping restart, files will hot-reload automatically');

      // Check if package.json changed and auto-install dependencies
      if (hasPackageJson) {
        await checkAndRunInstall(wc, sessionRoot);
      }

      return;
    }

  // For static servers, trigger preview reload after files sync
  if (serverRunning && isStaticServer) {
    logger.info('Static server running - files synced, triggering preview reload');
    // Dispatch event to trigger iframe reload
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('webcontainer:static-reload'));
    }
    return;
  }

  const hasIndexHtml = findIndexHtml(files);
  const anyHtmlFile = !hasIndexHtml ? findAnyHtmlFile(files) : null;

  logger.debug('File detection:', {
    hasPackageJson: !!hasPackageJson,
    hasIndexHtml: !!hasIndexHtml,
    anyHtmlFile: anyHtmlFile?.path,
    packageJsonPath: hasPackageJson?.path,
    indexHtmlPath: hasIndexHtml?.path,
  });

  // Kill any existing dev server first (only on initial start)
  if (devServerProcess) {
    try {
      devServerProcess.kill();
      logger.info('Killed previous dev server');
    } catch (error) {
      logger.debug('Error killing previous server:', error);
    }
    devServerProcess = null;
    serverRunning = false;
  }

  if (hasPackageJson) {
    try {
      // Note: ensureDevHeaders is now called at the top of runDevServer
      // to fix the issue where agent overwrites vite.config
      // No proxy setup needed - external resources load directly with COEP headers

      logger.info('Installing dependencies in session:', sessionRoot);

      // Run npm install with cwd set to session root
      const installProcess = await wc.spawn('npm', ['install'], { cwd: sessionRoot });

      installProcess.output.pipeTo(
        new WritableStream({
          write(data) {
            logger.debug('[npm install]', data);
          },
        }),
      );

      const installExitCode = await installProcess.exit;
      logger.info(`npm install completed with exit code ${installExitCode}`);

      if (installExitCode !== 0) {
        logger.error('npm install failed');
        return;
      }

      // Initialize package.json hash after successful first install
      lastPackageJsonHash = await hashPackageJson(wc, sessionRoot);
      logger.debug('Initialized package.json hash for change detection');

      // Clear Vite cache after initial install (ensures clean state)
      await clearViteCache(wc, sessionRoot);

      // Start dev server with cwd set to session root
      logger.info('Starting dev server in session:', sessionRoot);
      devServerProcess = await wc.spawn('npm', ['run', 'dev'], { cwd: sessionRoot });

      // Parse dev server output for build errors
      let outputBuffer = '';
      let lastErrorCheck = 0;
      const ERROR_CHECK_INTERVAL = 500; // Check for errors every 500ms

      devServerProcess.output.pipeTo(
        new WritableStream({
          write(data) {
            logger.debug('[npm run dev]', data);

            // Accumulate output for error detection
            outputBuffer += data;

            // Throttle error detection to avoid excessive processing
            const now = Date.now();
            const shouldCheck =
              outputBuffer.toLowerCase().includes('error') ||
              outputBuffer.toLowerCase().includes('failed') ||
              outputBuffer.includes('[plugin:') ||
              (now - lastErrorCheck) > ERROR_CHECK_INTERVAL;

            if (shouldCheck) {
              detectBuildError(outputBuffer, sessionRoot);
              lastErrorCheck = now;
            }

            // Keep buffer size reasonable (last 8000 chars for better context)
            if (outputBuffer.length > 8000) {
              outputBuffer = outputBuffer.slice(-8000);
            }
          },
        }),
      );

      serverRunning = true; // Mark server as running
      logger.info('Dev server started successfully');

      // Ensure preview is registered (fallback if port event doesn't fire)
      ensurePreviewRegistered(wc).catch((error) => {
        logger.error('Failed to ensure preview registration:', error);
      });
    } catch (error) {
      logger.error('Failed to start dev server:', error);
      serverRunning = false;
    }
  } else if (hasIndexHtml || anyHtmlFile) {
    // For simple HTML apps, start a static server
    const htmlFile = hasIndexHtml || anyHtmlFile;
    const indexPath = htmlFile!.path;

    // Normalize path: strip leading slashes for baseDir calculation
    const normalizedPath = indexPath.replace(/^\/+/, '');

    let baseDir = '.';
    if (normalizedPath.includes('/')) {
      const lastSlash = normalizedPath.lastIndexOf('/');
      baseDir = normalizedPath.substring(0, lastSlash);
    }

    // Extract the HTML filename for the default route
    const htmlFileName = normalizedPath.includes('/')
      ? normalizedPath.substring(normalizedPath.lastIndexOf('/') + 1)
      : normalizedPath;

    logger.debug('Static server config:', {
      sessionRoot,
      indexPath,
      normalizedPath,
      baseDir,
      htmlFileName,
    });

    try {
      await startStaticServer(wc, sessionRoot, baseDir, htmlFileName);
      serverRunning = true; // Mark server as running
    } catch (error) {
      logger.error('Failed to start static server:', error);
      serverRunning = false;
    }
  } else {
    logger.warn('No package.json or HTML file found - cannot start preview');
  }
  } catch (error) {
    logger.error('Failed to run dev server:', error);
    throw error;
  }
}

/**
 * Stop the currently running dev server
 */
export function stopDevServer(): void {
  if (devServerProcess) {
    try {
      devServerProcess.kill();
      logger.info('Dev server stopped');
    } catch (error) {
      logger.error('Failed to stop dev server:', error);
    }
    devServerProcess = null;
    serverRunning = false;
  }
}

/**
 * Reset server state - call when starting a new conversation
 * This ensures the next app creation will start a fresh server
 */
export function resetServerState(): void {
  logger.info('Resetting server state for new conversation');
  serverRunning = false;

  // Stop any running server process
  if (devServerProcess) {
    try {
      devServerProcess.kill();
      logger.debug('Killed existing dev server process');
    } catch (error) {
      logger.debug('Error killing dev server (may already be stopped):', error);
    }
    devServerProcess = null;
  }
}
