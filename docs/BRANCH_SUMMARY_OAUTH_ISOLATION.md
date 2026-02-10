# Branch Summary: fix/isolated-oauth-token

## Purpose

This branch improves the security of OAuth token handling by isolating the OAuth token from other credentials. Previously, the container had write access to the entire `data/credentials/` directory, which could potentially expose other sensitive files.

## Changes Made

### 1. Code Changes (`src/container-runner.ts`)

**Before:**
- Mounted entire `data/credentials/` directory as writable
- Container could read/write all files in credentials/
- Sessions mounted to `/home/node/.kimi` (conflicted with config/credentials)

**After:**
- Mount `config.toml` as **read-only** file
- Mount `oauth-token/` directory (containing only `kimi-code.json`) as writable
- Mount sessions to `/home/node/.kimi/sessions/` (avoids conflicts)

### 2. Documentation (`docs/OAUTH_TOKEN_ISOLATION.md`)

Comprehensive documentation including:
- Problem statement
- Solution architecture
- Security benefits
- Setup instructions for new deployments
- Migration guide for existing deployments
- Troubleshooting section

### 3. Setup Script (`scripts/setup-oauth-isolation.sh`)

Automated setup script that:
- Creates the `oauth-token/` directory
- Copies the OAuth token from credentials/
- Sets proper ACLs for Docker Rootless compatibility
- Verifies the setup

## Security Benefits

| Aspect | Before | After |
|--------|--------|-------|
| Container can read | All credentials | Only OAuth token |
| Container can write | All credentials | Only OAuth token |
| Config protection | Writable | Read-only |
| Principle | Full access | Least privilege |

## Migration Guide

### For Existing Users (from fix/oauth-docker-mounts)

1. Switch to this branch:
   ```bash
   git checkout fix/isolated-oauth-token
   ```

2. Run the setup script:
   ```bash
   ./scripts/setup-oauth-isolation.sh
   ```

3. Restart the service:
   ```bash
   systemctl --user restart nanokimi
   ```

4. Test by sending a message to Kai

### For New Users

1. Set up credentials as usual
2. Run: `./scripts/setup-oauth-isolation.sh`
3. The script will create the isolated directory structure

## Testing

Verify the changes work:

```bash
# Check that Kai responds
# Check logs
tail -f ~/nanokimi/logs/nanokimi.log

# Verify mounts are working
# The token should refresh automatically when needed
```

## Files Changed

```
src/container-runner.ts         | 27 ++++++++-  (security improvement)
docs/OAUTH_TOKEN_ISOLATION.md   | 129 ++++++++++++++++++++++++++++++++  (new documentation)
scripts/setup-oauth-isolation.sh | 82 ++++++++++++++++++++++++  (new script)
3 files changed, 236 insertions(+), 2 deletions(-)
```

## Comparison with Previous Branch

| Feature | fix/oauth-docker-mounts | fix/isolated-oauth-token |
|---------|-------------------------|--------------------------|
| OAuth support | ✅ | ✅ |
| Token refresh | ✅ | ✅ |
| Config read-only | ❌ | ✅ |
| Credential isolation | ❌ | ✅ |
| Documentation | Basic | Comprehensive |
| Setup script | ❌ | ✅ |

## Recommendation

This branch should be merged after `fix/oauth-docker-mounts` as it builds upon the OAuth functionality while improving security. It maintains full compatibility while adding proper credential isolation.

## Related

- Previous branch: `fix/oauth-docker-mounts`
- Issue addressed: OAuth token refresh requiring write access vs. credential security
