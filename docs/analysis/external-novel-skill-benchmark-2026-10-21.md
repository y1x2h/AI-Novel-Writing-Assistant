# 外部小说辅助创作项目对标分析与优化项提炼

- 日期：2026-10-21
- 分析对象：`UnderleveledBuilder/awesome-novel-skills`、`weifu1997/oh-story-skill`
- 对照基线：本仓库当前 `beta` 线（含 `styleEngine` 写法引擎、反 AI 规则目录、章节生产链、读者体验合同、兑现台账）
- 本文性质：外部对标分析，未落地任何代码改动；Tier 1–3 各项待单独挑选立项

---

## 一、结论摘要

1. **两个仓库性质完全不同，价值也不同。** `awesome-novel-skills` 是一个「awesome 列表」聚合仓库（211 条收录 + 分类体系 + 组合推荐），本质是**世界知识与信息架构参考**，不提供可直接复用的规则；`oh-story-skill` 是一个**工程化程度很高的 skill 套件**，含确定性检测脚本、门禁流程、作者记忆协议和大量校准测试，是本轮真正值得对标的对象。
2. **架构方向我们已经对齐，差距在覆盖面与方法学。** 本项目在「去 AI 味」上已经是与 `oh-story-skill` 同构的两层体系（确定性统计信号 + 可编辑规则数据），并在章节目录（读者体验合同 / 义务合同 / 兑现台账 / 角色信息边界 / 状态快照）上比它更结构化。因此本轮**不需要换架构，也不应重复推进已落地项**。
3. **真正值得做的是三件事**：
   - **补护栏**：改写收敛终止、删除比例上限、「需复核」标记化——直接缓解已知的「修复—审校来回拉锯、循环不收敛」问题；
   - **补证据**：把反 AI 检测从「12 条聚集信号」扩到覆盖套词/比喻/解释链/引号强调等**密度型**证据；
   - **补方法学**：为每条确定性规则建立**真人语料校准基线与固件样本**，把当前「待校准工程初值」变成可回归的阈值。
4. 另有一项**新能力**（作者记忆：跨书写作偏好记忆）和两项**结构化完善**（表达维度裁决、写法档案置信度降级）值得在中长期考虑。

---

## 二、分析对象与信息采集范围

### 2.1 awesome-novel-skills

一个目录型仓库，不是规则库。

- 载体：`README.md`（167KB）/ `README.en.md`、`data/skills.toml`（211 条收录）、`data/taxonomy.toml`、`data/packs.toml`、`data/meta.json`、`scripts/{build,discover,refresh,lib}.py`、`evals/`。
- `taxonomy.toml` 定义 9 个 group、**11 个创作阶段**（选题 / 设定 / 人物 / 大纲 / 正文 / 记忆 / 审稿 / 包装 / 发布 / 翻译 / 改编）、3 种 format、7 个 agent 端，以及**投稿平台** facet（起点 / 番茄 / 晋江 / 知乎盐言 / 七猫 / RoyalRoad / KDP）。
- `packs.toml` 提供目标导向的组合推荐（中文网文长篇 / 番茄短篇 / 故事基本功）。

**可取之处**：它的价值在「分类 + 组合 + 平台维度」，适合当作**功能覆盖自检清单**，而不是代码来源。

### 2.2 oh-story-skill

一个有工程积淀的创作 skill 套件，本报告的主要对标对象。读取范围：

| 类别 | 文件 |
| --- | --- |
| 去 AI 味流程 | `skills/story-deslop/SKILL.md`、`references/deslop-gates.md`、`references/banned-words.md`、`references/anti-ai-writing.md`（37KB，规则模式库） |
| 确定性检测 | `scripts/check-ai-patterns.js`（1439 行）、`scripts/check-degeneration.js`、`scripts/normalize-punctuation.js`、`scripts/style-whitelist.js` |
| 校准测试 | `scripts/test-ai-patterns.sh`（61KB 固件）、脚本内逐规则校准注释 |
| 记忆与裁决 | `references/author-memory.md`、`references/style-resolution.md`、`scripts/author_memory_commit.py` |
| 章节质量 | `references/long-chapter-quality.md`、`references/long-chapter-hooks.md` |
| 文风提取 | `references/style-profile-generator.md`、`references/style-profile-protocol.md` |
| 追踪与导入 | `references/character-state-reverse.md`、`templates/rules/*.md`、`references/tracking-transaction.md` |
| 门禁 | `templates/hooks/guard-outline-before-prose.sh`、`check-prose-after-write.sh`、`detect-story-gaps.sh` |

### 2.3 本项目的对照基线（已确认存在，避免重复推进）

- 去 AI 味两层体系：统计信号层（`server/src/services/styleEngine/signals/`，10 类） + 可编辑规则层（`server/src/services/styleEngine/defaults.ts`）+ 检测自检 prompt（`server/src/prompting/prompts/style/style.prompts.ts`）+ 规则目录手册（`docs/wiki/prompts/anti-ai-rule-catalog.md`）。
- 确定性正文检测：`server/src/services/novel/runtime/proseQuality/ProseQualityDetector.ts`（否定翻转 / 破折号省略号 / 碎句号 / 长段落 / 复读 / 截断 / AI 自指 / 占位符 / 工程词泄漏）。
- 章节结构化资产：读者体验合同（`docs/wiki/workflows/reader-experience-contract.md`）、兑现台账（`docs/wiki/workflows/payoff-ledger-contract.md`）、角色信息边界与硬事实（`docs/wiki/workflows/chapter-production-chain.md`）、时间线约束层（`docs/wiki/workflows/timeline-constraint-layer.md`）、章节验收与修复指令（`server/src/prompting/prompts/novel/chapterAcceptance.prompts.ts`）。
- 质量与保护机制：改写信息守恒护栏、写法特征提取三重验证、章节目录重试预算（`server/src/services/novel/runtime/acceptance/retries/ChapterReviewRetryBudget.ts`）。
- 周边能力：拆书 / 参考作品分析、写法档案、合规预检、书名生成、封面生成。

---

## 三、能力对照

判定列含义：**已覆盖**（本项目已有等价机制，不重复推进）/ **部分覆盖**（有同类机制但维度或闭环不完整）/ **缺失**（本项目没有对应能力）。

| 能力 | oh-story-skill 的做法 | 本项目现状 | 判定 |
| --- | --- | --- | --- |
| 禁用词/短语表 | `banned-words.md` 分 7 类 + 毒级评分，按 Gate A 逐项替换 | 规则目录 forbidden + risk 分级，可编辑 | 部分覆盖（词表覆盖面更窄） |
| 句式指纹确定性检测 | 7 类 blocking（同句否定翻转、破折号、音量反差、否定排比、反序对比、预告式收尾、章尾状态总结）+ 14 类 advisory | `ProseQualityIssueCode` 9 类，含否定翻转、破折号/省略号 | 部分覆盖（缺文末窗口类与密度类） |
| **密度型检测**（套词 / 比喻 / 解释链 / 引号强调 / 微动作 / 动作清单 / 抽象总结 / 系统公告腔 / 过度精炼 / 低连接密度） | 每组有 `MIN_HITS` + `PER_KILO` 双门槛，只做 advisory | 只有 5 类单句/全文聚集信号，无 per-kilo 密度体系 | **缺失** |
| **章尾升华/预告的确定性检测** | `trailer-ending` / `trailer-summary`，只扫文末 600 字窗口，剥引号后按可见字数取整 | 只有 prompt 规则 `forbid-ending-elevation`，无确定性窗口检测 | **缺失** |
| 退化检测（复读 / 截断 / 占位 / AI 自指 / 工程词） | `check-degeneration.js`，tier1/tier2 分级 + 对话行豁免 | `ProseQualityDetector` 全覆盖同类项 | 已覆盖（缺 tier 分级与对话行豁免细分） |
| **删除比例上限 + 字数下限保护** | 分级限幅（轻 ≤15% / 中 ≤25% / 重 ≤35%），跌破下限改「降 AI 重写」，不可安全修复的标 `[需复核]` | 只有「改写信息守恒」护栏（判增删，不控幅度） | **缺失** |
| **改写收敛终止** | 同段 2 轮无净改动即停、全文 ≤3 轮、末轮仍多处则移交人工 | 重试被硬限制为 ≤1 次，无收敛判定、无移交语义 | **缺失** |
| **检测豁免清单（按书字面片段）** | 书目录下 `.deslop-whitelist`，一行一个字面片段 + `# 来源/用途` 注释；不跨书继承；不因报警自动放行；事实/字数/占位/工程词/截断不豁免 | 无豁免机制，只能整条规则开关 | **缺失** |
| **逐规则校准基线与固件** | blocking 规则要求真人语料命中 ≈0，并写明语料规模与误报率（如「qimao 长篇 5584 章 + heiyan 短篇 3983 篇，per-kilo 1.0→1.5 误报 0.43%→0.39%」） | 阈值明确标注为「待校准工程初值」 | **缺失（方法学）** |
| 表达维度裁决 | 按维度取最窄适用值（当前请求 > 本书文风 > 本书作者记忆 > 题材/流程/全局记忆 > 对标 > 默认），并输出「被覆盖的默认条款」随任务传递 | 有 `AntiAiPolicyResolver` + 写法合同渲染，但无「按维度取值 + 覆盖报告」的可审计输出 | 部分覆盖 |
| 文风档案置信度 | 各段标 `high/medium/low`，整档可标「文风可用：否」并降级回默认门禁 | 三重验证（跨源 / 预测力 / 排他性）只有通过或不通过 | 部分覆盖 |
| 作者记忆（跨书偏好） | 完整协议：证据 → 候选（pending/conflict）→ active → 变更记录；scope 四层；5 类 kind；查询硬上限 2048 字节；显式「记住」给回执 | 只有写法档案与风格模板，无跨书偏好记忆与候选治理 | **缺失** |
| 细纲「禁止提前释放」+ 终局储备复核 | 细纲期产出「本章不得提前揭示的真相/底牌/关系结论」；终局储备检查「本单元是否动用了本阶段不该解锁的终局底牌」 | 有义务合同 `forbidden_crossing`、资源底牌事件、Book Contract 阶段兑现，但无细纲期显式清单与终局储备判据 | 部分覆盖 |
| 读者契约 / 期待债 / 兑现归属 / 主角代理权 | 单文件清单式复核 | `ReaderExperienceContract` + `PayoffLedger` + 义务合同，已结构化并接入 writer/acceptance/repair | 已覆盖 |
| 章节质量评分 + 精修策略 | 五维评分（核心一致度/表层重写度/格式一致度/可读性/逻辑连贯）→ 策略 rewrite/compress/de_ai/polish | 六维评分（coherence/pacing/repetition/engagement/voice/overall）+ `repairDirectives`（patch/rewrite/manual）+ 字数控制 | 已覆盖 |
| 角色快照（含 knowledge / open_threads） | 反向抽取规则 + 字段上限 + 字节上限 | 状态快照含硬事实、角色资源、关系动态、**角色信息边界** | 已覆盖 |
| 写前门禁（无批准细纲不写正文） | BLOCKING hook | director 流水线顺序保证 | 已覆盖（实现方式不同） |
| 写后兜底扫描 | PostToolUse hook | `ProseQualityDetector` 接入验收链 | 已覆盖 |
| 扫榜 / 榜单抓取（起点/番茄/晋江/七猫/刺猬猫） | 5 个 scraper | 无 | 不适用（见第六节） |
| 多端 adapter（Claude/Codex/OpenCode/ZCode/Antigravity） | 大量同步脚本 | 自有桌面应用 | 不适用 |
| 短剧改编 / 翻译出海 / 互动小说 | 有对应 skill | 无 | 暂缓（超出当前产品优先级） |

---

## 四、分级优化项

### Tier 1 — 可立即落地（与现有架构同构，风险低）

#### T1-1 改写/审校收敛终止规则

- **来源**：`skills/story-deslop/references/deslop-gates.md`（「删除优先判断」第 3–4 条）、`references/anti-ai-writing.md`（三遍法与收敛约束）。
- **本项目落点**：`server/src/services/novel/runtime/chapterRuntimePipeline.ts`（当前 `maxRetries` 被硬夹到 ≤1）、`server/src/services/novel/runtime/acceptance/retries/ChapterReviewRetryBudget.ts`、修复类 prompt。
- **建议规则**：同一段连续两轮修复无净改动 → 停止该段修复；全文最多 3 轮重扫；末轮仍有 ≥ 阈值处问题 → 标记「需复核」并按降级完成处理，不再继续重试。
- **相容性**：完全相容。与 AGENTS.md「局部质量债务不阻塞全局链」一致，收敛终态走既有质量债通道。
- **价值**：直接对应已记录的痛点——跨模型质量闭环容易来回拉锯、循环不收敛。
- **前置条件**：需要「净改动」的判定口径（可用现有改写信息守恒护栏与补丁身份比对结果）。

#### T1-2 删除比例上限分级 + 字数下限保护 + 「需复核」标记

- **来源**：`deslop-gates.md` 删除优先判断第 3 条（轻 ≤15% / 中 ≤25% / 重 ≤35%，跌破字数下限改「降 AI 重写」，不删完再用废话凑字）。
- **本项目落点**：修复链路 prompt（`prompts/novel/chapterPatchRepair.prompts.ts` 等）+ 改写信息守恒护栏。
- **建议规则**：按检测到的 AI 味等级限制单次修复的删除比例；删到跌破字数下限时改用「降 AI 重写」而非继续删；无法安全修复的片段标记需复核，保留原文而不是删除。
- **相容性**：相容。现有护栏只判「信息是否增删」，本项补「幅度是否过大」，是同一护栏的维度扩展。
- **价值**：避免修复链路把有剧情功能的内容删掉，同时给出可解释的修复上限。

#### T1-3 检测豁免清单（按书字面片段白名单）

- **来源**：`references/style-resolution.md`「检测器如何服从裁决」+ `scripts/style-whitelist.js`。
- **本项目落点**：`server/src/services/styleEngine/signals/` 与 `ProseQualityDetector` 的调用方，新增豁免输入。
- **建议规则**：一行一个字面片段，可用 `# 来源/用途` 注释；只豁免风格类检查（世界观术语、作者有意写法）；事实、字数、占位符、工程词、截断与文件结构检查不豁免；不跨书继承；只登记用户明确的选择，不因检测报警自动放行。
- **相容性**：相容，且符合 AI-first——豁免是**用户显式输入**，不是让程序自行判断，也不是关键词路由。
- **价值**：解决「术语和有意写法被反复误报」的高频投诉，同时不削弱规则强度。

#### T1-4 扩展确定性密度信号（作为证据注入，不做硬判定）

- **来源**：`scripts/check-ai-patterns.js` 的 advisory 组：`cliche-density-tic`、`metaphor-density-tic`、`reasoning-chain-tic`、`quote-emphasis-tic`、`micro-action-tic`、`action-list-tic`、`abstract-summary-tic`、`system-notice-formality-tic`、`overcompressed-prose-tic`、`low-connective-density-tic`。
- **本项目落点**：`server/src/services/styleEngine/signals/index.ts`、`shared/types/styleEngine/signals.ts`、`server/src/services/styleEngine/signals/README.md`。
- **建议优先级**（按其误报风险从低到高）：
  1. 套词密度（仿佛/一丝/缓缓… 每千字）；
  2. 比喻密度（好像/像是/仿佛/如同 + 「X 一样」）；
  3. 解释链密度（知道/明白/这意味着/必须…，需「核心词 + 抽象词」双桶达标）；
  4. 引号强调密度（叙述里 1–4 字短词加引号）；
  5. 抽象总结密度（命运的齿轮 / 才刚刚开始 / 这一刻终于明白）；
  6. 微动作与套式反应聚集；
  7. 动作清单 / 过度精炼短段 / 低连接密度（需谨慎，与「删过头」互为反向）。
- **相容性**：相容。必须沿用本项目的既有定位——**统计信号只作为候选证据进入检测 prompt，不授予 `ruleId`、不授予修文许可、不做硬判定**（与 `signals/README.md` 一致）。
- **前置条件**：同步上调 findings 上限（当前总量 12 条、每条最多 2 条），新信号排在既有信号之后 emit，避免后置信号被挤掉。

#### T1-5 规则校准策略与固件样本

- **来源**：`check-ai-patterns.js` 逐规则校准注释（真人语料规模 + 误报率）；`scripts/test-ai-patterns.sh`（61KB 固件）；blocking 规则的「真人语料每 20 章 ≤1 处」门槛。
- **本项目落点**：信号与规则的测试夹具；`docs/wiki/prompts/anti-ai-rule-catalog.md` 增加「校准」小节。
- **建议规则**：每条确定性信号/blocking 规则必须附真人语料命中率基线（语料来源、规模、阈值、误报率），并用夹具固化；阈值改动必须同步更新校准数据，否则视为未完成。
- **相容性**：相容，属于测试与文档治理。
- **价值**：这是把反 AI 检测从「工程初值」推进到「可回归」的关键一步，也是目前最容易被忽略的方法学缺口。

### Tier 2 — 需先扩 schema / Prompt Registry

#### T2-1 作者记忆（跨书写作偏好记忆）

- **来源**：`references/author-memory.md` + `scripts/author_memory_commit.py`。
- **建议内容**：`证据 → 候选（pending / conflict）→ active → 变更记录` 管道；scope 四层（book / genre / workflow / global）；kind 五类（prose_style / story_design / workflow / delivery / interaction）；显式「记住」返回回执；查询有硬性字节预算；候选不参与约束、冲突不直接覆盖旧规则。
- **本项目落点**：新增服务模块 + PromptAsset（按 Prompt Governance 注册）。
- **相容性**：需谨慎设计。判定「是否属于长期习惯」必须由**结构化 AI 输出**决定，不得关键词触发；且必须与「小说事实只进设定/追踪」严格分离。
- **前置条件**：明确与现有「写法档案 / 风格模板」的边界——写法档案管作品文风，作者记忆管跨书偏好，两者不可互相写入。
- **风险**：面向零基础用户时，这一层容易变成认知负担；建议默认静默沉淀、只在用户主动查看时呈现。

#### T2-2 表达维度裁决（`style_resolution`）

- **来源**：`references/style-resolution.md`。
- **建议内容**：在写法编译/策略解析处输出结构化裁决——本次生效的表达要求及来源、**被覆盖的默认条款**、必须保留的事实与信息边界，并原样随任务传递给写作、检测、审稿。
- **本项目落点**：`server/src/services/styleEngine/AntiAiPolicyResolver.ts`、`StyleCompiler.ts`。
- **相容性**：相容，属于既有 resolver 输出结构的扩展。
- **价值**：让「写法 / 规则 / 默认值」的冲突有单一可审计出口，避免规则互相覆盖时行为不可解释（现在是靠 prompt 文本渲染，缺可机读的覆盖报告）。

#### T2-3 写法档案置信度与不可用降级

- **来源**：`references/style-profile-generator.md`、`references/style-profile-protocol.md`（各段 `high/medium/low`、「文风可用：否」）。
- **建议内容**：写法档案各段带置信度；整档可标记不可用及原因；下游写作与检测按置信度降级回默认规则。
- **本项目落点**：写法档案 schema + `StyleCompiler` / 检测 prompt。
- **相容性**：相容，是既有三重验证（跨源/预测力/排他性）的粒度细化。
- **价值**：避免低质量对标素材把整本书的写法基线带偏。

#### T2-4 细纲「禁止提前释放」清单前移 + 终局储备复核

- **来源**：`references/long-chapter-quality.md`「读者契约与终局储备双向审查」。
- **现状差距**：本项目已有义务合同的 `forbidden_crossing`、资源底牌事件、Book Contract 阶段兑现阶梯，但「本章不得提前揭示什么」目前是**章节义务合同阶段**产出，没有在细纲生成期就显式列出；也缺少「本单元是否动用了本阶段不该解锁的终局底牌（宿敌/真相/身份/金手指上限）」这一判据。
- **本项目落点**：`server/src/prompting/prompts/novel/volume/chapterDetail.prompts.ts` 的细纲 schema，与章节验收复核清单。
- **相容性**：相容，属于已有 schema 的字段扩展，且复用既有义务合同通道。
- **风险**：字段增加会拉长细纲 prompt；需控制表述长度并与 `forbidden_crossing` 合并去重。

### Tier 3 — 不适用 / 暂缓

| 项 | 结论 | 原因 |
| --- | --- | --- |
| 榜单抓取 scraper（起点/番茄/晋江/七猫/刺猬猫） | 暂缓 | 需外部抓取、反爬与平台合规评估；不属于「帮新手完成一整本书」的主线。若要做选题支持，应走 AI 结构化「题材趋势」分析而非硬抓页面（也符合 AI-first） |
| 多 IDE/CLI adapter 与多端 hook 同步 | 不适用 | 本项目是自有桌面应用，不存在多端 skill 分发问题 |
| awesome-novel-skills 的 211 条收录与 discover 脚本 | 不适用 | 属世界知识维护；本项目借其**分类体系**做覆盖自检即可 |
| 短剧改编 / 翻译出海 / 互动小说 | 暂缓 | 超出当前产品优先级；AGENTS.md 明确要求避免引入新的工作流分支 |
| 封面生成 | 不适用 | 本项目已有 `server/src/services/image/novelCover/` |
| 逐字符级标点归一化脚本 | 暂缓 | 本项目已有标点相关规则与提示，单独引入字符级重写工具风险大于收益 |

---

## 五、已确认不重复推进的能力

以下能力经核对本项目已有等价或更强的实现，本轮**不重复建设**：

1. **去 AI 味两层体系**（统计信号 + 可编辑规则 + 检测/自检 prompt）——与 `oh-story-skill` 同构，方向一致。
2. **章节质量评分与精修策略**——本项目为六维评分 + `repairDirectives`（patch/rewrite/manual）+ 字数控制，粒度不低于对方的五维 + 四策略。
3. **读者契约 / 期待债 / 兑现归属 / 主角代理权**——已由 `ReaderExperienceContract`、`PayoffLedger`、章节义务合同结构化承接，并统一供给 writer / acceptance / repair。
4. **角色信息边界与快照字段**——已有硬事实、角色资源、关系动态、信息边界与伏笔 delta，覆盖对方的 `knowledge` / `open_threads` 意图。
5. **写前门禁与写后兜底**——由 director 流水线顺序 + 验收链中的确定性检测承接，机制不同但覆盖等价。
6. **退化检测**（复读/截断/占位/自指/工程词）——已完整覆盖。
7. **拆书 / 写法档案 / 合规预检 / 书名 / 封面**——均有对应实现。

---

## 六、可借用的信息架构观察（来自 awesome-novel-skills）

1. **11 阶段分类可当作功能覆盖自检清单**：选题 → 设定 → 人物 → 大纲 → 正文 → 记忆 → 审稿 → 包装 → 发布 → 翻译 → 改编。用它对本项目扫一遍，较好的候选缺口是「包装」阶段的**简介（blurb）生成**——本项目已有书名生成与合规预检，但未见简介生成入口。是否需要，建议由你判断。
2. **「按投稿平台查找」提示一个可选能力**：为番茄/起点/晋江等平台预置章节字数区间、标点与对话占比等**平台规格**，供合规预检与写法默认值消费。本项目的合规预检已是天然的挂载点。
3. **组合推荐（packs）的思路**：本项目已经有「开书想法 → 生成方向 → 写法 → 卷战略」的引导链，比对方的目标导向组合更贴合零基础用户，无需照搬。

---

## 七、建议的落地顺序

1. **先做 T1-1 + T1-2**（收敛终止 + 删除上限）：这两项直接改善当前最痛的「修复链路拉锯」问题，改动集中在既有护栏与 prompt，风险最低。
2. **再做 T1-3 + T1-4**（豁免清单 + 密度信号）：提升检测质量与用户可解释性，需要同步调整信号上限与检测 prompt。
3. **随后做 T1-5**（校准策略）：为上述所有阈值建立基线，避免「调了阈值但不知道好不好」。
4. **Tier 2 单独立项**：T2-4（细纲字段扩展）成本最低、收益明确，可优先；T2-1（作者记忆）价值高但需先明确与写法档案的边界，建议最后评估。

---

## 八、来源索引

**oh-story-skill**

- `skills/story-deslop/SKILL.md`
- `skills/story-deslop/references/deslop-gates.md`（门禁 A–G、删除优先判断、白名单机制）
- `skills/story-deslop/references/banned-words.md`
- `skills/story-deslop/references/anti-ai-writing.md`
- `skills/story-deslop/references/author-memory.md`
- `skills/story-deslop/references/style-resolution.md`
- `skills/story-deslop/scripts/check-ai-patterns.js`（`CLICHE_DENSITY_*`、`METAPHOR_DENSITY_*`、`REASONING_CHAIN_*`、`TRAILER_ENDING_WINDOW_CHARS = 600`、`STOCK_REACTION_PER_KILO = 1.5` 等）
- `skills/story-deslop/scripts/check-degeneration.js`
- `skills/story-deslop/scripts/style-whitelist.js`
- `skills/story-long-write/references/long-chapter-quality.md`（五维评分、精修策略、读者契约与终局储备双向审查）
- `skills/story-long-analyze/references/style-profile-generator.md`、`style-profile-protocol.md`
- `skills/story-import/references/character-state-reverse.md`
- `skills/story-setup/references/templates/hooks/*.sh`、`templates/rules/*.md`

**awesome-novel-skills**

- `data/taxonomy.toml`、`data/packs.toml`、`data/skills.toml`、`README.md`

**本项目对照文件**

- `server/src/services/styleEngine/signals/README.md`、`server/src/services/styleEngine/defaults.ts`
- `docs/wiki/prompts/anti-ai-rule-catalog.md`
- `server/src/services/novel/runtime/proseQuality/ProseQualityDetector.ts`
- `server/src/services/novel/runtime/chapterRuntimePipeline.ts`（`effectiveMaxRetries = Math.max(0, Math.min(maxRetries, 1))`）
- `server/src/services/novel/runtime/acceptance/retries/ChapterReviewRetryBudget.ts`
- `server/src/prompting/prompts/novel/chapterAcceptance.prompts.ts`
- `docs/wiki/workflows/reader-experience-contract.md`、`payoff-ledger-contract.md`、`chapter-production-chain.md`、`timeline-constraint-layer.md`

---

# 附录：awesome-novel-skills 榜单逐类扫描与补充项清单

> 本附录是第二轮补充分析：按榜单自身分组（`data/skills.toml`，共 211 条 / 10 个 group）逐类扫描，提炼**对当前工具有用的补充项**，并与第一轮已完成的能力对照去重。
>
> **方法与局限**：本轮为**榜单层扫描**——依据榜单自身的分类、简介、stages 标签，以及本项目已确认的能力基线做匹配判断，**未逐仓库深读源码**。「可借机制」属线索级结论；进入实现前需按第六节的优先级挑选 1–2 个仓库做单仓库深读（比照第一轮对 `oh-story-skill` 的做法）。
>
> **两点说明**：① 榜单里的 `ExplosiveCoderflome/AI-Novel-Writing-Assistant` 就是本项目自身；② 条目中的 `zenstory-ai/oh-story-claudecode` 系列是第一轮已深读对象 `oh-story-skill` 的同源仓库族，不再重复分析。

## 附录 1 榜单概况与相关性分级

榜单以「创作阶段」和「产品形态」两个维度组织，10 个 group 的分布与对本工具的相关性如下：

| group | 条数 | 相关性 | 说明 |
| --- | --- | --- | --- |
| `companion` | 30 | **高** | 几乎全是去 AI 味 / 人味写作。数量最多、方法论最成熟，是本轮最大的可借鉴区 |
| `pipeline` | 53 | **高** | 中文网文全流程工具，与本项目主链路最接近，可对标流程设计与状态管理 |
| `craft` | 7 | **中高** | 写作基本功与体裁方法库，可补充「自检清单 / 体裁专项」层 |
| `tools` | 12 | **中** | 文风萃取、拆书、选题雷达、项目管理等单点工具 |
| `short` | 6 | **中** | 短篇 / 番茄短故事专用流程，部分机制（冷读、标题打分）可跨用 |
| `apps` | 6 | **中** | 同类桌面/CLI 应用，主要作为竞品对标 |
| `sources` | 22 | 不适用 | 全部是小说下载器与「阅读」书源，法律与合规风险高 |
| `script` | 51 | 不适用 | 短剧 / 漫剧 / 剧本，超出当前产品优先级 |
| `translate` | 15 | 不适用（远期） | 整书翻译与本地化，本项目无翻译线 |
| `beyond` | 9 | 不适用 | 互动小说、小说改游戏 / 漫画 |

## 附录 2 高价值补充项（建议立项候选）

按「可借机制 → 来源条目 → 与本项目的关系」列出。带 ⭐ 的表示与第一轮 Tier 1/Tier 2 项形成互补或强化，建议优先。

### A2-1 ⭐ 去 AI 味规则要用统计学校准，而不是拍阈值

| 来源条目 | 它做了什么 |
| --- | --- |
| `larashero3-dotcom/lieflat-less-ai-tone` | 用 **283 万字人机对照语料**检验 26 项「AI 味」特征，**只保留通过检验的 11 项**再改写，附可复算的检测脚本 |
| `tangwenwen-md/chinese-de-ai-writing` | **按证据分级**：只执行语料验证过的规则，不新增事实、不改断言强度 |
| `ismilewolf-eng/sloptrim-zh` | 85 条模式 + 本地脚本给 **0–100 分**，再按分数分档改写 |
| `evoworkAI/xiaoci-skill` | **23 条带密度门限的可改规则 + 19 条禁改清单**，按 **9 种语体调门限**，`scan.py` 算 AI 味浓度并记**改动台账** |

**本项目关系**：直接强化第一轮的 **T1-5（校准策略与固件）**，并额外给出三个我们目前没有的具体机制：

1. **禁改清单**——不只是「哪些要改」，还要显式声明「哪些绝不能改」（数字、条件、承诺、作者口气）。这与我们已有的「改写信息守恒护栏」同向，但形态更可执行、更可展示给用户。
2. **按语体/写法调门限**——同一套阈值在冷白描、系统爽文、口语现实流里不能通用。我们已有写法档案（`register` / `roughness` 等维度），正好是承载「按语体调门限」的现成载体。
3. **改动台账**——每次改写记录「改了什么、依据哪条规则」，可审计。这也能直接缓解用户对「AI 改坏了我的稿子」的不信任。

**建议**：把「校准 + 禁改清单 + 按写法调门限 + 改动台账」合并成一项立项，落点仍在 `server/src/services/styleEngine/`。

### A2-2 ⭐ 改写力度分级（自由 / 句内 / 原位）

- **来源**：`MrGeDiao/shuorenhua`——中文优先的去套话改写，保留数字/条件/承诺/作者口气，可选**自由 / 句内 / 原位三档改动范围**，附 123 条评测集。
- **本项目关系**：与第一轮 **T1-2（删除比例上限）** 天然配套。T1-2 管「最多能删多少」，本项管「允许在多大范围内动」——两者合起来才构成完整的改写权限模型。
- **价值**：面向零基础用户时，可以提供「轻改 / 中改 / 重写」的直观选择，而不是把所有参数暴露出来。

### A2-3 跨章结构相似度检查

- **来源**：`xwcai999/opencreator-novel`——读者契约与章节控制卡、待兑现承诺账本、确定性校验脚本、**跨章结构相似度检查**、封面。
- **本项目关系**：我们的 `ProseQualityDetector` 与 `repetition` 维度处理的是**章内**重复；**跨章**的句式骨架与场景结构重复（每章都是「醒来 → 冲突 → 内心独白 → 逆转」）目前没有检测手段。这类问题正是长篇读者流失的主因之一。
- **前置条件**：需要一个轻量的章节结构表示（可复用已有的场景卡 / 读者体验合同字段）。

### A2-4 冷读（fresh-reader）验收环节

- **来源**：`asass-11/lengdu`（写完先由独立校准 Agent，再由**全新读者 Agent 首读**，检验「看懂 / 流畅 / 好看」）；`Calliope-Editor/writing-skills`（13 个只评不写 skill，含**试读读者团、经纪人首页审读**）；`haowjy/creative-writing-skills`（读者模拟）。
- **本项目关系**：我们的 `ReaderExperienceContract` 是**计划层**（这章读者应该得到什么），但缺一个**验收层**的「第一次读到这段的人能不能看懂」。两者互补而非重复。
- **风险**：多一轮模型调用会拉长链路，建议只对关键章节（开篇、卷首、卷末）启用。

### A2-5 中文病句/语法层检查

- **来源**：`orange4664/chinese-grammar-proofreader`——逐句检查语序、搭配、成分残缺、指代不明、两面对一面，**只做最小修改，歧义句给两种改法**。
- **本项目关系**：我们的确定性检测覆盖「退化」（复读 / 截断 / 占位 / 工程词）与「AI 味」，但**纯语法病句**是空白。对零基础用户，「这句读不通」和「这句像 AI 写的」是两种不同的求助。
- **相容性**：必须走 AI 结构化输出（不能靠规则匹配中文语法），符合 AI-first。

### A2-6 人物漂移与「反派降智」专项检查

- **来源**：`XINGANLIU/web-novel-writing-skill`（10 阶段流水线，含**人物漂移和反派降智检查**）。
- **本项目关系**：我们有角色硬事实、关系动态、信息边界，但缺少针对**能力表现一致性**的判据（角色/反派在本章是否做出了低于其设定水平的决策）。这是「战力崩坏 / 反派降智」类读者吐槽的直接来源。

### A2-7 改纲影响链（大纲变更的影响面清单）

- **来源**：`duiniwukenaihe/novel-assistant-skill`——单入口网文助手，含**改纲影响链**与章节扩容迁移。
- **本项目关系**：我们的重规划是「停止并按新结构重来」。但用户改了一个设定或卷纲后，**哪些已写章节、未兑现伏笔、角色目标会受影响**，目前没有清单。这与 AGENTS.md「停止重规划必须给出明确原因」的要求同向。
- **落点**：可挂在既有 replan 检查点上，输出影响面而非直接重写。

### A2-8 章节最小审计集（对话占比 / 话疗 / 循环）

- **来源**：`304769384-png/fanqie-novel-skill`——写后跑 **8 项最小审计**（字数、因果链、战斗、**对话占比**、**话疗**、循环等）。
- **本项目关系**：我们的确定性检测有 9 类，但缺**对话占比**与**「话疗」密度**（角色之间反复聊天而剧情不推进）这两类对网文读感影响极大的指标。它们都可用确定性统计得出，符合现有信号层定位。

### A2-9 书名 + 简介（blurb）生成

- **来源**：`kshanxs/book-writer-skill`（简介 / query letter、Book Memory Bank、节奏蓝图）；`xiaotiewinner/xt-webnovel-writing`（立书：书名 / 人设 / **简介**）；`kongxcer555/open-novel-fanqie`（书名简介与事件、拆对标书出套路 JSON、**换壳选切入点**）；`hyi1233/wangwen-writing-skill-kit`（简介模块）。
- **本项目关系**：我们已有书名生成（`TitleGenerationService`）与合规预检，**没有简介生成入口**。这是第一轮 IA 观察第 1 点确认的缺口，本轮得到多条独立印证（4 个以上条目都把「简介」作为开书必产出物）。
- **建议**：作为「包装」阶段的能力补齐，优先级中高（成本低、用户可感知）。

### A2-10 平台规格预置与多平台改写

- **来源**：`lornshrimp/Lorn.NovelWriteSkills`（**13 个平台改写与分发** + 字数/相似度门禁脚本）；`Thatgfsj-easyRep/wangwenwrite-skill`（书名公式与**平台差异化**）；`xiaoyuCR7/general-novel-skill`（34 题材与**多平台规则按需加载**）；`aby-aby111/fanqie-short-story.skill`（标题生成打分、**手机排版**）。
- **本项目关系**：印证第一轮 IA 观察第 2 点。我们的合规预检是天然挂载点；「按平台加载规格」也符合我们既有的写法/模板按需加载模式。
- **注意**：只做**规格约束与提示**（字数区间、标点、对话占比、排版），不做「自动发布」——自动发布涉及账号与平台合规风险，不在本轮建议内。

### A2-11 对抗式审稿与章节失败模式库

- **来源**：`zhlmi/screenplay-review-checklist`（拿 37 条判据**只给你的故事找问题**）；`Vi7QY/screenwriter-skill`（红果 Top100 经验蒸馏的 37 条规则）；`A-cat-with-carrots/OnlyShot`（沉淀 **17 种失败模式**）；`bbroot/novel-master`（每章四维审计、三层伏笔追踪、角色状态机、**节点压缩图谱**）；`dongyanyuxuana/novel-craft`（**逐段 17 维审查**）。
- **可借的两个方法学**：
  1. **只评不写**：把「找问题」和「动手改」严格分离（`Calliope-Editor` 同样如此）。我们现在的 acceptance → repair 是连在一起的，分离后更容易收敛，也直接服务于第一轮 T1-1（收敛终止）。
  2. **失败模式库**：把已发生的失败（不只是规则）沉淀成可复用条目。本项目 wiki 已有这个传统，可扩展出一份「章节失败模式库」，把每次质量债归因后反哺检测规则。

### A2-12 长上下文的摘要分层与快照 diff

- **来源**：`jiaw-Zh/long-novel-writer`（**六层摘要冻结**、实体档案、正典账本、POV 知识边界、写后双 agent 校验）；`qiyan233/novelops-skill`（truth files 记设定与角色认知、生成下一章工作包、**快照 diff**）；`wgwtest/novel-project-strategy`（加载顺序、章节状态与同步规则、新会话恢复）；`lintfengQAQ/webnovel-writer`（事实提交进状态库与 RAG、只读面板）。
- **本项目关系**：我们的状态快照与 RAG 已存在。可借的是两点：**「冻结」语义**（旧章节摘要一旦冻结就不再重算，降低上下文与成本）与**快照 diff**（把「本章状态相对上章变了什么」显式输出，便于人工核对吃书问题）。

### A2-13 多版本方案生成与写作诊断

- **来源**：`xbraindance/Creative-writing-skill`（**Verbalized Sampling** 一次给出多版点子 / 开头 / 大纲 / 人物，带**卡文诊断**与批评命令）。
- **本项目关系**：我们的「生成方向」环节可以一次给多个方案并附带取舍理由，比单方案更贴合零基础用户「不会选」的场景；「卡文诊断」也可作为写作工作台的一个诊断入口。

### A2-14 体裁专项方法库与自检清单

- **来源**：`Fei2411/inkcraft-writing-skills`（**13 种体裁**写作方法库，每体裁分结构 / 前三章 / 场景写法 / 成文规范 / **自检清单** 五份，带体裁自动分流）；`hyi1233/wangwen-writing-skill-kit`（13 模块按需加载）；`jwynia/agent-skills`（人物弧光、结局、**反套路**）；`sinfiny/AutoWriter`（**悬念公平性**、潜台词、叙述密度）。
- **本项目关系**：我们已有风格模板库（`DEFAULT_STYLE_TEMPLATES`，6 套）。可借的是**「每个体裁配一份自检清单」**这一形态，以及「悬念公平性」「反套路」这两个我们尚未成形的检查视角。

### A2-15 选题与仿写适合度：不做抓取，但可做分析

- **来源**：`WindXRan/fanqie-radar`（榜单快照、题材热度、**多日趋势差分**、**六维仿写适合度评分**）；`ciel-oliver/analyze-hit-novel`（六维拆书、**双时间线**、**三维节奏**、人物关系图 PNG、附章节证据）；`xt-webnovel-writing` 等。
- **本项目关系**：第一轮把「扫榜」判为不适用（需抓取 + 反爬 + 合规风险），本轮维持该结论。但可折中：**让用户自带榜单/样本文本，由 AI 做结构化趋势与仿写适合度分析**——不抓页面，同样拿到结论，且符合 AI-first。
- **附带**：「人物关系图」这类可视化产出，可作为我们拆书结果展示形式的参考。

### A2-16 术语/专名统一表

- **来源**：`oodadoudou/glossary-review-skill`（术语表 xlsx 审查、逐词联网核对上下文、统一人名与组织译名）；`Anarcadia/chuanban-jp-novel-translator` 等翻译类条目也都在维护术语表。
- **本项目关系**：翻译线本身不适用，但**「术语/专名统一表」的机制可迁移**到设定一致性：人名、地名、功法、组织名的统一，以及「用户手动改名后的全局一致」。

### A2-17 同类应用的对标观察（不强推）

| 来源 | 可观察点 |
| --- | --- |
| `voocel/ainovel-cli` | 确定性引擎调度多代理、**卷弧滚动规划**、七维评审、**步骤级断点恢复**、可随时插入修改意见 |
| `YILING0013/AI_NovelGenerator` | 雪花法逐级展开；**AI 流程可在画布上改**（可视化编排） |
| `RhythmicWave/NovelForge` | 卡片式结构化生成、**@DSL 注入上下文**、知识图谱保一致 |
| `syrizelink/OpenFic` | Prompt / Agent / 工作流可自定义、向量检索百万字项目 |
| `EthanYoQ/AI-Novel-Writer` | 按写作阶段绑定不同 Skill |

**结论**：这些应用的共同方向是「可编排 / 可自定义」（面向高级用户）。与本项目「零基础优先、低认知负荷」的定位存在张力，**不建议现在跟随**；但「步骤级断点恢复」与「修改意见可随时插入」两点已在我们的自动导演与恢复链中，可作为对照确认为已覆盖。

## 附录 3 一条跨条目共识：默认只评、只做最小修改

多个独立条目收敛到同一条原则：

- `Calliope-Editor/writing-skills`：13 个 skill **只评不写**。
- `orange4664/chinese-grammar-proofreader`：**只做最小修改**，歧义句给两种改法而不是替用户决定。
- `tangwenwen-md/chinese-de-ai-writing`：**不新增事实、不改断言强度**，只执行语料验证过的规则。
- `lieflat-less-ai-tone`：只按**通过检验**的 11 项改写，其余不动。

**与本项目关系**：这条原则与本项目既有的「改写信息守恒护栏」完全一致，可以进一步强化为面向用户的产品表述——**默认不替你写，只告诉你哪里有问题**；用户明确要求时才执行改写。这既能降低「AI 改坏稿子」的风险，也更符合零基础用户对可控性的需求。

## 附录 4 明确不适用 / 需谨慎

| 分类 | 条数 | 结论与原因 |
| --- | --- | --- |
| `sources` 小说下载器 / 书源合集 | 22 | **不适用**。涉及版权与平台条款风险；本项目已有「导出正文后再拆书」的合规替代方案 |
| `script` 短剧 / 漫剧 / 剧本 | 51 | **不适用**。超出当前产品优先级，AGENTS.md 明确要求避免引入新的工作流分支 |
| `translate` 翻译 / 本地化 | 15 | **暂缓**。本项目无翻译线；仅「术语表机制」可迁移（见 A2-16） |
| `beyond` 互动小说 / 改游戏 / 改漫画 | 9 | **不适用**。属另一条产品形态 |
| 番茄等平台**自动发布**（Playwright 类） | 3+ | **不做**。账号安全与平台合规风险高，且不属于「帮用户写完一本书」的主线 |
| 成人向（H）写作类 | 6 | **不做**。合规风险 |
| 繁体 / 台湾用语专用去 AI 味 | 4 | **暂缓**。可作为未来多地区适配的分支，不是当前缺口 |
| 文风锁定 / 仿写「只仿文笔不抄剧情」 | 3 | **已部分覆盖**。本项目有拆书 + 写法档案 + 三重验证；可关注其「十维风格规范」的维度划分是否比我们的写法 schema 更细 |

## 附录 5 立项优先级建议（汇总附录 2）

| 优先级 | 补充项 | 理由 |
| --- | --- | --- |
| P0 | A2-1 校准 + 禁改清单 + 按写法调门限 + 改动台账 | 与第一轮 T1-5 合并；是反 AI 体系可信度的地基 |
| P0 | A2-2 改写力度分级 | 与第一轮 T1-2 合并；零基础用户最需要的「力度旋钮」 |
| P1 | A2-3 跨章结构相似度 | 长篇留存的直接杀手，当前完全空白 |
| P1 | A2-9 简介（blurb）生成 | 成本低、缺口明确、多条独立印证 |
| P1 | A2-8 对话占比 / 话疗密度 | 确定性可实现，补检测覆盖面 |
| P2 | A2-6 反派降智与人物漂移检查 | 读者吐槽高发区，可与角色一致性合并 |
| P2 | A2-4 冷读验收（仅关键章节） | 与读者体验合同互补，但增加链路成本 |
| P2 | A2-5 中文病句检查 | 补齐「读不通」与「像 AI 写」的区分 |
| P2 | A2-7 改纲影响链 | 服务重规划场景，与 AGENTS.md 恢复规则同向 |
| P3 | A2-10 平台规格、A2-12 摘要冻结与快照 diff、A2-13 多版本方案、A2-14 体裁自检清单、A2-16 术语表 | 各有价值但非当前痛点 |
| 观察 | A2-17 同类应用可编排方向 | 与零基础定位冲突，暂不跟随 |
