/**
 * File synchronization between backend and WebContainer
 * Loads files from the backend API and writes them to WebContainer
 * Now with session namespacing for isolation
 */

import type { WebContainer } from '@webcontainer/api';
import { createScopedLogger } from './logger';
import { BACKEND_URL } from '~/config/api';
import { getSessionPath, getSessionRoot, validateSessionOperation } from '~/lib/stores/sessionContext';
import { getWebContainerUnsafe } from '~/lib/webcontainer';

const logger = createScopedLogger('FileSync');

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  children?: FileNode[];
}

interface FileContentResponse {
  content: string;
  isBinary?: boolean;
  mimeType?: string;
}

async function fetchFileContent(sessionId: string, filePath: string): Promise<FileContentResponse> {
  const response = await fetch(
    `${BACKEND_URL}/api/sessions/${sessionId}/files/read?path=${encodeURIComponent(filePath)}`,
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch file ${filePath}: ${response.statusText}`);
  }

  const data = await response.json();
  return {
    content: data.content || '',
    isBinary: data.isBinary || false,
    mimeType: data.mimeType,
  };
}

/**
 * Recursively collect all file paths from the file tree
 */
function collectFilePaths(nodes: FileNode[]): string[] {
  const paths: string[] = [];

  for (const node of nodes) {
    if (node.type === 'file') {
      paths.push(node.path);
    } else if (node.type === 'directory' && node.children) {
      paths.push(...collectFilePaths(node.children));
    }
  }

  return paths;
}

/**
 * Ensure directory exists in WebContainer
 */
async function ensureDirectory(webcontainer: WebContainer, dirPath: string): Promise<void> {
  const parts = dirPath.split('/').filter(Boolean);

  let currentPath = '';
  for (const part of parts) {
    currentPath = currentPath ? `${currentPath}/${part}` : part;

    try {
      await webcontainer.fs.mkdir(currentPath, { recursive: true });
    } catch (error) {
      // Directory might already exist, ignore error
    }
  }
}

/**
 * Sync files from backend to WebContainer with session namespacing
 */
export async function syncFilesToWebContainer(
  webcontainer: WebContainer,
  files: FileNode[],
  sessionId: string,
): Promise<void> {
  try {
    validateSessionOperation('sync files');

    logger.info(`Syncing ${files.length} files for session ${sessionId}`);

    const wc = await getWebContainerUnsafe();
    const sessionRoot = getSessionRoot();

    // Ensure session directory exists
    try {
      await wc.fs.mkdir(sessionRoot, { recursive: true });
    } catch (error) {
      // Directory might already exist, that's fine
    }

    const filePaths = collectFilePaths(files);
    logger.debug('File paths to sync:', filePaths);

    // Sync each file to session-namespaced path
    for (const filePath of filePaths) {
      try {
        const sessionPath = getSessionPath(filePath);

        // Create parent directories
        const dirPath = sessionPath.substring(0, sessionPath.lastIndexOf('/'));
        if (dirPath) {
          await wc.fs.mkdir(dirPath, { recursive: true });
        }

        // Fetch file content
        const fileData = await fetchFileContent(sessionId, filePath);

        // DEBUG: Log first 100 chars of content to verify it's changing
        logger.debug(`📥 Fetched ${filePath}: ${fileData.content.substring(0, 100)}...`);

        if (fileData.isBinary && fileData.content) {
          // Binary file: decode base64 and write as Uint8Array for Vite dev server
          // Vite doesn't understand __BASE64__ prefix, needs actual binary
          let base64Content = String(fileData.content).replace(/^\s+|\s+$/g, '');

          // Decode base64 to binary
          const binaryString = atob(base64Content);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }

          // Write as Uint8Array (WebContainer native binary format)
          await wc.fs.writeFile(sessionPath, bytes);

          logger.debug(`Binary file ${filePath}: wrote ${bytes.length} bytes as Uint8Array`);

          // Verify PNG magic number
          if ((fileData.mimeType || '').toLowerCase().includes('image/png') && bytes.length >= 8) {
            const pngMagic = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
            const matches = pngMagic.every((byte, i) => bytes[i] === byte);
            logger.debug(`PNG magic: ${matches ? '✓ Valid' : '✗ Invalid'} (${Array.from(bytes.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(' ')})`);
          }
        } else {
          // Text file: write as string
          await wc.fs.writeFile(sessionPath, fileData.content || '');
        }

        logger.debug(`Synced: ${filePath} -> ${sessionPath}`);
      } catch (error: any) {
        logger.error(`Failed to sync file ${filePath}:`, error);

        // Provide more detailed error information
        if (error.message?.includes('404') || error.message?.includes('Not Found')) {
          logger.error(`❌ File not found in session workspace: ${filePath}`);
          logger.error(`This usually means the file was not properly saved to the session's file system.`);
          logger.error(`Check that the file was written via /api/sessions/${sessionId}/files/write or write-binary`);
        } else if (error.message?.includes('Failed to fetch')) {
          logger.error(`❌ Network error fetching file: ${filePath}`);
          logger.error(`Backend server may be unreachable or file endpoint may be down`);
        } else {
          logger.error(`❌ Unknown error syncing file: ${error.message || error}`);
        }
      }
    }

    logger.info(`Sync complete for session ${sessionId}`);
  } catch (error) {
    logger.error('Sync failed:', error);
    throw error;
  }
}

/**
 * Clear all files for a specific session
 */
export async function clearSessionFiles(sessionId: string): Promise<void> {
  try {
    const wc = await getWebContainerUnsafe();
    const sessionRoot = `__session_${sessionId}__`;

    logger.info(`Clearing files for session ${sessionId}`);

    try {
      await wc.fs.rm(sessionRoot, { recursive: true, force: true });
      logger.info(`Cleared session directory: ${sessionRoot}`);
    } catch (error) {
      // Directory might not exist, that's fine
      logger.debug(`Session directory ${sessionRoot} already clear`);
    }
  } catch (error) {
    logger.error('Failed to clear session files:', error);
  }
}

/**
 * Read a file from WebContainer with session namespacing
 */
export async function readFileFromWebContainer(path: string): Promise<string | null> {
  try {
    validateSessionOperation('read file');

    const wc = await getWebContainerUnsafe();
    const sessionPath = getSessionPath(path);

    const content = await wc.fs.readFile(sessionPath, 'utf-8');
    return content;
  } catch (error) {
    logger.error(`Failed to read ${path}:`, error);
    return null;
  }
}

/**
 * Write a file to WebContainer with session namespacing
 */
export async function writeFileToWebContainer(path: string, content: string | Uint8Array): Promise<void> {
  try {
    validateSessionOperation('write file');

    const wc = await getWebContainerUnsafe();
    const sessionPath = getSessionPath(path);

    // Create parent directories
    const dirPath = sessionPath.substring(0, sessionPath.lastIndexOf('/'));
    if (dirPath) {
      await wc.fs.mkdir(dirPath, { recursive: true });
    }

    // Write file
    if (typeof content === 'string') {
      await wc.fs.writeFile(sessionPath, content, 'utf-8');
    } else {
      await wc.fs.writeFile(sessionPath, content);
    }

    logger.debug(`Wrote: ${path} -> ${sessionPath}`);
  } catch (error) {
    logger.error(`Failed to write ${path}:`, error);
    throw error;
  }
}
