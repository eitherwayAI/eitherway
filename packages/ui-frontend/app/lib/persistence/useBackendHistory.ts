import { useLoaderData, useNavigate } from '@remix-run/react';
import { useState, useEffect } from 'react';
import type { Message } from 'ai';
import { toast } from 'react-toastify';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('BackendHistory');
const BACKEND_URL = typeof window !== 'undefined' ? 'https://localhost:3001' : 'https://localhost:3001';

export interface BackendMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  model?: string;
  token_count?: number;
  created_at: string;
}

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  children?: FileNode[];
}

export function useBackendHistory() {
  const navigate = useNavigate();
  const { id: sessionId } = useLoaderData<{ id?: string }>();

  const [initialMessages, setInitialMessages] = useState<Message[]>([]);
  const [files, setFiles] = useState<FileNode[]>([]);
  const [ready, setReady] = useState<boolean>(false);
  const [sessionTitle, setSessionTitle] = useState<string>('');

  useEffect(() => {
    if (!sessionId) {
      // No session ID in URL - this is a new chat
      logger.debug('No session ID in URL, starting fresh chat');
      setReady(true);
      return;
    }

    logger.info('Loading session from backend:', sessionId);

    // Load session and files in parallel
    Promise.all([
      fetch(`${BACKEND_URL}/api/sessions/${sessionId}`),
      fetch(`${BACKEND_URL}/api/sessions/${sessionId}/files/tree`),
    ])
      .then(async ([sessionResponse, filesResponse]) => {
        if (!sessionResponse.ok) {
          if (sessionResponse.status === 404) {
            logger.warn('Session not found on backend, redirecting to new chat');
            toast.error('Session not found');
            navigate('/chat', { replace: true });
            return null;
          }
          throw new Error(`Failed to load session: ${sessionResponse.statusText}`);
        }

        const sessionData = await sessionResponse.json();
        const filesData = filesResponse.ok ? await filesResponse.json() : { files: [] };

        return { sessionData, filesData };
      })
      .then((result) => {
        if (!result) return;

        const { sessionData, filesData } = result;
        const { session, messages } = sessionData;

        logger.info(`Loaded ${messages.length} messages and ${filesData.files?.length || 0} files from backend session:`, session.title);

        // Transform backend messages to AI SDK format
        const transformedMessages: Message[] = messages.map((msg: BackendMessage) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          createdAt: new Date(msg.created_at),
        }));

        setInitialMessages(transformedMessages);
        setFiles(filesData.files || []);
        setSessionTitle(session.title || 'Untitled Chat');

        // Store session ID in localStorage for continuity
        localStorage.setItem('currentSessionId', sessionId);
        console.log('📂 [Backend History] Loaded session:', sessionId);
        console.log('   Messages:', transformedMessages.length);
        console.log('   Files:', filesData.files?.length || 0);

        setReady(true);
      })
      .catch((error) => {
        logger.error('Failed to load session from backend:', error);
        toast.error('Failed to load chat history');
        navigate('/chat', { replace: true });
        setReady(true);
      });
  }, [sessionId, navigate]);

  // Simplified storeMessageHistory - backend storage happens via WebSocket streaming
  const storeMessageHistory = async (messages: Message[]) => {
    // Messages are already being stored by the backend during streaming
    // This is kept for compatibility but is now a no-op
    logger.debug('storeMessageHistory called (no-op, backend handles persistence)');
  };

  return {
    ready: !sessionId || ready,
    initialMessages,
    files,
    sessionTitle,
    sessionId: sessionId || null,
    storeMessageHistory,
  };
}
