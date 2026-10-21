import type { ChapterRuntimePackage } from "@ai-novel/shared/types/chapterRuntime";

/**
 * 修复输入使用的结构化锚点。
 *
 * 确定性检测（正文自然度检测、验收评估）把问题锚定在 `第 N 行：摘录` 形式上，
 * 但压扁成 ReviewIssue 后行号与摘录会丢失，修复器只能自由改写、靠猜定位。
 * 这里把审计层已有的锚点原样透传给修复器，属于对已结构化输出的确定性后处理，
 * 不引入任何基于关键词的判断或路由。
 */
export interface ChapterRepairAnchoredFinding {
  code: string;
  auditType: string;
  severity: string;
  /** 证据文本中的行号；检测未给出行号时为 null。 */
  line: number | null;
  /** 可直接回查正文的原文摘录；无法确定时为 null。 */
  excerpt: string | null;
  /** 原始证据文本，保留检测给出的上下文。 */
  evidence: string;
  fixSuggestion: string;
}

const LINE_ANCHOR_PATTERN = /^第\s*(\d+)\s*行\s*[：:]\s*(.+)$/u;
const QUOTED_EXCERPT_PATTERN = /[「“"]([^」”"]{2,})[」”"]/u;

function parseEvidenceAnchor(evidence: string): { line: number | null; excerpt: string | null } {
  const trimmed = evidence.trim();
  const lineMatch = LINE_ANCHOR_PATTERN.exec(trimmed);
  if (lineMatch) {
    const line = Number.parseInt(lineMatch[1], 10);
    const excerpt = lineMatch[2].trim();
    return {
      line: Number.isFinite(line) ? line : null,
      excerpt: excerpt.length > 0 ? excerpt : null,
    };
  }
  const quoted = QUOTED_EXCERPT_PATTERN.exec(trimmed);
  return { line: null, excerpt: quoted ? quoted[1].trim() : null };
}

/** 从审计层 openIssues 提取修复器可直接定位的锚点列表。 */
export function extractRepairAnchors(
  runtimePackage: ChapterRuntimePackage | null | undefined,
): ChapterRepairAnchoredFinding[] {
  const openIssues = runtimePackage?.audit.openIssues ?? [];
  return openIssues.flatMap((issue) => {
    const code = typeof issue.code === "string" ? issue.code.trim() : "";
    if (!code) {
      return [];
    }
    const evidence = typeof issue.evidence === "string" ? issue.evidence : "";
    const { line, excerpt } = parseEvidenceAnchor(evidence);
    return [{
      code,
      auditType: issue.auditType,
      severity: issue.severity,
      line,
      excerpt,
      evidence,
      fixSuggestion: issue.fixSuggestion,
    }];
  });
}
