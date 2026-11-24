# ray-studio

给一条录好的口播或一个主题，做出带动效的视频，风格和横竖屏都可选。没有编辑台：Agent 改一份声明文件，自己看关键帧，只重渲改过的场景。

## 安装

```bash
git clone https://github.com/imraywang/ray-studio.git
ln -s "$PWD/ray-studio" ~/.claude/skills/ray-studio
```

之后对 Agent 说「用 ray-studio 把这条口播做成动效片」即可，流程见 [SKILL.md](SKILL.md)，全部动作见 [动作词汇](references/vocabulary.md)。

装完先自检，缺什么、怎么装它会列出来：

```bash
node bin/rs.mjs doctor
```

要用到的：Node、ffmpeg、[HyperFrames](https://github.com/heygen-com/hyperframes)（没装全局命令时自动用 npx 取）、`mlx_whisper`（转写逐字时间，需要 Apple 芯片的 Mac）、numpy。两个 Python 包装进 `~/.local/share/ray-studio/py-env`，自检会给出命令。

## 先试跑一条

不用任何账号，用系统自带的朗读声音跑通全程，约 3 分钟（第一次转写要下载约 1.6 GB 的模型）：

```bash
P=$(node bin/rs.mjs new starter)                          # 建工程，打印目录
say -v Tingting -o /tmp/starter.aiff -f examples/starter/script.txt
node bin/rs.mjs words "$P" /tmp/starter.aiff              # 做出 voice.wav 和逐字时间
cp examples/starter/studio.json "$P/"
node bin/rs.mjs check "$P" && node bin/rs.mjs final "$P"  # 检查，出片
node bin/rs.mjs qa "$P"                                    # 成片检查
node bin/rs.mjs review "$P"                                # 打开审片页
```

成片在工程目录的 `renders/` 里。换成自己的内容时，场景的起止秒数要按自己那条声音的 `words.json` 来写。

## 配音（可选）

声音有三种来路：录好的口播视频用 `rs prep`；已有一条录音（自己录的、别的工具配的）用 `rs words`，都不花钱。只有稿子时，`rs voice` 用 MiniMax 的音色整篇读稿，按字数收费，要准备两样：

- 环境变量 `MINIMAX_API_KEY`。国内平台的 key 另设 `MINIMAX_API_HOST=https://api.minimax.cn`。
- 音色表 `~/.config/ray-studio/voices.json`，名字自己起，用 `--voice <名字>` 选：

```json
{
  "my-voice": { "provider": "minimax", "voice_id": "你在 MiniMax 的音色编号", "model": "speech-2.8-hd" }
}
```

## 用法

```bash
node bin/rs.mjs doctor                       # 自检依赖
node bin/rs.mjs styles                       # 列出可选风格
node bin/rs.mjs new    <英文短名>            # 建工程
node bin/rs.mjs prep   <工程目录> <口播原片> --face-x <像素> --aspect portrait|landscape
node bin/rs.mjs words  <工程目录> <录音>     # 已有录音：做出 voice.wav 和逐字时间
node bin/rs.mjs voice  <工程目录> <稿子.txt> --voice <音色名>
node bin/rs.mjs check  <工程目录>            # 检查台词和时间，再逐场跑 hyperframes check；--fast 只查声明文件
node bin/rs.mjs frames <工程目录> [场景]     # 抽关键帧拼成一张图
node bin/rs.mjs render <工程目录> [场景...]  # 只重渲改过的场景，再拼起来试看
node bin/rs.mjs final  <工程目录>            # 画面按帧拼接，整条音频单独混，统一响度
node bin/rs.mjs qa     <工程目录>            # 量响度、峰值、黑场、空画面，导出切点图
node bin/rs.mjs review <工程目录> [--tailnet] # 审片页：在画面上写批注，发送后交给 Agent
```

工程目录放 `studio.json`、逐字时间轴 `words.json` 和 `assets/`，默认建在 `~/Movies/ray-studio/`。示例见 `examples/`：示例只带声明文件，不带视频和图片素材，用来看写法。

## 声明文件

一个场景是一组动作。时间写台词，不写秒：`"没人看"`、`"有人#2"`（第二次出现）、`"款+0.14"`。改稿或换录音后，动作跟着台词走。

## 动作词汇

| 动作 | 表达什么 | 怎么动 |
|---|---|---|
| `headline` | 立题 | 逐字虚焦落下 |
| `evidence` | 数字落定 | 慢起、加速、长减速，越快越糊，到点顿一下；比例条按真实比例长 |
| `verdict` | 胜负裁决 | 落败方抖动、褪色、后退、数字被划掉；胜出方弹大、描边、打勾 |
| `note` | 把差距说成一句话 | 弹簧弹出药丸 |
| `ladder` | 钉住要点、讲过让位 | 先摆空位；逐格按重力落下、压扁、摆动、钉子带涟漪；爬到哪亮到哪，走过的退后 |
| `yield` | 讲过让位 | 目标变暗缩小，不退场 |
| `levelIntro` | 进入框架的某一层 | 这一层亮起、扫光，镜头扎进去，左边留小梯子当进度条 |
| `doc` | 跟着口播打字 | 字逐个浮上来；可配图、打勾、划掉短语、弹出选项和图标、拽回箭头 |
| `curve` | 情绪或张力起伏 | 亮笔尖跟着台词走，到节点时弹点、贴标签 |
| `climax` | 全片一次的高潮 | 各格依次点亮，背后放射光，再扎进去 |
| `tally` | 比例要数得出来 | 一百个点先全亮，再按比例熄灭，留下的点变墨绿 |
| `screen` | 录屏或产品界面 | 镜头推到一处，`marks` 框住具体一行，框外压暗，说明贴在框旁 |
| `sheet` | 一条条、一张张的手工活 | 逐项填入，高亮走过，打勾或翻开，出错的一项被标出来 |
| `figure` | 真实截图或照片 | 虚焦进场，整段缓慢推近，带来源 |
| `cta` | 导流 | 墨绿卡说动作，巨号关键词砸下来，小字说换来什么 |

声明文件要写 `"style"` 和 `"aspect"`（`portrait` 或 `landscape`）。风格有 `guandian`、`ali`、`xiaolin`、`fenping`、`qingdan`，在 `styles/*.json`，定义颜色、字体、动作性格、人像放法和混音；动作只有一份。试看别的风格不用改文件：`rs frames <工程> <场景> --style xiaolin`。

长片可以写 `chapters`，顶部显示章节和进度。

还有新闻快切、银色标题、大字、书法字、荧光笔、饼图、走势线、纸钞、地铁图、玻璃气泡、节点路径、人身后大字、名词卡、渗流网格、编号卡等，共 40 多个动作，全部字段见[动作词汇](references/vocabulary.md)。

版式：`S` 画板（竖屏时上画面下真人，横屏时左画面右人像）、`A` 全屏真人（`punch` 写在哪个词上推近）、`F` 无真人、`W` 全屏（录屏、新闻、整屏卡片）。

每个场景默认带呼吸层：手持晃动、缓慢推近、部件各自漂浮、落地余震和跟随。字幕不参与，要稳。落地和裁决的音效由动作自动带出。

所有画面都是时间 t 的纯函数：不读时钟，不用随机数，可以跳到任意一帧。

## 审片

`rs review` 打开一个本机网页：上面播成片，下面是按场景分好的时间条。暂停在任意一帧写批注，点「发送批注」；没意见就点「可以了」。批注连同时间、场景、那时在说的话和那一帧的截图，写进 `renders/review/`，Agent 照着逐条改，只重渲改到的场景。成片更新后页面会自己刷新。

想在手机上看：电脑和手机都连着 [Tailscale](https://tailscale.com) 时加 `--tailnet`，会多打印一个手机能开的地址。

## 许可

[CC BY-NC 4.0](LICENSE)。审片页和成片检查改自 Peter Yang 的 video-short（MIT），见 [NOTICE](scripts/NOTICE-video-short.md)。
