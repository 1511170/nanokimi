#!/bin/bash
# Phase 1: Admin VPS setup for NanoClaw
# Run as a sudo user (e.g., kinto). Creates an isolated app user with Docker Rootless.
#
# Usage: sudo bash scripts/setup-vps.sh

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Error: This script must be run as root (use sudo)."
  exit 1
fi

# --- Prompt for username ---
read -rp "Enter username for NanoClaw: " USERNAME

if [ -z "$USERNAME" ]; then
  echo "Error: Username cannot be empty."
  exit 1
fi

if id "$USERNAME" &>/dev/null; then
  echo "User '$USERNAME' already exists. Skipping user creation."
else
  echo "Creating user '$USERNAME'..."
  useradd -m -r -s /bin/bash "$USERNAME"
  echo "User '$USERNAME' created."
fi

# --- Set home dir permissions ---
echo "Setting home directory permissions..."
chmod 700 "/home/$USERNAME"

# --- Install system packages ---
echo "Installing system packages..."
apt-get update -qq
apt-get install -y -qq git nodejs npm acl uidmap dbus-user-session fuse-overlayfs slirp4netns curl ca-certificates

# --- Install Docker CE + rootless extras ---
if ! command -v docker &>/dev/null; then
  echo "Installing Docker CE..."
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-ce-rootless-extras
else
  echo "Docker already installed. Ensuring rootless extras are present..."
  apt-get install -y -qq docker-ce-rootless-extras
fi

# --- Ensure subuid/subgid ranges exist ---
if ! grep -q "^$USERNAME:" /etc/subuid 2>/dev/null; then
  echo "Allocating subuid/subgid ranges for $USERNAME..."
  usermod --add-subuids 200000-265535 --add-subgids 200000-265535 "$USERNAME"
fi

# --- Enable linger for systemd --user ---
echo "Enabling loginctl linger for $USERNAME..."
loginctl enable-linger "$USERNAME"

# --- Set up Docker Rootless as the new user ---
echo "Setting up Docker Rootless for $USERNAME..."

# Stop system Docker so it doesn't conflict with rootless setup
systemctl stop docker.socket docker.service 2>/dev/null || true

# Run rootless setup as the target user
# The XDG_RUNTIME_DIR and DBUS_SESSION_BUS_ADDRESS are needed for systemd --user
su - "$USERNAME" -c '
  export XDG_RUNTIME_DIR="/run/user/$(id -u)"
  export DBUS_SESSION_BUS_ADDRESS="unix:path=$XDG_RUNTIME_DIR/bus"
  dockerd-rootless-setuptool.sh install 2>&1
' || echo "Note: If Docker Rootless was already set up, this error can be ignored."

# Restart system Docker (other users may need it)
systemctl start docker.socket docker.service 2>/dev/null || true

# --- Calculate container UID ---
SUBUID_BASE=$(grep "^$USERNAME:" /etc/subuid | head -1 | cut -d: -f2)
if [ -n "$SUBUID_BASE" ]; then
  CONTAINER_UID=$((SUBUID_BASE + 999))
  echo ""
  echo "Container UID for '$USERNAME': $CONTAINER_UID"
  echo "  (subuid base $SUBUID_BASE + 999 for container user 'node' uid 1000)"
else
  echo "Warning: Could not determine subuid base for $USERNAME."
fi

# --- Done ---
echo ""
echo "========================================"
echo "  Phase 1 complete!"
echo "========================================"
echo ""
echo "Next steps:"
echo "  1. SSH as $USERNAME:"
echo "     ssh $USERNAME@$(hostname -f 2>/dev/null || hostname)"
echo ""
echo "  2. Clone the repo and enter it:"
echo "     git clone <repo-url> nanoclaw && cd nanoclaw"
echo ""
echo "  3. Run Claude Code:"
echo "     npx claude"
echo ""
echo "  4. Use /deploy to complete setup"
echo ""
