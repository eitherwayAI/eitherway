/**
 * Error Fix Routes
 * Handles automatic error fixing for preview errors
 */
import { FastifyInstance } from 'fastify';
import { DatabaseClient, MessagesRepository } from '@eitherway/database';
import { createHash } from 'crypto';

// Track error fix attempts to prevent infinite loops
const errorAttempts = new Map<string, { count: number; lastAttempt: number }>();

/**
 * Clean up old error attempt records (older than 1 hour)
 */
function cleanupOldAttempts() {
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  for (const [hash, data] of errorAttempts.entries()) {
    if (data.lastAttempt < oneHourAgo) {
      errorAttempts.delete(hash);
    }
  }
}

// Clean up every hour
setInterval(cleanupOldAttempts, 60 * 60 * 1000);

/**
 * Create a hash for error deduplication
 */
function hashError(error: any): string {
  return createHash('sha256')
    .update(error.message + error.source + (error.file || ''))
    .digest('hex')
    .substring(0, 16);
}

/**
 * Get recent file changes for context
 */
async function getRecentFileChanges(
  db: DatabaseClient,
  sessionId: string,
  limit: number = 5
): Promise<Array<{ path: string; operation: string; created_at: Date }>> {
  const result = await db.query<{ path: string; operation: string; created_at: Date }>(
    `SELECT DISTINCT f.path, 'updated' as operation, fv.created_at
     FROM core.file_versions fv
     JOIN core.files f ON fv.file_id = f.id
     JOIN core.apps a ON f.app_id = a.id
     JOIN core.sessions s ON a.id = s.app_id
     WHERE s.id = $1
     ORDER BY fv.created_at DESC
     LIMIT $2`,
    [sessionId, limit]
  );
  return result.rows;
}

/**
 * Build a generic fix prompt from error data
 */
function buildFixPrompt(error: any, recentChanges: any[]): string {
  const fileContext = recentChanges.length > 0
    ? `\n\nRECENT FILE CHANGES:\n${recentChanges.map(f => `- ${f.path} (${f.operation})`).join('\n')}`
    : '';

  const fileInfo = error.file
    ? `\nFILE: ${error.file}:${error.line}:${error.column}`
    : '';

  const stackInfo = error.stack
    ? `\n\nSTACK TRACE:\n${error.stack}`
    : '';

  return `The preview encountered an error. Please fix it immediately.

ERROR:
${error.message}${fileInfo}${stackInfo}${fileContext}

Please identify and fix the issue. Common causes:
- Missing dependencies (run npm install)
- Wrong import paths
- Syntax errors
- Missing files
- Configuration issues
- Type errors

Fix now without asking the user.`;
}

/**
 * Register error fix routes
 */
export async function registerErrorFixRoutes(fastify: FastifyInstance, db: DatabaseClient) {
  const messagesRepo = new MessagesRepository(db);

  /**
   * POST /api/sessions/:id/fix-error
   * Automatically fix a preview error
   */
  fastify.post<{
    Params: { id: string };
    Body: { error: any };
  }>('/api/sessions/:id/fix-error', async (request, reply) => {
    const { id: sessionId } = request.params;
    const { error } = request.body;

    if (!error || !error.message) {
      return reply.code(400).send({
        error: 'Invalid error data',
        canRetry: false
      });
    }

    // Create error hash for deduplication
    const errorHash = hashError(error);
    const attempts = errorAttempts.get(errorHash) || { count: 0, lastAttempt: 0 };

    // Max 3 attempts per unique error
    if (attempts.count >= 3) {
      fastify.log.warn(`Max fix attempts (3) reached for error: ${errorHash}`);
      return reply.code(400).send({
        error: 'Maximum fix attempts reached for this error',
        canRetry: false,
        attempts: attempts.count
      });
    }

    // Update attempt counter
    errorAttempts.set(errorHash, {
      count: attempts.count + 1,
      lastAttempt: Date.now()
    });

    try {
      // Get recent file changes for context
      const recentChanges = await getRecentFileChanges(db, sessionId, 5);

      // Build generic fix prompt
      const prompt = buildFixPrompt(error, recentChanges);

      fastify.log.info(`Creating auto-fix message for session ${sessionId}, attempt ${attempts.count + 1}/3`);
      fastify.log.debug({ error, errorHash }, 'Error being fixed');

      // Insert message first
      const message = await messagesRepo.create(
        sessionId,
        'user',
        [{ text: prompt, type: 'text' }],
        undefined, // model
        undefined  // tokenCount
      );

      // Then update with metadata
      await messagesRepo.updateMetadata(message.id.toString(), {
        auto_fix: true,
        error_hash: errorHash,
        error_source: error.source,
        error_file: error.file || null,
        attempt_number: attempts.count + 1,
        timestamp: Date.now()
      });

      fastify.log.info(`Auto-fix message created: ${message.id}`);

      // The frontend WebSocket connection will pick up this new message
      // and trigger the agent to process it

      return {
        success: true,
        messageId: message.id,
        attemptNumber: attempts.count + 1,
        maxAttempts: 3
      };

    } catch (err) {
      fastify.log.error({ err }, 'Error creating auto-fix message');
      return reply.code(500).send({
        error: 'Failed to create fix request',
        canRetry: true
      });
    }
  });

  fastify.log.info('[Error Fixes] Routes registered successfully');
}
