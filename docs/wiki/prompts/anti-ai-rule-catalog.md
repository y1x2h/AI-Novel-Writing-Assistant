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
  5. 标点装饰性堆叠（把冒号、分号、破折号、感叹号、省略号、顿号当语气用）；
  6. 表层句法堆砌（名词前超过 6 个字的定语、一个分句里三个以上「的」、同一句叠用程度副词与「仿佛/好像/似乎」这类模糊词、填充虚词）；
  7. 对话与修辞（对话标签密度过高、解释性台词、套式微动作、比喻超量与「如……般」万能画面）。
- 前 3 类判为 `forbidden`：它们在小说正文里几乎没有正当用法。第 4、5 类判为 `risk`：二分句式和标点在中文里本身合法，问题出在「密集与对仗」，所以只提示、不硬禁。第 6 类里，程度副词与模糊词叠用几乎没有正当用法（`forbidden / medium / autoRewrite: true`，删掉多余程度词即正确）；而长定语、多个「的」、填充虚词在中文里合法（`risk / medium / autoRewrite: false`），问题只在过长与密集，交给修复链路判断而不是自动改写。第 7 类全部是 `risk / medium / autoRewrite: false`：对话与修辞的修法需要判断内容与人物视角，机械替换会把正确表达改坏。
- 标点类规则的边界必须写进 `promptInstruction`：质问里的问号、爆发峰值少量的感叹号、犹豫与打断的功能性省略号是正常写法，只清理无功能的堆叠。story-deslop 的标点原则与本节一致。
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
- 表层句法类指纹同时有确定性统计证据：`scanStyleSignals` 输出 `syntax.attributive-stack`（名词前修饰语长度）、`syntax.particle-overload`（一个句子里的「的」数量）、`surface.degree-adverb-stack`（程度副词与模糊词同句聚集，且必须至少出现一个真正的程度副词）、`surface.filler-stack`（填充虚词同句聚集）、`surface.punctuation-density`（句子单元内装饰性标点数量）、`surface.dialogue-tag-density`（对话标签数 ÷ 带引号的对白句数，默认 ≥0.5）。这些信号只是候选证据，**不是** 上述规则的 `ruleId`，也不授予修文许可；检测仍然由 LLM 结合聚集度与信息增量判断。阈值与词表维护在 `shared/types/styleEngine/signals.ts`。
- 统计信号的总量上限是 12 条、每条规则最多 2 条（`maxFindings` / `maxPerRule`）。新增信号排在既有信号之后 emit，避免挤占已有信号的配额；上限随信号种类增加而同步调整，否则后置信号会在 AI 味最重的文本里被饿死。

## Examples

- 伪诗意补语 → `forbidden / high / autoRewrite: true`。命中「象征着」「诉说着」时直接删除补语，句子落在具体画面上。
- 说明文连接词 → `forbidden / high / autoRewrite: true`。删除「此外」后直接写下一件事。
- 公关大词 → `forbidden / medium / autoRewrite: false`。因为需要替换成具体动作或数量，交给修复链路判断。
- 二分对照壳 → `risk / medium / autoRewrite: false`。同一段连续出现才算模板感，单次使用正常。
- 标点装饰性堆叠 → `risk / low / autoRewrite: false`。只提示按语义使用标点，并显式保留功能性的问号与少量感叹号。
- 套式微动作 → `risk / medium / autoRewrite: false`。「深吸一口气」「眼中闪过一丝」「嘴角勾起一抹」需要换成角色当下真实的动作。
- 比喻超量与套式修辞 → `risk / medium / autoRewrite: false`。比喻保持低频并贴合人物视角，删除「如……般」「宛如」「犹如」这类万能画面。
- 解释性台词 → `risk / medium / autoRewrite: false`。把替读者解释设定、动机、前情的台词改成动作、冲突或信息缺口。
- 长定语堆砌 → `risk / medium / autoRewrite: false`。「那个穿着灰色旧夹克的男人」在中文里合法，只有修饰语过长或连续堆砌才是问题，所以不自动改写。
- 「的」字过载 → `risk / medium / autoRewrite: false`。一个分句里三个以上「的」读起来拖沓，但修法是把修饰结构动词化、拆成短句，需要判断内容。
- 程度副词与模糊词堆叠 → `forbidden / medium / autoRewrite: true`。「非常……仿佛……好像」同句叠用几乎没有正当用法，删掉多余程度词就成立。

## 统计学校准（calibration）

### Background

反 AI 信号的阈值过去只有「工程初值」：改过词表或阈值后，没有任何机制能说明这会让检测变松还是变紧，也无法在回归时发现偏移。同时，规则在真人文本上会不会误触发，此前完全靠人工感觉。

### Decision

- 在 `server/src/services/styleEngine/calibration/` 下建立可复算的校准基线，语料以 `.txt` 提交进仓库，规模刻意保持小（当前 AI 语料 316 字、真人语料 179 字），保证任何人本地都能复现。
- 基线只记录事实：每条规则的 `hits`、`perKilo`（AI 语料每千字命中条数）与 `falsePositiveRate`（命中里来自真人语料的比例，作为误报代理指标）。
- 基线用 `signalRevision` 与信号策略 revision 绑定。改动 `shared/types/styleEngine/signals.ts` 的阈值、词表或新增信号后，必须同步提升 revision 并刷新基线，否则 `calibration.test.js` 直接失败。
- AI 语料必须覆盖全部 10 条信号；检测到某条规则在 AI 语料里零命中时，测试提示补样本，避免基线在无声中失效。

### Current Rule

- 刷新方式：在 `server` 目录执行 `pnpm run calibrate:signals`，把输出的 entries 与 `sampleCharacters` 粘回 `calibrationBaseline.ts`。
- 容差：`perKilo` 0.05、`falsePositiveRate` 0.02，`hits` 与 `sampleCharacters` 必须完全一致。
- 校准只服务回归与解释，不参与运行时判定，也不产生任何规则路由。
- 当前已知事实：`syntax.attributive-stack` 的 `falsePositiveRate` 为 0.5——真人语料里的 `巷子深处飘来煮面条的味道` 被误判为长定语。该信号的回溯没有在无边界词的短句中途停住，属于召回边界偏宽，已作为待收敛项保留在基线里，不在校准阶段顺手修改检测逻辑。

### Failure Modes

- **改了阈值不刷基线**：revision 不一致或数值漂移会让测试失败，这是期望行为，不要通过放宽容差绕过。
- **把语料当判定样本**：语料只用于复算与回归，不能拿它当"AI 味标准答案"，更不能据此做关键词判定。
- **扩大语料却不更新基线**：`sampleCharacters` 与 `hits` 是精确比对项，扩语料必须同一提交刷新基线。

## 改写力度分级（轻改 / 中改 / 重写）

### Background

零基础用户不会说「请在不删除剧情信息的前提下做句内改写」。他们只会说「帮我改轻一点」或「这段彻底重写」。同时，检测报告上的 `autoRewrite` 只回答了「这条规则能不能自动改」，没有回答「一次改写最多能动多少内容」，导致修复链路在有剧情功能的段落上删多了。

### Decision

- 改写力度是用户可见的三档旋钮：`in_place`（轻改）、`sentence`（中改）、`free`（重写），由 `styleRewriteScopeSchema` 承载。
- 每一档在 `STYLE_REWRITE_SCOPE_POLICY`（`server/src/services/styleEngine/rewrite/index.ts`）里对应两个确定性阈值：整选区最大删除比例 `maxDeletionRatio`，以及单个补丁至少保留的原片段字数比例 `perPatchMinRetention`。
  - `in_place`：删除 ≤5%，单补丁至少保留 90% → 只做词级、短语级等量替换，删掉整句立即触线。
  - `sentence`：删除 ≤15%，单补丁至少保留 50% → 允许整句重写，但不允许把整句删除。
  - `free`：删除 ≤35%，不设单补丁保留下限 → 允许段落级重写。
- 这是「结构化配置 → 阈值映射」，不是关键词判断：力度是用户在检测面板显式选择的枚举值，删除幅度由代码兜底，语义是否等价仍由 `style.rewrite.conservation` 的 AI 判定。
- 触线结果是 `deletion_budget` 检查 `blocked`：**保留原稿**，并在 `guard.escalations` 里逐补丁给出 `[需复核]` 原因。它属于局部质量债务，不阻塞全局自动导演链。

### Current Rule

- guard 契约新增三个字段：`scope`、`deletionRatio`、`escalations`（见 `shared/types/styleEngine/diagnostics.ts`）。三个字段都是**可选**的，兼容已经落库的旧 `rewriteGuard` 记录。
- 提示词 `style.rewrite` 必须同步渲染所选力度的约束文本（`STYLE_REWRITE_SCOPE_GUIDANCE`）。力度只改 prompt 与 guard 阈值，不改补丁协议本身。
- 默认力度是 `free`，与升级前的行为等价；未传 `scope` 时按 `free` 处理。
- 档位默认值属于保守初值，后续由统计学校准给出依据后再调整。

### Failure Modes

- **把力度做成新的自动判断分支**：力度必须是用户显式选择或调用方显式传入的枚举，不能由代码「猜」用户想要多重。
- **只改 guard 不改 prompt**：模型不知道上限，会持续产出越界补丁，表现为反复 blocked、任务空转。两侧必须同时更新。
- **把删除超限升级成全局失败**：删除超限是章节局部质量问题，只能保留原稿 + 标 `[需复核]`，不能中断自动导演链。

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
- 统计学校准：`server/src/services/styleEngine/calibration/`（`calibrationMetrics.ts`、`calibrationBaseline.ts`、`runCalibration.ts`、`corpus/`）。
- 改写护栏与力度阈值：`server/src/services/styleEngine/rewrite/index.ts`、`StyleRewriteService.ts`。
- 力度选择 UI：`client/src/components/styleReview/index.tsx`、`client/src/pages/writingFormula/components/WritingFormulaCleanPanel.tsx`、`client/src/pages/antiAiRules/components/AntiAiRuleEffectTestCard.tsx`。

## Source Documents

- 写法引擎总览：[平台写法配置与正文 Prompt 可编辑合同](./platform-writing-profiles.md)
- 质量守卫：[小说生成质量守卫机制](./novel-generation-quality-guards.md)
