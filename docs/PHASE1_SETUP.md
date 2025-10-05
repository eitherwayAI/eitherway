# Phase 1 Setup Guide - PostgreSQL Database Integration

This guide covers the setup and deployment of Phase 1: Database foundation, session management, and image generation.

## Prerequisites

- Node.js >= 18.0.0
- Docker and Docker Compose
- PostgreSQL 16 (via Docker or locally installed)
- Anthropic API Key
- OpenAI API Key (for image generation)

## Quick Start

### 1. Environment Configuration

Copy the example environment file and configure your credentials:

```bash
cp .env.example .env
```

Edit `.env` and add your API keys:

```bash
ANTHROPIC_API_KEY=your_anthropic_api_key_here
OPENAI_API_KEY=your_openai_api_key_here

# PostgreSQL Configuration
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=eitherway
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_MAX_CONNECTIONS=20

# Server Configuration
PORT=3001
WORKSPACE_DIR=./workspace
NODE_ENV=development
```

### 2. Start PostgreSQL Database

Using Docker Compose (recommended):

```bash
docker-compose up -d postgres
```

Verify the database is running:

```bash
docker-compose ps
docker-compose logs postgres
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Run Database Migrations

```bash
npm run migrate -w @eitherway/database
```

Expected output:
```
Connecting to database...
✓ Connected to database

Found 1 pending migration(s)

Applying migration 1: initial_schema
✓ Migration 1 applied successfully

✓ All migrations completed successfully
```

### 5. Build Packages

```bash
npm run build
```

### 6. Start the Server

```bash
npm run server
```

The server should start on `http://localhost:3001`

## Project Structure

```
eitherway_single_agent/
├── packages/
│   ├── database/              # PostgreSQL data layer (NEW)
│   │   ├── src/
│   │   │   ├── client.ts              # Database connection pool
│   │   │   ├── types.ts               # TypeScript types
│   │   │   ├── repositories/          # Data access layer
│   │   │   │   ├── users.ts
│   │   │   │   ├── sessions.ts
│   │   │   │   ├── messages.ts
│   │   │   │   ├── apps.ts
│   │   │   │   ├── files.ts
│   │   │   │   ├── session-memory.ts
│   │   │   │   ├── images.ts
│   │   │   │   └── events.ts
│   │   │   ├── services/
│   │   │   │   └── image-generator.ts # Hardened DALL-E integration
│   │   │   ├── migrations/
│   │   │   │   ├── 001_initial_schema.sql
│   │   │   │   ├── runner.ts
│   │   │   │   └── create.ts
│   │   │   └── tests/
│   │   │       ├── smoke.test.ts
│   │   │       └── image-generation.test.ts
│   │   └── package.json
│   ├── runtime/               # Agent orchestration
│   │   └── src/
│   │       └── database-agent.ts      # Database-aware agent (NEW)
│   └── ui-server/             # API server
│       └── src/
│           ├── server-enhanced.ts     # Enhanced server (NEW)
│           └── routes/                # API routes (NEW)
│               ├── sessions.ts
│               ├── apps.ts
│               └── images.ts
└── docker-compose.yml         # PostgreSQL container (NEW)
```

## API Endpoints

### Sessions

- `POST /api/sessions` - Create a new session
- `GET /api/sessions/:id` - Get session details with messages, memory, and working set
- `GET /api/sessions?userId=<id>` - List sessions for a user
- `POST /api/sessions/:id/messages` - Add a message to a session
- `PATCH /api/sessions/:id` - Update session title or status
- `DELETE /api/sessions/:id` - Delete a session
- `PUT /api/sessions/:id/memory` - Update session memory
- `POST /api/sessions/:id/working-set` - Add file to working set
- `DELETE /api/sessions/:sessionId/working-set/:fileId` - Remove from working set

### Apps

- `POST /api/apps` - Create a new app
- `GET /api/apps/:id` - Get app details
- `GET /api/apps?ownerId=<id>` - List apps for an owner
- `PATCH /api/apps/:id` - Update app
- `DELETE /api/apps/:id` - Delete app
- `GET /api/apps/:appId/files` - List files in an app
- `POST /api/apps/:appId/files` - Create/update a file
- `GET /api/apps/:appId/files/:fileId` - Get file with current version
- `GET /api/apps/:appId/files/:fileId/versions` - Get file version history
- `DELETE /api/apps/:appId/files/:fileId` - Delete file

### Image Generation

- `POST /api/images/generate` - Generate an image with DALL-E
- `GET /api/images/jobs/:jobId` - Get job status
- `GET /api/images/assets/:assetId` - Download image asset
- `POST /api/images/poll` - Poll job until complete

### Health & System

- `GET /api/health` - Health check (includes database status)
- `GET /api/files` - List workspace files
- `GET /api/files/*` - Read a workspace file
- `WS /api/agent` - WebSocket for real-time agent interaction

## Database Schema

### Core Tables

- **users** - User accounts
- **sessions** - Chat/app working sessions
- **messages** - Conversation history
- **apps** - User applications
- **files** - App files (head pointers)
- **file_versions** - Immutable file versions
- **file_references** - Dependency graph (imports, assets, etc.)
- **session_memory** - Rolling summaries and facts
- **working_set** - Pinned files for each session
- **image_jobs** - Image generation jobs
- **image_assets** - Generated images with verification
- **events** - Audit log

## Image Generation

The image generation pipeline includes robust error handling and verification:

### Features

1. **Base64 JSON Response Format** - Avoids TTL issues with hosted URLs
2. **MIME Type Sniffing** - Verifies PNG/JPEG magic bytes
3. **Image Validation** - Uses `sharp` to verify decodability
4. **End Marker Verification** - Checks JPEG EOI (0xFF 0xD9) and PNG IEND chunks
5. **SHA-256 Checksums** - Stored for integrity verification
6. **Dimension Extraction** - Width/height stored in metadata
7. **Async Job Processing** - Non-blocking generation with polling

### Example Usage

```typescript
import { ImageGenerationService, createDatabaseClient } from '@eitherway/database';

const db = createDatabaseClient();
const imageService = new ImageGenerationService(db);

// Start generation (async)
const jobId = await imageService.generateImage({
  prompt: 'A futuristic cityscape',
  model: 'dall-e-3',
  size: '1024x1024',
  quality: 'hd',
  n: 1,
  sessionId: 'session-uuid',
  appId: 'app-uuid'
});

// Poll until complete
const result = await imageService.pollJobUntilComplete(jobId, 60000);

// Download asset
const asset = await imageService.getAsset(result.assets[0].id);
```

## Testing

### Run Database Smoke Tests

```bash
npm run test -w @eitherway/database
```

Tests include:
- User creation and retrieval
- Session and message management
- App and file versioning
- Session memory and working set
- Event logging
- Image generation pipeline
- Image verification (MIME types, checksums, EOF markers)

## Migration Management

### Create a New Migration

```bash
npm run migrate:create <migration_name> -w @eitherway/database
```

Example:
```bash
npm run migrate:create add_user_preferences -w @eitherway/database
```

This creates `packages/database/src/migrations/002_add_user_preferences.sql`

### Run Migrations

```bash
npm run migrate -w @eitherway/database
```

Migrations are tracked in the `migrations` table and run in order.

## Database Agent Integration

The new `DatabaseAgent` class wraps the standard `Agent` with database-backed session persistence:

```typescript
import { DatabaseAgent } from '@eitherway/runtime';
import { createDatabaseClient } from '@eitherway/database';

const db = createDatabaseClient();

const agent = new DatabaseAgent({
  db,
  sessionId: 'session-uuid',
  userId: 'user-uuid',
  appId: 'app-uuid',
  claudeConfig,
  agentConfig,
  executors: getAllExecutors()
});

// Process request (automatically saves to database)
const response = await agent.processRequest('Build me a todo app');

// Get session context
const context = await agent.getSessionContext();
// Returns: { session, recentMessages, memory, workingSet }
```

## Troubleshooting

### Database Connection Failed

Check PostgreSQL is running:
```bash
docker-compose ps postgres
```

Check connection settings in `.env`

Verify network connectivity:
```bash
psql -h localhost -p 5432 -U postgres -d eitherway
```

### Migration Errors

Reset database (⚠️ destroys all data):
```bash
docker-compose down -v
docker-compose up -d postgres
npm run migrate -w @eitherway/database
```

### Image Generation Failing

Verify OpenAI API key is set:
```bash
echo $OPENAI_API_KEY
```

Check image job status:
```bash
curl http://localhost:3001/api/images/jobs/<job-id>
```

## Phase 1 Definition of Done

✅ All new sessions/messages/files live in PostgreSQL
✅ Image jobs produce valid PNG/JPEG bytes
✅ Extension matches content (verified via magic bytes)
✅ Images are verifiably decodable (via `sharp`)
✅ EOF markers verified (JPEG: 0xFF 0xD9, PNG: IEND chunk)
✅ Can resume a session and open app's latest files instantly
✅ Session memory and working set tracked per session
✅ Event logging for audit trail
✅ Comprehensive smoke tests passing

## Next Steps

Phase 2 will focus on:
- Context situation improvements (embeddings, RAG)
- Advanced session memory compaction
- File reference graph traversal
- Intelligent working set management
- Performance optimizations

## Support

For issues or questions, check:
- Database logs: `docker-compose logs -f postgres`
- Server logs: `npm run server` output
- Test output: `npm run test -w @eitherway/database`
