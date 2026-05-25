// 팝업: 포맷별 캡처 버튼 + 설정 아이콘 + 단축키 안내
// 컨텍스트 인식: YouTube watch 페이지 → 기존 포맷 버튼 / 그 외 → 웹 캡처 버튼
// 마지막 선택 포맷은 chrome.storage.local에 저장되어 다음 사용 시 강조 표시

const $ = (id) => document.getElementById(id);
const LAST_FORMAT_KEY = "lastUsedFormat";

// ── 하위 폴더 선택기 ──────────────────────────────────────────────────────
async function initSubfolderSelector() {
  const stored = await chrome.storage.local.get(["subfolders", "lastSubfolder", "enableWikiFormat"]);
  const subfolders = Array.isArray(stored.subfolders) ? stored.subfolders : [];
  const lastSub    = stored.lastSubfolder || "";
  const wikiOn     = !!stored.enableWikiFormat;

  const row    = $("subfolderRow");
  const sel    = $("subfolderSelect");
  const badge  = $("wikiBadge");

  // Wiki 배지 표시
  if (wikiOn && badge) badge.classList.remove("hidden");

  if (!subfolders.length) return; // 설정된 폴더 없으면 숨김 유지

  // 옵션 채우기
  sel.textContent = ""; // 기존 옵션 제거 (innerHTML 미사용)
  const rootOpt = document.createElement("option");
  rootOpt.value = "";
  rootOpt.textContent = "루트 (기본)";
  sel.appendChild(rootOpt);

  for (const folder of subfolders) {
    const opt = document.createElement("option");
    opt.value = folder;
    opt.textContent = `📂 ${folder}`;
    if (folder === lastSub) opt.selected = true;
    sel.appendChild(opt);
  }

  row.classList.remove("hidden");

  // 변경 시 storage 저장
  sel.addEventListener("change", () => {
    chrome.storage.local.set({ lastSubfolder: sel.value }).catch(() => {});
  });
}

function getSelectedSubfolder() {
  return $("subfolderSelect")?.value || "";
}

function setStatus(text, kind = "ok", showNextSteps = false) {
  const el = $("status");
  el.textContent = text;
  el.className = `status ${kind}`;
  const ns = $("nextSteps");
  if (showNextSteps && kind === "ok") ns.classList.remove("hidden");
  else ns.classList.add("hidden");
}

function isYouTubeWatch(url) {
  return /^https:\/\/www\.youtube\.com\/watch/.test(url || "");
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

// ── YouTube 캡처 ──────────────────────────────────────────────────────────────
async function triggerCapture(format) {
  const tab = await getActiveTab();
  if (!tab || !isYouTubeWatch(tab.url)) {
    setStatus("유튜브 영상 페이지에서만 사용 가능합니다.", "warn");
    return;
  }
  setStatus(`${format.toUpperCase()} 포맷으로 처리 중...`, "ok");
  await chrome.storage.local.set({ [LAST_FORMAT_KEY]: format });

  const subfolder = getSelectedSubfolder();

  try {
    await chrome.tabs.sendMessage(tab.id, { type: "TRIGGER_CAPTURE", format, subfolder });
    setStatus("작업이 시작됐습니다. 잠시 후 저장 완료 알림이 뜹니다.", "ok", true);
  } catch {
    // content script 미주입 시 강제 주입 후 재시도
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["src/content.js"] });
      await chrome.tabs.sendMessage(tab.id, { type: "TRIGGER_CAPTURE", format, subfolder });
      setStatus("작업이 시작됐습니다.", "ok", true);
    } catch (e2) {
      setStatus(`오류: ${e2.message}`, "err");
    }
  }
}

// ── 웹 캡처 ──────────────────────────────────────────────────────────────────
// background.js의 CAPTURE_WEB 핸들러로 직접 메시지 전송
// tabId와 url을 명시적으로 전달 (popup → background 경로에서 sender.tab이 없으므로)
async function triggerWebCapture(format) {
  const tab = await getActiveTab();
  if (!tab?.id || !tab?.url) {
    setStatus("페이지 정보를 가져올 수 없습니다.", "err");
    return;
  }
  if (tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://")) {
    setStatus("이 페이지는 캡처할 수 없습니다.", "warn");
    return;
  }
  setStatus(`웹 본문 추출 중 (${format.toUpperCase()})...`, "ok");

  const subfolder = getSelectedSubfolder();

  try {
    const res = await chrome.runtime.sendMessage({
      type: "CAPTURE_WEB",
      tabId: tab.id,
      url: tab.url,
      format,
      subfolder,
    });
    if (res?.ok) {
      setStatus("저장됐습니다! 잠시 후 파일이 다운로드됩니다.", "ok", true);
    } else {
      setStatus(`캡처 실패: ${res?.error || "알 수 없는 오류"}`, "err");
    }
  } catch (e) {
    setStatus(`오류: ${e.message}`, "err");
  }
}

// ── 이벤트 바인딩 ─────────────────────────────────────────────────────────────
document.querySelectorAll(".format-btn").forEach((btn) => {
  btn.addEventListener("click", () => triggerCapture(btn.dataset.fmt));
});

document.querySelectorAll(".web-btn").forEach((btn) => {
  btn.addEventListener("click", () => triggerWebCapture(btn.dataset.fmt));
});

$("settingsBtn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

// ── 캡처 히스토리 패널 ────────────────────────────────────────────────────
async function renderHistory() {
  const panel = $("historyPanel");
  panel.textContent = ""; // 안전하게 초기화 (innerHTML 미사용)

  const stored = await chrome.storage.local.get("captureHistory");
  const items = Array.isArray(stored.captureHistory) ? stored.captureHistory : [];

  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "h-empty";
    empty.textContent = "아직 캡처 기록이 없습니다.";
    panel.appendChild(empty);
    return;
  }

  const TYPE_ICON = { yt: "▶", web: "🌐", selection: "✏️" };
  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "h-item";

    const icon = document.createElement("span");
    icon.className = "h-type";
    icon.textContent = TYPE_ICON[item.type] || "📄";

    const title = document.createElement("span");
    title.className = "h-title";
    title.textContent = item.title || item.url;

    const meta = document.createElement("span");
    meta.className = "h-meta";
    meta.textContent = `${item.date} · ${(item.format || "md").toUpperCase()}`;

    row.appendChild(icon);
    row.appendChild(title);
    row.appendChild(meta);

    row.addEventListener("click", () => chrome.tabs.create({ url: item.url }));
    panel.appendChild(row);
  });
}

$("historyToggle").addEventListener("click", () => {
  const panel = $("historyPanel");
  const isOpen = !panel.classList.contains("hidden");
  panel.classList.toggle("hidden");
  $("historyArrow").textContent = isOpen ? "▾" : "▴";
  if (!isOpen) renderHistory();
});

$("shortcutLink").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
});

// ── 초기화: 컨텍스트 감지 → UI 전환 ─────────────────────────────────────────
(async () => {
  const tab = await getActiveTab();
  const isYT = isYouTubeWatch(tab?.url);

  // 하위 폴더 선택기 초기화 (subfolders 설정 여부에 따라 표시)
  await initSubfolderSelector();

  if (isYT) {
    // YouTube 모드: 파란 그라디언트 헤더 + YouTube 배지
    document.body.classList.add("yt-mode");
    $("modeBadge").textContent = "▶ YouTube";
    $("ytFormatList").classList.remove("hidden");
    $("webCaptureList").classList.add("hidden");
    $("hintText").textContent = "현재 영상의 스크립트를 원하는 포맷으로 저장합니다.";

    try {
      const cmds = await chrome.commands.getAll();
      const cap = cmds.find((c) => c.name === "capture");
      $("kbd").textContent = cap?.shortcut || "(미설정)";
    } catch {}

    try {
      const { [LAST_FORMAT_KEY]: last } = await chrome.storage.local.get(LAST_FORMAT_KEY);
      const sel = last ? `.format-btn[data-fmt="${last}"]` : '.format-btn[data-fmt="md"]';
      document.querySelector(sel)?.classList.add("recent");
    } catch {}

  } else {
    // 웹 캡처 모드: 민트/틸 그라디언트 헤더 + 웹 배지
    document.body.classList.add("web-mode");
    $("modeBadge").textContent = "🌐 웹";
    $("ytFormatList").classList.add("hidden");
    $("webCaptureList").classList.remove("hidden");
    $("hintText").textContent = "현재 페이지의 본문을 저장합니다.";

    try {
      const cmds = await chrome.commands.getAll();
      const cap = cmds.find((c) => c.name === "capture-web");
      $("kbd").textContent = cap?.shortcut || "(미설정)";
    } catch {}

    // MD 기본 강조
    document.querySelector('.web-btn[data-fmt="md"]')?.classList.add("recent");
  }
})();
