# VFS Migration Guide

## Quick Start

The system now uses a DB-backed Virtual File System by default. Here's what you need to know:

## Environment Setup

### Database Required

```bash
# Ensure PostgreSQL is configured
export DATABASE_URL="postgresql://user:pass@localhost:5432/eitherway"

# Run migrations
cd packages/database
npm run migrate
```

### Feature Flag (Optional)

```bash
# To use legacy local filesystem (not recommended):
export USE_LOCAL_FS=true

# Default (DB-backed VFS):
export USE_LOCAL_FS=false  # or omit entirely
```

## What Changed

### Backend

**Before:**
```typescript
// Files saved to local disk
await writeFile(join(WORKSPACE_DIR, path), content);

// Files read from local disk
const content = await readFile(join(WORKSPACE_DIR, path));

// Switch workspace by dumping/loading local FS
await saveWorkspaceToDatabase(appId);
await loadWorkspaceFromDatabase(appId);
window.location.reload();
```

**After:**
```typescript
// Files saved to PostgreSQL
await fileStore.write(appId, path, content);

// Files read from PostgreSQL
const { content } = await fileStore.read(appId, path);

// Switch session by updating state (no reload)
setCurrentSessionId(newSessionId);
// Files auto-reload via WebSocket
```

### Frontend

**Before:**
```typescript
// Fetch from local FS
const res = await fetch('/api/files');
const { files } = await res.json();

// Read individual file
const res = await fetch(`/api/files/${path}`);
const { content } = await res.json();

// Session switch forces reload
await fetch(`/api/sessions/${id}/switch-workspace`, { method: 'POST' });
window.location.reload();
```

**After:**
```typescript
// Fetch from DB by session
const res = await fetch(`/api/sessions/${sessionId}/files/tree`);
const { files } = await res.json();

// Read individual file
const res = await fetch(`/api/sessions/${sessionId}/files/read?path=${encodeURIComponent(path)}`);
const { content } = await res.json();

// Session switch updates state (no reload)
setCurrentSessionId(newSessionId);
```

## API Changes

### Deprecated Endpoints

These endpoints are **deprecated** when `USE_LOCAL_FS=false`:

- `GET /api/files`
- `GET /api/files/*`
- `POST /api/files/*`
- `POST /api/sessions/:id/switch-workspace`

They return 410 Gone with migration hints.

### New Endpoints

Use these session-centric endpoints instead:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/sessions/:id/files/tree` | List all files for a session |
| GET | `/api/sessions/:id/files/read?path=...` | Read file content |
| POST | `/api/sessions/:id/files/write` | Write/update file |
| POST | `/api/sessions/:id/files/rename` | Rename file |
| DELETE | `/api/sessions/:id/files?path=...` | Delete file |
| GET | `/api/sessions/:id/files/versions?path=...` | Get version history |

## WebSocket Changes

**Before:**
```typescript
const ws = new WebSocket('ws://localhost:3001/api/agent');
```

**After:**
```typescript
const ws = new WebSocket(`ws://localhost:3001/api/agent?sessionId=${sessionId}`);
```

The WebSocket is now **session-scoped**. File updates are only broadcast to the corresponding session.

## Component Changes

### PreviewPane

**Before:**
```tsx
<PreviewPane files={files} />
```

**After:**
```tsx
<PreviewPane files={files} sessionId={currentSessionId} />
```

The `sessionId` prop is required for fetching file content from the DB.

### useWebSocket

**Before:**
```tsx
const { files, ... } = useWebSocket(wsUrl, null);

useEffect(() => {
  fetch('/api/files').then(r => r.json()).then(d => setFiles(d.files));
}, []);
```

**After:**
```tsx
const { files, ... } = useWebSocket(wsUrl, sessionId);

// Files auto-fetch when sessionId changes
```

## Data Migration

### One-Time Import

If you have existing projects in local `workspace/`:

```bash
# Script to import local files to DB
node scripts/import-workspace-to-db.js
```

Example script:
```javascript
import { createDatabaseClient, PostgresFileStore, SessionsRepository } from '@eitherway/database';
import { readdir, readFile, stat } from 'fs/promises';
import { join } from 'path';

const db = createDatabaseClient();
const fileStore = new PostgresFileStore(db);
const sessionsRepo = new SessionsRepository(db);

async function importWorkspace(sessionId, workspaceDir) {
  const session = await sessionsRepo.findById(sessionId);
  if (!session?.app_id) throw new Error('Session has no app_id');

  async function walk(dir, prefix = '') {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

      const fullPath = join(dir, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        await walk(fullPath, relativePath);
      } else {
        const content = await readFile(fullPath, 'utf-8');
        await fileStore.write(session.app_id, relativePath, content);
        console.log(`Imported: ${relativePath}`);
      }
    }
  }

  await walk(workspaceDir);
}

// Usage
await importWorkspace('session-id-here', './workspace');
```

## Testing

### Verify DB-Backed VFS

```bash
# 1. Start server
npm run server

# 2. Check health endpoint
curl http://localhost:3001/api/health
# Should show: "database": "connected"

# 3. Create a session
curl -X POST http://localhost:3001/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","title":"Test"}'
# Note the session.id

# 4. Write a file
curl -X POST http://localhost:3001/api/sessions/{SESSION_ID}/files/write \
  -H "Content-Type: application/json" \
  -d '{"path":"hello.txt","content":"Hello VFS!"}'

# 5. Read it back
curl "http://localhost:3001/api/sessions/{SESSION_ID}/files/read?path=hello.txt"
# Should return: {"path":"hello.txt","content":"Hello VFS!","version":1}

# 6. Verify NO local file created
ls workspace/
# Should be empty (or not exist)
```

### Verify Session Switching

1. Open UI: `http://localhost:5173`
2. Create session A, add files via chat
3. Create session B, add different files
4. Switch between A and B using chat switcher
5. **Verify**: No page reload, file tree updates instantly

### Verify CDN Proxy

1. Ask agent to create an HTML file with CDN resource:
   ```html
   <script src="https://cdn.jsdelivr.net/npm/vue@3"></script>
   ```
2. Open preview
3. Check browser console: Should load via `/api/proxy-cdn?url=...`
4. No CORS errors

## Rollback Plan

If you need to revert to local FS:

```bash
# 1. Set flag
export USE_LOCAL_FS=true

# 2. Restart server
npm run server

# 3. Export files from DB to local FS (if needed)
# Use the loadWorkspaceFromDatabase() function
```

## Performance Tips

### Query Optimization

If listing files is slow for large apps:

```sql
-- Add limit
GET /api/sessions/:id/files/tree?limit=500

-- Use path prefix filter (future)
GET /api/sessions/:id/files/tree?prefix=src/
```

### Caching

Consider adding Redis cache for hot paths:

```typescript
// Pseudo-code
async read(appId: string, path: string) {
  const cacheKey = `files:${appId}:${path}`;
  let content = await redis.get(cacheKey);

  if (!content) {
    content = await this.filesRepo.getHeadVersion(...);
    await redis.set(cacheKey, content, 'EX', 300); // 5 min TTL
  }

  return content;
}
```

### Indexing

The migration `004_vfs_optimizations.sql` adds necessary indexes. Run it:

```bash
cd packages/database
psql $DATABASE_URL -f src/migrations/004_vfs_optimizations.sql
```

## Common Issues

### "Session not found" errors

- Ensure session exists: `SELECT * FROM core.sessions WHERE id = 'xxx';`
- Verify `app_id` is set: Sessions without `app_id` have no files

### WebSocket not reconnecting

- Check `sessionId` query param is included
- Verify frontend passes `sessionId` to `useWebSocket(url, sessionId)`

### Files not appearing in preview

- Confirm files saved to DB: `SELECT * FROM core.files WHERE app_id = 'xxx';`
- Check `file_versions` table has content: `SELECT * FROM core.file_versions WHERE file_id = 'xxx';`
- Ensure `head_version_id` points to latest version

### CDN proxy blocked

- Add missing host to allowlist in `server.ts` line ~84
- Restart server after changes
- Alternatively, use `USE_LOCAL_FS=true` temporarily (no proxy needed)

## Support

For issues or questions:
- Architecture docs: `docs/VFS_ARCHITECTURE.md`
- GitHub issues: Create issue with `vfs` label
- Logs: Check `packages/ui-server` output for errors
