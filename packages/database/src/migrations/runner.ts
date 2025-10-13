#!/usr/bin/env node
import { DatabaseClient, createDatabaseClient } from '../client.js';
import { readFile, readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface Migration {
  id: number;
  name: string;
  filename: string;
  sql: string;
}

async function ensureMigrationsTable(db: DatabaseClient): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function getAppliedMigrations(db: DatabaseClient): Promise<Set<string>> {
  const result = await db.query<{ name: string }>('SELECT name FROM migrations ORDER BY id');
  return new Set(result.rows.map((r) => r.name));
}

async function loadMigrations(): Promise<Migration[]> {
  const migrationsDir = __dirname;
  const files = await readdir(migrationsDir);

  const sqlFiles = files.filter((f) => f.endsWith('.sql')).sort();

  const migrations: Migration[] = [];

  for (const filename of sqlFiles) {
    const match = filename.match(/^(\d+)_(.+)\.sql$/);
    if (!match) continue;

    const id = parseInt(match[1], 10);
    const name = match[2];
    const filepath = join(migrationsDir, filename);
    const sql = await readFile(filepath, 'utf-8');

    migrations.push({ id, name, filename, sql });
  }

  return migrations.sort((a, b) => a.id - b.id);
}

async function applyMigration(db: DatabaseClient, migration: Migration): Promise<void> {
  console.log(`Applying migration ${migration.id}: ${migration.name}`);

  await db.transaction(async (client) => {
    await client.query(migration.sql);

    await client.query('INSERT INTO migrations (name) VALUES ($1)', [migration.name]);
  });

  console.log(`✓ Migration ${migration.id} applied successfully`);
}

async function runMigrations(): Promise<void> {
  const db = createDatabaseClient();

  try {
    console.log('Connecting to database...');
    const healthy = await db.healthCheck();
    if (!healthy) {
      throw new Error('Database health check failed');
    }
    console.log('✓ Connected to database\n');

    await ensureMigrationsTable(db);

    const applied = await getAppliedMigrations(db);
    const migrations = await loadMigrations();

    const pending = migrations.filter((m) => !applied.has(m.name));

    if (pending.length === 0) {
      console.log('No pending migrations');
      return;
    }

    console.log(`Found ${pending.length} pending migration(s)\n`);

    for (const migration of pending) {
      await applyMigration(db, migration);
    }

    console.log(`\n✓ All migrations completed successfully`);
  } catch (error: any) {
    console.error('\n✗ Migration failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await db.close();
  }
}

runMigrations();
