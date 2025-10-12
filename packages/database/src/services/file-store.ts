import { DatabaseClient } from '../client.js';
import { FilesRepository } from '../repositories/files.js';

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  mimeType?: string;
  isDirectory?: boolean;
  children?: FileNode[];
}

export interface FileContent {
  content: string | Uint8Array;
  mimeType: string;
  path: string;
  version?: number;
}

export interface FileStore {
  list(appId: string, limit?: number): Promise<FileNode[]>;
  read(appId: string, path: string): Promise<FileContent>;
  write(appId: string, path: string, content: string | Buffer, mimeType?: string, userId?: string): Promise<void>;
  rename(appId: string, oldPath: string, newPath: string): Promise<void>;
  delete(appId: string, path: string): Promise<void>;
  getVersions(appId: string, path: string, limit?: number): Promise<any[]>;
}

export class PostgresFileStore implements FileStore {
  private filesRepo: FilesRepository;

  constructor(db: DatabaseClient) {
    this.filesRepo = new FilesRepository(db);
  }

  async list(appId: string, limit = 1000): Promise<FileNode[]> {
    const files = await this.filesRepo.findByApp(appId, limit);

    const buildTree = (files: any[]): FileNode[] => {
      const rootNodes: FileNode[] = [];
      const nodeMap = new Map<string, FileNode>();

      files.forEach(file => {
        const node: FileNode = {
          name: file.path.split('/').pop() || file.path,
          path: file.path,
          type: 'file',
          size: file.size_bytes || 0,
          mimeType: file.mime_type || undefined
        };
        nodeMap.set(file.path, node);
      });

      const dirMap = new Map<string, FileNode>();

      files.forEach(file => {
        // Normalize path: remove leading slashes to prevent empty directory names
        const normalizedPath = file.path.replace(/^\/+/, '');
        const parts = normalizedPath.split('/');
        const node = nodeMap.get(file.path)!;

        if (parts.length === 1) {
          rootNodes.push(node);
        } else {
          for (let i = parts.length - 1; i > 0; i--) {
            const dirPath = parts.slice(0, i).join('/');
            const dirName = parts[i - 1];

            if (!dirMap.has(dirPath)) {
              const dirNode: FileNode = {
                name: dirName,
                path: dirPath,
                type: 'directory',
                isDirectory: true,
                children: []
              };
              dirMap.set(dirPath, dirNode);
            }

            const parentDir = dirMap.get(dirPath)!;

            if (i === parts.length - 1) {
              if (!parentDir.children!.some(c => c.path === node.path)) {
                parentDir.children!.push(node);
              }
            }
          }

          const topDir = parts[0];
          const topDirPath = topDir;
          if (!dirMap.has(topDirPath)) {
            dirMap.set(topDirPath, {
              name: topDir,
              path: topDirPath,
              type: 'directory',
              isDirectory: true,
              children: []
            });
          }
        }
      });

      dirMap.forEach((dir, path) => {
        if (!path.includes('/')) {
          rootNodes.push(dir);
        } else {
          const parentPath = path.substring(0, path.lastIndexOf('/'));
          const parentDir = dirMap.get(parentPath);
          if (parentDir && !parentDir.children!.some(c => c.path === dir.path)) {
            parentDir.children!.push(dir);
          }
        }
      });

      const sortNodes = (nodes: FileNode[]): FileNode[] => {
        return nodes.sort((a, b) => {
          if (a.type === b.type) return a.name.localeCompare(b.name);
          return a.type === 'directory' ? -1 : 1;
        }).map(node => {
          if (node.children) {
            node.children = sortNodes(node.children);
          }
          return node;
        });
      };

      return sortNodes(rootNodes);
    };

    return buildTree(files);
  }

  async read(appId: string, path: string): Promise<FileContent> {
    const file = await this.filesRepo.findByAppAndPath(appId, path);

    if (!file) {
      throw new Error(`File not found: ${path}`);
    }

    const version = await this.filesRepo.getHeadVersion(file.id);

    if (!version) {
      throw new Error(`No version found for file: ${path}`);
    }

    const content = version.content_bytes || version.content_text || '';
    const mimeType = file.mime_type || 'text/plain';

    return {
      content,
      mimeType,
      path: file.path,
      version: version.version
    };
  }

  async write(
    appId: string,
    path: string,
    content: string | Buffer,
    mimeType?: string,
    userId?: string
  ): Promise<void> {
    await this.filesRepo.upsertFile(appId, path, content, userId, mimeType);
  }

  async rename(appId: string, oldPath: string, newPath: string): Promise<void> {
    const file = await this.filesRepo.findByAppAndPath(appId, oldPath);

    if (!file) {
      throw new Error(`File not found: ${oldPath}`);
    }

    const latestVersion = await this.filesRepo.getHeadVersion(file.id);

    if (!latestVersion) {
      throw new Error(`No version found for file: ${oldPath}`);
    }

    const content = latestVersion.content_bytes || latestVersion.content_text || '';

    await this.filesRepo.upsertFile(appId, newPath, content, undefined, file.mime_type || undefined);
    await this.filesRepo.delete(file.id);
  }

  async delete(appId: string, path: string): Promise<void> {
    const file = await this.filesRepo.findByAppAndPath(appId, path);

    if (!file) {
      throw new Error(`File not found: ${path}`);
    }

    await this.filesRepo.delete(file.id);
  }

  async getVersions(appId: string, path: string, limit = 50): Promise<any[]> {
    const file = await this.filesRepo.findByAppAndPath(appId, path);

    if (!file) {
      throw new Error(`File not found: ${path}`);
    }

    return this.filesRepo.getVersionHistory(file.id, limit);
  }
}
