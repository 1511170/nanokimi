#!/bin/bash
# Setup script for OAuth token isolation
# This creates the isolated oauth-token directory with proper permissions

set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="$PROJECT_DIR/data"
CREDENTIALS_DIR="$DATA_DIR/credentials"
OAUTH_TOKEN_DIR="$DATA_DIR/oauth-token"

echo "=== OAuth Token Isolation Setup ==="
echo ""

# Check if credentials directory exists
if [ ! -d "$CREDENTIALS_DIR" ]; then
    echo "❌ Error: credentials directory not found at $CREDENTIALS_DIR"
    echo "   Please run the main setup first."
    exit 1
fi

# Create oauth-token directory
echo "📁 Creating oauth-token directory..."
mkdir -p "$OAUTH_TOKEN_DIR"

# Copy OAuth token if it exists
if [ -f "$CREDENTIALS_DIR/kimi-code.json" ]; then
    echo "📄 Copying OAuth token..."
    cp "$CREDENTIALS_DIR/kimi-code.json" "$OAUTH_TOKEN_DIR/"
    echo "   ✓ Token copied from credentials/"
else
    echo "⚠️  Warning: No kimi-code.json found in credentials/"
    echo "   You may need to authenticate first: kimi login"
fi

# Set permissions
echo "🔒 Setting permissions..."

# Detect Docker Rootless UID mapping
CONTAINER_UID=""
if id -u 200999 &>/dev/null; then
    CONTAINER_UID="200999"
elif id -u 300999 &>/dev/null; then
    CONTAINER_UID="300999"
fi

if [ -n "$CONTAINER_UID" ]; then
    echo "   Found container UID: $CONTAINER_UID"
    setfacl -m u:$CONTAINER_UID:rw "$OAUTH_TOKEN_DIR/kimi-code.json" 2>/dev/null || {
        echo "   ⚠️  Could not set ACL, trying chmod..."
        chmod 666 "$OAUTH_TOKEN_DIR/kimi-code.json"
    }
    setfacl -m u:$CONTAINER_UID:rwx "$OAUTH_TOKEN_DIR" 2>/dev/null || {
        chmod 777 "$OAUTH_TOKEN_DIR"
    }
else
    echo "   ⚠️  Container UID not found (200999 or 300999)"
    echo "   Using chmod as fallback (less secure)"
    chmod 666 "$OAUTH_TOKEN_DIR/kimi-code.json" 2>/dev/null || true
    chmod 777 "$OAUTH_TOKEN_DIR" 2>/dev/null || true
fi

# Verify
echo ""
echo "=== Verification ==="
ls -la "$OAUTH_TOKEN_DIR/"
echo ""

if command -v getfacl &> /dev/null; then
    echo "ACLs on token file:"
    getfacl "$OAUTH_TOKEN_DIR/kimi-code.json" 2>/dev/null || echo "   (ACL not available)"
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Ensure config.toml exists in: $CREDENTIALS_DIR/config.toml"
echo "2. Restart the service: systemctl --user restart nanokimi"
echo "3. Test by sending a message to your WhatsApp bot"
echo ""
echo "For more info, see: docs/OAUTH_TOKEN_ISOLATION.md"
