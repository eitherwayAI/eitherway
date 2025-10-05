# EitherWay Agent - Portion 1

Single-agent AI for app creation using **Claude Sonnet 4.5** (`claude-sonnet-4-5-20250929`).

## Overview

Portion 1 implements the core agent kernel with:
- ✅ Model Client with streaming (Claude Sonnet 4.5)
- ✅ Tool Runner with validation, allowlist, and idempotency
- ✅ 6 Tools: `either-view`, `either-search-files`, `either-line-replace`, `either-write`, `websearch--web_search`, `eithergen--generate_image`
- ✅ Stages 1-2 Workflow: Analyze → Plan
- ✅ Configuration system with security guardrails
- ✅ Logging and transcript capture
- ✅ Acceptance tests

Portion 2 adds production-grade tools and observability:
- ✅ Enhanced tools with SHA-256, unified diffs, regex search
- ✅ Web search integration (Tavily API)
- ✅ Image generation (OpenAI DALL-E)
- ✅ Structured logging and metrics
- ✅ Rate limiting for external APIs
- ✅ Read-before-write discipline

## 🎨 NEW: Interactive UI

**Build apps visually with chat, live preview, and file browser!**

See [UI_README.md](./UI_README.md) for full documentation.

### Features
- 💬 **Chat interface** - Natural language prompts with streaming responses
- 📁 **File browser** - Tree view with syntax-highlighted code viewer
- 🔍 **Live preview** - WebContainer integration runs your app in the browser
- ⚡ **Real-time sync** - Files update instantly via WebSocket

### Quick Start
```bash
# Initialize workspace
npm run init-workspace

# Terminal 1: Start backend
npm run server

# Terminal 2: Start frontend
npm run ui

# Open http://localhost:3000
```

## Architecture

```
/packages
  /runtime           # LLM client, tool runner, orchestration
  /tools-core        # Tool type defs, JSON Schemas, validation
  /tools-impl        # Tool executor implementations
  /evaluations       # Acceptance tests
  /ui                # CLI (minimal)
/configs
  anthropic.json     # API keys & model config
  agent.json         # Policy, limits, security, paths allowlist
```

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure API Key

```bash
# Copy example config
cp configs/anthropic.example.json configs/anthropic.json

# Edit configs/anthropic.json and add your Anthropic API key
```

### 3. Run Agent

```bash
# Dry run (no file changes)
npm run dev --dry-run "Build me a calculator"

# Live run (will create/modify files)
npm run dev "Build me a calculator"
```

### 4. Run Acceptance Tests

```bash
npm run eval
```

## Configuration

### configs/anthropic.json

```json
{
  "apiKey": "sk-ant-...",
  "model": "claude-sonnet-4-5-20250929",
  "maxTokens": 8192,
  "temperature": 0.2,
  "topP": 0.9,
  "streaming": true,
  "provider": "anthropic"
}
```

### configs/agent.json

Security and limits configuration:

- **Allowed workspaces**: Paths the agent can access
- **Denied paths**: Paths explicitly blocked
- **Secret patterns**: Regex patterns to redact from logs
- **Size limits**: Max file/payload sizes

## Workflow Stages

### Stage 1: Analyze Request
Parse user intent, identify scope, understand constraints.

Example: "Build me a calculator" → needs: UI, state management, operations, keyboard support.

### Stage 2: Plan Architecture
Decide on design system, component structure, file organization.

Example: Design system in index.css → Calculator component → clean separation of concerns.

### Stage 3: Select Tools _(Future)_
Choose the most efficient tools for the task.

### Stage 4: Execute _(Future, Parallel)_
Execute tools in parallel (currently sequential in Portion 1).

### Stage 5: Verify & Respond _(Future)_
Self-check diffs and tests; provide concise summary.

## Tools

### File Operations
- **either-view**: Read files with size limits
- **either-search-files**: Search code for patterns
- **either-write**: Create new files
- **either-line-replace**: Targeted line edits (preferred)

### External Services (Stubs in Portion 1)
- **websearch--web_search**: Web search (Tavily/Bing/etc)
- **eithergen--generate_image**: Image generation (OpenAI/Stability/etc)

## Security Guardrails

✅ **Path Validation**
- Only allowed workspace paths accessible
- Denied paths explicitly blocked

✅ **Secret Redaction**
- API keys and secrets redacted from logs
- Configurable regex patterns

✅ **Size Limits**
- Max file size: 1MB
- Max tool payload: 512KB
- Chunking for large reads

✅ **Idempotency**
- Duplicate tool calls detected via hash
- Cache prevents redundant execution

## Development

### Build All Packages

```bash
npm run build
```

### Run in Development Mode

```bash
npm run dev
```

### Clean Build Artifacts

```bash
npm run clean
```

## Acceptance Criteria (Portion 1)

✅ Agent can Analyze and Plan for "Build me a calculator" without executing tools

✅ Emits a Stage 2 architecture plan (files/components) and a Stage 3 tool plan outline

✅ Basic dry run: no file writes; logs contain well-formed tool_use intents

## Next Steps (Future Portions)

- **Portion 2**: Implement Stages 3-4 with parallel tool execution
- **Portion 3**: Add Stage 5 verification, self-correction, and testing
- **Portion 4**: Production hardening, provider adapters (Vertex/Bedrock), extended thinking

## Model Information

**Model**: Claude Sonnet 4.5
**ID**: `claude-sonnet-4-5-20250929`
**Provider**: Anthropic Messages API
**Temperature**: 0.2 (deterministic)
**Context Window**: 200K tokens

## License

MIT
