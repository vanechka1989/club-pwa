#!/usr/bin/env bash
set -euo pipefail

git config user.name "vanechka1989"
git config user.email "vanechka1989@users.noreply.github.com"

if git remote | grep -qx "origin"; then
  git remote set-url origin "https://github.com/vanechka1989/club-pwa.git"
else
  git remote add origin "https://github.com/vanechka1989/club-pwa.git"
fi

git branch -M main
git add .

if git diff --cached --quiet; then
  echo "Nothing to commit."
else
  git commit -m "Initial PWA club template"
fi

git push -u origin main
