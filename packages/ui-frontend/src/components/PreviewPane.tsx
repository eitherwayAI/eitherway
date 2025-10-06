import { useEffect, useState, useRef } from 'react';
import { WebContainer } from '@webcontainer/api';

interface PreviewPaneProps {
  files: any[];
  sessionId: string | null;
  onUrlChange?: (url: string) => void;
  deviceMode?: 'desktop' | 'mobile';
}

// Global singleton to prevent multiple WebContainer instances
let webContainerInstance: WebContainer | null = null;
let bootPromise: Promise<WebContainer> | null = null;
let currentRunningSessionId: string | null = null; // Track which session has a running server
let currentServerUrl: string | null = null; // Track the current server URL

async function getWebContainer(): Promise<WebContainer> {
  if (webContainerInstance) {
    return webContainerInstance;
  }

  if (bootPromise) {
    return bootPromise;
  }

  bootPromise = WebContainer.boot({
    coep: 'credentialless',
    workdirName: 'project'
  });
  webContainerInstance = await bootPromise;
  bootPromise = null;

  return webContainerInstance;
}

// Helper to tear down WebContainer completely (exported for potential external use)
export function tearDownWebContainer() {
  if (webContainerInstance) {
    try {
      console.log('[WebContainer] Tearing down container...');
      webContainerInstance.teardown();
      webContainerInstance = null;
      bootPromise = null;
      currentRunningSessionId = null;
      currentServerUrl = null;
      console.log('[WebContainer] Container torn down successfully');
    } catch (err) {
      console.error('[WebContainer] Error tearing down:', err);
      // Force reset even if teardown fails
      webContainerInstance = null;
      bootPromise = null;
      currentRunningSessionId = null;
      currentServerUrl = null;
    }
  }
}

export default function PreviewPane({ files, sessionId, onUrlChange, deviceMode = 'desktop' }: PreviewPaneProps) {
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [containerReady, setContainerReady] = useState(false);
  const [serverStatus, setServerStatus] = useState<string>('Not started');
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const containerRef = useRef<WebContainer | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const serverStartedRef = useRef(false);
  const currentSessionRef = useRef<string | null>(null);
  const isTearingDownRef = useRef(false);

  // Refresh iframe when files change
  useEffect(() => {
    if (previewUrl && files.length > 0) {
      // Small delay to ensure files are synced
      const timer = setTimeout(() => {
        setRefreshKey(prev => prev + 1);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [files, previewUrl]);

  // Reset iframe loaded state when URL changes
  useEffect(() => {
    setIframeLoaded(false);
  }, [previewUrl]);


  // Handle session changes: teardown old container, then boot new one
  useEffect(() => {
    // Don't boot if there's no session
    if (!sessionId) {
      return;
    }

    let mounted = true;
    const isSessionChange = currentSessionRef.current !== null && currentSessionRef.current !== sessionId;

    const setupContainer = async () => {
      try {
        // If session changed, teardown old container quickly, then boot new one
        if (isSessionChange) {
          console.log('[PreviewPane] Session changed from', currentSessionRef.current, 'to', sessionId);

          // Reset state immediately for UI responsiveness
          setPreviewUrl('');
          setLoading(true);
          setError(null);
          setContainerReady(false);
          setServerStatus('Switching...');
          setIframeLoaded(false);
          serverStartedRef.current = false;

          if (onUrlChange) {
            onUrlChange('');
          }

          // Teardown old container as fast as possible (no delay)
          isTearingDownRef.current = true;
          containerRef.current = null; // Clear ref immediately

          // Teardown without logging/delay to minimize switch time
          if (webContainerInstance) {
            try {
              // Synchronous teardown
              webContainerInstance.teardown();
            } catch (err) {
              // Ignore errors, just continue
            }
          }

          // Reset globals immediately
          webContainerInstance = null;
          bootPromise = null;
          currentRunningSessionId = null;
          currentServerUrl = null;
          isTearingDownRef.current = false;

          console.log('[PreviewPane] Old container torn down, booting new container...');
        }

        // Update current session
        currentSessionRef.current = sessionId;

        // Check if this session already has a running server (from previous mount)
        if (currentRunningSessionId === sessionId && currentServerUrl && webContainerInstance) {
          console.log('[PreviewPane] Session', sessionId, 'already has a running server, reusing URL:', currentServerUrl);

          if (!mounted) return;

          containerRef.current = webContainerInstance;
          setPreviewUrl(currentServerUrl);
          if (onUrlChange) onUrlChange(currentServerUrl);
          setContainerReady(true);
          setLoading(false);
          setServerStatus('Preview ready');
          return;
        }

        if (!mounted) {
          return;
        }

        setLoading(true);
        setError(null);

        console.log('[WebContainer] Booting for session:', sessionId);
        const container = await getWebContainer();

        if (!mounted || isTearingDownRef.current) {
          return;
        }

        containerRef.current = container;

        // Listen for server ready
        container.on('server-ready', (port, url) => {
          console.log('[WebContainer] Server ready on port', port, 'URL:', url);
          if (mounted) {
            setPreviewUrl(url);
            if (onUrlChange) onUrlChange(url);
            setLoading(false);
            // Track this session as having a running server
            currentRunningSessionId = sessionId;
            currentServerUrl = url;
          }
        });

        // Also listen for errors
        container.on('error', (error) => {
          console.error('[WebContainer] Error:', error);
          if (mounted) {
            setError(error.message || 'WebContainer error');
          }
        });

        console.log('[WebContainer] Booted successfully, marking container as ready...');
        setLoading(false);
        setContainerReady(true); // This will trigger the file sync useEffect
      } catch (err: any) {
        console.error('WebContainer setup error:', err);
        if (mounted) {
          setError(err.message);
          setLoading(false);
        }
      }
    };

    setupContainer();

    return () => {
      mounted = false;
    };
  }, [sessionId, onUrlChange]); // Run when session changes

  // Sync files and run dev server when files change
  useEffect(() => {
    console.log('[PreviewPane] Sync triggered - containerReady:', containerReady, 'files:', files.length);

    if (isTearingDownRef.current) {
      console.log('[PreviewPane] Container is being torn down, skipping sync');
      return;
    }

    if (!containerRef.current) {
      console.log('[PreviewPane] Container not ready (containerRef is null)');
      return;
    }

    if (files.length === 0) {
      console.log('[PreviewPane] No files to sync');
      return;
    }

    // Check if server is already running for this session
    const serverAlreadyRunning = currentRunningSessionId === sessionId && serverStartedRef.current;

    if (serverAlreadyRunning) {
      console.log('[PreviewPane] Server already running for session', sessionId, '- re-syncing files only');
    } else {
      console.log('[PreviewPane] ✅ Starting file sync and server...');
    }

    console.log('[PreviewPane] ✅ Starting file sync...');

    const syncFilesToContainer = async (fileNodes: any[]): Promise<Record<string, any>> => {
      if (!sessionId) {
        console.warn('[PreviewPane] No sessionId available for file sync');
        return {};
      }

      const fileTree: any = {};
      const filePromises: Promise<void>[] = [];

      const processNode = (node: any, currentPath: string[] = []) => {
        if (node.type === 'directory') {
          const dirPath = [...currentPath, node.name];
          if (node.children) {
            node.children.forEach((child: any) => processNode(child, dirPath));
          }
        } else if (node.type === 'file') {
          const encodedPath = encodeURIComponent(node.path);
          const promise = fetch(`/api/sessions/${sessionId}/files/read?path=${encodedPath}`)
            .then(res => res.json())
            .then(data => {
              // Strip leading slash and split path
              // "/public/file.png" → "public/file.png" → ["public", "file.png"]
              const normalizedPath = node.path.replace(/^\/+/, '');
              const pathParts = normalizedPath.split('/').filter((part: string) => part.length > 0);

              if (pathParts.length === 0) {
                console.error(`[PreviewPane] Invalid path: ${node.path}`);
                return;
              }

              let current = fileTree;

              // Build directory structure (all parts except last)
              for (let i = 0; i < pathParts.length - 1; i++) {
                const part = pathParts[i];
                if (!current[part]) {
                  current[part] = { directory: {} };
                }
                current = current[part].directory;
              }

              const fileName = pathParts[pathParts.length - 1];

              // Handle binary vs text files
              let fileContents: string;
              if (data.isBinary && data.content) {
                // Binary file: store as base64 string prefixed with __BASE64__ marker
                // Server will decode it - this avoids Uint8Array corruption in WebContainer
                let normalized = String(data.content).replace(/^\s+|\s+$/g, '');
                // Fix common corruption where a stray '0' prefixes a valid PNG base64
                if ((data.mimeType || '').toLowerCase().includes('image/png') && normalized[0] === '0' && normalized[1] === 'i') {
                  normalized = normalized.slice(1);
                }
                fileContents = '__BASE64__' + normalized;
                console.log(`[PreviewPane] Binary file ${node.path}: stored as base64, length: ${normalized.length}`);
              } else {
                // Text file: use as string
                fileContents = data.content || '';
              }

              current[fileName] = {
                file: {
                  contents: fileContents
                }
              };
            })
            .catch(err => console.error('Failed to fetch file:', node.path, err));

          filePromises.push(promise);
        }
      };

      fileNodes.forEach(node => processNode(node));

      await Promise.all(filePromises);

      // Debug: Log the file tree structure
      console.log('[PreviewPane] File tree structure:', JSON.stringify(fileTree, (_key, value) => {
        if (typeof value === 'string' && value.startsWith('__BASE64__')) {
          return `Base64(${value.length - 10} chars)`;
        }
        return value;
      }, 2));

      return fileTree;
    };

    const findFile = (nodes: any[], name: string): any | null => {
      for (const node of nodes) {
        if (node.type === 'file' && node.name === name) return node;
        if (node.type === 'directory' && node.children) {
          const found = findFile(node.children, name);
          if (found) return found;
        }
      }
      return null;
    };

    const syncAndRun = async () => {
      try {
        setLoading(true);

        // Check if container is still valid before syncing
        if (isTearingDownRef.current || !containerRef.current) {
          console.log('[PreviewPane] Container no longer valid, aborting sync');
          return;
        }

        // Sync files to WebContainer
        const fileTree = await syncFilesToContainer(files);

        // Check again after async operation
        if (isTearingDownRef.current || !containerRef.current) {
          console.log('[PreviewPane] Container torn down during sync, aborting');
          return;
        }

        await containerRef.current.mount(fileTree);

        console.log('[PreviewPane] Files synced to WebContainer, serverAlreadyRunning:', serverAlreadyRunning);

        // If server is already running, just update the files and we're done
        if (serverAlreadyRunning) {
          console.log('[PreviewPane] Files updated, server already running - refresh should show changes');
          setLoading(false);

          // Trigger a refresh of the iframe to show updated files
          if (previewUrl) {
            setRefreshKey(prev => prev + 1);
          }
          return;
        }

        // Check if there's a package.json
        const hasPackageJson = findFile(files, 'package.json');
        const hasIndexHtml = findFile(files, 'index.html');

        // If no index.html, find any HTML file
        const anyHtmlFile = !hasIndexHtml ? files.find(f => f.path.toLowerCase().endsWith('.html')) : null;

        console.log('[PreviewPane] File detection:', {
          hasPackageJson: !!hasPackageJson,
          hasIndexHtml: !!hasIndexHtml,
          anyHtmlFile: anyHtmlFile?.path,
          indexPath: hasIndexHtml?.path || anyHtmlFile?.path
        });

        if (hasPackageJson && containerRef.current && !isTearingDownRef.current) {
          setServerStatus('Installing dependencies...');

          // Check before each operation
          if (!containerRef.current || isTearingDownRef.current) {
            console.log('[PreviewPane] Container torn down, aborting npm install');
            return;
          }

          // Install dependencies
          const installProcess = await containerRef.current.spawn('npm', ['install']);
          await installProcess.exit;

          if (!containerRef.current || isTearingDownRef.current) {
            console.log('[PreviewPane] Container torn down, aborting npm run dev');
            return;
          }

          setServerStatus('Starting dev server...');
          // Start dev server
          const devProcess = await containerRef.current.spawn('npm', ['run', 'dev']);

          // Don't await - let it run in background
          devProcess.output.pipeTo(new WritableStream({
            write(data) {
              console.log('[npm run dev]', data);
            }
          }));

          serverStartedRef.current = true;
        } else if ((hasIndexHtml || anyHtmlFile) && containerRef.current && !isTearingDownRef.current) {
          setServerStatus('Starting static server...');

          const htmlFile = hasIndexHtml || anyHtmlFile;
          const indexPath = htmlFile!.path;

          // Normalize path: strip leading slashes for baseDir calculation
          // "/index.html" -> "index.html", "/src/index.html" -> "src/index.html"
          const normalizedPath = indexPath.replace(/^\/+/, '');

          // Calculate base directory from normalized path
          let baseDir = '.';
          if (normalizedPath.includes('/')) {
            const lastSlash = normalizedPath.lastIndexOf('/');
            baseDir = normalizedPath.substring(0, lastSlash);
          }

          console.log('[PreviewPane] Starting static server for:', indexPath, 'normalized:', normalizedPath, 'baseDir:', baseDir);

          if (!containerRef.current || isTearingDownRef.current) {
            console.log('[PreviewPane] Container torn down, aborting static server');
            return;
          }

          // Extract the HTML filename for the default route
          const htmlFileName = normalizedPath.includes('/')
            ? normalizedPath.substring(normalizedPath.lastIndexOf('/') + 1)
            : normalizedPath;

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

          await containerRef.current.fs.writeFile('/server.js', serverScript);

          // Mark server as started BEFORE spawning to prevent duplicate starts
          serverStartedRef.current = true;

          // Start the static server
          const serverProcess = await containerRef.current.spawn('node', ['server.js']);

          // Log output and errors
          serverProcess.output.pipeTo(new WritableStream({
            write(data) {
              console.log('[static server]', data);

              // Check if server started message appears
              if (data.includes('Server running on port') || data.includes('3000')) {
                setServerStatus('Server started on port 3000');
                serverStartedRef.current = true;
              }

              // Handle EADDRINUSE - server already running
              if (data.includes('EADDRINUSE') || data.includes('address already in use')) {
                console.log('[static server] Port already in use, server is already running');
                setServerStatus('Server already running on port 3000');
                serverStartedRef.current = true;
                currentRunningSessionId = sessionId;
              }
            }
          }));

          // Wait for server to start, then get the URL from WebContainer
          // The server-ready event should fire automatically when port 3000 is bound
          console.log('[PreviewPane] Waiting for server to start on port 3000...');

          // Set a timeout to check server URL after giving it time to start
          setTimeout(async () => {
            if (containerRef.current && serverStartedRef.current) {
              try {
                const container = containerRef.current as any;

                // Try different methods to get the server URL
                if (typeof container.getServerUrl === 'function') {
                  const url = await container.getServerUrl(3000);
                  if (url) {
                    console.log('[PreviewPane] Got server URL via getServerUrl:', url);
                    setPreviewUrl(url);
                    if (onUrlChange) onUrlChange(url);
                    setServerStatus('Preview ready');
                    setLoading(false);
                    // Track this session as having a running server
                    currentRunningSessionId = sessionId;
                    currentServerUrl = url;
                  }
                } else if (typeof container.origin === 'string') {
                  // Some WebContainer versions expose origin
                  const url = `${container.origin}:3000`;
                  console.log('[PreviewPane] Using container origin:', url);
                  setPreviewUrl(url);
                  if (onUrlChange) onUrlChange(url);
                  setServerStatus('Preview ready');
                  setLoading(false);
                  // Track this session as having a running server
                  currentRunningSessionId = sessionId;
                  currentServerUrl = url;
                } else {
                  console.warn('[PreviewPane] No method available to get server URL, waiting for server-ready event');
                  setServerStatus('Waiting for server URL...');
                }
              } catch (err) {
                console.error('[PreviewPane] Error getting server URL:', err);
                setServerStatus('Error getting preview URL');
              }
            }
          }, 3000);
        } else {
          console.log('[PreviewPane] No package.json or HTML file found');
          setServerStatus('No app to preview (no package.json or .html file)');
        }

        setLoading(false);
      } catch (err: any) {
        console.error('WebContainer sync error:', err);
        setError(err.message);
        setLoading(false);
      }
    };

    syncAndRun();
  }, [files, containerReady, sessionId]);

  const isMobile = deviceMode === 'mobile';

  return (
    <div className="preview-pane">
      {/* Preview Content Container */}
      <div style={{
        flex: 1,
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: isMobile ? '#f5f5f5' : 'transparent'
      }}>
        {isMobile ? (
          /* Mobile Phone Mockup */
          <div className="phone-mockup">
            <div className="phone-frame">
              <div className="phone-notch"></div>
              <div className="phone-screen">
                {previewUrl && (
                  <iframe
                    key={refreshKey}
                    ref={iframeRef}
                    className="preview-frame-mobile"
                    src={previewUrl}
                    title="Preview"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-popups-to-escape-sandbox allow-presentation"
                    allow="autoplay; encrypted-media; fullscreen; accelerometer; gyroscope; clipboard-write; web-share; picture-in-picture"
                    onLoad={() => setIframeLoaded(true)}
                    style={{
                      opacity: (loading || !iframeLoaded) ? 0 : 1,
                      transition: 'opacity 0.3s ease'
                    }}
                  />
                )}

                {/* Loading/Error/Empty State Overlay */}
                {(loading || error || files.length === 0 || !previewUrl || !iframeLoaded) && (
                  <div className="preview-overlay">
                    {files.length === 0 ? (
                      <div className="overlay-content">
                        <span>No files to preview</span>
                      </div>
                    ) : error ? (
                      <div className="overlay-content" style={{ color: 'var(--error)' }}>
                        <span>Error: {error}</span>
                      </div>
                    ) : (loading || !iframeLoaded) ? (
                      <div className="overlay-content">
                        <div className="spinner"></div>
                        <span>{serverStatus === 'Switching...' ? 'Switching WebContainer...' : 'Booting WebContainer...'}</span>
                        {serverStatus === 'Switching...' && (
                          <div style={{ marginTop: '10px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                            Preparing new environment...
                          </div>
                        )}
                      </div>
                    ) : !previewUrl && files.length > 0 ? (
                      <div className="overlay-content">
                        <span>{serverStatus}</span>
                        {serverStatus.includes('Error') && (
                          <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                            Check browser console for details
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Desktop View */
          <>
            {/* WebContainer iframe - always rendered when there's a URL */}
            {previewUrl && (
              <iframe
                key={refreshKey}
                ref={iframeRef}
                className="preview-frame"
                src={previewUrl}
                title="Preview"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-popups-to-escape-sandbox allow-presentation"
                allow="autoplay; encrypted-media; fullscreen; accelerometer; gyroscope; clipboard-write; web-share; picture-in-picture"
                onLoad={() => setIframeLoaded(true)}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  opacity: (loading || !iframeLoaded) ? 0 : 1,
                  transition: 'opacity 0.3s ease'
                }}
              />
            )}

            {/* Loading/Error/Empty State Overlay */}
            {(loading || error || files.length === 0 || !previewUrl || !iframeLoaded) && (
              <div className="preview-overlay">
                {files.length === 0 ? (
                  <div className="overlay-content">
                    <span>No files to preview</span>
                  </div>
                ) : error ? (
                  <div className="overlay-content" style={{ color: 'var(--error)' }}>
                    <span>Error: {error}</span>
                  </div>
                ) : (loading || !iframeLoaded) ? (
                  <div className="overlay-content">
                    <div className="spinner"></div>
                    <span>{serverStatus === 'Switching...' ? 'Switching WebContainer...' : 'Booting WebContainer...'}</span>
                    {serverStatus === 'Switching...' && (
                      <div style={{ marginTop: '10px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                        Preparing new environment...
                      </div>
                    )}
                  </div>
                ) : !previewUrl && files.length > 0 ? (
                  <div className="overlay-content">
                    <span>{serverStatus}</span>
                    {serverStatus.includes('Error') && (
                      <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                        Check browser console for details
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
