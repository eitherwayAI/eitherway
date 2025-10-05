import { DatabaseClient } from '../client.js';
import {
  SessionsRepository,
  MessagesRepository,
  SessionMemoryRepository,
  WorkingSetRepository,
  EventsRepository,
  AppsRepository
} from '../repositories/index.js';

export interface MemoryPrelude {
  sessionTitle: string;
  appName: string | null;
  workingDirectory: string | null;
  pinnedFiles: Array<{
    path: string;
    reason: string | null;
  }>;
  recentDecisions: Array<{
    kind: string;
    summary: string;
    timestamp: Date;
  }>;
  rollingSummary: string | null;
  keyFacts: Record<string, any>;
  constraints: string[];
}

export class MemoryPreludeService {
  private sessionsRepo: SessionsRepository;
  private memoryRepo: SessionMemoryRepository;
  private workingSetRepo: WorkingSetRepository;
  private eventsRepo: EventsRepository;
  private appsRepo: AppsRepository;

  constructor(db: DatabaseClient) {
    this.sessionsRepo = new SessionsRepository(db);
    new MessagesRepository(db);
    this.memoryRepo = new SessionMemoryRepository(db);
    this.workingSetRepo = new WorkingSetRepository(db);
    this.eventsRepo = new EventsRepository(db);
    this.appsRepo = new AppsRepository(db);
  }

  async buildPrelude(sessionId: string): Promise<MemoryPrelude> {
    const session = await this.sessionsRepo.findById(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const app = session.app_id ? await this.appsRepo.findById(session.app_id) : null;
    const memory = await this.memoryRepo.findBySession(sessionId);
    const workingSet = await this.workingSetRepo.findBySessionWithFiles(sessionId);

    const recentEvents = await this.eventsRepo.findBySession(sessionId, 20);
    const decisionEvents = recentEvents.filter(e =>
      e.kind && ['file.upserted', 'session.created', 'image.job.created'].includes(e.kind)
    );

    const recentDecisions = decisionEvents.map(e => ({
      kind: e.kind || 'unknown',
      summary: this.summarizeEvent(e),
      timestamp: e.created_at
    }));

    const pinnedFiles = workingSet.map(ws => ({
      path: ws.file_path,
      reason: ws.reason
    }));

    const keyFacts = memory?.facts || {};
    const constraints = this.deriveConstraints(app?.name, keyFacts);

    return {
      sessionTitle: session.title,
      appName: app?.name ?? null,
      workingDirectory: app ? `/app/${app.name}` : null,
      pinnedFiles,
      recentDecisions,
      rollingSummary: memory?.rolling_summary ?? null,
      keyFacts,
      constraints
    };
  }

  formatAsSystemMessage(prelude: MemoryPrelude): string {
    const sections: string[] = [];

    sections.push(`Session: ${prelude.sessionTitle}`);

    if (prelude.appName) {
      sections.push(`App: ${prelude.appName}`);
    }

    if (prelude.workingDirectory) {
      sections.push(`Working Directory: ${prelude.workingDirectory}`);
    }

    if (prelude.rollingSummary) {
      sections.push(`\nContext: ${prelude.rollingSummary}`);
    }

    if (Object.keys(prelude.keyFacts).length > 0) {
      sections.push('\nKey Facts:');
      Object.entries(prelude.keyFacts).forEach(([key, value]) => {
        sections.push(`  - ${key}: ${JSON.stringify(value)}`);
      });
    }

    if (prelude.pinnedFiles.length > 0) {
      sections.push('\nPinned Files:');
      prelude.pinnedFiles.forEach(f => {
        sections.push(`  - ${f.path}${f.reason ? ` (${f.reason})` : ''}`);
      });
    }

    if (prelude.recentDecisions.length > 0) {
      sections.push('\nRecent Actions:');
      prelude.recentDecisions.slice(0, 5).forEach(d => {
        sections.push(`  - ${d.summary}`);
      });
    }

    if (prelude.constraints.length > 0) {
      sections.push('\nConstraints:');
      prelude.constraints.forEach(c => {
        sections.push(`  - ${c}`);
      });
    }

    return sections.join('\n');
  }

  private summarizeEvent(event: any): string {
    const payload = event.payload || {};

    switch (event.kind) {
      case 'file.upserted':
        return `Updated ${payload.path || 'file'}`;
      case 'image.job.created':
        return `Generated image: ${(payload.prompt || '').substring(0, 50)}...`;
      case 'session.created':
        return `Started session: ${payload.title || 'untitled'}`;
      default:
        return event.kind || 'unknown action';
    }
  }

  private deriveConstraints(_appName: string | null | undefined, facts: Record<string, any>): string[] {
    const constraints: string[] = [
      'Tests must pass before completion',
      'Follow existing code style and patterns',
      'Preserve backward compatibility where possible'
    ];

    if (facts.framework === 'react') {
      constraints.push('Use React hooks, avoid class components');
    }

    if (facts.typescript) {
      constraints.push('Maintain type safety, no any types without justification');
    }

    if (facts.linter) {
      constraints.push('Code must pass linter checks');
    }

    return constraints;
  }
}
