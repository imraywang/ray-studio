#!/usr/bin/env node
// rs：ray-studio 命令行。声明文件 studio.json → 生成 HyperFrames 工程 → 检查、看帧、按场景渲染。
//   rs new    <英文短名> [--dir 父目录]  建工程：字体、音效和声明文件骨架
//   rs check  <工程>                    检查声明文件（台词能否对上、时间是否越界）
//   rs frames <工程> [场景...]          抽关键帧拼成一张图，给 Agent 自己看
//   rs render <工程> [场景...] [-q looks|delivery]  只重渲改过的场景，再拼起来试看
//   rs final  <工程> [-q delivery]      各场景画面按帧拼接，整条音频单独混，响度统一
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENGINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../engine");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE_JS = ["motion.js", "blocks.js"];
const HF = process.env.RS_HYPERFRAMES || "hyperframes";
const FPS = 30;
const SFX_LEN = { click: 0.05, ding: 0.7, whoosh: 0.7, swell: 1.2 };

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
  for (const w of words) {
    const clean = strip(w.text);
    [...clean].forEach((c, i) => {
      text += c;
      at.push({ start: w.start + ((w.end - w.start) * i) / clean.length, end: w.start + ((w.end - w.start) * (i + 1)) / clean.length });
    });
  }
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
function alignCaptions(list, idx, errors) {
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
    out.push({ text: show.replace(/\*/g, ""), accent: show.includes("*"), start: idx.at[pos].start, end: idx.at[cursor - 1].end });
  });
  return out;
}

const TIME_KEYS = new Set(["at", "countAt", "land", "exit", "climb", "lock", "from", "to", "hold", "lit", "burst", "dive", "kwAt", "subAt", "coverAt", "checkAt", "tagAt", "go", "yank", "out", "fade"]);

// ---------- 解析声明文件：台词换成场景内秒数。数字本来就是场景内秒数 ----------
function load(dir) {
  const file = path.join(dir, "studio.json");
  if (!fs.existsSync(file)) die(`找不到 ${file}`);
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
  const idx = indexWords(JSON.parse(fs.readFileSync(path.join(dir, doc.words), "utf8")));
  const errors = [];
  const warnings = [];
  const caps = alignCaptions(doc.captions || [], idx, errors);
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
    const beats = (raw.beats || []).map((b) => {
      const out = walk(b, `${raw.id}.${b.id}`);
      if (b.do === "headline" && [...b.text].length > 12) warnings.push(`${raw.id}.${b.id}：标题 ${[...b.text].length} 字，竖屏 64 号最多 12 字`);
      if (out.land !== undefined && out.countAt !== undefined && out.land - out.countAt < 0.2) warnings.push(`${raw.id}.${b.id}：计数只有 ${(out.land - out.countAt).toFixed(2)} 秒，看不清`);
      if (out.exit !== undefined && out.at !== undefined && out.exit - out.at < 1) warnings.push(`${raw.id}.${b.id}：只停留 ${(out.exit - out.at).toFixed(2)} 秒`);
      return out;
    });
    const inScene = caps.filter((c) => c.start >= start - 0.02 && c.start < end - 0.02);
    const captions = inScene.map((c, i) => ({
      text: c.text,
      accent: c.accent,
      start: ms(c.start - start),
      end: ms(Math.min(dur, i + 1 < inScene.length ? inScene[i + 1].start - start : c.end - start + 0.25)),
    }));
    const punch = raw.punch !== undefined ? rel(raw.punch, `${raw.id}.punch`) : undefined;
    return { id: raw.id, layout: raw.layout || "S", start, end, dur, life: raw.life, lifeOptions: raw.lifeOptions, beats, captions, punch };
  });
  return { doc, scenes, errors, warnings };
}

// ---------- 生成 HyperFrames 工程 ----------
function compositionHtml(scene) {
  const host = `rs-${scene.id}`;
  const h = scene.layout === "S" ? 960 : 1920;
  const css = fs.readFileSync(path.join(ENGINE, "motion.css"), "utf8").replace(".rs-scene", `#${host}`);
  return `<template>
  <style>${css}</style>
  <div id="${host}" class="rs-layout-${scene.layout.toLowerCase()}" data-composition-id="${scene.id}" data-width="1080" data-height="${h}" style="height:${h}px"></div>
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
function sfxOf(scene) {
  const out = [];
  const add = (file, t, vol) => out.push({ file, t, vol });
  for (const b of scene.beats) {
    if (b.do === "evidence") add("click", b.land, 0.4);
    if (b.do === "verdict") add("ding", b.at, 0.3);
    if (b.do === "ladder") {
      add("swell", b.drops[0], 0.32);
      b.drops.forEach((d) => add("click", d + 0.26, 0.38));
      add("ding", b.lock, 0.28);
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
  }
  const seen = new Set();
  return out.filter((s) => {
    const k = `${s.file}@${s.t}`;
    if (seen.has(k) || s.t < 0 || s.t >= scene.dur) return false;
    seen.add(k);
    return true;
  });
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
  const sfx = sfxOf(scene)
    .map((s, i) => `<audio id="sfx-${i}" class="clip" src="assets/sfx/${s.file}.wav" data-start="${s.t}" data-duration="${SFX_LEN[s.file]}" data-volume="${s.vol}" data-track-index="${10 + i}"></audio>`)
    .join("\n      ");
  const isA = scene.layout === "A";
  const media = scene.layout === "F" ? "" : isA
    ? `<div id="face-wrap"><video id="fa" class="clip" src="${f.full}" muted playsinline data-start="0" data-duration="${live}" data-media-start="${scene.start}" data-track-index="1"></video></div>`
    : `<div id="pop-win"><video id="pw" class="clip" src="${f.pop}" muted playsinline data-start="0" data-duration="${live}" data-media-start="${scene.start}" data-track-index="1"></video>${tail ? `<img id="end-still" class="clip" src="${f.endStill}" alt="" data-start="${tail.at}" data-duration="${tail.len}" data-track-index="1" />` : ""}</div>
      <div id="pop-out"><video id="pm" class="clip" src="${f.matte}" muted playsinline data-start="0" data-duration="${live}" data-media-start="${scene.start}" data-track-index="2"></video>${tail ? `<img id="end-head" class="clip" src="${f.endHead}" alt="" data-start="${tail.at}" data-duration="${tail.len}" data-track-index="2" />` : ""}</div>`;
  const h = scene.layout === "S" ? 960 : 1920;
  // 全屏真人：整场极慢推近，说到情绪词时弹簧推一下
  const faceJs = isA
    ? `
      const clock = { t: 0 };
      const face = document.getElementById("face-wrap");
      const drawFace = (t) => {
        const s = ${scene.punch ?? -1} >= 0 ? t - ${scene.punch ?? -1} : -1;
        const push = s > 0 ? 0.075 * RS.spring(s, 13, 8) : 0;
        const [x, y] = s > 0 ? RS.shock(t, [{ t: ${scene.punch ?? -1}, weight: 1 }], 5) : [0, 0];
        face.style.transform = \`translate(\${x.toFixed(2)}px,\${y.toFixed(2)}px) scale(\${(1 + 0.018 * t / ${scene.dur} + push).toFixed(4)})\`;
      };
      drawFace(0);
      main.to(clock, { t: ${scene.dur}, duration: ${scene.dur}, ease: "none", onUpdate: () => drawFace(clock.t) }, 0);`
    : "";
  return `<!doctype html>
<html lang="zh-CN" data-resolution="portrait">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
${ENGINE_JS.map((j) => `    <script src="assets/engine/${j}"></script>`).join("\n")}
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { margin: 0; width: 1080px; height: 1920px; overflow: hidden; background: #f4f1ea; }
      #root { position: relative; width: 100%; height: 100%; overflow: hidden; }
      #bg { position: absolute; inset: 0; background:
        linear-gradient(rgba(17,17,17,.045) 1px, transparent 1px) 0 0 / 48px 48px,
        linear-gradient(90deg, rgba(17,17,17,.045) 1px, transparent 1px) 0 0 / 48px 48px, #f4f1ea; }
      #pop-win { position: absolute; left: 60px; top: 1210px; width: 960px; height: 760px; border-radius: 44px; overflow: hidden; box-shadow: 0 30px 70px rgba(0,0,0,.35); z-index: 2; }
      #pop-win video { position: absolute; left: -60px; top: -250px; width: 1080px; height: 960px; }
      #end-still { position: absolute; left: 0; top: 0; width: 960px; height: 710px; object-fit: cover; object-position: 50% 0; }
      #pop-out { position: absolute; left: 300px; top: 960px; width: 480px; height: 250px; overflow: hidden; z-index: 3; }
      #pop-out video { position: absolute; left: -300px; top: 0; width: 1080px; height: 960px; }
      #end-head { position: absolute; left: 0; top: 0; width: 480px; height: 250px; }
      #face-wrap { position: absolute; inset: 0; transform-origin: 50% 32%; z-index: 2; }
      #face-wrap video { position: absolute; left: 0; top: 0; width: 1080px; height: 1920px; object-fit: cover; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${d}" data-width="1080" data-height="1920">
      <div id="bg"></div>
      ${media}
      <div id="h-${scene.id}" data-composition-id="${scene.id}" data-composition-src="compositions/${scene.id}.html" data-start="0" data-duration="${d}" data-track-index="4" data-track-kind="graphics" data-width="1080" data-height="${h}" style="position:absolute;left:0;top:0;width:1080px;height:${h}px;z-index:5"></div>
      <audio id="voice" class="clip" src="${f.voice}" data-start="0" data-duration="${live}" data-media-start="${scene.start}" data-volume="1" data-track-index="8"></audio>
      ${f.bgm ? `<audio id="bgm" class="clip" src="${f.bgm}" data-start="0" data-duration="${d}" data-media-start="${scene.start}" data-volume="${doc.bgmVolume ?? 0.3}" data-track-index="9"></audio>` : ""}
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
  const comps = path.join(dir, "compositions");
  fs.rmSync(comps, { recursive: true, force: true });
  fs.mkdirSync(comps, { recursive: true });
  fs.writeFileSync(path.join(comps, `${scene.id}.html`), compositionHtml(scene));
  fs.writeFileSync(path.join(dir, "index.html"), indexHtml(doc, scene));
  const meta = path.join(dir, "hyperframes.json");
  if (!fs.existsSync(meta)) fs.writeFileSync(meta, JSON.stringify({ paths: { blocks: "compositions", components: "compositions/components", assets: "assets" } }, null, 2));
}

const sceneHash = (doc, scene) =>
  createHash("sha1")
    .update(JSON.stringify([scene, doc.footage, compositionHtml(scene), indexHtml(doc, scene), ENGINE_JS.map((j) => fs.readFileSync(path.join(ENGINE, j), "utf8"))]))
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
  const stub = { title: slug, words: "words.json", footage: { voice: "assets/footage/voice.wav" }, captions: [], scenes: [] };
  fs.writeFileSync(path.join(dir, "studio.json"), `${JSON.stringify(stub, null, 1)}\n`);
  console.log(dir);
}

function cmdCheck(dir) {
  const { errors, warnings, scenes } = load(dir);
  for (let i = 1; i < scenes.length; i++) if (Math.abs(scenes[i].start - scenes[i - 1].end) > 0.001) errors.push(`${scenes[i].id}：和上一场之间有缺口`);
  warnings.forEach((w) => console.log(`提醒  ${w}`));
  errors.forEach((e) => console.log(`错误  ${e}`));
  console.log(`${scenes.length} 个场景，共 ${scenes.at(-1).end.toFixed(2)} 秒，${errors.length} 个错误，${warnings.length} 个提醒`);
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
    if (b.do === "tally") [b.fade + 0.3, (b.fade + b.land) / 2, b.land + 0.05, b.land + 0.5].forEach((t) => ts.add(t));
    if (b.do === "climax") [b.lit + 0.3, b.burst + 0.6, b.dive - 0.3, b.dive + 0.25].forEach((t) => ts.add(t));
    if (b.drops) [b.drops[1] + 0.2, b.drops.at(-1) + 0.27, b.drops.at(-1) + 0.45, (b.climb + b.lock) / 2, b.lock + 0.08].forEach((t) => ts.add(t));
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
    run(HF, ["snapshot", dir, "-o", shot, "--at", ts.join(","), "--no-end", "--describe=false"]);
    const pngs = fs.readdirSync(shot).filter((f) => f.endsWith(".png")).sort();
    const cols = Math.min(6, pngs.length);
    const sheet = path.join(outDir, `frames-${scene.id}.jpg`);
    const inputs = pngs.flatMap((f) => ["-i", path.join(shot, f)]);
    const filter = `${pngs.map((_, i) => `[${i}:v]scale=360:-1[v${i}]`).join(";")};${pngs.map((_, i) => `[v${i}]`).join("")}xstack=inputs=${pngs.length}:layout=${pngs.map((_, i) => `${(i % cols) * 360}_${Math.floor(i / cols) * 640}`).join("|")}:fill=white[o]`;
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
      die(`${scene.id} 没有可用缓存，先不带场景名跑一次`);
    } else {
      writeProject(dir, doc, scene);
      const began = Date.now();
      const tmp = `${chunk}.tmp.mp4`;
      run(HF, ["render", dir, "-q", quality, "-f", String(FPS), "-o", tmp, "--quiet"]);
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
  const out = path.join(dir, "renders", `${doc.title}.mp4`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  run("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", out]);
  console.log(out);
}

// 成片：画面按帧拼，音频不从片段里拼，整条重混，接缝不会有咔哒声
function cmdFinal(dir, quality) {
  const { doc, scenes, errors } = load(dir);
  if (errors.length) die(errors.join("\n"));
  const list = renderChunks(dir, doc, scenes, [], quality);
  const total = scenes.at(-1).end;
  const f = doc.footage;
  const cues = scenes.flatMap((s) => sfxOf(s).map((x) => ({ ...x, abs: s.start + x.t })));
  const beds = [f.voice, f.bgm].filter(Boolean);
  const inputs = [...beds, ...cues.map((c) => `assets/sfx/${c.file}.wav`)].flatMap((p) => ["-i", path.join(dir, p)]);
  const chains = [`[0:a]aresample=48000[b0]`];
  if (f.bgm) chains.push(`[1:a]volume=${doc.bgmVolume ?? 0.3},aresample=48000[b1]`);
  cues.forEach((c, i) => {
    const ms2 = Math.round(c.abs * 1000);
    chains.push(`[${i + beds.length}:a]volume=${c.vol},aresample=48000,adelay=${ms2}|${ms2}[c${i}]`);
  });
  const labels = [...beds.map((_, i) => `[b${i}]`), ...cues.map((_, i) => `[c${i}]`)].join("");
  const mix = `${labels}amix=inputs=${beds.length + cues.length}:normalize=0:duration=longest,apad,atrim=0:${total.toFixed(3)},loudnorm=I=-16:TP=-1.5:LRA=11[a]`;
  const audio = path.join(dir, ".studio/cache/master.m4a");
  run("ffmpeg", ["-v", "error", "-y", ...inputs, "-filter_complex", `${chains.join(";")};${mix}`, "-map", "[a]", "-ar", "48000", "-c:a", "aac", "-b:a", "256k", audio]);
  const out = path.join(dir, "renders", `${doc.title}-final.mp4`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  run("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-i", audio, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "copy", "-movflags", "+faststart", out]);
  const n = run("ffprobe", ["-v", "error", "-count_packets", "-select_streams", "v", "-show_entries", "stream=nb_read_packets", "-of", "csv=p=0", out]).trim().replace(/,$/, "");
  const want = Math.round(total * FPS);
  console.log(`${out}\n画面 ${n} 帧，应为 ${want} 帧；音效 ${cues.length} 处`);
  if (Number(n) !== want) console.log("提醒  帧数和时长对不上，检查接缝");
}

const [cmd, target, ...rest] = process.argv.slice(2);
if (!cmd || !target) die("用法：rs new <短名> | rs check|frames|render|final <工程目录> [场景...] [-q looks|delivery]");
if (cmd === "new") {
  const di = rest.indexOf("--dir");
  cmdNew(target, di >= 0 ? path.resolve(rest[di + 1]) : path.join(process.env.HOME, "Movies/ray-studio"));
  process.exit(0);
}
const dir = path.resolve(target);
const qi = rest.indexOf("-q");
const quality = qi >= 0 ? rest[qi + 1] : cmd === "final" ? "delivery" : "looks";
const names = rest.filter((v, i) => v !== "-q" && (qi < 0 || i !== qi + 1));
if (cmd === "check") process.exit(cmdCheck(dir) ? 0 : 1);
else if (cmd === "frames") cmdFrames(dir, names);
else if (cmd === "render") cmdRender(dir, names, quality);
else if (cmd === "final") cmdFinal(dir, quality);
else die(`未知命令：${cmd}`);
