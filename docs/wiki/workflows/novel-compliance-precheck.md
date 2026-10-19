# 小说域合规预检（Compliance Precheck）

## Background

短剧模块已有 `DramaComplianceService`，但小说链路此前完全没有合规能力。参考 `xindoo/sumeru`（须弥写作）的 skill 体系（大纲阶段与 finalize 阶段都强制做合规检查）后确认：对新手用户来说，「侵权与影射风险 + 平台内容风险」是唯一一个价值明确、且完全缺失的能力缺口。

新手用户通常不具备判断「影射真实公众人物」「直接使用知名 IP 专有设定」「擦边与过度暴力」的能力，一旦在平台被打回，很难自己定位和修改。合规预检的目标是把这类问题在导出或连载前用清单形式讲清楚。

## Decision

- 只覆盖两个维度：`ip_infringement`（侵权与影射）与 `platform_content`（平台内容）。不覆盖政治宗教敏感、价值观导向，避免范围不可控，也避免模型给出不可靠的政治判断。
- 采用「用户可触发」而不是「自动注入导演链」。项目优先级要求避免新增工作流分支；同时合规结果若自动阻断，会与「本地质量问题不阻断全局链」的既有规则冲突。
- 导出门禁为「风险清单 + 显式确认」，不做硬阻断。新手被硬卡住会不知道如何修改；确认式更符合 beginner-first。
- 结果落库保留历史（`NovelComplianceReport`），沿用 `TimelineCheckReport` 的「一本书一份检查报告」先例，导出页与方向页可复看。
- 只给结论、定位与建议，不做自动改写。修复仍回到既有章节修复链路。

## Current Rule

- Prompt：`novel.compliance.precheck@v1`，`taskType=critical_review`（高利害、低温度、确定性最高），`mode=structured`，`management.productPrompt=true`，只读。必须通过 `server/src/prompting/registry/promptAssetLoaderEntries.ts` 注册。
- 结构化输出不变量（`postValidate`）：`level=pass` 时 `items` 必须为空；`level!=pass` 时必须给出 `items`。两者矛盾时按语义重试处理，而不是静默接受。
- 服务归属：`server/src/modules/novel/compliance/`（`application/` + `http/`），不把 systemPrompt 内联进 service。
- 接口：
  - `GET /api/novels/:id/compliance` → 最新报告，没有则 `data: null`。
  - `POST /api/novels/:id/compliance/precheck` body `{ scope: "planning" | "full" }`。
- 检查范围：
  - `planning`：基础信息、世界观切片、人物与关系、卷章大纲等规划材料。
  - `full`：在规划材料基础上追加已写正文的**抽样摘要**，不允许把整本正文塞进 prompt（受模型输入/输出上限与成本约束）。
- 前端入口：导出弹窗内（范围 `full`）与「方向与自动准备」阶段（范围 `planning`）。前者在存在 `level=block` 时要求先勾选「我已了解风险，仍然导出」；未预检过时默认不阻断，只提示可以先预检。
- 该能力不写入自动导演 phase 链，不参与 runtime 状态机，不进入 `replanAlertDetails`/`PIPELINE_REPLAN_REQUIRED` 通道，也不在任务中心新增任何变更型操作。

## Examples

- 高风险：主角名与某真实公众人物高度相似，且保留了可识别经历 → `ip_infringement / high`，建议改为虚构人物并去掉可识别特征，`locationHint` 指向具体章节。
- 中风险：门派、道具名直接照搬知名 IP 的专有设定 → `ip_infringement / medium`。
- 平台内容：危险行为写成了可操作步骤 → `platform_content / high`。

## Failure Modes

- **把合规当硬门禁**：写成「禁止导出」或接入自动导演的 replan 通道，会让新手卡死。正确做法是清单 + 显式确认。
- **全文进 prompt**：`full` 范围若直接塞正文会撞上下文与输出上限，必须走抽样摘要。
- **pass 与 items 自相矛盾**：模型可能返回 `pass` 却带风险项，或 `warn` 但不给项，必须由 `postValidate` 拦住并触发语义重试。
- **桌面端漏迁移**：新增报告表需要同时更新 `schema.prisma`、`schema.sqlite.prisma` 与两个迁移目录；否则桌面端启动时 `ensureRuntimeDatabaseReady()` 不会创建该表，`verify-desktop-package.cjs --mac` 也会因迁移不同步而失败。

## Related Modules

- 短剧合宪前例：`server/src/services/drama/DramaComplianceService.ts`、`dramaCompliancePrompt`。
- 取数与导出：`server/src/modules/export/novelExport.service.ts`。
- 报告表先例：`TimelineCheckReport`。
- 迁移执行器：`server/src/db/runtimeMigrations.ts`。

## Source Documents

- 实施方案：`.trae/documents/novel-compliance-precheck.md`
- 迁移与结构化输出排障：[结构化输出长度上限与 zod v4 文案](./../debugging/structured-output-length-and-zod-v4-messages.md)
