# Python 3.12 Upgrade for Docker Image

## Problem

The original Dockerfile used `node:22-slim` as the base image, which includes Python 3.11. However, `kimi-cli` requires Python >= 3.12, causing the Docker build to fail with:

```
ERROR: Could not find a version that satisfies the requirement kimi-cli
Requires-Python >=3.12
```

## Solution

Changed the base image from `node:22-slim` to `python:3.12-slim` and install Node.js on top.

### Changes Made

**Before:**
```dockerfile
FROM node:22-slim
# ... install python3, python3-pip (which are 3.11)
RUN pip3 install kimi-cli --break-system-packages
```

**After:**
```dockerfile
FROM python:3.12-slim

# Install Node.js 22.x on top of Python base
RUN apt-get update && apt-get install -y \
    curl gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs

# ... rest of dependencies
RUN pip install --no-cache-dir kimi-cli
```

### Key Changes

1. **Base Image**: `node:22-slim` → `python:3.12-slim`
2. **Node.js Installation**: Added via NodeSource repository
3. **pip Install**: `pip3 install` → `pip install` (Python 3.12 default)
4. **User Creation**: Added explicit `useradd` for node user

## Benefits

- ✅ `kimi-cli` installs successfully (requires Python 3.12+)
- ✅ Can rebuild Docker image without errors
- ✅ Enables future updates to agent-runner code
- ✅ Unblocks fixes for agent context loading

## Build Instructions

```bash
cd container
docker build -t nanokimi-agent:latest .
```

Note: Build may take several minutes due to Chromium and Node.js installation.

## Testing

After building:

```bash
# Test the image
docker run --rm -i nanokimi-agent:latest echo '{"prompt": "test"}'

# Verify Python version
docker run --rm nanokimi-agent:latest python3 --version
# Should show: Python 3.12.x

# Verify kimi CLI
docker run --rm nanokimi-agent:latest kimi --version
```

## Migration

If you have an existing deployment:

1. Build the new image:
   ```bash
   docker build -t nanokimi-agent:latest container/
   ```

2. Restart the service:
   ```bash
   systemctl --user restart nanokimi
   ```

3. The new container will automatically use the updated image.

## Related

- Fixes: Docker build failure due to Python version
- Unblocks: Agent context loading fixes (need to rebuild image)
- See also: `fix/isolated-oauth-token` for OAuth security improvements
