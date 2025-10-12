import type { WebContainer } from '@webcontainer/api';
import { atom } from 'nanostores';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('PreviewsStore');

export interface PreviewInfo {
  port: number;
  ready: boolean;
  baseUrl: string;
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

      const previews = this.previews.get();

      if (!previewInfo) {
        // Use the URL provided by WebContainer as-is
        // WebContainer provides the correct URL for the environment
        previewInfo = { port, ready: type === 'open', baseUrl: url };
        this.#availablePreviews.set(port, previewInfo);
        previews.push(previewInfo);
        logger.info(`Preview registered - Port: ${port}, URL: ${url}`);
      } else {
        previewInfo.ready = type === 'open';
        previewInfo.baseUrl = url;
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
    const previews = this.previews.get();
    let previewInfo = this.#availablePreviews.get(port);

    if (!previewInfo) {
      previewInfo = { port, ready: true, baseUrl: url };
      this.#availablePreviews.set(port, previewInfo);
      previews.push(previewInfo);
      this.previews.set([...previews]);
      logger.info(`📌 Manually registered preview - Port: ${port}, URL: ${url}`);
    } else {
      logger.debug(`Preview already registered for port ${port}`);
    }
  }
}
