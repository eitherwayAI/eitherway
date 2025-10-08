# Eitherway Documentation

## DB-Backed Virtual File System (VFS)

This directory contains comprehensive documentation for the new database-backed Virtual File System architecture.

### Quick Links

- **[VFS Architecture](VFS_ARCHITECTURE.md)** - Complete technical architecture and design decisions
- **[Migration Guide](VFS_MIGRATION.md)** - Step-by-step upgrade instructions for developers
- **[Implementation Summary](VFS_SUMMARY.md)** - What was built, testing, and rollout plan

## Architecture Overview

```
┌─────────────┐
│   Frontend  │  sessionId as primary key
│   (React)   │  No page reloads on session switch
└──────┬──────┘
       │ HTTP/WS (sessionId)
       ↓
┌─────────────┐
│   Backend   │  Session-centric routes
│  (Fastify)  │  /api/sessions/:id/files/*
└──────┬──────┘
       │
       ↓
┌─────────────┐
│  FileStore  │  Abstract interface
│ (Postgres)  │  Versioning + tree building
└──────┬──────┘
       │
       ↓
┌─────────────┐
│  Database   │  System of record
│ (Postgres)  │  files + file_versions
└─────────────┘
```

## Key Features

✅ **Zero local writes** - All files in PostgreSQL
✅ **Session switching** - Instant, no reload
✅ **Automatic versioning** - Every write creates history
✅ **CDN proxy** - External resources work in preview
✅ **Feature flag** - Gradual rollout with `USE_LOCAL_FS`

## Getting Started

### 1. Setup Database

```bash
export DATABASE_URL="postgresql://user:pass@localhost:5432/eitherway"
cd packages/database
npm install
npm run migrate
```

### 2. Start Server

```bash
cd packages/ui-server
npm install
npm run dev
# Server runs on http://localhost:3001
```

### 3. Start Frontend

```bash
cd packages/ui-frontend
npm install
npm run dev
# UI runs on http://localhost:5173
```

### 4. Verify VFS

```bash
# Check health
curl http://localhost:3001/api/health
# Should show: "database": "connected"

# Files are now in DB, not local FS!
```

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | Required | PostgreSQL connection string |
| `USE_LOCAL_FS` | `false` | Use legacy local filesystem (deprecated) |
| `WORKSPACE_DIR` | `./workspace` | Legacy workspace path (unused in VFS mode) |
| `PORT` | `3001` | Server port |

## Common Tasks

### List Files for a Session

```bash
curl http://localhost:3001/api/sessions/{SESSION_ID}/files/tree
```

### Read a File

```bash
curl "http://localhost:3001/api/sessions/{SESSION_ID}/files/read?path=src/index.html"
```

### Write a File

```bash
curl -X POST http://localhost:3001/api/sessions/{SESSION_ID}/files/write \
  -H "Content-Type: application/json" \
  -d '{"path":"hello.txt","content":"Hello World"}'
```

### View Version History

```bash
curl "http://localhost:3001/api/sessions/{SESSION_ID}/files/versions?path=hello.txt"
```

## Troubleshooting

### Files not showing in preview

1. Check session has `app_id`: `SELECT app_id FROM core.sessions WHERE id = 'xxx';`
2. Check files exist: `SELECT * FROM core.files WHERE app_id = 'xxx';`
3. Check WebSocket includes `?sessionId=xxx`

### "Session not found" errors

1. Verify session exists in database
2. Check `app_id` is set on session
3. Ensure frontend passes `sessionId` to all API calls

### CDN resources blocked

1. Add host to allowlist in `packages/ui-server/src/server.ts`
2. Restart server
3. Check `/api/proxy-cdn?url=...` returns 200

### Database connection failed

1. Verify `DATABASE_URL` is set
2. Check PostgreSQL is running
3. Run migrations: `cd packages/database && npm run migrate`

## Architecture Decisions

### Why PostgreSQL?

- **ACID transactions** - Atomic file + version writes
- **JSONB support** - Flexible metadata storage
- **Mature ecosystem** - Proven at scale
- **GIN indexes** - Fast path search with trigram
- **Row-level security** - Future multi-tenancy

### Why Session-Centric?

- **Unified identity** - Chat + files share sessionId
- **Simpler frontend** - No app_id management
- **Clearer security** - One access control point
- **Better UX** - Session is the mental model

### Why No Reload?

- **Faster switching** - <100ms vs 2-3s full reload
- **Better UX** - Smooth transitions
- **Simpler code** - React state management
- **WebSocket friendly** - Persistent connection

## Performance

### Benchmarks (100 files, 10KB each)

| Operation | Time | Notes |
|-----------|------|-------|
| List files | ~10ms | With index |
| Read file | ~5ms | Head version join |
| Write file | ~15ms | File + version transaction |
| Session switch | <100ms | Messages + file tree |
| Preview remount | 1-3s | npm install + server start |

### Optimization Tips

1. **Use indexes** - Already added in migration 004
2. **Limit queries** - `?limit=500` on large apps
3. **Cache hot files** - Add Redis layer if needed
4. **Compress content** - Postgres TOAST handles automatically

## Security

### Current

- Path normalization prevents traversal
- Session isolation enforced by API
- All operations logged to `core.events`
- Version history immutable

### Future (RLS)

```sql
ALTER TABLE core.files ENABLE ROW LEVEL SECURITY;

CREATE POLICY files_access ON core.files
  USING (app_id IN (
    SELECT app_id FROM core.sessions
    JOIN core.users ON sessions.user_id = users.id
    WHERE users.id = current_user_id()
  ));
```

## Testing

### Manual Test Suite

1. **File persistence**
   - Create file via API
   - Verify in database
   - Confirm NOT in local FS

2. **Session switching**
   - Create 2 sessions with different files
   - Switch between them
   - Verify no reload, files update

3. **Version history**
   - Write same file 3 times
   - Check versions table has 3 rows
   - Fetch version history via API

4. **CDN proxy**
   - Create HTML with `<script src="https://cdn.jsdelivr.net/npm/vue@3">`
   - Open preview
   - Verify loads without CORS error

5. **WebSocket**
   - Connect with `?sessionId=xxx`
   - Trigger file update via chat
   - Receive `files_updated` event
   - Verify `sessionId` matches

## Migration Checklist

- [ ] Database connection configured
- [ ] Migrations run (`004_vfs_optimizations.sql`)
- [ ] `USE_LOCAL_FS=false` set (or omitted)
- [ ] Existing files imported from local FS (if any)
- [ ] Frontend updated to use new routes
- [ ] WebSocket includes `sessionId` parameter
- [ ] CDN proxy allowlist configured
- [ ] Service Worker deployed (for runtime URL rewriting)
- [ ] Testing complete
- [ ] Monitoring in place

## Rollback

If needed, revert to local FS:

```bash
export USE_LOCAL_FS=true
npm run server
# Old routes will work again
```

## Support

- **Docs**: This directory
- **Issues**: GitHub with `vfs` label
- **Logs**: Check `packages/ui-server` console output
- **Database**: Query `core.events` for operation history

## Contributing

When adding features:

1. Update `FileStore` interface if changing contract
2. Add migration if changing schema
3. Update routes in `session-files.ts`
4. Document in `VFS_ARCHITECTURE.md`
5. Add tests (manual checklist for now)

## License

Same as main project
