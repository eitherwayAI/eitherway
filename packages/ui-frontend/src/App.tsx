import { useState, useCallback } from 'react';
import ChatPanel from './components/ChatPanel';
import ChatSwitcher from './components/ChatSwitcher';
import FileTree from './components/FileTree';
import CodeViewer from './components/CodeViewer';
import PreviewPane from './components/PreviewPane';
import ViewToolbar from './components/ViewToolbar';
import { useWebSocket } from './useWebSocket';

// Use backend server port (3001), not frontend dev server port
const WS_URL = `ws://${window.location.hostname}:3001/api/agent`;

type ViewMode = 'code' | 'preview';
type DeviceMode = 'desktop' | 'mobile';

export default function App() {
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const { connected, messages, files, sendMessage, clearMessages } = useWebSocket(WS_URL, currentSessionId);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<ViewMode>('code');
  const [deviceMode, setDeviceMode] = useState<DeviceMode>('desktop');
  const [refreshKey, setRefreshKey] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string>('');

  const handleSessionChange = useCallback(async (sessionId: string) => {
    try {
      setCurrentSessionId(sessionId);

      const sessionResponse = await fetch(`/api/sessions/${sessionId}`);
      const sessionData = await sessionResponse.json();

      clearMessages(sessionData.messages || []);

      // Fetch the file tree for this session
      const filesResponse = await fetch(`/api/sessions/${sessionId}/files/tree`);
      const filesData = await filesResponse.json();

      if (filesData.files && filesData.files.length > 0) {
        // Find the main file (index.html or any .html file)
        const findMainFile = (nodes: any[]): string | null => {
          // First, look for index.html
          for (const node of nodes) {
            if (node.type === 'file' && node.name === 'index.html') {
              return node.path;
            }
            if (node.type === 'directory' && node.children) {
              const found = findMainFile(node.children);
              if (found) return found;
            }
          }

          // If no index.html, find any .html file
          for (const node of nodes) {
            if (node.type === 'file' && node.path.toLowerCase().endsWith('.html')) {
              return node.path;
            }
            if (node.type === 'directory' && node.children) {
              const found = findMainFile(node.children);
              if (found) return found;
            }
          }

          // If no HTML, look for package.json (React/Vue apps)
          for (const node of nodes) {
            if (node.type === 'file' && node.name === 'package.json') {
              return node.path;
            }
          }

          return null;
        };

        const mainFile = findMainFile(filesData.files);

        if (mainFile) {
          console.log('[App] Auto-selected main file:', mainFile);
          setSelectedFile(mainFile);
        }

        // Auto-switch to preview view
        setCurrentView('preview');
      }
    } catch (error) {
      console.error('Failed to switch session:', error);
      alert('Failed to switch session. Please try again.');
    }
  }, [clearMessages]);

  const handleNewChat = useCallback(() => {
    setCurrentSessionId(null);
    clearMessages([]);
  }, [clearMessages]);

  const handleSaveCurrentWorkspace = useCallback(async () => {
    return Promise.resolve();
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  const handlePreviewUrlChange = useCallback((url: string) => {
    setPreviewUrl(url);
  }, []);

  // Determine preview status based on files, connection, and preview URL
  const previewStatus = previewUrl ? 'ready' : files.length > 0 && connected ? 'building' : 'stopped';

  return (
    <div className="app">
      {/* Left Column: Chat (always visible, full height) */}
      <div className="chat-column">
        <div className="chat-header">
          <ChatSwitcher
            currentSessionId={currentSessionId}
            onSessionChange={handleSessionChange}
            onNewChat={handleNewChat}
            onSaveCurrentWorkspace={handleSaveCurrentWorkspace}
          />
        </div>
        <ChatPanel
          messages={messages}
          onSendMessage={sendMessage}
          disabled={!connected}
        />
      </div>

      {/* Center Column: Toolbar + Code/Preview */}
      <div className="center-column">
        <ViewToolbar
          currentView={currentView}
          onViewChange={setCurrentView}
          deviceMode={deviceMode}
          onDeviceModeChange={setDeviceMode}
          previewStatus={previewStatus}
          previewUrl={previewUrl}
          onRefresh={handleRefresh}
        />

        <div className="view-container">
          {currentView === 'code' ? (
            <div className="code-view-layout">
              {/* Files Sidebar - Only visible in Code Editor mode */}
              <div className="files-sidebar">
                <div className="sidebar-header">
                  <span>📁 Files</span>
                  <span className={`status-badge ${connected ? 'connected' : 'disconnected'}`}>
                    {connected ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
                <FileTree
                  files={files}
                  onSelectFile={setSelectedFile}
                  selectedFile={selectedFile || undefined}
                />
              </div>

              <div className="code-panel">
                <div className="code-header">
                  <span>📝</span>
                  <span>{selectedFile || 'No file selected'}</span>
                </div>
                <CodeViewer filePath={selectedFile} sessionId={currentSessionId} />
              </div>
            </div>
          ) : (
            <PreviewPane
              key={refreshKey}
              files={files}
              sessionId={currentSessionId}
              onUrlChange={handlePreviewUrlChange}
            />
          )}
        </div>
      </div>
    </div>
  );
}
