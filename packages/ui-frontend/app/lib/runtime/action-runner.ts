import { WebContainer } from '@webcontainer/api';
import { map, type MapStore } from 'nanostores';

function dirname(path: string): string {
  const parts = path.split('/');

  if (parts.length <= 1) {
    return '.';
  }

  parts.pop();

  return parts.join('/') || '/';
}

const nodePath = { dirname };
import type { EitherwayAction } from '~/types/actions';
import { createScopedLogger } from '~/utils/logger';
import { loadThemeLock, saveThemeLock } from '~/lib/runtime/theme-lock';
import { mergeStylesCss } from '~/lib/runtime/style-preserver';
import { unreachable } from '~/utils/unreachable';
import type { ActionCallbackData } from './message-parser';

const logger = createScopedLogger('ActionRunner');

export type ActionStatus = 'pending' | 'running' | 'complete' | 'aborted' | 'failed';

export type BaseActionState = EitherwayAction & {
  status: Exclude<ActionStatus, 'failed'>;
  abort: () => void;
  executed: boolean;
  abortSignal: AbortSignal;
  operationType?: 'create' | 'modify';
};

export type FailedActionState = EitherwayAction &
  Omit<BaseActionState, 'status'> & {
    status: Extract<ActionStatus, 'failed'>;
    error: string;
  };

export type ActionState = BaseActionState | FailedActionState;

type BaseActionUpdate = Partial<Pick<BaseActionState, 'status' | 'abort' | 'executed' | 'operationType'>>;

export type ActionStateUpdate =
  | BaseActionUpdate
  | (Omit<BaseActionUpdate, 'status'> & { status: 'failed'; error: string });

type ActionsMap = MapStore<Record<string, ActionState>>;

export class ActionRunner {
  #webcontainer: Promise<WebContainer>;
  #currentExecutionPromise: Promise<void> = Promise.resolve();

  actions: ActionsMap = map({});

  constructor(webcontainerPromise: Promise<WebContainer>) {
    this.#webcontainer = webcontainerPromise;
  }

  /**
   * Compute a stable, unique key for actions across messages.
   * Without this, action IDs like "0", "1" collide between messages.
   */
  #keyFor(data: Pick<ActionCallbackData, 'messageId' | 'actionId'>): string {
    return `${data.messageId}:${data.actionId}`;
  }

  addAction(data: ActionCallbackData) {
    const key = this.#keyFor(data);

    const actions = this.actions.get();
    const action = actions[key];

    if (action) {
      // action already added
      return;
    }

    const abortController = new AbortController();

    this.actions.setKey(key, {
      ...data.action,
      status: 'pending',
      executed: false,
      abort: () => {
        abortController.abort();
        this.#updateAction(key, { status: 'aborted' });
      },
      abortSignal: abortController.signal,
    });

    // Do not mark as "running" here – set it when the action actually executes
  }

  async runAction(data: ActionCallbackData) {
    const key = this.#keyFor(data);
    const action = this.actions.get()[key];

    if (!action) {
      unreachable(`Action ${key} not found`);
    }

    if (action.executed) {
      return;
    }

    this.#updateAction(key, { ...action, ...data.action, executed: true });

    this.#currentExecutionPromise = this.#currentExecutionPromise
      .then(() => {
        return this.#executeAction(key);
      })
      .catch((error) => {
        console.error('Action failed:', error);
      });
  }

  async #executeAction(key: string) {
    const action = this.actions.get()[key];

    this.#updateAction(key, { status: 'running' });

    // Determine the actual operation type for file actions
    let actionDescription: string;
    let operationType: 'create' | 'modify' | undefined;

    if (action.type === 'file') {
      const webcontainer = await this.#webcontainer;
      let fileExists = false;
      try {
        await webcontainer.fs.readFile(action.filePath, 'utf8');
        fileExists = true;
      } catch {
        fileExists = false;
      }

      operationType = fileExists ? 'modify' : 'create';
      actionDescription = fileExists
        ? `Modifying file: ${action.filePath}`
        : `Creating file: ${action.filePath}`;

      this.#updateAction(key, { operationType });
    } else {
      actionDescription = `Running command: ${action.content?.substring(0, 100)}...`;
    }

    logger.info(`Starting action ${key}: ${actionDescription}`);

    try {
      switch (action.type) {
        case 'shell': {
          await this.#runShellAction(action);
          break;
        }
        case 'file': {
          await this.#runFileAction(action);
          break;
        }
      }

      this.#updateAction(key, { status: action.abortSignal.aborted ? 'aborted' : 'complete' });
      logger.info(`Completed action ${key}: ${actionDescription}`);
    } catch (error) {
      this.#updateAction(key, { status: 'failed', error: 'Action failed' });
      logger.error(`Action ${key} failed:`, error);

      // re-throw the error to be caught in the promise chain
      throw error;
    }
  }

  async #runShellAction(action: ActionState) {
    if (action.type !== 'shell') {
      unreachable('Expected shell action');
    }

    const webcontainer = await this.#webcontainer;

    const process = await webcontainer.spawn('jsh', ['-c', action.content], {
      env: { npm_config_yes: true },
    });

    action.abortSignal.addEventListener('abort', () => {
      process.kill();
    });

    process.output.pipeTo(
      new WritableStream({
        write(data) {
          logger.debug(data);
        },
      }),
    );

    // Do not block the queue on long-running dev servers
    const isLongRunning =
      /\bnpm\s+(run\s+)?(dev|start)\b/.test(action.content) ||
      /\b(vite|next|nuxt|remix|astro)\b/.test(action.content) ||
      /\b(http-server|live-server)\b/.test(action.content) ||
      /python3?\s+-m\s+http\.server/.test(action.content);

    if (!isLongRunning) {
      const exitCode = await process.exit;
      logger.debug(`Process terminated with code ${exitCode}`);
    } else {
      logger.info('Long-running dev server detected – not awaiting process.exit to keep the queue unblocked');
    }
  }

  async #runFileAction(action: ActionState) {
    if (action.type !== 'file') {
      unreachable('Expected file action');
    }

    const webcontainer = await this.#webcontainer;

    let folder = nodePath.dirname(action.filePath);

    folder = folder.replace(/\/+$/g, '');

    if (folder !== '.') {
      try {
        await webcontainer.fs.mkdir(folder, { recursive: true });
        logger.debug('Created folder', folder);
      } catch (error) {
        logger.error('Failed to create folder\n\n', error);
      }
    }

    try {
      let fileExists = false;
      try {
        await webcontainer.fs.readFile(action.filePath, 'utf8');
        fileExists = true;
      } catch {
        fileExists = false;
      }

      // For critical files that exist, we should modify, not recreate
      if (fileExists && this.shouldUseModify(action.filePath)) {
        // Modify existing file - this preserves file identity for hot-reload
        let contentToWrite = action.content;
        const basename = action.filePath.split('/').pop() || action.filePath;
        if (basename === 'styles.css') {
          // Merge-on-write for styles.css: preserve locked theme tokens unless an explicit change
          const existing = (await webcontainer.fs.readFile(action.filePath, 'utf8')) as unknown as string;
          const lock = await loadThemeLock(webcontainer.fs);
          const { css, updatedLock } = mergeStylesCss(action.content, existing, lock.colors || {});
          contentToWrite = css;
          if (updatedLock) {
            await saveThemeLock(webcontainer.fs, { colors: updatedLock, updatedAt: Date.now() });
          }
        } else if (basename === 'index.html') {
          // Inject dark mode for index.html
          contentToWrite = this.#injectDarkMode(contentToWrite);
        }
        await webcontainer.fs.writeFile(action.filePath, contentToWrite);
        logger.debug(`Modified file ${action.filePath}`);
      } else {
        let contentToWrite = action.content;
        const basename = action.filePath.split('/').pop() || action.filePath;
        if (basename === 'styles.css') {
          // On create, write as-is; do not set lock yet
          // The first post-build modify will establish the lock
        } else if (basename === 'index.html') {
          // Inject dark mode for index.html
          contentToWrite = this.#injectDarkMode(contentToWrite);
        }
        await webcontainer.fs.writeFile(action.filePath, contentToWrite);
        logger.debug(`Created file ${action.filePath}`);
      }
    } catch (error) {
      logger.error('Failed to write file\n\n', error);
    }
  }

  shouldUseModify(filePath: string): boolean {
    // Critical files that should always be modified, not recreated
    const criticalFiles = [
      'index.html',
      'main.js',
      'main.ts',
      'app.js',
      'app.ts',
      'styles.css',
      'base.css'
    ];

    const filename = filePath.split('/').pop() || '';
    return criticalFiles.includes(filename);
  }

  #injectYouTubeFix(htmlContent: string): string {
    // Don't inject if already present
    if (htmlContent.includes('YouTube Embed Handler for WebContainer')) {
      return htmlContent;
    }

    const youtubeFixScript = `
<style>
  a.youtube-preview {
    position: relative;
    display: block !important;
    width: 100%;
    padding-bottom: 56.25%; /* 16:9 aspect ratio */
    background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
    border-radius: 12px;
    overflow: hidden;
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    text-decoration: none !important;
    color: inherit !important;
  }
  a.youtube-preview:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 12px rgba(0, 0, 0, 0.15);
    text-decoration: none !important;
  }
  .youtube-preview-inner {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background-size: cover;
    background-position: center;
  }
  .youtube-preview-inner::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(to bottom,
      rgba(0,0,0,0.1) 0%,
      rgba(0,0,0,0.2) 50%,
      rgba(0,0,0,0.7) 100%);
  }
  .youtube-preview-content {
    position: relative;
    z-index: 2;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding: 20px;
    text-align: center;
  }
  .youtube-play-button {
    width: 72px;
    height: 52px;
    background: #ff0000;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s ease;
    box-shadow: 0 4px 15px rgba(255, 0, 0, 0.3);
  }
  .youtube-preview:hover .youtube-play-button {
    background: #ff0000;
    transform: scale(1.1);
    box-shadow: 0 6px 20px rgba(255, 0, 0, 0.4);
  }
  .youtube-play-icon {
    width: 0;
    height: 0;
    border-left: 24px solid white;
    border-top: 14px solid transparent;
    border-bottom: 14px solid transparent;
    margin-left: 4px;
  }
  .youtube-preview-text {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: 400px;
  }
  .youtube-title {
    color: white;
    font-size: 16px;
    font-weight: 600;
    text-shadow: 0 2px 4px rgba(0,0,0,0.5);
  }
  .youtube-subtitle {
    color: rgba(255, 255, 255, 0.9);
    font-size: 13px;
    line-height: 1.4;
    text-shadow: 0 1px 3px rgba(0,0,0,0.5);
  }
  .youtube-badge {
    position: absolute;
    top: 12px;
    right: 12px;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(10px);
    color: white;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 6px;
    z-index: 3;
  }
  .youtube-badge-icon {
    width: 14px;
    height: 14px;
    fill: #00ff88;
  }
</style>
<script>
// YouTube Embed Handler for WebContainer Environment
(function() {
  'use strict';

  // Fix for missing palette colors (if any)
  if (typeof window.staticLoadtimePalette === 'object' && !window.staticLoadtimePalette.gx_no_16) {
    window.staticLoadtimePalette.gx_no_16 = '#1a1a1a';
  }

  // Function to extract video ID from various YouTube URL formats
  function getYouTubeVideoId(url) {
    const patterns = [
      /youtube\\.com\\/embed\\/([^?&]+)/,
      /youtube\\.com\\/watch\\?v=([^&]+)/,
      /youtu\\.be\\/([^?&]+)/,
      /youtube-nocookie\\.com\\/embed\\/([^?&]+)/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  function createYouTubePreview(videoId, width, height) {
    const preview = document.createElement('a');
    preview.href = 'https://www.youtube.com/watch?v=' + videoId;
    preview.target = '_blank';
    preview.rel = 'noopener noreferrer';
    preview.className = 'youtube-preview';
    preview.style.display = 'block';
    preview.style.textDecoration = 'none';
    if (width && width !== '100%') preview.style.maxWidth = width;

    const inner = document.createElement('div');
    inner.className = 'youtube-preview-inner';
    inner.style.backgroundImage = 'url(https://img.youtube.com/vi/' + videoId + '/maxresdefault.jpg), url(https://img.youtube.com/vi/' + videoId + '/hqdefault.jpg)';

    const badge = document.createElement('div');
    badge.className = 'youtube-badge';
    badge.innerHTML = '<svg class="youtube-badge-icon" viewBox="0 0 24 24"><path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/></svg> Preview Mode';

    const content = document.createElement('div');
    content.className = 'youtube-preview-content';

    const playButton = document.createElement('div');
    playButton.className = 'youtube-play-button';
    playButton.innerHTML = '<div class="youtube-play-icon"></div>';

    const textWrapper = document.createElement('div');
    textWrapper.className = 'youtube-preview-text';

    const title = document.createElement('div');
    title.className = 'youtube-title';
    title.textContent = 'Click to Watch on YouTube';

    const subtitle = document.createElement('div');
    subtitle.className = 'youtube-subtitle';
    subtitle.textContent = 'Opens in new tab • WebContainer preview mode • Videos embed normally after deployment';

    textWrapper.appendChild(title);
    textWrapper.appendChild(subtitle);

    content.appendChild(playButton);
    content.appendChild(textWrapper);

    inner.appendChild(badge);
    inner.appendChild(content);
    preview.appendChild(inner);

    // Ensure click opens in new tab (belt and suspenders approach)
    preview.onclick = function(e) {
      e.preventDefault();
      const url = 'https://www.youtube.com/watch?v=' + videoId;
      console.log('Opening YouTube video:', url);

      // Try window.open first
      try {
        const newWindow = window.open(url, '_blank', 'noopener,noreferrer');
        if (!newWindow || newWindow.closed || typeof newWindow.closed == 'undefined') {
          // If popup blocked, create a temporary link and click it
          const tempLink = document.createElement('a');
          tempLink.href = url;
          tempLink.target = '_blank';
          tempLink.rel = 'noopener noreferrer';
          tempLink.style.display = 'none';
          document.body.appendChild(tempLink);
          tempLink.click();
          document.body.removeChild(tempLink);
        }
      } catch (err) {
        console.error('Failed to open YouTube:', err);
        // Last resort: navigate current window
        window.location.href = url;
      }
    };

    return preview;
  }

  // Replace YouTube iframes with preview
  function replaceYouTubeEmbeds() {
    const iframes = document.querySelectorAll('iframe[src*="youtube.com"], iframe[src*="youtu.be"], iframe[src*="youtube-nocookie.com"]');
    console.log('Found ' + iframes.length + ' YouTube iframes to replace');

    iframes.forEach(iframe => {
      console.log('Processing iframe with src:', iframe.src);
      const videoId = getYouTubeVideoId(iframe.src);

      if (videoId) {
        console.log('Extracted video ID:', videoId);
        const preview = createYouTubePreview(videoId, iframe.width, iframe.height);

        // Make sure click handler works
        preview.style.cursor = 'pointer';

        // Preserve any wrapper styling
        if (iframe.parentElement) {
          iframe.parentElement.replaceChild(preview, iframe);
          console.log('Replaced iframe with preview for video:', videoId);
        }
      } else {
        console.warn('Could not extract video ID from:', iframe.src);
      }
    });
  }

  // Run replacement when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', replaceYouTubeEmbeds);
  } else {
    // Small delay to ensure iframes are rendered
    setTimeout(replaceYouTubeEmbeds, 100);
  }

  // Monitor for dynamically added iframes
  const observer = new MutationObserver(function(mutations) {
    let hasNewIframes = false;
    mutations.forEach(function(mutation) {
      mutation.addedNodes.forEach(function(node) {
        if (node.nodeName === 'IFRAME' && node.src &&
            (node.src.includes('youtube') || node.src.includes('youtu.be'))) {
          hasNewIframes = true;
        }
      });
    });
    if (hasNewIframes) {
      setTimeout(replaceYouTubeEmbeds, 100);
    }
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Expose global function for manual usage
  window.embedYouTube = function(container, videoUrl) {
    const videoId = getYouTubeVideoId(videoUrl) || videoUrl;
    const preview = createYouTubePreview(videoId);

    if (typeof container === 'string') {
      const element = document.querySelector(container);
      if (element) {
        element.innerHTML = '';
        element.appendChild(preview);
      }
    } else if (container instanceof HTMLElement) {
      container.innerHTML = '';
      container.appendChild(preview);
    }

    return preview;
  };
})();
</script>`;

    // Inject the script before closing </body> or </head> tag
    if (htmlContent.includes('</body>')) {
      return htmlContent.replace('</body>', `${youtubeFixScript}\n</body>`);
    } else if (htmlContent.includes('</head>')) {
      return htmlContent.replace('</head>', `${youtubeFixScript}\n</head>`);
    } else if (htmlContent.includes('</html>')) {
      return htmlContent.replace('</html>', `${youtubeFixScript}\n</html>`);
    }

    // If no suitable tag found, append to the end
    return htmlContent + youtubeFixScript;
  }

  #injectDarkMode(htmlContent: string): string {

    const darkModeScript = `
<script>
// Dark Mode Implementation
(function() {
  const THEME_ICONS = {
    // New sun icon for dark mode
    light: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 50 50" fill="white"><path d="M 24.90625 3.96875 C 24.863281 3.976563 24.820313 3.988281 24.78125 4 C 24.316406 4.105469 23.988281 4.523438 24 5 L 24 11 C 23.996094 11.359375 24.183594 11.695313 24.496094 11.878906 C 24.808594 12.058594 25.191406 12.058594 25.503906 11.878906 C 25.816406 11.695313 26.003906 11.359375 26 11 L 26 5 C 26.011719 4.710938 25.894531 4.433594 25.6875 4.238281 C 25.476563 4.039063 25.191406 3.941406 24.90625 3.96875 Z M 10.65625 9.84375 C 10.28125 9.910156 9.980469 10.183594 9.875 10.546875 C 9.769531 10.914063 9.878906 11.304688 10.15625 11.5625 L 14.40625 15.8125 C 14.648438 16.109375 15.035156 16.246094 15.410156 16.160156 C 15.78125 16.074219 16.074219 15.78125 16.160156 15.410156 C 16.246094 15.035156 16.109375 14.648438 15.8125 14.40625 L 11.5625 10.15625 C 11.355469 9.933594 11.054688 9.820313 10.75 9.84375 C 10.71875 9.84375 10.6875 9.84375 10.65625 9.84375 Z M 39.03125 9.84375 C 38.804688 9.875 38.59375 9.988281 38.4375 10.15625 L 34.1875 14.40625 C 33.890625 14.648438 33.753906 15.035156 33.839844 15.410156 C 33.925781 15.78125 34.21875 16.074219 34.589844 16.160156 C 34.964844 16.246094 35.351563 16.109375 35.59375 15.8125 L 39.84375 11.5625 C 40.15625 11.265625 40.246094 10.800781 40.0625 10.410156 C 39.875 10.015625 39.460938 9.789063 39.03125 9.84375 Z M 25 15 C 19.484375 15 15 19.484375 15 25 C 15 30.515625 19.484375 35 25 35 C 30.515625 35 35 30.515625 35 25 C 35 19.484375 30.515625 15 25 15 Z M 4.71875 24 C 4.167969 24.078125 3.78125 24.589844 3.859375 25.140625 C 3.9375 25.691406 4.449219 26.078125 5 26 L 11 26 C 11.359375 26.003906 11.695313 25.816406 11.878906 25.503906 C 12.058594 25.191406 12.058594 24.808594 11.878906 24.496094 C 11.695313 24.183594 11.359375 23.996094 11 24 L 5 24 C 4.96875 24 4.9375 24 4.90625 24 C 4.875 24 4.84375 24 4.8125 24 C 4.78125 24 4.75 24 4.71875 24 Z M 38.71875 24 C 38.167969 24.078125 37.78125 24.589844 37.859375 25.140625 C 37.9375 25.691406 38.449219 26.078125 39 26 L 45 26 C 45.359375 26.003906 45.695313 25.816406 45.878906 25.503906 C 46.058594 25.191406 46.058594 24.808594 45.878906 24.496094 C 45.695313 24.183594 45.359375 23.996094 45 24 L 39 24 C 38.96875 24 38.9375 24 38.90625 24 C 38.875 24 38.84375 24 38.8125 24 C 38.78125 24 38.75 24 38.71875 24 Z M 15 33.875 C 14.773438 33.90625 14.5625 34.019531 14.40625 34.1875 L 10.15625 38.4375 C 9.859375 38.679688 9.722656 39.066406 9.808594 39.441406 C 9.894531 39.8125 10.1875 40.105469 10.558594 40.191406 C 10.933594 40.277344 11.320313 40.140625 11.5625 39.84375 L 15.8125 35.59375 C 16.109375 35.308594 16.199219 34.867188 16.039063 34.488281 C 15.882813 34.109375 15.503906 33.867188 15.09375 33.875 C 15.0625 33.875 15.03125 33.875 15 33.875 Z M 34.6875 33.875 C 34.3125 33.941406 34.011719 34.214844 33.90625 34.578125 C 33.800781 34.945313 33.910156 35.335938 34.1875 35.59375 L 38.4375 39.84375 C 38.679688 40.140625 39.066406 40.277344 39.441406 40.191406 C 39.8125 40.105469 40.105469 39.8125 40.191406 39.441406 C 40.277344 39.066406 40.140625 38.679688 39.84375 38.4375 L 35.59375 34.1875 C 35.40625 33.988281 35.148438 33.878906 34.875 33.875 C 34.84375 33.875 34.8125 33.875 34.78125 33.875 C 34.75 33.875 34.71875 33.875 34.6875 33.875 Z M 24.90625 37.96875 C 24.863281 37.976563 24.820313 37.988281 24.78125 38 C 24.316406 38.105469 23.988281 38.523438 24 39 L 24 45 C 23.996094 45.359375 24.183594 45.695313 24.496094 45.878906 C 24.808594 46.058594 25.191406 46.058594 25.503906 45.878906 C 25.816406 45.695313 26.003906 45.359375 26 45 L 26 39 C 26.011719 38.710938 25.894531 38.433594 25.6875 38.238281 C 25.476563 38.039063 25.191406 37.941406 24.90625 37.96875 Z"></path></svg>',
    // Moon icon for light mode
    dark: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="none"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>'
  };

  function toggleTheme(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    updateThemeIcon(next);
  }

  function updateThemeIcon(theme) {
    const btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.innerHTML = theme === 'dark' ? THEME_ICONS.light : THEME_ICONS.dark;
    }
  }

  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);

  function createThemeToggle() {
    let btn = document.getElementById('theme-toggle');

    if (btn) {
      // Button exists - ensure it has handler and icon
      if (!btn.onclick || !btn.hasAttribute('data-handler-attached')) {
        btn.onclick = toggleTheme;
        btn.setAttribute('data-handler-attached', 'true');
      }
      // Always update icon to ensure it's correct
      updateThemeIcon(savedTheme);
    } else {
      btn = document.createElement('button');
      btn.id = 'theme-toggle';
      btn.onclick = toggleTheme;
      btn.setAttribute('data-handler-attached', 'true');
      btn.setAttribute('aria-label', 'Toggle theme');

      // First try to place in header/navbar if it has enough structure
      const header = document.querySelector('header, nav, .header, .navbar, .nav-header');

      if (header && header.children.length > 0) {
        const hasFlexOrGrid = window.getComputedStyle(header).display.includes('flex') ||
                              window.getComputedStyle(header).display.includes('grid');

        if (hasFlexOrGrid) {
          // Place inline in header
          btn.style.cssText = 'width:40px;height:40px;border-radius:50%;background:rgba(0,0,0,0.5);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:2px solid rgba(255,255,255,0.2);cursor:pointer;display:flex;align-items:center;justify-content:center;margin-left:auto;flex-shrink:0;';

          const wrapper = document.createElement('div');
          wrapper.style.cssText = 'display:flex;align-items:center;margin-left:auto;';
          wrapper.appendChild(btn);

          // Find the best insertion point
          const lastChild = header.lastElementChild;
          if (lastChild && (lastChild.tagName === 'DIV' || lastChild.tagName === 'NAV')) {
            lastChild.appendChild(wrapper);
          } else {
            header.appendChild(wrapper);
          }
        } else {
          // Use fixed positioning for non-flex headers
          btn.style.cssText = 'position:fixed;top:1rem;right:1rem;z-index:9999;width:48px;height:48px;border-radius:50%;background:rgba(0,0,0,0.5);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:2px solid rgba(255,255,255,0.2);cursor:pointer;display:flex;align-items:center;justify-content:center;';
          document.body.appendChild(btn);
        }
      } else {
        // Fallback to fixed position
        btn.style.cssText = 'position:fixed;top:1rem;right:1rem;z-index:9999;width:48px;height:48px;border-radius:50%;background:rgba(0,0,0,0.5);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:2px solid rgba(255,255,255,0.2);cursor:pointer;display:flex;align-items:center;justify-content:center;';
        document.body.appendChild(btn);
      }

      updateThemeIcon(savedTheme);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createThemeToggle);
  } else {
    createThemeToggle();
  }

  // Fallback with delay to ensure header is rendered
  setTimeout(createThemeToggle, 100);
  setTimeout(createThemeToggle, 500);

  // Make function globally available but protect from being overridden
  if (!window.toggleTheme || typeof window.toggleTheme !== 'function') {
    window.toggleTheme = toggleTheme;
  }

  // Protect our button from being broken by other scripts
  setInterval(() => {
    const btn = document.getElementById('theme-toggle');
    if (btn && (!btn.onclick || !btn.hasAttribute('data-handler-attached'))) {
      btn.onclick = toggleTheme;
      btn.setAttribute('data-handler-attached', 'true');
      updateThemeIcon(localStorage.getItem('theme') || 'light');
    }
  }, 1000);
})();
</script>`;

    // Inject before closing body tag
    if (htmlContent.includes('</body>')) {
      return htmlContent.replace('</body>', `${darkModeScript}\n</body>`);
    } else if (htmlContent.includes('</html>')) {
      return htmlContent.replace('</html>', `${darkModeScript}\n</html>`);
    }

    return htmlContent + darkModeScript;
  }

  #updateAction(id: string, newState: ActionStateUpdate) {
    const actions = this.actions.get();

    this.actions.setKey(id, { ...actions[id], ...newState });
  }
}
