// Notion API 직접 전송 모듈 (P1.3a)
// Chrome Extension의 fetch()는 CORS 우회 — <all_urls> host_permissions 필요 (이미 있음)

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

/**
 * MD 텍스트를 Notion Block 배열로 변환
 * 지원: 헤더(#/##/###), bullet(-/*), numbered(1.), 코드(`code`), 단락
 * Notion API 단일 요청 최대 100블록 제한 적용
 */
function mdToNotionBlocks(md) {
  const lines = String(md || "").split("\n");
  const blocks = [];

  for (const raw of lines) {
    if (blocks.length >= 97) {
      // 트런케이션 — 사용자가 Notion 페이지에서 알 수 있도록 마커 추가
      blocks.push({
        object: "block", type: "callout",
        callout: {
          rich_text: [{ type: "text", text: { content: "⚠️ 내용이 길어 Notion 100블록 한도에서 잘렸습니다. 전체 내용은 로컬 MD 파일을 확인하세요." } }],
          icon: { emoji: "⚠️" },
        },
      });
      break;
    }

    const line = raw.trimEnd();

    // 헤더
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      const level = Math.min(headingMatch[1].length, 3);
      const typeMap = { 1: "heading_1", 2: "heading_2", 3: "heading_3" };
      blocks.push({
        object: "block",
        type: typeMap[level],
        [typeMap[level]]: { rich_text: [{ type: "text", text: { content: headingMatch[2].slice(0, 2000) } }] },
      });
      continue;
    }

    // Bullet (- / *)
    const bulletMatch = line.match(/^[-*]\s+(.+)/);
    if (bulletMatch) {
      blocks.push({
        object: "block", type: "bulleted_list_item",
        bulleted_list_item: { rich_text: [{ type: "text", text: { content: bulletMatch[1].slice(0, 2000) } }] },
      });
      continue;
    }

    // Numbered list (1. / 2. ...)
    const numberedMatch = line.match(/^\d+\.\s+(.+)/);
    if (numberedMatch) {
      blocks.push({
        object: "block", type: "numbered_list_item",
        numbered_list_item: { rich_text: [{ type: "text", text: { content: numberedMatch[1].slice(0, 2000) } }] },
      });
      continue;
    }

    // YAML frontmatter 구분선 제외
    if (line === "---") continue;

    // 빈 줄 — Notion 블록에서는 단순히 건너뜀
    if (!line.trim()) continue;

    // 일반 단락 (인라인 코드 `...` 처리 포함)
    const richText = parseInlineMarkdown(line.slice(0, 2000));
    blocks.push({
      object: "block", type: "paragraph",
      paragraph: { rich_text: richText },
    });
  }

  return blocks;
}

/** 인라인 마크다운: `code`, **bold**, *italic* → Notion rich_text 배열 */
function parseInlineMarkdown(text) {
  const result = [];
  // 단순 파서: backtick code만 처리, 나머지는 plain text
  const parts = text.split(/(`[^`]+`)/);
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      result.push({ type: "text", text: { content: part.slice(1, -1) }, annotations: { code: true } });
    } else {
      result.push({ type: "text", text: { content: part } });
    }
  }
  return result.length ? result : [{ type: "text", text: { content: text } }];
}

/**
 * Notion 페이지에 자식 페이지로 캡처 내용 전송
 * @param {object} opts
 * @param {string} opts.apiKey  - Integration Token (secret_...)
 * @param {string} opts.pageId  - 대상 페이지 ID (32자리 hex)
 * @param {string} opts.title   - 자식 페이지 제목
 * @param {string} opts.mdContent - Markdown 내용
 */
export async function sendToNotion({ apiKey, pageId, title, mdContent }) {
  if (!apiKey || !pageId) throw new Error("notionApiKey와 notionPageId 필수");

  const blocks = mdToNotionBlocks(mdContent);
  const cleanPageId = pageId.replace(/-/g, "").replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");

  const body = {
    parent: { page_id: cleanPageId },
    properties: {
      title: { title: [{ type: "text", text: { content: String(title || "Untitled").slice(0, 200) } }] },
    },
    children: blocks,
  };

  const res = await fetch(`${NOTION_API}/pages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Notion-Version": NOTION_VERSION,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.status);
    throw new Error(`Notion API ${res.status}: ${errText}`);
  }

  return await res.json();
}
