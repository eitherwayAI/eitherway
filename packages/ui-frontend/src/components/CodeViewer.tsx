import { useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';

interface CodeViewerProps {
  filePath: string | null;
}

export default function CodeViewer({ filePath }: CodeViewerProps) {
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!filePath) {
      setContent('');
      setOriginalContent('');
      setHasChanges(false);
      return;
    }

    const loadFile = async () => {
      setLoading(true);
      setError(null);
      setHasChanges(false);

      try {
        const response = await fetch(`/api/files/${filePath}`);
        if (!response.ok) {
          throw new Error(`Failed to load file: ${response.statusText}`);
        }

        const data = await response.json();
        const fileContent = data.content || '';
        setContent(fileContent);
        setOriginalContent(fileContent);
      } catch (err: any) {
        setError(err.message);
        setContent('');
        setOriginalContent('');
      } finally {
        setLoading(false);
      }
    };

    loadFile();
  }, [filePath]);

  const handleEditorChange = (value: string | undefined) => {
    const newContent = value || '';
    setContent(newContent);
    setHasChanges(newContent !== originalContent);
  };

  const handleSave = async () => {
    if (!filePath || !hasChanges) return;

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/files/${filePath}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
      });

      if (!response.ok) {
        throw new Error(`Failed to save file: ${response.statusText}`);
      }

      setOriginalContent(content);
      setHasChanges(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

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
      {hasChanges && (
        <div className="save-button-container">
          <button
            onClick={handleSave}
            disabled={saving}
            className="save-button"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      )}
      <Editor
        height="100%"
        language={getLanguage(filePath)}
        value={content}
        onChange={handleEditorChange}
        theme="vs-dark"
        options={{
          readOnly: false,
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
