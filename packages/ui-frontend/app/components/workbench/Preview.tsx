import { useStore } from '@nanostores/react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { IconButton } from '~/components/ui/IconButton';
import { workbenchStore } from '~/lib/stores/workbench';
import { chatStore } from '~/lib/stores/chat';
import { PortDropdown } from './PortDropdown';

export const Preview = memo(() => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [activePreviewIndex, setActivePreviewIndex] = useState(0);
  const [isPortDropdownOpen, setIsPortDropdownOpen] = useState(false);

  // Subscribe to streaming phase for building overlay
  const { currentPhase } = useStore(chatStore);

  // Debug logging for phase changes
  useEffect(() => {
    console.log('🎯 [Preview] currentPhase changed to:', currentPhase);
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

  // update deploy status based on preview state (avoid set during render)
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

    // set to ready when we have a preview URL
    setBuildStatus('ready');
    setIsMonitoring(false);

    // update deploy status - app is ready only when we show iframe
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

    // update build status based on action states
    if ((hasRunning || hasPending) && !activePreview) {
      setBuildStatus('building');
    }

    if (allComplete && !activePreview) {
      // all actions complete but no preview - likely port detection issue
      const message = 'Starting development server...';

      setBuildMessage(message);

      // Opportunistically ensure index.html links CSS for correct theming
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

          if (!needsBase && !needsStyles && !needsEnv) return;

          const insertion = [
            needsBase ? '<link rel="stylesheet" href="/base.css">' : '',
            needsStyles ? '<link rel="stylesheet" href="/styles.css">' : '',
            needsEnv ? '<script type="module" src="/scripts/env-loader.js"></script>' : '',
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

      // set a longer timeout since servers take time to start
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

  // initialize build start time
  useEffect(() => {
    setBuildStartTime(Date.now());
  }, []);

  // check initial state when previews are available
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

  const reloadPreview = () => {
    if (iframeRef.current) {
      iframeRef.current.src = iframeRef.current.src;
    }
  };

  return (
    <div className="w-full h-full flex flex-col">
      {isPortDropdownOpen && (
        <div className="z-iframe-overlay w-full h-full absolute" onClick={() => setIsPortDropdownOpen(false)} />
      )}
      <div className="bg-eitherway-elements-background-depth-2 p-2 flex items-center gap-1.5">
        <IconButton icon="i-ph:arrow-clockwise" onClick={reloadPreview} />
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
            <iframe
              ref={iframeRef}
              className="border-none w-full h-full"
              src={iframeUrl}
              title="App Preview"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads allow-presentation allow-popups-to-escape-sandbox"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gyroscope; picture-in-picture; web-share"
            />
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
