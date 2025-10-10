#!/usr/bin/env tsx
/**
 * Verification script for file persistence
 * Tests that files are properly saved to database
 */

import { createDatabaseClient, SessionsRepository, PostgresFileStore } from '@eitherway/database';

async function verifyFilePersistence() {
  console.log('🔍 Verifying File Persistence...\n');

  const db = createDatabaseClient();
  const connected = await db.healthCheck();

  if (!connected) {
    console.error('❌ Database not connected');
    process.exit(1);
  }

  console.log('✅ Database connected\n');

  const sessionsRepo = new SessionsRepository(db);
  const fileStore = new PostgresFileStore(db);

  // Get all sessions
  const sessions = await db.query('SELECT id, title, app_id, created_at FROM sessions ORDER BY created_at DESC LIMIT 10');

  console.log(`📊 Found ${sessions.rows.length} recent sessions:\n`);

  for (const session of sessions.rows) {
    console.log(`Session: ${session.title || 'Untitled'} (${session.id})`);
    console.log(`  App ID: ${session.app_id || 'NONE ⚠️'}`);
    console.log(`  Created: ${session.created_at}`);

    if (session.app_id) {
      try {
        const files = await fileStore.list(session.app_id, 100);
        console.log(`  Files: ${files.length} file(s)`);

        if (files.length > 0) {
          files.forEach(f => {
            console.log(`    📄 ${f.path}`);
          });
        }
      } catch (error: any) {
        console.log(`  ❌ Error loading files: ${error.message}`);
      }
    } else {
      console.log(`  ⚠️  No app_id - files would not persist!`);
    }
    console.log('');
  }

  // Check for sessions without app_id
  const sessionsWithoutAppId = await db.query(
    'SELECT COUNT(*) as count FROM sessions WHERE app_id IS NULL'
  );

  const count = parseInt(sessionsWithoutAppId.rows[0].count);

  if (count > 0) {
    console.log(`⚠️  WARNING: ${count} sessions have NO app_id`);
    console.log('   Files created in these sessions will NOT persist!\n');
  } else {
    console.log('✅ All sessions have app_id - file persistence working!\n');
  }

  await db.end();
}

verifyFilePersistence().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
