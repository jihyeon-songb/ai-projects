#!/usr/bin/env bash
#
# 코드몽(Orangi) 재설치 스크립트
#   1. 앱을 새로 빌드(npm run pack)
#   2. 실행 중인 기존 앱 종료
#   3. /Applications 로 교체 설치 (+ Gatekeeper quarantine 제거)
#   4. 다시 실행
#
# 사용법:  npm run reinstall      (= bash scripts/reinstall.sh)
#          npm run reinstall -- --no-launch   # 재설치만 하고 실행 안 함
set -euo pipefail

# 프로젝트 루트(이 스크립트의 상위 디렉터리)로 이동
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

APP_NAME="Orangi.app"
BUILT_APP="$ROOT/dist/mac-arm64/$APP_NAME"
DEST="/Applications/$APP_NAME"

LAUNCH=1
for arg in "$@"; do
  [ "$arg" = "--no-launch" ] && LAUNCH=0
done

echo "▶ 1/4  빌드 중 (npm run pack)…"
npm run pack

if [ ! -d "$BUILT_APP" ]; then
  echo "✗ 빌드 결과를 찾을 수 없어요: $BUILT_APP" >&2
  exit 1
fi

echo "▶ 2/4  실행 중인 기존 앱 종료…"
pkill -f "$DEST" 2>/dev/null || true
sleep 1

echo "▶ 3/4  /Applications 로 설치…"
rm -rf "$DEST"
cp -R "$BUILT_APP" "$DEST"
# 로컬 빌드(미서명)라 Gatekeeper 경고가 뜨지 않도록 quarantine 속성 제거
xattr -dr com.apple.quarantine "$DEST" 2>/dev/null || true

if [ "$LAUNCH" = "1" ]; then
  echo "▶ 4/4  실행…"
  open "$DEST"
else
  echo "▶ 4/4  실행 생략(--no-launch)"
fi

echo "✓ 완료: $DEST"