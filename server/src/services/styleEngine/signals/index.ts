import { createHash } from "node:crypto";
import { normalizeChapterText } from "@ai-novel/shared/types/chapterEditor/document";
import { styleSignalPolicySchema, type StyleSignalPolicy, type StyleSignalFinding, type StyleSignalScan } from "@ai-novel/shared/types/styleEngine";

const characters = (text: string) => Array.from(text.replace(/\s/gu, "")).length;
function spans(text: string): Array<{ from: number; to: number }> {
  const result = [];
  let from = 0;
  // Paragraphs and Chinese/English terminal marks separate sentences; decimals
  // stay intact. Ellipses and closing quotation marks belong to their sentence.
  for (const mark of text.matchAll(/[。！？!?]+[”"’']*|\.{3,}[”"’']*|(?<!\d)\.(?!\d)[”"’']*|…+[”"’']*|\n/gu)) {
    const to = mark.index + mark[0].length;
    result.push({ from, to }); from = to;
  }
  if (from < text.length) result.push({ from, to: text.length });
  return result;
}
function positions(text: string, term: string): number[] {
  const found = [];
  let cursor = 0;
  while (cursor < text.length) {
    const at = text.indexOf(term, cursor);
    if (at < 0) break;
    found.push(at); cursor = at + term.length;
  }
  return found;
}
// A modifier candidate ends at punctuation, whitespace, a second "的", or a clause
// marker (是/了/在…) that normally starts the predicate. Precision matters more than
// recall here: this stays candidate evidence, never a verdict.
const attributiveBoundary = /[\s、，。！？；：""''「」『』（）()《》〈〉【】…\-,.!?;:—]/u;
const attributiveClauseMarkers = "是了有在把被让给对从向到将与和而就都也还又却便只才";

/** Pure evidence scan. Counts do not decide a violation, risk score or repair. */
export function scanStyleSignals(content: string, policy: StyleSignalPolicy): StyleSignalScan {
  const effective = styleSignalPolicySchema.parse(policy);
  const text = normalizeChapterText(content);
  const findings: StyleSignalFinding[] = [];
  const emit = (ruleId: StyleSignalFinding["ruleId"], from: number, to: number,
    matchedTerms: string[], hits: number, count: number, commas = 0, matchFrom?: number) => {
    if (findings.length >= effective.maxFindings || findings.filter(item => item.ruleId === ruleId).length >= effective.maxPerRule) return;
    // Do not split a supplementary Unicode character when producing the excerpt.
    if (from > 0 && /[\uDC00-\uDFFF]/u.test(text[from])) from--;
    const excerpt = Array.from(text.slice(from, to)).slice(0, effective.excerptCharacters).join("");
    if (!excerpt) return;
    findings.push({ ruleId, from, to: from + excerpt.length, excerpt, matchedTerms, hits, characters: count, commas,
      ...(matchFrom !== undefined ? { matchFrom } : {}) });
  };
  for (const term of new Set(effective.transitionTerms)) {
    const found = positions(text, term);
    if (found.length < effective.transitionRepeatCount) continue;
    for (const at of found.slice(1)) emit("template.transition", at,
      Math.min(text.length, at + term.length + 48), [term], found.length, characters(term), 0, at);
  }
  const units = spans(text);
  for (const span of units) {
    const sentence = text.slice(span.from, span.to);
    const count = characters(sentence);
    if (count < effective.minSentenceCharacters) continue;
    const commas = (sentence.match(/[,，]/gu) ?? []).length;
    if (count >= effective.longSentenceCharacters && commas >= effective.commaCount) {
      emit("rhythm.comma-density", span.from, span.to, [], commas, count, commas);
    }
    for (const [ruleId, terms] of [
      ["surface.repeated-softeners", effective.softenerTerms],
      ["surface.action-adverb-stack", effective.actionAdverbTerms],
      // Degree adverbs and vague modifiers are counted together: the signal is their
      // stacking in one sentence, not either word list on its own.
      ["surface.degree-adverb-stack", [...effective.degreeAdverbTerms, ...effective.softenerTerms]],
      ["surface.filler-stack", effective.fillerTerms],
    ] as const) {
      const matches = [...new Set(terms)].map(term => ({ term, count: positions(sentence, term).length })).filter(item => item.count > 0);
      const hits = matches.reduce((sum, item) => sum + item.count, 0);
      // Degree stacking needs at least one real degree adverb: vague words alone are
      // already reported by the softener signal, and reporting them twice adds nothing.
      if (ruleId === "surface.degree-adverb-stack"
        && !matches.some(item => effective.degreeAdverbTerms.includes(item.term))) continue;
      const threshold = ruleId === "surface.filler-stack" ? effective.fillerCount : effective.clusterCount;
      if (hits >= threshold) emit(ruleId, span.from, span.to, matches.map(item => item.term), hits, count, commas);
    }
    const modifiers: string[] = [];
    for (const at of positions(sentence, "的")) {
      let start = at;
      while (start > 0 && sentence[start - 1] !== "的"
        && !attributiveBoundary.test(sentence[start - 1])
        && !attributiveClauseMarkers.includes(sentence[start - 1])) start--;
      if (characters(sentence.slice(start, at)) >= effective.attributiveMinCharacters) modifiers.push(sentence.slice(start, at));
    }
    if (modifiers.length > 0) {
      emit("syntax.attributive-stack", span.from, span.to, [...new Set(modifiers)].slice(0, 4), modifiers.length, count, commas);
    }
    const particles = positions(sentence, "的").length;
    if (particles >= effective.particleCount) emit("syntax.particle-overload", span.from, span.to, [], particles, count, commas);
  }
  // Decorative marks are counted per sentence unit, delimiters included, so short
  // exclamatory lines are measured too.
  for (const span of units) {
    const sentence = text.slice(span.from, span.to);
    const marks = [...new Set(effective.punctuationTerms)]
      .map(term => ({ term, count: positions(sentence, term).length })).filter(item => item.count > 0);
    const markHits = marks.reduce((sum, item) => sum + item.count, 0);
    if (markHits >= effective.punctuationCount) {
      emit("surface.punctuation-density", span.from, span.to, marks.map(item => item.term),
        markHits, characters(sentence), (sentence.match(/[,，]/gu) ?? []).length);
    }
  }
  // Dialogue tags are a document-level ratio: tags divided by quoted dialogue sentences.
  const dialogueUnits = units.filter(span => /[「」『』“”]/u.test(text.slice(span.from, span.to)));
  const tagMatches = [...new Set(effective.dialogueTagTerms)]
    .map(term => ({ term, count: positions(text, term).length })).filter(item => item.count > 0);
  const tagHits = tagMatches.reduce((sum, item) => sum + item.count, 0);
  if (dialogueUnits.length >= effective.dialogueMinSentences
    && tagHits / dialogueUnits.length >= effective.dialogueTagRatio) {
    emit("surface.dialogue-tag-density", dialogueUnits[0].from, dialogueUnits[0].to,
      tagMatches.map(item => item.term), tagHits, dialogueUnits.length);
  }
  for (const span of shortSentenceRuns(units, text, effective.shortSentenceCharacters, effective.shortSentenceRunCount)) {
    emit("rhythm.short-sentence-run", span.from, span.to, [], span.hits, span.characters);
  }
  const narration = maskNarration(text);
  const narrationCharacters = characters(narration);
  if (narrationCharacters >= effective.connectiveMinCharacters) {
    const matched = [...new Set(effective.connectiveTerms)]
      .map(term => ({ term, count: positions(narration, term).length }))
      .filter(item => item.count > 0);
    const connectiveHits = matched.reduce((sum, item) => sum + item.count, 0);
    // Density is measured on narration only: dialogue carries its own rhythm and would
    // otherwise hide a narration that reads like an outline.
    if (connectiveHits / narrationCharacters < effective.connectiveRatioMin) {
      emit("discourse.low-connective-density", 0, Math.min(text.length, effective.excerptCharacters),
        matched.map(item => item.term).slice(0, 8), connectiveHits, narrationCharacters);
    }
  }
  const comparisonPatterns: Array<RegExp> = [
    /不是[^。！？；]{1,24}，?而是/u,
    /(?:并非|并不是)[^。！？；]{1,24}，?而是/u,
    /是[^，。！？；]{1,24}，不是/u,
  ];
  for (const span of units) {
    const sentence = text.slice(span.from, span.to);
    // Dialogue is judged with its speaker's intent, not by surface pattern.
    if (/[「」『』“”"]/u.test(sentence)) continue;
    for (const pattern of comparisonPatterns) {
      const match = pattern.exec(sentence);
      if (!match) continue;
      emit("syntax.not-is-comparison", span.from, span.to, [match[0]], 1, characters(sentence));
      break;
    }
    // Count every 没 so "没有A，没有B" and "没A，没B" share one threshold.
    const negations = positions(sentence, "没").length;
    if (negations >= effective.negationParadeCount) {
      const terms = ["没有", "没"].filter(term => sentence.includes(term));
      emit("syntax.negation-parade", span.from, span.to, terms, negations, characters(sentence));
    }
  }
  const trailerWindowStart = Math.max(0, text.length - effective.trailerWindowCharacters);
  const trailerTail = text.slice(trailerWindowStart);
  const trailerPatterns: Array<RegExp> = [
    /没人知道/u, /谁也不知道/u, /没有人知道/u, /才刚刚开始/u,
    /真正的[^，。！？]{0,8}(?:才|刚刚)[^，。！？]{0,4}开始/u,
    /但这只是开始/u, /正朝着[^，。！？]{0,12}(?:压|走|来)过去/u,
  ];
  for (const pattern of trailerPatterns) {
    const match = pattern.exec(trailerTail);
    if (!match) continue;
    emit("discourse.trailer-ending", trailerWindowStart + match.index, text.length,
      [match[0]], 1, characters(trailerTail));
    break;
  }
  for (const span of actionListRuns(text, effective.actionListSegments, effective.actionSegmentMaxCharacters)) {
    emit("syntax.action-list", span.from, span.to, [], span.hits, span.characters);
  }
  for (const span of paragraphs(text)) {
    const body = text.slice(span.from, span.to);
    const masked = maskNarration(body);
    const dashes = positions(masked, "——");
    if (dashes.length >= effective.emDashCount) {
      emit("surface.em-dash", span.from + dashes[0], span.to, ["——"], dashes.length, characters(body));
    }
    const visible = characters(body);
    if (visible >= effective.longParagraphCharacters) {
      emit("discourse.long-paragraph", span.from, span.to, [], 1, visible);
    }
  }
  // 冒号候选：只定位含冒号的旁白句，是否为「结论提示」由 AI 按封闭判据判断。
  // 对白引语里的冒号（人名：发言）与版式用途跳过初筛，避免把对话标记成结论宣告。
  for (const span of units) {
    const sentence = text.slice(span.from, span.to);
    if (/[「」『』“”"]/u.test(sentence)) continue;
    const colonMatches = [...sentence.matchAll(/[：:]/gu)];
    if (colonMatches.length === 0) continue;
    const firstColon = colonMatches[0];
    const before = sentence.slice(0, firstColon.index ?? 0).trim();
    const after = sentence.slice((firstColon.index ?? 0) + 1).trim();
    if (before.length < 2 || after.length < 2) continue;
    emit("surface.conclusion-colon", span.from, span.to, ["："], colonMatches.length,
      characters(sentence), (sentence.match(/[,，]/gu) ?? []).length);
  }
  // 同构三连粗筛：连续三句句首相同或都是问句，且长度相近。只产出候选，
  // 是否「高度同构」由 AI 收紧判读；句首属于已知模板/修饰词的交给对应信号，不重复报。
  const excludedOpeners = new Set<string>([
    ...effective.transitionTerms, ...effective.softenerTerms,
    ...effective.actionAdverbTerms, ...effective.degreeAdverbTerms, ...effective.fillerTerms,
  ]);
  for (const group of isomorphicTripleRuns(units, text, excludedOpeners)) {
    emit("syntax.isomorphic-triple", group.from, group.to, [], group.hits, group.characters);
  }
  return { policy: effective, sourceContentHash: createHash("sha256").update(text).digest("hex"),
    coordinateSystem: "utf16-crlf-normalized", findings };
}

const QUOTE_PAIRS: Array<[string, string]> = [["「", "」"], ["『", "』"], ["“", "”"], ["‘", "’"]];

/**
 * Replaces quoted segments with a placeholder of the same length so offsets stay valid.
 * Signals that judge narration only (dashes, comparisons, negation) must not read dialogue.
 */
function maskNarration(text: string): string {
  let result = "";
  let closer: string | null = null;
  for (const char of text) {
    if (closer === null) {
      const pair = QUOTE_PAIRS.find(([open]) => open === char);
      if (pair) {
        closer = pair[1];
        result += "＊";
        continue;
      }
      result += char;
      continue;
    }
    if (char === closer) closer = null;
    result += "＊";
  }
  return result;
}

function paragraphs(text: string): Array<{ from: number; to: number }> {
  const result: Array<{ from: number; to: number }> = [];
  let from = 0;
  for (const match of text.matchAll(/\n+/gu)) {
    if (match.index > from) result.push({ from, to: match.index });
    from = match.index + match[0].length;
  }
  if (from < text.length) result.push({ from, to: text.length });
  return result;
}

/**
 * Finds runs of consecutive short narration sentences. Short dialogue lines and new
 * paragraphs break the run: they are deliberate rhythm, not a telegraphic report.
 */
function shortSentenceRuns(
  units: Array<{ from: number; to: number }>,
  text: string,
  maxCharacters: number,
  minRun: number,
): Array<{ from: number; to: number; hits: number; characters: number }> {
  const result: Array<{ from: number; to: number; hits: number; characters: number }> = [];
  let runStart = -1;
  let runHits = 0;
  let runCharacters = 0;
  for (const span of units) {
    const sentence = text.slice(span.from, span.to);
    const isBoundary = /\n/u.test(sentence) || /[「」『』“”"]/u.test(sentence);
    const count = characters(sentence);
    if (isBoundary || count > maxCharacters || count === 0) {
      runStart = -1;
      runHits = 0;
      runCharacters = 0;
      continue;
    }
    if (runStart < 0) runStart = span.from;
    runHits += 1;
    runCharacters += count;
    if (runHits >= minRun) {
      result.push({ from: runStart, to: span.to, hits: runHits, characters: runCharacters });
      runStart = -1;
      runHits = 0;
      runCharacters = 0;
    }
  }
  return result;
}

const ACTION_OPENERS = ["拿", "放", "推", "拉", "转", "走", "站", "坐", "看", "抬", "低", "伸", "收", "握", "松",
  "开", "关", "点", "按", "擦", "摸", "拽", "扯", "扔", "捡", "递", "接", "掀", "踢", "蹲", "起", "回", "退",
  "进", "出", "拍", "敲", "拧", "塞", "掏", "翻"];
const ACTION_CLAUSE = new RegExp(
  `^(?:他|她|它|我|你|两人|众人)?(?:${ACTION_OPENERS.join("|")})`,
  "u",
);

/**
 * Short action clauses stacked in one paragraph read like a camera log. Only clauses
 * that open with a body verb count, so description and reflection are not swept in.
 */
function actionListRuns(
  text: string,
  minSegments: number,
  maxClauseCharacters: number,
): Array<{ from: number; to: number; hits: number; characters: number }> {
  const result: Array<{ from: number; to: number; hits: number; characters: number }> = [];
  for (const span of paragraphs(text)) {
    const body = text.slice(span.from, span.to);
    let runStart = -1;
    let runHits = 0;
    let runCharacters = 0;
    const reset = () => {
      runStart = -1;
      runHits = 0;
      runCharacters = 0;
    };
    for (const match of body.matchAll(/[^，,。！？；\n]+[，,。！？；]?/gu)) {
      const raw = match[0];
      const clause = raw.replace(/[，,。！？；]$/u, "").trim();
      const count = characters(clause);
      const terminal = /[。！？；]$/u.test(raw);
      if (!clause || /[「」『』“”"]/u.test(clause) || !ACTION_CLAUSE.test(clause)
        || count > maxClauseCharacters) {
        reset();
        continue;
      }
      if (runStart < 0) runStart = span.from + (match.index ?? 0);
      runHits += 1;
      runCharacters += count;
      if (runHits >= minSegments) {
        result.push({
          from: runStart,
          to: span.from + (match.index ?? 0) + raw.length,
          hits: runHits,
          characters: runCharacters,
        });
        reset();
        continue;
      }
      if (terminal) reset();
    }
  }
  return result;
}

/**
 * 连续三句的同构粗筛：句首两字相同，或三句都以问号结尾，且长度相近。
 * 句首属于已知模板/修饰词的跳过（由对应信号覆盖）；对白跳过。
 * 只产出定位候选，是否「高度同构」由 AI 收紧判读。
 */
function isomorphicTripleRuns(
  units: Array<{ from: number; to: number }>,
  text: string,
  excludedOpeners: Set<string>,
): Array<{ from: number; to: number; hits: number; characters: number }> {
  const result: Array<{ from: number; to: number; hits: number; characters: number }> = [];
  const headOf = (sentence: string) => sentence.replace(/^\s+/u, "").slice(0, 1);
  for (let i = 0; i + 2 < units.length; i += 1) {
    const a = text.slice(units[i].from, units[i].to);
    const b = text.slice(units[i + 1].from, units[i + 1].to);
    const c = text.slice(units[i + 2].from, units[i + 2].to);
    if ([a, b, c].some((sentence) => /[「」『』“”"]/u.test(sentence) || !sentence.trim())) continue;
    const na = characters(a);
    const nb = characters(b);
    const nc = characters(c);
    if (na < 5 || nb < 5 || nc < 5 || na > 120 || nb > 120 || nc > 120) continue;
    const ha = headOf(a);
    const hb = headOf(b);
    const hc = headOf(c);
    const sameHead = ha.length > 0 && ha === hb && hb === hc;
    const allQuestions = /[？?]\s*$/u.test(a) && /[？?]\s*$/u.test(b) && /[？?]\s*$/u.test(c);
    if (!sameHead && !allQuestions) continue;
    if (sameHead) {
      const excluded = [...excludedOpeners].some((term) => ha.startsWith(term) || term.startsWith(ha));
      if (excluded) continue;
    }
    const max = Math.max(na, nb, nc);
    const min = Math.min(na, nb, nc);
    if (min === 0 || max / min > 2) continue;
    result.push({ from: units[i].from, to: units[i + 2].to, hits: 3, characters: na + nb + nc });
  }
  return result;
}

export { StyleSignalPolicyResolver } from "./StyleSignalPolicyResolver";
