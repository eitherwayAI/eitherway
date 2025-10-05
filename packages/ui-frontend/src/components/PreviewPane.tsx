import { useEffect, useState, useRef } from 'react';
import { WebContainer } from '@webcontainer/api';

interface PreviewPaneProps {
  files: any[];
}

// Global singleton to prevent multiple WebContainer instances
let webContainerInstance: WebContainer | null = null;
let bootPromise: Promise<WebContainer> | null = null;

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

export default function PreviewPane({ files }: PreviewPaneProps) {
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [containerReady, setContainerReady] = useState(false);
  const [serverStatus, setServerStatus] = useState<string>('Not started');
  const containerRef = useRef<WebContainer | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const serverStartedRef = useRef(false);

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

  // Boot WebContainer once on mount
  useEffect(() => {
    let mounted = true;

    const bootContainer = async () => {
      try {
        setLoading(true);
        setError(null);

        const container = await getWebContainer();

        if (!mounted) {
          return;
        }

        containerRef.current = container;

        // Listen for server ready
        container.on('server-ready', (port, url) => {
          console.log('[WebContainer] Server ready on port', port, 'URL:', url);
          if (mounted) {
            setPreviewUrl(url);
            setLoading(false);
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
        console.error('WebContainer boot error:', err);
        if (mounted) {
          setError(err.message);
          setLoading(false);
        }
      }
    };

    bootContainer();

    return () => {
      mounted = false;
    };
  }, []); // Only run once

  // Sync files and run dev server when files change
  useEffect(() => {
    console.log('[PreviewPane] Sync triggered - containerReady:', containerReady, 'files:', files.length);

    if (!containerRef.current) {
      console.log('[PreviewPane] Container not ready (containerRef is null)');
      return;
    }

    if (files.length === 0) {
      console.log('[PreviewPane] No files to sync');
      return;
    }

    console.log('[PreviewPane] ✅ Starting file sync...');

    const syncFilesToContainer = async (fileNodes: any[]): Promise<Record<string, any>> => {
      const fileTree: any = {};
      const filePromises: Promise<void>[] = [];

      const processNode = (node: any, currentPath: string[] = []) => {
        if (node.type === 'directory') {
          const dirPath = [...currentPath, node.name];
          if (node.children) {
            node.children.forEach((child: any) => processNode(child, dirPath));
          }
        } else if (node.type === 'file') {
          // Fetch file content
          const promise = fetch(`/api/files/${node.path}`)
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

      // Wait for all files to be fetched
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

        // Sync files to WebContainer
        const fileTree = await syncFilesToContainer(files);

        if (containerRef.current) {
          await containerRef.current.mount(fileTree);
        }

        // Check if there's a package.json
        const hasPackageJson = findFile(files, 'package.json');
        const hasIndexHtml = findFile(files, 'index.html');

        console.log('[PreviewPane] File detection:', {
          hasPackageJson: !!hasPackageJson,
          hasIndexHtml: !!hasIndexHtml,
          indexPath: hasIndexHtml?.path
        });

        if (hasPackageJson && containerRef.current) {
          setServerStatus('Installing dependencies...');
          // Install dependencies
          const installProcess = await containerRef.current.spawn('npm', ['install']);
          await installProcess.exit;

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
        } else if (hasIndexHtml && containerRef.current) {
          setServerStatus('Starting static server...');
          // For simple HTML apps, start a static server using Node.js http-server
          // Find the directory containing index.html
          const indexPath = hasIndexHtml.path; // e.g., "src/index.html"
          const baseDir = indexPath.includes('/') ? indexPath.substring(0, indexPath.lastIndexOf('/')) : '.';

          console.log('[PreviewPane] Starting static server for:', indexPath, 'baseDir:', baseDir);

          const serverScript = `
const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE_DIR = '${baseDir}';
const PORT = 3000;
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
  let reqPath = req.url === '/' ? '/index.html' : req.url;
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
                    setServerStatus('Preview ready');
                    setLoading(false);
                  }
                } else if (typeof container.origin === 'string') {
                  // Some WebContainer versions expose origin
                  const url = `${container.origin}:3000`;
                  console.log('[PreviewPane] Using container origin:', url);
                  setPreviewUrl(url);
                  setServerStatus('Preview ready');
                  setLoading(false);
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
          console.log('[PreviewPane] No package.json or index.html found');
          setServerStatus('No app to preview');
        }

        setLoading(false);
      } catch (err: any) {
        console.error('WebContainer sync error:', err);
        setError(err.message);
        setLoading(false);
      }
    };

    syncAndRun();
  }, [files, containerReady]); // Run when files change OR when container becomes ready

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
