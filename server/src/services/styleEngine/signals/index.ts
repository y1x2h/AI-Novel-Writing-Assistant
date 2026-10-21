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
  return { policy: effective, sourceContentHash: createHash("sha256").update(text).digest("hex"),
    coordinateSystem: "utf16-crlf-normalized", findings };
}
