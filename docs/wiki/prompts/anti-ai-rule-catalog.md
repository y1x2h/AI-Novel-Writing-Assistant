# 反 AI 规则目录（Anti-AI Rule Catalog）

## Background

正文的「AI 味」是这个产品最直接的质量信号：新手用户无法自己判断哪里像 AI 写的，只能笼统地说「读起来很假」。因此反 AI 不靠作者自觉，而是由一条可编辑、可检测、可自动改写的规则目录承载。

规则目录分两层来源：

- **全局基线规则**（`globalBaselineEnabled = true`）：所有项目默认生效，构成产品级的去 AI 味底线。
- **写法专属规则**：由写法档案或任务绑定，只对特定作品生效。
- 用户还可以通过「反 AI 规则编辑助手」用自然语言生成新规则草稿（`antiAiRuleAiDraftSchema`），因此规则目录是**可扩展数据**，不是硬编码逻辑。

## Decision

- 规则类型只有三种语义：`forbidden`（明确禁止，通常可自动改写修复）、`risk`（需要注意的倾向，不做硬禁）、`encourage`（鼓励采用的正向写法）。新增规则必须归入其中之一，不引入新的判断分支。
- 中文 AI 句式指纹是一个必须持续补充的**层**，而不是一次性任务。它包含七类：
  1. 句尾伪诗意补语（象征着 / 诉说着 / 仿佛在暗示 / 充满了……的气息）；
  2. 说明文连接词（此外 / 值得注意的是 / 总而言之 / 由此可见 / 不难看出）；
  3. 公关广告腔大词（彰显 / 赋能 / 助力 / 完美诠释 / 淋漓尽致 / 叹为观止）；
  4. 二分对照壳（不是……而是…… / 不仅……更是…… / 与其说……不如说……）；
  5. 标点装饰性堆叠（把冒号、分号、破折号当语气用）；
  6. 表层句法堆砌（名词前超过 6 个字的定语、一个分句里三个以上「的」、同一句叠用程度副词与「仿佛/好像/似乎」这类模糊词）。
- 前 3 类判为 `forbidden`：它们在小说正文里几乎没有正当用法。第 4、5 类判为 `risk`：二分句式和标点在中文里本身合法，问题出在「密集与对仗」，所以只提示、不硬禁。第 6 类里，程度副词与模糊词叠用几乎没有正当用法（`forbidden / medium / autoRewrite: true`，删掉多余程度词即正确）；而长定语与多个「的」在中文里合法（`risk / medium / autoRewrite: false`），问题只在过长与密集，交给修复链路判断而不是自动改写。
- `detectPatterns` 只是给人和 AI 编辑看的线索，**不参与运行时匹配**；检测始终由 LLM 结合聚集度、信息增量与作品写法判断，不允许「命中单词即判违规」。
- 自动改写（`autoRewrite`）只给「删掉即正确」的规则：伪诗意补语、说明文连接词。需要判断替换内容的（公关大词、二分句式、标点）一律为 `false`，避免自动改写把句子改坏。

## Current Rule

- 规则定义集中在 `server/src/services/styleEngine/defaults.ts` 的 `DEFAULT_ANTI_AI_RULES`；新增规则的字段必须齐备：`key / name / type / severity / description / detectPatterns / rewriteSuggestion / promptInstruction / autoRewrite / enabled / globalBaselineEnabled`。
- 种子写入是 **missing_only**：按 `key` 补建缺失规则，不覆盖用户已编辑的既有规则。执行入口是 `ensureStyleEngineSeedData()`，它在风格档案、规则列表、写法解析等服务的入口处懒执行。**因此新增基线规则会自动进入已有用户的数据库，无需数据迁移。**
- 规则进入 prompt 的两条路径：
  - 写法合同 `antiAi` 段（`StyleCompiler.compileAntiAiRuleLines`）：渲染规则名、类型、严重度与 `promptInstruction`，供正文生成遵守。
  - 检测目录（`AntiAiRuleService` 生成的 catalog 文本）：供写法检测判断违规。
- 因为两条路径都没有条数上限，新增基线规则会直接增加正文 prompt 与检测 prompt 的长度。**补充规则时必须控制表述长度，并优先合并语义重叠的规则。**
- 检测 prompt 的「检测范围」里显式列出中文 AI 指纹类别（`style.prompts.ts`），与规则目录配合；只加规则不改检测说明，检测召回会明显偏低。
- 写作侧的自检清单（`StyleCompiler` 的 `selfCheck` 段）同步列出这些指纹，让模型在返回草稿前先自查。
- 表层句法类指纹同时有确定性统计证据：`scanStyleSignals` 输出 `syntax.attributive-stack`（名词前修饰语长度）、`syntax.particle-overload`（一个句子里的「的」数量）、`surface.degree-adverb-stack`（程度副词与模糊词同句聚集）。这些信号只是候选证据，**不是** 上述规则的 `ruleId`，也不授予修文许可；检测仍然由 LLM 结合聚集度与信息增量判断。阈值与词表维护在 `shared/types/styleEngine/signals.ts`。

## Examples

- 伪诗意补语 → `forbidden / high / autoRewrite: true`。命中「象征着」「诉说着」时直接删除补语，句子落在具体画面上。
- 说明文连接词 → `forbidden / high / autoRewrite: true`。删除「此外」后直接写下一件事。
- 公关大词 → `forbidden / medium / autoRewrite: false`。因为需要替换成具体动作或数量，交给修复链路判断。
- 二分对照壳 → `risk / medium / autoRewrite: false`。同一段连续出现才算模板感，单次使用正常。
- 标点装饰性堆叠 → `risk / low / autoRewrite: false`。只提示按语义使用标点。
- 长定语堆砌 → `risk / medium / autoRewrite: false`。「那个穿着灰色旧夹克的男人」在中文里合法，只有修饰语过长或连续堆砌才是问题，所以不自动改写。
- 「的」字过载 → `risk / medium / autoRewrite: false`。一个分句里三个以上「的」读起来拖沓，但修法是把修饰结构动词化、拆成短句，需要判断内容。
- 程度副词与模糊词堆叠 → `forbidden / medium / autoRewrite: true`。「非常……仿佛……好像」同句叠用几乎没有正当用法，删掉多余程度词就成立。

## Failure Modes

- **把可编辑基线规则做成硬编码黑名单**：会让用户无法调整规则库，也违反 AI-First 原则。规则必须是数据。
- **用 `detectPatterns` 直接做运行时字符串匹配**：会把正常的「不是……而是……」全部误判为违规。检测只能由模型做语义判断。
- **给需要判断替换内容的规则打开 `autoRewrite`**：自动改写容易把正确句子改坏，尤其在二分句式与标点规则上。
- **只加规则、不同步检测说明与自检清单**：规则进了目录但检测召回不足，用户看到的是「规则有了但没抓到」。
- **把统计阈值当成硬判定**：长定语与多个「的」在中文里合法，若用固定长度或计数直接判违规，会把正常句子判成 AI 味。信号只能作为候选证据进入检测 prompt，由模型结合聚集度与信息增量判断。
- **无限膨胀基线规则**：基线规则没有条数上限，正文 prompt 会随之变长。语义重叠的规则必须先合并再新增。

## Related Modules

- 规则定义与种子：`server/src/services/styleEngine/defaults.ts`、`StyleEngineSeedService.ts`、`AntiAiRuleService.ts`。
- 合同渲染与自检：`server/src/services/styleEngine/StyleCompiler.ts`、`styleContractText.ts`。
- 检测与改写 prompt：`server/src/prompting/prompts/style/style.prompts.ts`、`style.promptSchemas.ts`。
- 规则生效策略：`server/src/services/styleEngine/AntiAiPolicyResolver.ts`。

## Source Documents

- 写法引擎总览：[平台写法配置与正文 Prompt 可编辑合同](./platform-writing-profiles.md)
- 质量守卫：[小说生成质量守卫机制](./novel-generation-quality-guards.md)
