#!/bin/bash
# Deploy current Code/public/ to GitHub Pages.
# Run from the repo root after committing changes to main.
#
# Auto-bumps the service worker cache version so the iPhone PWA pulls
# fresh files on next launch (otherwise the SW serves the old cache
# forever).

set -e
cd "$(dirname "$0")"

# Auto-bump SW cache version (timestamp)
NEW_VERSION="meditation-600-$(date +%Y%m%d-%H%M%S)"
sed -i '' "s/^const CACHE_VERSION = .*/const CACHE_VERSION = '${NEW_VERSION}';/" Code/public/sw.js
echo "Bumped CACHE_VERSION to ${NEW_VERSION}"

# Stage the version bump
git add Code/public/sw.js
if ! git diff --cached --quiet; then
  git -c user.name="Vincent Beermann" -c user.email="vincentbeermann@users.noreply.github.com" \
      commit -q -m "deploy: bump SW cache to ${NEW_VERSION}"
fi

if ! git diff-index --quiet HEAD --; then
  echo "ERROR: working tree has other uncommitted changes. Commit first."
  exit 1
fi

git push -q origin main

# Recreate gh-pages branch from current Code/public/
git branch -D gh-pages 2>/dev/null || true
git subtree split --prefix Code/public -b gh-pages
git push origin gh-pages --force
git branch -D gh-pages

echo ""
echo "Deployed. Live in ~30s at:"
echo "  https://vincentbeermann.github.io/meditation-600/"
echo ""
echo "On iPhone: close the app fully (swipe up), reopen. SW will fetch new version."
