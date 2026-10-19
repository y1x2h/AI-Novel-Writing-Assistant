import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { NovelComplianceScope } from "@ai-novel/shared/types/novelCompliance";
import type { PromptAsset } from "../../core/promptTypes";

export interface NovelCompliancePrecheckInput {
  scope: NovelComplianceScope;
  title: string;
  basicDigest: string;
  worldDigest: string;
  characterDigest: string;
  outlineDigest: string;
  chapterDigest: string;
}

export const novelComplianceOutputSchema = z.object({
  level: z.enum(["pass", "warn", "block"]),
  summary: z.string().trim().min(1).max(600),
  items: z.array(z.object({
    rule: z.string().trim().min(1).max(120),
    dimension: z.enum(["ip_infringement", "platform_content"]),
    severity: z.enum(["high", "medium", "low"]),
    excerpt: z.string().trim().min(1).max(300),
    suggestion: z.string().trim().min(1).max(300),
    locationHint: z.string().trim().max(120).nullish(),
  })).max(20).default([]),
}).strict();

export type NovelComplianceOutput = z.infer<typeof novelComplianceOutputSchema>;

export const novelCompliancePrecheckPrompt: PromptAsset<NovelCompliancePrecheckInput, NovelComplianceOutput> = {
  id: "novel.compliance.precheck",
  version: "v1",
  taskType: "critical_review",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 12000 },
  outputSchema: novelComplianceOutputSchema,
  repairPolicy: { maxAttempts: 1 },
  semanticRetryPolicy: { maxAttempts: 1 },
  management: { productPrompt: true, editModes: ["readonly"] },
  render: (input) => [
    new SystemMessage([
      "你是中文网络小说的平台合规预检员，负责在作品进入连载或导出投稿前发现高频驳回与侵权风险。",
      "只检查两个维度：",
      "1）ip_infringement：真实公众人物、真实机构与企业、真实品牌商品、真实地名影射到具体真人真事，以及未经授权直接使用知名 IP 的名称、门派、道具、专有设定。",
      "2）platform_content：违法违规内容、低俗擦边、过度暴力血腥、封建迷信被当作事实宣扬、危险行为可操作性描写、未成年人不当内容。",
      "判定口径：level=pass 表示未发现明显风险；level=warn 表示可以继续但建议改写；level=block 表示进入连载或投稿前必须处理。",
      "excerpt 必须是作品材料里的原文片段或设定名称，不要改写。suggestion 要写给新手作者看得懂的具体改法。",
      "locationHint 指出该风险出现在哪一卷、哪一章或哪一项设定；定位不到时留空。",
      "只输出符合 schema 的 JSON，不要 Markdown、解释或额外文本。",
    ].join("\n")),
    new HumanMessage([
      `【检查范围】${input.scope === "planning" ? "规划材料（设定与大纲）" : "整本（设定、大纲与已写正文）"}`,
      `【书名】${input.title}`,
      `【基础信息】\n${input.basicDigest}`,
      `【世界观与设定】\n${input.worldDigest}`,
      `【人物与关系】\n${input.characterDigest}`,
      `【大纲与卷章规划】\n${input.outlineDigest}`,
      `【正文材料】\n${input.chapterDigest}`,
      "",
      "请输出合规预检报告 JSON。",
    ].join("\n")),
  ],
  postValidate: (output) => {
    if (output.level === "pass" && output.items.length > 0) {
      throw new Error("合规预检结果自相矛盾：等级为 pass 时不应包含风险项。");
    }
    if (output.level !== "pass" && output.items.length === 0) {
      throw new Error("合规预检结果自相矛盾：等级不是 pass 时必须给出风险项。");
    }
    return output;
  },
};
