# 动作词汇

`studio.json` 的结构：

```json
{
  "title": "短名",
  "style": "ali",
  "aspect": "landscape",
  "words": "words.json",
  "footageEnd": 95.5,
  "bgmVolume": 0.3,
  "footage": { "pop": "...", "matte": "...", "full": "...", "voice": "...", "bgm": "...", "endStill": "...", "endHead": "..." },
  "chapters": [{ "label": "痛点", "from": "hook" }],
  "captions": ["说实话", ["素材", "数彩"], [null, "这段不出字幕的原文"], "*第几层*"],
  "scenes": [{ "id": "hook", "layout": "S", "start": 0, "end": 5.2, "beats": [] }]
}
```

- **章节条**（可选）：`chapters` 写每一章从哪一场开始，顶部一直显示，进度按全片时间走。长片和分段清楚的片子用，一般 4–9 章。
- **场景**首尾相接。`layout`：`S` 画板（默认）、`A` 全屏真人（`punch` 写推近的词）、`F` 无真人、`W` 全屏（录屏、新闻、整屏卡片，之间硬切；横屏带角落小窗，`"person": false` 不要小窗）。
- **人身后的字**：场景写 `"matte": "assets/footage/matte-26.3.webm"`，由 `scripts/matte.py` 生成，只用在 `A` 版式。
- **字幕**整条片子写一份，必须按顺序覆盖全部台词。`*词*` 标墨绿。
- **时间**：字符串是这一场之后的台词，`"有人#2"` 第二次出现，`"款+0.14"` 带偏移；数字是场景内秒数。
- **通用字段**：`id`、`at`、`exit`（退场）、`exitY`（退场位移，默认 -110，被划走用 -720）。
- 横屏和竖屏用同一套坐标：画面区都是 1080×960，横屏时放大 1.25 倍摆到左边或居中。标题占 y 74–160，字幕在 y 806 起，内容放 y 190–790。

## 对比和数字

| 动作 | 什么时候用 | 字段 |
|---|---|---|
| `evidence` | 一个真实数字，带图 | `x`、`img`、`imgPos`、`value`、`scaleMax`（比例条满格的值）、`at`、`countAt`、`land` |
| `verdict` | 两者分出胜负 | `loser`、`winner`、`at`。放在两个 `evidence` 之后 |
| `note` | 把差距说成一句话 | `text`、`at`、`top` |
| `tally` | 比例要让人数得出来，如一百家里只有五家 | `total`（默认 100）、`hit`（留下几个）、`value`、`unit`、`label`、`at`、`fade`（开始熄灭）、`land` |

## 框架和要点

| 动作 | 什么时候用 | 字段 |
|---|---|---|
| `ladder` | 第一次亮出几步或几层 | `items`、`at`（空位出现）、`drops`（每格落下）、`climb`、`lock` |
| `levelIntro` | 讲到其中一层 | `items`、`level`、`hold`（默认 1.25）。开场占 1.7 秒，文档卡 `at` 用 1.6 |
| `climax` | 全片只用一次，收束 | `items`、`at`、`lit`、`burst`、`dive` |
| `yield` | 讲过的退后但不撤 | `targets`（id 列表）、`at`、`dim`、`shrink` |

## 文字和举例

`lower`：口播页下方的白卡，逐字浮上来。`text`、`at`、`to`，放在 `A` 版式里。

`headline`：`text`、`accent`（要标墨绿的字）、`at`、`top`。最多 12 字。

`doc` 跟着口播打字的卡：`head`、`at`、`checkAt`（打勾）、`wide`（左边没有小梯子时写 true，卡片铺满宽度）、`items`。卡内写 `*词*` 标墨绿，`items` 可混用：

| type | 字段 | 用途 |
|---|---|---|
| `text` | `text`、`from`、`to`、`strike: { phrase, at }` | 跟读打字；划掉一个短语并让卡片抖动 |
| `text` | `static`、`dim` | 灰色铺垫，不打字 |
| `img` | `src`、`at`、`height` | 配真实截图 |
| `choice` | `options: [{ label, at }]` | 把问题抛给观众 |
| `feature` | `cover`、`coverAt`、`quote`、`from`、`to`、`sign` | 封面加一句判断 |
| `icons` | `icons: [{ svg, at }]` | 几个并列概念依次弹出 |
| `pull` | `go`、`yank`、`out` | 先往一个方向带，再拽回来 |

字号 48，卡宽约 13 字一行，内容高度不超过 590。

## 过程和画面

| 动作 | 什么时候用 | 字段 |
|---|---|---|
| `curve` | 情绪、张力、走势 | `path`（x 从 50 到 650 单调）、`route: [{ x, at, mark, tag, tagAt, land, dark }]` |
| `screen` | 录屏或产品界面，要讲某一处 | `video` 或 `src`、`mediaStart`、`tab`、`source`、`at`、`exit`、`top`、`fit`、`matte`（长条截图写 `contain` 和底色）、`focus: [{ at, x, y, zoom, dur, land }]`（百分比坐标）、`marks`、`labels: [{ at, x, y, text, dark }]` |
| `sheet` | 一条条、一张张的手工活，要演出来 | `head`、`headTo`（标题打完）、`at`、`exit`、`note`（虚构数据写「示意」）、`rows: [{ cells }]` 或 `cards: [{ title, value }]`、`fill: { from, to }`、`walks`、`flags` |
| `figure` | 真实截图或照片，默认完整显示 | `src`、`fit`（要铺满写 `cover`）、`pos`、`source`、`at` |
| `cta` | 导流 | `action`、`keyword`、`reward`、`at`、`kwAt`、`subAt` |

`marks` 框住录屏的一行或一列，框外压暗，用在要讲具体内容的地方：`[{ at, to, x, y, w, h, text, dim }]`。坐标是占画框的百分比，先用 Read 打开截图量好；画框按 16:9，非 16:9 的素材用 `fit: "contain"` 再换算。`text` 自动贴在框的上方或下方，不用写位置。整行要看全时 `zoom` 不要超过 1.3。视频画面会滚动，`marks` 只用在截图或静止的片段上。

`sheet` 的 `walks: [{ from, to, tick, reveal, reverse }]` 让高亮逐项走过：`tick` 打勾，`reveal` 走到才显示卡片的 `value`，`reverse` 往回走。`flags: [{ item, at, text }]` 把第几项标出来，同一项后面的会换掉前面的。金额和单据是虚构的就一定写 `note`。

## 风格库迁来的动作

尺寸都按画板区设计，`W` 版式自动放大。除 `behind`、`pills`、`name`、`numcard`、`logos` 有固定位置外，都在画面中央。

| 动作 | 什么时候用 | 字段 |
|---|---|---|
| `news` | 新闻画面快切，上面的字不动。平均 2–3 秒一个 | `clips: [{ video 或 src, at, source, dim, mediaStart, pos, fit, bg, still }]`（`still` 不推近，要和抠像对齐时写），放在 `W` 版式，其他动作写在它后面才在上层 |
| `silver` | 章节开头、关键数字 | `text`、`kicker`、`en`、`at`、`dim`（压暗底下的画面） |
| `big` | 一句结论 | `text`（`*词*` 标重点）或 `sides: [左, 右]`、`kicker`、`size`、`gap`、`at`、`dim`、`onFace` |
| `brush` | 对立的两个词、结尾问句 | `text` 或 `sides`、`at`、`dim` |
| `highlight` | 问句里的关键词，荧光笔刷出来 | `text`、`hlAt`、`at`、`dim` |
| `shrink` | 基本归零 | `label`、`value`、`pct`、`at`、`land` |
| `pie` | 大比例。很小的比例用 `tally` | `value`、`label`、`digits`、`dur`、`at` |
| `stat` | 一个巨大的数字 | `value`、`unit`（在右下角）、`prefix`、`digits`、`key`、`note`、`bare`、`size`、`at`、`countAt`、`land` |
| `chart` | 股价和走势，真实数据 | `csv`（第一列日期、最后一列数值）或 `points`；`labels: [{ date 或 i, text, dy, at }]`、`zoom: { at, dur, scale }`（往线头推近）、`line: { value, text }`、`segments: [{ at, dur, upto 或 date }]`、`title`、`min`、`max`、`at`。不实时显示数值 |
| `money` | 钱从一处流到另一处 | `a`、`b`（百分比坐标，没有 `b` 就是一张大钞）、`count`、`stagger`、`dur`、`sign`、`at` |
| `metro` | 每章开头，走到第几站 | `stations`、`cur`（等于站数时全线点亮）、`barrier: [i, j]`、`kicker`、`title`、`sign`、`at` |
| `bubbles` | 几步流程，讲到哪个亮哪个 | `items: [{ text, at, tone, sub, via, tag: [说明, 数字] }]`、`allAt`、`size`（四个以上写 210）。`tone` 上色：`slate`、`green`、`gold`、`red`、`blue`；`sub` 是气泡内小字，`via` 是箭头上的字 |
| `path` | 流程、路线图，一期里反复用当进度 | `nodes: [{ label, at, showAt }]`、`at` |
| `pills` | 口播页上的列举 | `items: [{ text, kind: "ok"/"no", at }]`、`left`、`top` |
| `behind` | 开场关键词放在人身后 | `items: [{ text, x, y, size, at }]`、`size`、`at`。放头两侧，中间那个字一定被挡住 |
| `term` | 名词字卡，整屏 | `text`（放原词）、`zh`、`at` |
| `bars` | 几个数字比大小 | `items: [{ label, value, text, hit, at }]`、`max` |
| `tower` | 差距悬殊，要一眼看出来，按真实比例画高柱 | `items: [{ label, value, text, at }]`、`states: [{ text, kind: "no"/"ok", at }]`（右边逐条列；`ok` 出现时涨幅变色，前面的 `no` 划掉） |
| `word` | 画板背后的水印大字，写在其他动作前面 | `text`、`at` |
| `percolate` | 贯穿全片的网格示意 | `cols`、`rows`、`seed`、`gas`、`showP`、`start`、`phases: [{ at, to, p }]`（`p` 可写 `"critical"`、`"critical-0.01"`）、`swellAt`、`at` |
| `numcard` | 清单每项开头 | `n`、`name`、`top`（压在衣服上，看脸的位置调）、`at` |
| `logos` | 一排 logo 弹出 | `items: [{ src, label, at }]`、`top` |
| `thread` | 收尾把几项串起来 | `items: [{ src, word, at }]`、`at` |
| `quote` | 媒体报道 | `bg`、`media`、`text`（`*词*` 反白）、`note`、`at` |
| `tweet` | 推文截图加译文 | `src`、`text`、`textAt`、`at` |
| `name` | 新人物出场 | `en`、`zh`、`nick`、`img`、`left`、`top`、`at` |
| `ruler` | 历史段落 | `years: [起, 止]`、`step`、`stops: [{ year, at }]`、`at` |
| `track` | 规则的时间限制 | `label`、`pct`、`pins: [{ pct, text, at }]`、`fill`、`dur`、`fills: [{ at, pct, dur }]`（分段走）、`note: { text, at }`、`at` |

`screen` 还有两种写法：`"paper": true` 是木桌上的原文纸面，配 `marks` 里的 `"pen": true` 做荧光高亮，`pos` 决定显示页面的哪一段（`"50% 58%"`）；`"above": "obsidian.md"` 是清单片截图卡上方的出处行。

## 自动带的

- **呼吸层**：手持晃动、推近、部件漂浮、落地余震。`"life": false` 可关，`lifeOptions` 调幅度。字幕不参与。
- **音效**：落地、裁决、划掉、打勾、选项等自带，改时间会跟着走。声明文件不用写。

## 示例

`examples/story-ladder-full.json` 是一条完整的 95.8 秒片子，写新片前先读一遍。横屏新闻科普看 `examples/spacex-xiaolin.json`（3 分 12 秒）。
