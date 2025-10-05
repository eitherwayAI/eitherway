import { useState } from 'react';

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  children?: FileNode[];
}

interface FileTreeProps {
  files: FileNode[];
  onSelectFile: (path: string) => void;
  selectedFile?: string;
}

export default function FileTree({ files, onSelectFile, selectedFile }: FileTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpanded = (path: string) => {
    const newExpanded = new Set(expanded);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpanded(newExpanded);
  };

  const renderNode = (node: FileNode, depth: number = 0) => {
    const isExpanded = expanded.has(node.path);
    const isSelected = selectedFile === node.path;

    if (node.type === 'directory') {
      return (
        <div key={node.path}>
          <div
            className={`file-item directory ${isSelected ? 'selected' : ''}`}
            style={{ paddingLeft: `${depth * 12 + 16}px` }}
            onClick={() => toggleExpanded(node.path)}
          >
            <span className="file-icon">{isExpanded ? '📂' : '📁'}</span>
            <span>{node.name}</span>
          </div>
          {isExpanded && node.children && (
            <div>
              {node.children.map(child => renderNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    return (
      <div
        key={node.path}
        className={`file-item ${isSelected ? 'selected' : ''}`}
        style={{ paddingLeft: `${depth * 12 + 16}px` }}
        onClick={() => onSelectFile(node.path)}
      >
        <span className="file-icon">📄</span>
        <span>{node.name}</span>
      </div>
    );
  };

  return (
    <div className="file-tree">
      {files.length === 0 ? (
        <div className="loading">
          <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
            No files yet. Use the chat to create an app! 💬
          </span>
        </div>
      ) : (
        files.map(node => renderNode(node))
      )}
    </div>
  );
}
