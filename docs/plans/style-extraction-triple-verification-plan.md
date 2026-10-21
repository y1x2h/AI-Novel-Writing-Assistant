# 写法提取三重验证与辨识度盲测实施计划

## 背景

现有写法提取是**单次 AI 调用**：`style.profile.extract@v2` 一次产出 `name / summary / analysisMarkdown / features`，每个 feature 自带四个 0-1 评分（`importance / imitationValue / transferability / fingerprintRisk`）。随后 `buildExtractionDecisions`（[StyleExtractionTaskService.ts](file:///Users/yuanxinghai/workspace/ai_write_test/AI-Novel-Writing-Assistant/server/src/services/styleEngine/StyleExtractionTaskService.ts#L85)）按 preset 生成 keep/weaken/remove，`createProfileFromExtraction` 直接落库成写法规则。

问题：一次提取的结论没有任何交叉验证。

- 只在原文出现一次的偶发写法，会被当成稳定特征写进规则；
- 「有对话」「有环境描写」这类所有小说都有的通用写法，也会被当成辨识度特征；
- 对仿写没有指导作用的读后感式结论，同样会进入 keep 规则。

这些特征随后会进入正文生成的写法合同和写法检测闭环，等于把未经证实的结论当成写作规则使用。

目标：

1. 给每个特征加**三重验证**：跨源出现、有预测力、有排他性；
2. 给整套写法加**辨识度盲测**，让「这套写法到底像不像原文」有一个可复核的分数。

## 验证口径定义

| 验证项 | 通过条件 | 不通过后果 |
| --- | --- | --- |
| 跨源出现 | 同一特征在原文至少 2 个互不重叠的样本段落中出现（样本段落按段切分并编号后交给模型判断） | 判定为偶发，verdict 降为 `weaken` 或 `remove` |
| 有预测力 | 这条特征能预测「原文接下来会怎么写」，可用于指导仿写生成，而不是读完之后的评价 | 判定为空泛结论，verdict 降为 `remove` |
| 有排他性 | 该特征能区分这套写法与其他写法，不是所有小说都具备的通用项 | keep 规则降级为 weaken（保留参考，不写进硬规则） |
| 辨识度盲测 | 用该写法规则集写出的样本，在盲判中能被判定与原文同源 | 只产出分数与提示，不阻断写法可用 |

三重验证针对**特征**，盲测针对**整套写法**。

## 阶段一：特征三重验证

### 1. 新增 PromptAsset

`style.profile.verify_features@v1`，family `style`，`mode: structured`，`taskType: critical_review`（高利害低温度，且已有默认路由），`management: { productPrompt: true, editModes: ["readonly"] }`。

- 输入：写法名称、编号后的原文样本段落、待验证 `features`（`id / group / label / description / evidence`）。
- 输出：`items: Array<{ featureId, crossSource: { passed, sampleIndexes, evidence }, predictive: { passed, reason }, exclusive: { passed, reason }, verdict: "keep" | "weaken" | "remove", reason }>`。
- `postValidate`：`featureId` 必须来自输入集合；`verdict=remove` 时必须给出理由；`crossSource.passed=true` 时 `sampleIndexes` 至少 2 个。

### 2. shared 类型扩展（零迁移）

[styleEngine.ts](file:///Users/yuanxinghai/workspace/ai_write_test/AI-Novel-Writing-Assistant/shared/types/styleEngine.ts#L142) 的 `StyleExtractionFeature` 增加可选字段：

```ts
verification?: {
  crossSource: { passed: boolean; sampleIndexes: number[]; evidence: string };
  predictive: { passed: boolean; reason: string };
  exclusive: { passed: boolean; reason: string };
  verdict: "keep" | "weaken" | "remove";
  reason: string;
  verifiedAt: string;
  sourceHash: string;
};
```

字段可选 + `StyleProfile.extractedFeaturesJson` 为 JSON 字符串，因此老数据兼容、**不需要数据库迁移**。

### 3. 任务链路插入验证阶段

`StyleExtractionTaskService.executeTask` 在 `extracting_features`（0.08）与 `building_profile`（0.58）之间插入 `verifying_features` 阶段：

- 成功：draft.features 写入 verification，进入建 profile；
- 失败 / 超时 / 结构化校验不通过：**不失败任务**，全部特征按 `unverified` 处理并继续建 profile（完成优先，与自动导演的局部质量债务策略一致）；
- 验证调用 provider/model 沿用当前任务的 provider/model，避免跨厂商闭环来回拉锯；
- 预算：验证输出为结构化列表，属于轻量判官任务，可走轻量模型（DeepSeek 系），不需要 GLM 长输出。

### 4. preset 决策纳入验证结论

`buildExtractionDecisions`：

- `verdict=remove` → 三套 preset 的默认 decision 均为 `remove`；
- `exclusive.passed=false` → `imitate` / `balanced` 的 keep 降为 `weaken`，`transfer` 保持原决策；
- `verification` 缺失（验证失败）→ 维持现状，不因验证缺失而整体降级。

### 5. UI

写法提取结果页与写法详情页，每个特征显示三项验证状态与一句中文 reason；失败项与未验证项用文案区分，例如「仅在 1 处出现，属于偶发写法」「所有小说都有的通用写法，已降级为参考项」。不展示内部枚举名。

## 阶段二：辨识度盲测

### 1. 生成 + 盲判

- 用该写法的规则集在中性提示下写 300-500 字样段（长输出，走当前任务模型：GLM 5.3-flash）；
- 判官拿到打乱顺序的「原文样本 / 该写法生成样本 / 对照样本」，在不知道来源的情况下判断哪一段与原文同源，输出 `matchedIndex`、`distinctiveness`（0-100）与理由。

### 2. 落库

`StyleProfile` 增加可选字段 `blindTestJson String?`（或复用 `extractedFeaturesJson` 同级新字段），保存 `{ distinctiveness, matched, reason, provider, model, testedAt, sourceHash }`。此项**需要一次 Prisma schema 变更与迁移**，并且迁移前必须备份 `dev.db`。

### 3. 非阻断

盲测失败只显示「辨识度未测」，不阻断写法可用，也不回滚 profile。

## 影响面

- Prompt Registry：新增 2 个资产，`promptCacheTemplateCompatibility` 契约测试同步登记；
- `shared/types/styleEngine.ts`：可选字段扩展，需重建 `@ai-novel/shared`；
- `StyleExtractionTaskService`：新增 1 个阶段与 2 处 AI 调用；
- `styleExtraction.ts` / preset 决策逻辑；
- 客户端：特征验证标签、辨识度展示；
- Prisma：仅阶段二需要迁移（阶段一零迁移）。

## 验证方式

- 合同测试：新资产 `postValidate` / `render`（`server/tests/styleEngine/`）；
- 服务级测试：mock `runStructuredPrompt`，覆盖「验证通过」「验证失败降级继续」「verdict=remove 影响 preset」三条路径；
- 共享类型改动后重建 `@ai-novel/shared`，服务端 `pnpm --filter @ai-novel/server build`；
- UI 交互由用户验收，不做浏览器截图验证。

## 待确认

1. 跨源出现的判定粒度：单文档多段落（推荐，现有来源就是单个文档）还是必须多来源文档？
2. 盲测是否本期一起做：真实生成样本需要额外 1-2 次 AI 调用，且需要一次数据库迁移；也可先做阶段一。
3. 验证失败的默认处理：保持原样（推荐，不惩罚用户）还是统一降级为 weaken？

## 关联文档

- [写法风险审校与修订闭环 v2 计划](file:///Users/yuanxinghai/workspace/ai_write_test/AI-Novel-Writing-Assistant/docs/plans/style-risk-review-v2-plan.md)
- [章节产出链 wiki](file:///Users/yuanxinghai/workspace/ai_write_test/AI-Novel-Writing-Assistant/docs/wiki/workflows/chapter-production-chain.md)
