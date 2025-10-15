/**
 * File synchronization between backend and WebContainer
 * Loads files from the backend API and writes them to WebContainer
 */

import type { WebContainer } from '@webcontainer/api';
import { createScopedLogger } from './logger';
import { BACKEND_URL } from '~/config/api';

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
 * Sync files from backend to WebContainer
 */
export async function syncFilesToWebContainer(
  webcontainer: WebContainer,
  files: FileNode[],
  sessionId: string,
): Promise<void> {
  logger.info('Syncing files to WebContainer', files.length, 'files');

  const filePaths = collectFilePaths(files);
  logger.debug('File paths to sync:', filePaths);

  for (const filePath of filePaths) {
    try {
      // Ensure parent directory exists
      const dirPath = filePath.split('/').slice(0, -1).join('/');
      if (dirPath) {
        await ensureDirectory(webcontainer, dirPath);
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
        await webcontainer.fs.writeFile(filePath, bytes);

        logger.debug(`Binary file ${filePath}: wrote ${bytes.length} bytes as Uint8Array`);

        // Verify PNG magic number
        if ((fileData.mimeType || '').toLowerCase().includes('image/png') && bytes.length >= 8) {
          const pngMagic = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
          const matches = pngMagic.every((byte, i) => bytes[i] === byte);
          logger.debug(`PNG magic: ${matches ? '✓ Valid' : '✗ Invalid'} (${Array.from(bytes.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(' ')})`);
        }
      } else {
        // Text file: write as string
        await webcontainer.fs.writeFile(filePath, fileData.content || '');
      }

      logger.debug(`Synced file: ${filePath} (binary: ${fileData.isBinary || false})`);
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

  logger.info('File sync complete');
}
