#!/usr/bin/env bash
# 유튜브 스크립트 캡쳐 - macOS 자동 설치 마법사

set -e

BLUE='\033[1;34m'; YELLOW='\033[1;33m'; GREEN='\033[1;32m'
RED='\033[1;31m'; GRAY='\033[1;30m'; RESET='\033[0m'

title() { echo ""; echo -e "${BLUE}════════════════════════════════════════════════════════════${RESET}"; echo -e "${BLUE}  $1${RESET}"; echo -e "${BLUE}════════════════════════════════════════════════════════════${RESET}"; }
step() { echo -e "${YELLOW}▶ $1${RESET}"; }
ok()   { echo -e "  ${GREEN}✓ $1${RESET}"; }
warn() { echo -e "  ${YELLOW}⚠ $1${RESET}"; }
err()  { echo -e "  ${RED}✗ $1${RESET}"; }
pause_exit() { echo ""; read -p "Enter 키로 종료" _; exit "${1:-0}"; }

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/../.." && pwd )"

title "유튜브 스크립트 캡쳐 설치 마법사"
echo "  유튜브 영상을 단축키 한 번으로 Markdown으로 저장하는 확장입니다."
echo ""

step "Node.js 확인 중..."
if ! command -v node >/dev/null 2>&1; then
  err "Node.js 미설치"
  read -p "  Homebrew로 설치할까요? (Y/n) " ans
  if [[ ! "$ans" =~ ^[nN] ]]; then
    if command -v brew >/dev/null 2>&1; then brew install node
    else open "https://nodejs.org/ko"; pause_exit 1; fi
  else open "https://nodejs.org/ko"; pause_exit 1; fi
fi
ok "Node.js: $(node -v)"

step "Chrome 확장 ID 확인"
ID_FILE="$SCRIPT_DIR/extension-id.txt"
EXT_ID=""
if [[ -f "$ID_FILE" ]]; then
  EXT_ID="$(cat "$ID_FILE" | tr -d '[:space:]')"
  ok "캐시 로드: $EXT_ID"
else
  echo "  Chrome chrome://extensions/ → '유튜브 스크립트 캡쳐' ID 복사"
  read -p "  확장 ID: " EXT_ID
  [[ -z "$EXT_ID" ]] && { err "ID 없음"; pause_exit 1; }
  echo -n "$EXT_ID" > "$ID_FILE"
  ok "ID 저장됨"
fi

step "Native Messaging 헬퍼 등록 중..."
node "$PROJECT_ROOT/helper/manifest/install.mjs" --extension-id "$EXT_ID"
ok "헬퍼 등록 완료"

step "Ollama 확인 중..."
WANT_OLLAMA=false
if command -v ollama >/dev/null 2>&1; then
  ok "Ollama 발견: $(ollama -v 2>/dev/null || echo installed)"
  WANT_OLLAMA=true
else
  warn "Ollama 미설치"
  echo "  · 자막 자동 정리 + 영어 → 한국어 번역"
  echo "  · 구독료 없음, 오프라인 작동"
  read -p "  지금 설치할까요? (Y/n) " ans
  if [[ ! "$ans" =~ ^[nN] ]]; then
    if command -v brew >/dev/null 2>&1; then
      brew install ollama
      brew services start ollama 2>/dev/null || true
      ok "Ollama 설치 완료"
      WANT_OLLAMA=true
    else
      open "https://ollama.com/download/mac"
      WANT_OLLAMA=false
    fi
  fi
fi

if $WANT_OLLAMA && command -v ollama >/dev/null 2>&1; then
  step "AI 모델(qwen2.5:3b) 확인 중..."
  if ollama list 2>/dev/null | grep -q "qwen2.5:3b"; then
    ok "이미 설치됨"
  else
    echo "  다운로드 중... (~2GB)"
    ollama pull qwen2.5:3b && ok "완료" || err "실패. 'ollama pull qwen2.5:3b' 수동 실행 가능"
  fi
fi

mkdir -p "$HOME/.youtube-capture"
ok "$HOME/.youtube-capture 준비"

title "설치 완료"
echo "  1. chrome://extensions/ 확장 새로고침"
echo "  2. 옵션 → 헬퍼·CLI 연결 점검"
$WANT_OLLAMA && echo "  3. AI 공급자 'Ollama' 선택 → 저장"
echo "  4. YouTube에서 Cmd+Shift+S로 캡처"
echo ""
echo -e "${GRAY}  로그: ~/.youtube-capture/helper.log${RESET}"
pause_exit 0
