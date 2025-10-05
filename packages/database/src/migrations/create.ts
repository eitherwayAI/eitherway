#!/usr/bin/env node
import { writeFile, readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function createMigration(name: string): Promise<void> {
  const migrationsDir = __dirname;
  const files = await readdir(migrationsDir);

  const sqlFiles = files.filter(f => f.endsWith('.sql'));
  const maxId = sqlFiles.reduce((max, file) => {
    const match = file.match(/^(\d+)_/);
    if (match) {
      const id = parseInt(match[1], 10);
      return Math.max(max, id);
    }
    return max;
  }, 0);

  const nextId = maxId + 1;
  const paddedId = String(nextId).padStart(3, '0');
  const filename = `${paddedId}_${name}.sql`;
  const filepath = join(migrationsDir, filename);

  const template = `-- Migration ${paddedId}: ${name}

-- Add your SQL here

`;

  await writeFile(filepath, template);

  console.log(`Created migration: ${filename}`);
}

const migrationName = process.argv[2];

if (!migrationName) {
  console.error('Usage: npm run migrate:create <migration-name>');
  process.exit(1);
}

createMigration(migrationName);
