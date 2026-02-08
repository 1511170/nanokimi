# VPS Deployment Guide

Deploy NanoClaw on a fresh Ubuntu VPS using a two-phase approach.

## Overview

| Phase | Who | What | How |
|-------|-----|------|-----|
| **1. Admin** | sudo user (e.g. `kinto`) | Create app user, install packages, Docker Rootless | `sudo bash scripts/setup-vps.sh` |
| **2. App User** | app user (e.g. `kintoai`) | Clone repo, configure, build, start service | `npx claude` → `/deploy` |

## Architecture

```
VPS (Ubuntu)
├── kinto (admin, sudo)           # Manages system, runs Phase 1
├── kintoai (app user, no sudo)   # Runs NanoClaw + Docker Rootless
│   ├── ~/nanoclaw/               # Project directory
│   ├── Docker Rootless daemon    # Per-user, no root required
│   └── systemd --user service    # Auto-starts on boot (linger)
└── sofia (optional)              # Another user running OpenClaw
```

Each app user is fully isolated: `chmod 700` home directory, own Docker daemon, own systemd services.

## Docker Rootless & UID Mapping

Docker Rootless remaps UIDs using `/etc/subuid`. The container's `node` user (uid 1000) maps to `subuid_base + 999` on the host.

```
Container uid 1000 (node)  →  Host uid 200999 (if subuid base = 200000)
```

This means files owned by the app user (e.g. uid 995) are **not** writable by the container. ACLs solve this:

```bash
SUBUID_BASE=$(grep "^$(whoami):" /etc/subuid | cut -d: -f2)
CONTAINER_UID=$((SUBUID_BASE + 999))
setfacl -R -m u:$CONTAINER_UID:rwx groups data store
setfacl -R -d -m u:$CONTAINER_UID:rwx groups data store  # default ACLs for new files
```

## Lessons Learned

### OAuth Tokens with Special Characters
Tokens containing `#` get truncated by `export $(cat file | xargs)`. Fix: wrap values in single quotes in `.env` and use `set -a; . file; set +a` in the container entrypoint.

### systemd Needs DOCKER_HOST
Docker Rootless doesn't use the default `/var/run/docker.sock`. The systemd service must set:
```
Environment=DOCKER_HOST=unix://%t/docker.sock
```
(`%t` expands to `$XDG_RUNTIME_DIR`, e.g. `/run/user/995`.)

### ACLs vs chmod
`chmod -R o+rwx` works but is overly permissive. ACLs (`setfacl`) grant access to the specific container UID only, which is cleaner for multi-user setups.

### linger Required for Boot Persistence
Without `loginctl enable-linger <user>`, systemd `--user` services stop when the user logs out and don't start on boot.

## Quick Reference

| Task | Command |
|------|---------|
| Phase 1 (admin) | `sudo bash scripts/setup-vps.sh` |
| Phase 2 (app user) | `npx claude` → `/deploy` |
| View logs | `tail -f ~/nanoclaw/logs/nanoclaw.log` |
| Restart service | `systemctl --user restart nanoclaw` |
| Check status | `systemctl --user status nanoclaw` |
| Re-auth WhatsApp | `systemctl --user stop nanoclaw && npm run auth && systemctl --user start nanoclaw` |
| Rebuild container | `./container/build.sh` |
| Detect container UID | `echo $(($(grep "^$(whoami):" /etc/subuid | cut -d: -f2) + 999))` |

## Files

- [`scripts/setup-vps.sh`](../scripts/setup-vps.sh) — Admin bootstrap (Phase 1)
- [`.claude/skills/deploy/SKILL.md`](../.claude/skills/deploy/SKILL.md) — Claude Code skill (Phase 2)
