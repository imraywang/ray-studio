#!/usr/bin/env node
// rs：ray-studio 命令行。声明文件 studio.json → 生成 HyperFrames 工程 → 检查、看帧、按场景渲染。
//   rs new    <英文短名> [--dir 父目录]  建工程：字体、音效和声明文件骨架
//   rs styles                           列出可选风格
//   rs check  <工程> [场景...] [--fast]  官方检查逐场跑，--fast 只查声明文件。检查声明文件（台词能否对上、时间是否越界）
//   rs frames <工程> [场景...]          抽关键帧拼成一张图，给 Agent 自己看
//   rs render <工程> [场景...] [-q looks|delivery]  只重渲改过的场景，再拼起来试看
//   rs final  <工程> [-q delivery]      各场景画面按帧拼接，整条音频单独混，响度统一
//   rs qa     <工程>                    量成片：响度、峰值、黑场、空画面，导出切点图
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENGINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../engine");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE_JS = ["motion.js", "blocks.js", "extras.js"];
const ENGINE_CSS = ["motion.css", "extras.css"];
const onPath = (bin) => spawnSync("which", [bin], { encoding: "utf8" }).status === 0;
// HyperFrames：装了全局命令就用它，否则用 npx 临时取，新装的机器不用先全局安装
const [HF, HF_PRE] = process.env.RS_HYPERFRAMES ? [process.env.RS_HYPERFRAMES, []] : onPath("hyperframes") ? ["hyperframes", []] : ["npx", ["--yes", "hyperframes"]];
// Python：脚本要 numpy 和 mlx_whisper。有 ray-studio 自己的环境就用它，否则用系统的
const PY_ENV = path.join(process.env.HOME, ".local/share/ray-studio/py-env");
const PY = process.env.RS_PYTHON || (fs.existsSync(path.join(PY_ENV, "bin/python")) ? path.join(PY_ENV, "bin/python") : "python3");
const FPS = 30;
const LAYOUTS = { portrait: ["S", "A", "F", "W"], landscape: ["S", "A", "F", "W"] };
const SIZE = { portrait: [1080, 1920], landscape: [1920, 1080] };
const SFX_LEN = { click: 0.05, ding: 0.7, whoosh: 0.7, swell: 1.2 };

// --style、--aspect 只用来试看，不写回声明文件
const TRY = {};

function die(msg) {
  console.error(`rs: ${msg}`);
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 1 << 28, ...opts });
  if (r.status !== 0) die(`${cmd} ${args.slice(0, 3).join(" ")} 失败\n${(r.stderr || r.stdout || "").slice(-1500)}`);
  return r.stdout;
}

const snap = (t) => Math.round(t * FPS) / FPS;
const ms = (t) => Math.round(t * 1000) / 1000;

// ---------- 台词时间 ----------
const strip = (s) => s.replace(/[\s,，。.!！?？、:：;；"'“”*]/g, "");

function indexWords(words) {
  let text = "";
  const at = [];
  words.forEach((w, word) => {
    const clean = strip(w.text);
    [...clean].forEach((c, i) => {
      text += c;
      at.push({ word, start: w.start + ((w.end - w.start) * i) / clean.length, end: w.start + ((w.end - w.start) * (i + 1)) / clean.length });
    });
  });
  return { text, at };
}

// 短语默认从这一场开头往后找，所以 "#2" 是这一场里第二次出现
function timeOf(ref, idx, from, errors, where) {
  const m = /^(.+?)(?:#(\d+))?([+-]\d*\.?\d+)?$/.exec(String(ref));
  const phrase = strip(m[1]);
  let pos = from - 1;
  for (let i = 0; i < Number(m[2] || 1); i++) {
    pos = idx.text.indexOf(phrase, pos + 1);
    if (pos < 0) break;
  }
  if (pos < 0) {
    errors.push(`${where}：这一场之后的台词里找不到「${ref}」`);
    return 0;
  }
  return idx.at[pos].start + Number(m[3] || 0);
}

// 全片字幕只写一份，按顺序对到逐字时间轴，再分到各场。[显示, 听写原文] 纠错字；显示写 null 表示这段不出字幕
function alignCaptions(list, idx, errors, oneWord) {
  let cursor = 0;
  const out = [];
  list.forEach((c, i) => {
    const [show, raw] = Array.isArray(c) ? c : [c, c];
    const key = strip(raw);
    const pos = idx.text.indexOf(key, cursor);
    if (pos < 0 || pos > cursor + 2) {
      errors.push(`captions[${i}]：「${raw}」和台词对不上（应从「${idx.text.slice(cursor, cursor + 8)}」接着）`);
      return;
    }
    cursor = pos + key.length;
    if (show === null) return;
    // 一次一个词的风格：字幕按 whisper 的词切开。纠过错字的那条不切
    if (oneWord && strip(show) === key) {
      for (let i = pos; i < cursor; ) {
        let j = i;
        while (j < cursor && idx.at[j].word === idx.at[i].word) j++;
        out.push({ text: idx.text.slice(i, j), accent: show.includes("*"), start: idx.at[i].start, end: idx.at[j - 1].end });
        i = j;
      }
      return;
    }
    out.push({ text: show.replace(/\*/g, ""), accent: show.includes("*"), start: idx.at[pos].start, end: idx.at[cursor - 1].end });
  });
  return out;
}

const listStyles = () => fs.readdirSync(path.join(ROOT, "styles")).map((f) => f.replace(/\.json$/, "")).sort();

const TIME_KEYS = new Set(["at", "countAt", "land", "exit", "climb", "lock", "from", "to", "hold", "lit", "burst", "dive", "kwAt", "subAt", "coverAt", "checkAt", "tagAt", "go", "yank", "out", "fade", "headTo", "hlAt", "textAt", "allAt", "showAt", "fill"]);

// ---------- 解析声明文件：台词换成场景内秒数。数字本来就是场景内秒数 ----------
function load(dir) {
  const file = path.join(dir, "studio.json");
  if (!fs.existsSync(file)) die(`找不到 ${file}`);
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
  // 风格和画幅都要明确写，不留隐含默认值
  if (TRY.style) doc.style = TRY.style;
  if (TRY.aspect) doc.aspect = TRY.aspect;
  if (!SIZE[doc.aspect]) die(`studio.json 要写 "aspect"：portrait 或 landscape`);
  const styleFile = path.join(ROOT, "styles", `${doc.style}.json`);
  if (!doc.style || !fs.existsSync(styleFile)) die(`studio.json 要写 "style"，可选：${listStyles().join("、")}`);
  doc.styleSpec = JSON.parse(fs.readFileSync(styleFile, "utf8"));
  const idx = indexWords(JSON.parse(fs.readFileSync(path.join(dir, doc.words), "utf8")));
  const errors = [];
  const warnings = [];
  const caps = alignCaptions(doc.captions || [], idx, errors, doc.styleSpec.captionWords);
  // 章节条：写从哪一场开始，到下一章开始时结束
  const chapters = (doc.chapters || []).map((c, i, list) => {
    const head = doc.scenes.find((s) => s.id === c.from);
    if (!head) errors.push(`chapters[${i}]：找不到场景 ${c.from}`);
    const next = list[i + 1] && doc.scenes.find((s) => s.id === list[i + 1].from);
    return { label: c.label, start: snap(head?.start ?? 0), end: snap(next ? next.start : doc.scenes.at(-1).end) };
  });
  const scenes = doc.scenes.map((raw) => {
    const start = snap(raw.start);
    const end = snap(raw.end);
    const dur = end - start;
    const from = Math.max(0, idx.at.findIndex((a) => a.start >= start - 0.02));
    const rel = (ref, where) => {
      const t = typeof ref === "number" ? ref : timeOf(ref, idx, from, errors, where) - start;
      if (t < -0.01 || t > dur + 0.01) errors.push(`${where}：${ref} 落在场景外（${t.toFixed(2)}s，场景长 ${dur.toFixed(2)}s）`);
      return ms(t);
    };
    const walk = (v, where) => {
      if (Array.isArray(v)) return v.map((x, i) => (where.endsWith(".drops") ? rel(x, `${where}[${i}]`) : walk(x, `${where}[${i}]`)));
      if (v && typeof v === "object") {
        const o = {};
        for (const [k, x] of Object.entries(v)) o[k] = TIME_KEYS.has(k) && (typeof x === "string" || typeof x === "number") ? rel(x, `${where}.${k}`) : walk(x, `${where}.${k}`);
        return o;
      }
      return v;
    };
    if (!LAYOUTS[doc.aspect].includes(raw.layout || "S")) errors.push(`${raw.id}：${doc.aspect} 没有 ${raw.layout} 版式，可选 ${LAYOUTS[doc.aspect].join("、")}`);
    const beats = (raw.beats || []).map((b) => {
      const out = walk(b, `${raw.id}.${b.id}`);
      if (b.do === "screen" && b.video) {
        out.domId = `${raw.id}-${b.id}`;
        if (!fs.existsSync(path.join(dir, b.video))) errors.push(`${raw.id}.${b.id}：找不到素材 ${b.video}`);
        else {
          const len = Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path.join(dir, b.video)], { encoding: "utf8" }).stdout);
          out.clipLen = len - (b.mediaStart ?? 0);
          const need = (out.exit !== undefined ? out.exit : dur) - out.at;
          if (out.clipLen < need - 0.05) warnings.push(`${raw.id}.${b.id}：素材只有 ${len.toFixed(1)} 秒，要放 ${need.toFixed(1)} 秒，后面会定格`);
        }
      }
      if (b.do === "news") {
        out.clips.forEach((c, i) => {
          const next = out.clips[i + 1];
          c.end = next ? next.at : out.exit ?? dur;
          if (c.src && !fs.existsSync(path.join(dir, c.src))) errors.push(`${raw.id}.${b.id}：找不到素材 ${c.src}`);
          if (!c.video) return;
          c.domId = `${raw.id}-${b.id}-${i}`;
          if (!fs.existsSync(path.join(dir, c.video))) return errors.push(`${raw.id}.${b.id}：找不到素材 ${c.video}`);
          const len = Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path.join(dir, c.video)], { encoding: "utf8" }).stdout);
          c.clipLen = len - (c.mediaStart ?? 0);
          if (c.clipLen < c.end - c.at - 0.05) warnings.push(`${raw.id}.${b.id}[${i}]：素材只有 ${len.toFixed(1)} 秒，要放 ${(c.end - c.at).toFixed(1)} 秒，后面会定格`);
        });
      }
      // 走势线的数据从 CSV 读，最后一列是数值，第一列是日期。标签写日期
      if (b.do === "chart" && b.csv) {
        const rows = fs.readFileSync(path.join(dir, b.csv), "utf8").trim().split(/\r?\n/).map((l) => l.split(",")).filter((r) => !Number.isNaN(Number(r.at(-1))));
        out.points = rows.map((r) => Number(r.at(-1)));
        for (const l of out.labels || []) {
          if (l.date) l.i = rows.findIndex((r) => r[0] === l.date);
          if (l.i < 0) errors.push(`${raw.id}.${b.id}：CSV 里没有日期 ${l.date}`);
        }
        for (const seg of out.segments || []) if (seg.date) seg.upto = rows.findIndex((r) => r[0] === seg.date);
      }
      if (b.do === "screen" && b.src && !fs.existsSync(path.join(dir, b.src))) errors.push(`${raw.id}.${b.id}：找不到素材 ${b.src}`);
      if (b.do === "headline" && [...b.text].length > 12) warnings.push(`${raw.id}.${b.id}：标题 ${[...b.text].length} 字，竖屏 64 号最多 12 字`);
      if (out.land !== undefined && out.countAt !== undefined && out.land - out.countAt < 0.2) warnings.push(`${raw.id}.${b.id}：计数只有 ${(out.land - out.countAt).toFixed(2)} 秒，看不清`);
      if (out.exit !== undefined && out.at !== undefined && out.exit - out.at < 1) warnings.push(`${raw.id}.${b.id}：只停留 ${(out.exit - out.at).toFixed(2)} 秒`);
      return out;
    });
    // 话还没说完就切场的字幕，下一场接着显示
    const inScene = caps.filter((c) => c.start < end - 0.02 && (c.start >= start - 0.02 || c.end > start + 0.02));
    const captions = inScene.map((c, i) => ({
      text: c.text,
      accent: c.accent,
      start: ms(c.start - start),
      end: ms(Math.min(dur, i + 1 < inScene.length ? inScene[i + 1].start - start : c.end - start + 0.25)),
    }));
    const punch = raw.punch !== undefined ? rel(raw.punch, `${raw.id}.punch`) : undefined;
    if (raw.matte && !fs.existsSync(path.join(dir, raw.matte))) errors.push(`${raw.id}：找不到抠像 ${raw.matte}，先跑 scripts/matte.py`);
    return { id: raw.id, layout: raw.layout || "S", aspect: doc.aspect, motion: doc.styleSpec.motion, start, end, dur, life: raw.life, lifeOptions: raw.lifeOptions, beats, captions, punch, chapters, chapterMode: doc.styleSpec.chapters, matte: raw.matte, person: raw.person };
  });
  return { doc, scenes, errors, warnings };
}

// ---------- 生成 HyperFrames 工程 ----------
// 竖屏探头的图形层只占上半屏；人放下半屏的风格，字幕压在接缝上，图形层要铺满
const hostHeight = (scene, doc) => (scene.aspect === "portrait" && scene.layout === "S" && doc.styleSpec.person !== "half" ? 960 : SIZE[scene.aspect][1]);

function compositionHtml(scene, doc) {
  const host = `rs-${scene.id}`;
  const [W, H] = SIZE[scene.aspect];
  const h = hostHeight(scene, doc);
  const css = ENGINE_CSS.map((f) => fs.readFileSync(path.join(ENGINE, f), "utf8")).join("\n").replace(".rs-scene", `#${host}`);
  // 录屏必须静态写进场景，HyperFrames 才认得；引擎再把它搬进画框
  const clips = scene.beats
    .flatMap((b) => (b.do === "screen" && b.video ? [{ ...b, end: b.exit !== undefined ? b.exit + 0.38 : scene.dur }] : b.do === "news" ? b.clips.filter((c) => c.video) : []))
    .map((b, i) => {
      const from = b.at;
      return `<video id="${b.domId}" class="clip" src="${b.video}" muted playsinline data-start="${from}" data-duration="${Math.min(b.end - from, scene.dur - from, b.clipLen ?? Infinity).toFixed(3)}" data-media-start="${b.mediaStart ?? 0}" data-track-index="${20 + i}"></video>`;
    })
    .join("\n    ");
  return `<template>
  <style>${css}</style>
  <div id="${host}" class="rs-layout-${scene.layout.toLowerCase()} rs-aspect-${scene.aspect[0]}" data-composition-id="${scene.id}" data-width="${W}" data-height="${h}" style="height:${h}px">
    ${clips}
  </div>
  <script>
    const tl = gsap.timeline({ paused: true });
    const render = RS.mount(document.getElementById(${JSON.stringify(host)}), ${JSON.stringify(scene)});
    const clock = { t: 0 };
    render(0);
    tl.to(clock, { t: ${scene.dur}, duration: ${scene.dur}, ease: "none", onUpdate: () => render(clock.t) }, 0);
    window.__timelines[${JSON.stringify(scene.id)}] = tl;
  </script>
</template>
`;
}

// 动作自带的音效。声明文件不用写，改了时间音效跟着走
function sfxOf(scene, spec) {
  const out = [];
  const add = (file, t, vol) => out.push({ file, t, vol });
  for (const b of scene.beats) {
    if (b.do === "evidence") add("click", b.land, 0.4);
    if (b.do === "verdict") add("ding", b.at, 0.3);
    if (b.do === "ladder") {
      add("swell", b.drops[0], 0.32);
      b.drops.forEach((d) => add("click", d + 0.26, 0.38));
      if (b.lock !== undefined) add("ding", b.lock, 0.28);
    }
    if (b.do === "evidence" && b.exit !== undefined && b.x < 400) add("whoosh", b.exit, 0.32);
    if (b.do === "levelIntro") {
      add("whoosh", 0, 0.35);
      add("click", 0.28, 0.45);
    }
    if (b.do === "doc") {
      if (b.exitY && b.exit !== undefined) add("whoosh", b.exit, 0.35);
      if (b.checkAt !== undefined) add("click", b.checkAt, 0.4);
      for (const it of b.items) {
        if (it.strike) add("click", it.strike.at, 0.5);
        if (it.type === "pull") add("whoosh", it.yank, 0.3);
        if (it.type === "choice") it.options.forEach((o) => add("click", o.at, 0.42));
        if (it.type === "icons") it.icons.forEach((o) => add("click", o.at, 0.38));
      }
    }
    if (b.do === "curve") for (const s of b.route) if (s.land) add("ding", s.at, 0.3);
    if (b.do === "climax") add("swell", b.lit, 0.34);
    if (b.do === "cta") add("ding", b.kwAt, 0.36);
    if (b.do === "tally") add("ding", b.land, 0.32);
    if (b.do === "silver") add("whoosh", b.at, 0.3);
    if (b.do === "big" || b.do === "brush") add("ding", b.at + 0.05, 0.28);
    if (b.do === "shrink") add("whoosh", b.land, 0.3);
    if (b.do === "pie") add("ding", b.at + 0.1 + (b.dur ?? 0.9), 0.3);
    if (b.do === "stat") add("ding", b.land ?? b.at + 1, 0.32);
    if (b.do === "metro") {
      add("whoosh", b.at, 0.32);
      add("click", b.at + 1.3, 0.38);
    }
    if (b.do === "term") add("whoosh", b.at, 0.4);
    if (b.do === "numcard") add("whoosh", Math.max(0, b.at - 0.12), 0.4);
    if (b.do === "money") add("whoosh", b.at, 0.28);
    if (b.do === "highlight") add("click", b.hlAt ?? b.at + 0.6, 0.34);
    if (b.do === "chart") for (const l of b.labels || []) if (l.at !== undefined) add("click", l.at, 0.34);
    if (["bubbles", "pills", "logos", "thread", "bars"].includes(b.do)) for (const x of b.items) add("click", x.at, 0.36);
    if (b.do === "tower") {
      for (const x of b.items) add("click", x.at, 0.36);
      for (const x of b.states || []) add("click", x.at, 0.36);
    }
    if (b.do === "path") for (const x of b.nodes) add("click", x.at, 0.36);
    if (b.do === "percolate" && b.swellAt !== undefined) add("swell", b.swellAt, 0.5);
    if (b.do === "sheet") for (const f of b.flags || []) add("click", f.at, 0.42);
    if (b.do === "screen") {
      for (const f of b.focus || []) if (f.land) add("click", f.at + (f.dur ?? 0.6), 0.35);
      for (const l of b.labels || []) add("click", l.at, 0.34);
      for (const m of b.marks || []) add("click", m.at, 0.34);
    }
  }
  const seen = new Set();
  const mix = spec.mix || {};
  return out
    .filter((s) => {
      const k = `${s.file}@${s.t}`;
      if (seen.has(k) || s.t < 0 || s.t >= scene.dur) return false;
      if (mix.only && !mix.only.includes(s.file)) return false;
      seen.add(k);
      return true;
    })
    .map((s) => ({ ...s, vol: Number((s.vol * (mix.sfx ?? 1)).toFixed(3)) }));
}

// 场景视频：S 分屏探头，A 全屏真人。真人素材比成片早结束时，用定格图垫满
function indexHtml(doc, scene) {
  // HyperFrames 按时长向上取整算帧数，所以时长往下取到毫秒，否则会多渲一帧、后面的口型跟着偏
  const floorMs = (v) => (Math.floor(v * 1000) / 1000).toFixed(3);
  const d = floorMs(scene.dur);
  const f = doc.footage;
  const clipEnd = doc.footageEnd ? Math.min(scene.end, doc.footageEnd) : scene.end;
  const live = floorMs(clipEnd - scene.start);
  const tail = doc.footageEnd && scene.end > doc.footageEnd ? { at: (doc.footageEnd - scene.start).toFixed(3), len: (scene.end - doc.footageEnd).toFixed(3) } : null;
  const sfx = sfxOf(scene, doc.styleSpec)
    .map((s, i) => `<audio id="sfx-${i}" class="clip" src="assets/sfx/${s.file}.wav" data-start="${s.t}" data-duration="${SFX_LEN[s.file]}" data-volume="${s.vol}" data-track-index="${10 + i}"></audio>`)
    .join("\n      ");
  const isA = scene.layout === "A";
  const land = doc.aspect === "landscape";
  const [W, H] = SIZE[doc.aspect];
  // 全屏录屏时人不能挡内容，一律缩成角落小窗；画板页才按风格放人像卡
  const bubble = doc.styleSpec.person === "bubble" || scene.layout === "W";
  const px = bubble ? { w: 200, h: 200, l: 1680, t: 840, r: "50%", vw: 640, vh: 360, top: -30 } : { w: 360, h: 480, l: 1490, t: 290, r: "var(--radius)", vw: 1000, vh: 562, top: -40 };
  const faceLeft = (px.w / 2 - (doc.faceX ?? 0.5) * px.vw).toFixed(1);
  const personClip = `<div id="person" style="left:${px.l}px;top:${px.t}px;width:${px.w}px;height:${px.h}px;border-radius:${px.r}"><video id="pv" class="clip" src="${f.wide}" muted playsinline data-start="0" data-duration="${live}" data-media-start="${scene.start}" data-track-index="2" style="left:${faceLeft}px;top:${px.top}px;width:${px.vw}px;height:${px.vh}px"></video></div>`;
  const noPerson = scene.layout === "F" || scene.person === false || !f.wide;
  const landMedia = isA
    ? `<div id="face-wrap"><video id="fa" class="clip" src="${f.wide}" muted playsinline data-start="0" data-duration="${live}" data-media-start="${scene.start}" data-track-index="1"></video></div>`
    : noPerson ? "" : personClip;
  const half = doc.styleSpec.person === "half" && scene.layout === "S" && doc.person !== "card"; // person: "card" 换成探头卡，字幕位置不变
  const media = land ? landMedia : scene.layout === "F" || scene.layout === "W" ? "" : half
    ? `<div id="half"><video id="hv" class="clip" src="${f.pop}" muted playsinline data-start="0" data-duration="${live}" data-media-start="${scene.start}" data-track-index="1"></video>${tail ? `<img id="half-still" class="clip" src="${f.endStill}" alt="" data-start="${tail.at}" data-duration="${tail.len}" data-track-index="1" />` : ""}</div>`
    : isA
    ? `<div id="face-wrap"><video id="fa" class="clip" src="${f.full}" muted playsinline data-start="0" data-duration="${live}" data-media-start="${scene.start}" data-track-index="1"></video></div>`
    : `<div id="pop-win"><video id="pw" class="clip" src="${f.pop}" muted playsinline data-start="0" data-duration="${live}" data-media-start="${scene.start}" data-track-index="1"></video>${tail ? `<img id="end-still" class="clip" src="${f.endStill}" alt="" data-start="${tail.at}" data-duration="${tail.len}" data-track-index="1" />` : ""}</div>
      <div id="pop-out"><video id="pm" class="clip" src="${f.matte}" muted playsinline data-start="0" data-duration="${live}" data-media-start="${scene.start}" data-track-index="2"></video>${tail ? `<img id="end-head" class="clip" src="${f.endHead}" alt="" data-start="${tail.at}" data-duration="${tail.len}" data-track-index="2" />` : ""}</div>`;
  const h = hostHeight(scene, doc);
  // 人身后的字：抠像放在图形层上面，和全屏真人同样大小，推近时一起动
  const matte = scene.matte ? `<div id="matte-wrap"><video id="mv" class="clip" src="${scene.matte}" muted playsinline data-start="0" data-duration="${live}" data-track-index="3"></video></div>` : "";
  // 全屏真人：整场极慢推近，说到情绪词时弹簧推一下
  const faceJs = isA
    ? `
      const clock = { t: 0 };
      const face = document.getElementById("face-wrap");
      const drawFace = (t) => {
        const s = ${scene.punch ?? -1} >= 0 ? t - ${scene.punch ?? -1} : -1;
        const push = s > 0 ? ${doc.styleSpec.motion?.punch ?? 0.075} * RS.spring(s, 13, 8) : 0;
        const [x, y] = s > 0 ? RS.shock(t, [{ t: ${scene.punch ?? -1}, weight: 1 }], ${doc.styleSpec.motion?.shock ?? 5}) : [0, 0];
        face.style.transform = \`translate(\${x.toFixed(2)}px,\${y.toFixed(2)}px) scale(\${(1 + 0.018 * t / ${scene.dur} + push).toFixed(4)})\`;
        const mw = document.getElementById("matte-wrap");
        if (mw) mw.style.transform = face.style.transform;
      };
      drawFace(0);
      main.to(clock, { t: ${scene.dur}, duration: ${scene.dur}, ease: "none", onUpdate: () => drawFace(clock.t) }, 0);`
    : "";
  return `<!doctype html>
<html lang="zh-CN" data-resolution="${doc.aspect}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${W}, height=${H}" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
${ENGINE_JS.map((j) => `    <script src="assets/engine/${j}"></script>`).join("\n")}
    <style>
      :root { ${Object.entries(doc.styleSpec.tokens).map(([k, v]) => `--${k}: ${v};`).join(" ")} }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; background: var(--bg); }
      #root { position: relative; width: 100%; height: 100%; overflow: hidden; }
      #bg { position: absolute; inset: 0; background: var(--bg-image), var(--bg); }
      #person { position: absolute; overflow: hidden; z-index: 7; border: 5px solid var(--surface); box-shadow: var(--shadow); background: var(--bg); }
      #person video { position: absolute; }
      #pop-win { position: absolute; left: 60px; top: 1210px; width: 960px; height: 760px; border-radius: 44px; overflow: hidden; box-shadow: 0 30px 70px rgba(0,0,0,.35); z-index: 2; }
      #pop-win video { position: absolute; left: -60px; top: -250px; width: 1080px; height: 960px; }
      #end-still { position: absolute; left: 0; top: 0; width: 960px; height: 710px; object-fit: cover; object-position: 50% 0; }
      #pop-out { position: absolute; left: 300px; top: 960px; width: 480px; height: 250px; overflow: hidden; z-index: 3; }
      #pop-out video { position: absolute; left: -300px; top: 0; width: 1080px; height: 960px; }
      #end-head { position: absolute; left: 0; top: 0; width: 480px; height: 250px; }
      #face-wrap { position: absolute; inset: 0; transform-origin: 50% 32%; z-index: 2; }
      #face-wrap video { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; object-fit: cover; }
      #matte-wrap { position: absolute; inset: 0; transform-origin: 50% 32%; z-index: 6; }
      #matte-wrap video { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; object-fit: cover; }
      #half { position: absolute; left: 0; top: 960px; width: 1080px; height: 960px; overflow: hidden; z-index: 2; }
      #half video, #half img { position: absolute; left: 0; top: 0; width: 1080px; height: 960px; object-fit: cover; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${d}" data-width="${W}" data-height="${H}">
      <div id="bg"></div>
      ${media}
      <div id="h-${scene.id}" data-composition-id="${scene.id}" data-composition-src="compositions/${scene.id}.html" data-start="0" data-duration="${d}" data-track-index="4" data-track-kind="graphics" data-width="${W}" data-height="${h}" style="position:absolute;left:0;top:0;width:${W}px;height:${h}px;z-index:5"></div>
      <audio id="voice" class="clip" src="${f.voice}" data-start="0" data-duration="${live}" data-media-start="${scene.start}" data-volume="1" data-track-index="8"></audio>
      ${f.bgm ? `<audio id="bgm" class="clip" src="${f.bgm}" data-start="0" data-duration="${d}" data-media-start="${scene.start}" data-volume="${doc.bgmVolume ?? doc.styleSpec.mix?.bgm ?? 0.3}" data-track-index="9"></audio>` : ""}
      ${matte}
      ${sfx}
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      const main = gsap.timeline({ paused: true });${faceJs}
      window.__timelines["main"] = main;
    </script>
  </body>
</html>
`;
}

function writeProject(dir, doc, scene) {
  const engineOut = path.join(dir, "assets/engine");
  fs.mkdirSync(engineOut, { recursive: true });
  ENGINE_JS.forEach((j) => fs.copyFileSync(path.join(ENGINE, j), path.join(engineOut, j)));
  // 旧工程建得早，新字体补进去
  for (const font of fs.readdirSync(path.join(ROOT, "assets/fonts"))) {
    const to = path.join(dir, "assets/fonts", font);
    if (!fs.existsSync(to)) fs.copyFileSync(path.join(ROOT, "assets/fonts", font), to);
  }
  const comps = path.join(dir, "compositions");
  fs.rmSync(comps, { recursive: true, force: true });
  fs.mkdirSync(comps, { recursive: true });
  fs.writeFileSync(path.join(comps, `${scene.id}.html`), compositionHtml(scene, doc));
  fs.writeFileSync(path.join(dir, "index.html"), indexHtml(doc, scene));
  const meta = path.join(dir, "hyperframes.json");
  if (!fs.existsSync(meta)) fs.writeFileSync(meta, JSON.stringify({ paths: { blocks: "compositions", components: "compositions/components", assets: "assets" } }, null, 2));
}

const sceneHash = (doc, scene) =>
  createHash("sha1")
    .update(JSON.stringify([scene, doc.footage, doc.styleSpec, doc.aspect, doc.faceX, compositionHtml(scene, doc), indexHtml(doc, scene), [...ENGINE_JS, ...ENGINE_CSS].map((j) => fs.readFileSync(path.join(ENGINE, j), "utf8"))]))
    .digest("hex")
    .slice(0, 12);

const pick = (scenes, names) => {
  names.forEach((n) => scenes.some((s) => s.id === n) || die(`没有场景 ${n}`));
  return scenes.filter((s) => !names.length || names.includes(s.id));
};

// ---------- 命令 ----------
function cmdNew(slug, parent) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) die("短名只用小写英文、数字和连字符");
  const day = new Date().toLocaleDateString("sv-SE");
  const dir = path.join(parent, `${day}-${slug}`);
  if (fs.existsSync(dir)) die(`已存在：${dir}`);
  for (const sub of ["fonts", "sfx"]) fs.cpSync(path.join(ROOT, "assets", sub), path.join(dir, "assets", sub), { recursive: true });
  for (const sub of ["footage", "img", "audio"]) fs.mkdirSync(path.join(dir, "assets", sub), { recursive: true });
  const stub = { title: slug, style: "", aspect: "", words: "words.json", footage: { voice: "assets/footage/voice.wav" }, captions: [], scenes: [] };
  fs.writeFileSync(path.join(dir, "studio.json"), `${JSON.stringify(stub, null, 1)}\n`);
  console.log(dir);
}

// 引擎的 CSS 挂在场景根元素的 class 上。上游说这已不影响渲染（#1886），只算警告，免得每场都报错盖住真问题
const HF_DOWNGRADE = new Set(["subcomposition_root_styled_by_class"]);

// 官方检查按场景跑：工程里同一时间只有一场
function hfCheck(dir, doc, scene) {
  writeProject(dir, doc, scene);
  const r = spawnSync(HF, [...HF_PRE, "check", dir, "--json"], { encoding: "utf8", maxBuffer: 1 << 28 });
  let report;
  try {
    report = JSON.parse(r.stdout);
  } catch {
    const why = r.error ? `启动不了 ${HF}：${r.error.message}。跑 rs doctor 看缺什么` : (r.stderr || r.stdout || "").slice(-800);
    return { errors: [`${scene.id}：hyperframes check 没跑完\n${why}`], warnings: 0 };
  }
  const findings = ["lint", "runtime", "layout", "contrast", "craft", "audio"].flatMap((k) => report[k]?.findings ?? []);
  const isError = (f) => f.severity === "error" && !HF_DOWNGRADE.has(f.code);
  const errors = findings.filter(isError).map((f) => `${scene.id}：[${f.code}] ${f.message}${f.selector ? `（${f.selector}）` : ""}`);
  return { errors, warnings: findings.filter((f) => !isError(f) && f.severity !== "info").length };
}

function cmdCheck(dir, wanted, fast) {
  const { doc, errors, warnings, scenes } = load(dir);
  for (let i = 1; i < scenes.length; i++) if (Math.abs(scenes[i].start - scenes[i - 1].end) > 0.001) errors.push(`${scenes[i].id}：和上一场之间有缺口`);
  let hfWarnings = 0;
  if (!fast && errors.length === 0) {
    for (const scene of pick(scenes, wanted)) {
      const r = hfCheck(dir, doc, scene);
      errors.push(...r.errors);
      hfWarnings += r.warnings;
    }
  }
  warnings.forEach((w) => console.log(`提醒  ${w}`));
  errors.forEach((e) => console.log(`错误  ${e}`));
  console.log(`${scenes.length} 个场景，共 ${scenes.at(-1).end.toFixed(2)} 秒，${errors.length} 个错误，${warnings.length} 个提醒${fast ? "（跳过了官方检查）" : `，官方检查另有 ${hfWarnings} 个警告`}`);
  return errors.length === 0;
}

// 关键帧：动作开始后、落定瞬间、落定后、退场前，都是这一拍最容易出问题的时刻
function keyTimes(scene) {
  const ts = new Set([0.2, scene.dur - 0.08]);
  const visit = (b) => {
    if (!b || typeof b !== "object") return;
    if (Array.isArray(b)) return b.forEach(visit);
    if (typeof b.at === "number") ts.add(b.at + 0.3);
    if (typeof b.land === "number" && b.land !== true) [b.land - 0.2, b.land + 0.05, b.land + 0.45].forEach((t) => ts.add(t));
    if (typeof b.exit === "number") ts.add(b.exit + 0.1);
    if (typeof b.hold === "number") [b.hold + 0.3, b.hold + 1].forEach((t) => ts.add(t));
    if (typeof b.to === "number") [(b.from + b.to) / 2, b.to + 0.1].forEach((t) => ts.add(t));
    if (b.strike) ts.add(b.strike.at + 0.1);
    if (typeof b.yank === "number") [b.yank - 0.1, b.yank + 0.3].forEach((t) => ts.add(t));
    if (b.do === "verdict") ts.add(b.at + 0.6);
    if (["silver", "big", "pie", "stat", "metro", "chart", "percolate", "numcard", "term", "quote", "tweet", "track"].includes(b.do)) ts.add(b.at + 1.3);
    if (b.do === "shrink") ts.add(b.land + 0.9);
    if (b.do === "screen") [b.at + 0.3, b.at + 1.2, ...(b.focus || []).map((f) => f.at + (f.dur ?? 0.6)), ...(b.labels || []).map((l) => l.at + 0.2)].forEach((t) => ts.add(t));
    if (b.do === "tally") [b.fade + 0.3, (b.fade + b.land) / 2, b.land + 0.05, b.land + 0.5].forEach((t) => ts.add(t));
    if (b.do === "climax") [b.lit + 0.3, b.burst + 0.6, b.dive - 0.3, b.dive + 0.25].forEach((t) => ts.add(t));
    if (b.drops) [b.drops[1] + 0.2, b.drops.at(-1) + 0.27, b.drops.at(-1) + 0.45, ...(b.lock !== undefined ? [(b.climb + b.lock) / 2, b.lock + 0.08] : [])].forEach((t) => ts.add(t));
    Object.values(b).forEach((v) => typeof v === "object" && visit(v));
  };
  scene.beats.forEach(visit);
  if (scene.punch !== undefined) ts.add(scene.punch + 0.3);
  const all = [...ts].filter((t) => t > 0 && t < scene.dur).sort((a, b) => a - b);
  const thin = all.filter((t, i) => i === 0 || t - all[i - 1] >= 0.08);
  return thin.slice(0, 18).map((t) => Number(t.toFixed(2)));
}

function cmdFrames(dir, wanted) {
  const { doc, scenes, errors } = load(dir);
  if (errors.length) die(errors.join("\n"));
  const outDir = path.join(dir, "renders");
  fs.mkdirSync(outDir, { recursive: true });
  for (const scene of pick(scenes, wanted)) {
    writeProject(dir, doc, scene);
    const ts = keyTimes(scene);
    const shot = path.join(dir, ".studio/frames", scene.id);
    fs.rmSync(shot, { recursive: true, force: true });
    run(HF, [...HF_PRE, "snapshot", dir, "-o", shot, "--at", ts.join(","), "--no-end", "--describe=false"]);
    const pngs = fs.readdirSync(shot).filter((f) => f.endsWith(".png")).sort();
    const cols = Math.min(6, pngs.length);
    const sheet = path.join(outDir, `frames-${scene.id}${TRY.style ? `-${TRY.style}` : ""}.jpg`);
    const inputs = pngs.flatMap((f) => ["-i", path.join(shot, f)]);
    const filter = `${pngs.map((_, i) => `[${i}:v]scale=${doc.aspect === "landscape" ? 480 : 360}:-1[v${i}]`).join(";")};${pngs.map((_, i) => `[v${i}]`).join("")}xstack=inputs=${pngs.length}:layout=${pngs.map((_, i) => `${(i % cols) * (doc.aspect === "landscape" ? 480 : 360)}_${Math.floor(i / cols) * (doc.aspect === "landscape" ? 270 : 640)}`).join("|")}:fill=white[o]`;
    run("ffmpeg", ["-v", "error", "-y", ...inputs, "-filter_complex", filter, "-map", "[o]", "-frames:v", "1", "-q:v", "3", sheet]);
    console.log(`${scene.id}: ${sheet}  时刻 ${ts.join(" ")}`);
  }
}

function renderChunks(dir, doc, scenes, wanted, quality) {
  const cacheDir = path.join(dir, ".studio/cache");
  fs.mkdirSync(cacheDir, { recursive: true });
  const chunks = [];
  for (const scene of scenes) {
    const chunk = path.join(cacheDir, `${scene.id}-${quality}-${sceneHash(doc, scene)}.mp4`);
    if (fs.existsSync(chunk)) {
      console.log(`${scene.id}: 没变，用缓存`);
    } else if (wanted.length && !wanted.includes(scene.id)) {
      console.log(`${scene.id}: 没渲过，这次跳过，试看片里没有这一场`);
      continue;
    } else {
      writeProject(dir, doc, scene);
      const began = Date.now();
      const tmp = `${chunk}.tmp.mp4`;
      run(HF, [...HF_PRE, "render", dir, "-q", quality, "-f", String(FPS), "-o", tmp, "--quiet"]);
      fs.renameSync(tmp, chunk);
      console.log(`${scene.id}: 重渲 ${scene.dur.toFixed(1)} 秒片段，用时 ${((Date.now() - began) / 1000).toFixed(1)} 秒`);
    }
    chunks.push(chunk);
  }
  const list = path.join(cacheDir, "concat.txt");
  fs.writeFileSync(list, chunks.map((c) => `file '${c.replace(/'/g, "'\\''")}'`).join("\n"));
  return list;
}

function cmdRender(dir, wanted, quality) {
  const { doc, scenes, errors } = load(dir);
  if (errors.length) die(errors.join("\n"));
  const list = renderChunks(dir, doc, scenes, wanted, quality);
  const out = path.join(dir, "renders", `${doc.title}${TRY.style ? `-${TRY.style}` : ""}.mp4`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  run("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", out]);
  console.log(out);
}

function cmdQa(dir) {
  const { doc } = load(dir);
  const video = path.join(dir, "renders", `${doc.title}${TRY.style ? `-${TRY.style}` : ""}-final.mp4`);
  if (!fs.existsSync(video)) die(`还没有成片：${video}，先跑 rs final`);
  const r = spawnSync(PY, [path.join(ROOT, "scripts/qa_video.py"), video, "--scenes", path.join(dir, "renders/scenes.json"), "--lufs", String(doc.styleSpec.mix?.lufs ?? -16)], { stdio: "inherit" });
  process.exit(r.status ?? 1);
}

// 审片页：作者在画面上写批注，点发送后批注写进 renders/review/ 并打印出来
function cmdReview(dir, extra) {
  const { doc } = load(dir);
  const video = path.join(dir, "renders", `${doc.title}${TRY.style ? `-${TRY.style}` : ""}-final.mp4`);
  if (!fs.existsSync(video)) die(`还没有成片：${video}，先跑 rs final`);
  const r = spawnSync(PY, [path.join(ROOT, "scripts/review.py"), video, "--scenes", path.join(dir, "renders/scenes.json"), ...extra], { stdio: "inherit" });
  process.exit(r.status ?? 1);
}

// 自检：新装的机器先跑这个，缺什么、怎么装都列出来
function cmdDoctor() {
  const ver = (cmd, args) => {
    const r = spawnSync(cmd, args, { encoding: "utf8" });
    return r.status === 0 ? (r.stdout || r.stderr).trim().split("\n")[0] : null;
  };
  const pyHas = (mod) => spawnSync(PY, ["-c", `import ${mod}`], { encoding: "utf8" }).status === 0;
  const whisper = onPath("mlx_whisper") || fs.existsSync(path.join(path.dirname(PY), "mlx_whisper")) || fs.existsSync(path.join(PY_ENV, "bin/mlx_whisper"));
  const venv = `python3 -m venv ${PY_ENV.replace(process.env.HOME, "~")} && ${PY_ENV.replace(process.env.HOME, "~")}/bin/pip install numpy mlx-whisper`;
  const voices = path.join(process.env.HOME, ".config/ray-studio/voices.json");
  const rows = [
    ["必需", "Node 18 以上", Number(process.versions.node.split(".")[0]) >= 18, process.version, "https://nodejs.org"],
    ["必需", "ffmpeg", !!ver("ffmpeg", ["-version"]), "", "brew install ffmpeg"],
    ["必需", "HyperFrames", onPath("hyperframes") || onPath("npx"), onPath("hyperframes") ? "全局命令" : "用 npx 临时取，第一次会下载", "npm i -g hyperframes"],
    ["必需", "mlx_whisper（逐字时间，要 Apple 芯片）", whisper, "", venv],
    ["成片检查", "numpy", pyHas("numpy"), `python: ${PY}`, venv],
    ["配音，可选", "MINIMAX_API_KEY", !!process.env.MINIMAX_API_KEY, "", "用录好的声音不需要。要用就 export MINIMAX_API_KEY=..."],
    ["配音，可选", "音色表", fs.existsSync(voices), "", `建 ${voices.replace(process.env.HOME, "~")}，格式见 README 的「配音」`],
  ];
  let missing = 0;
  for (const [kind, name, ok, note, fix] of rows) {
    if (!ok && kind === "必需") missing += 1;
    console.log(`${ok ? "有  " : kind === "必需" ? "缺  " : "没有"}  ${name}${ok && note ? `  ${note}` : ""}${ok ? "" : `\n      ${kind}。${fix}`}`);
  }
  console.log(missing ? `\n还缺 ${missing} 样必需的，装好再开始。` : "\n必需的都有了，可以开始。");
  process.exit(missing ? 1 : 0);
}

// 成片：画面按帧拼，音频不从片段里拼，整条重混，接缝不会有咔哒声
function cmdFinal(dir, quality) {
  const { doc, scenes, errors } = load(dir);
  if (errors.length) die(errors.join("\n"));
  const list = renderChunks(dir, doc, scenes, [], quality);
  const total = scenes.at(-1).end;
  const f = doc.footage;
  const cues = scenes.flatMap((s) => sfxOf(s, doc.styleSpec).map((x) => ({ ...x, abs: s.start + x.t })));
  const beds = [f.voice, f.bgm].filter(Boolean);
  const inputs = [...beds, ...cues.map((c) => `assets/sfx/${c.file}.wav`)].flatMap((p) => ["-i", path.join(dir, p)]);
  const chains = [`[0:a]aresample=48000[b0]`];
  if (f.bgm) chains.push(`[1:a]volume=${doc.bgmVolume ?? doc.styleSpec.mix?.bgm ?? 0.3},aresample=48000[b1]`);
  cues.forEach((c, i) => {
    const ms2 = Math.round(c.abs * 1000);
    chains.push(`[${i + beds.length}:a]volume=${c.vol},aresample=48000,adelay=${ms2}|${ms2}[c${i}]`);
  });
  const labels = [...beds.map((_, i) => `[b${i}]`), ...cues.map((_, i) => `[c${i}]`)].join("");
  const mix = `${labels}amix=inputs=${beds.length + cues.length}:normalize=0:duration=longest,apad,atrim=0:${total.toFixed(3)},loudnorm=I=${doc.styleSpec.mix?.lufs ?? -16}:TP=-1.5:LRA=11[a]`;
  const audio = path.join(dir, ".studio/cache/master.m4a");
  run("ffmpeg", ["-v", "error", "-y", ...inputs, "-filter_complex", `${chains.join(";")};${mix}`, "-map", "[a]", "-ar", "48000", "-c:a", "aac", "-b:a", "256k", audio]);
  const out = path.join(dir, "renders", `${doc.title}${TRY.style ? `-${TRY.style}` : ""}-final.mp4`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  run("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-i", audio, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "copy", "-movflags", "+faststart", out]);
  const n = run("ffprobe", ["-v", "error", "-count_packets", "-select_streams", "v", "-show_entries", "stream=nb_read_packets", "-of", "csv=p=0", out]).trim().replace(/,$/, "");
  const want = Math.round(total * FPS);
  const words = JSON.parse(fs.readFileSync(path.join(dir, doc.words), "utf8"));
  const brief = scenes.map((s) => ({ id: s.id, start: s.start, end: s.end, label: s.layout, visual: [...new Set(s.beats.map((b) => b.do))].join("、"), text: words.filter((w) => w.start >= s.start && w.start < s.end).map((w) => w.text).join("") }));
  fs.writeFileSync(path.join(dir, "renders/scenes.json"), `${JSON.stringify(brief, null, 1)}\n`);
  console.log(`${out}\n画面 ${n} 帧，应为 ${want} 帧；音效 ${cues.length} 处`);
  if (Number(n) !== want) console.log("提醒  帧数和时长对不上，检查接缝");
}

const argv = process.argv.slice(2);
for (const key of ["style", "aspect"]) {
  const i = argv.indexOf(`--${key}`);
  if (i >= 0) [, TRY[key]] = argv.splice(i, 2);
}
if (argv[0] === "styles") {
  for (const id of listStyles()) {
    const st = JSON.parse(fs.readFileSync(path.join(ROOT, "styles", `${id}.json`), "utf8"));
    console.log(`${id}  ${st.name}：${st.summary}`);
  }
  process.exit(0);
}
if (argv[0] === "doctor") cmdDoctor();
// 素材准备的脚本从这里进，用同一个 Python 环境
const SCRIPTS = { prep: "prep_koubo.py", words: "words.py", voice: "voice.py", matte: "matte.py" };
if (SCRIPTS[argv[0]]) process.exit(spawnSync(PY, [path.join(ROOT, "scripts", SCRIPTS[argv[0]]), ...argv.slice(1)], { stdio: "inherit" }).status ?? 1);
const [cmd, target, ...rest] = argv;
if (!cmd || !target) die("用法：rs doctor | rs styles | rs new <短名> | rs prep|words|voice|matte <工程目录> ... | rs check|frames|render|final|qa|review <工程目录> [场景...] [-q looks|delivery]");
if (cmd === "new") {
  const di = rest.indexOf("--dir");
  cmdNew(target, di >= 0 ? path.resolve(rest[di + 1]) : path.join(process.env.HOME, "Movies/ray-studio"));
  process.exit(0);
}
const dir = path.resolve(target);
const qi = rest.indexOf("-q");
const quality = qi >= 0 ? rest[qi + 1] : cmd === "final" ? "delivery" : "looks";
const names = rest.filter((v, i) => v !== "-q" && v !== "--fast" && (qi < 0 || i !== qi + 1));
if (cmd === "check") process.exit(cmdCheck(dir, names, rest.includes("--fast")) ? 0 : 1);
else if (cmd === "frames") cmdFrames(dir, names);
else if (cmd === "render") cmdRender(dir, names, quality);
else if (cmd === "final") cmdFinal(dir, quality);
else if (cmd === "qa") cmdQa(dir);
else if (cmd === "review") cmdReview(dir, rest);
else die(`未知命令：${cmd}`);
