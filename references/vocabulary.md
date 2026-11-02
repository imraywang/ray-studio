# 动作词汇

`studio.json` 的结构：

```json
{
  "title": "短名",
  "words": "words.json",
  "footageEnd": 95.5,
  "bgmVolume": 0.3,
  "footage": { "pop": "...", "matte": "...", "full": "...", "voice": "...", "bgm": "...", "endStill": "...", "endHead": "..." },
  "captions": ["说实话", ["素材", "数彩"], [null, "这段不出字幕的原文"], "*第几层*"],
  "scenes": [{ "id": "hook", "layout": "S", "start": 0, "end": 5.2, "beats": [] }]
}
```

- **场景**首尾相接。`layout`：`S` 分屏（默认）、`A` 全屏真人（`punch` 写推近的词）、`F` 无真人。
- **字幕**整条片子写一份，必须按顺序覆盖全部台词。`*词*` 标墨绿。
- **时间**：字符串是这一场之后的台词，`"有人#2"` 第二次出现，`"款+0.14"` 带偏移；数字是场景内秒数。
- **通用字段**：`id`、`at`、`exit`（退场）、`exitY`（退场位移，默认 -110，被划走用 -720）。
- 画面区是 1080×960。标题占 y 74–160，字幕在 y 806 起，内容放 y 190–790。

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
| `figure` | 真实截图或照片，默认完整显示 | `src`、`fit`（要铺满写 `cover`）、`pos`、`source`、`at` |
| `cta` | 导流 | `action`、`keyword`、`reward`、`at`、`kwAt`、`subAt` |

## 自动带的

- **呼吸层**：手持晃动、推近、部件漂浮、落地余震。`"life": false` 可关，`lifeOptions` 调幅度。字幕不参与。
- **音效**：落地、裁决、划掉、打勾、选项等自带，改时间会跟着走。声明文件不用写。

## 示例

`examples/story-ladder-full.json` 是一条完整的 95.8 秒片子，写新片前先读一遍。
