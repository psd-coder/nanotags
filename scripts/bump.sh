#!/bin/bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <patch|minor|major>"
  exit 1
fi

VERSION_TYPE=$1

# --no-git-tag-version: the commit and tag are created manually below.
# --no-git-checks: pnpm otherwise aborts on a dirty tree, but this script deliberately commits package.json only.
# --loglevel=error: pnpm 10 delegates to npm, which warns about every pnpm-only config it inherits.
(cd packages/nanotags && pnpm version "$VERSION_TYPE" --no-git-tag-version --no-git-checks --loglevel=error)

NEW_VERSION=$(node -p "require('./packages/nanotags/package.json').version")

git add packages/nanotags/package.json
git commit -m "Bump version to: $NEW_VERSION"
git tag -a "$NEW_VERSION" -m "Release $NEW_VERSION"

echo "Version bump complete. New version: $NEW_VERSION"
echo "Remember to push both the commit and the tag:"
echo "  git push origin main"
echo "  git push --tags"
