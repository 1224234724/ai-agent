#!/usr/bin/env bash
# 同时推送到 GitHub(origin) 与 Gitee(gitee)
set -euo pipefail

BRANCH="${1:-$(git rev-parse --abbrev-ref HEAD)}"

if ! git remote get-url origin >/dev/null 2>&1; then
  echo "缺少 remote: origin（GitHub）。例如："
  echo "  git remote add origin https://github.com/<org>/<repo>.git"
  exit 1
fi

if ! git remote get-url gitee >/dev/null 2>&1; then
  echo "缺少 remote: gitee。例如："
  echo "  git remote add gitee https://gitee.com/<org>/<repo>.git"
  exit 1
fi

echo ">> push origin $BRANCH"
git push -u origin "$BRANCH"

echo ">> push gitee $BRANCH"
git push -u gitee "$BRANCH"

echo "完成：已推送到 GitHub 与 Gitee"
