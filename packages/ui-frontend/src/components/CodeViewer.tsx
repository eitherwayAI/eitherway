import { useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';

interface CodeViewerProps {
  filePath: string | null;
}

export default function CodeViewer({ filePath }: CodeViewerProps) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!filePath) {
      setContent('');
      return;
    }

    const loadFile = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/files/${filePath}`);
        if (!response.ok) {
          throw new Error(`Failed to load file: ${response.statusText}`);
        }

        const data = await response.json();
        setContent(data.content || '');
      } catch (err: any) {
        setError(err.message);
        setContent('');
      } finally {
        setLoading(false);
      }
    };

    loadFile();
  }, [filePath]);

  const getLanguage = (path: string | null) => {
    if (!path) return 'plaintext';

    const ext = path.split('.').pop()?.toLowerCase();
    const langMap: Record<string, string> = {
      'ts': 'typescript',
      'tsx': 'typescript',
      'js': 'javascript',
      'jsx': 'javascript',
      'json': 'json',
      'html': 'html',
      'css': 'css',
      'scss': 'scss',
      'md': 'markdown',
      'py': 'python',
      'java': 'java',
      'go': 'go',
      'rs': 'rust',
      'cpp': 'cpp',
      'c': 'c',
      'sh': 'shell',
      'yml': 'yaml',
      'yaml': 'yaml'
    };

    return langMap[ext || ''] || 'plaintext';
  };

  if (!filePath) {
    return (
      <div className="code-viewer">
        <div className="loading">
          <span>Select a file to view</span>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="code-viewer">
        <div className="loading">
          <div className="spinner"></div>
          <span>Loading file...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="code-viewer">
        <div className="loading" style={{ color: 'var(--error)' }}>
          <span>Error: {error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="code-viewer">
      <Editor
        height="100%"
        language={getLanguage(filePath)}
        value={content}
        theme="vs-dark"
        options={{
          readOnly: true,
          minimap: { enabled: false },
          fontSize: 13,
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true
        }}
      />
    </div>
  );
}
