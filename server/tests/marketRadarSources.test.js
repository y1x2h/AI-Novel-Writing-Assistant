const test = require("node:test");
const assert = require("node:assert/strict");

const { parseFanqieBookDetail, parseFanqieRankList } = require("../dist/modules/marketRadar/infrastructure/platforms/fanqieRanking.js");
const { parseQidianBookInfo, parseQidianRankPage } = require("../dist/modules/marketRadar/infrastructure/platforms/qidianRanking.js");
const { parseJinjiangRankPage } = require("../dist/modules/marketRadar/infrastructure/platforms/jinjiangRanking.js");
const { buildPlatformAggregationText } = require("../dist/modules/marketRadar/application/marketRadarAggregation.js");

function source(platform, listKey, listLabel, sourceUrl) {
  return { platform, listKey, listLabel, sourceUrl, platformLabel: platform, channel: "male" };
}

test("reads Fanqie ranking entries from the public page state", () => {
  const state = {
    rank: {
      book_list: [{
        bookId: "7231424472606051384",
        currentPos: 1,
        categoryV2: "",
        readCount: 242041,
        wordNumber: 1163967,
        creationStatus: 0,
      }],
    },
  };
  const html = `<script>window.__INITIAL_STATE__=${JSON.stringify(state)};</script>`;
  const entries = parseFanqieRankList(html);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].bookId, "7231424472606051384");
  assert.equal(entries[0].rank, 1);
  assert.equal(entries[0].readCount, 242041);
});

test("decodes Fanqie detail metrics and readable title", () => {
  const html = `<h1>惹金枝</h1><a class="author-name-text">空留</a>
    <div class="page-abstract-content"><p>【古风+宅斗】她重生后重掌家业。</p></div>
    <script>{"readCount":242041,"wordNumber":1163967,"creationStatus":0,"categoryV2":"[{\\"Name\\":\\"古风世情\\"}]"}</script>`;
  const detail = parseFanqieBookDetail(html);
  assert.equal(detail.title, "惹金枝");
  assert.equal(detail.author, "空留");
  assert.equal(detail.readCount, 242041);
  assert.equal(detail.wordNumber, 1163967);
  assert.equal(detail.creationStatus, 0);
});

test("reads Qidian rankings from the public SSR payload", () => {
  const payload = {
    pageContext: {
      pageProps: {
        pageData: {
          records: [{
            bid: 1050460263,
            bName: "神宠供应商",
            bAuth: "轻泉流响",
            cat: "玄幻",
            subCat: "东方玄幻",
            cnt: "81.16万字",
            desc: "御兽经营故事。",
            rankNum: 1,
          }],
        },
      },
    },
  };
  const html = `<script id="vite-plugin-ssr_pageContext" type="application/json">${JSON.stringify(payload)}</script>`;
  const records = parseQidianRankPage(html);
  assert.equal(records.length, 1);
  assert.equal(records[0].title, "神宠供应商");
  assert.equal(records[0].author, "轻泉流响");
  assert.equal(records[0].category, "玄幻·东方玄幻");
  assert.equal(records[0].wordCount, 811600);
  assert.equal(records[0].sourceUrl, "https://m.qidian.com/book/1050460263/");
});

test("reads Qidian book heat metric from the public SSR payload", () => {
  const payload = {
    pageContext: {
      pageProps: {
        pageData: {
          bookInfo: {
            recomAll: 356000,
            collect: 120000,
            wordsCnt: 811600,
            actionStatus: "连载中",
            chanName: "玄幻",
            subCateName: "东方玄幻",
            bookLabels: [{ tag: "御兽" }, { tag: "经营" }],
          },
        },
      },
    },
  };
  const html = `<script id="vite-plugin-ssr_pageContext" type="application/json">${JSON.stringify(payload)}</script>`;
  const info = parseQidianBookInfo(html);
  assert.equal(info.recomAll, 356000);
  assert.equal(info.serialStatus, "连载中");
  assert.deepEqual(info.tags, ["御兽", "经营"]);
  assert.equal(info.category, "玄幻·东方玄幻");
});

test("splits Jinjiang rankings by public channel", () => {
  const html = `<div><span class="listtitle">【言情排行】</span><ul>
    <li><a href="/book2/6836927" class="track">在古代开医馆</a></li>
    <li><a href="/book2/6836928">重生后我成了首富</a></li>
    </ul></div>
    <div><span class="listtitle">【纯爱排行】</span><ul>
    <li><a href="/book2/7000001">山海之间</a></li>
    </ul></div>`;
  const items = parseJinjiangRankPage(html, source("jinjiang", "monthly", "月度榜", "https://m.jjwxc.net/rank/naturalmore/5"));
  assert.equal(items.length, 3);
  assert.equal(items[0].category, "言情");
  assert.equal(items[2].category, "纯爱");
  assert.equal(items[0].sourceUrl, "https://m.jjwxc.net/book2/6836927");
});

test("builds deterministic aggregation before AI analysis", () => {
  const text = buildPlatformAggregationText("起点中文网", [
    {
      listKey: "new_book",
      listLabel: "新书榜",
      items: [
        { rank: 1, title: "甲", author: "A", category: "玄幻", tagsJson: "[\"御兽\"]", heatMetric: "总推荐", heatValue: 20000, wordCount: 200000 },
        { rank: 2, title: "乙", author: "B", category: "玄幻", tagsJson: "[\"御兽\",\"经营\"]", heatMetric: "总推荐", heatValue: 40000, wordCount: 300000 },
      ],
    },
    {
      listKey: "hotsales",
      listLabel: "畅销榜",
      items: [
        { rank: 1, title: "丙", author: "C", category: "仙侠", tagsJson: "[\"经营\"]", heatMetric: "总推荐", heatValue: 90000, wordCount: 1500000 },
      ],
    },
  ]);
  assert.match(text, /去重 3 本/);
  assert.match(text, /新书样本：2 本/);
  assert.match(text, /成熟榜样本：1 本/);
  assert.match(text, /玄幻 2 本/);
  assert.match(text, /高频标签：御兽（2）/);
  assert.match(text, /不能与其他平台数值直接对比/);
});
