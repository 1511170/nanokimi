# OAuth Token Isolation Security Improvement

## Problem

Previously, the container had access to the entire `data/credentials/` directory with write permissions. This meant the container could:
- Read all credentials in that folder
- Potentially modify any file in the directory
- Access sensitive configuration beyond just the OAuth token

## Solution

We now isolate the OAuth token in a separate directory and mount only what's needed:

### Directory Structure

```
data/
├── credentials/          # Host-only: Contains config.toml and backup tokens
│   ├── config.toml       # OAuth configuration (read-only in container)
│   └── kimi-code.json    # Backup token (not mounted in container)
├── oauth-token/          # Mounted to container (writable)
│   └── kimi-code.json    # Only the active OAuth token
└── sessions/             # Per-group session directories
```

### Container Mounts

| Host Path | Container Path | Permissions | Purpose |
|-----------|---------------|-------------|---------|
| `data/credentials/config.toml` | `/home/node/.kimi/config.toml` | Read-only | OAuth configuration |
| `data/oauth-token/` | `/home/node/.kimi/credentials` | Read-write | OAuth token only |
| `data/sessions/{group}/.kimi/` | `/home/node/.kimi/sessions` | Read-write | Session data |

### Security Benefits

1. **Principle of Least Privilege**: Container can only access the OAuth token, not other credentials
2. **Read-only Config**: Configuration cannot be modified by the container
3. **Token Refresh Works**: OAuth token can still be refreshed (writable)
4. **Isolation**: Other credentials in `data/credentials/` remain inaccessible

## Setup Instructions

### For New Deployments

1. Create the OAuth token directory:
   ```bash
   mkdir -p data/oauth-token
   ```

2. Copy your OAuth token:
   ```bash
   cp data/credentials/kimi-code.json data/oauth-token/
   ```

3. Set permissions for Docker Rootless:
   ```bash
   # Grant container user access (UID 200999 for Docker Rootless)
   setfacl -m u:200999:rw data/oauth-token/kimi-code.json
   setfacl -m u:300999:rw data/oauth-token/kimi-code.json
   ```

4. Ensure config.toml exists in `data/credentials/`:
   ```toml
   default_model = "kimi-code"
   default_thinking = false
   default_yolo = true

   [models.kimi-code]
   provider = "managed:kimi-code"
   model = "kimi-latest"
   max_context_size = 200000
   capabilities = ["thinking"]

   [providers."managed:kimi-code"]
   type = "kimi"
   base_url = "https://api.kimi.com/coding/v1"
   api_key = ""
   oauth = { storage = "file", key = "oauth/kimi-code" }
   ```

### For Existing Deployments (Migration)

If you're currently using the `fix/oauth-docker-mounts` branch with full credentials access:

1. Create the isolated directory:
   ```bash
   mkdir -p data/oauth-token
   cp data/credentials/kimi-code.json data/oauth-token/
   ```

2. Update ACLs:
   ```bash
   setfacl -m u:200999:rw data/oauth-token/kimi-code.json
   setfacl -m u:300999:rw data/oauth-token/kimi-code.json
   ```

3. Restart the service:
   ```bash
   systemctl --user restart nanokimi
   ```

## Verification

Test that Kai still responds correctly:
1. Send a message to your WhatsApp bot
2. Check that it responds
3. Check logs: `tail -f ~/nanokimi/logs/nanokimi.log`

The token should refresh automatically when needed.

## Troubleshooting

### "Cannot read OAuth token" errors
- Ensure `data/oauth-token/kimi-code.json` exists
- Check file permissions: `getfacl data/oauth-token/kimi-code.json`
- Verify ACLs for container user (UID 200999 or 300999)

### "Read-only file system" errors
- Ensure config.toml is mounted read-only (intentional)
- Ensure oauth-token/ is writable by container user

### Token not refreshing
- Check that the mount point is correct: `/home/node/.kimi/credentials`
- Verify the token file is writable: `touch data/oauth-token/kimi-code.json`

## Related

- Previous implementation: `fix/oauth-docker-mounts` branch
- Original issue: OAuth token refresh requiring write access to credentials
