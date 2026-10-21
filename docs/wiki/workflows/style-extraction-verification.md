# 写法特征三重验证与决策收紧

## 背景

写法提取原本是**单次 AI 调用**：`style.profile.extract@v2` 一次产出写法名称、摘要、分析和特征清单，每个特征自带 `importance / imitationValue / transferability / fingerprintRisk` 四个评分，随后按 preset 生成 keep / weaken / remove 并落库成写法规则。

一次提取的结论没有任何交叉验证，于是三类不可靠特征会直接变成写作规则：

- 只在原文出现一次的偶发写法；
- 「有对话」「有环境描写」这类所有小说都有的通用写法；
- 读完之后的评价性结论，对仿写没有指导作用。

这些特征会进入正文生成的写法合同和写法检测闭环，等于把未经证实的结论当成写作规则使用。

## 决策

**提取与验证分离**。提取继续由原有资产负责产出候选特征；验证用一个独立资产按三条口径核验候选；是否收紧规则由确定性后处理完成，不交给模型自由决定。

- 验证资产：`style.profile.verify_features@v1`（`critical_review`、结构化、只读纳管）。
- 验证只回答「通过 / 不通过 + 理由」，不新增特征、不改写特征描述、不给改写建议。
- 收紧逻辑集中在 shared 的 `applyExtractionVerificationDecision`，服务端与前端共用同一份判断，避免两个副本各自演进。
- 验证是**质量增强而不是任务前置条件**：验证失败不阻断提取任务（与自动导演的局部质量债务策略一致）。

## 当前规则

### 三条口径

| 口径 | 通过条件 | 不通过时 |
| --- | --- | --- |
| 跨源出现 `crossSource` | 该特征在至少两个互不重叠的样本段落中稳定出现 | 判为偶发，决策收紧为 `weaken` |
| 有预测力 `predictive` | 读这条特征能预测原文接下来怎么写、能直接指导仿写 | 判为读完之后的评价，决策收紧为 `remove` |
| 有排他性 `exclusive` | 该特征能把这套写法与其他写法区分开 | `imitate` / `balanced` 下 `keep` 收紧为 `weaken`；`transfer` 不收紧 |

排他性在 `transfer` 预设下不降级是有意为之：迁移场景要的正是可迁移的通用规则。

### 样本构建

`buildStyleVerificationSamples` 决定模型看到的样本边界：

- 代表性采样模式下原文自带 `【样本：…】` 分块，直接沿用它的边界，不再二次切分；
- 否则按空行分段，段落数超过上限时按顺序合并成固定份数；
- 最多 8 份样本，每份截断到 1400 字，序号从 1 开始，供模型用 `sampleIndexes` 回指证据。

### 结果与落库

- 验证结论写在 `feature.verification`（可选字段），随 `StyleProfile.extractedFeaturesJson` 一起落库，因此**不需要数据库迁移**，老写法数据保持兼容。
- 结论携带 `verifiedAt` 与 `sourceHash`，用于判断验证对应的是哪一份原文。
- 验证通过后 preset 会按带验证结论的特征重建，选择的 preset 决定最终写入写法的规则强度。

### 失败与取消

- 验证调用失败、超时或结构化校验失败：记录 `feature_verification_failed` 警告日志，任务继续，特征保持原样（不因验证失败降级，避免模型抖动削掉可用特征）。
- 验证结果中没有一条有效结论：退回原始特征清单，同样保留原样。
- 用户主动取消：仍然向上抛出，终止任务，不得因为「验证非阻断」把取消吞掉。

### 界面表达

写法编辑面板展示三项验证状态与结论理由；缺少验证结论时显示「特征验证未完成，当前按提取结论保留」，这是状态说明，不能表达成验证通过。

## 失败模式

- 验证把任务拖成失败：检查是否在 `verifyExtractionFeatures` 之外加了硬失败分支；验证失败只允许降级为未验证。
- 特征被整体删除：排他性不通过只说明它不能当硬规则，`transfer` 场景下需要保留，检查 `applyExtractionVerificationDecision` 的 preset 分支。
- 模型声称跨源出现却只给一个样本序号：`postValidate` 会拒绝并触发结构化重试，属于预期行为。
- 验证结论丢失：检查 `normalizeFeatureVerification` 是否仍被 `normalizeFeature` 调用，特征归一化是按字段白名单重建的，漏掉字段就会在读回时被丢掉。

## 未实施

辨识度盲测（用写法规则集生成样本 + 盲判辨识度）不在本阶段范围内，实施计划见 [写法提取三重验证与辨识度盲测实施计划](../../plans/style-extraction-triple-verification-plan.md)。

## 关联模块

- `server/src/prompting/prompts/style/styleProfileVerification.prompts.ts`
- `server/src/services/styleEngine/verification/index.ts`
- `server/src/services/styleEngine/StyleExtractionTaskService.ts`
- `server/src/services/styleEngine/styleExtraction.ts`
- `shared/types/styleEngine.ts`
- 写法修文侧的信息守恒核对见 [写作链路 wiki](chapter-production-chain.md)
