# 跨章结构相似度（structureSimilarity）

## 这个模块负责什么

识别「相邻若干章反复使用同一套场景骨架」（例如每章都是 醒来 → 冲突 → 内心独白 → 逆转）。
章内重复由 `proseQuality` 的 `repetition` 覆盖，本模块只处理**跨章结构层面**的重复。

## 边界

- 只产出**候选证据**：相似度、共享骨架短语、连续同构的收束提示。不授予 issue code，不判定违规，不阻塞任何流程。
- 不调用 LLM。签名与相似度全部是可复算的确定性度量。
- 不做关键词路由，也不把相似度直接映射成「必须重写」；是否计入由验收模型结合合同判断。
- 输入只有两个来源：章节的 `sceneCards`（场景转折/情绪）和读者体验合同
  （`keyTurn / primaryResistance / emotionalShift / netChange / endingHook`）。

## 当前规则

- 签名：`StructureSignature.buildChapterStructureSignature`。
  - `sceneBeats`：按场景顺序抽出的转折骨架，去空白与标点后比对。
  - `beatShingles` / `contractShingles`：字符二元 shingle 集合，容忍近义但措辞不同的写法。
  - `hasSceneCards=false` 时只依赖读者体验合同（降级路径）。
- 比对：`StructureSimilarityDetector.compareStructureSignatures`。
  - 场景相似度 = 0.6 × 骨架顺序一致度（LCS 占比）+ 0.4 × 骨架 shingle Jaccard。
  - 总体相似度 = 0.65 × 场景相似度 + 0.35 × 合同相似度；缺失的分量按可用权重归一，两边都不可比时跳过。
- 证据：`buildCrossChapterStructureEvidence`。
  - 默认窗口 5 章、阈值 0.62、最多 3 条候选；低于阈值不写入。
  - `repeatedSkeletonRun` 只在本章与至少两章历史都具备场景骨架且逐对达标时给出。
  - 没有任何候选时返回 `null`，验收提示词里不会出现空段落。
- 读取：`loadCrossChapterStructureEvidence`（`index.ts`）按 `novelId + order` 读取最近若干章。
  读取失败、章节不足（第 1 章）或没有候选时返回 `null`，并向 `[chapter-runtime]` 打一条告警。

## 与验收的衔接

- 调用点：`ChapterQualityGateService.runAcceptanceGate`，结果作为 `crossChapterStructure`
  进入 `ChapterAcceptanceAssessmentInput`，并写入验收缓存身份，
  保证「有证据」与「无证据」的验收结果不会互相复用。
- 提示词：`novel.chapter.acceptance_assessment` 在正文之后渲染一段
  「跨章结构候选证据」，声明它只是候选线索，不代表违规、不按命中扣分。

## 失败模式

- **把相似度当硬判定**：同构未必是问题，连续多章同构才值得提醒，且必须交给验收模型判断。
- **在证据缺失时仍要求模型解释**：没有候选就不要渲染该段，否则模型会为不存在的证据编理由。
- **要求必须读到场景拆解**：未规划或拆解损坏的章节要能降级到只比读者体验合同。
- **把证据排除在缓存身份之外**：否则历史缓存会让新证据永远不生效。

## 相关模块

- 章内表达检查：`../proseQuality/`。
- 验收评估与提示词：`../ChapterAcceptanceAssessmentService.ts`、`../../../prompting/prompts/novel/chapterAcceptance.prompts.ts`。
- 场景拆解与读者体验合同：`shared/types/chapterLengthControl.ts`、`shared/types/novel/readerExperience.ts`。
