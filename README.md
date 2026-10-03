# Malang

Self-hosted character AI chat monorepo built with Bun and React. Malang supports RisuAI
character cards and prompt presets with Vertex AI Gemini and Ollama providers.

## Workspaces

- `server`: Hono API, SQLite/Drizzle persistence, prompt compiler, and provider adapters
- `shared`: Zod API contracts and shared TypeScript types
- `web`: frontend workspace (not served by the backend)

The character workspace includes a dual sidebar, searchable card archive, full profile,
greeting, lorebook and prompt editing, preserved CHARX asset inspection, card export, chat
settings, prompt previews, message editing and durable generation history. PocketRisu character
package ZIPs can be imported and exported with their character card, chats, personas, chat folders
and inlay assets intact.

## Server-side prompts and modules

The prompt workbench edits ordered Risu-style prompt blocks and imports or exports JSON and
encrypted `.risupreset` files. Prompt modules are persisted independently and support prompt
injection positions, PocketRisu custom toggles (boolean, select, text, textarea, groups and
layout rows), keyword/constant lorebook entries, a unique namespace, and a server-wide default
state. Each conversation can override module activation, while the
active prompt preset, persona, and prompt toggle values are persisted globally and shared across
conversations.

## HypaMemory V3 long-term memory

Each conversation can enable PocketRisu-style HypaMemory V3 from its chat settings. When the
compiled prompt begins trimming old messages, Malang asks the conversation's auxiliary model to
summarize the oldest safe batch and stores that summary in SQLite. Later generations reserve a
configurable part of the context for important, recent, similar, and deterministic-random memory;
the similarity slot uses a local Unicode character n-gram vector so Korean and other languages do
not require a separate embedding API. Stored summaries can be marked important or deleted from the
same panel. If no auxiliary model is bound, the primary model is used as the existing model-binding
fallback.

Modules can be exchanged as native JSON, legacy `.risum`, or modern Risu-compatible CHARX.
During generation the backend resolves active modules, scans their lorebooks, renders safe
variables and conditions, inserts module prompts, trims chat history, and sends only the final
compiled messages to Vertex or Ollama. Regex replacements and module background CSS are applied
in the chat runtime. Background CSS is scoped to the chat surface; executable scripts, triggers,
low-level access, MCP configuration, and other background HTML remain inert.

Install all workspace dependencies from the repository root:

```bash
bun install
```

Run the backend and frontend together in development:

```bash
bun run dev
```

The frontend is available at `http://localhost:5173`. To run only one app, use:

```bash
bun run dev:server
bun run dev:web
```

For a production-style self-hosted stack, `docker compose up --build -d` exposes the
frontend at `http://localhost:8080`. The web container proxies API and SSE traffic to the
separate Hono backend container.

Vertex supports a Google Cloud service-account JSON file, an Express API key, or ADC.
Uploaded JSON credentials and API keys are never returned by the API: they are encrypted
at rest with AES-256-GCM using a key derived from the administrator password, and are
re-encrypted when that password changes.

## Database snapshots

Open **Settings → 시스템 → 스냅샷** to create, browse, restore, download, or delete server-side
**database-only** snapshots. Restoring first creates a `before-restore` safety snapshot, swaps
the live database without requiring a server restart, and reloads the app. Restore is blocked
while a response is being generated.

Automatic snapshots are enabled by default. The server saves one at startup and checks for
changes every five minutes, retaining up to 20 automatic snapshots / 500 MB. The newest
automatic snapshot is always retained even if it exceeds 500 MB. Manual and restore-safety
snapshots are kept until you delete them. Unchanged databases are skipped.

Disable them in **Settings → 시스템 → 스냅샷 → 자동 스냅샷**, or set `AUTO_BACKUP_ENABLED=false`
and restart the server. The environment opt-out takes precedence over the saved setting.
Disabling backups does not delete existing snapshots. Docker Compose supports this variable too.

Snapshots include chats, character records, settings, and encrypted credentials, but **not
image/media files in `DATA_DIR/assets`**. Keep a separate copy of assets and an off-device
backup for disaster recovery. Protect snapshots as sensitive data.

Keep assets at their original path; asset records contain absolute paths. Credentials require
the administrator password that was active at the time of the snapshot, so restoring an older
snapshot may return you to the login screen.

## System diagnostics

**Settings → 시스템** also contains persistent system logs, provider request logs, and usage
statistics. System logs retain the newest 5,000 entries in `DATA_DIR/system-logs.sqlite`; known
credentials, prompt fields, and request bodies are masked before storage. Routine completion
events are emitted at debug level. Request metadata and usage totals come from generation history.
The latest 100 detailed provider requests retain their URL, redacted headers, and body; bodies can
include private conversation content. Clearing the request-log view does not erase usage totals.

## Code quality

All workspaces share [`.oxfmtrc.json`](./.oxfmtrc.json) and
[`.oxlintrc.json`](./.oxlintrc.json) from the repository root. The formatter
settings mirror `../nai-factory/biome.json`: four-space indentation, 100-column lines,
single quotes, semicolons as needed, trailing commas, parenthesized arrow parameters, and
sorted imports.

```bash
bun run dev            # run the server and web app concurrently
bun run kill           # stop processes listening on ports 3000 and 5173
bun run kill:port 8080 # stop the process listening on an arbitrary port
bun run format         # format the repository
bun run format:check   # verify formatting without writes
bun run lint           # correctness and type-aware oxlint checks
bun run lint:fix       # apply safe lint fixes
bun run typecheck      # run tsc --noEmit in every workspace
bun run build          # build the Hono server and React frontend
bun run check          # formatting + lint + typecheck concurrently
bun run test           # run all workspace tests concurrently
```

`fmt` and `fmt:check` remain as aliases for `format` and `format:check`. The same quality
commands can be run inside `server`, `shared`, or `web`; Oxfmt and Oxlint discover the root
configuration automatically, so the workspaces cannot drift to separate settings.

CHARX imports enforce the total expanded archive limit and compression-ratio checks. The
per-asset limit defaults to `MAX_IMPORT_BYTES`; set `MAX_ASSET_BYTES` explicitly only when a
stricter individual-file cap is desired.
