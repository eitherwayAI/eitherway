import { DatabaseClient } from '../client.js';
import { FilesRepository } from '../repositories/files.js';
import { createTwoFilesPatch } from 'diff';

export interface FileDiff {
  path: string;
  oldContent: string;
  newContent: string;
  patch: string;
  linesAdded: number;
  linesRemoved: number;
}

export interface DiffContext {
  changedFiles: FileDiff[];
  impactedFiles: Array<{
    path: string;
    reason: string;
  }>;
  totalChanges: {
    filesChanged: number;
    linesAdded: number;
    linesRemoved: number;
  };
}

export class DiffBuilder {
  private filesRepo: FilesRepository;

  constructor(private db: DatabaseClient) {
    this.filesRepo = new FilesRepository(db);
  }

  async buildDiff(
    _appId: string,
    fileId: string,
    newContent: string
  ): Promise<FileDiff> {
    const file = await this.filesRepo.findById(fileId);
    if (!file) {
      throw new Error(`File ${fileId} not found`);
    }

    const currentVersion = await this.filesRepo.getHeadVersion(fileId);
    const oldContent = currentVersion?.content_text || '';

    const patch = createTwoFilesPatch(
      file.path,
      file.path,
      oldContent,
      newContent,
      'current',
      'proposed'
    );

    const lines = patch.split('\n');
    const linesAdded = lines.filter(l => l.startsWith('+')).length;
    const linesRemoved = lines.filter(l => l.startsWith('-')).length;

    return {
      path: file.path,
      oldContent,
      newContent,
      patch,
      linesAdded,
      linesRemoved
    };
  }

  async buildMultiFileDiff(
    appId: string,
    changes: Array<{ fileId: string; newContent: string }>
  ): Promise<DiffContext> {
    const changedFiles: FileDiff[] = [];

    for (const change of changes) {
      const diff = await this.buildDiff(appId, change.fileId, change.newContent);
      changedFiles.push(diff);
    }

    const impactedFileIds = await this.getImpactedFiles(
      appId,
      changes.map(c => c.fileId)
    );

    const impactedFiles = await Promise.all(
      impactedFileIds.map(async (id) => {
        const file = await this.filesRepo.findById(id);
        return {
          path: file?.path || 'unknown',
          reason: 'Referenced by changed file'
        };
      })
    );

    const totalChanges = {
      filesChanged: changedFiles.length,
      linesAdded: changedFiles.reduce((sum, f) => sum + f.linesAdded, 0),
      linesRemoved: changedFiles.reduce((sum, f) => sum + f.linesRemoved, 0)
    };

    return {
      changedFiles,
      impactedFiles,
      totalChanges
    };
  }

  formatDiffForPrompt(diffContext: DiffContext, maxLines = 500): string {
    const sections: string[] = [];

    sections.push('# Proposed Changes\n');

    if (diffContext.changedFiles.length > 0) {
      sections.push(`Files changed: ${diffContext.totalChanges.filesChanged}`);
      sections.push(`Lines added: +${diffContext.totalChanges.linesAdded}`);
      sections.push(`Lines removed: -${diffContext.totalChanges.linesRemoved}\n`);

      let totalLines = 0;
      for (const file of diffContext.changedFiles) {
        if (totalLines >= maxLines) {
          sections.push('... (diff truncated due to size)');
          break;
        }

        sections.push(`## ${file.path}`);
        sections.push('```diff');

        const patchLines = file.patch.split('\n').slice(4);
        const displayLines = patchLines.slice(0, Math.min(patchLines.length, maxLines - totalLines));

        sections.push(displayLines.join('\n'));
        sections.push('```\n');

        totalLines += displayLines.length;
      }
    }

    if (diffContext.impactedFiles.length > 0) {
      sections.push('## Potentially Impacted Files\n');
      diffContext.impactedFiles.slice(0, 10).forEach(f => {
        sections.push(`- ${f.path} (${f.reason})`);
      });

      if (diffContext.impactedFiles.length > 10) {
        sections.push(`... and ${diffContext.impactedFiles.length - 10} more`);
      }
    }

    return sections.join('\n');
  }

  private async getImpactedFiles(appId: string, sourceFileIds: string[]): Promise<string[]> {
    if (sourceFileIds.length === 0) return [];

    const result = await this.db.query<{ dest_file_id: string }>(
      `WITH RECURSIVE impact AS (
        SELECT f.dest_file_id
        FROM core.file_references f
        WHERE f.app_id = $1 AND f.src_file_id = ANY($2::uuid[])

        UNION

        SELECT f.dest_file_id
        FROM impact i
        JOIN core.file_references f ON f.app_id = $1 AND f.src_file_id = i.dest_file_id
        WHERE (SELECT COUNT(*) FROM impact) < 100
      )
      SELECT DISTINCT dest_file_id FROM impact`,
      [appId, sourceFileIds]
    );

    return result.rows.map(r => r.dest_file_id);
  }
}
