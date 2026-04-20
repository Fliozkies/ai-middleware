# Personal AI Middleware — Technical Blueprint

## Overview

A personal AI operating system built on a static frontend (GitHub Pages), a Node.js API backend (Vercel), and Supabase as the persistent brain. Claude acts as orchestrator and deep reasoner. Gemini Flash Lite handles cheap, mechanical subtasks only. A Claude skill bridges every conversation to this system automatically.

---

## System Architecture

```
User
 ↓
Claude + Skill (fetches context at conversation start)
 ↓
Vercel API (Node.js — secure middleware, holds all credentials)
 ↓                    ↓                        ↓
Supabase DB      Gemini Flash Lite         External APIs
(memory,         (classification,          (Gmail, Calendar,
 projects,        summarization,            etc. — future)
 tools,           tagging, embeddings)
 files)
```

GitHub Pages hosts the static frontend (future dashboard UI).
Vercel hosts the Node.js API that Claude calls.

---

## Build Phases

### Phase 1 — Foundation
- Supabase project setup + schema
- Vercel API project setup
- Core endpoints (health check, auth token)
- Claude skill (minimal — just knows the base URL)

### Phase 2 — Memory System
- Facts table + pgvector embeddings
- Core facts endpoint (auto-loaded each conversation)
- Semantic search endpoint
- Fact storage endpoint
- Conversation checkpoint system (heartbeat saves)
- Flash Lite integration for tagging/classification

### Phase 3 — Project & File System
- Projects table
- Files table + file_versions table
- File tree endpoint (metadata only)
- File fetch by path
- File create/update with versioning
- Semantic search across file chunks

### Phase 4 — Tool Registry
- Tools table
- Tool fetch endpoint (loaded at conversation start)
- Tool create endpoint (Claude can add new tools)
- Tool execute endpoint (routes to Flash Lite or external APIs)

### Phase 5 — Dashboard (GitHub Pages)
- View memory facts
- Browse projects and files
- Manage tool registry
- View conversation history

---

## Supabase Schema

### `facts`
```sql
id            uuid primary key
category      text  -- 'preference' | 'goal' | 'decision' | 'context' | 'relationship' | 'pattern'
content       text
importance    int   -- 1-3 (3 = always load as core)
embedding     vector(1536)
created_at    timestamptz
last_updated  timestamptz
source        text  -- which conversation this came from
```

### `conversation_checkpoints`
```sql
id                  uuid primary key
summary             text
active_topics       jsonb
decisions_made      jsonb
open_threads        jsonb
next_logical_step   text
created_at          timestamptz
```

### `projects`
```sql
id            uuid primary key
name          text
description   text
tech_stack    jsonb
status        text  -- 'active' | 'paused' | 'complete'
created_at    timestamptz
last_modified timestamptz
```

### `files`
```sql
id               uuid primary key
project_id       uuid references projects(id)
path             text  -- full path e.g. 'src/components/auth/LoginForm.jsx'
filename         text
extension        text
current_version  int   -- points to latest version number
created_at       timestamptz
last_modified    timestamptz
```

### `file_versions`
```sql
id             uuid primary key
file_id        uuid references files(id)
version_number int
content        text
size_bytes     int
embedding      vector(1536)
changed_by     text  -- 'claude' | 'user'
created_at     timestamptz
```

### `file_chunks`
```sql
id           uuid primary key
file_id      uuid references files(id)
version_id   uuid references file_versions(id)
chunk_index  int
content      text
embedding    vector(1536)
```

### `tools`
```sql
id               uuid primary key
name             text unique
description      text
agent            text   -- 'flash_lite' | 'claude' | 'external'
trigger_hint     text   -- when Claude should use this tool
prompt_template  text   -- template with {{variables}}
endpoint         text   -- which static site endpoint to call
created_by       text   -- 'claude' | 'user'
active           boolean
created_at       timestamptz
```

---

## Final API Structure (7 Serverless Functions)

```
api/
├── health.js          → GET /api/health
├── memory.js          → all /api/memory/* routes
├── projects.js        → GET+POST /api/projects, GET /api/projects/:id
├── project-tree.js    → GET /api/projects/:id/tree
├── project-files.js   → GET+POST+PUT /api/projects/:id/files
├── project-search.js  → GET /api/projects/:id/search
└── tools.js           → GET+POST /api/tools, POST /api/tools/execute/:name
lib/
├── supabase.js
└── gemini.js
vercel.json            → rewrites all routes to flat function files
```

---

## Vercel API Endpoints

### Auth
All endpoints require a header: `Authorization: Bearer <AUTH_TOKEN>`
Auth token stored as Vercel environment variable. Never exposed to client.

### Memory Endpoints

```
GET  /memory/core
     Returns facts with importance = 3
     ~200-300 tokens max

GET  /memory/search?q=<query>
     Vector similarity search
     Returns top 5 most relevant facts

POST /memory/fact
     Body: { category, content, importance }
     Flash Lite tags and generates embedding
     Stores to facts table

POST /memory/checkpoint
     Body: { summary, active_topics, decisions_made, open_threads, next_logical_step }
     Stores conversation checkpoint
     Called by JS heartbeat every 5 exchanges

GET  /memory/checkpoint/latest
     Returns most recent checkpoint
     Loaded at conversation start
```

### Project Endpoints

```
GET  /projects
     Returns all projects (id, name, status, last_modified)
     No file content — metadata only

POST /projects
     Body: { name, description, tech_stack }
     Creates new project record

GET  /projects/:id/tree
     Returns file tree (paths + sizes only, no content)
     Zero tokens when Claude reads this

GET  /projects/:id/files?path=<path>
     Returns latest version content of specific file

POST /projects/:id/files
     Body: { path, filename, extension, content }
     Creates file + first file_version entry
     Generates embedding via Flash Lite

PUT  /projects/:id/files?path=<path>
     Body: { content, changed_by }
     Creates new file_version
     Updates current_version pointer in files table

GET  /projects/:id/search?q=<query>
     Vector search across file_chunks
     Returns top 5 relevant chunks with file paths
```

### Tool Endpoints

```
GET  /tools
     Returns all active tools
     Loaded at conversation start alongside core facts

POST /tools
     Body: { name, description, agent, trigger_hint, prompt_template, endpoint }
     Claude calls this to register a new tool

POST /tools/execute/:name
     Body: { variables: {} }
     Routes to Flash Lite or external API
     Waits for completion
     Returns processed result
```

### System

```
GET  /health
     Returns { status: 'ok', timestamp }
     Skill uses this to verify connection
```

---

## Claude Skill Structure

The skill is a markdown file Claude reads at conversation start. It contains:

1. **Base URL** of the Vercel API
2. **Auth token** (or instruction to use stored secret)
3. **Startup sequence** — what to fetch automatically
4. **Behavioral rules** — when to save facts, when to checkpoint, when to use Flash Lite
5. **Tool usage rules** — how to call and interpret tool results

### Startup Sequence (every conversation)
```
1. GET /health                        → verify connection
2. GET /memory/core                   → load always-on facts
3. GET /memory/checkpoint/latest      → know where we left off
4. GET /tools                         → know available tools
```
Total context footprint: ~400-600 tokens. Negligible.

### Fact-Saving Rules (for Claude)
Save a fact when the user:
- States a preference explicitly
- Mentions an ongoing goal or project
- Makes a decision
- Describes a relationship or person
- Reveals a pattern or habit
- Expresses a value or constraint

Do NOT save: questions, small talk, Claude's own explanations.

### Checkpoint Trigger
Every 5 exchanges, the artifact layer fires:
```javascript
// Client-side JS — no token cost
if (messageCount % 5 === 0) {
  await fetch('/memory/checkpoint', {
    method: 'POST',
    body: JSON.stringify(buildCheckpoint(conversationState))
  });
}
```

---

## Flash Lite Integration

### API Key Rotation
8 keys stored as Vercel environment variables:
`GEMINI_KEY_1` through `GEMINI_KEY_8`

Round-robin rotation per request to avoid rate limits.
Parallel calls use different keys simultaneously.

### When Flash Lite Is Used
| Task | Trigger |
|------|---------|
| Tag + classify incoming fact | POST /memory/fact |
| Generate text embeddings | Any new content stored |
| Summarize checkpoint | POST /memory/checkpoint |
| Execute tool with prompt_template | POST /tools/execute/:name |

### When Flash Lite Is NOT Used
- Writing or modifying files (Claude only)
- Deciding what facts are worth storing (Claude only)
- Any reasoning or judgment (Claude only)
- Designing tool prompt templates (Claude only)

### Flash Lite Prompt Pattern
Always constrained output. Example for fact tagging:
```
You are a classification agent.
Input fact: "{{content}}"
Respond ONLY with valid JSON. No preamble. No explanation.
{
  "category": "preference|goal|decision|context|relationship|pattern",
  "importance": 1|2|3,
  "tags": ["tag1", "tag2"]
}
```

---

## File Retrieval Strategy

Claude follows this order — stops when enough context is found:

```
1. Fetch file tree (paths + sizes only)    → 0 tokens, pure metadata
2. Reason: which files are relevant?       → Claude decides
3. Fetch by exact path if known            → targeted, cheap
4. Semantic search if unsure               → vector search, top 5 chunks
5. Read full file only if necessary        → last resort
```

Never load entire project into context. Never.

---

## Gemini API Model String

```
gemini-3.1-flash-lite-preview
```

Thinking mode: OFF by default. Enable selectively for edge cases only.

---

## Environment Variables (Vercel)

```
SUPABASE_URL
SUPABASE_SERVICE_KEY      ← service role key, never anon key
AUTH_TOKEN                ← secret token Claude uses to call the API
GEMINI_KEY_1 ... _8
```

---

## Build Order (Recommended)

1. Supabase project + enable pgvector + run schema migrations
2. Vercel project + environment variables
3. `/health` endpoint — verify everything connects
4. `/memory/core` + `/memory/fact` — simplest memory loop
5. `/memory/checkpoint` + heartbeat — conversation continuity
6. `/memory/search` — add vector search (requires embeddings working)
7. Skill file — wire Claude to the system
8. `/projects` + `/projects/:id/tree` — project metadata
9. `/projects/:id/files` GET + POST + PUT — file versioning
10. `/tools` GET + POST + `/tools/execute/:name` — tool registry
11. GitHub Pages dashboard — last, purely visual layer

---

## What Gets Built Per Phase Summary

| Phase | Deliverables | Complexity |
|-------|-------------|------------|
| 1 | Supabase schema, Vercel setup, /health | Low |
| 2 | Full memory system + checkpoints + Flash Lite | Medium |
| 3 | Project + file system with versioning | Medium |
| 4 | Tool registry + execution routing | Medium |
| 5 | GitHub Pages dashboard | Low-Medium |

Each phase is independently functional. Each one makes the system meaningfully more capable.
