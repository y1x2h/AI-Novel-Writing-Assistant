import { z } from "zod";

export const styleRiskLayerSchema = z.enum(["surface", "discourse", "narrative"]);
export type StyleRiskLayer = z.infer<typeof styleRiskLayerSchema>;

/**
 * 改写力度分级：原位只做词级等量替换，句内允许整句重写，自由允许段落级重组。
 * 它是用户可见的三档「轻改 / 中改 / 重写」，不是关键词路由。
 */
export const styleRewriteScopeSchema = z.enum(["in_place", "sentence", "free"]);
export type StyleRewriteScope = z.infer<typeof styleRewriteScopeSchema>;

export const styleRewriteEscalationSchema = z.object({
  patchIndex: z.number().int().nonnegative(),
  code: z.literal("needs_review"),
  reason: z.string(),
});
export type StyleRewriteEscalation = z.infer<typeof styleRewriteEscalationSchema>;

/**
 * AI 对单条命中的处理去向：确需修改、应保留、需要作者判断。
 * keep / human_review 只作为报告，不授予自动改写权限。
 */
export const styleIssueDispositionSchema = z.enum(["fix", "keep", "human_review"]);
export type StyleIssueDisposition = z.infer<typeof styleIssueDispositionSchema>;

/** 改写后复测里新增的问题条目；只描述可以定位到原文的候选回归。 */
export const styleRewriteRecheckIssueSchema = z.object({
  ruleId: z.string(),
  ruleName: z.string(),
  severity: z.enum(["low", "medium", "high"]),
  excerpt: z.string(),
});
export type StyleRewriteRecheckIssue = z.infer<typeof styleRewriteRecheckIssueSchema>;

/**
 * 改写前后对照：按规则身份比较两次检测输出。
 * resolved / remaining 是数量口径，introduced 只在天平上新增时出现。
 */
export const styleRewriteRecheckSchema = z.object({
  beforeRiskScore: z.number(),
  afterRiskScore: z.number(),
  resolved: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
  introduced: z.array(styleRewriteRecheckIssueSchema),
  /**
   * 过度修正告警：改写在去味方向上矫枉过正（改出的问题不少于已解决的问题，
   * 或改写后风险参考分反而升高）。advisory 性质，不阻断采用，只提醒用户对照原稿。
   */
  overCorrection: z.object({
    detected: z.boolean(),
    reason: z.string(),
  }).optional(),
});
export type StyleRewriteRecheck = z.infer<typeof styleRewriteRecheckSchema>;

export const styleRewriteGuardSchema = z.object({
  sourceContentHash: z.string(),
  candidateContentHash: z.string(),
  policyRevision: z.string(),
  touchedRatio: z.number().nonnegative(),
  addedCharacters: z.number().int().nonnegative(),
  lengthChangeRatio: z.number(),
  /** 新增字段保持可选，兼容已经落库的旧记录。 */
  scope: styleRewriteScopeSchema.optional(),
  deletionRatio: z.number().nonnegative().optional(),
  escalations: z.array(styleRewriteEscalationSchema).optional(),
  checks: z.array(z.object({
    code: z.enum(["patch_scope", "edit_budget", "deletion_budget", "protected_terms", "protected_fragment", "semantic_facts", "style_regression", "over_correction"]),
    status: z.enum(["passed", "blocked", "not_checked", "advisory"]),
    reason: z.string(),
  })),
});
export type StyleRewriteGuard = z.infer<typeof styleRewriteGuardSchema>;

export interface StyleRewriteBaseline {
  sourceContentHash: string;
  changes: Array<{ original: string; replacement: string }>;
  allowedCorrectionIssueIds: string[];
}

/** An enabled rule never overrides the AI's decision about this particular passage. */
export function isStyleIssueRewritable(issue: {
  layer?: StyleRiskLayer;
  canAutoRewrite?: boolean;
  issueCategory?: string;
}, rulePermission = true): boolean {
  return rulePermission && issue.canAutoRewrite === true
    && (issue.layer === "surface" || issue.layer === "discourse")
    && issue.issueCategory !== "story_structure";
}
