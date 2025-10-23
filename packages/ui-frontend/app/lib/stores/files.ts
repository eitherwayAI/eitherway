import type { PathWatcherEvent, WebContainer } from '@webcontainer/api';
import { getEncoding } from 'istextorbinary';
import { map, type MapStore } from 'nanostores';
import { Buffer } from 'node:buffer';
// Простий polyfill для relative
function relative(from: string, to: string): string {
  // Спрощена імплементація
  if (to.startsWith(from)) {
    return to.slice(from.length).replace(/^\//, '') || '.';
  }
  return to;
}

const nodePath = { relative };
import { bufferWatchEvents } from '~/utils/buffer';
import { WORK_DIR } from '~/utils/constants';
import { computeFileModifications } from '~/utils/diff';
import { createScopedLogger } from '~/utils/logger';
import { unreachable } from '~/utils/unreachable';
import { BACKEND_URL } from '~/config/api';
import { sessionContext } from './sessionContext';

const logger = createScopedLogger('FilesStore');

const utf8TextDecoder = new TextDecoder('utf8', { fatal: true });

export interface File {
  type: 'file';
  content: string;
  isBinary: boolean;
}

export interface Folder {
  type: 'folder';
}

type Dirent = File | Folder;

export type FileMap = Record<string, Dirent | undefined>;

export class FilesStore {
  #webcontainer: Promise<WebContainer>;

  /**
   * Tracks the number of files without folders.
   */
  #size = 0;

  /**
   * @note Keeps track all modified files with their original content since the last user message.
   * Needs to be reset when the user sends another message and all changes have to be submitted
   * for the model to be aware of the changes.
   */
  #modifiedFiles: Map<string, string> = import.meta.hot?.data.modifiedFiles ?? new Map();

  /**
   * Map of files that matches the state of WebContainer.
   */
  files: MapStore<FileMap> = import.meta.hot?.data.files ?? map({});

  get filesCount() {
    return this.#size;
  }

  constructor(webcontainerPromise: Promise<WebContainer>) {
    this.#webcontainer = webcontainerPromise;

    if (import.meta.hot) {
      import.meta.hot.data.files = this.files;
      import.meta.hot.data.modifiedFiles = this.#modifiedFiles;
    }

    this.#init();
  }

  getFile(filePath: string) {
    const dirent = this.files.get()[filePath];

    if (dirent?.type !== 'file') {
      return undefined;
    }

    return dirent;
  }

  getFileModifications() {
    return computeFileModifications(this.files.get(), this.#modifiedFiles);
  }

  resetFileModifications() {
    this.#modifiedFiles.clear();
  }

  async saveFile(filePath: string, content: string) {
    console.log('[FilesStore] 💾 Starting file save:', filePath);
    const webcontainer = await this.#webcontainer;

    try {
      const relativePath = nodePath.relative(webcontainer.workdir, filePath);
      console.log('[FilesStore] 📂 Relative path:', relativePath);

      if (!relativePath) {
        throw new Error(`EINVAL: invalid file path, write '${relativePath}'`);
      }

      const oldContent = this.getFile(filePath)?.content;

      if (!oldContent) {
        unreachable('Expected content to be defined');
      }

      console.log('[FilesStore] ✍️  Writing to WebContainer...', relativePath);
      await webcontainer.fs.writeFile(relativePath, content);
      console.log('[FilesStore] ✅ WebContainer write complete');

      if (!this.#modifiedFiles.has(filePath)) {
        this.#modifiedFiles.set(filePath, oldContent);
      }

      // we immediately update the file and don't rely on the `change` event coming from the watcher
      this.files.setKey(filePath, { type: 'file', content, isBinary: false });

      // CRITICAL FIX: Make backend sync BLOCKING to catch errors and provide feedback
      console.log('[FilesStore] 🔄 Starting backend sync...');
      try {
        await this.#syncToBackend(relativePath, content);
        console.log('[FilesStore] ✅ Backend sync successful');
        logger.info('File saved successfully to backend:', relativePath);
      } catch (error: any) {
        console.error('[FilesStore] ❌ Backend sync FAILED:', error);
        logger.error('Failed to sync file to backend:', error);

        // Show error toast to user
        if (typeof window !== 'undefined') {
          import('react-toastify')
            .then(({ toast }) => {
              toast.error(`Failed to save ${filePath.split('/').pop()} to server: ${error.message}`, {
                autoClose: 5000,
                position: 'bottom-right',
              });
            })
            .catch(() => {
              console.error('[FilesStore] Could not import toast library');
            });
        }

        // Still throw so caller knows it failed
        throw new Error(`Backend sync failed: ${error.message}`);
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('webcontainer:file-updated', {
            detail: { filePath: relativePath },
          }),
        );
      }
    } catch (error) {
      console.error('[FilesStore] ❌ File save failed:', error);
      logger.error('Failed to update file content\n\n', error);

      throw error;
    }
  }

  async #syncToBackend(filePath: string, content: string, retries = 3) {
    // CRITICAL FIX: Use sessionContext instead of localStorage to avoid session mixing
    const { currentSessionId } = sessionContext.get();
    console.log('[FilesStore] Session ID:', currentSessionId);

    if (!currentSessionId) {
      const error = 'No active session found - cannot sync to backend. Please refresh the page.';
      console.error('[FilesStore]', error);
      throw new Error(error);
    }

    const sessionId = currentSessionId;

    // Strip session prefix from path before sending to backend
    // Backend expects relative paths like 'src/App.jsx', not '__session_xxx__/src/App.jsx'
    const sessionPrefix = `__session_${sessionId}__/`;
    const relativePath = filePath.startsWith(sessionPrefix)
      ? filePath.substring(sessionPrefix.length)
      : filePath;

    const url = `${BACKEND_URL}/api/sessions/${sessionId}/files/write`;

    console.log('[FilesStore] 📡 POST', url);
    console.log('[FilesStore] 📄 File:', relativePath, '(full path:', filePath, ') | Size:', content.length, 'chars');

    // Retry logic for transient network failures
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            path: relativePath,
            content: content,
          }),
        });

        console.log('[FilesStore] 📬 Response status:', response.status, response.statusText);

        if (!response.ok) {
          // Try to get error details from response
          let errorMessage = response.statusText;
          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
            console.error('[FilesStore] Error details:', errorData);
          } catch (e) {
            // Response wasn't JSON, use statusText
          }

          // For 5xx errors, retry
          if (response.status >= 500 && attempt < retries) {
            console.warn(`[FilesStore] ⚠️  Server error (attempt ${attempt}/${retries}), retrying in ${attempt}s...`);
            await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
            continue;
          }

          throw new Error(`Server returned ${response.status}: ${errorMessage}`);
        }

        const result = await response.json();
        console.log('[FilesStore] ✅ Success:', result.message);
        logger.info(`File ${relativePath} synced to backend successfully`);
        return result;
      } catch (error: any) {
        console.error(`[FilesStore] ❌ Attempt ${attempt}/${retries} failed:`, error.message);

        // If it's a network error and we have retries left, try again
        if (attempt < retries && (error.name === 'TypeError' || error.message.includes('fetch'))) {
          console.warn(`[FilesStore] ⚠️  Network error, retrying in ${attempt}s...`);
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
          continue;
        }

        // Last attempt or non-retryable error - throw it
        throw error;
      }
    }

    // Should never reach here, but just in case
    throw new Error('Max retries exceeded');
  }

  async #init() {
    const webcontainer = await this.#webcontainer;

    webcontainer.internal.watchPaths(
      { include: [`${WORK_DIR}/**`], exclude: ['**/node_modules', '.git'], includeContent: true },
      bufferWatchEvents(100, this.#processEventBuffer.bind(this)),
    );
  }

  #processEventBuffer(events: Array<[events: PathWatcherEvent[]]>) {
    const watchEvents = events.flat(2);

    for (const { type, path, buffer } of watchEvents) {
      const sanitizedPath = path.replace(/\/+$/g, '');

      switch (type) {
        case 'add_dir': {
          // we intentionally add a trailing slash so we can distinguish files from folders in the file tree
          this.files.setKey(sanitizedPath, { type: 'folder' });
          break;
        }
        case 'remove_dir': {
          this.files.setKey(sanitizedPath, undefined);

          for (const [direntPath] of Object.entries(this.files)) {
            if (direntPath.startsWith(sanitizedPath)) {
              this.files.setKey(direntPath, undefined);
            }
          }

          break;
        }
        case 'add_file':
        case 'change': {
          if (type === 'add_file') {
            this.#size++;
          }

          let content = '';

          /**
           * @note This check is purely for the editor. The way we detect this is not
           * bullet-proof and it's a best guess so there might be false-positives.
           * The reason we do this is because we don't want to display binary files
           * in the editor nor allow to edit them.
           */
          const isBinary = isBinaryFile(buffer);

          if (!isBinary) {
            content = this.#decodeFileContent(buffer);
          }

          this.files.setKey(sanitizedPath, { type: 'file', content, isBinary });

          break;
        }
        case 'remove_file': {
          this.#size--;
          this.files.setKey(sanitizedPath, undefined);
          break;
        }
        case 'update_directory': {
          // we don't care about these events
          break;
        }
      }
    }
  }

  #decodeFileContent(buffer?: Uint8Array) {
    if (!buffer || buffer.byteLength === 0) {
      return '';
    }

    try {
      return utf8TextDecoder.decode(buffer);
    } catch (error) {
      console.log(error);
      return '';
    }
  }
}

function isBinaryFile(buffer: Uint8Array | undefined) {
  if (buffer === undefined) {
    return false;
  }

  return getEncoding(convertToBuffer(buffer), { chunkLength: 100 }) === 'binary';
}

/**
 * Converts a `Uint8Array` into a Node.js `Buffer` by copying the prototype.
 * The goal is to  avoid expensive copies. It does create a new typed array
 * but that's generally cheap as long as it uses the same underlying
 * array buffer.
 */
function convertToBuffer(view: Uint8Array): Buffer {
  const buffer = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);

  Object.setPrototypeOf(buffer, Buffer.prototype);

  return buffer as Buffer;
}
