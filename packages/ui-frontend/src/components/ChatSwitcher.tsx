import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../AuthContext';

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
  const { userId: authUserId } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [newChatName, setNewChatName] = useState('');
  const [showNewChatDialog, setShowNewChatDialog] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    if (authUserId) {
      initUser();
    }
  }, [authUserId]);

  const initUser = async () => {
    try {
      // Use the authenticated user ID to get the email
      const email = authUserId || 'default@example.com';

      // Check if we have a cached DB user ID in localStorage
      const cachedDbUserId = localStorage.getItem(`db_user_id_${email}`);
      if (cachedDbUserId) {
        setUserId(cachedDbUserId);
        loadSessions(cachedDbUserId);
        return;
      }

      // Use the dedicated user lookup endpoint (doesn't count against rate limit)
      const response = await fetch(`/api/users?email=${encodeURIComponent(email)}`);

      if (!response.ok) {
        throw new Error('Failed to lookup user');
      }

      const user = await response.json();

      // Cache the DB user ID in localStorage
      localStorage.setItem(`db_user_id_${email}`, user.id);

      // Store and load sessions
      setUserId(user.id);
      loadSessions(user.id);
    } catch (error) {
      console.error('Failed to initialize user:', error);
      toast.error('Failed to initialize user. Please try again.');
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

      const email = authUserId || 'default@example.com';
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          title: newChatName
        })
      });

      const data = await response.json();

      // Check for rate limit error
      if (response.status === 429) {
        toast.error(data.message || 'Rate limit exceeded. Please try again later.');
        setShowNewChatDialog(false);
        return;
      }

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create session');
      }

      setSessions([data, ...sessions]);
      setNewChatName('');
      setShowNewChatDialog(false);

      // Switch to the new session (this will clear workspace and load empty one)
      onSessionChange(data.id);
    } catch (error) {
      console.error('Failed to create session:', error);
      toast.error('Failed to create chat. Please try again.');
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
