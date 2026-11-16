import type { MarketRadarListSource } from "@ai-novel/shared/types/marketRadar";
import {
  MOBILE_USER_AGENT,
  type CollectedRankingItem,
  extractScriptJsonById,
  fetchPage,
  formatCompactNumber,
  mapWithConcurrency,
  parseCompactNumber,
  plainText,
  toInteger,
} from "../rankingSourceShared";

interface QidianRankRecord {
  rank: number;
  bid: string;
  title: string;
  author?: string;
  category?: string;
  tags: string[];
  synopsis?: string;
  wordCount?: number;
  sourceUrl: string;
}

interface QidianBookInfo {
  recomAll?: number;
  collect?: number;
  wordCount?: number;
  serialStatus?: string;
  category?: string;
  tags: string[];
}

const QIDIAN_BOOK_BASE = "https://m.qidian.com/book/";

export function parseQidianRankPage(html: string): QidianRankRecord[] {
  const context = extractScriptJsonById(html, "vite-plugin-ssr_pageContext") as {
    pageContext?: { pageProps?: { pageData?: { records?: Array<Record<string, unknown>> } } };
  };
  const records = context.pageContext?.pageProps?.pageData?.records;
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error("起点榜单页结构可能已变化，未识别到作品列表");
  }
  return records.flatMap((record, index) => {
    const bid = String(record.bid ?? "").trim();
    if (!bid) return [];
    const category = [record.cat, record.subCat].map((part) => String(part ?? "").trim()).filter(Boolean).join("·");
    return [{
      rank: toInteger(record.rankNum) ?? index + 1,
      bid,
      title: plainText(String(record.bName ?? "")),
      author: String(record.bAuth ?? "").trim() || undefined,
      category: category || undefined,
      tags: record.subCat ? [String(record.subCat)] : [],
      synopsis: plainText(String(record.desc ?? "")) || undefined,
      wordCount: parseCompactNumber(String(record.cnt ?? "")),
      sourceUrl: `${QIDIAN_BOOK_BASE}${bid}/`,
    } satisfies QidianRankRecord];
  });
}

export function parseQidianBookInfo(html: string): QidianBookInfo | null {
  const context = extractScriptJsonById(html, "vite-plugin-ssr_pageContext") as {
    pageContext?: { pageProps?: { pageData?: { bookInfo?: Record<string, unknown> } } };
  };
  const info = context.pageContext?.pageProps?.pageData?.bookInfo;
  if (!info) return null;
  const labels = Array.isArray(info.bookLabels)
    ? info.bookLabels.map((label) => String((label as { tag?: unknown }).tag ?? "")).filter(Boolean)
    : [];
  const category = [info.chanName, info.subCateName].map((part) => String(part ?? "").trim()).filter(Boolean).join("·");
  return {
    recomAll: toInteger(info.recomAll),
    collect: toInteger(info.collect),
    wordCount: toInteger(info.wordsCnt),
    serialStatus: String(info.actionStatus ?? "").trim() || undefined,
    category: category || undefined,
    tags: labels,
  };
}

export async function collectQidianSource(source: MarketRadarListSource): Promise<CollectedRankingItem[]> {
  const html = await fetchPage(source.sourceUrl, { userAgent: MOBILE_USER_AGENT });
  const records = parseQidianRankPage(html).slice(0, 30);
  const items = await mapWithConcurrency(records, 6, async (record) => {
    let info: QidianBookInfo | null = null;
    try {
      info = parseQidianBookInfo(await fetchPage(record.sourceUrl, { userAgent: MOBILE_USER_AGENT }));
    } catch {
      info = null;
    }
    return {
      rank: record.rank,
      title: record.title,
      author: record.author,
      category: info?.category ?? record.category,
      tags: [...new Set([...record.tags, ...(info?.tags ?? [])])],
      synopsis: record.synopsis?.slice(0, 800),
      heatMetric: info?.recomAll != null ? "总推荐" : undefined,
      heatValue: info?.recomAll,
      heatLabel: info?.recomAll != null ? `总推荐 ${formatCompactNumber(info.recomAll)}` : undefined,
      wordCount: info?.wordCount ?? record.wordCount,
      serialStatus: info?.serialStatus,
      sourceUrl: record.sourceUrl,
    } satisfies CollectedRankingItem;
  });
  return items.filter((item) => Boolean(item.title));
}
