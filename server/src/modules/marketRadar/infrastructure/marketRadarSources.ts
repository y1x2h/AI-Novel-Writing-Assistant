import type { MarketRadarListSource, MarketRadarPlatform } from "@ai-novel/shared/types/marketRadar";
import { collectFanqieSource } from "./platforms/fanqieRanking";
import { collectJinjiangSource } from "./platforms/jinjiangRanking";
import { collectQidianSource } from "./platforms/qidianRanking";
import type { CollectedRankingItem } from "./rankingSourceShared";

export type { CollectedRankingItem } from "./rankingSourceShared";
export { hasPrivateUseCharacters } from "./rankingSourceShared";

export const MARKET_RADAR_SOURCES: MarketRadarListSource[] = [
  { platform: "fanqie", platformLabel: "番茄小说", listKey: "new_book", listLabel: "新书榜·男频", channel: "male", sourceUrl: "https://fanqienovel.com/rank/1_1" },
  { platform: "fanqie", platformLabel: "番茄小说", listKey: "new_book_female", listLabel: "新书榜·女频", channel: "female", sourceUrl: "https://fanqienovel.com/rank/0_1" },
  { platform: "fanqie", platformLabel: "番茄小说", listKey: "reading", listLabel: "阅读榜·男频", channel: "male", sourceUrl: "https://fanqienovel.com/rank/1_2" },
  { platform: "fanqie", platformLabel: "番茄小说", listKey: "reading_female", listLabel: "阅读榜·女频", channel: "female", sourceUrl: "https://fanqienovel.com/rank/0_2" },
  { platform: "qidian", platformLabel: "起点中文网", listKey: "new_book", listLabel: "新书榜", channel: "male", sourceUrl: "https://m.qidian.com/rank/newbook/" },
  { platform: "qidian", platformLabel: "起点中文网", listKey: "new_author", listLabel: "新人作者新书榜", channel: "male", sourceUrl: "https://m.qidian.com/rank/newauthor/" },
  { platform: "qidian", platformLabel: "起点中文网", listKey: "hotsales", listLabel: "畅销榜", channel: "male", sourceUrl: "https://m.qidian.com/rank/hotsales/" },
  { platform: "qidian", platformLabel: "起点中文网", listKey: "monthly_ticket", listLabel: "月票榜", channel: "male", sourceUrl: "https://m.qidian.com/rank/yuepiao/" },
  { platform: "qidian", platformLabel: "起点中文网", listKey: "sign", listLabel: "签约榜", channel: "male", sourceUrl: "https://m.qidian.com/rank/sign/" },
  { platform: "qidian", platformLabel: "起点中文网", listKey: "recom", listLabel: "原创推荐榜", channel: "male", sourceUrl: "https://m.qidian.com/rank/rec/" },
  { platform: "jinjiang", platformLabel: "晋江文学城", listKey: "monthly", listLabel: "月度榜", channel: "female", sourceUrl: "https://m.jjwxc.net/rank/naturalmore/5" },
  { platform: "jinjiang", platformLabel: "晋江文学城", listKey: "quarterly", listLabel: "季度榜", channel: "female", sourceUrl: "https://m.jjwxc.net/rank/naturalmore/6" },
  { platform: "jinjiang", platformLabel: "晋江文学城", listKey: "new_author", listLabel: "新晋作者榜", channel: "female", sourceUrl: "https://m.jjwxc.net/rank/naturalmore/29" },
];

const COLLECTORS: Record<MarketRadarPlatform, (source: MarketRadarListSource) => Promise<CollectedRankingItem[]>> = {
  fanqie: collectFanqieSource,
  qidian: collectQidianSource,
  jinjiang: collectJinjiangSource,
};

export async function collectMarketSource(source: MarketRadarListSource): Promise<CollectedRankingItem[]> {
  const items = await COLLECTORS[source.platform](source);
  if (items.length === 0) throw new Error("榜单页面结构可能已变化，未识别到公开作品元数据");
  return items;
}
