# KKONGDON Clip - Windows Auto Installer

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# ── UTF-8 인코딩 설정 (한글 깨짐 방지) ────────────────────────────────────────
chcp 65001 | Out-Null                                        # 콘솔 코드 페이지
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8    # 출력 스트림
$OutputEncoding            = [System.Text.Encoding]::UTF8    # 파이프라인

$Host.UI.RawUI.WindowTitle = "KKONGDON Clip 설치"

function Write-Title($t) {
  Write-Host ""
  Write-Host "============================================================" -ForegroundColor Cyan
  Write-Host "  $t" -ForegroundColor Cyan
  Write-Host "============================================================" -ForegroundColor Cyan
}
function Write-Step($t) { Write-Host "> $t" -ForegroundColor Yellow }
function Write-Ok($t)   { Write-Host "  [OK] $t" -ForegroundColor Green }
function Write-Warn($t) { Write-Host "  [!]  $t" -ForegroundColor Yellow }
function Write-Err($t)  { Write-Host "  [X]  $t" -ForegroundColor Red }
function Pause-Exit($c = 0) { Write-Host ""; Read-Host "Press Enter to exit"; exit $c }

Write-Title "KKONGDON Clip 설치"
Write-Host "  YouTube · 웹페이지 콘텐츠를 AI로 정리해 Markdown으로 저장합니다."
Write-Host ""

# 1. Node.js
Write-Step "Node.js 확인 중..."
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Err "Node.js가 설치되어 있지 않습니다."
  Write-Host "  Node.js는 헬퍼 프로그램 실행에 필요한 런타임입니다."
  $a = Read-Host "  nodejs.org를 브라우저에서 열까요? (y/N)"
  if ($a -match "^[yY]") { Start-Process "https://nodejs.org/ko" }
  Pause-Exit 1
}
Write-Ok ("Node.js 확인됨: " + (& node -v))

# 2. Extension ID - fixed via manifest "key" field
Write-Step "확장 ID 확인 중..."
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$extId = "kjdgcjakmgocegklcnkanbpjigfajkal"
Write-Ok "Extension ID: $extId"

# 3. Register Native Messaging host
Write-Step "Native Messaging 헬퍼 등록 중..."
$installMjs = Join-Path $scriptDir "..\..\helper\manifest\install.mjs"
& node $installMjs --extension-id $extId
if ($LASTEXITCODE -ne 0) { Write-Err "헬퍼 등록 실패"; Pause-Exit 1 }
Write-Ok "헬퍼 등록 완료"

# 4. Ollama
Write-Step "Ollama (무료 로컬 AI) 확인 중..."
$ollama = Get-Command ollama -ErrorAction SilentlyContinue
$wantOllama = $false
if ($ollama) {
  Write-Ok "Ollama 설치됨"
  $wantOllama = $true
} else {
  Write-Warn "Ollama가 설치되어 있지 않습니다."
  Write-Host ""
  Write-Host "  Ollama는 내 PC에서 무료로 돌아가는 AI입니다."
  Write-Host "  - 자막 오류 자동 교정"
  Write-Host "  - 영어 → 한국어 자동 번역"
  Write-Host "  - 핵심 내용 요약"
  Write-Host "  - API 비용 없음, 인터넷 연결 불필요"
  Write-Host ""
  $a = Read-Host "  Ollama를 지금 설치할까요? (Y/n)"
  if ($a -notmatch "^[nN]") {
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if ($winget) {
      Write-Host "  winget으로 설치 중 (1~3분)..."
      & winget install --id Ollama.Ollama --silent --accept-source-agreements --accept-package-agreements
      if ($LASTEXITCODE -eq 0) {
        Write-Ok "Ollama 설치 완료"
        $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
        $userPath    = [System.Environment]::GetEnvironmentVariable("Path", "User")
        $env:Path    = "$machinePath;$userPath"
        $wantOllama  = $true
      } else {
        Write-Warn "winget 설치 실패. 다운로드 페이지를 엽니다."
        Start-Process "https://ollama.com/download/windows"
        $wantOllama = $false
      }
    } else {
      Write-Warn "winget을 사용할 수 없습니다. 다운로드 페이지를 엽니다."
      Start-Process "https://ollama.com/download/windows"
      $wantOllama = $false
    }
  } else {
    Write-Host "  Ollama 설치를 건너뜁니다. 나중에 ollama.com에서 설치할 수 있습니다."
  }
}

# 5. Pull model (사용자 선택)
if ($wantOllama) {
  $ollama = Get-Command ollama -ErrorAction SilentlyContinue
  if ($ollama) {
    Write-Step "AI 모델 확인 중..."
    $models = & ollama list 2>$null
    if ($models -match "qwen2\.5:3b") {
      Write-Ok "qwen2.5:3b 모델이 이미 설치되어 있습니다."
    } else {
      Write-Host ""
      Write-Host "  권장 모델: qwen2.5:3b"
      Write-Host "  - 용량: 약 2GB"
      Write-Host "  - 다운로드 시간: 5~15분 (인터넷 속도에 따라 다름)"
      Write-Host "  - 설치 후에는 인터넷 없이 오프라인으로 동작"
      Write-Host ""
      $b = Read-Host "  지금 모델을 다운받을까요? (Y/n)"
      if ($b -notmatch "^[nN]") {
        Write-Host "  다운로드 중... (진행률이 표시됩니다)"
        & ollama pull qwen2.5:3b
        if ($LASTEXITCODE -eq 0) { Write-Ok "모델 준비 완료" }
        else {
          Write-Warn "모델 다운로드 실패."
          Write-Host "  나중에 직접 실행하세요: ollama pull qwen2.5:3b"
        }
      } else {
        Write-Host "  나중에 직접 실행하세요:"
        Write-Host "    ollama pull qwen2.5:3b" -ForegroundColor Cyan
      }
    }
  }
}

# 6. User folder
Write-Step "사용자 데이터 폴더 준비 중..."
$userDir = Join-Path $env:USERPROFILE ".kkongdon-clip"
if (-not (Test-Path $userDir)) { New-Item -ItemType Directory -Path $userDir | Out-Null }
Write-Ok "$userDir 준비 완료"

# 7. Done
Write-Title "설치 완료"
Write-Host ""
Write-Host "  다음 단계:" -ForegroundColor White
Write-Host "  1. chrome://extensions/ 에서 'KKONGDON Clip' 새로고침"
Write-Host "  2. 확장 설정 → '헬퍼 연결 확인' 버튼 클릭"
if ($wantOllama) {
  Write-Host "  3. AI 공급자: 'Ollama' 선택 후 저장"
}
Write-Host "  4. 유튜브 영상에서 Ctrl+Shift+S 로 캡처 시작"
Write-Host ""
Write-Host "  로그 위치: $userDir\helper.log" -ForegroundColor DarkGray
Write-Host ""
Pause-Exit 0
