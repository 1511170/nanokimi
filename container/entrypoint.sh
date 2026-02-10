#!/bin/bash
set -e

# Source environment from mounted /workspace/env-dir/env if it exists
# Uses set -a/+a to handle special characters (like #) in values
if [ -f /workspace/env-dir/env ]; then
  set -a
  . /workspace/env-dir/env
  set +a
fi

# Read input from stdin and pass to agent runner
cat > /tmp/input.json
node /app/dist/index.js < /tmp/input.json
