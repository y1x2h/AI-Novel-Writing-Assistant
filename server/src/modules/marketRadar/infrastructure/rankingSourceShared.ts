export interface CollectedRankingItem {
  rank: number;
  title: string;
  author?: string;
  category?: string;
  tags: string[];
  synopsis?: string;
  heatLabel?: string;
  heatMetric?: string;
  heatValue?: number;
  wordCount?: number;
  serialStatus?: string;
  sourceUrl: string;
}

export const DESKTOP_USER_AGENT = "Mozilla/5.0 (compatible; AI-Novel-Market-Radar/1.0; public-ranking-metadata-only)";
export const MOBILE_USER_AGENT = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: '"',
};

export function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, key: string) => {
    if (key.startsWith("#")) {
      const hexadecimal = key[1]?.toLowerCase() === "x";
      const code = Number.parseInt(key.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    }
    return NAMED_ENTITIES[key.toLowerCase()] ?? "";
  });
}

export function plainText(value: string | undefined | null): string {
  return decodeEntities((value ?? "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

export function absoluteUrl(base: string, value: string): string {
  return new URL(value.startsWith("//") ? `https:${value}` : value, base).toString();
}

export function extractTags(synopsis: string): string[] {
  const bracketed = synopsis.match(/^[【〖\[]([^】〗\]]+)[】〗\]]/g) ?? [];
  return bracketed.flatMap((part) => plainText(part).replace(/^[【〖\[]|[】〗\]]$/g, "").split(/[+＋、|]/))
    .map((tag) => tag.trim()).filter(Boolean).slice(0, 12);
}

export function hasPrivateUseCharacters(value: string | null | undefined): boolean {
  return /[\uE000-\uF8FF]/u.test(value ?? "");
}

export function toInteger(value: unknown): number | undefined {
  const numeric = typeof value === "number" ? value : Number.parseInt(String(value ?? "").replace(/[^\d]/g, ""), 10);
  return Number.isFinite(numeric) ? numeric : undefined;
}

export function parseCompactNumber(value: string | null | undefined): number | undefined {
  const text = (value ?? "").trim();
  if (!text) return undefined;
  const matched = text.match(/([\d.]+)\s*(亿|万)?/);
  if (!matched) return undefined;
  const base = Number.parseFloat(matched[1]);
  if (!Number.isFinite(base)) return undefined;
  const unit = matched[2];
  const multiplier = unit === "亿" ? 100_000_000 : unit === "万" ? 10_000 : 1;
  return Math.round(base * multiplier);
}

export function formatCompactNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}亿`;
  if (value >= 10_000) return `${(value / 10_000).toFixed(1)}万`;
  return String(value);
}

export async function fetchPage(
  url: string,
  options: { userAgent?: string; charset?: string } = {},
): Promise<string> {
  const response = await fetch(url, {
    headers: { "user-agent": options.userAgent ?? DESKTOP_USER_AGENT },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`榜单页面返回 HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  if (options.charset) return new TextDecoder(options.charset).decode(bytes);
  const headerCharset = response.headers.get("content-type")?.match(/charset=([^;]+)/i)?.[1]?.trim();
  const metaProbe = new TextDecoder("latin1").decode(bytes.slice(0, 4096));
  const metaCharset = metaProbe.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1];
  const charset = headerCharset || metaCharset || "utf-8";
  return new TextDecoder(charset).decode(bytes);
}

function sliceBalancedJson(text: string, startIndex: number): string | null {
  const start = text.indexOf("{", startIndex);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === "\"") inString = false;
      continue;
    }
    if (char === "\"") inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return null;
}

export function extractJsonAfterMarker(html: string, marker: string): unknown {
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) throw new Error("页面未提供可解析的榜单数据");
  const slice = sliceBalancedJson(html, markerIndex + marker.length);
  if (!slice) throw new Error("页面榜单数据不完整");
  return JSON.parse(slice) as unknown;
}

export function extractScriptJsonById(html: string, id: string): unknown {
  const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matched = html.match(new RegExp(`<script[^>]+id=["']${escapedId}["'][^>]*>([\\s\\S]*?)</script>`, "i"));
  if (!matched) throw new Error("页面未提供可解析的榜单数据");
  return JSON.parse(matched[1]) as unknown;
}

export function numberField(text: string, field: string): number | undefined {
  const matched = text.match(new RegExp(`"${field}"\\s*:\\s*(\\d+)`));
  return matched ? Number.parseInt(matched[1], 10) : undefined;
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}
