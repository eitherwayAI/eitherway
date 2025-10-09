import { useLoaderData, useNavigate } from '@remix-run/react';
import { useState, useEffect } from 'react';
import { atom } from 'nanostores';
import type { Message } from 'ai';
import { toast } from 'react-toastify';
import { workbenchStore } from '~/lib/stores/workbench';
import { getMessages, getNextId, getUrlId, openDatabase, setMessages } from './db';

export interface ChatHistoryItem {
  id: string;
  urlId?: string;
  description?: string;
  messages: Message[];
  timestamp: string;
}

const persistenceEnabled = !import.meta.env.VITE_DISABLE_PERSISTENCE;

let dbInstance: IDBDatabase | undefined;
const dbPromise = persistenceEnabled ? openDatabase().then(db => {
  dbInstance = db;
  return db;
}) : Promise.resolve(undefined);

// Export for backward compatibility - will be undefined until promise resolves
export const db = dbInstance;
export const getDb = async () => {
  await dbPromise;
  return dbInstance;
};

export const chatId = atom<string | undefined>(undefined);
export const description = atom<string | undefined>(undefined);

export function useChatHistory() {
  const navigate = useNavigate();
  const { id: mixedId } = useLoaderData<{ id?: string }>();

  const [initialMessages, setInitialMessages] = useState<Message[]>([]);
  const [ready, setReady] = useState<boolean>(false);
  const [urlId, setUrlId] = useState<string | undefined>();

  useEffect(() => {
    dbPromise.then((db) => {
      if (!db) {
        setReady(true);

        if (persistenceEnabled) {
          // More helpful error message with actionable steps
          toast.info(
            'Chat history disabled. To enable:\n' +
            '• Exit private/incognito mode\n' +
            '• Allow site storage in browser settings\n' +
            '• Clear browser data if storage is full',
            {
              autoClose: 8000,
              closeOnClick: true,
            }
          );
        }

        return;
      }

      if (mixedId) {
        getMessages(db, mixedId)
          .then((storedMessages) => {
            if (storedMessages && storedMessages.messages.length > 0) {
              setInitialMessages(storedMessages.messages);
              setUrlId(storedMessages.urlId);
              description.set(storedMessages.description);
              chatId.set(storedMessages.id);
            } else {
              navigate(`/chat`, { replace: true });
            }

            setReady(true);
          })
          .catch((error) => {
            toast.error(error.message);
          });
      } else {
        setReady(true);
      }
    });
  }, []);

  return {
    ready: !mixedId || ready,
    initialMessages,
    storeMessageHistory: async (messages: Message[]) => {
      if (!dbInstance || messages.length === 0) {
        return;
      }

      const { firstArtifact } = workbenchStore;

      if (!urlId && firstArtifact?.id) {
        const urlId = await getUrlId(dbInstance, firstArtifact.id);

        navigateChat(urlId);
        setUrlId(urlId);
      }

      if (!description.get() && firstArtifact?.title) {
        description.set(firstArtifact?.title);
      }

      if (initialMessages.length === 0 && !chatId.get()) {
        const nextId = await getNextId(dbInstance);

        chatId.set(nextId);

        if (!urlId) {
          navigateChat(nextId);
        }
      }

      await setMessages(dbInstance, chatId.get() as string, messages, urlId, description.get());
    },
  };
}

function navigateChat(nextId: string) {
  /**
   * FIXME: Using the intended navigate function causes a rerender for <Chat /> that breaks the app.
   *
   * `navigate(`/chat/${nextId}`, { replace: true });`
   */
  const url = new URL(window.location.href);
  url.pathname = `/chat/${nextId}`;

  window.history.replaceState({}, '', url);
}
