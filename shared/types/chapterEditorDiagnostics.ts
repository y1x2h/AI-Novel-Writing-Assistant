/**
 * 章节编辑器手动诊断的「已处理问题」熔断契约。
 *
 * 背景：编辑器「重新分析本章」每次都让 AI 全量重新诊断，AI 措辞漂移会把
 * 已经处理过的同一问题换个说法再次报出（打地鼠循环），用户被迫反复优化。
 *
 * 决策：问题卡被完整处理（AI 候选全部接受并保存正文，或作者手动确认完成）后，
 * 在 chapter.riskFlags.editorHandledDiagnostics 记录标题指纹。之后的诊断投影里，
 * 标题指纹匹配的卡片不再出现；同时把已处理标题注入诊断 prompt，
 * 让 AI 知道这些问题已经处理过，不要重复报告。
 *
 * 边界：这里只做标题级指纹匹配，不追踪锚定文本。宁可在文本被作者改回后
 * 漏报一次（可手动重新说明问题），也不让同一问题无限循环消耗作者。
 */

export interface ChapterEditorHandledDiagnostic {
  /** 原始标题，用于诊断 prompt 注入与排查。 */
  title: string;
  /** 规范化后的标题指纹，匹配只用这个字段。 */
  titleKey: string;
  /** 问题摘要，帮助诊断 AI 理解当时处理的是什么。 */
  problemSummary?: string;
  /** ISO 时间戳。 */
  handledAt: string;
}

export const CHAPTER_EDITOR_HANDLED_DIAGNOSTICS_LIMIT = 30;
/** 注入诊断 prompt 的最近已处理记录条数。 */
export const CHAPTER_EDITOR_HANDLED_DIAGNOSTICS_PROMPT_LIMIT = 8;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseRiskFlagsObject(value: string | null | undefined): Record<string, unknown> | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** 标题指纹：去空白与标点、小写化，让措辞轻微漂移的同一问题命中同一指纹。 */
export function normalizeChapterEditorDiagnosticTitle(title: string | null | undefined): string {
  return (title ?? "")
    .toLowerCase()
    .replace(/[\s　]+/g, "")
    .replace(/[，。、；：？！…—·「」『』“”‘’（）()\[\]《》<>,.;:?!'"`~]/g, "")
    .trim();
}

/**
 * 标题指纹匹配：完全相等，或互相包含且较短部分不少于 4 个字符。
 * 「互相包含」覆盖 AI 复检时对同一问题加后缀/前缀的措辞漂移。
 */
export function chapterEditorDiagnosticTitlesMatch(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const a = normalizeChapterEditorDiagnosticTitle(left);
  const b = normalizeChapterEditorDiagnosticTitle(right);
  if (!a || !b) {
    return false;
  }
  if (a === b) {
    return true;
  }
  const shorter = a.length <= b.length ? a : b;
  if (shorter.length < 4) {
    return false;
  }
  return a.includes(b) || b.includes(a);
}

export function readChapterEditorHandledDiagnostics(
  riskFlags: string | null | undefined,
): ChapterEditorHandledDiagnostic[] {
  const list = parseRiskFlagsObject(riskFlags)?.editorHandledDiagnostics;
  if (!Array.isArray(list)) {
    return [];
  }
  return list.filter(isRecord).flatMap((item) => {
    const title = typeof item.title === "string" ? item.title.trim() : "";
    if (!title) {
      return [];
    }
    return [{
      title,
      titleKey: typeof item.titleKey === "string" && item.titleKey
        ? item.titleKey
        : normalizeChapterEditorDiagnosticTitle(title),
      problemSummary: typeof item.problemSummary === "string" && item.problemSummary.trim()
        ? item.problemSummary.trim()
        : undefined,
      handledAt: typeof item.handledAt === "string" ? item.handledAt : "",
    }];
  });
}

/**
 * 追加一条已处理记录并返回新的 riskFlags JSON。
 * 按 titleKey 去重（保留最新时间），超出上限时丢弃最旧记录。
 * title 为空时返回 null，调用方应跳过写入。
 */
export function appendChapterEditorHandledDiagnostic(
  riskFlags: string | null | undefined,
  input: { title: string; problemSummary?: string | null },
  now: Date = new Date(),
): string | null {
  const title = input.title.trim();
  const titleKey = normalizeChapterEditorDiagnosticTitle(title);
  if (!title || !titleKey) {
    return null;
  }
  const existing = readChapterEditorHandledDiagnostics(riskFlags)
    .filter((record) => record.titleKey !== titleKey);
  const next: ChapterEditorHandledDiagnostic[] = [
    ...existing,
    {
      title,
      titleKey,
      problemSummary: input.problemSummary?.trim() || undefined,
      handledAt: now.toISOString(),
    },
  ].slice(-CHAPTER_EDITOR_HANDLED_DIAGNOSTICS_LIMIT);
  const root = parseRiskFlagsObject(riskFlags) ?? {};
  return JSON.stringify({ ...root, editorHandledDiagnostics: next });
}

export function isChapterEditorDiagnosticHandled(
  title: string | null | undefined,
  records: ChapterEditorHandledDiagnostic[],
): boolean {
  if (!normalizeChapterEditorDiagnosticTitle(title)) {
    return false;
  }
  return records.some((record) => chapterEditorDiagnosticTitlesMatch(record.titleKey, title));
}
