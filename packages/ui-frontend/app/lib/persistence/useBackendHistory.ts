import { useLoaderData, useNavigate } from '@remix-run/react';
import { useState, useEffect } from 'react';
import type { Message } from 'ai';
import { toast } from 'react-toastify';
import { createScopedLogger } from '~/utils/logger';
import { BACKEND_URL } from '~/config/api';

const logger = createScopedLogger('BackendHistory');

export interface BackendMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  model?: string;
  token_count?: number;
  metadata?: any;
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

        logger.info(
          `Loaded ${messages.length} messages and ${filesData.files?.length || 0} files from backend session:`,
          session.title,
        );

        // Transform backend messages to AI SDK format
        // Filter out system messages to keep UI clean
        const transformedMessages: Message[] = messages
          .filter((msg: BackendMessage) => msg.role !== 'system')
          .map((msg: BackendMessage) => ({
            id: msg.id,
            role: msg.role,
            content: msg.content,
            metadata: msg.metadata, // Preserve metadata for historical message reconstruction
            createdAt: new Date(msg.created_at),
          }));

        setInitialMessages(transformedMessages);
        setFiles(filesData.files || []);
        setSessionTitle(session.title || 'Untitled Chat');

        console.log('📂 [Backend History] Loaded session:', sessionId);
        console.log('   Messages:', transformedMessages.length);
        console.log('   Files:', filesData.files?.length || 0);

        // Debug: Log metadata presence
        const messagesWithMetadata = transformedMessages.filter((m) => m.metadata);
        console.log('   Messages with metadata:', messagesWithMetadata.length);
        if (messagesWithMetadata.length > 0) {
          console.log('   First metadata sample:', messagesWithMetadata[0].metadata);
        }

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
    // Removed noisy debug log - this fires on every message change
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
