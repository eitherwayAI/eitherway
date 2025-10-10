/**
 * WebContainer command runner
 * Executes npm install and dev server commands in WebContainer
 */

import type { WebContainer } from '@webcontainer/api';
import { createScopedLogger } from './logger';
import { workbenchStore } from '~/lib/stores/workbench';

const logger = createScopedLogger('WebContainerRunner');

let devServerProcess: any = null;
let serverRunning = false; // Track if server is already running

/**
 * Register preview URL with fallback if port event doesn't fire
 * WebContainer should automatically emit 'port' events, but this provides a safety net
 */
async function ensurePreviewRegistered(webcontainer: WebContainer, port: number = 3000): Promise<void> {
  // Wait for server to start and port event to fire
  await new Promise(resolve => setTimeout(resolve, 3000));

  const previews = workbenchStore.previews.get();
  const existingPreview = previews.find(p => p.port === port);

  if (existingPreview) {
    logger.info(`✅ Preview already registered for port ${port} via port event`);
    return;
  }

  // Port event didn't fire, try manual registration
  logger.warn(`⚠️ Port event didn't fire for port ${port}, attempting manual registration...`);

  try {
    // Try to get server URL - WebContainer exposes this through the origin property
    const wcAny = webcontainer as any;
    let url: string | undefined;

    // Try different methods to get the URL
    if (typeof wcAny.origin === 'string') {
      url = wcAny.origin;
      logger.debug('Got URL from webcontainer.origin:', url);
    } else if (typeof wcAny.serverOrigin === 'string') {
      url = wcAny.serverOrigin;
      logger.debug('Got URL from webcontainer.serverOrigin:', url);
    }

    if (url) {
      workbenchStore.registerPreview(port, url);
      logger.info(`✅ Preview manually registered at ${url}`);
    } else {
      logger.error('❌ Could not determine WebContainer URL - preview may not load');
      logger.error('   WebContainer properties:', Object.keys(wcAny).filter(k => !k.startsWith('_')));
    }
  } catch (error) {
    logger.error('❌ Error during manual preview registration:', error);
  }
}

/**
 * Check if a file exists in WebContainer
 */
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

/**
 * Start a static server for simple HTML apps with proxy endpoints and binary file handling
 */
async function startStaticServer(webcontainer: WebContainer, baseDir: string = '.', htmlFileName: string = 'index.html'): Promise<void> {
  logger.info('Starting static server for directory:', baseDir, 'HTML file:', htmlFileName);

  const serverScript = `
const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE_DIR = '${baseDir}';
const PORT = 3000;
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

// Simple cache for proxy requests
const cache = new Map();
const CACHE_TTL = 30000; // 30 seconds

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, \`http://localhost:\${PORT}\`);

  // Proxy API endpoint - uses fetch API which works in WebContainer
  if (url.pathname === '/api/proxy-api') {
    const targetUrl = url.searchParams.get('url');
    if (!targetUrl) {
      res.writeHead(400);
      res.end('Missing url parameter');
      return;
    }

    try {
      // Check cache first
      const cacheKey = targetUrl;
      const cached = cache.get(cacheKey);
      if (cached && (Date.now() - cached.time) < CACHE_TTL) {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'X-Cache': 'HIT'
        });
        res.end(cached.data);
        return;
      }

      // Fetch using browser's fetch API (works in WebContainer)
      const response = await fetch(targetUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'WebContainer/1.0'
        }
      });

      const data = await response.text();

      // Cache successful responses
      if (response.ok) {
        cache.set(cacheKey, { data, time: Date.now() });
      }

      res.writeHead(response.status, {
        'Content-Type': response.headers.get('content-type') || 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(data);
    } catch (error) {
      console.error('[Proxy API] Error:', error.message);
      res.writeHead(500);
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // Proxy CDN endpoint
  if (url.pathname === '/api/proxy-cdn') {
    const targetUrl = url.searchParams.get('url');
    if (!targetUrl) {
      res.writeHead(400);
      res.end('Missing url parameter');
      return;
    }

    try {
      const response = await fetch(targetUrl);
      const buffer = Buffer.from(await response.arrayBuffer());

      res.writeHead(response.status, {
        'Content-Type': response.headers.get('content-type') || 'application/octet-stream',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400'
      });
      res.end(buffer);
    } catch (error) {
      console.error('[Proxy CDN] Error:', error.message);
      res.writeHead(500);
      res.end('Proxy error');
    }
    return;
  }

  // Regular static file serving
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

        // Check if content is base64-encoded (our marker)
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

  // Write the server script
  await webcontainer.fs.writeFile('/server.js', serverScript);

  // Kill any existing dev server
  if (devServerProcess) {
    try {
      devServerProcess.kill();
    } catch (error) {
      logger.debug('Error killing previous server:', error);
    }
    devServerProcess = null;
  }

  // Start the static server
  devServerProcess = await webcontainer.spawn('node', ['server.js']);

  devServerProcess.output.pipeTo(
    new WritableStream({
      write(data) {
        logger.debug('[Static Server]', data);
      },
    }),
  );

  logger.info('Static server process started');

  // Ensure preview is registered (fallback if port event doesn't fire)
  ensurePreviewRegistered(webcontainer).catch((error) => {
    logger.error('Failed to ensure preview registration:', error);
  });
}

/**
 * Run npm install and start dev server in WebContainer
 */
export async function runDevServer(webcontainer: WebContainer, files: any[]): Promise<void> {
  logger.info('Running dev server setup...');

  const hasPackageJson = findPackageJson(files);
  const isStaticServer = !hasPackageJson;

  // For npm-based apps with HMR, skip restart if already running
  // For static servers, we need to trigger a preview reload since they don't have HMR
  if (serverRunning && !isStaticServer) {
    logger.info('Server already running - skipping restart, files will hot-reload automatically');
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
      logger.info('Installing dependencies...');

      // Run npm install
      const installProcess = await webcontainer.spawn('npm', ['install']);

      // Log output
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

      // Start dev server
      logger.info('Starting dev server...');
      devServerProcess = await webcontainer.spawn('npm', ['run', 'dev']);

      devServerProcess.output.pipeTo(
        new WritableStream({
          write(data) {
            logger.debug('[npm run dev]', data);
          },
        }),
      );

      serverRunning = true; // Mark server as running
      logger.info('Dev server started successfully');

      // Ensure preview is registered (fallback if port event doesn't fire)
      ensurePreviewRegistered(webcontainer).catch((error) => {
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

    // Calculate base directory from normalized path
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
      indexPath,
      normalizedPath,
      baseDir,
      htmlFileName,
    });

    try {
      await startStaticServer(webcontainer, baseDir, htmlFileName);
      serverRunning = true; // Mark server as running
    } catch (error) {
      logger.error('Failed to start static server:', error);
      serverRunning = false;
    }
  } else {
    logger.warn('No package.json or HTML file found - cannot start preview');
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
