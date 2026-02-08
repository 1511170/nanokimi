---
name: deploy
description: Deploy NanoKimi on a VPS (Phase 2). Run as the app user after the admin has run scripts/setup-vps.sh. Sets up Docker Rootless, builds containers, configures systemd, and starts the service. Triggers on "deploy", "vps setup", "install on server".
---

# NanoKimi VPS Deploy (Phase 2)

Run all commands automatically. Only pause when user action is required (scanning QR codes, providing tokens).

**Prerequisites:** The admin must have already run `scripts/setup-vps.sh` to create the user and install system packages.

**UX Note:** When asking the user questions, prefer using the `AskUserQuestion` tool instead of just outputting text.

## 0. Auto-Detect Environment

Detect the current user and container UID before starting:

```bash
echo "User: $(whoami)"
echo "Home: $HOME"
echo "Node: $(which node)"
echo "Docker: $(which docker 2>/dev/null || echo 'not found')"

# Check for common permission issues
if [ -d "$HOME/.local" ] && [ "$(stat -c '%U' "$HOME/.local" 2>/dev/null)" != "$(whoami)" ]; then
  echo "WARNING: $HOME/.local is owned by $(stat -c '%U' "$HOME/.local"), not $(whoami)"
  echo "This may cause issues with kimi-cli installation. Fix with:"
  echo "  sudo chown -R $(whoami):$(whoami) $HOME/.local"
fi

# Check subuid allocation
SUBUID_LINE=$(grep "^$(whoami):" /etc/subuid | head -1)
if [ -n "$SUBUID_LINE" ]; then
  SUBUID_BASE=$(echo "$SUBUID_LINE" | cut -d: -f2)
  CONTAINER_UID=$((SUBUID_BASE + 999))
  echo "Subuid base: $SUBUID_BASE"
  echo "Container UID (node user): $CONTAINER_UID"
else
  echo "WARNING: No subuid entry found. Was setup-vps.sh run?"
fi
```

Store `CONTAINER_UID` — you'll need it for ACLs in step 5.

## 1. Verify Docker Rootless

Docker Rootless requires `DOCKER_HOST` to point to the user's rootless socket.

```bash
export DOCKER_HOST="unix://${XDG_RUNTIME_DIR}/docker.sock"
echo "DOCKER_HOST=$DOCKER_HOST"
docker info --format '{{.SecurityOptions}}' 2>&1 && echo "Docker Rootless OK" || echo "Docker Rootless NOT running"
```

If Docker Rootless is not running, try starting it:

```bash
systemctl --user start docker
export DOCKER_HOST="unix://${XDG_RUNTIME_DIR}/docker.sock"
docker info --format '{{.SecurityOptions}}'
```

If it still fails, tell the user:
> Docker Rootless is not running. The admin may need to re-run `scripts/setup-vps.sh` or check the Docker Rootless setup.

## 2. Install Dependencies

```bash
npm install
```

## 3. Configure Kimi Authentication

**Reuse the same flow from `/setup` Section 3.**

Ask the user:
> Do you want to use your **Kimi Code subscription** (Pro/Max) or a **Moonshot API key**?

### Option 1: Kimi Code Subscription (Recommended)

Tell the user:
> Open another terminal window and run:
> ```
> kimi setup-token
> ```
> A browser window will open for you to log in. Once authenticated, the token will be displayed in your terminal. Either:
> 1. Paste it here and I'll add it to `.env` for you, or
> 2. Add it to `.env` yourself as `MOONSHOT_API_KEY=<your-token>`

**IMPORTANT:** OAuth tokens often contain special characters like `#`. Always wrap the value in single quotes:

```bash
echo "MOONSHOT_API_KEY='<token>'" > .env
```

### Option 2: API Key

```bash
echo "MOONSHOT_API_KEY='<key>'" > .env
```

Verify:
```bash
[ -f .env ] && echo ".env exists" || echo ".env MISSING"
```

## 4. Build Container Image

```bash
./container/build.sh
```

Verify:
```bash
echo '{}' | docker run -i --rm --entrypoint /bin/echo nanokimi-agent:latest "Container OK"
```

## 5. Set Up ACLs on Data Directories

The container runs as uid 1000 inside Docker Rootless, which maps to the container UID on the host. Use ACLs to grant write access.

Use the `CONTAINER_UID` detected in step 0:

```bash
# Create directories if they don't exist
mkdir -p groups data store data/env data/ipc data/sessions logs

# Set ACLs for container UID (detected in step 0)
for dir in groups data store; do
  setfacl -R -m u:CONTAINER_UID:rwx "$dir"
  setfacl -R -d -m u:CONTAINER_UID:rwx "$dir"
done

echo "ACLs set for container UID CONTAINER_UID"
```

Replace `CONTAINER_UID` with the actual value from step 0.

Verify:
```bash
getfacl groups | head -10
```

## 6. WhatsApp Authentication

**Reuse the same flow from `/setup` Section 5.**

**USER ACTION REQUIRED**

Tell the user:
> A QR code will appear below. On your phone:
> 1. Open WhatsApp
> 2. Tap **Settings → Linked Devices → Link a Device**
> 3. Scan the QR code

First build:
```bash
npm run build
```

Then run with a long Bash tool timeout (120000ms):
```bash
npm run auth
```

Wait for "Successfully authenticated" or "Already authenticated".

## 7. Configure Assistant Name and Main Channel

**Reuse the same flow from `/setup` Sections 6a–6d.**

Follow the exact same steps:
- 6a: Ask for trigger word
- 6b: Explain security model, ask about main channel type
- 6c: Register the main channel (run app briefly to sync groups, then query DB or use phone number)
- 6d: Write configuration to `data/registered_groups.json`

**Important:** When running the app briefly to sync groups, include the DOCKER_HOST env var:

```bash
DOCKER_HOST="unix://${XDG_RUNTIME_DIR}/docker.sock" npm run dev
```

(Set Bash tool timeout to 15000ms — the process will be killed when timeout fires, which is expected.)

## 8. Configure External Directory Access

**Reuse the same flow from `/setup` Section 7.**

Follow the exact same steps for mount allowlist configuration.

## 9. Create systemd --user Service

Auto-detect paths and create the service file:

```bash
NODE_PATH=$(which node)
PROJECT_PATH=$(pwd)

mkdir -p ~/.config/systemd/user

cat > ~/.config/systemd/user/nanokimi.service << EOF
[Unit]
Description=NanoKimi WhatsApp Assistant
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${PROJECT_PATH}
ExecStart=${NODE_PATH} ${PROJECT_PATH}/dist/index.js
Restart=always
RestartSec=10

# Docker Rootless requires this
Environment=DOCKER_HOST=unix://%t/docker.sock
Environment=PATH=/usr/local/bin:/usr/bin:/bin:${HOME}/.local/bin
Environment=HOME=${HOME}

# Logging
StandardOutput=append:${PROJECT_PATH}/logs/nanokimi.log
StandardError=append:${PROJECT_PATH}/logs/nanokimi.error.log

[Install]
WantedBy=default.target
EOF

echo "Service file created at ~/.config/systemd/user/nanokimi.service"
echo "  Node: ${NODE_PATH}"
echo "  Project: ${PROJECT_PATH}"
echo "  DOCKER_HOST: unix://%t/docker.sock"
```

Enable and start:
```bash
systemctl --user daemon-reload
systemctl --user enable --now nanokimi
```

Verify:
```bash
systemctl --user status nanokimi --no-pager
```

## 10. Test

Tell the user (using the assistant name they configured):
> Send `@ASSISTANT_NAME hello` in your registered chat.
>
> **Tip:** In your main channel (if configured as personal chat), you don't need the `@` prefix — just send `hello`.

Check the logs:
```bash
tail -20 logs/nanokimi.log
```

The user should receive a response in WhatsApp.

## Troubleshooting

**Service not starting:**
```bash
systemctl --user status nanokimi --no-pager
journalctl --user -u nanokimi --no-pager -n 50
cat logs/nanokimi.error.log
```

**Docker permission errors:**
```bash
export DOCKER_HOST="unix://${XDG_RUNTIME_DIR}/docker.sock"
docker info
```

If Docker Rootless isn't running:
```bash
systemctl --user start docker
systemctl --user status docker
```

**Container can't write to mounted directories:**
```bash
# Re-check ACLs
SUBUID_BASE=$(grep "^$(whoami):" /etc/subuid | cut -d: -f2)
CONTAINER_UID=$((SUBUID_BASE + 999))
getfacl groups
# Re-apply if needed
for dir in groups data store; do
  setfacl -R -m u:$CONTAINER_UID:rwx "$dir"
  setfacl -R -d -m u:$CONTAINER_UID:rwx "$dir"
done
```

**WhatsApp disconnected:**
```bash
systemctl --user stop nanokimi
npm run auth
systemctl --user start nanokimi
```

**Restart service:**
```bash
systemctl --user restart nanokimi
```

**View live logs:**
```bash
tail -f logs/nanokimi.log
```
