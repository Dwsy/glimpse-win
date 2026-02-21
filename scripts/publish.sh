#!/usr/bin/env bash
set -euo pipefail

# Publish glimpseui to npm
# Usage: ./scripts/publish.sh [--dry-run]

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

DRY_RUN=""
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN="--dry-run"
  echo "🧪 Dry run — nothing will be published"
fi

# Preflight checks
echo "📋 Preflight checks..."

# 1. Clean working tree
if [[ -n "$(git status --porcelain)" ]]; then
  echo "✗ Working tree is dirty. Commit or stash changes first."
  exit 1
fi
echo "  ✓ Clean working tree"

# 2. On main branch
BRANCH="$(git branch --show-current)"
if [[ "$BRANCH" != "main" ]]; then
  echo "✗ Not on main branch (on: $BRANCH). Switch to main first."
  exit 1
fi
echo "  ✓ On main branch"

# 3. npm logged in
if ! npm whoami &>/dev/null; then
  echo "✗ Not logged in to npm. Run 'npm login' first."
  exit 1
fi
NPM_USER="$(npm whoami)"
echo "  ✓ Logged in as $NPM_USER"

# 4. Swift compiler available
if ! command -v swiftc &>/dev/null; then
  echo "✗ swiftc not found. Install Xcode Command Line Tools."
  exit 1
fi
echo "  ✓ swiftc available"

# 5. Build the binary (verify it compiles)
echo ""
echo "🔨 Building..."
npm run build
echo "  ✓ Binary compiled"

# 6. Run tests
echo ""
echo "🧪 Running tests..."
node test.mjs
echo "  ✓ Tests passed"

# 7. Show what will be published
echo ""
echo "📦 Package contents:"
npm pack --dry-run 2>&1 | grep -E "^npm notice [0-9]|Tarball|Total"

# 8. Read version
VERSION="$(node -e "console.log(require('./package.json').version)")"
echo ""
echo "🚀 Publishing glimpseui@$VERSION $DRY_RUN"
echo ""

if [[ -z "$DRY_RUN" ]]; then
  read -p "Continue? (y/N) " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
  fi
fi

npm publish $DRY_RUN

if [[ -z "$DRY_RUN" ]]; then
  echo ""
  echo "✅ Published glimpseui@$VERSION"
  echo "   https://www.npmjs.com/package/glimpseui"
  
  # Tag the release
  git tag "v$VERSION"
  echo "🏷️  Tagged v$VERSION"
  echo "   Run 'git push && git push --tags' to push"
fi
