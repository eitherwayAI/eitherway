import type { WebContainer } from '@webcontainer/api';
import { atom } from 'nanostores';
import { createScopedLogger } from '~/utils/logger';
import { sessionContext } from './sessionContext';

const logger = createScopedLogger('PreviewsStore');

export interface PreviewInfo {
  port: number;
  ready: boolean;
  baseUrl: string;
  sessionId: string;
}

export class PreviewsStore {
  #availablePreviews = new Map<number, PreviewInfo>();
  #webcontainer: Promise<WebContainer>;

  previews = atom<PreviewInfo[]>([]);

  constructor(webcontainerPromise: Promise<WebContainer>) {
    this.#webcontainer = webcontainerPromise;

    this.#init();
  }

  async #init() {
    const webcontainer = await this.#webcontainer;

    webcontainer.on('port', (port, type, url) => {
      logger.info(`Port event received - Port: ${port}, Type: ${type}, URL: ${url}`);

      let previewInfo = this.#availablePreviews.get(port);

      if (type === 'close' && previewInfo) {
        this.#availablePreviews.delete(port);
        this.previews.set(this.previews.get().filter((preview) => preview.port !== port));
        logger.debug(`Port ${port} closed`);
        return;
      }

      const { currentSessionId } = sessionContext.get();

      if (!currentSessionId) {
        logger.warn(`Cannot register preview for port ${port} - no active session`);
        return;
      }

      const previews = this.previews.get();

      if (!previewInfo) {
        // Use the URL provided by WebContainer as-is
        // WebContainer provides the correct URL for the environment
        previewInfo = { port, ready: type === 'open', baseUrl: url, sessionId: currentSessionId };
        this.#availablePreviews.set(port, previewInfo);
        previews.push(previewInfo);
        logger.info(`Preview registered - Port: ${port}, URL: ${url}, Session: ${currentSessionId}`);
      } else {
        previewInfo.ready = type === 'open';
        previewInfo.baseUrl = url;
        previewInfo.sessionId = currentSessionId;
      }

      if (type === 'open') {
        logger.info(`✅ Dev server ready at: ${url}`);
      }

      this.previews.set([...previews]);
    });
  }

  /**
   * Manually register a preview (fallback for when port event doesn't fire)
   */
  registerPreview(port: number, url: string) {
    const { currentSessionId } = sessionContext.get();

    if (!currentSessionId) {
      logger.warn(`Cannot register preview for port ${port} - no active session`);
      return;
    }

    const previews = this.previews.get();
    let previewInfo = this.#availablePreviews.get(port);

    if (!previewInfo) {
      previewInfo = { port, ready: true, baseUrl: url, sessionId: currentSessionId };
      this.#availablePreviews.set(port, previewInfo);
      previews.push(previewInfo);
      this.previews.set([...previews]);
      logger.info(`📌 Manually registered preview - Port: ${port}, URL: ${url}, Session: ${currentSessionId}`);
    } else {
      logger.debug(`Preview already registered for port ${port}`);
    }
  }

  /**
   * Get all previews for current session only
   */
  getSessionPreviews(): PreviewInfo[] {
    const { currentSessionId } = sessionContext.get();

    if (!currentSessionId) {
      return [];
    }

    return Array.from(this.#availablePreviews.values()).filter(
      (preview) => preview.sessionId === currentSessionId,
    );
  }

  /**
   * Clear previews for a specific session
   */
  clearSessionPreviews(sessionId: string) {
    for (const [port, preview] of this.#availablePreviews.entries()) {
      if (preview.sessionId === sessionId) {
        this.#availablePreviews.delete(port);
        logger.info(`Cleared preview port ${port} for session ${sessionId}`);
      }
    }

    // Update the reactive store
    this.previews.set(Array.from(this.#availablePreviews.values()));
  }

  /**
   * Clear all previews (on logout)
   */
  clearAll() {
    this.#availablePreviews.clear();
    this.previews.set([]);
    logger.info('Cleared all previews');
  }
}
