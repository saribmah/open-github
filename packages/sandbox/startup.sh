#!/bin/bash
# Startup script for open-github sandbox

set -e

echo "🚀 Starting Open GitHub Sandbox"
echo "================================"

# Check for required environment variables
if [ -z "$REPO_URL" ]; then
  echo "❌ Error: REPO_URL environment variable is required"
  exit 1
fi

# Set workspace directory
WORKSPACE_DIR="/workspace"
cd "$WORKSPACE_DIR"

# Remove any existing content
rm -rf ./*
rm -rf .git

# Clone repository
echo "📦 Cloning repository: $REPO_URL"

if [ -n "$BRANCH" ]; then
  echo "   Branch: $BRANCH"
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" . || {
    echo "⚠️  Branch '$BRANCH' not found, trying default branch..."
    git clone --depth 1 "$REPO_URL" .
  }
else
  echo "   Using default branch"
  git clone --depth 1 "$REPO_URL" .
fi

echo "✅ Repository cloned successfully"

# Configure git
git config --global --add safe.directory "$WORKSPACE_DIR"

# Display repository info
echo ""
echo "📊 Repository Information:"
echo "   Path: $WORKSPACE_DIR"
echo "   Branch: $(git branch --show-current)"
echo "   Commit: $(git rev-parse --short HEAD)"
echo ""

# Start OpenCode server
echo "🌐 Starting OpenCode server on port 4096..."
echo "   Session ID: ${SESSION_ID:-unknown}"
echo ""

# Run OpenCode server
# Note: Alpine uses musl, so we need the musl-specific binary
OPENCODE_BIN="/root/.bun/install/global/node_modules/opencode-linux-x64-musl/bin/opencode"

if [ ! -f "$OPENCODE_BIN" ]; then
  echo "❌ Error: OpenCode binary not found at $OPENCODE_BIN"
  exit 1
fi

exec "$OPENCODE_BIN" --port 4096 --hostname 0.0.0.0 .
