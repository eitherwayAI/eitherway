# Virtual File System (VFS) Architecture

## Overview

This document describes the DB-backed Virtual File System (VFS) architecture that replaces local filesystem persistence with PostgreSQL as the single source of truth.

## Architecture Goals

1. **Eliminate local workspace writes** - No dependency on local disk for file persistence
2. **Session-centric data model** - Chat messages and files share a common `sessionId`
3. **Real-time sync** - File viewer and LivePreview stay synchronized without page reloads
4. **Hardened networking** - CDN proxy and URL rewriting for external resources

## Core Components

### 1. Database Layer (`packages/database`)

#### FileStore Interface

```typescript
interface FileStore {
  list(appId: string, limit?: number): Promise<FileNode[]>;
  read(appId: string, path: string): Promise<FileContent>;
  write(appId: string, path: string, content: string | Buffer, mimeType?: string): Promise<void>;
  rename(appId: string, oldPath: string, newPath: string): Promise<void>;
  delete(appId: string, path: string): Promise<void>;
  getVersions(appId: string, path: string, limit?: number): Promise<any[]>;
}
```

#### PostgresFileStore Implementation

- Implements `FileStore` interface
- Uses `FilesRepository` for database operations
- Builds hierarchical file trees from flat database records
- Handles versioning automatically via `file_versions` table

### 2. Backend API (`packages/ui-server`)

#### Session-Centric File Routes

All file operations are scoped by `sessionId`:

```
GET    /api/sessions/:sessionId/files/tree
GET    /api/sessions/:sessionId/files/read?path=...
POST   /api/sessions/:sessionId/files/write
POST   /api/sessions/:sessionId/files/rename
DELETE /api/sessions/:sessionId/files?path=...
GET    /api/sessions/:sessionId/files/versions?path=...
```

#### Internal Mapping

- Frontend uses `sessionId` for all operations
- Backend resolves `sessionId → app_id` via `sessions` table
- `FilesRepository` queries by `app_id`

#### Feature Flag

Set `USE_LOCAL_FS=true` to enable deprecated local filesystem routes. Default is `false` (DB-backed VFS).

### 3. WebSocket (`/api/agent`)

#### Session-Scoped Connection

- WebSocket URL: `ws://host:3001/api/agent?sessionId=<id>`
- Each connection is bound to a specific session
- File updates broadcast only to the associated session

#### Events

```typescript
// Client → Server
{ type: 'prompt', prompt: string }

// Server → Client
{ type: 'status', message: string }
{ type: 'response', content: string }
{ type: 'files_updated', files: FileNode[], sessionId: string }
{ type: 'error', message: string }
```

### 4. Frontend (`packages/ui-frontend`)

#### Session State Management

- `currentSessionId` drives all data fetching
- Changing sessions triggers:
  1. Fetch new session messages
  2. Fetch new file tree from DB
  3. Reconnect WebSocket with new `sessionId`
  4. Preview remounts with new files
- **No page reload required**

#### File Fetching

- Initial load: `GET /api/sessions/:id/files/tree`
- Individual files: `GET /api/sessions/:id/files/read?path=...`
- WebContainer mounts files directly from DB responses

## Data Model

### Database Schema

```sql
-- Sessions tie chat and files together
CREATE TABLE core.sessions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES core.users(id),
  title TEXT,
  app_id UUID REFERENCES core.apps(id),  -- 1:1 with session
  ...
);

-- Files belong to an app
CREATE TABLE core.files (
  id UUID PRIMARY KEY,
  app_id UUID REFERENCES core.apps(id),
  path TEXT NOT NULL,
  is_binary BOOLEAN,
  mime_type TEXT,
  size_bytes INT,
  sha256 BYTEA,
  head_version_id UUID REFERENCES core.file_versions(id),
  UNIQUE (app_id, path)
);

-- File versions for history
CREATE TABLE core.file_versions (
  id UUID PRIMARY KEY,
  file_id UUID REFERENCES core.files(id),
  version INT NOT NULL,
  content_text TEXT,
  content_bytes BYTEA,
  created_by UUID,
  created_at TIMESTAMPTZ,
  UNIQUE (file_id, version)
);

-- Session-centric view
CREATE VIEW core.session_files AS
SELECT s.id AS session_id, f.*
FROM core.sessions s
JOIN core.files f ON f.app_id = s.app_id;
```

### Identity Flow

```
User action (FE)
  ↓ sessionId
Frontend API call
  ↓ GET /api/sessions/:sessionId/...
Backend route handler
  ↓ sessions.findById(sessionId)
Session record
  ↓ session.app_id
PostgresFileStore
  ↓ filesRepo.findByApp(app_id)
Files + Versions
  ↓
Response
```

## External Resource Handling

### CDN Proxy

- Endpoint: `GET /api/proxy-cdn?url=<encoded-url>`
- Allowlist: jsdelivr, unpkg, cdnjs, etc.
- Headers: Sets `Cross-Origin-Resource-Policy: cross-origin`

### Static Rewriting

- Server runs `maybeRewriteFile(path, content, { serverOrigin })` before returning files
- Rewrites hardcoded CDN URLs to `/api/proxy-cdn?url=...`
- Applied to HTML, CSS, JS, JSX, TSX files

### Runtime Service Worker

- File: `packages/ui-frontend/public/preview-sw.js`
- Intercepts `fetch()` requests from preview iframe
- Proxies CDN requests through `/api/proxy-cdn`
- Catches dynamically-added resources (new Image(), fetch(), etc.)

### YouTube/Embeds

- Component: `EmbedPlaceholder`
- Default UX: Click-to-open in new tab
- Avoids COEP violations for third-party iframes

## Session Switching (No Reload)

### Old Flow (Deprecated)

1. User clicks different chat
2. Call `/api/sessions/:id/switch-workspace`
3. Save current files to DB, load new files from DB, write to local FS
4. `window.location.reload()`

### New Flow

1. User clicks different chat
2. `setCurrentSessionId(newId)`
3. Fetch `/api/sessions/:newId` (messages)
4. Fetch `/api/sessions/:newId/files/tree` (file list)
5. `useWebSocket` reconnects with `?sessionId=newId`
6. `PreviewPane` remounts with new files
7. **Zero page reload**

## Performance Optimizations

### Indexes

```sql
-- Fast session → files lookup
CREATE INDEX files_app_id_idx ON core.files(app_id);

-- Fast version lookup
CREATE INDEX file_versions_file_id_idx ON core.file_versions(file_id);

-- Trigram search for paths
CREATE INDEX files_path_trgm ON core.files USING GIN (path gin_trgm_ops);
```

### Caching

- Frontend caches file tree in React state
- WebSocket pushes incremental updates
- Database TOAST handles large file content efficiently

### Compression

- File content stored as TEXT or BYTEA
- Postgres TOAST compresses large values automatically
- Consider explicit gzip for version history retention

## Security

### Path Validation

- All paths normalized and validated server-side
- Prevents directory traversal attacks
- Consistent with local FS security model

### Row-Level Security (Future)

```sql
-- Example RLS policy
ALTER TABLE core.files ENABLE ROW LEVEL SECURITY;

CREATE POLICY files_access ON core.files
  USING (app_id IN (
    SELECT app_id FROM core.sessions
    WHERE user_id = current_user_id()
  ));
```

### Auditing

- All file operations logged via `EventsRepository`
- Events include: `file.updated`, `file.renamed`, `file.deleted`
- Retention for compliance and debugging

## Migration & Rollout

### Phase A: Feature Flag (Current)

- `USE_LOCAL_FS=false` (default) → DB-backed VFS
- `USE_LOCAL_FS=true` → Legacy local FS mode
- Both modes coexist during transition

### Phase B: Full Cutover

1. Verify all sessions in production use DB
2. Remove `USE_LOCAL_FS` flag
3. Delete local `/api/files/*` routes
4. Remove `WORKSPACE_DIR` dependency

### Phase C: Cleanup

1. Remove `getFileTree()` function
2. Remove `saveWorkspaceToDatabase()`/`loadWorkspaceFromDatabase()`
3. Delete `/api/sessions/:id/switch-workspace` endpoint
4. Archive local workspace directories

## Acceptance Tests

### Must Pass

1. **No local writes**: Locking `workspace/` directory doesn't break file operations
2. **Session switch**: Clicking different chat updates messages, files, and preview without reload
3. **Cold start**: Browser refresh reconstructs same state from DB
4. **CDN resources**: External images/scripts load through proxy
5. **Versioning**: Each save creates new `file_versions` row
6. **Concurrency**: Simultaneous edits produce sequential versions

## API Examples

### List Files

```bash
GET /api/sessions/abc-123/files/tree

{
  "files": [
    {
      "name": "src",
      "path": "src",
      "type": "directory",
      "children": [
        {
          "name": "index.html",
          "path": "src/index.html",
          "type": "file",
          "size": 1234,
          "mimeType": "text/html"
        }
      ]
    }
  ]
}
```

### Read File

```bash
GET /api/sessions/abc-123/files/read?path=src%2Findex.html

{
  "path": "src/index.html",
  "content": "<!DOCTYPE html>...",
  "mimeType": "text/html",
  "version": 3
}
```

### Write File

```bash
POST /api/sessions/abc-123/files/write
{
  "path": "src/app.js",
  "content": "console.log('hello');",
  "mimeType": "application/javascript"
}

{
  "success": true,
  "path": "src/app.js"
}
```

## Troubleshooting

### Files not updating in preview

- Check WebSocket connection includes `?sessionId=...`
- Verify `files_updated` event received
- Inspect browser console for fetch errors

### CDN resources blocked

- Confirm host in allowlist (`server.ts` line ~84)
- Check CORS headers in `/api/proxy-cdn` response
- Try Service Worker installation (check DevTools → Application)

### Version conflicts

- File versions are sequential per file_id
- Use optimistic locking if implementing collaborative editing
- Check `file_versions.parent_version_id` for conflict detection

## Future Enhancements

1. **Blob chunking**: Store >10MB files in separate `file_blobs` table
2. **Object storage**: Move binary assets to S3/R2, keep metadata in DB
3. **Real-time collaboration**: Operational transforms for multi-user editing
4. **Offline support**: Service Worker cache for file tree + IndexedDB
5. **Smart sync**: Delta updates instead of full file re-fetch

## References

- Plan document: Original 19-section architecture plan
- CDN proxy: `packages/ui-server/src/cdn-rewriter.ts`
- File store: `packages/database/src/services/file-store.ts`
- Session routes: `packages/ui-server/src/routes/session-files.ts`
