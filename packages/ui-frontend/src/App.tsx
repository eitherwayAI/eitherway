import { useState, useCallback } from 'react';
import ChatPanel from './components/ChatPanel';
import ChatSwitcher from './components/ChatSwitcher';
import FileTree from './components/FileTree';
import CodeViewer from './components/CodeViewer';
import PreviewPane from './components/PreviewPane';
import { useWebSocket } from './useWebSocket';

// Use backend server port (3001), not frontend dev server port
const WS_URL = `ws://${window.location.hostname}:3001/api/agent`;

export default function App() {
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const { connected, messages, files, sendMessage, clearMessages } = useWebSocket(WS_URL, currentSessionId);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const handleSessionChange = useCallback(async (sessionId: string) => {
    try {
      setCurrentSessionId(sessionId);

      const sessionResponse = await fetch(`/api/sessions/${sessionId}`);
      const sessionData = await sessionResponse.json();

      clearMessages(sessionData.messages || []);
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


  return (
    <div className="app">
      {/* Sidebar with File Tree */}
      <div className="sidebar">
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

      {/* Main Content Area */}
      <div className="main-content">
        <div className="editor-container">
          {/* Code Viewer */}
          <div className="code-panel">
            <div className="code-header">
              <span>📝</span>
              <span>{selectedFile || 'No file selected'}</span>
            </div>
            <CodeViewer filePath={selectedFile} sessionId={currentSessionId} />
          </div>

          <PreviewPane files={files} sessionId={currentSessionId} />
        </div>

        {/* Chat Panel */}
        <div className="chat-panel">
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
      </div>
    </div>
  );
}
