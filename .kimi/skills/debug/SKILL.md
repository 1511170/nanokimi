---
name: debug
description: Debug container agent issues. Use when things aren't working, container fails, authentication problems, or to understand how the container system works. Covers logs, environment variables, mounts, and common issues.
---

# NanoKimi Container Debugging

This guide covers debugging the containerized agent execution system.

## Architecture Overview

```
Host (macOS)                          Container (Linux VM)
─────────────────────────────────────────────────────────────
src/container-runner.ts               container/agent-runner/
    │                                      │
    │ spawns Docker container                │ runs Kimi Agent SDK
    │ with volume mounts                   │ with MCP servers
    │                                      │
    ├── data/env/env ──────────────> /workspace/env-dir/env
    ├── groups/{folder} ───────────> /workspace/group
    ├── data/ipc/{folder} ────────> /workspace/ipc
    ├── data/sessions/{folder}/.kimi/ ────> /home/node/.kimi/ (isolated per-group)
    └── (main only) project root ──> /workspace/project
```

**Important:** The container runs as user `node` with `HOME=/home/node`. Session files must be mounted to `/home/node/.kimi/` (not `/root/.kimi/`) for session resumption to work.

## Log Locations

| Log | Location | Content |
|-----|----------|---------|
| **Main app logs** | `logs/nanokimi.log` | Host-side WhatsApp, routing, container spawning |
| **Main app errors** | `logs/nanokimi.error.log` | Host-side errors |
| **Container run logs** | `groups/{folder}/logs/container-*.log` | Per-run: input, mounts, stderr, stdout |
| **Kimi sessions** | `~/.kimi/projects/` | Kimi Code session history |

## Enabling Debug Logging

Set `LOG_LEVEL=debug` for verbose output:

```bash
# For development
LOG_LEVEL=debug npm run dev

# For launchd service, add to plist EnvironmentVariables:
<key>LOG_LEVEL</key>
<string>debug</string>
```

Debug level shows:
- Full mount configurations
- Container command arguments
- Real-time container stderr

## Common Issues

### 1. "Kimi Code process exited with code 1"

**Check the container log file** in `groups/{folder}/logs/container-*.log`

Common causes:

#### Missing Authentication
```
Invalid API key · Please run kimi login
```
**Fix:** Ensure `.env` file exists with API key:
```bash
cat .env  # Should show:
# MOONSHOT_API_KEY=sk-...  (API key from https://platform.moonshot.cn/)
```

#### Root User Restriction
```
Container cannot run as root
```
**Fix:** Container must run as non-root user. Check Dockerfile has `USER node`.

### 2. Environment Variables Not Passing

**Workaround:** The system extracts only authentication variable (`MOONSHOT_API_KEY`) from `.env` and mounts it for sourcing inside the container. Other env vars are not exposed.

To verify env vars are reaching the container:
```bash
echo '{}' | docker run -i \
  -v $(pwd)/data/env:/workspace/env-dir:ro \
  --entrypoint /bin/bash nanokimi-agent:latest \
  -c 'export $(cat /workspace/env-dir/env | xargs); echo "API Key: ${#MOONSHOT_API_KEY} chars"'
```

### 3. Mount Issues

**Docker mount syntax:**
- Use `-v` for both files and directories
- Add `:ro` suffix for read-only mounts:
  ```bash
  # Readonly
  -v /path:/container/path:ro

  # Read-write
  -v /path:/container/path
  ```

To check what's mounted inside a container:
```bash
docker run --rm --entrypoint /bin/bash nanokimi-agent:latest -c 'ls -la /workspace/'
```

Expected structure:
```
/workspace/
├── env-dir/env           # Environment file (MOONSHOT_API_KEY)
├── group/                # Current group folder (cwd)
├── project/              # Project root (main channel only)
├── global/               # Global KIMI.md (non-main only)
├── ipc/                  # Inter-process communication
│   ├── messages/         # Outgoing WhatsApp messages
│   ├── tasks/            # Scheduled task commands
│   ├── current_tasks.json    # Read-only: scheduled tasks visible to this group
│   └── available_groups.json # Read-only: WhatsApp groups for activation (main only)
└── extra/                # Additional custom mounts
```

### 4. Permission Issues

The container runs as user `node` (uid 1000). Check ownership:
```bash
container run --rm --entrypoint /bin/bash nanoclaw-agent:latest -c '
  whoami
  ls -la /workspace/
  ls -la /app/
'
```

All of `/workspace/` and `/app/` should be owned by `node`.

### 5. Session Not Resuming / "Kimi Code process exited with code 1"

If sessions aren't being resumed (new session ID every time), or Kimi Code exits with code 1 when resuming:

**Root cause:** The SDK looks for sessions at `$HOME/.kimi/sessions/`. Inside the container, `HOME=/home/node`, so it looks at `/home/node/.kimi/sessions/`.

**Check the mount path:**
```bash
# In container-runner.ts, verify mount is to /home/node/.kimi/, NOT /root/.kimi/
grep -A3 "Kimi sessions" src/container-runner.ts
```

**Verify sessions are accessible:**
```bash
docker run --rm --entrypoint /bin/bash \
  -v ~/.kimi:/home/node/.kimi \
  nanokimi-agent:latest -c '
echo "HOME=$HOME"
ls -la $HOME/.kimi/sessions/ 2>&1 | head -5
'
```

**Fix:** Ensure `container-runner.ts` mounts to `/home/node/.kimi/`:
```typescript
mounts.push({
  hostPath: kimiDir,
  containerPath: '/home/node/.kimi',  // NOT /root/.kimi
  readonly: false
});
```

### 6. MCP Server Failures

If an MCP server fails to start, the agent may exit. Check the container logs for MCP initialization errors.

## Manual Container Testing

### Test the full agent flow:
```bash
# Set up env file
mkdir -p data/env groups/test
cp .env data/env/env

# Run test query
echo '{"prompt":"What is 2+2?","groupFolder":"test","chatJid":"test@g.us","isMain":false}' | \
  docker run -i \
  -v $(pwd)/data/env:/workspace/env-dir:ro \
  -v $(pwd)/groups/test:/workspace/group \
  -v $(pwd)/data/ipc:/workspace/ipc \
  nanokimi-agent:latest
```

### Test Kimi CLI directly:
```bash
docker run --rm --entrypoint /bin/bash \
  -v $(pwd)/data/env:/workspace/env-dir:ro \
  nanokimi-agent:latest -c '
  export $(cat /workspace/env-dir/env | xargs)
  kimi -p "Say hello"
'
```

### Interactive shell in container:
```bash
docker run --rm -it --entrypoint /bin/bash nanokimi-agent:latest
```

## SDK Options Reference

The agent-runner uses these Kimi Agent SDK options:

```typescript
const session = createSession({
  workDir: '/workspace/group',
  sessionId: input.sessionId,
  model: 'kimi-latest',
  yoloMode: true,  // Auto-approve tool calls
  thinking: false,
});

const turn = session.prompt(input.prompt);

for await (const event of turn) {
  // Handle events
}
```

**Important:** `yoloMode: true` enables auto-approval of tool calls, similar to `bypassPermissions` in Claude SDK.

## Rebuilding After Changes

```bash
# Rebuild main app
npm run build

# Rebuild container (use --no-cache for clean rebuild)
./container/build.sh

# Or force full rebuild
docker builder prune -af
./container/build.sh
```

## Checking Container Image

```bash
# List images
docker images

# Check what's in the image
docker run --rm --entrypoint /bin/bash nanokimi-agent:latest -c '
  echo "=== Node version ==="
  node --version

  echo "=== Kimi CLI version ==="
  kimi --version

  echo "=== Installed packages ==="
  ls /app/node_modules/
'
```

## Session Persistence

Kimi sessions are stored per-group in `data/sessions/{group}/.kimi/` for security isolation. Each group has its own session directory, preventing cross-group access to conversation history.

**Critical:** The mount path must match the container user's HOME directory:
- Container user: `node`
- Container HOME: `/home/node`
- Mount target: `/home/node/.kimi/` (NOT `/root/.kimi/`)

To clear sessions:

```bash
# Clear all sessions for all groups
rm -rf data/sessions/

# Clear sessions for a specific group
rm -rf data/sessions/{groupFolder}/.kimi/

# Also clear the session ID from NanoKimi's tracking
echo '{}' > data/sessions.json
```

To verify session resumption is working, check the logs for the same session ID across messages:
```bash
grep "Session initialized" logs/nanokimi.log | tail -5
# Should show the SAME session ID for consecutive messages in the same group
```

## IPC Debugging

The container communicates back to the host via files in `/workspace/ipc/`:

```bash
# Check pending messages
ls -la data/ipc/messages/

# Check pending task operations
ls -la data/ipc/tasks/

# Read a specific IPC file
cat data/ipc/messages/*.json

# Check available groups (main channel only)
cat data/ipc/main/available_groups.json

# Check current tasks snapshot
cat data/ipc/{groupFolder}/current_tasks.json
```

**IPC file types:**
- `messages/*.json` - Agent writes: outgoing WhatsApp messages
- `tasks/*.json` - Agent writes: task operations (schedule, pause, resume, cancel, refresh_groups)
- `current_tasks.json` - Host writes: read-only snapshot of scheduled tasks
- `available_groups.json` - Host writes: read-only list of WhatsApp groups (main only)

## Quick Diagnostic Script

Run this to check common issues:

```bash
echo "=== Checking NanoKimi Container Setup ==="

echo -e "\n1. Authentication configured?"
[ -f .env ] && grep -q "MOONSHOT_API_KEY=sk-" .env && echo "OK" || echo "MISSING - add MOONSHOT_API_KEY to .env"

echo -e "\n2. Env file copied for container?"
[ -f data/env/env ] && echo "OK" || echo "MISSING - will be created on first run"

echo -e "\n3. Docker daemon running?"
docker info &>/dev/null && echo "OK" || echo "NOT RUNNING - start Docker"

echo -e "\n4. Container image exists?"
echo '{}' | docker run -i --entrypoint /bin/echo nanokimi-agent:latest "OK" 2>/dev/null || echo "MISSING - run ./container/build.sh"

echo -e "\n5. Session mount path correct?"
grep -q "/home/node/.kimi" src/container-runner.ts 2>/dev/null && echo "OK" || echo "WRONG - should mount to /home/node/.kimi/, not /root/.kimi/"

echo -e "\n6. Groups directory?"
ls -la groups/ 2>/dev/null || echo "MISSING - run setup"

echo -e "\n7. Recent container logs?"
ls -t groups/*/logs/container-*.log 2>/dev/null | head -3 || echo "No container logs yet"

echo -e "\n8. Session continuity working?"
SESSIONS=$(grep "Session initialized" logs/nanokimi.log 2>/dev/null | tail -5 | awk '{print $NF}' | sort -u | wc -l)
[ "$SESSIONS" -le 2 ] && echo "OK (recent sessions reusing IDs)" || echo "CHECK - multiple different session IDs, may indicate resumption issues"
```
