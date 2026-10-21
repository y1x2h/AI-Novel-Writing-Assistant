import { z } from "zod";

const terms = z.array(z.string().min(1).max(24)).max(32);
/** Versioned candidate-evidence policy; never an automatic rewriting policy. */
export const styleSignalPolicySchema = z.object({
  revision: z.literal("style-signals-v1"),
  transitionTerms: terms.default(["值得注意的是", "不可否认", "毋庸置疑", "总而言之", "综上所述", "在这个过程中", "从某种意义上说"]),
  softenerTerms: terms.default(["似乎", "仿佛", "好像", "某种", "一种", "难以言喻", "莫名", "隐隐"]),
  actionAdverbTerms: terms.default(["缓缓", "微微", "轻轻", "不禁", "下意识", "忍不住", "悄然"]),
  degreeAdverbTerms: terms.default(["非常", "十分", "极其", "特别", "格外", "异常", "无比", "相当"]),
  punctuationTerms: terms.default(["！", "？", "…", "、"]),
  dialogueTagTerms: terms.default(["说道", "问道", "笑道", "喊道", "嚷道", "答道", "吼道"]),
  fillerTerms: terms.default(["说到底", "说白了", "反正", "毕竟", "话又说回来"]),
  minSentenceCharacters: z.number().int().min(1).max(100).default(12),
  longSentenceCharacters: z.number().int().min(12).max(2000).default(80),
  commaCount: z.number().int().min(1).max(100).default(4),
  clusterCount: z.number().int().min(2).max(20).default(3),
  attributiveMinCharacters: z.number().int().min(4).max(20).default(7),
  particleCount: z.number().int().min(2).max(12).default(3),
  punctuationCount: z.number().int().min(2).max(16).default(4),
  fillerCount: z.number().int().min(2).max(8).default(2),
  dialogueMinSentences: z.number().int().min(2).max(40).default(4),
  dialogueTagRatio: z.number().min(0.2).max(1).default(0.5),
  /** 对白字数占比下限；低于该值仅作为「叙述压倒对白」的候选证据，不硬判定。 */
  dialogueRatioMin: z.number().min(0).max(0.5).default(0.05),
  /** 对白字数占比上限；高于该值仅作为「对白淹没叙述」的候选证据，不硬判定。 */
  dialogueRatioMax: z.number().min(0.2).max(1).default(0.8),
  /** 连续对白段落轮次上限；超过则提示连续对白缺少叙述穿插。 */
  talkLoopRounds: z.number().int().min(2).max(60).default(10),
  /** 只有正文可见字数达到该值才评估对白占比，避免片段或极短文本误报。 */
  dialogueRatioMinCharacters: z.number().int().min(200).max(8000).default(600),
  transitionRepeatCount: z.number().int().min(2).max(20).default(2),
  maxPerRule: z.number().int().min(1).max(2).default(2),
  maxFindings: z.number().int().min(1).max(12).default(12),
  excerptCharacters: z.number().int().min(24).max(240).default(160),
});
export type StyleSignalPolicy = z.infer<typeof styleSignalPolicySchema>;
export const createStyleSignalPolicy = (): StyleSignalPolicy => styleSignalPolicySchema.parse({ revision: "style-signals-v1" });

type StyleSignalThresholdKey = Exclude<keyof StyleSignalPolicy, "revision">;

/**
 * 写法档案可选的阈值覆盖：只声明要改的项，未声明的回退到全局默认基线。
 * 逐字段去掉默认值，否则解析空对象也会把整份全局默认填回来，覆盖就失去意义。
 */
export const styleSignalPolicyOverrideSchema = z.object(
  Object.fromEntries(
    (Object.keys(styleSignalPolicySchema.shape) as Array<keyof StyleSignalPolicy>)
      .filter((key): key is StyleSignalThresholdKey => key !== "revision")
      .map((key) => {
        const field = styleSignalPolicySchema.shape[key] as z.ZodDefault<z.ZodTypeAny>;
        return [key, field.unwrap().optional()];
      }),
  ),
) as unknown as z.ZodType<StyleSignalPolicyOverride>;
export type StyleSignalPolicyOverride = Partial<Omit<StyleSignalPolicy, "revision">>;

export const styleSignalFindingSchema = z.object({
  ruleId: z.enum([
    "template.transition",
    "rhythm.comma-density",
    "surface.repeated-softeners",
    "surface.action-adverb-stack",
    "syntax.attributive-stack",
    "syntax.particle-overload",
    "surface.degree-adverb-stack",
    "surface.punctuation-density",
    "surface.filler-stack",
    "surface.dialogue-tag-density",
  ]),
  excerpt: z.string().min(1).max(480),
  from: z.number().int().nonnegative(),
  to: z.number().int().nonnegative(),
  matchedTerms: z.array(z.string()).max(32),
  hits: z.number().int().nonnegative(),
  characters: z.number().int().nonnegative(),
  commas: z.number().int().nonnegative(),
  matchFrom: z.number().int().nonnegative().optional(),
});
export type StyleSignalFinding = z.infer<typeof styleSignalFindingSchema>;
export const styleSignalScanSchema = z.object({
  policy: styleSignalPolicySchema,
  sourceContentHash: z.string(),
  coordinateSystem: z.literal("utf16-crlf-normalized"),
  findings: z.array(styleSignalFindingSchema).max(12),
});
export type StyleSignalScan = z.infer<typeof styleSignalScanSchema>;
