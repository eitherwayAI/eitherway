import { useState } from 'react';
import ChatPanel from './components/ChatPanel';
import FileTree from './components/FileTree';
import CodeViewer from './components/CodeViewer';
import PreviewPane from './components/PreviewPane';
import { useWebSocket } from './useWebSocket';

// Use backend server port (3001), not frontend dev server port
const WS_URL = `ws://${window.location.hostname}:3001/api/agent`;

export default function App() {
  const { connected, messages, files, sendMessage } = useWebSocket(WS_URL);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);


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
            <CodeViewer filePath={selectedFile} />
          </div>

          {/* Preview Pane */}
          <PreviewPane files={files} />
        </div>

        {/* Chat Panel */}
        <ChatPanel
          messages={messages}
          onSendMessage={sendMessage}
          disabled={!connected}
        />
      </div>
    </div>
  );
}
