/**
 * 拆书用的客观文风统计基线。
 *
 * 借鉴 wenfeng-TGKZ-studio 的思路：在让 AI 解读文风之前，先对原文做一层
 * 不依赖模型的客观统计（句长、对话占比、标点密度、段落节奏等），作为
 * style_technique 小节的输入锚点，避免文风判断完全停留在主观感受。
 *
 * 这里只用纯文本统计，不引入分词或新依赖。
 */

export interface ObjectiveStyleStats {
  charCount: number;
  paragraphCount: number;
  sentenceCount: number;
  avgSentenceLength: number;
  /** 句子长度标准差的近似（字符）。 */
  sentenceLengthStdDev: number;
  /** 对话字符数（含引号）占正文总字符数的比例，0-1。 */
  dialogueRatio: number;
  /** 标点字符数占总字符数的比例，0-1。 */
  punctuationDensity: number;
  /** 感叹号占比，0-1。 */
  exclamationRatio: number;
  /** 问号占比，0-1。 */
  questionRatio: number;
  /** 平均每段字符数。 */
  avgParagraphLength: number;
  /** 出现频次最高的标点及次数（最多 5 项）。 */
  topPunctuation: Array<{ mark: string; count: number }>;
}

const CHINESE_SENTENCE_ENDINGS = /[。！？!?…]+/g;
const CHINESE_PUNCTUATION = /[，。！？、；：""''「」『』（）《》【】…—\-,.!?;:'"()\[\]{}]/g;
const DIALOGUE_MARKS = /[""「」『』]/g;

export function computeObjectiveStyleStats(text: string): ObjectiveStyleStats {
  const content = (text ?? "").trim();
  if (!content) {
    return emptyStats();
  }

  const charCount = content.length;
  const paragraphs = content
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const paragraphCount = paragraphs.length;
  const avgParagraphLength = paragraphCount > 0 ? charCount / paragraphCount : 0;

  const sentenceEndings = content.match(CHINESE_SENTENCE_ENDINGS);
  const sentenceCount = sentenceEndings ? sentenceEndings.length : (content.length > 0 ? 1 : 0);
  const avgSentenceLength = sentenceCount > 0 ? charCount / sentenceCount : charCount;

  const sentenceLengths = splitIntoSentences(content).map((s) => s.length);
  const sentenceLengthStdDev = computeStdDev(sentenceLengths, avgSentenceLength);

  const punctuationMatches = content.match(CHINESE_PUNCTUATION);
  const punctuationCount = punctuationMatches ? punctuationMatches.length : 0;
  const punctuationDensity = charCount > 0 ? punctuationCount / charCount : 0;

  const exclamationCount = countMatches(content, /[！!]/g);
  const questionCount = countMatches(content, /[？?]/g);
  const exclamationRatio = punctuationCount > 0 ? exclamationCount / punctuationCount : 0;
  const questionRatio = punctuationCount > 0 ? questionCount / punctuationCount : 0;

  const dialogueMatches = content.match(DIALOGUE_MARKS);
  const dialogueCharCount = dialogueMatches ? dialogueMatches.length : 0;
  const dialogueRatio = charCount > 0 ? dialogueCharCount / charCount : 0;

  const topPunctuation = computeTopPunctuation(content);

  return {
    charCount,
    paragraphCount,
    sentenceCount,
    avgSentenceLength: round1(avgSentenceLength),
    sentenceLengthStdDev: round1(sentenceLengthStdDev),
    dialogueRatio: round3(dialogueRatio),
    punctuationDensity: round3(punctuationDensity),
    exclamationRatio: round3(exclamationRatio),
    questionRatio: round3(questionRatio),
    avgParagraphLength: round1(avgParagraphLength),
    topPunctuation,
  };
}

export function renderObjectiveStyleStatsForPrompt(stats: ObjectiveStyleStats): string {
  const lines = [
    "客观文风统计（来自原文，供你校准主观判断）：",
    `- 总字符数：${stats.charCount}`,
    `- 段落数：${stats.paragraphCount}，平均每段约 ${stats.avgParagraphLength} 字`,
    `- 句子数：${stats.sentenceCount}，平均句长约 ${stats.avgSentenceLength} 字，句长波动约 ${stats.sentenceLengthStdDev} 字`,
    `- 对话标记占比：${(stats.dialogueRatio * 100).toFixed(1)}%（越高说明对白驱动越强）`,
    `- 标点密度：${(stats.punctuationDensity * 100).toFixed(1)}%`,
    `- 感叹号占标点比例：${(stats.exclamationRatio * 100).toFixed(1)}%，问号占比：${(stats.questionRatio * 100).toFixed(1)}%`,
    stats.topPunctuation.length > 0
      ? `- 高频标点：${stats.topPunctuation.map((item) => `${item.mark}(${item.count})`).join("、")}`
      : "",
  ].filter(Boolean);
  return lines.join("\n");
}

function emptyStats(): ObjectiveStyleStats {
  return {
    charCount: 0,
    paragraphCount: 0,
    sentenceCount: 0,
    avgSentenceLength: 0,
    sentenceLengthStdDev: 0,
    dialogueRatio: 0,
    punctuationDensity: 0,
    exclamationRatio: 0,
    questionRatio: 0,
    avgParagraphLength: 0,
    topPunctuation: [],
  };
}

function splitIntoSentences(text: string): string[] {
  const parts = text.split(CHINESE_SENTENCE_ENDINGS).map((s) => s.trim()).filter((s) => s.length > 0);
  return parts.length > 0 ? parts : [text];
}

function computeStdDev(values: number[], mean: number): number {
  if (values.length <= 1) return 0;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function countMatches(text: string, regex: RegExp): number {
  const matches = text.match(regex);
  return matches ? matches.length : 0;
}

function computeTopPunctuation(text: string): Array<{ mark: string; count: number }> {
  const counts = new Map<string, number>();
  const matches = text.match(CHINESE_PUNCTUATION);
  if (!matches) return [];
  for (const mark of matches) {
    counts.set(mark, (counts.get(mark) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([mark, count]) => ({ mark, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
