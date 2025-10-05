# API Reference - Phase 1

Complete API documentation for the EitherWay backend server.

## Base URL

```
http://localhost:3001
```

## Authentication

Currently, authentication is handled via user email in request bodies. Full OAuth/JWT authentication will be added in Phase 2.

---

## Sessions API

### Create Session

Create a new chat session.

**POST** `/api/sessions`

**Request Body:**
```json
{
  "email": "user@example.com",
  "title": "Build a Todo App",
  "appId": "optional-app-uuid"
}
```

**Response:** `201 Created`
```json
{
  "id": "session-uuid",
  "user_id": "user-uuid",
  "title": "Build a Todo App",
  "app_id": "optional-app-uuid",
  "status": "active",
  "last_message_at": null,
  "created_at": "2025-01-15T10:00:00Z",
  "updated_at": "2025-01-15T10:00:00Z"
}
```

---

### Get Session

Retrieve session details with messages, memory, and working set.

**GET** `/api/sessions/:id`

**Response:** `200 OK`
```json
{
  "session": {
    "id": "session-uuid",
    "user_id": "user-uuid",
    "title": "Build a Todo App",
    "app_id": "app-uuid",
    "status": "active",
    "last_message_at": "2025-01-15T10:05:00Z",
    "created_at": "2025-01-15T10:00:00Z",
    "updated_at": "2025-01-15T10:05:00Z"
  },
  "messages": [
    {
      "id": "1",
      "session_id": "session-uuid",
      "role": "user",
      "content": { "text": "Build me a todo app" },
      "model": null,
      "token_count": null,
      "created_at": "2025-01-15T10:00:00Z"
    },
    {
      "id": "2",
      "session_id": "session-uuid",
      "role": "assistant",
      "content": { "text": "I'll help you build a todo app..." },
      "model": "claude-sonnet-4-5",
      "token_count": 150,
      "created_at": "2025-01-15T10:00:30Z"
    }
  ],
  "memory": {
    "session_id": "session-uuid",
    "rolling_summary": "User requested a todo app. Discussed features.",
    "facts": {
      "app_type": "todo",
      "framework": "react"
    },
    "last_compacted_message_id": "2",
    "updated_at": "2025-01-15T10:00:30Z"
  },
  "workingSet": [
    {
      "session_id": "session-uuid",
      "app_id": "app-uuid",
      "file_id": "file-uuid",
      "file_path": "src/App.tsx",
      "reason": "Currently implementing todo component",
      "pinned_by": "agent",
      "created_at": "2025-01-15T10:02:00Z"
    }
  ]
}
```

---

### List Sessions

List sessions for a user.

**GET** `/api/sessions?userId=<user-uuid>&limit=50&offset=0`

**Query Parameters:**
- `userId` (required): User UUID
- `limit` (optional): Max results, default 50
- `offset` (optional): Pagination offset, default 0

**Response:** `200 OK`
```json
{
  "sessions": [
    {
      "id": "session-uuid-1",
      "user_id": "user-uuid",
      "title": "Build a Todo App",
      "app_id": "app-uuid-1",
      "status": "active",
      "last_message_at": "2025-01-15T10:05:00Z",
      "created_at": "2025-01-15T10:00:00Z",
      "updated_at": "2025-01-15T10:05:00Z"
    }
  ]
}
```

---

### Add Message

Add a message to a session.

**POST** `/api/sessions/:id/messages`

**Request Body:**
```json
{
  "role": "user",
  "content": { "text": "Add dark mode" },
  "model": "claude-sonnet-4-5",
  "tokenCount": 10
}
```

**Response:** `201 Created`
```json
{
  "id": "3",
  "session_id": "session-uuid",
  "role": "user",
  "content": { "text": "Add dark mode" },
  "model": "claude-sonnet-4-5",
  "token_count": 10,
  "created_at": "2025-01-15T10:10:00Z"
}
```

---

### Update Session

Update session title or status.

**PATCH** `/api/sessions/:id`

**Request Body:**
```json
{
  "title": "Updated Title",
  "status": "archived"
}
```

**Response:** `200 OK`
```json
{
  "id": "session-uuid",
  "user_id": "user-uuid",
  "title": "Updated Title",
  "status": "archived",
  ...
}
```

---

### Delete Session

Delete a session (cascades to messages, memory, working set).

**DELETE** `/api/sessions/:id`

**Response:** `200 OK`
```json
{
  "success": true
}
```

---

### Update Session Memory

Update session memory (rolling summary, facts).

**PUT** `/api/sessions/:id/memory`

**Request Body:**
```json
{
  "rollingSummary": "User built a todo app with dark mode",
  "facts": {
    "app_type": "todo",
    "framework": "react",
    "theme": "dark"
  },
  "lastCompactedMessageId": "10"
}
```

**Response:** `200 OK`
```json
{
  "session_id": "session-uuid",
  "rolling_summary": "User built a todo app with dark mode",
  "facts": { ... },
  "last_compacted_message_id": "10",
  "updated_at": "2025-01-15T10:20:00Z"
}
```

---

### Add to Working Set

Pin a file to the session's working set.

**POST** `/api/sessions/:id/working-set`

**Request Body:**
```json
{
  "appId": "app-uuid",
  "fileId": "file-uuid",
  "reason": "Implementing dark mode toggle",
  "pinnedBy": "user"
}
```

**Response:** `200 OK`
```json
{
  "session_id": "session-uuid",
  "app_id": "app-uuid",
  "file_id": "file-uuid",
  "reason": "Implementing dark mode toggle",
  "pinned_by": "user",
  "created_at": "2025-01-15T10:25:00Z"
}
```

---

### Remove from Working Set

**DELETE** `/api/sessions/:sessionId/working-set/:fileId`

**Response:** `200 OK`
```json
{
  "success": true
}
```

---

## Apps API

### Create App

**POST** `/api/apps`

**Request Body:**
```json
{
  "ownerId": "user-uuid",
  "name": "Todo App",
  "visibility": "private"
}
```

**Response:** `201 Created`
```json
{
  "id": "app-uuid",
  "owner_id": "user-uuid",
  "name": "Todo App",
  "visibility": "private",
  "default_session_id": null,
  "created_at": "2025-01-15T10:00:00Z",
  "updated_at": "2025-01-15T10:00:00Z"
}
```

---

### Get App

**GET** `/api/apps/:id`

**Response:** `200 OK`
```json
{
  "id": "app-uuid",
  "owner_id": "user-uuid",
  "name": "Todo App",
  "visibility": "private",
  "default_session_id": null,
  "created_at": "2025-01-15T10:00:00Z",
  "updated_at": "2025-01-15T10:00:00Z"
}
```

---

### List Apps

**GET** `/api/apps?ownerId=<user-uuid>&limit=50&offset=0`

**Response:** `200 OK`
```json
{
  "apps": [ ... ]
}
```

---

### Update App

**PATCH** `/api/apps/:id`

**Request Body:**
```json
{
  "name": "Advanced Todo App",
  "visibility": "public",
  "default_session_id": "session-uuid"
}
```

**Response:** `200 OK`

---

### Delete App

**DELETE** `/api/apps/:id`

**Response:** `200 OK`
```json
{
  "success": true
}
```

---

### List App Files

**GET** `/api/apps/:appId/files?limit=1000`

**Response:** `200 OK`
```json
{
  "files": [
    {
      "id": "file-uuid",
      "app_id": "app-uuid",
      "path": "src/App.tsx",
      "is_binary": false,
      "mime_type": "text/typescript",
      "size_bytes": 1024,
      "sha256": "<buffer>",
      "head_version_id": "version-uuid",
      "created_at": "2025-01-15T10:00:00Z",
      "updated_at": "2025-01-15T10:30:00Z"
    }
  ]
}
```

---

### Create/Update File

**POST** `/api/apps/:appId/files`

**Request Body:**
```json
{
  "path": "src/App.tsx",
  "content": "import React from 'react';\n\nexport default function App() {\n  return <div>Hello</div>;\n}",
  "userId": "user-uuid",
  "mimeType": "text/typescript"
}
```

**Response:** `200 OK`
```json
{
  "id": "file-uuid",
  "app_id": "app-uuid",
  "path": "src/App.tsx",
  "is_binary": false,
  "mime_type": "text/typescript",
  "size_bytes": 96,
  "sha256": "<buffer>",
  "head_version_id": "version-uuid",
  "created_at": "2025-01-15T10:00:00Z",
  "updated_at": "2025-01-15T10:00:00Z"
}
```

---

### Get File with Version

**GET** `/api/apps/:appId/files/:fileId`

**Response:** `200 OK`
```json
{
  "file": {
    "id": "file-uuid",
    "app_id": "app-uuid",
    "path": "src/App.tsx",
    ...
  },
  "version": {
    "id": "version-uuid",
    "file_id": "file-uuid",
    "version": 3,
    "parent_version_id": "version-uuid-2",
    "content_text": "import React from 'react';\n...",
    "content_bytes": null,
    "diff_from_parent": null,
    "created_by": "user-uuid",
    "created_at": "2025-01-15T10:30:00Z"
  }
}
```

---

### Get File Version History

**GET** `/api/apps/:appId/files/:fileId/versions?limit=50`

**Response:** `200 OK`
```json
{
  "versions": [
    {
      "id": "version-uuid-3",
      "file_id": "file-uuid",
      "version": 3,
      ...
    },
    {
      "id": "version-uuid-2",
      "file_id": "file-uuid",
      "version": 2,
      ...
    }
  ]
}
```

---

### Delete File

**DELETE** `/api/apps/:appId/files/:fileId`

**Response:** `200 OK`
```json
{
  "success": true
}
```

---

### Get App References

**GET** `/api/apps/:appId/references`

**Response:** `200 OK`
```json
{
  "references": [
    {
      "id": "1",
      "app_id": "app-uuid",
      "src_file_id": "file-uuid-1",
      "dest_file_id": "file-uuid-2",
      "raw_target": "./utils",
      "symbol": "formatDate",
      "ref_type": "import",
      "created_at": "2025-01-15T10:00:00Z"
    }
  ]
}
```

---

## Image Generation API

### Generate Image

**POST** `/api/images/generate`

**Request Body:**
```json
{
  "prompt": "A futuristic cityscape at sunset",
  "model": "dall-e-3",
  "size": "1024x1024",
  "quality": "hd",
  "n": 1,
  "sessionId": "session-uuid",
  "appId": "app-uuid"
}
```

**Response:** `202 Accepted`
```json
{
  "jobId": "job-uuid"
}
```

---

### Get Job Status

**GET** `/api/images/jobs/:jobId`

**Response:** `200 OK`
```json
{
  "job": {
    "id": "job-uuid",
    "session_id": "session-uuid",
    "app_id": "app-uuid",
    "prompt": "A futuristic cityscape at sunset",
    "model": "dall-e-3",
    "size": "1024x1024",
    "n": 1,
    "state": "succeeded",
    "requested_at": "2025-01-15T10:00:00Z",
    "started_at": "2025-01-15T10:00:01Z",
    "finished_at": "2025-01-15T10:00:15Z",
    "error": null
  },
  "assets": [
    {
      "id": "asset-uuid",
      "job_id": "job-uuid",
      "position": 0,
      "mime_type": "image/png",
      "storage_url": null,
      "checksum": "<buffer>",
      "width": 1024,
      "height": 1024,
      "created_at": "2025-01-15T10:00:15Z"
    }
  ]
}
```

---

### Download Asset

**GET** `/api/images/assets/:assetId`

**Response:** `200 OK`

Headers:
```
Content-Type: image/png
Cache-Control: public, max-age=31536000
```

Body: Binary image data

---

### Poll Job

Poll a job until it completes (with timeout).

**POST** `/api/images/poll`

**Request Body:**
```json
{
  "jobId": "job-uuid",
  "timeoutMs": 60000
}
```

**Response:** `200 OK` (same as Get Job Status)

**Error Response:** `408 Request Timeout`
```json
{
  "error": "Image generation timed out after 60000ms"
}
```

---

## Health & System API

### Health Check

**GET** `/api/health`

**Response:** `200 OK`
```json
{
  "status": "ok",
  "workspace": "/path/to/workspace",
  "database": "connected"
}
```

---

### List Workspace Files

**GET** `/api/files`

**Response:** `200 OK`
```json
{
  "files": [
    {
      "name": "src",
      "path": "src",
      "type": "directory",
      "children": [
        {
          "name": "App.tsx",
          "path": "src/App.tsx",
          "type": "file",
          "size": 1024
        }
      ]
    }
  ]
}
```

---

### Read Workspace File

**GET** `/api/files/*`

Example: `GET /api/files/src/App.tsx`

**Response:** `200 OK`
```json
{
  "path": "src/App.tsx",
  "content": "import React from 'react';\n..."
}
```

**Error Response:** `403 Forbidden` (path traversal)
```json
{
  "error": "Access denied: path traversal detected"
}
```

**Error Response:** `404 Not Found`
```json
{
  "error": "ENOENT: no such file or directory"
}
```

---

## WebSocket API

### Agent Interaction

**WS** `/api/agent`

**Message Format:**
```json
{
  "type": "prompt",
  "prompt": "Build me a todo app"
}
```

**Response Messages:**

Status Update:
```json
{
  "type": "status",
  "message": "Processing request..."
}
```

Final Response:
```json
{
  "type": "response",
  "content": "I'll help you build a todo app..."
}
```

Files Updated:
```json
{
  "type": "files_updated",
  "files": [ ... ]
}
```

Error:
```json
{
  "type": "error",
  "message": "Error message"
}
```

---

## Error Responses

All endpoints return standard error responses:

**400 Bad Request:**
```json
{
  "error": "Missing required field: userId"
}
```

**404 Not Found:**
```json
{
  "error": "Session not found"
}
```

**500 Internal Server Error:**
```json
{
  "error": "Internal server error"
}
```
