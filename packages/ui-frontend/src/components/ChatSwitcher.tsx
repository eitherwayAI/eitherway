import { useState, useEffect } from 'react';

interface Session {
  id: string;
  title: string;
  updated_at: string;
  last_message_at?: string;
}

interface ChatSwitcherProps {
  currentSessionId: string | null;
  onSessionChange: (sessionId: string) => void;
  onNewChat: () => void;
  onSaveCurrentWorkspace?: () => Promise<void>;
}

export default function ChatSwitcher({
  currentSessionId,
  onSessionChange,
  onNewChat,
  onSaveCurrentWorkspace
}: ChatSwitcherProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [newChatName, setNewChatName] = useState('');
  const [showNewChatDialog, setShowNewChatDialog] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    initUser();
  }, []);

  const initUser = async () => {
    try {
      // Use a fixed email for the default user
      const email = 'default@example.com';

      // Create a session to get/create the user
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          title: 'temp'
        })
      });

      const session = await response.json();

      // Delete the temp session
      await fetch(`/api/sessions/${session.id}`, { method: 'DELETE' });

      // Extract user_id from the session and store it
      setUserId(session.user_id);

      // Now load sessions
      loadSessions(session.user_id);
    } catch (error) {
      console.error('Failed to initialize user:', error);
    }
  };

  const loadSessions = async (uid?: string) => {
    const userIdToUse = uid || userId;
    if (!userIdToUse) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/sessions?userId=${userIdToUse}&limit=50`);
      const data = await response.json();
      setSessions(data.sessions || []);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSession = async () => {
    if (!newChatName.trim() || !userId) return;

    try {
      // Save current workspace before creating new session
      if (onSaveCurrentWorkspace && currentSessionId) {
        await onSaveCurrentWorkspace();
      }

      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'default@example.com',
          title: newChatName
        })
      });

      const newSession = await response.json();
      setSessions([newSession, ...sessions]);
      setNewChatName('');
      setShowNewChatDialog(false);

      // Switch to the new session (this will clear workspace and load empty one)
      onSessionChange(newSession.id);
    } catch (error) {
      console.error('Failed to create session:', error);
    }
  };

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!confirm('Delete this chat? This will remove all messages and files.')) {
      return;
    }

    try {
      await fetch(`/api/sessions/${sessionId}`, {
        method: 'DELETE'
      });

      setSessions(sessions.filter(s => s.id !== sessionId));

      // If we deleted the current session, switch to the first available one
      if (currentSessionId === sessionId) {
        const remaining = sessions.filter(s => s.id !== sessionId);
        if (remaining.length > 0) {
          onSessionChange(remaining[0].id);
        } else {
          onNewChat();
        }
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  };

  const currentSession = sessions.find(s => s.id === currentSessionId);

  return (
    <div className="chat-switcher">
      <button
        className="chat-switcher-trigger"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="chat-icon">💬</span>
        <span className="chat-title">
          {currentSession?.title || 'Select a chat'}
        </span>
        <span className="dropdown-icon">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div className="chat-switcher-dropdown">
          <div className="chat-switcher-header">
            <button
              className="new-chat-btn"
              onClick={() => setShowNewChatDialog(true)}
            >
              + New Chat
            </button>
          </div>

          {loading ? (
            <div className="loading-sessions">Loading...</div>
          ) : (
            <div className="sessions-list">
              {sessions.map(session => (
                <div
                  key={session.id}
                  className={`session-item ${session.id === currentSessionId ? 'active' : ''}`}
                  onClick={() => {
                    onSessionChange(session.id);
                    setIsOpen(false);
                  }}
                >
                  <div className="session-info">
                    <div className="session-title">{session.title}</div>
                    <div className="session-date">
                      {new Date(session.last_message_at || session.updated_at).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    className="delete-session-btn"
                    onClick={(e) => handleDeleteSession(session.id, e)}
                    title="Delete chat"
                  >
                    🗑️
                  </button>
                </div>
              ))}
              {sessions.length === 0 && (
                <div className="no-sessions">
                  No chats yet. Create one to get started!
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showNewChatDialog && (
        <div className="modal-overlay" onClick={() => setShowNewChatDialog(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Create New Chat</h3>
            <input
              type="text"
              className="new-chat-input"
              placeholder="Chat name..."
              value={newChatName}
              onChange={(e) => setNewChatName(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleCreateSession();
                }
              }}
              autoFocus
            />
            <div className="modal-actions">
              <button
                className="modal-btn cancel"
                onClick={() => {
                  setShowNewChatDialog(false);
                  setNewChatName('');
                }}
              >
                Cancel
              </button>
              <button
                className="modal-btn create"
                onClick={handleCreateSession}
                disabled={!newChatName.trim()}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
