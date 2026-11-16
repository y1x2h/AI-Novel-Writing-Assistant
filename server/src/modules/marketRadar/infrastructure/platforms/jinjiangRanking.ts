import type { MarketRadarListSource } from "@ai-novel/shared/types/marketRadar";
import {
  MOBILE_USER_AGENT,
  type CollectedRankingItem,
  absoluteUrl,
  fetchPage,
  plainText,
} from "../rankingSourceShared";

const ITEMS_PER_CHANNEL = 6;

function channelLabel(rawTitle: string): string {
  return plainText(rawTitle)
    .replace(/^[【\[]|[】\]]$/g, "")
    .replace(/排行$/, "")
    .trim();
}

export function parseJinjiangRankPage(html: string, source: MarketRadarListSource): CollectedRankingItem[] {
  const blocks = [...html.matchAll(
    /<span class="listtitle"[^>]*>([\s\S]*?)<\/span>([\s\S]*?)(?=<span class="listtitle"|<\/body>|$)/g,
  )];
  const items: CollectedRankingItem[] = [];
  for (const block of blocks) {
    const channel = channelLabel(block[1]);
    const links = [...block[2].matchAll(/<li[^>]*>\s*<a href="(\/book2\/\d+)"[^>]*>([\s\S]*?)<\/a>/g)]
      .slice(0, ITEMS_PER_CHANNEL);
    links.forEach((link, index) => {
      const title = plainText(link[2]);
      if (!title) return;
      items.push({
        rank: index + 1,
        title,
        category: channel || undefined,
        tags: [],
        sourceUrl: absoluteUrl(source.sourceUrl, link[1]),
      });
    });
  }
  if (items.length === 0) throw new Error("晋江榜单页结构可能已变化，未识别到作品列表");
  return items;
}

export async function collectJinjiangSource(source: MarketRadarListSource): Promise<CollectedRankingItem[]> {
  const html = await fetchPage(source.sourceUrl, { userAgent: MOBILE_USER_AGENT, charset: "gb18030" });
  return parseJinjiangRankPage(html, source);
}
