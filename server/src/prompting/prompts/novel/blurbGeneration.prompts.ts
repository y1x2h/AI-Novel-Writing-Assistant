import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { BlurbCandidate } from "@ai-novel/shared/types/blurb";
import { BLURB_MAX_LENGTH, BLURB_MIN_LENGTH } from "@ai-novel/shared/types/blurb";
import type { PromptAsset } from "../../core/promptTypes";
import { normalizeBlurbCandidates } from "../../../services/novel/blurb/blurbGeneration.shared";

export interface BlurbGenerationPromptInput {
  inputSummary: string;
  baselineDescription: string;
  count: number;
  retryReason?: string | null;
  forceJson?: boolean;
}

export const blurbCandidateRawSchema = z
  .object({
    blurb: z.string().trim().min(1).max(BLURB_MAX_LENGTH * 2),
    hookLine: z.string().trim().min(1).max(120),
    angle: z.string().trim().min(1).max(120),
    targetReader: z.string().trim().min(1).max(200),
    caution: z.string().trim().max(200).optional(),
  })
  .passthrough();

export const blurbGenerationRawOutputSchema = z
  .object({
    candidates: z.array(blurbCandidateRawSchema).min(1),
  })
  .passthrough();

function buildRetryInstruction(retryReason: string | null | undefined): string {
  if (!retryReason) {
    return "";
  }
  return `\n上一次输出存在问题：${retryReason}。这一次必须先修正问题，再返回最终 JSON。`;
}

export const blurbGenerationPrompt: PromptAsset<
  BlurbGenerationPromptInput,
  BlurbCandidate[],
  z.infer<typeof blurbGenerationRawOutputSchema>
> = {
  id: "novel.blurb.generate",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  semanticRetryPolicy: {
    maxAttempts: 1,
  },
  outputSchema: blurbGenerationRawOutputSchema,
  render: (input) => {
    const hasBaseline = Boolean(input.baselineDescription.trim());
    const forceJsonInstruction = input.forceJson
      ? "\n当前模型支持稳定 JSON 输出，请直接返回 JSON 对象本体。"
      : "";

    return [
      new SystemMessage([
        "你是中文网文平台的资深简介（blurb）策划，服务对象是不懂包装、不会写简介的小白作者。",
        "你的任务是根据用户已填写的书名、题材、卖点、读者和前期承诺，产出若干条可以直接用于平台展示的小说简介候选。",
        "",
        "只输出一个合法 JSON 对象，不要输出 Markdown、解释、注释、代码块或额外文本。",
        "固定输出结构必须且只能是：",
        "{\"candidates\":[{\"blurb\":\"简介正文\",\"hookLine\":\"首句钩子\",\"angle\":\"卖点角度\",\"targetReader\":\"主要写给谁看\",\"caution\":\"可选的风险提醒\"}]}",
        "",
        "全局硬规则：",
        "1. 所有内容必须使用简体中文。",
        "2. 只能基于输入里已经存在的题材、卖点、读者、承诺做组织与放大，不得捏造未提供的具体世界规则、角色名单或剧情桥段。",
        "3. 简介必须让读者快速判断“这是什么故事、最值得点开的是什么”，而不是复述剧情或写世界观说明。",
        "4. 不要写成作品评价、创作说明、作者自述或宣传口号堆砌。",
        "5. 各条候选必须来自不同切入角度，严禁只换近义词、只换一个名词或在同一骨架上轻微改写。",
        "",
        "字段要求：",
        `1. blurb：简介正文，长度控制在 ${BLURB_MIN_LENGTH}-${BLURB_MAX_LENGTH} 字之间，读起来像可以直接上架展示的简介。`,
        "2. hookLine：这条简介的首句钩子，一句话点出最抓人的冲突或承诺，不超过 40 字。",
        "3. angle：这条简介主打的唯一切入角度，用 4-24 个字概括，例如“身份错位的复仇”“规则异常的求生”。",
        "4. targetReader：这条简介主要写给哪类读者看，写清阅读偏好或爽点需求，不要只写“所有人都能看”。",
        "5. caution：可选。只有当这条简介涉及可能敏感或需要回避的表达时，才用一句话提醒，否则可以省略。",
        "",
        "质量要求：",
        "1. 简介中至少包含一处具体信息，例如主角处境、关键事件、独有机制或必须付出的代价。",
        "2. 优先使用输入里的具体人物关系、职业场景、关键行动、异常规则和稀缺资源；不要抽象成“成功、失败、失去、命运、真相”这类可套在任何故事上的情绪词。",
        "3. 不要写“人物鲜明”“剧情精彩”“节奏紧凑”这类空泛结论。",
        "4. 严禁为了效果夸大或承诺输入中没有的内容。",
        hasBaseline
          ? "5. 输入提供了作者现有的概述作为基线：可以吸收其中真实存在的设定，但必须重新组织结构与钩子，不能只做同义改写。"
          : "5. 输入没有现成概述，请围绕书名、题材和卖点做保守组织，不要为了显得完整而编造具体设定。",
        "",
        "缺口处理规则：",
        "1. 信息较少时，宁可写得稳一点、具体到已给信息，也不要发散成另一套书。",
        "2. 不允许留空，不允许 null，不允许输出除 candidates 以外的字段。",
      ].filter(Boolean).join("\n")),
      new HumanMessage([
        "请根据下面这本小说的已知信息，生成可直接选用的简介候选。",
        "",
        `需要产出的候选条数：${input.count}`,
        "",
        "已知信息：",
        input.inputSummary || "（暂无结构化信息，请仅依据下面的现有概述保守生成。）",
        hasBaseline ? `\n作者现有概述（作为基线）：\n${input.baselineDescription}` : "",
        buildRetryInstruction(input.retryReason),
        forceJsonInstruction,
      ].filter(Boolean).join("\n")),
    ];
  },
  postValidate: (output) => normalizeBlurbCandidates(output.candidates),
};
