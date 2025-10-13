const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE_DIR = '__BASE_DIR__';
const PORT = __PORT__;
const DEFAULT_FILE = '__HTML_FILE__';

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
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Regular static file serving - no proxying, external resources load directly
  let reqPath = url.pathname === '/' ? DEFAULT_FILE : url.pathname;
  // Strip leading slashes to ensure relative paths for WebContainer
  reqPath = reqPath.replace(/^\/+/, '');

  // If the request targets a conventional top-level static dir, resolve from project root
  // This ensures paths like "/public/*" work even when index.html is nested (e.g., src/index.html)
  const topDir = reqPath.split('/')[0];
  const treatAsRoot = ['public', 'assets', 'static', 'images', 'media'].includes(topDir);

  const filePath = BASE_DIR === '.' || treatAsRoot ? reqPath : path.join(BASE_DIR, reqPath);
  const extname = path.extname(filePath);
  const contentType = mimeTypes[extname] || 'application/octet-stream';

  console.log('[Server] Request:', req.url, '-> File:', filePath);

  const tryServeFile = (attemptPath, isRetry) => {
    fs.readFile(attemptPath, (error, content) => {
      if (error) {
        if (
          !isRetry &&
          (contentType.startsWith('image/') || contentType.startsWith('video/') || contentType.startsWith('audio/'))
        ) {
          const filename = path.basename(filePath);
          const roots = ['public', 'assets', 'images', 'media', 'static'];
          const fallbackPaths = [
            // Prefer project-root fallbacks first
            ...roots.map((dir) => path.join(dir, filename)),
            // Then try baseDir fallbacks (for nested setups)
            ...roots.map((dir) => (BASE_DIR === '.' ? path.join(dir, filename) : path.join(BASE_DIR, dir, filename))),
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
                  'Cross-Origin-Resource-Policy': 'cross-origin',
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
        const isBinaryContent =
          ct.startsWith('image/') ||
          ct.startsWith('video/') ||
          ct.startsWith('audio/') ||
          ct === 'application/octet-stream';

        console.log(
          '[Server] Serving file:',
          attemptPath,
          'Type:',
          contentType,
          'Binary:',
          isBinaryContent,
          'Content type:',
          content.constructor.name,
          'Length:',
          content.length,
        );

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
              .map((b) => b.toString(16).padStart(2, '0'))
              .join(' ');
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
