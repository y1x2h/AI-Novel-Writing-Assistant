const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildDocumentSourceRangeLabel,
  sliceContentByChapterRange,
} = require("../dist/services/knowledge/DocumentSourceRange.js");

function buildChapter(chapterIndex, title, startOffset, endOffset) {
  return {
    id: `chapter-${chapterIndex}`,
    documentVersionId: "version-1",
    chapterIndex,
    title,
    startOffset,
    endOffset,
    charCount: endOffset - startOffset,
    summary: null,
    splitter: "rule",
    createdAt: "2026-11-17T00:00:00.000Z",
    updatedAt: "2026-11-17T00:00:00.000Z",
  };
}

const CONTENT = [
  "第一章 开端\n开篇正文。\n",
  "第二章 转折\n中段正文。\n",
  "第三章 收束\n结尾正文。\n",
].join("");
const FIRST_END = CONTENT.indexOf("第二章");
const SECOND_END = CONTENT.indexOf("第三章");
const CHAPTERS = [
  buildChapter(0, "第一章 开端", 0, FIRST_END),
  buildChapter(1, "第二章 转折", FIRST_END, SECOND_END),
  buildChapter(2, "第三章 收束", SECOND_END, CONTENT.length),
];

test("按章节范围截取只返回所选区间正文", () => {
  const resolved = sliceContentByChapterRange(CHAPTERS, CONTENT, {
    startChapterIndex: 1,
    endChapterIndex: 2,
  });

  assert.equal(resolved.startChapterIndex, 1);
  assert.equal(resolved.endChapterIndex, 2);
  assert.equal(resolved.startOffset, FIRST_END);
  assert.equal(resolved.endOffset, CONTENT.length);
  assert.equal(resolved.charCount, CONTENT.length - FIRST_END);
  assert.equal(resolved.text, CONTENT.slice(FIRST_END));
  assert.match(resolved.label, /第 2-3 章/u);
});

test("单章范围使用单章标签", () => {
  const resolved = sliceContentByChapterRange(CHAPTERS, CONTENT, {
    startChapterIndex: 0,
    endChapterIndex: 0,
  });

  assert.equal(resolved.text, CONTENT.slice(0, FIRST_END));
  assert.equal(resolved.label, "第 1 章：第一章 开端");
});

test("范围标签在起止章节相同时退化为单章", () => {
  assert.equal(
    buildDocumentSourceRangeLabel({
      startChapterIndex: 3,
      endChapterIndex: 3,
      startTitle: "第四章",
      endTitle: "第四章",
    }),
    "第 4 章：第四章",
  );
});

test("CRLF 原文在截取前统一为 LF", () => {
  const content = "第一章\r\n正文一\r\n第二章\r\n正文二\r\n";
  const normalized = content.replace(/\r\n?/g, "\n");
  const splitIndex = normalized.indexOf("第二章");
  const chapters = [
    buildChapter(0, "第一章", 0, splitIndex),
    buildChapter(1, "第二章", splitIndex, normalized.length),
  ];

  const resolved = sliceContentByChapterRange(chapters, content, {
    startChapterIndex: 1,
    endChapterIndex: 1,
  });

  assert.equal(resolved.text, normalized.slice(splitIndex));
  assert.equal(resolved.text.includes("\r"), false);
});

test("越界或方向相反的范围会报错", () => {
  assert.throws(
    () => sliceContentByChapterRange(CHAPTERS, CONTENT, { startChapterIndex: 2, endChapterIndex: 1 }),
    /所选章节范围在该文档版本中不可用/u,
  );
  assert.throws(
    () => sliceContentByChapterRange(CHAPTERS, CONTENT, { startChapterIndex: 9, endChapterIndex: 9 }),
    /所选章节范围在该文档版本中不可用/u,
  );
});

test("章节不足时提示可按全文继续", () => {
  assert.throws(
    () => sliceContentByChapterRange([CHAPTERS[0]], CONTENT, { startChapterIndex: 0, endChapterIndex: 0 }),
    /当前文档章节不足/u,
  );
});
