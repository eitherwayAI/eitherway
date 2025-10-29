import { useStore } from '@nanostores/react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { IconButton } from '~/components/ui/IconButton';
import { workbenchStore } from '~/lib/stores/workbench';
import { chatStore } from '~/lib/stores/chat';
import { previewModeStore } from '~/lib/stores/preview-mode';
import { PortDropdown } from './PortDropdown';
import { createScopedLogger } from '~/utils/logger';
import { ErrorOverlay } from './ErrorOverlay';
import { getBackendUrl } from '~/config/api';

const logger = createScopedLogger('Preview');

export const Preview = memo(() => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [activePreviewIndex, setActivePreviewIndex] = useState(0);
  const [isPortDropdownOpen, setIsPortDropdownOpen] = useState(false);
  const previewMode = useStore(previewModeStore);

  // Subscribe to streaming phase for building overlay
  const { currentPhase, sessionId } = useStore(chatStore);

  // Debug logging for phase changes and reset timer when code-writing starts
  useEffect(() => {
    console.log('🎯 [Preview] currentPhase changed to:', currentPhase);

    if (currentPhase === 'code-writing') {
      setBuildStartTime(Date.now());
      setElapsedSeconds(0);
      logger.info('⏱️  Build timer reset - code-writing phase started');
    }
  }, [currentPhase]);

  // always start with building status when Preview component mounts
  const [buildStatus, setBuildStatus] = useState<'building' | 'ready'>('building');
  const [buildMessage, setBuildMessage] = useState('Setting up your app...');
  const [buildStartTime, setBuildStartTime] = useState<number>(Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isMonitoring, setIsMonitoring] = useState(true);
  const buildTimeoutRef = useRef<NodeJS.Timeout>();
  const timerIntervalRef = useRef<NodeJS.Timeout>();
  const hasSelectedPreview = useRef(false);
  const previews = useStore(workbenchStore.previews);
  const activePreview = previews[activePreviewIndex];
  const artifacts = useStore(workbenchStore.artifacts);

  const [url, setUrl] = useState('');
  const [iframeUrl, setIframeUrl] = useState<string | undefined>();
  const [previewError, setPreviewError] = useState<any | null>(null);

  useEffect(() => {
    const current = workbenchStore.isAppReadyForDeploy.get();
    if (activePreview && !current) {
      workbenchStore.isAppReadyForDeploy.set(true);
    } else if (!activePreview && current) {
      workbenchStore.isAppReadyForDeploy.set(false);
    }
  }, [activePreview]);

  useEffect(() => {
    if (!activePreview) {
      setUrl('');
      setIframeUrl(undefined);
      workbenchStore.isAppReadyForDeploy.set(false);

      return;
    }

    const { baseUrl } = activePreview;

    // always update when we have an active preview
    setUrl(baseUrl);
    setIframeUrl(baseUrl);

    setBuildStatus('ready');
    setIsMonitoring(false);

    workbenchStore.isAppReadyForDeploy.set(true);

    // clear timers when preview is ready
    if (buildTimeoutRef.current) {
      clearTimeout(buildTimeoutRef.current);
      buildTimeoutRef.current = undefined;
    }

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = undefined;
    }
  }, [activePreview]); // remove iframeUrl from dependencies to avoid infinite loop

  // timer effect to update elapsed seconds
  useEffect(() => {
    if (buildStatus === 'building') {
      // start the timer
      setElapsedSeconds(0);
      timerIntervalRef.current = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - buildStartTime) / 1000));
      }, 1000);

      return () => {
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
        }
      };
    }

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [buildStatus, buildStartTime]);

  // monitor action status for better feedback (keeping original logic for loader)
  useEffect(() => {
    // if we don't have a preview yet, we're building
    if (!activePreview && !iframeUrl) {
      setBuildStatus('building');
    }

    const allArtifacts = Object.values(artifacts);

    if (allArtifacts.length === 0) {
      // no artifacts yet but Preview is mounted = build is starting
      return;
    }

    const latestArtifact = allArtifacts[allArtifacts.length - 1];

    if (!latestArtifact?.runner) {
      return;
    }

    const actions = latestArtifact.runner.actions.get();
    const actionsList = Object.values(actions);
    const hasRunning = actionsList.some((a) => a.status === 'running');
    const hasPending = actionsList.some((a) => a.status === 'pending');
    const allComplete =
      actionsList.length > 0 && actionsList.every((a) => a.status === 'complete' || a.status === 'aborted');

    if ((hasRunning || hasPending) && !activePreview) {
      setBuildStatus('building');
    }

    if (allComplete && !activePreview) {
      // all actions complete but no preview - likely port detection issue
      const message = 'Starting development server...';

      setBuildMessage(message);

      // Opportunistically ensure index.html links CSS and error capture for correct theming and error handling
      (async () => {
        try {
          const { webcontainer } = await import('~/lib/webcontainer');
          const wc = await webcontainer;
          let html = '';
          try {
            html = (await wc.fs.readFile('/index.html', 'utf8')) as unknown as string;
          } catch {
            return; // no index.html created; skip
          }

          const needsBase = !html.includes('<link rel="stylesheet" href="/base.css">');
          const needsStyles =
            !html.includes('<link rel="stylesheet" href="/styles.css">') &&
            !html.includes('href="styles.css"') &&
            !html.includes('href="./styles.css"');
          let needsEnv = false;
          try {
            await wc.fs.readFile('/scripts/env-loader.js', 'utf8');
            needsEnv = !html.includes('/scripts/env-loader.js');
          } catch {}

          // Check if error capture script is already injected
          const needsErrorCapture = !html.includes('__errorCapture') && !html.includes('UniversalErrorCapture');

          if (!needsBase && !needsStyles && !needsEnv && !needsErrorCapture) return;

          // Get session ID for error reporting
          const currentSessionId = sessionId || 'unknown';

          const insertion = [
            needsBase ? '<link rel="stylesheet" href="/base.css">' : '',
            needsStyles ? '<link rel="stylesheet" href="/styles.css">' : '',
            needsEnv ? '<script type="module" src="/scripts/env-loader.js"></script>' : '',
            // Set session ID first
            needsErrorCapture ? `<script>window.__SESSION_ID__ = "${currentSessionId}";</script>` : '',
            // Inject error capture script as ES module
            needsErrorCapture ? `<script type="module">
class UniversalErrorCapture { constructor() { this.capturedErrors = []; this.errorCount = 0; this.sessionId = window.__SESSION_ID__ || 'unknown'; this.viteOverlayObserver = null; console.log('[ErrorCapture] Initializing v2 with session:', this.sessionId); this.initCapture(); this.hideViteOverlay(); console.log('[ErrorCapture] Ready and monitoring'); } initCapture() { if (import.meta.hot) { console.log('[ErrorCapture] Vite HMR detected, installing hooks'); import.meta.hot.on('vite:error', (payload) => { console.log('[ErrorCapture] Vite error event:', payload); const error = payload.err || payload.error || payload; this.capture({ message: error.message || String(payload), stack: error.stack || (payload.stack) || '', file: error.file || error.id || '', line: error.line || error.loc?.line || 0, column: error.column || error.loc?.column || 0 }, 'build'); }); import.meta.hot.on('vite:beforeUpdate', () => { this.hideViteOverlay(); }); } window.addEventListener('error', (event) => { console.log('[ErrorCapture] Runtime error:', event); this.capture({ message: event.message || 'Runtime error', stack: event.error?.stack || '', file: event.filename || '', line: event.lineno || 0, column: event.colno || 0 }, 'runtime'); event.preventDefault(); return true; }, true); window.addEventListener('unhandledrejection', (event) => { console.log('[ErrorCapture] Promise rejection:', event); const reason = event.reason; this.capture({ message: reason?.message || String(reason), stack: reason?.stack || new Error(String(reason)).stack || '' }, 'promise'); event.preventDefault(); return true; }); const originalError = console.error; console.error = (...args) => { const firstArg = args[0]; if (firstArg instanceof Error) { this.capture({ message: firstArg.message, stack: firstArg.stack || '' }, 'console'); } else if (typeof firstArg === 'object' && firstArg?.message) { this.capture({ message: firstArg.message || String(firstArg), stack: firstArg.stack || '' }, 'console'); } else if (typeof firstArg === 'string') { const msg = args.join(' '); if (msg.includes('Error') || msg.includes('Failed') || msg.includes('failed')) { this.capture({ message: msg, stack: new Error().stack || '' }, 'console'); } } originalError.apply(console, args); }; console.log('[ErrorCapture] All error listeners registered'); } hideViteOverlay() { const existing = document.querySelector('vite-error-overlay'); if (existing) { existing.style.display = 'none'; console.log('[ErrorCapture] Hid existing Vite overlay'); } if (!this.viteOverlayObserver) { this.viteOverlayObserver = new MutationObserver((mutations) => { for (const mutation of mutations) { for (const node of mutation.addedNodes) { if (node.nodeName === 'VITE-ERROR-OVERLAY') { node.style.display = 'none'; console.log('[ErrorCapture] Intercepted and hid Vite overlay'); } } } }); this.viteOverlayObserver.observe(document.documentElement, { childList: true, subtree: true }); console.log('[ErrorCapture] MutationObserver watching for Vite overlays'); } } capture(errorData, source) { this.errorCount++; const error = { message: errorData.message || 'Unknown error', stack: errorData.stack || '', source: source, timestamp: Date.now(), url: window.location.href, file: errorData.file || '', line: errorData.line || 0, column: errorData.column || 0, errorNumber: this.errorCount }; console.log(\`[ErrorCapture] Captured error #\${this.errorCount} (\${source}):\`, error.message); console.log('[ErrorCapture] Full error data:', error); try { window.parent.postMessage({ type: 'PREVIEW_ERROR', error: error, sessionId: this.sessionId }, '*'); console.log('[ErrorCapture] Error sent to parent window'); } catch (err) { console.error('[ErrorCapture] Failed to send error to parent:', err); } this.capturedErrors.push(error); if (this.capturedErrors.length > 10) { this.capturedErrors.shift(); } } getErrors() { return this.capturedErrors; } clearErrors() { this.capturedErrors = []; this.errorCount = 0; console.log('[ErrorCapture] Cleared all errors'); }}try { window.__errorCapture = new UniversalErrorCapture(); console.log('[ErrorCapture] System active'); window.parent.postMessage({ type: 'PREVIEW_LOADED', timestamp: Date.now() }, '*');} catch (error) { console.error('[ErrorCapture] Failed to initialize:', error);}
</script>` : '',
          ]
            .filter(Boolean)
            .join('\n  ');

          if (html.includes('<head>')) {
            html = html.replace('<head>', `<head>\n  ${insertion}`);
          } else if (html.includes('<html')) {
            html = html.replace(/<html[^>]*>/, (m) => `${m}\n<head>\n  ${insertion}\n</head>`);
          } else {
            html = `${insertion}\n${html}`;
          }

          await wc.fs.writeFile('/index.html', html);
        } catch {
          // ignore
        }
      })();

      if (!buildTimeoutRef.current) {
        buildTimeoutRef.current = setTimeout(() => {
          const timeoutMessage = 'Taking a bit longer than usual...';

          setBuildMessage(timeoutMessage);
        }, 15000); // 15 second grace period
      }
    } else if (actionsList.length > 0) {
      const runningAction = actionsList.find((a) => a.status === 'running');

      if (runningAction) {
        if (runningAction.type === 'shell') {
          // show friendly messages instead of raw commands
          let message = '';

          if (runningAction.content.includes('npm install')) {
            message = 'Installing dependencies...';
          } else if (runningAction.content.includes('vite') || runningAction.content.includes('dev')) {
            message = 'Starting development server...';
          } else {
            message = 'Setting up environment...';
          }

          setBuildMessage(message);
        } else if (runningAction.type === 'file') {
          const message = 'Creating application files...';

          setBuildMessage(message);
        }
      } else {
        // default message when no specific action is running
        const pendingCount = actionsList.filter((a) => a.status === 'pending').length;
        let message = '';

        if (pendingCount > 0) {
          message = `Processing ${pendingCount} remaining tasks...`;
        } else {
          message = 'Finalizing setup...';
        }

        setBuildMessage(message);
      }
    }
  }, [artifacts, activePreview, buildStatus, isMonitoring, iframeUrl]);

  useEffect(() => {
    setBuildStartTime(Date.now());
  }, []);

  useEffect(() => {
    if (previews.length > 0 && activePreview) {
      workbenchStore.isAppReadyForDeploy.set(true);
      setBuildStatus('ready');
    }
  }, [previews.length]);

  const validateUrl = useCallback(
    (value: string) => {
      if (!activePreview) {
        return false;
      }

      const { baseUrl } = activePreview;

      if (value === baseUrl) {
        return true;
      } else if (value.startsWith(baseUrl)) {
        return ['/', '?', '#'].includes(value.charAt(baseUrl.length));
      }

      return false;
    },
    [activePreview],
  );

  const findMinPortIndex = useCallback(
    (minIndex: number, preview: { port: number }, index: number, array: { port: number }[]) => {
      return preview.port < array[minIndex].port ? index : minIndex;
    },
    [],
  );

  useEffect(() => {
    if (previews.length > 1 && !hasSelectedPreview.current) {
      const minPortIndex = previews.reduce(findMinPortIndex, 0);

      setActivePreviewIndex(minPortIndex);
    }
  }, [previews]);

  const reloadPreview = useCallback(() => {
    if (iframeRef.current && iframeRef.current.src) {
      const currentSrc = iframeRef.current.src;
      const url = new URL(currentSrc);

      // Add/update cache-busting timestamp to force reload
      url.searchParams.set('_reload', Date.now().toString());

      logger.info('🔄 Reloading preview with cache-bust:', url.toString());
      iframeRef.current.src = url.toString();
    }
  }, []);

  // Auto-reload preview when files are edited and saved
  useEffect(() => {
    const handleFileUpdate = () => {
      setTimeout(() => {
        reloadPreview();
      }, 500);
    };

    const handleStaticReload = () => {
      // Static servers need immediate reload after file sync from AI
      logger.info('Static reload triggered - reloading preview');
      reloadPreview();
    };

    window.addEventListener('webcontainer:file-updated', handleFileUpdate);
    window.addEventListener('webcontainer:static-reload', handleStaticReload);

    return () => {
      window.removeEventListener('webcontainer:file-updated', handleFileUpdate);
      window.removeEventListener('webcontainer:static-reload', handleStaticReload);
    };
  }, [reloadPreview]);

  // Combined PostMessage handler for error reporting AND API proxy
  // Handles: PREVIEW_ERROR, PREVIEW_LOADED (error overlay v2.0), api-proxy (Web3 contract compilation)
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      const { type, id, payload } = event.data;

      // Handle error messages from preview iframe (beta-aifix2.0)
      if (type === 'PREVIEW_ERROR') {
        logger.error('Preview error received:', event.data.error);
        setPreviewError(event.data.error);
        return;
      }

      if (type === 'PREVIEW_LOADED') {
        // Clear errors when preview loads successfully
        // Exception: Keep build errors visible UNLESS auto-fix has completed (v2.0 improvement)
        setPreviewError((prevError) => {
          if (prevError?.source === 'build') {
            // Check if auto-fix just completed (phase is 'completed')
            // If so, the build error is stale (from intermediate file sync states)
            if (currentPhase === 'completed') {
              logger.info('Auto-fix completed and preview loaded - clearing stale build error');
              return null; // Clear the build error
            }
            logger.info('Preview loaded but build error persists - keeping overlay visible');
            return prevError; // Keep the build error visible
          }
          logger.info('Preview loaded successfully - clearing error overlay');
          return null; // Clear runtime/promise/console errors
        });
        return;
      }

      // Handle API proxy requests (beta-web3api)
      // Security: Only accept messages from our preview iframe
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) {
        return;
      }

      // Handle API proxy requests (contracts + IPFS)
      if (type === 'api-proxy' && payload?.endpoint) {
        const isContractRequest = payload.endpoint === '/api/contracts/compile';
        const isIPFSRequest = payload.endpoint.startsWith('/api/ipfs/');

        if (isContractRequest || isIPFSRequest) {
          const requestType = isContractRequest ? 'contract compilation' : 'IPFS upload';
          logger.info(`📨 [PostMessage Proxy] Received ${requestType} request:`, id);

          try {
            const backendUrl = getBackendUrl();

            // Handle multipart form data for IPFS uploads
            let requestBody: any;
            let requestHeaders: any = {};

            if (payload.contentType === 'multipart/form-data' && payload.body?.file) {
              // Convert base64 back to blob for multipart upload
              const base64Data = payload.body.file.split(',')[1] || payload.body.file;
              const byteCharacters = atob(base64Data);
              const byteNumbers = new Array(byteCharacters.length);
              for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
              }
              const byteArray = new Uint8Array(byteNumbers);
              const blob = new Blob([byteArray]);

              const formData = new FormData();
              formData.append('file', blob, payload.body.filename);

              // Add additional fields for create-nft-asset endpoint
              if (payload.body.nftName) {
                formData.append('nftName', payload.body.nftName);
              }
              if (payload.body.nftDescription) {
                formData.append('nftDescription', payload.body.nftDescription);
              }
              if (payload.body.attributes) {
                formData.append('attributes', JSON.stringify(payload.body.attributes));
              }

              requestBody = formData;
              // Don't set Content-Type header - browser will set it with boundary
            } else {
              // JSON request
              requestHeaders['Content-Type'] = 'application/json';
              requestBody = JSON.stringify(payload.body);
            }

            const response = await fetch(`${backendUrl}${payload.endpoint}`, {
              method: payload.method || 'POST',
              headers: {
                ...requestHeaders,
                ...payload.headers,
              },
              body: requestBody,
            });

            const data = await response.json();

            if (!response.ok) {
              throw new Error(data.error || `HTTP ${response.status}`);
            }

            logger.info(`✅ [PostMessage Proxy] ${requestType} successful`);

            // Send success response back to iframe
            iframeRef.current?.contentWindow?.postMessage(
              {
                type: 'api-proxy-response',
                id,
                success: true,
                data,
              },
              '*',
            );
          } catch (error) {
            logger.error(`❌ [PostMessage Proxy] ${requestType} failed:`, error);

            // Send error response back to iframe
            iframeRef.current?.contentWindow?.postMessage(
              {
                type: 'api-proxy-response',
                id,
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
              },
              '*',
            );
          }
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [iframeRef, currentPhase]); // Re-create handler when phase changes to access latest value

  // Listen for build errors from WebContainer dev server output
  useEffect(() => {
    const handleBuildError = (event: CustomEvent) => {
      logger.error('Build error detected:', event.detail);
      setPreviewError(event.detail);
    };

    // Note: We don't listen for build-success events because terminal output is unreliable
    // Success is detected when the iframe loads (PREVIEW_LOADED message above)

    window.addEventListener('webcontainer:build-error', handleBuildError as EventListener);

    return () => {
      window.removeEventListener('webcontainer:build-error', handleBuildError as EventListener);
    };
  }, []);

  // Clear error when files are updated (auto-fix is in progress)
  useEffect(() => {
    const handleFileChange = () => {
      // Give the preview a moment to reload, then check if error is gone
      setTimeout(() => {
        if (previewError) {
          logger.info('Files updated - clearing error overlay');
          setPreviewError(null);
        }
      }, 2000);
    };

    window.addEventListener('webcontainer:file-updated', handleFileChange);
    return () => window.removeEventListener('webcontainer:file-updated', handleFileChange);
  }, [previewError]);

  return (
    <div className="w-full h-full flex flex-col">
      {isPortDropdownOpen && (
        <div className="z-iframe-overlay w-full h-full absolute" onClick={() => setIsPortDropdownOpen(false)} />
      )}
      <div className="bg-eitherway-elements-background-depth-2 p-2 flex items-center gap-1.5">
        <IconButton icon="i-ph:arrow-clockwise" onClick={reloadPreview} />
        <IconButton
          icon={previewMode === 'mobile' ? 'i-ph:device-mobile' : 'i-ph:desktop'}
          onClick={() => previewModeStore.set(previewMode === 'mobile' ? 'desktop' : 'mobile')}
          title={previewMode === 'mobile' ? 'Switch to Desktop View' : 'Switch to Mobile View'}
        />
        <div
          className="flex items-center gap-1 flex-grow bg-eitherway-elements-preview-addressBar-background border border-eitherway-elements-borderColor text-eitherway-elements-preview-addressBar-text rounded-full px-3 py-1 text-sm hover:bg-eitherway-elements-preview-addressBar-backgroundHover hover:focus-within:bg-eitherway-elements-preview-addressBar-backgroundActive focus-within:bg-eitherway-elements-preview-addressBar-backgroundActive
        focus-within-border-eitherway-elements-borderColorActive focus-within:text-eitherway-elements-preview-addressBar-textActive"
        >
          <input
            ref={inputRef}
            className="w-full bg-transparent outline-none"
            type="text"
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && validateUrl(url)) {
                setIframeUrl(url);

                if (inputRef.current) {
                  inputRef.current.blur();
                }
              }
            }}
          />
        </div>
        {previews.length > 1 && (
          <PortDropdown
            activePreviewIndex={activePreviewIndex}
            setActivePreviewIndex={setActivePreviewIndex}
            isDropdownOpen={isPortDropdownOpen}
            setHasSelectedPreview={(value) => (hasSelectedPreview.current = value)}
            setIsDropdownOpen={setIsPortDropdownOpen}
            previews={previews}
          />
        )}
      </div>
      <div className="flex-1 border-t border-eitherway-elements-borderColor relative">
        {activePreview && iframeUrl ? (
          <>
            {previewMode === 'mobile' ? (
              /* Mobile View - iPhone 17 Pro Max Frame */
              <div className="w-full h-full flex items-center justify-center bg-gray-900 overflow-auto">
                <div className="flex items-center justify-center p-4 min-h-full">
                  <div
                    className="relative bg-black rounded-[3rem] shadow-2xl border-[14px] border-gray-800 flex-shrink-0"
                    style={{
                      width: 'min(430px, calc(100vw - 2rem))',
                      height: 'min(932px, calc(100vh - 200px))',
                    }}
                  >
                    {/* Notch */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-7 bg-black rounded-b-3xl z-10"></div>

                    {/* Screen */}
                    <div className="absolute inset-0 overflow-hidden rounded-[2.5rem]">
                      <iframe
                        ref={iframeRef}
                        className="border-none w-full h-full"
                        src={iframeUrl}
                        title="App Preview"
                        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads allow-presentation allow-popups-to-escape-sandbox"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gyroscope; picture-in-picture; web-share"
                      />
                    </div>

                    {/* Home Indicator */}
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1 bg-white/30 rounded-full"></div>
                  </div>
                </div>
              </div>
            ) : (
              /* Desktop View */
              <iframe
                ref={iframeRef}
                className="border-none w-full h-full"
                src={iframeUrl}
                title="App Preview"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads allow-presentation allow-popups-to-escape-sandbox"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gyroscope; picture-in-picture; web-share"
              />
            )}
            {/* Building overlay when AI is generating code */}
            {(() => {
              const shouldShow = currentPhase === 'code-writing' || currentPhase === 'building';
              console.log('🎨 [Preview Overlay] Should show?', shouldShow, 'Phase:', currentPhase);
              return shouldShow ? (
                <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-10">
                  <div className="flex flex-col gap-4 items-center">
                    <div className="relative w-12 h-12">
                      <div className="absolute inset-0 border-4 border-white/20 rounded-full"></div>
                      <div className="absolute inset-0 border-4 border-blue-500 rounded-full border-t-transparent animate-spin"></div>
                    </div>
                    <div className="text-white font-medium">
                      {currentPhase === 'code-writing' ? 'Generating code...' : 'Building preview...'}
                    </div>
                  </div>
                </div>
              ) : null;
            })()}
            {/* Error overlay when preview encounters errors */}
            {(() => {
              console.log('🔴 [Error Overlay Check]', {
                hasError: !!previewError,
                errorType: previewError?.source,
                hasSessionId: !!sessionId,
                sessionId,
                willShow: !!(previewError && sessionId)
              });
              return previewError && sessionId ? (
                <ErrorOverlay
                  error={previewError}
                  sessionId={sessionId}
                  onResolved={() => setPreviewError(null)}
                />
              ) : null;
            })()}
          </>
        ) : (
          <div className="flex flex-col gap-6 w-full h-full justify-center items-center p-8 text-center">
            {buildStatus === 'building' ? (
              <>
                <div className="relative w-16 h-16">
                  <div className="absolute inset-0 border-4 border-gray-200 rounded-full"></div>
                  <div className="absolute inset-0 border-4 border-blue-500 rounded-full border-t-transparent animate-spin"></div>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="font-righteous text-[20px] leading-[100%] text-white">{buildMessage}</div>
                  <div className="text-sm text-gray-500">
                    <span className="tabular-nums">{elapsedSeconds}s</span>
                  </div>
                </div>
                {elapsedSeconds > 30 && (
                  <div className="text-xs text-gray-400 max-w-md mt-2">
                    Great things take time! Your app is being crafted with care.
                  </div>
                )}
              </>
            ) : buildStatus === 'ready' && !activePreview ? (
              <>
                <div className="relative w-16 h-16">
                  <div className="absolute inset-0 border-4 border-green-500 rounded-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>
                <div className="font-righteous text-[20px] leading-[100%] text-white">Build Complete!</div>
                <div className="text-sm text-gray-500">Your app is ready to preview</div>
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
});
