import type { MarketRadarListSource } from "@ai-novel/shared/types/marketRadar";
import {
  DESKTOP_USER_AGENT,
  type CollectedRankingItem,
  extractJsonAfterMarker,
  extractTags,
  fetchPage,
  formatCompactNumber,
  hasPrivateUseCharacters,
  mapWithConcurrency,
  numberField,
  plainText,
  toInteger,
} from "../rankingSourceShared";

interface FanqieRankEntry {
  bookId: string;
  rank: number;
  category?: string;
  readCount?: number;
  wordNumber?: number;
  creationStatus?: number;
}

interface FanqieBookDetail {
  title?: string;
  author?: string;
  synopsis?: string;
  category?: string;
  readCount?: number;
  wordNumber?: number;
  creationStatus?: number;
}

function parseCategoryV2(raw: unknown): string | undefined {
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  let text = raw;
  if (raw.includes("\\\"")) {
    try {
      text = JSON.parse(`"${raw}"`) as string;
    } catch {
      text = raw;
    }
  }
  try {
    const entries = JSON.parse(text) as Array<{ Name?: string }>;
    if (!Array.isArray(entries)) return undefined;
    return entries.map((entry) => entry.Name).filter(Boolean).slice(0, 2).join("·") || undefined;
  } catch {
    return undefined;
  }
}

export function parseFanqieRankList(html: string): FanqieRankEntry[] {
  const state = extractJsonAfterMarker(html, "window.__INITIAL_STATE__=") as {
    rank?: { book_list?: Array<Record<string, unknown>> };
  };
  const list = state.rank?.book_list;
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error("番茄榜单页结构可能已变化，未识别到作品列表");
  }
  return list.map((entry, index) => ({
    bookId: String(entry.bookId ?? ""),
    rank: toInteger(entry.currentPos) ?? index + 1,
    category: parseCategoryV2(entry.categoryV2),
    readCount: toInteger(entry.readCount),
    wordNumber: toInteger(entry.wordNumber),
    creationStatus: toInteger(entry.creationStatus),
  })).filter((entry) => entry.bookId);
}

export function parseFanqieBookDetail(html: string): FanqieBookDetail {
  const title = plainText(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1]);
  if (!title || hasPrivateUseCharacters(title)) throw new Error("作品详情页未提供可读书名");
  const author = plainText(html.match(/author-name-text[^>]*>([\s\S]*?)<\/a>/)?.[1]);
  const synopsis = plainText(html.match(/class="page-abstract-content"[^>]*>\s*<p[^>]*>([\s\S]*?)<\/p>/)?.[1]);
  const rawCategory = html.match(/"categoryV2":"((?:[^"\\]|\\.)*)"/)?.[1];
  return {
    title,
    author: author && !hasPrivateUseCharacters(author) ? author : undefined,
    synopsis: synopsis && !hasPrivateUseCharacters(synopsis) ? synopsis : undefined,
    category: parseCategoryV2(rawCategory),
    readCount: numberField(html, "readCount"),
    wordNumber: numberField(html, "wordNumber"),
    creationStatus: numberField(html, "creationStatus"),
  };
}

function serialStatusOf(creationStatus: number | undefined): string | undefined {
  if (creationStatus == null) return undefined;
  return creationStatus === 0 ? "已完结" : "连载中";
}

export async function collectFanqieSource(source: MarketRadarListSource): Promise<CollectedRankingItem[]> {
  const html = await fetchPage(source.sourceUrl, { userAgent: DESKTOP_USER_AGENT });
  const entries = parseFanqieRankList(html).slice(0, 30);
  const items = await mapWithConcurrency(entries, 4, async (entry): Promise<CollectedRankingItem | null> => {
    const detailUrl = `https://fanqienovel.com/page/${entry.bookId}`;
    try {
      const detail = await parseFanqieBookDetail(await fetchPage(detailUrl, { userAgent: DESKTOP_USER_AGENT }));
      const synopsis = detail.synopsis?.slice(0, 800);
      return {
        rank: entry.rank,
        title: detail.title ?? "",
        author: detail.author,
        category: detail.category ?? entry.category,
        tags: detail.synopsis ? extractTags(detail.synopsis) : [],
        synopsis,
        heatMetric: "在读",
        heatValue: detail.readCount,
        heatLabel: detail.readCount != null ? `在读 ${formatCompactNumber(detail.readCount)}` : undefined,
        wordCount: detail.wordNumber ?? entry.wordNumber,
        serialStatus: serialStatusOf(detail.creationStatus ?? entry.creationStatus),
        sourceUrl: detailUrl,
      } satisfies CollectedRankingItem;
    } catch {
      return null;
    }
  });
  return items.filter((item): item is CollectedRankingItem => item !== null && Boolean(item.title));
}
