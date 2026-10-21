# 正文表达安全检查

本模块拥有正文表达的确定性检查，不负责叙事评价、修文决策、正文保存或任务暂停。AI 仍负责判断人物、因果、情节与读者体验。

`detectNewSevereProseFindings` 通过 `index.ts` 向章节运行时提供候选预检：比较原稿与候选的 high/critical 问题 code，仅拦截原稿没有的严重表达问题。它复用接收与最终保存阶段的同一检测器，不另建字符串判断规则，也不扩大普通低严重度问题的阻塞范围。

`detectProseQuality` 另外输出两条可机械度量的对白证据：`prose_dialogue_ratio`（全篇对白字数占比低于下限或高于上限）与 `prose_talk_loop`（连续多段对白之间没有叙述穿插）。两者阈值来自写法信号策略 `StyleSignalPolicy`（`dialogueRatioMin/dialogueRatioMax/talkLoopRounds/dialogueRatioMinCharacters`），因此不同写法可以声明不同的对白密度区间，未配置时回退全局默认基线；证据只在这些阈值被越过时产出，且严重度固定为 low/medium，不进入 `hasBlockingFindings`，最终是否计入由 AI 验收判断。

预检失败时保留原稿，记录可恢复修文失败及章节质量债，不发起候选模型验收。已执行的修文调用仍消耗一次处理额度，不能退还或另开重试。预检通过不代表正文合格，候选继续走 AI 验收和版本选择。原稿已有的同类问题交给该正常流程判断，不由预检代替 AI 评价。

局部修文的 replacement 和完整修文的正文均复用共享 `CHAPTER_PROSE_QUALITY_RULES`；局部定位原文 targetExcerpt 必须逐字保留，表达约束不能改变锚点。
