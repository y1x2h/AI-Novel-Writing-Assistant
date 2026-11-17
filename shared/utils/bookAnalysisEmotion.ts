import type { BookAnalysisEmotionNode } from "../types/bookAnalysis";

const SOURCE_REF_LIMIT = 8;
const INTENSITY_MIN = -9;
const INTENSITY_MAX = 9;

function normalizeStringList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, limit);
}

function normalizeIntensity(value: unknown): number | undefined {
  const num = typeof value === "string" ? Number(value) : value;
  if (typeof num !== "number" || !Number.isFinite(num)) {
    return undefined;
  }
  return Math.max(INTENSITY_MIN, Math.min(INTENSITY_MAX, Math.round(num)));
}

export function normalizeBookAnalysisEmotionNode(value: unknown): BookAnalysisEmotionNode | null {
  if (typeof value === "string") {
    const label = value.trim();
    return label ? { label } : null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const row = value as Record<string, unknown>;
  const label = typeof row.label === "string" ? row.label.trim() : "";
  if (!label) {
    return null;
  }

  const emotionType = typeof row.emotionType === "string" ? row.emotionType.trim() : "";
  const technique = typeof row.technique === "string" ? row.technique.trim() : "";
  const intensity = normalizeIntensity(row.intensity);
  const sourceRefs = normalizeStringList(row.sourceRefs, SOURCE_REF_LIMIT);

  return {
    label,
    ...(emotionType ? { emotionType } : {}),
    ...(intensity !== undefined ? { intensity } : {}),
    ...(technique ? { technique } : {}),
    ...(sourceRefs.length > 0 ? { sourceRefs } : {}),
  };
}

export function normalizeBookAnalysisEmotionNodes(value: unknown, limit: number): BookAnalysisEmotionNode[] {
  const source = Array.isArray(value) ? value : typeof value === "string" && value.trim() ? [value] : [];
  return source
    .map((item) => normalizeBookAnalysisEmotionNode(item))
    .filter((item): item is BookAnalysisEmotionNode => Boolean(item))
    .slice(0, limit);
}
