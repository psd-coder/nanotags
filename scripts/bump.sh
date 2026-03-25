#!/bin/bash

if [ $# -lt 1 ]; then
  echo "Usage: $0 <patch|minor|major>"
  exit 1
fi

VERSION_TYPE=$1

npm --no-git-tag-version version $VERSION_TYPE --prefix packages/nanotags

NEW_VERSION=$(node -p "require('./packages/nanotags/package.json').version")

git add packages/nanotags/package.json
git commit -m "Bump version to: $NEW_VERSION"
git tag -a "$NEW_VERSION" -m "Release $NEW_VERSION"

echo "Version bump complete. New version: $NEW_VERSION"
echo "Remember to push both the commit and the tag:"
echo "  git push origin main"
echo "  git push --tags"
