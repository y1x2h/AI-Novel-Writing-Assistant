# 写法候选信号

`scanStyleSignals(content, policy)` 无 IO、无模型调用，只提供统计证据。固定判断用于输入数据预处理，不决定违规、修文权限或分数；语义诊断由统一接收闸门与手动检测 Prompt 完成。零命中仍调用原有 AI 检测。

当前信号共十八类：模板过渡词重复（`template.transition`）、长句逗号密度（`rhythm.comma-density`）、连续短句（`rhythm.short-sentence-run`）、模糊词聚集（`surface.repeated-softeners`）、动作副词聚集（`surface.action-adverb-stack`）、名词前长定语（`syntax.attributive-stack`）、单句「的」字过载（`syntax.particle-overload`）、程度副词与模糊词同句叠用（`surface.degree-adverb-stack`）、填充虚词聚集（`surface.filler-stack`）、装饰性标点堆砌（`surface.punctuation-density`）、对话标签密度（`surface.dialogue-tag-density`）、旁白破折号（`surface.em-dash`）、叙述连接密度过低（`discourse.low-connective-density`）、否定排比（`syntax.negation-parade`）、否定对比句（`syntax.not-is-comparison`）、动作清单式描写（`syntax.action-list`）、章末预告式收尾（`discourse.trailer-ending`）、长段落跨镜头（`discourse.long-paragraph`）。

叙述类信号先按引号遮罩对白再统计：破折号只数旁白里的「——」，连接密度只看旁白，否定对比句跳过整句对白，避免把人物说话方式当成叙述问题。连续短句要求连续三条以上、每条不超过十个字，遇到对白或新段落即中断；否定排比在同一句内统计「没」的出现次数，兼容「没有A，没有B」与「没A，没B」；动作清单要求同一段内连续四个以上、每条不超过八个字且以身体动作动词开头的分句；章末预告只在结尾窗口内检索；长段落按单段可见字数判断，提示按镜头断段。这些信号同样只作证据，规则目录条目都是 `risk` 且不自动改写。

长定语用「的」的位置向前回退到修饰语起点，遇到标点、空白、另一个「的」或谓语起始标记（是/了/在…）即停止；「的」字过载按句内计数；程度副词把程度词表与模糊词表合并后复用聚集逻辑，但要求至少命中一个真正的程度副词，否则与模糊词信号重复；标点按句内计数，且必须放在句长门槛之外，否则「你怎么能这样？？！！」这类短句会被 minSentenceCharacters 直接跳过；对话标签密度按全文统计对话标签数 ÷ 带引号的对白句数，只有对白句数达到下限且比例越线时才报告。这四类都只在同一句内或全文比例上统计，宁缺勿滥：定语、多个「的」、填充虚词与标点在中文里本身合法，因此对应的规则目录条目都是 `risk`，不做自动改写。

每条规则最多两个片段、总计二十四条，片段与坐标来自保留空白的 CRLF 归一化正文，使用编辑器 UTF-16 坐标。阈值计数使用非空白 Unicode 字符。模板首现不报告；密度统计按句和段落边界，对白保留给 AI 判断。上限随信号种类增加同步调整，新增信号排在既有信号之后 emit，避免后置信号被前置信号挤掉。

模型输入只展示每类首个示例、计数与统计标签 `signalCode`，不重复坐标和词表；完整快照、证据和缓存身份保持不变。统计标签不能作为真实反 AI 规则的 `ruleId/styleRuleId`，普通写法合同问题由 AI 使用 null 标识。这样减少重复输入并保留规则权限边界。

新作业的载荷持有完整策略快照。重入和恢复使用持久载荷；历史无快照作业不补默认。策略、实际信号与动态正文参与验收缓存身份。版本及阈值是待校准工程初值，不是写作鉴定标准。
