import { useEffect, useState, useRef } from 'react';
import { WebContainer } from '@webcontainer/api';

interface PreviewPaneProps {
  files: any[];
  sessionId: string | null;
  onUrlChange?: (url: string) => void;
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

  bootPromise = WebContainer.boot();
  webContainerInstance = await bootPromise;
  bootPromise = null;

  return webContainerInstance;
}

// Helper to tear down WebContainer completely
async function tearDownWebContainer() {
  if (webContainerInstance) {
    try {
      console.log('[WebContainer] Tearing down container...');
      await webContainerInstance.teardown();
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

export default function PreviewPane({ files, sessionId, onUrlChange }: PreviewPaneProps) {
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [containerReady, setContainerReady] = useState(false);
  const [serverStatus, setServerStatus] = useState<string>('Not started');
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

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

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
        // If session changed, teardown old container first
        if (isSessionChange) {
          console.log('[PreviewPane] Session changed from', currentSessionRef.current, 'to', sessionId);

          // Reset state
          setPreviewUrl('');
          setLoading(true);
          setError(null);
          setContainerReady(false);
          setServerStatus('Not started');
          serverStartedRef.current = false;

          if (onUrlChange) {
            onUrlChange('');
          }

          // Teardown and wait for completion
          isTearingDownRef.current = true;
          containerRef.current = null; // Clear ref immediately
          await tearDownWebContainer();
          isTearingDownRef.current = false;

          console.log('[PreviewPane] Teardown complete, starting new container...');
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
              const pathParts = node.path.split('/');
              let current = fileTree;

              for (let i = 0; i < pathParts.length - 1; i++) {
                const part = pathParts[i];
                if (!current[part]) {
                  current[part] = { directory: {} };
                }
                current = current[part].directory;
              }

              const fileName = pathParts[pathParts.length - 1];
              current[fileName] = {
                file: {
                  contents: data.content || ''
                }
              };
            })
            .catch(err => console.error('Failed to fetch file:', node.path, err));

          filePromises.push(promise);
        }
      };

      fileNodes.forEach(node => processNode(node));

      await Promise.all(filePromises);
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
          // For simple HTML apps, start a static server using Node.js http-server
          // Find the directory containing the HTML file
          const htmlFile = hasIndexHtml || anyHtmlFile;
          const indexPath = htmlFile!.path; // e.g., "src/index.html" or "calculator.html"
          const baseDir = indexPath.includes('/') ? indexPath.substring(0, indexPath.lastIndexOf('/')) : '.';

          console.log('[PreviewPane] Starting static server for:', indexPath, 'baseDir:', baseDir);

          if (!containerRef.current || isTearingDownRef.current) {
            console.log('[PreviewPane] Container torn down, aborting static server');
            return;
          }

          // Extract the HTML filename for the default route
          const htmlFileName = indexPath.includes('/') ? indexPath.substring(indexPath.lastIndexOf('/') + 1) : indexPath;

          const serverScript = `
const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE_DIR = '${baseDir}';
const PORT = 3000;
const DEFAULT_FILE = '${htmlFileName}';
const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  let reqPath = req.url === '/' ? '/' + DEFAULT_FILE : req.url;
  let filePath = path.join(BASE_DIR, reqPath);
  const extname = path.extname(filePath);
  const contentType = mimeTypes[extname] || 'application/octet-stream';

  console.log('[Server] Request:', req.url, '-> File:', filePath);

  fs.readFile(filePath, (error, content) => {
    if (error) {
      console.error('[Server] Error:', error.message);
      res.writeHead(404);
      res.end('File not found: ' + filePath);
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  console.log('[Server] Static server running on port ' + PORT + ', serving from ' + BASE_DIR);
});
`;

          await containerRef.current.fs.writeFile('/server.js', serverScript);

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

  if (files.length === 0) {
    return (
      <div className="preview-pane">
        <div className="preview-header">
          <span>🔍</span>
          <span>Preview</span>
        </div>
        <div className="loading">
          <span>No files to preview</span>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="preview-pane">
        <div className="preview-header">
          <span>🔍</span>
          <span>Preview</span>
          <span className="status-badge">Loading...</span>
        </div>
        <div className="loading">
          <div className="spinner"></div>
          <span>Booting WebContainer...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="preview-pane">
        <div className="preview-header">
          <span>🔍</span>
          <span>Preview</span>
          <span className="status-badge error">Error</span>
        </div>
        <div className="loading" style={{ color: 'var(--error)' }}>
          <span>Error: {error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="preview-pane">
      <div className="preview-header">
        <span>🔍</span>
        <span>Preview</span>
        {previewUrl ? (
          <span className="status-badge connected">Live</span>
        ) : (
          <span className="status-badge" style={{ background: '#666' }}>{serverStatus}</span>
        )}
        {previewUrl && (
          <button
            onClick={handleRefresh}
            className="refresh-button"
            title="Refresh preview"
          >
            🔄
          </button>
        )}
        {previewUrl && <div className="preview-url">{previewUrl}</div>}
      </div>
      {previewUrl ? (
        <iframe
          key={refreshKey}
          ref={iframeRef}
          className="preview-frame"
          src={previewUrl}
          title="Preview"
        />
      ) : (
        !loading && files.length > 0 && (
          <div className="loading">
            <span>{serverStatus}</span>
            {serverStatus.includes('Error') && (
              <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                Check browser console for details
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
}
