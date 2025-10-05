import { useState, useEffect, useCallback, useRef } from 'react';

interface Message {
  type: 'status' | 'response' | 'error' | 'files_updated';
  message?: string;
  content?: string;
  files?: any[];
}

export function useWebSocket(url: string, sessionId: string | null) {
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const ws = useRef<WebSocket | null>(null);

  const clearMessages = useCallback((newMessages: any[] = []) => {
    setMessages(newMessages);
  }, []);

  useEffect(() => {
    const fetchFiles = async () => {
      if (!sessionId) {
        setFiles([]);
        return;
      }

      try {
        const response = await fetch(`/api/sessions/${sessionId}/files/tree`);
        const data = await response.json();
        if (data.files) {
          setFiles(data.files);
        }
      } catch (error) {
        console.error('Failed to fetch initial files:', error);
      }
    };

    fetchFiles();
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) {
      setConnected(false);
      return;
    }

    let isCleanup = false;
    const wsUrl = sessionId ? `${url}?sessionId=${sessionId}` : url;
    const websocket = new WebSocket(wsUrl);

    websocket.onopen = () => {
      console.log('✅ WebSocket connected successfully for session:', sessionId);
      setConnected(true);
    };

    websocket.onmessage = (event) => {
      const data: Message = JSON.parse(event.data);

      switch (data.type) {
        case 'status':
          setMessages(prev => [...prev, {
            role: 'system',
            content: data.message
          }]);
          break;

        case 'response':
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: data.content
          }]);
          break;

        case 'error':
          setMessages(prev => [...prev, {
            role: 'system',
            content: `Error: ${data.message}`,
            error: true
          }]);
          break;

        case 'files_updated':
          if (data.files) {
            setFiles(data.files);
          }
          break;
      }
    };

    websocket.onclose = () => {
      if (!isCleanup) {
        console.log('⚠️ WebSocket disconnected unexpectedly');
        setConnected(false);
      } else {
        console.log('🔄 WebSocket closed for cleanup (React StrictMode)');
      }
    };

    websocket.onerror = (error) => {
      if (!isCleanup) {
        console.error('❌ WebSocket error:', error);
      }
    };

    ws.current = websocket;

    return () => {
      isCleanup = true;
      websocket.close();
    };
  }, [url, sessionId]);

  const sendMessage = useCallback((prompt: string) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      // Add user message to chat
      setMessages(prev => [...prev, {
        role: 'user',
        content: prompt
      }]);

      // Send to backend
      ws.current.send(JSON.stringify({
        type: 'prompt',
        prompt
      }));
    }
  }, []);

  return {
    connected,
    messages,
    files,
    sendMessage,
    clearMessages
  };
}
