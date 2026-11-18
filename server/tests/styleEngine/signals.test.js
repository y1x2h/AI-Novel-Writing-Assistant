const test = require('node:test');
const assert = require('node:assert/strict');
const { scanStyleSignals } = require('../../dist/services/styleEngine/signals');
const { createStyleSignalPolicy, styleSignalScanSchema } = require('../../../shared/dist/types/styleEngine.js');
const scan = (text, overrides = {}) => scanStyleSignals(text, { ...createStyleSignalPolicy(), ...overrides });
const rule = (text, id, overrides) => scan(text, overrides).findings.filter(item => item.ruleId === id);
const sentence = (size, commas) => '甲'.repeat(size - commas) + '，'.repeat(commas);

test('transition evidence starts at the repeated occurrence, never grants a verdict for first use', () => {
  const text = '值得注意的是，门没锁。值得注意的是，窗也没锁。';
  const result = rule(text, 'template.transition');
  assert.equal(result.length, 1);
  assert.equal(result[0].matchFrom, text.lastIndexOf('值得注意的是'));
  assert.equal(result[0].hits, 2);
});
test('one transition and two distinct first-use transitions have no repetition evidence', () => {
  assert.deepEqual(rule('值得注意的是，门没锁。', 'template.transition'), []);
  assert.deepEqual(rule('值得注意的是，门没锁。不可否认，窗也没锁。', 'template.transition'), []);
});
test('chapter repetition crosses short sentences and paragraphs, with a configurable threshold', () => {
  const text = '不可否认。\n不可否认。';
  assert.equal(rule(text, 'template.transition').length, 1);
  assert.equal(rule(text, 'template.transition', { transitionRepeatCount: 3 }).length, 0);
});

test('a bounded repeated-expression excerpt still contains the occurrence it identifies', () => {
  const term = '值得注意的是';
  const text = term + '甲'.repeat(30) + term + '乙'.repeat(30);
  const item = rule(text, 'template.transition', { excerptCharacters: 24 })[0];
  assert.ok(item.excerpt.includes(term));
  assert.equal(item.from, text.lastIndexOf(term));
});
test('comma density finds an 80-character sentence with four commas', () => {
  const result = rule(sentence(80, 4), 'rhythm.comma-density');
  assert.equal(result.length, 1);
  assert.equal(result[0].characters, 80);
  assert.equal(result[0].commas, 4);
});
test('comma density does not combine distinct sentences or paragraphs', () => {
  for (const text of [sentence(40, 4) + '。' + sentence(40, 4), sentence(40, 4) + '\n' + sentence(40, 4)]) {
    assert.equal(rule(text, 'rhythm.comma-density').length, 0);
  }
});
test('comma density respects 79/80 characters and 3/4 commas, including ASCII commas', () => {
  assert.equal(rule(sentence(79, 4), 'rhythm.comma-density').length, 0);
  assert.equal(rule(sentence(80, 3), 'rhythm.comma-density').length, 0);
  assert.equal(rule(sentence(80, 4).replaceAll('，', ','), 'rhythm.comma-density').length, 1);
});
test('softener clustering counts different terms in the same sentence', () => {
  const result = rule('他似乎见到仿佛是一种幻象的影子在院子里浮现。', 'surface.repeated-softeners');
  assert.equal(result.length, 1);
  assert.equal(result[0].hits, 3);
});
test('softener signals skip short sentences and meaningful evidence remains for AI to decide', () => {
  assert.equal(rule('似乎仿佛一种。', 'surface.repeated-softeners').length, 0);
  assert.equal(rule('他似乎见到了仿佛幻象的影子在院子里浮现。', 'surface.repeated-softeners').length, 0);
});
test('softener 2/3 boundary applies only within each sentence, including ellipses', () => {
  const id = 'surface.repeated-softeners';
  assert.equal(rule('他似乎见到了仿佛幻象的影子……一种景象在窗外浮现。', id).length, 0);
  assert.equal(rule('他似乎见到了仿佛幻象的影子...一种景象在窗外浮现。', id).length, 0);
  assert.equal(rule('他似乎见到了仿佛幻象的影子，一种景象在窗外浮现。', id).length, 1);
});
test('action adverb clustering finds three occurrences without requiring the same adverb', () => {
  const result = rule('他缓缓走近，微微侧身，又轻轻推开了木门。', 'surface.action-adverb-stack');
  assert.equal(result.length, 1);
  assert.equal(result[0].hits, 3);
});
test('action signals leave two occurrences and short sentences alone', () => {
  const id = 'surface.action-adverb-stack';
  assert.equal(rule('他缓缓走近，微微侧身，推开了木门。', id).length, 0);
  assert.equal(rule('缓缓微微轻轻。', id).length, 0);
});
test('action 2/3 boundary is versioned and quotation is preserved rather than exempted by a verdict', () => {
  const text = '“他缓缓走近，微微侧身，又轻轻推开了木门。”';
  const id = 'surface.action-adverb-stack';
  assert.equal(rule(text, id).length, 1);
  assert.equal(rule(text, id, { clusterCount: 4 }).length, 0);
  assert.equal(rule(text, id)[0].excerpt, text);
});
test('Unicode character counts and UTF-16 normalized offsets use different units', () => {
  const text = '😀开头\r\n' + '😀'.repeat(76) + '，'.repeat(4);
  const normalized = text.replaceAll('\r\n', '\n');
  const item = rule(text, 'rhythm.comma-density')[0];
  assert.equal(item.characters, 80);
  assert.equal(item.from, '😀开头\n'.length);
  assert.equal(normalized.slice(item.from, item.to), item.excerpt);
  assert.equal(item.to - item.from, 156);
});
test('evidence is bounded per rule and in total without trimming source whitespace', () => {
  const text = '  \n' + ('值得注意的是，他似乎看到仿佛一种幻象。他缓缓微微轻轻走到门前。' + sentence(80, 4) + '。').repeat(20);
  const result = scan(text);
  assert.ok(result.findings.length <= 24);
  for (const item of result.findings) {
    assert.equal(text.slice(item.from, item.to), item.excerpt);
    assert.ok(result.findings.filter(other => other.ruleId === item.ruleId).length <= 2);
  }
  assert.deepEqual(styleSignalScanSchema.parse(result), result);
});
test('policy words and thresholds are copied into each scan result and do not mutate caller state', () => {
  const policy = createStyleSignalPolicy();
  const result = scanStyleSignals('不可否认。不可否认。', policy);
  policy.transitionTerms.length = 0;
  assert.ok(result.policy.transitionTerms.length > 0);
  assert.throws(() => scan('正文', { revision: 'unknown' }), /style-signals-v1/);
});

test('long attributives before 的 are reported as candidate evidence, short ones are left alone', () => {
  const id = 'syntax.attributive-stack';
  const result = rule('他看着那个穿着灰色旧夹克的男人。', id);
  assert.equal(result.length, 1);
  assert.ok(result[0].matchedTerms.some(term => term.includes('灰色旧夹克')));
  assert.equal(result[0].excerpt, '他看着那个穿着灰色旧夹克的男人。');
  assert.equal(rule('他的外套搭在椅背上。', id).length, 0);
  assert.equal(rule('他站着，他的外套搭在椅背上。', id).length, 0);
  assert.equal(rule('这是第一句长一点的说明。', id).length, 0);
  assert.equal(rule('一二三四的名字被写在墙上。', id, { attributiveMinCharacters: 4 }).length, 1);
  assert.equal(rule('他的名字被写在墙上。', id, { attributiveMinCharacters: 4 }).length, 0);
});
test('particle overload counts 的 inside one sentence and respects the threshold', () => {
  const id = 'syntax.particle-overload';
  const result = rule('他的书包的拉链的扣子坏了。', id);
  assert.equal(result.length, 1);
  assert.equal(result[0].hits, 3);
  assert.equal(rule('他的书包的拉链坏了。', id).length, 0);
  assert.equal(rule('他的书包的拉链的扣子坏了。', id, { particleCount: 4 }).length, 0);
});
test('degree adverbs stacking with vague words are reported without deciding a violation', () => {
  const id = 'surface.degree-adverb-stack';
  const result = rule('他非常紧张，仿佛好像要说什么。', id);
  assert.equal(result.length, 1);
  assert.equal(result[0].hits, 3);
  assert.ok(result[0].matchedTerms.includes('非常') && result[0].matchedTerms.includes('好像'));
  assert.equal(rule('他非常紧张，什么也说不出来。', id).length, 0);
  // Vague words alone belong to the softener signal, not to this one.
  assert.equal(rule('他似乎仿佛好像见过。', id).length, 0);
});
test('new syntax signals stay inside the shared finding budget and schema', () => {
  const text = '他看着那个穿着灰色旧夹克的男人。他的书包的拉链的扣子坏了。他非常紧张，仿佛好像要说什么。';
  const result = scan(text);
  assert.deepEqual(styleSignalScanSchema.parse(result), result);
  assert.ok(result.findings.length <= 24);
  for (const item of result.findings) {
    assert.ok(result.findings.filter(other => other.ruleId === item.ruleId).length <= 2);
  }
});
test('decorative punctuation stacking is counted per sentence unit and left alone when functional', () => {
  const id = 'surface.punctuation-density';
  assert.equal(rule('你到底想怎么样？', id).length, 0);
  const stacked = rule('你怎么能这样？？！！我不管了。', id);
  assert.equal(stacked.length, 1);
  assert.equal(stacked[0].hits, 4);
  assert.equal(rule('桌上摆着红、橙、黄、绿、蓝五种颜料。', id).length, 1);
  assert.equal(rule('桌上摆着红、橙、黄三种颜料。', id).length, 0);
  assert.equal(rule('他犹豫了很久。', id).length, 0);
});
test('filler words stacking is reported without deciding a violation', () => {
  const id = 'surface.filler-stack';
  const result = rule('反正结果都一样，毕竟他早就决定了。', id);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].matchedTerms.sort(), ['反正', '毕竟']);
  assert.equal(rule('毕竟他早就决定了。', id).length, 0);
});
test('dialogue tag density compares tags against quoted dialogue sentences', () => {
  const id = 'surface.dialogue-tag-density';
  const tagged = '「你来了。」他说道。\n「嗯。」她说道。\n「坐吧。」他说道。\n「好。」她说道。\n「走吧。」他说道。';
  const result = rule(tagged, id);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].matchedTerms, ['说道']);
  const untagged = '「你来了。」他把杯子推过去。\n「嗯。」她坐下来。\n「坐吧。」他拉开椅子。\n「好。」她看着窗外。\n「走吧。」他先出门。';
  assert.equal(rule(untagged, id).length, 0);
  assert.equal(rule(tagged, id, { dialogueTagRatio: 1 }).length, 0);
  assert.equal(rule('「你来了。」他说道。', id).length, 0);
});

test('telegraphic short-sentence runs are evidence, dialogue and long sentences are not', () => {
  const id = 'rhythm.short-sentence-run';
  const result = rule('他推门。屋里没开灯。他摸到桌边。', id);
  assert.equal(result.length, 1);
  assert.equal(result[0].hits, 3);
  assert.equal(rule('「你来了。」「我知道。」「坐吧。」', id).length, 0);
  assert.equal(rule('他推门而入，屋里没有开灯，他扶着墙摸到桌边才停下。', id).length, 0);
  assert.equal(rule('他推门。屋里没开灯。他摸到桌边。', id, { shortSentenceRunCount: 4 }).length, 0);
});

test('narration with almost no connectives suggests outline-like prose', () => {
  const id = 'discourse.low-connective-density';
  const outline = '他推门进屋。屋里没开灯。他摸到桌边拿起药盒。他走到窗前。他看见雨。他关窗坐下。'.repeat(24);
  const result = rule(outline, id);
  assert.equal(result.length, 1);
  assert.ok(result[0].characters >= 600);
  assert.equal(rule(outline.slice(0, 200), id).length, 0);
  const rich = '因为雨太大，所以他关了窗，于是屋里安静下来。结果他反倒睡不着。'.repeat(24);
  assert.equal(rule(rich, id).length, 0);
});

test('negative-then-positive comparison is narration evidence and dialogue is exempt', () => {
  const id = 'syntax.not-is-comparison';
  assert.equal(rule('他不是不肯还钥匙，而是忘在家里了。', id).length, 1);
  assert.equal(rule('「不是不肯，而是忘了。」', id).length, 0);
  assert.equal(rule('他把钥匙忘在家里了。', id).length, 0);
  assert.equal(rule('他没有推门，只是站在门口。', id).length, 0);
  assert.equal(rule('是钥匙忘在家里，不是她不肯还。', id).length, 1);
});

test('negation parade counts repeated 没有 inside one sentence only', () => {
  const id = 'syntax.negation-parade';
  const result = rule('没有月亮，没有灯，没有声音。', id);
  assert.equal(result.length, 1);
  assert.equal(result[0].hits, 3);
  assert.equal(rule('没有月亮，但灯还亮着。', id).length, 0);
  assert.equal(rule('「没有月亮，没有灯，没有声音。」', id).length, 0);
  assert.equal(rule('没有月亮，没有灯，没有声音。', id, { negationParadeCount: 4 }).length, 0);
});

test('trailer ending is only searched inside the closing window', () => {
  const id = 'discourse.trailer-ending';
  const result = rule('他关上门，楼道里只剩脚步声。没人知道明天会发生什么。', id);
  assert.equal(result.length, 1);
  assert.equal(rule('他关上门，楼道里只剩脚步声。', id).length, 0);
  assert.equal(rule('没人知道他来过。后面还有很多事。' + '甲'.repeat(260), id).length, 0);
});

test('stacked short action clauses read like a camera log', () => {
  const id = 'syntax.action-list';
  const result = rule('他推门，转身，抬手，按灯。', id);
  assert.equal(result.length, 1);
  assert.equal(result[0].hits, 4);
  assert.equal(rule('他推开门，屋里一片安静，他站在门口看着桌上的灯。', id).length, 0);
  assert.equal(rule('他推门，转身，抬手，按灯。', id, { actionListSegments: 5 }).length, 0);
});

test('narration em dashes are counted per paragraph, dialogue dashes are ignored', () => {
  const id = 'surface.em-dash';
  const result = rule('他停了一下——那声音又来了——这次更近。', id);
  assert.equal(result.length, 1);
  assert.equal(result[0].hits, 2);
  assert.equal(rule('「你别——」他没说完。', id).length, 0);
  assert.equal(rule('他停了一下——那声音又来了。', id).length, 0);
});

test('overlong paragraphs suggest breaking by shot', () => {
  const id = 'discourse.long-paragraph';
  const long = '甲'.repeat(300) + '。';
  const result = rule(long, id);
  assert.equal(result.length, 1);
  assert.equal(result[0].characters, 301);
  assert.equal(rule('甲'.repeat(100) + '。', id).length, 0);
});

test('conclusion colon candidate locates narration colons and skips quoted dialogue', () => {
  const id = 'surface.conclusion-colon';
  assert.equal(rule('这组数字传递出一个残酷的现实：所有人都在隐瞒真相。', id).length, 1);
  assert.equal(rule('名单如下：甲、乙、丙。', id).length, 1);
  assert.equal(rule('「张三：你终于来了。」李四没有接话。', id).length, 0);
  assert.equal(rule('注意：', id).length, 0);
});

test('isomorphic triple candidate flags same-head or all-question runs, defers to existing opener signals', () => {
  const id = 'syntax.isomorphic-triple';
  assert.equal(rule('他推开门。他走进屋里。他放下背包。', id).length, 1);
  assert.equal(rule('叫什么名字？承载什么功能？嵌入哪个生态？', id).length, 1);
  assert.equal(rule('不可否认，这是第一。不可否认，这是第二。不可否认，这是第三。', id).length, 0);
  assert.equal(rule('他推开门。他走进了那间洒满月光、摆着旧家具的大屋子。他放下背包。', id).length, 0);
  assert.equal(rule('他推开门。他走进屋里。', id).length, 0);
});
