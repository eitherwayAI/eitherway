import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import {
  createDatabaseClient,
  DatabaseClient
} from '../index.js';
import { TestFixtures } from './fixtures.js';
import { MemoryPreludeService } from '../services/memory-prelude.js';
import { ImpactedFilesAnalyzer } from '../services/impacted-analyzer.js';
import { PreparedQueries } from '../services/prepared-queries.js';
import { IntegrityChecker } from '../services/integrity-checker.js';

describe('Phase 3 Golden Tests', () => {
  let db: DatabaseClient;
  let fixtures: TestFixtures;

  beforeAll(async () => {
    db = createDatabaseClient();
    fixtures = new TestFixtures(db);

    const healthy = await db.healthCheck();
    expect(healthy).toBe(true);
  });

  afterAll(async () => {
    await db.close();
  });

  it('should resume a 2-week-old session seamlessly', async () => {
    const { user, session } = await fixtures.createRealisticSession();

    const preludeService = new MemoryPreludeService(db);
    const prelude = await preludeService.buildPrelude(session.id);

    expect(prelude.sessionTitle).toBe('Build a todo app with dark mode');
    expect(prelude.appName).toBe('Todo App');
    expect(prelude.rollingSummary).toContain('todo app');
    expect(prelude.rollingSummary).toContain('dark mode');
    expect(prelude.pinnedFiles).toHaveLength(2);
    expect(prelude.keyFacts.framework).toBe('react');
    expect(prelude.keyFacts.typescript).toBe(true);

    const formatted = preludeService.formatAsSystemMessage(prelude);
    expect(formatted).toContain('Session: Build a todo app with dark mode');
    expect(formatted).toContain('App: Todo App');
    expect(formatted).toContain('Pinned Files:');
    expect(formatted).toContain('Constraints:');

    const preparedQueries = new PreparedQueries(db);
    const sessionData = await preparedQueries.getSessionWithMemory(session.id);

    expect(sessionData).not.toBeNull();
    expect(sessionData?.session.id).toBe(session.id);
    expect(sessionData?.recentMessages.length).toBeGreaterThan(0);
    expect(sessionData?.memory).not.toBeNull();

    await fixtures.cleanup(user.id);
  });

  it('should detect impacted files when changing shared component', async () => {
    const { user, app, files } = await fixtures.createRealisticSession();

    const themeContextFile = files.find(f => f.path === 'src/context/ThemeContext.tsx');
    expect(themeContextFile).toBeDefined();

    const analyzer = new ImpactedFilesAnalyzer(db);
    const impact = await analyzer.analyzeImpact(app.id, themeContextFile!.id);

    expect(impact.sourceFile.path).toBe('src/context/ThemeContext.tsx');
    expect(impact.impactedFiles.length).toBeGreaterThan(0);

    const impactedPaths = impact.impactedFiles.map(f => f.path);
    expect(impactedPaths).toContain('src/App.tsx');

    const summary = await analyzer.getImpactSummary(app.id, themeContextFile!.id);
    expect(summary.directImpacts).toBeGreaterThan(0);
    expect(summary.totalImpacts).toBeGreaterThanOrEqual(summary.directImpacts);

    await fixtures.cleanup(user.id);
  });

  it('should verify file and image integrity', async () => {
    const { user, app, files } = await fixtures.createRealisticSession();

    const checker = new IntegrityChecker(db);
    const fileResults = await checker.verifyFileChecksums(app.id);

    expect(fileResults.length).toBe(files.length);
    const allValid = fileResults.every(r => r.matches);
    expect(allValid).toBe(true);

    await fixtures.cleanup(user.id);
  });

  it('should efficiently query working set and files', async () => {
    const { user, session, app } = await fixtures.createRealisticSession();

    const preparedQueries = new PreparedQueries(db);

    const startTime = Date.now();
    const workingSet = await preparedQueries.getWorkingSetWithFiles(session.id);
    const queryTime = Date.now() - startTime;

    expect(workingSet.length).toBe(2);
    expect(queryTime).toBeLessThan(100);

    workingSet.forEach(item => {
      expect(item.file_path).toBeDefined();
      expect(item.mime_type).toBeDefined();
    });

    const paths = ['src/App.tsx', 'src/types.ts', 'nonexistent.ts'];
    const fileMap = await preparedQueries.getFilesByPaths(app.id, paths);

    expect(fileMap.size).toBe(2);
    expect(fileMap.has('src/App.tsx')).toBe(true);
    expect(fileMap.has('src/types.ts')).toBe(true);
    expect(fileMap.has('nonexistent.ts')).toBe(false);

    await fixtures.cleanup(user.id);
  });

  it('should handle session context with performance', async () => {
    const { user, session } = await fixtures.createRealisticSession();

    const preparedQueries = new PreparedQueries(db);

    const startTime = Date.now();
    const sessionData = await preparedQueries.getSessionWithMemory(session.id);
    const queryTime = Date.now() - startTime;

    expect(sessionData).not.toBeNull();
    expect(queryTime).toBeLessThan(50);

    expect(sessionData?.session.title).toBe('Build a todo app with dark mode');
    expect(sessionData?.recentMessages.length).toBeGreaterThan(0);
    expect(sessionData?.memory.rolling_summary).toBeDefined();

    await fixtures.cleanup(user.id);
  });
});
