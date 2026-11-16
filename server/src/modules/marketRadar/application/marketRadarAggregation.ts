import { isMarketNewBookListKey } from "@ai-novel/shared/types/marketRadar";
import { formatCompactNumber } from "../infrastructure/rankingSourceShared";

interface AggregationItem {
  rank: number;
  title: string;
  author: string | null;
  category: string | null;
  tagsJson: string | null;
  heatMetric: string | null;
  heatValue: number | null;
  wordCount: number | null;
}

interface AggregationSnapshot {
  listKey: string;
  listLabel: string;
  items: AggregationItem[];
}

function median(values: number[]): number | undefined {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  if (sorted.length === 0) return undefined;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[middle - 1] + sorted[middle]) / 2) : sorted[middle];
}

function formatHeat(metric: string | null | undefined, value: number | undefined): string {
  if (value == null) return "";
  return `${metric ?? "热度"}中位 ${formatCompactNumber(value)}`;
}

function formatWordCount(value: number | undefined): string {
  return value == null ? "" : `${(value / 10_000).toFixed(1)}万字`;
}

function parseTags(tagsJson: string | null): string[] {
  if (!tagsJson) return [];
  try {
    const parsed = JSON.parse(tagsJson) as unknown;
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function topCategories(items: AggregationItem[], limit: number): string {
  const groups = new Map<string, AggregationItem[]>();
  for (const item of items) {
    const key = item.category?.trim() || "未标注";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()]
    .sort((left, right) => right[1].length - left[1].length)
    .slice(0, limit)
    .map(([category, rows]) => {
      const heat = median(rows.map((row) => row.heatValue).filter((value): value is number => value != null));
      const metric = rows.find((row) => row.heatMetric)?.heatMetric;
      return `${category} ${rows.length} 本${heat != null ? `（${formatHeat(metric, heat)}）` : ""}`;
    })
    .join("、");
}

export function buildPlatformAggregationText(platformLabel: string, snapshots: AggregationSnapshot[]): string {
  const allItems = snapshots.flatMap((snapshot) => snapshot.items.map((item) => ({
    ...item,
    listKey: snapshot.listKey,
    listLabel: snapshot.listLabel,
  })));
  if (allItems.length === 0) return "";

  const uniqueItems = new Map<string, (typeof allItems)[number] & { listLabels: string[]; listKeys: string[] }>();
  for (const item of allItems) {
    const key = `${item.title}::${item.author ?? ""}`;
    const existing = uniqueItems.get(key);
    if (existing) {
      existing.listLabels.push(`${item.listLabel}第${item.rank}名`);
      existing.listKeys.push(item.listKey);
      existing.heatValue = Math.max(existing.heatValue ?? 0, item.heatValue ?? 0) || existing.heatValue;
      existing.wordCount = existing.wordCount ?? item.wordCount;
      existing.category = existing.category ?? item.category;
      continue;
    }
    uniqueItems.set(key, { ...item, listLabels: [`${item.listLabel}第${item.rank}名`], listKeys: [item.listKey] });
  }
  const books = [...uniqueItems.values()];
  const metric = books.find((book) => book.heatMetric)?.heatMetric;

  const lines: string[] = [
    `平台：${platformLabel}`,
    `样本：${snapshots.length} 个榜单 / ${allItems.length} 条记录（去重 ${books.length} 本）`,
  ];

  const listLines = snapshots.map((snapshot) => {
    const heat = median(snapshot.items.map((item) => item.heatValue).filter((value): value is number => value != null));
    const words = median(snapshot.items.map((item) => item.wordCount).filter((value): value is number => value != null));
    return `- ${snapshot.listLabel}：${snapshot.items.length} 本${heat != null ? `（${formatHeat(snapshot.items.find((item) => item.heatMetric)?.heatMetric, heat)}）` : ""}${words != null ? `，字数中位 ${formatWordCount(words)}` : ""}`;
  });
  lines.push("榜单明细：", ...listLines);

  lines.push(`题材分布（按去重本数）：${topCategories(books, 10) || "无可识别题材"}`);

  const newBookItems = books.filter((book) => book.listKeys.some(isMarketNewBookListKey));
  const matureItems = books.filter((book) => !book.listKeys.some(isMarketNewBookListKey));
  if (newBookItems.length > 0) {
    const words = median(newBookItems.map((book) => book.wordCount).filter((value): value is number => value != null));
    lines.push(`新书样本：${newBookItems.length} 本；题材：${topCategories(newBookItems, 5) || "未标注"}${words != null ? `；字数中位 ${formatWordCount(words)}` : ""}`);
  }
  if (matureItems.length > 0) {
    const words = median(matureItems.map((book) => book.wordCount).filter((value): value is number => value != null));
    lines.push(`成熟榜样本：${matureItems.length} 本；题材：${topCategories(matureItems, 5) || "未标注"}${words != null ? `；字数中位 ${formatWordCount(words)}` : ""}`);
  }

  const tagCounts = new Map<string, number>();
  for (const book of books) {
    for (const tag of new Set(parseTags(book.tagsJson))) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  const topTags = [...tagCounts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 12);
  if (topTags.length > 0) {
    lines.push(`高频标签：${topTags.map(([tag, count]) => `${tag}（${count}）`).join("、")}`);
  }

  const overlaps = books
    .filter((book) => book.listLabels.length >= 2)
    .sort((left, right) => right.listLabels.length - left.listLabels.length)
    .slice(0, 8);
  lines.push(`多榜重合：${overlaps.length > 0 ? overlaps.map((book) => `${book.title}（${book.listLabels.join("、")}）`).join("；") : "无"}`);

  if (metric) {
    const overallHeat = median(books.map((book) => book.heatValue).filter((value): value is number => value != null));
    lines.push(`热度口径：${metric}（中位 ${formatCompactNumber(overallHeat)}，仅限本平台内部比较，不能与其他平台数值直接对比）`);
  } else {
    lines.push("热度口径：该平台公开榜单未提供可读取的热度数字，只按本数与题材分析");
  }

  return lines.join("\n");
}
