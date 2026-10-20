import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";

export interface DirectorSpecClarificationPromptInput {
  specDigest: string;
}

export const directorSpecClarificationOutputSchema = z.object({
  questions: z.array(z.object({
    topic: z.string().trim().min(1).max(40),
    question: z.string().trim().min(1).max(200),
    whyItMatters: z.string().trim().min(1).max(200),
    suggestedAnswer: z.string().trim().min(1).max(300),
  })).max(5).default([]),
}).strict();

export type DirectorSpecClarificationOutput = z.infer<typeof directorSpecClarificationOutputSchema>;

export const directorSpecClarificationPrompt: PromptAsset<
  DirectorSpecClarificationPromptInput,
  DirectorSpecClarificationOutput
> = {
  id: "director.spec.clarify",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 3000 },
  repairPolicy: { maxAttempts: 1 },
  semanticRetryPolicy: { maxAttempts: 1 },
  outputSchema: directorSpecClarificationOutputSchema,
  structuredOutputHint: {
    example: {
      questions: [
        {
          topic: "主角核心欲望",
          question: "主角最想得到的到底是什么？",
          whyItMatters: "它决定全书的动机强度和读者代入感。",
          suggestedAnswer: "想夺回被家族剥夺的继承资格。",
        },
      ],
    },
    note: "questions 最多 5 条，每条的 topic/question/whyItMatters/suggestedAnswer 都要具体可执行，不要泛泛而谈。没有明显歧义时输出空数组。",
  },
  management: { productPrompt: true, editModes: ["readonly"] },
  render: (input) => [
    new SystemMessage([
      "你是中文网文开书顾问，服务对象是第一次写长篇的新手作者。",
      "用户刚选定了整本书的方向，但方向里往往还留有影响后续规划的模糊之处。",
      "你的任务是找出最多 5 处最值得先问清楚的关键歧义，并各给出一个可以直接采用的建议答案。",
      "",
      "挑选标准（按优先级）：",
      "1. 不澄清就会让后续大纲走向完全不同的设定，例如主角核心欲望、金手指规则边界、主要矛盾双方是谁。",
      "2. 会直接影响读者期待与爽点的选择，例如结局基调、感情线比重、主角道德底线。",
      "3. 与用户已填写的创作基础冲突或含义不清的地方。",
      "",
      "每条的写法要求：",
      "1. topic 用 4-10 个字点出歧义所在，不要写整句话。",
      "2. question 用一句新手一看就懂的大白话提问，不要用专业术语，不要一次问两件事。",
      "3. whyItMatters 用一句话说明不澄清会有什么影响，帮助新手理解为什么值得回答。",
      "4. suggestedAnswer 给出一个稳妥、好写、符合当前方向的具体答案，用户不满意可以改。",
      "5. 5 条之间不要重复同一个话题，也不要问无关紧要的小问题。",
      "",
      "只在确实存在影响规划的关键歧义时才提问；如果方向已经足够清晰，输出空的 questions 数组。",
      "只输出符合 schema 的 JSON，不要 Markdown、解释或额外文本。",
    ].join("\n")),
    new HumanMessage([
      "本书当前方向如下。",
      "",
      input.specDigest,
      "",
      "请输出需要向用户澄清的歧义 JSON。",
    ].join("\n")),
  ],
  postValidate: (output) => {
    const topicSet = new Set(output.questions.map((item) => item.topic.replace(/\s+/g, "")));
    if (topicSet.size !== output.questions.length) {
      throw new Error("澄清问题的话题不能重复。");
    }
    return output;
  },
};
