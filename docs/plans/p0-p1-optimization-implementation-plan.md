# P0 / P1 优化项实现方案

- 来源分析：`docs/analysis/external-novel-skill-benchmark-2026-10-21.md`（附录 2 定义能力、附录 5 定优先级）
- 本文性质：**只出方案，不改代码、不跑构建、不动 git**

## Context（为什么做）

两轮外部对标（`oh-story-skill` 等）确认：本项目「去 AI 味」的两层体系（确定性统计信号 + 可编辑规则数据）架构方向已对齐，差距在**护栏、证据覆盖面与方法学**。附录 5 选出 5 项 P0/P1：

| 优先级 | 编号 | 能力 |
| --- | --- | --- |
| P0 | A2-1 | 规则统计学校准 + 禁改清单 + 按写法调门限 + 改动台账 |
| P0 | A2-2 | 改写力度分级（自由/句内/原位），合并 T1-2 删除比例上限 |
| P1 | A2-3 | 跨章结构相似度检查 |
| P1 | A2-8 | 对话占比 /「话疗」密度 |
| P1 | A2-9 | 简介（blurb）生成 |

预期结果：把反 AI 检测从「工程初值」推进到**可回归、可解释、可调**；给零基础用户一个**力度旋钮**；补齐章节审计与包装环节缺口。

---

## 全局约束（必须遵守）

1. **AI-first**：确定性统计只作**候选证据或对已结构化 AI 输出的后处理**，不得做关键词/正则硬判定或路由。
2. **Prompt Governance**：新增产品提示词必须是 `server/src/prompting/prompts/<family>/` 下的 PromptAsset，并在 `server/src/prompting/registry/promptAssetLoaderEntries.ts` 注册（含 `id/version/taskType/mode/contextPolicy/outputSchema`）。
3. **架构**：单文件 ≤1200 行（>1300 强制拆分）；新能力放入有明确归属的目录。
4. **数据保护**：任何 prisma 变更只做 **additive migration**，禁止 `migrate reset`；迁移前备份应用数据目录 `dev.db`。
5. **非阻塞**：局部质量债务不阻塞全局链（AGENTS.md Auto-Director 质量门规则）。

## 前置核对（实施第一步，避免重复实现）

memory 中记录过「改写收敛终止 / 分级删除比例 / 检测豁免清单 / 逐规则校准基线」等约定，但近期基线核对把它们列为**未落地**。实施前必须先确认，命中已实现则该项只补缺口：

```bash
# 逐项确认是否存在实现（预期：多数为空，仅作二次确认）
rg -n "rewriteScope|in_place|需复核|exempt|豁免|calibration|收敛" server/src shared/types
rg -n "maxRetries" server/src/services/novel/runtime/chapterRuntimePipeline.ts   # 已知被夹到 <=1
```

---

## P0-A2-1 规则统计学校准 + 禁改清单 + 按写法调门限 + 改动台账

### 目标与用户价值
- 让每条反 AI 规则的阈值有**真人语料命中率基线**与固件，可回归。
- 显式声明「哪些绝不能改」（数字/条件/承诺/作者口气），缓解「AI 改坏了我的稿子」。
- 同一套阈值按写法语体（`register/roughness`）分档，冷白描与系统爽文不共用阈值。
- 每次改写有**改动台账**，可审计、可解释。

### 现状（真实定位）
- 信号与阈值：[signals/index.ts](file:///Users/yuanxinghai/workspace/ai_write_test/AI-Novel-Writing-Assistant/server/src/services/styleEngine/signals/index.ts) + [signals.ts](file:///Users/yuanxinghai/workspace/ai_write_test/AI-Novel-Writing-Assistant/shared/types/styleEngine/signals.ts)（`style-signals-v1`，`createStyleSignalPolicy()` 固定默认值；`StyleDetectionService.check` 直接调用，未按写法取值）。
- 规则与种子：[defaults.ts](file:///Users/yuanxinghai/workspace/ai_write_test/AI-Novel-Writing-Assistant/server/src/services/styleEngine/defaults.ts)、[StyleEngineSeedService.ts](file:///Users/yuanxinghai/workspace/ai_write_test/AI-Novel-Writing-Assistant/server/src/services/styleEngine/StyleEngineSeedService.ts)（`missing_only`）。
- 规则进 prompt 两条路径：[StyleCompiler.ts](file:///Users/yuanxinghai/workspace/ai_write_test/AI-Novel-Writing-Assistant/server/src/services/styleEngine/StyleCompiler.ts) `compileAntiAiRuleLines` 与 [antiAiPreviewRules.ts](file:///Users/yuanxinghai/workspace/ai_write_test/AI-Novel-Writing-Assistant/server/src/services/styleEngine/antiAiPreviewRules.ts) `buildAntiAiRuleCatalogText/DirectiveText`（**均无条数/字数上限**）。
- 保护与守恒：[rewrite/index.ts](file:///Users/yuanxinghai/workspace/ai_write_test/AI-Novel-Writing-Assistant/server/src/services/styleEngine/rewrite/index.ts)（`protectedTerms` + 数字锚点）、[StyleRewriteService.ts](file:///Users/yuanxinghai/workspace/ai_write_test/AI-Novel-Writing-Assistant/server/src/services/styleEngine/StyleRewriteService.ts)、`style.rewrite.conservation@v1`。
- prisma 现状：`AntiAiRule / StyleProfile / StyleProfileAntiAiRule / StyleBinding`（[schema.prisma](file:///Users/yuanxinghai/workspace/ai_write_test/AI-Novel-Writing-Assistant/server/src/prisma/schema.prisma#L1686-L1783)），无台账/清单模型。

### 方案设计（拆 4 个子阶段，可独立提交）

**(a) 统计学校准（合并 T1-5）**
- 新增 `server/src/services/styleEngine/calibration/`：
  - `corpus/human/*.txt`、`corpus/ai/*.txt`：**提交进仓库的小规模固件语料**（人工挑选，控制体积），用于可复算。
  - `calibrationBaseline.ts`：zod schema（`revision`、`ruleId`、`corpusId`、`sampleCharacters`、`perKilo`、`falsePositiveRate`、`tolerance`），基线数据同目录提交。
  - `runCalibration.ts`：dev 脚本，用 `scanStyleSignals` 跑全部语料，输出每规则命中/千字与误报率。
  - `calibration.test.ts`：断言基线文件 `revision` 与当前信号 revision 一致、且实测值在容差内（阈值改动未更新基线即失败）。
- 规则 revision 变更（新增信号/改阈值）时同步升 `styleSignalPolicySchema.revision` 并刷新基线。
- 文档：在 [anti-ai-rule-catalog.md](file:///Users/yuanxinghai/workspace/ai_write_test/AI-Novel-Writing-Assistant/docs/wiki/prompts/anti-ai-rule-catalog.md) 增加「校准」小节（语料来源/规模/每规则基线/误报率）。

**(b) 禁改清单（与豁免清单共用一张表）**
- 新增 prisma model（additive）：
  - `StyleFragmentRule { id, novelId, kind: "exempt" | "protected", fragment, note, source, enabled, createdAt, updatedAt }`，`@@index([novelId, kind, enabled])`。`exempt` 供未来 T1-3 复用，`protected` 供本项。
- 确定性后处理：在 [rewrite/index.ts](file:///Users/yuanxinghai/workspace/ai_write_test/AI-Novel-Writing-Assistant/server/src/services/styleEngine/rewrite/index.ts) `guardStylePatches` 扩展一个 `protected_fragment` 检查（与 `numericTerms` 同类，属**对结构化 AI 输出的确定性后处理**），命中即 blocked 并保留原稿。
- Prompt：`style.rewrite` 升 v6，新增「禁改清单」输入段（片段 + 用途注释），声明数字/条件/承诺/作者口气不得改动。
- 入口：写法/检测设置处提供清单编辑（零基础默认空 → 行为与现状一致）。禁改清单**不跨书继承**。

**(c) 按写法调门限**
- 新增 `server/src/services/styleEngine/StyleSignalPolicyResolver.ts`：入参为已解析的写法档案（`languageRules.register/roughness`、`rhythmRules.pace` 等），输出 `StyleSignalPolicy`（覆盖阈值），并保留版本号。
- 改 [StyleDetectionService.ts](file:///Users/yuanxinghai/workspace/ai_write_test/AI-Novel-Writing-Assistant/server/src/services/styleEngine/StyleDetectionService.ts)：`createStyleSignalPolicy()` → `resolver.resolve(profile)`；无写法时回退当前默认（行为不变）。
- 写法档案新增**可选**字段 `signalCalibration`（阈值覆盖），6 套默认模板给出保守初值；未配置即用全局默认。
- 属「结构化配置 → 确定性阈值映射」，非关键词路由。

**(d) 改动台账**
- 数据来源已就绪：[StyleRewriteService.ts](file:///Users/yuanxinghai/workspace/ai_write_test/AI-Novel-Writing-Assistant/server/src/services/styleEngine/StyleRewriteService.ts) 已产出 `baseline.changes` + `guard`。
- 新增 prisma model `StyleRewriteLedger { id, novelId, chapterId, sourceHash, candidateHash, policyRevision, entriesJson, createdAt }`；`entriesJson` 记录每条补丁的 `ruleId/ruleName/targetExcerpt→replacement/checkStatus`。
- 写入点：`StyleRewriteService.rewrite` 落地后写台账；只读展示在章节检测面板（不改任务状态）。

### 与既有机制的衔接（重点）
- **改写信息守恒护栏**：禁改清单是 guard 的**新增确定性检查**；信息增删仍由 `style.rewrite.conservation` AI 判定；台账同时记录二者结论。
- **missing_only 种子**：新增规则/基线走 seed 自动进入已有用户库；**禁改清单、门限覆盖、台账是书级/用户级数据，不经 seed**。
- **无上限 prompt 路径**：`compileAntiAiRuleLines` 与 catalog/directive 渲染需**新增条数+字数上限**，只渲染 `enabled` 且与写法高相关的条目，避免拉长 prompt 影响质量。

### 相容性
全部相容：校准=测试/文档治理；禁改清单=用户显式输入+确定性后处理；调门限=结构化配置映射；台账=结构化输出归档。

### 验证
- 单测：calibration 测试（基线同步/容差）、guard 新增 `protected_fragment` 命中与放行、resolver 阈值映射（口语/冷白描两档差异）。
- dev 脚本：`runCalibration.ts` 输出与基线对照。
- prisma：`prisma migrate dev`（additive）+ 迁移后读回校验；**迁移前备份 `dev.db`**。
- 复用现有 styleEngine 测试套件；UI 验收交由用户。

### 风险与前置条件
- 门限初期只能保守初值，必须显式标注「待校准」。
- prompt 长度增长需靠渲染上限控制。
- 迁移为 additive，禁止 reset。

### 工作量与顺序
最大的一项。建议顺序：**(a) 校准 → (b) 禁改清单 → (d) 台账 → (c) 调门限**（c 依赖 a 的基线做依据）。

---

## P0-A2-2 改写力度分级（自由 / 句内 / 原位）

### 目标与用户价值
给零基础用户一个**力度旋钮**（轻改/中改/重写），而不是暴露参数；同时限制「最多能删多少」，避免修复把有剧情功能的内容删掉。

### 现状
- 改写预算硬编码于 [rewrite/index.ts](file:///Users/yuanxinghai/workspace/ai_write_test/AI-Novel-Writing-Assistant/server/src/services/styleEngine/rewrite/index.ts)：`touchedRatio ≤0.3/1`、`addedCharacters ≤0.05/0.2`、`|lengthChange| ≤0.3`（`style-patch-v1`）。
- 补丁结构：[chapterPatchRepair.ts](file:///Users/yuanxinghai/workspace/ai_write_test/AI-Novel-Writing-Assistant/shared/types/chapterPatchRepair.ts)（`targetExcerpt/replacement/issueIds`）。
- 改写 prompt：`style.rewrite` v5；链路入口 [StyleRewriteService.ts](file:///Users/yuanxinghai/workspace/ai_write_test/AI-Novel-Writing-Assistant/server/src/services/styleEngine/StyleRewriteService.ts)、[PostGenerationStyleReviewRunner.ts](file:///Users/yuanxinghai/workspace/ai_write_test/AI-Novel-Writing-Assistant/server/src/services/novel/runtime/PostGenerationStyleReviewRunner.ts)。
- 章节重试被夹到 ≤1：[chapterRuntimePipeline.ts](file:///Users/yuanxinghai/workspace/ai_write_test/AI-Novel-Writing-Assistant/server/src/services/novel/runtime/chapterRuntimePipeline.ts#L221)（`effectiveMaxRetries = Math.max(0, Math.min(maxRetries, 1))`）。

### 方案设计
- **schema**：`shared/types/styleEngine` 新增 `styleRewriteScopeSchema = "free" | "sentence" | "in_place"`；`StyleRewriteGuard` 扩展 `scope`、`deletionRatio`、`escalations`（含 `[需复核]` 条目）。
- **服务**：`StyleRewriteService.rewrite` 增加 `scope` 入参（默认沿用现状等价档）。
- **prompt**：`style.rewrite` v6（与 A2-1(b) 合并升版）按 `scope` 渲染不同约束：
  - `in_place` 原位：只允许等量级词级替换，禁删整句；新增字数变化 ≤ ±10%。
  - `sentence` 句内：允许整句重写，禁跨句搬移/合并多句；删除比例 ≤15%。
  - `free` 自由：允许段落级重写；删除比例 ≤35%；跌破字数下限（`lengthControl`/`targetWordCount`）时**改「降 AI 重写」而非继续删**。
- **guard（合并 T1-2 分级删除上限）**：`guardStylePatches` 增加 `deletionRatio` 计算与分档上限（轻 15% / 中 25% / 重 35%）+ 单段字数下限保护；超限 → `blocked`（保留原稿）并在台账/报告标 `[需复核]`，**不阻塞全局链**（走既有质量债通道）。
- **UX**：检测面板只暴露「轻改 / 中改 / 重写」三档。

### 相容性
相容。删除上限与既有「改写信息守恒」是同护栏的**维度扩展**（一个判增删、一个判幅度）；`[需复核]` 终态走 AGENTS.md 允许的局部质量债务路径。

### 验证
- guard 单测：三档 scope 各自的 touched/deletion/字数下限边界（含超限 blocked 保留原稿、[需复核] 标记）。
- prompt 快照：三档约束文本渲染正确。
- 复用现有 styleEngine 测试；UI 验收交用户。

### 风险与前置条件
- 前置：确认 T1-2（分级删除上限）是否已实现——已实现则本项只补 `scope` 参数与 UI。
- 三档阈值初期为保守初值，与 A2-1(a) 校准联动。

### 工作量与顺序
中等，**建议最先做**（见效直接、缓解修复—审校拉锯）。

---

## P1-A2-3 跨章结构相似度检查

### 目标与用户价值
识别「每章都是 醒来→冲突→内心独白→逆转」这类**跨章结构重复**，这是长篇读者流失主因之一；当前只有章内 `repetition`。

### 现状
- 章内检测：[ProseQualityDetector.ts](file:///Users/yuanxinghai/workspace/ai_write_test/AI-Novel-Writing-Assistant/server/src/services/novel/runtime/proseQuality/ProseQualityDetector.ts)（9 类，仅章内）。
- 可复用的结构资产：`Chapter.sceneCards`（[chapterRuntime.ts](file:///Users/yuanxinghai/workspace/ai_write_test/AI-Novel-Writing-Assistant/shared/types/chapterRuntime.ts#L63-L77)）+ 读者体验合同 [readerExperience.ts](file:///Users/yuanxinghai/workspace/ai_write_test/AI-Novel-Writing-Assistant/shared/types/novel/readerExperience.ts)（`keyTurn/primaryResistance/emotionalShift/netChange/endingHook/rewardLevel`）。
- 验收接入点：[chapterRuntimePipeline.ts](file:///Users/yuanxinghai/workspace/ai_write_test/AI-Novel-Writing-Assistant/server/src/services/novel/runtime/chapterRuntimePipeline.ts) 验收阶段，`chapterAcceptance.prompts.ts`。

### 方案设计
- 新增确定性模块 `server/src/services/novel/runtime/structureSimilarity/`：
  - `StructureSignature.ts`：由最近 N 章（默认 5）的结构化字段生成骨架签名（scene 数、beat 序列、`rewardLevel` 序列、`endingHook` 类型、`keyTurn` 类别）。
  - `StructureSimilarityDetector.ts`：滑窗比较相邻/近邻章节签名，输出相似度与「重复骨架」候选证据。
  - 仅产**候选证据**，不授予 issue code、不硬判定（与 signals 同定位）。
- 接入：验收阶段把跨章结构证据注入 `chapterAcceptance` prompt（需在 acceptance schema 增加一个 evidence 段），由 AI 决定是否计入 `repetition` 维度。
- 降级：`sceneCards` 缺失时回退仅用读者体验合同字段。

### 相容性
相容；结构骨架是确定性度量 + 结构化字段，最终判定交给 AI 验收。

### 验证
- 单测：构造「同构三章」与「结构各异三章」两个夹具，断言相似度排序正确；缺失字段时安全降级。
- 复用 acceptance 测试。

### 风险与前置条件
- 依赖 `sceneCards` / 读者体验合同的填充质量；需确认其存储形态（`sceneCards` 为 string，可能内嵌 JSON）。
- 不新增阻塞点。

### 工作量与顺序
中等偏高（新模块 + acceptance schema 扩展）。建议排在 P1 末位。

---

## P1-A2-8 对话占比 /「话疗」密度

### 目标与用户价值
补齐章节最小审计集里的两项对网文读感影响极大的确定性指标：**对话占比**与**「话疗」密度**（角色反复聊天而剧情不推进）。

### 现状
- 确定性正文检测已有 9 类 issue code（[ProseQualityDetector.ts](file:///Users/yuanxinghai/workspace/ai_write_test/AI-Novel-Writing-Assistant/server/src/services/novel/runtime/proseQuality/ProseQualityDetector.ts)）。
- 信号层已有对话相关规则：`surface.dialogue-tag-density`（[signals/index.ts](file:///Users/yuanxinghai/workspace/ai_write_test/AI-Novel-Writing-Assistant/server/src/services/styleEngine/signals/index.ts#L107-L116)）；无占比/话疗指标。

### 方案设计（双落点，各司其职）
- **确定性度量放 `ProseQualityDetector`**（人读性强、可给 `fixSuggestion`）：新增
  - `prose_dialogue_ratio`：对白字数/总字数占比，超上下限时 emit；
  - `prose_talk_loop`：连续对白轮次长且期间无动作/叙述/信息推进标记的段落聚集（**只统计可机械度量的部分**：连续对白长度、无叙述穿插）。
  - 「是否真的话疗」需 AI 判定 → 探测结果作为**证据**注入 `chapterAcceptance` 的 `repetition/engagement` 维度，不直接判违规。
- **语体相关阈值放 signals policy**：占比上下限按写法语体分档，与 P0-A2-1(c) 的 `StyleSignalPolicyResolver` 共用。
- **prompt**：`style.detection` 升 v13，检测范围补「对话比例失衡 / 反复对话不推进」。

### 相容性
相容：机械度量只产证据；推进与否的判断留给 AI。

### 验证
- 单测：对白密集章、纯叙述章、动作穿插对话章三夹具，断言占比/话疗触发正确且不误伤。
- 复用 proseQuality 与 styleEngine 测试。

### 风险与前置条件
- 占比阈值随题材/写法变化大 → 必须与 (c) 门限联动，避免误报。

### 工作量与顺序
小到中。建议在 P0 之后、A2-3 之前。

---

## P1-A2-9 简介（blurb）生成

### 目标与用户价值
补齐「包装」阶段缺口：当前只有书名生成，无简介生成入口。多条外部条目把简介列为开书必产出物。

### 现状
- 书名生成：[TitleGenerationService.ts](file:///Users/yuanxinghai/workspace/ai_write_test/AI-Novel-Writing-Assistant/server/src/services/title/TitleGenerationService.ts)（含多候选、去重、质量校验，可作模板）。
- 无 blurb 服务/prompt。
- 输入数据齐备：`Novel.description/title/bookSellingPoint/competingFeel/first30ChapterPromise/commercialTagsJson/targetAudience`（[schema.prisma](file:///Users/yuanxinghai/workspace/ai_write_test/AI-Novel-Writing-Assistant/server/src/prisma/schema.prisma#L324-L334)）+ `genre`。
- 合规预检已有 `compliancePrecheck` prompt 可复用。

### 方案设计
- 新 PromptAsset `server/src/prompting/prompts/novel/blurbGeneration.prompts.ts`：
  - `id: "novel.blurb.generate"`、`taskType: "planner"`、`mode: "structured"`；
  - `outputSchema`：`candidates: [{ blurb, hookLine, angle, targetReader, caution }]`（多候选、结构可展示）；
  - 注册进 [promptAssetLoaderEntries.ts](file:///Users/yuanxinghai/workspace/ai_write_test/AI-Novel-Writing-Assistant/server/src/prompting/registry/promptAssetLoaderEntries.ts)。
- 新服务 `server/src/services/novel/blurb/BlurbGenerationService.ts`（结构对齐 TitleGenerationService：novel 校验、多候选、去重、质量/长度校验、重试）。
- 上下文：现有 `description` 作待改写基线 + 卖点/前 30 章承诺/题材/受众/标签。
- 落地路径：用户选用某候选 → 写回 `Novel.description`；可选先过合规预检。
- 前端入口：复用书名生成入口相邻位置（沿用现有标题 API 的路由与面板模式，避免新工作流分支）。

### 相容性
完全相容：纯结构化 AI 生成，非模板拼接；不引入新工作流分支；复用合规预检。

### 验证
- 单测：候选数量/去重/长度校验；无 `description` 时用标题兜底；schema 严格校验。
- 复用 titleGeneration 测试模式做参照。
- UI 验收交用户。

### 风险与前置条件
- 需确认现有标题生成的 route 与前端面板位置，以便复用入口交互。
- 简介涉及合规 → 建议强制关联合规预检。

### 工作量与顺序
小到中（照 TitleGenerationService 模式即可）。**建议率先落地**（成本低、用户可感知）。

---

## 建议实施顺序

1. **P1-A2-9 简介生成**（最小、独立、可见）
2. **P0-A2-2 改写力度分级**（直接缓解质量闭环拉锯）
3. **P0-A2-1 四子阶段**：(a) 校准 → (b) 禁改清单 → (d) 台账 → (c) 调门限
4. **P1-A2-8 对话占比/话疗**（与 (c) 门限联动）
5. **P1-A2-3 跨章结构相似度**（新模块 + acceptance 扩展）

每个阶段为一次独立提交（含必要的 wiki 更新与 release notes 判断）。

## 整体验证方式

- 定向单测：`styleEngine`（signals/guard/resolver/calibration）与 `proseQuality`、`acceptance` 相关测试。
- 类型检查：client/server/shared（沿用仓库既有脚本）。
- prisma：`prisma migrate dev`（additive）+ 读回校验；**迁移前备份 `dev.db`**。
- 校准脚本：`runCalibration.ts` 输出与基线对照。
- 按 AGENTS.md：**不做浏览器/截图验证**，UI 验收交由用户；避免重复昂贵构建。

## 整体风险

- **prompt 膨胀**：A2-1 新增规则/清单会拉长两条无上限路径 → 必须加渲染条数/字数上限。
- **阈值可信度**：门限与占比阈值初期为保守初值，需显式标注「待校准」，随 (a) 校准迭代。
- **迁移安全**：台账/清单模型为 additive，禁止 reset，迁移前备份。
- **重复实现**：实施前必须先跑「前置核对」，确认 T1-x 是否已落地。
