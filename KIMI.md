# NanoKimi

Personal Kimi assistant. See [README.md](README.md) for philosophy and setup. See [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) for architecture decisions.

## Quick Context

Single Node.js process that connects to WhatsApp, routes messages to Kimi Agent SDK running in Docker containers. Each group has isolated filesystem and memory. Runs on macOS (Docker Desktop + launchd) or Linux VPS (Docker Rootless + systemd).

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Main app: WhatsApp connection, message routing, IPC |
| `src/config.ts` | Trigger pattern, paths, intervals |
| `src/container-runner.ts` | Spawns agent containers with mounts |
| `src/task-scheduler.ts` | Runs scheduled tasks |
| `src/db.ts` | SQLite operations |
| `groups/{name}/KIMI.md` | Per-group memory (isolated) |
| `container/skills/agent-browser.md` | Browser automation tool (available to all agents via Bash) |

## Skills

| Skill | When to Use |
|-------|-------------|
| `/setup` | First-time installation on macOS |
| `/deploy` | Deploy on Linux VPS (after admin runs `scripts/setup-vps.sh`) |
| `/customize` | Adding channels, integrations, changing behavior |
| `/debug` | Container issues, logs, troubleshooting |

## Development

Run commands directly—don't tell the user to run them.

```bash
npm run dev          # Run with hot reload
npm run build        # Compile TypeScript
./container/build.sh # Rebuild agent container
```

Service management (macOS):
```bash
launchctl load ~/Library/LaunchAgents/com.nanokimi.plist
launchctl unload ~/Library/LaunchAgents/com.nanokimi.plist
```

Service management (Linux):
```bash
systemctl --user start nanokimi
systemctl --user stop nanokimi
systemctl --user restart nanokimi
```
