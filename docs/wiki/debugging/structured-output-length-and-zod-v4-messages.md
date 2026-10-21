# 结构化输出被接受、业务层却校验失败（附 zod v4 错误文案陷阱）

## 背景

用户反馈两个表面无关的问题，排查后归属同一类认知陷阱：

1. 「方向与自动准备」点击「选用这套」时弹窗报错，提示
   `payload / estimatedChapterCount：不能为空。`。但该字段在服务端 Schema 里是
   `.optional()`（`server/src/services/novel/director/state/novelDirector.ts`），
   源码与报错信息互相矛盾。
2. 生成创作承接方案时报 400：
   `adaptationFocus / conversionPlan：不能超过 400 个字符。`，而模型输出只是略超上限。

两个问题的共同前提：**结构化输出链路里存在两套 Schema，模型输出通过第一套不代表
能通过第二套。**

## 决策

1. 结构化输出链路的运行时 Schema 与业务层严格 Schema 的差异必须被显式补偿，
   不能用「结构化调用成功」推断业务层一定能 parse。
2. 对「模型只是略超长度上限」这类可确定性修复的偏差，统一用 Schema 声明的上限做
   裁剪，不在调用点重复硬编码 200 / 240 / 280 / 400 这些数字。
3. 校验错误文案必须能区分「缺值 / 类型不对 / 超长」，不能把类型错误一律说成缺值。

## 当前规则

### 两套 Schema 的差异

- 运行时：`parseStructuredLlmRawContentDetailed`
  （`server/src/llm/structuredInvokeParser.ts`）先执行
  `relaxGeneratedContentSchema(input.schema)`。该函数
  （`server/src/llm/generatedContentSchema.ts`）会**剥离字符串长度校验**
  （`min_length` / `max_length` / `length_equals`），数组的 `.max()` 仍然保留。
- 业务层：服务代码里对 `result.output` 再做一次**严格** `.parse()`，这里的字符串
  长度校验是生效的，超长直接抛 `ZodError`，经 `errorHandler` 变成 400。
- 结论：**字符串超长只会在业务层暴露**。所以「在 `structuredInvokeParser` 里加
  字符串截断」是无效的（该分支永远不会被 `too_big` 命中），修复必须放在业务层
  严格 parse 之前。

### 长度裁剪的复用方式

- `normalizeOversizedValues(parsed, error, schema)`
  （`server/src/llm/structuredInvokeParser.ts`，由 `llm/structuredInvoke` 对外导出）
  读取 `issue.code === "too_big"`，按 `origin === "array" | "string"` 分别裁剪数组与
  文本，再重新校验；返回 `{ data, trimmedPaths }` 或 `null`。
- 需要在业务层做裁剪时，标准写法是「先 `safeParse`，失败再
  `normalizeOversizedValues`，仍失败才 `.parse` 抛出真实错误」。参考实现：
  `parseCreativeCarryoverContractDraft`
  （`server/src/services/novel/director/reference/CreativeCarryoverContractService.ts`）。
- 不要在新调用点手写长度常量；上限的唯一来源是 Schema。

### zod v4 的 issue 形状（错误文案陷阱）

- zod 4.3.6 起，`invalid_type` 的 issue **不再带 `input` 属性**，所以
  `issue.input === undefined` 恒为真。`errorHandler` 里原先的判断因此把**所有**
  类型错误都显示成「不能为空。」。
- 判断「真的缺值」只能兜底看原始 message 是否以 `received undefined` 结尾
  （`isMissingValueIssue`，`server/src/middleware/errorHandler.ts`）。
  仓库没有配置 zod 全局 locale，默认 message 是英文，该判定成立。
- `null` 输入会得到 `received null`，属于「值类型不对」而非缺值，展示为
  「必须是数字。」这类文案更准确；对于 `.optional()` 字段，说「不能为空」是误导。

### 客户端草稿的信任边界

- `loadAutoDirectorCreateDraft`
  （`client/src/pages/novels/autoDirector/draft/autoDirectorCreateDraft.ts`）从
  localStorage 恢复草稿，是脏值进入表单的唯一入口：旧版本写入的 `null` /
  字符串类型的 `estimatedChapterCount` 会被原样恢复并发出，触发上面的
  `invalid_type`。
- 因此恢复时必须做**字段级**清洗（`sanitizeDraftBasicForm` 复用
  `normalizeEstimatedChapterCount`），不能只做结构校验；
  请求构造侧（`buildAutoDirectorRequestPayload`）再做一次归一化作为第二道边界。

## 示例

承接方案裁剪（已用 `/tmp/verify_carryover_clip.cjs` 以真实 shared Schema 验证）：

```
before: too_big basis.0.summary / adaptationFocus.hooks / adaptationFocus.conversionPlan
after : conversionPlan 400 字（以 … 结尾）/ hooks 收敛到 8 项 / summary 收敛到 240 字
```

错误文案（`errorHandler` 对 `{ payload: { estimatedChapterCount, direction } }` 的输出）：

| 输入 | 修复前 | 修复后 |
| --- | --- | --- |
| `direction` 缺失 | 不能为空。 | 不能为空。 |
| `estimatedChapterCount: null` | 不能为空。 | 必须是数字。 |
| `estimatedChapterCount: "1000"` | 不能为空。 | 必须是数字。 |
| `direction` 超长 | 不能超过 N 个字符。 | 不能超过 N 个字符。 |

## 失败模式

- **只看结构化调用的成功日志就认为没问题**：字符串长度在运行时 Schema 已被放宽，
  业务层严格 parse 才是真正门禁。排查 400 时要顺着「运行时 Schema → 业务层
  `.parse()`」两段走。
- **在 `llm/` 层重复修一遍字符串截断**：运行时 Schema 不会为字符串产生 `too_big`，
  这类改动是死代码，还会误导后来者。
- **把 `invalid_type` 当缺值**：在 zod v4 下 `input` 不存在，任何
  `input === undefined` 判断都会误报「不能为空」，掩盖真实原因（如客户端发了
  `null` 或字符串）。
- **草稿直接信任恢复**：只校验结构不校验字段类型，旧版本脏值会长期存活，
  表现为「某台机器上必现、换台机器不复现」。

## 相关模块

- `server/src/llm/generatedContentSchema.ts`（字符串长度校验被剥离）
- `server/src/llm/structuredInvokeParser.ts`（`normalizeOversizedValues`）
- `server/src/services/novel/director/reference/CreativeCarryoverContractService.ts`
- `server/src/middleware/errorHandler.ts`（`isMissingValueIssue`）
- `client/src/pages/novels/autoDirector/draft/autoDirectorCreateDraft.ts`
- `client/src/pages/novels/autoDirector/estimatedChapterCountInput.ts`
- `shared/types/creativeCarryoverContract.ts`（字段长度上限的唯一定义处）

## 来源资料

- 用户反馈：「在方向与自动准备，在点击选用这套 按钮时弹窗报错警告」
- 诊断与验证：2026-10-19（zod 4.3.6 实测 `hasOwnProperty(issue, "input") === false`）
