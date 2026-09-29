#!/bin/sh
# Тесты → сборка → исходники в main → собранный dist/ в ветку gh-pages (GitHub Pages).
# Отладочная debug.html на хостинг не попадает.
set -e
cd "$(dirname "$0")"
[ "$(git branch --show-current)" = main ] || { echo "Выкладывать можно только из ветки main" >&2; exit 1; }
npm test --silent
node build.mjs
if [ -n "$(git status --porcelain)" ]; then
  git add -A
  git commit -m "${1:-Обновление автодрома}"
fi
git push origin main

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cp -R dist/. "$tmp"
rm -f "$tmp/debug.html"
git -C "$tmp" init -q -b gh-pages
git -C "$tmp" add -A
git -C "$tmp" -c user.name="$(git config user.name)" -c user.email="$(git config user.email)" \
  commit -q -m "Сборка $(git rev-parse --short HEAD)"
git -C "$tmp" push -q -f "$(git remote get-url origin)" gh-pages
echo "Готово: https://dezdoss.github.io/pdd-kz-drive/ — обновится через минуту."
