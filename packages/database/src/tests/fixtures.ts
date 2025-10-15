import { DatabaseClient } from '../client.js';
import {
  UsersRepository,
  SessionsRepository,
  MessagesRepository,
  AppsRepository,
  FilesRepository,
  FileReferencesRepository,
  SessionMemoryRepository,
  WorkingSetRepository,
} from '../repositories/index.js';

export class TestFixtures {
  private usersRepo: UsersRepository;
  private sessionsRepo: SessionsRepository;
  private messagesRepo: MessagesRepository;
  private appsRepo: AppsRepository;
  private filesRepo: FilesRepository;
  private fileRefsRepo: FileReferencesRepository;
  private memoryRepo: SessionMemoryRepository;
  private workingSetRepo: WorkingSetRepository;

  constructor(private db: DatabaseClient) {
    this.usersRepo = new UsersRepository(db);
    this.sessionsRepo = new SessionsRepository(db);
    this.messagesRepo = new MessagesRepository(db);
    this.appsRepo = new AppsRepository(db);
    this.filesRepo = new FilesRepository(db);
    this.fileRefsRepo = new FileReferencesRepository(db);
    this.memoryRepo = new SessionMemoryRepository(db);
    this.workingSetRepo = new WorkingSetRepository(db);
  }

  async createRealisticSession(): Promise<{
    user: any;
    session: any;
    app: any;
    files: any[];
    messages: any[];
  }> {
    const user = await this.usersRepo.create(
      `test-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`,
      'Test User',
    );

    const app = await this.appsRepo.create(user.id, 'Todo App', 'private');

    const session = await this.sessionsRepo.create(user.id, 'Build a todo app with dark mode', app.id);

    const fileContents = [
      {
        path: 'src/App.tsx',
        content: `import React from 'react';
import { TodoList } from './components/TodoList';
import { ThemeProvider } from './context/ThemeContext';

export default function App() {
  return (
    <ThemeProvider>
      <div className="app">
        <h1>Todo App</h1>
        <TodoList />
      </div>
    </ThemeProvider>
  );
}`,
      },
      {
        path: 'src/components/TodoList.tsx',
        content: `import React, { useState } from 'react';
import { Todo } from '../types';

export function TodoList() {
  const [todos, setTodos] = useState<Todo[]>([]);

  return (
    <div className="todo-list">
      {todos.map(todo => (
        <div key={todo.id}>{todo.text}</div>
      ))}
    </div>
  );
}`,
      },
      {
        path: 'src/context/ThemeContext.tsx',
        content: `import React, { createContext, useState } from 'react';

export const ThemeContext = createContext<any>(null);

export function ThemeProvider({ children }: any) {
  const [theme, setTheme] = useState('light');

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}`,
      },
      {
        path: 'src/types.ts',
        content: `export interface Todo {
  id: string;
  text: string;
  completed: boolean;
}

export type Theme = 'light' | 'dark';`,
      },
      {
        path: 'package.json',
        content: JSON.stringify(
          {
            name: 'todo-app',
            version: '1.0.0',
            dependencies: {
              react: '^18.2.0',
              'react-dom': '^18.2.0',
            },
          },
          null,
          2,
        ),
      },
    ];

    const files = [];
    for (const fc of fileContents) {
      const file = await this.filesRepo.upsertFile(app.id, fc.path, fc.content, user.id, 'text/typescript');
      files.push(file);
    }

    await this.fileRefsRepo.create(app.id, files[0].id, 'import', { destFileId: files[1].id });
    await this.fileRefsRepo.create(app.id, files[0].id, 'import', { destFileId: files[2].id });
    await this.fileRefsRepo.create(app.id, files[1].id, 'import', { destFileId: files[3].id });

    const conversationMessages = [
      { role: 'user' as const, text: 'Build me a todo app with React' },
      { role: 'assistant' as const, text: "I'll create a todo app with React. Let me start with the basic structure." },
      { role: 'user' as const, text: 'Add dark mode support' },
      {
        role: 'assistant' as const,
        text: "I've added a ThemeContext for dark mode support. You can now toggle between light and dark themes.",
      },
      { role: 'user' as const, text: 'Make the todos persistent' },
      { role: 'assistant' as const, text: "I'll add localStorage persistence for the todos." },
    ];

    const messages = [];
    for (const msg of conversationMessages) {
      const message = await this.messagesRepo.create(
        session.id,
        msg.role,
        { text: msg.text },
        'claude-sonnet-4-5',
        Math.floor(msg.text.length / 4),
      );
      messages.push(message);
    }

    await this.memoryRepo.upsert(session.id, {
      rollingSummary:
        'User requested a todo app with React. Added dark mode via ThemeContext. Working on localStorage persistence.',
      facts: {
        framework: 'react',
        features: ['dark-mode', 'persistence'],
        typescript: true,
      },
      lastCompactedMessageId: messages[messages.length - 1].id.toString(),
    });

    await this.workingSetRepo.add(session.id, app.id, files[0].id, 'Main app component', 'agent');

    await this.workingSetRepo.add(session.id, app.id, files[2].id, 'Theme context for dark mode', 'user');

    await this.db.query(`REFRESH MATERIALIZED VIEW core.working_set_enriched`);

    await this.sessionsRepo.touchLastMessage(session.id);

    return { user, session, app, files, messages };
  }

  async cleanup(userId: string): Promise<void> {
    const apps = await this.db.query<{ id: string }>(`SELECT id FROM core.apps WHERE owner_id = $1`, [userId]);

    for (const app of apps.rows) {
      await this.appsRepo.delete(app.id);
    }

    await this.db.query(`DELETE FROM core.sessions WHERE user_id = $1`, [userId]);
    await this.usersRepo.delete(userId);
  }
}
