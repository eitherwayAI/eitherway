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

/**
 * Fetch file content from backend
 */
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

      // Handle binary vs text files
      let fileContents: string;
      if (fileData.isBinary && fileData.content) {
        // Binary file: store as base64 string prefixed with __BASE64__ marker
        // This allows the static server to decode it properly
        let normalized = String(fileData.content).replace(/^\s+|\s+$/g, '');

        // Fix common corruption where a stray '0' prefixes a valid PNG base64
        if ((fileData.mimeType || '').toLowerCase().includes('image/png') && normalized[0] === '0' && normalized[1] === 'i') {
          normalized = normalized.slice(1);
        }

        fileContents = '__BASE64__' + normalized;
        logger.debug(`Binary file ${filePath}: stored as base64, length: ${normalized.length}`);
      } else {
        // Text file: use as string
        fileContents = fileData.content || '';
      }

      // Write file to WebContainer
      await webcontainer.fs.writeFile(filePath, fileContents);

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
