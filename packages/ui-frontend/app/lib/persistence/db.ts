import type { Message } from 'ai';
import { createScopedLogger } from '~/utils/logger';
import type { ChatHistoryItem } from './useChatHistory';

const logger = createScopedLogger('ChatHistory');

// this is used at the top level and never rejects
export async function openDatabase(): Promise<IDBDatabase | undefined> {
  return new Promise((resolve) => {
    try {
      if (!window.indexedDB) {
        logger.warn('IndexedDB not available in this browser');
        resolve(undefined);
        return;
      }

      // Try to open the database with better error handling
      const request = indexedDB.open('eitherwayHistory', 2);

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        try {
          const db = (event.target as IDBOpenDBRequest).result;

          if (db.objectStoreNames.contains('chats')) {
            try {
              db.deleteObjectStore('chats');
            } catch (e) {
              logger.warn('Could not delete old chats store:', e);
            }
          }

          const store = db.createObjectStore('chats', { keyPath: 'id' });
          store.createIndex('id', 'id', { unique: true });
          store.createIndex('urlId', 'urlId', { unique: false });

          logger.info('IndexedDB schema created/updated successfully');
        } catch (error) {
          logger.error('Error during database upgrade:', error);
        }
      };

      request.onsuccess = (event: Event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        logger.info('IndexedDB opened successfully');

        // Test if we can actually use the database
        try {
          const transaction = db.transaction('chats', 'readonly');
          transaction.oncomplete = () => {
            logger.info('IndexedDB test transaction successful');
          };
          transaction.onerror = () => {
            logger.warn('IndexedDB test transaction failed');
          };
        } catch (e) {
          logger.warn('Cannot create test transaction:', e);
        }

        resolve(db);
      };

      request.onerror = (event: Event) => {
        const error = (event.target as IDBOpenDBRequest).error;
        logger.error('Failed to open IndexedDB:', error?.message || 'Unknown error');

        // Common error explanations
        if (error?.name === 'InvalidStateError') {
          logger.info('IndexedDB may be blocked by privacy settings or incognito mode');
        } else if (error?.name === 'QuotaExceededError') {
          logger.info('Storage quota exceeded - clear browser data to fix');
        } else if (error?.name === 'UnknownError') {
          logger.info('IndexedDB blocked - check browser permissions');
        }

        resolve(undefined);
      };

      request.onblocked = () => {
        logger.warn('IndexedDB blocked - close other tabs or restart browser');
        resolve(undefined);
      };

    } catch (error) {
      logger.error('Exception opening database:', error);
      resolve(undefined);
    }
  });
}

export async function getAll(db: IDBDatabase): Promise<ChatHistoryItem[]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chats', 'readonly');
    const store = transaction.objectStore('chats');
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result as ChatHistoryItem[]);
    request.onerror = () => reject(request.error);
  });
}

export async function setMessages(
  db: IDBDatabase,
  id: string,
  messages: Message[],
  urlId?: string,
  description?: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chats', 'readwrite');
    const store = transaction.objectStore('chats');

    const request = store.put({
      id,
      messages,
      urlId,
      description,
      timestamp: new Date().toISOString(),
    });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getMessages(db: IDBDatabase, id: string): Promise<ChatHistoryItem> {
  const byId = await getMessagesById(db, id);
  if (byId) {
    return byId;
  }

  const byUrlId = await getMessagesByUrlId(db, id);
  if (byUrlId) {
    return byUrlId;
  }

  return byId || byUrlId;
}

export async function getMessagesByUrlId(db: IDBDatabase, id: string): Promise<ChatHistoryItem> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chats', 'readonly');
    const store = transaction.objectStore('chats');
    const index = store.index('urlId');
    const request = index.get(id);

    request.onsuccess = () => {
      const result = request.result as ChatHistoryItem;
      resolve(result);
    };
    request.onerror = () => {
      reject(request.error);
    };
  });
}

export async function getMessagesById(db: IDBDatabase, id: string): Promise<ChatHistoryItem> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chats', 'readonly');
    const store = transaction.objectStore('chats');
    const request = store.get(id);

    request.onsuccess = () => {
      const result = request.result as ChatHistoryItem;
      resolve(result);
    };
    request.onerror = () => {
      reject(request.error);
    };
  });
}

export async function deleteById(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chats', 'readwrite');
    const store = transaction.objectStore('chats');
    const request = store.delete(id);

    request.onsuccess = () => resolve(undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function getNextId(db: IDBDatabase): Promise<string> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chats', 'readonly');
    const store = transaction.objectStore('chats');
    const request = store.getAllKeys();

    request.onsuccess = () => {
      const highestId = request.result.reduce((cur, acc) => Math.max(+cur, +acc), 0);
      resolve(String(+highestId + 1));
    };

    request.onerror = () => reject(request.error);
  });
}

export async function getUrlId(db: IDBDatabase, id: string): Promise<string> {
  const idList = await getUrlIds(db);

  if (!idList.includes(id)) {
    return id;
  } else {
    let i = 2;

    while (idList.includes(`${id}-${i}`)) {
      i++;
    }

    return `${id}-${i}`;
  }
}

async function getUrlIds(db: IDBDatabase): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chats', 'readonly');
    const store = transaction.objectStore('chats');
    const idList: string[] = [];

    const request = store.openCursor();

    request.onsuccess = (event: Event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;

      if (cursor) {
        idList.push(cursor.value.urlId);
        cursor.continue();
      } else {
        resolve(idList);
      }
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}
