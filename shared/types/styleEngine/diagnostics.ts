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
    code: z.enum(["patch_scope", "edit_budget", "deletion_budget", "protected_terms", "semantic_facts"]),
    status: z.enum(["passed", "blocked", "not_checked"]),
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
