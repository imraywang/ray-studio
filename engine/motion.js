/* ray-studio 动效引擎。所有画面都是场景时间 t 的纯函数：不读时钟，不用随机数，能任意 seek。
 * 三层：底层动作（缓动、弹簧、余震） → 语义动作（blocks） → mount 把一个场景拼起来。 */
(function (root) {
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const prog = (t, a, b) => (b <= a ? (t >= a ? 1 : 0) : clamp((t - a) / (b - a)));
  const ease = {
    out3: (k) => 1 - Math.pow(1 - k, 3),
    in2: (k) => k * k,
    in3: (k) => k * k * k,
    expo: (k) => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k)),
    inOut: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
    back: (k, s = 1.9) => 1 + (s + 1) * Math.pow(k - 1, 3) + s * Math.pow(k - 1, 2),
  };
  /* 欠阻尼弹簧：s 秒后的位置，从 0 到 1 */
  /* style.bounce 决定回弹多少：0 就是干净的减速，没有过冲 */
  const feel = { bounce: 1 };
  const spring = (s, freq = 15, decay = 7.5) => {
    if (s <= 0) return 0;
    const springy = 1 - Math.exp(-decay * s) * Math.cos(freq * s);
    const smooth = 1 - Math.exp(-decay * 1.3 * s);
    return smooth + (springy - smooth) * feel.bounce;
  };
  /* 冲击：某一刻挨一下之后的衰减振荡，两个轴频率不同，看起来不机械 */
  const SHOCK_LEN = 0.55;
  function shock(t, lands, amp = 6) {
    let x = 0;
    let y = 0;
    for (let i = 0; i < lands.length; i++) {
      const s = t - lands[i].t;
      if (s <= 0 || s >= SHOCK_LEN) continue;
      const a = amp * (lands[i].weight ?? 1);
      const fade = Math.exp(-s * 9);
      y += a * Math.sin(s * 34) * fade;
      x += a * 0.35 * Math.sin(s * 25 + 0.6) * fade;
    }
    return [x, y];
  }

  const el = (tag, cls, parent, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    if (parent) parent.appendChild(n);
    return n;
  };
  const px = (v) => `${v.toFixed(2)}px`;
  const blurOf = (v) => (v > 0.04 ? `blur(${v.toFixed(2)}px)` : "none");
  /* 进场：虚焦、略大、带一点位移，变清楚 */
  function focusIn(node, t, at, { dur = 0.6, blur = 16, y = 0, scale = 1.06 } = {}) {
    const k = ease.expo(prog(t, at, at + dur));
    node.style.opacity = t < at ? 0 : k;
    node.style.filter = blurOf(blur * (1 - k));
    node.style.transform = `translateY(${px(y * (1 - k))}) scale(${lerp(scale, 1, k).toFixed(4)})`;
  }

  /* ---------- 语义动作。每个工厂返回 { node, parts, lands, render(t) } ---------- */
  const blocks = {};

  /* 标题：逐字虚焦落下 */
  blocks.headline = (b, ctx) => {
    const node = el("div", "rs-headline", ctx.stage);
    if (b.top !== undefined) node.style.top = `${b.top}px`;
    const chars = [...b.text].map((c) => {
      const accent = b.accent && b.accent.includes(c);
      return el("span", `rs-ch${accent ? " rs-accent" : ""}`, node, c === " " ? "&nbsp;" : c);
    });
    return {
      node,
      parts: [node],
      lands: [],
      render(t) {
        chars.forEach((c, i) => focusIn(c, t, b.at + i * 0.05, { dur: 0.5, blur: 12, y: -22, scale: 1 }));
      },
    };
  };

  /* 数字落定：慢起、加速、长减速；速度越快越糊；到点顿一下，比例条跟着长 */
  blocks.evidence = (b, ctx) => {
    const node = el("div", "rs-evidence", ctx.stage);
    node.style.left = `${b.x}px`;
    const card = el("div", "rs-card", node);
    if (b.img) el("div", "rs-card-img", card, `<img src="${b.img}" alt="" style="object-position:${b.imgPos || "50% 20%"}" />`);
    else card.classList.add("is-plain");
    if (b.label) el("div", "rs-card-label", card, b.label);
    const row = el("div", "rs-num-row", card);
    const num = el("span", "rs-num", row, "0");
    if (b.unit) el("span", "rs-unit", row, b.unit);
    const track = el("div", "rs-track", card);
    const fill = el("div", "rs-fill", track);
    const start = b.countAt ?? b.at;
    const fmt = (v) => Math.round(v).toLocaleString("en-US");
    const roll = (k) => {
      const lead = 0.18;
      return k < lead ? 0.04 * (k / lead) * (k / lead) : lerp(0.04, 1, 1 - Math.pow(1 - (k - lead) / (1 - lead), 3.4));
    };
    return {
      node,
      card,
      num,
      parts: [node],
      lands: [{ t: b.land, weight: b.landWeight ?? 0.8 }],
      render(t) {
        focusIn(node, t, b.at, { dur: 0.7, blur: 22, y: 56, scale: 1.14 });
        const k = prog(t, start, b.land);
        const p = roll(k);
        const dv = (roll(clamp(k + 0.02)) - roll(clamp(k - 0.02))) / 0.04;
        num.textContent = fmt(b.value * p);
        const moving = k > 0 && k < 1;
        const hit = t - b.land;
        const pulse = hit > 0 ? 0.14 * Math.exp(-hit * 11) * Math.cos(hit * 26) : 0;
        num.style.filter = blurOf(moving ? Math.min(5, dv * 1.1) : 0);
        num.style.transform = `scale(${(1 + pulse).toFixed(4)})`;
        fill.style.width = `${Math.max(p > 0 ? 3 : 0, ((b.barValue ?? b.value) * p * 100) / b.scaleMax).toFixed(3)}%`;
      },
    };
  };

  /* 胜负裁决：落败方抖一下、褪色、后退、数字被划掉；胜出方弹大、描边、打勾 */
  blocks.verdict = (b, ctx) => {
    const lose = ctx.byId[b.loser];
    const win = ctx.byId[b.winner];
    const strike = el("div", "rs-strike", lose.card);
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("class", "rs-outline");
    svg.setAttribute("viewBox", "0 0 380 470");
    const rect = document.createElementNS(ns, "rect");
    Object.entries({ x: 2, y: 2, width: 376, height: 466, rx: 30, pathLength: 1 }).forEach(([k, v]) => rect.setAttribute(k, v));
    svg.appendChild(rect);
    win.card.appendChild(svg);
    const badge = el("div", "rs-check", win.card, '<svg viewBox="0 0 24 24"><path pathLength="1" d="M5 12.5 10 17.5 19 7"/></svg>');
    const tick = badge.querySelector("path");
    const a = b.at;
    return {
      node: strike,
      parts: [],
      lands: [{ t: a, weight: 1.2 }],
      modifiers(t, mods) {
        const s = t - a;
        if (s < 0) return;
        const k = ease.out3(prog(t, a + 0.1, a + 0.55));
        const jolt = s < 0.34 ? 11 * Math.sin(s * 52) * Math.exp(-s * 10) : 0;
        mods[b.loser] = { x: jolt - 26 * k, y: 16 * k, scale: 1 - 0.1 * k, gray: k, opacity: 1 - 0.42 * k };
        const pop = spring(s, 15, 7);
        mods[b.winner] = { x: 0, y: -12 * Math.min(1, pop), scale: 1 + 0.055 * pop };
      },
      render(t) {
        strike.style.transform = `scaleX(${ease.inOut(prog(t, a + 0.14, a + 0.42)).toFixed(4)})`;
        rect.style.strokeDashoffset = 1 - ease.inOut(prog(t, a + 0.02, a + 0.5));
        const kb = prog(t, a + 0.16, a + 0.5);
        badge.style.opacity = kb > 0 ? 1 : 0;
        badge.style.transform = `scale(${(kb > 0 ? spring(t - a - 0.16, 17, 8) : 0).toFixed(4)})`;
        tick.style.strokeDashoffset = 1 - ease.out3(prog(t, a + 0.3, a + 0.56));
      },
    };
  };

  /* 比例标注：弹簧弹出一颗药丸，把两个数字的差说成一句话 */
  blocks.note = (b, ctx) => {
    const node = el("div", "rs-note", ctx.stage, b.text);
    if (b.top !== undefined) node.style.top = `${b.top}px`;
    return {
      node,
      parts: [node],
      lands: [],
      render(t) {
        const s = t - b.at;
        node.style.opacity = s <= 0 ? 0 : clamp(s / 0.08);
        node.style.transform = `translateX(-50%) scale(${(s <= 0 ? 0.6 : lerp(0.6, 1, spring(s, 18, 8))).toFixed(4)})`;
      },
    };
  };

  /* 钉住要点 + 讲过让位：一格格按重力落下、压扁、摆两下、钉子按下带涟漪；爬到哪亮到哪，走过的退后 */
  blocks.ladder = (b, ctx) => {
    const node = el("div", "rs-ladder", ctx.stage);
    const H = 88;
    const GAP = 18;
    const n = b.items.length;
    const rails = [el("div", "rs-rail rs-rail-l", node), el("div", "rs-rail rs-rail-r", node)];
    /* 先把空位摆出来：问「第几层」时观众已经看到一架等着填的梯子 */
    const slots = b.items.map((_, i) => {
      const s = el("div", "rs-slot", node);
      s.style.top = `${(n - 1 - i) * (H + GAP)}px`;
      return s;
    });
    const plates = b.items.map((label, i) => {
      const wrap = el("div", "rs-plate", node);
      wrap.style.top = `${(n - 1 - i) * (H + GAP)}px`;
      const body = el("div", "rs-plate-body", wrap, b.plain ? `<b>${label}</b>` : `<b>第 ${i + 1} 层</b><span>${label}</span>`);
      const ring = el("i", "rs-ripple", wrap);
      const pin = el("i", "rs-pin", wrap);
      return { wrap, body, ring, pin, at: b.drops[i] };
    });
    const FALL = 0.26;
    const marker = el("div", "rs-marker", node);
    const yOf = (i) => (n - 1 - i) * (H + GAP) + H / 2 - 26;
    const hasClimb = b.climb !== undefined;
    const climbAt = (t) => (hasClimb ? lerp(0, n - 1, ease.inOut(prog(t, b.climb, b.lock))) : 0);
    return {
      node,
      parts: plates.map((p) => p.wrap),
      lands: plates.map((p, i) => ({ t: p.at + FALL, weight: 0.5 + i * 0.1 })).concat(hasClimb ? [{ t: b.lock, weight: 1.2 }] : []),
      render(t) {
        rails.forEach((r) => {
          r.style.transform = `scaleY(${ease.expo(prog(t, b.at, b.at + 0.7)).toFixed(4)})`;
        });
        slots.forEach((s, i) => {
          const k = ease.out3(prog(t, b.at + 0.12 + i * 0.07, b.at + 0.5 + i * 0.07));
          s.style.opacity = k * (1 - prog(t, b.drops[i] + 0.2, b.drops[i] + 0.27));
          s.style.transform = `translateY(${px(14 * (1 - k))})`;
        });
        const cur = climbAt(t);
        const climbing = hasClimb && t >= b.climb;
        plates.forEach((p, i) => {
          const u = t - p.at;
          if (u < 0) {
            p.wrap.style.opacity = 0;
            return;
          }
          p.wrap.style.opacity = 1;
          let y;
          let rot;
          let sx = 1;
          let sy = 1;
          if (u < FALL) {
            const g = ease.in2(u / FALL);
            y = -130 * (1 - g);
            rot = -4 + 3.4 * (u / FALL);
            p.wrap.style.opacity = ease.out3(clamp(u / 0.12));
          } else {
            const v = u - FALL;
            y = -5 * Math.sin(v * 17) * Math.exp(-v * 13);
            const squash = 0.07 * Math.exp(-v * 20);
            sy = 1 - squash;
            sx = 1 + squash * 0.5;
            rot = -0.9 * Math.cos(v * 12) * Math.exp(-v * 6.5);
          }
          p.body.style.transform = `translateY(${px(y)}) rotate(${rot.toFixed(3)}deg) scale(${sx.toFixed(4)},${sy.toFixed(4)})`;
          const pv = u - FALL + 0.04;
          p.pin.style.opacity = pv < 0 ? 0 : 1;
          p.pin.style.transform = `translateY(${px(y)}) scale(${(pv < 0 ? 1.7 : lerp(1.7, 1, ease.back(prog(pv, 0, 0.18), 2.2))).toFixed(3)})`;
          const rk = prog(u, FALL, FALL + 0.55);
          p.ring.style.opacity = rk > 0 && rk < 1 ? 0.6 * (1 - rk) : 0;
          p.ring.style.transform = `translate(-50%,-50%) scale(${(0.2 + 2 * ease.out3(rk)).toFixed(3)})`;
          /* 爬到这一格时墨绿，走过的退到灰；最后一格留在墨绿 */
          const near = climbing ? clamp(1 - Math.abs(cur - i) * 1.6) : 0;
          const passed = climbing ? clamp(cur - i - 0.3) : 0;
          const hold = hasClimb && i === n - 1 && t >= b.lock ? 1 : 0;
          const on = Math.max(near, hold);
          p.body.style.setProperty("--on", on.toFixed(3));
          p.body.classList.toggle("is-on", on > 0.5);
          p.body.style.opacity = (1 - 0.42 * passed * (1 - on)).toFixed(3);
        });
        if (!hasClimb) return;
        const mIn = prog(t, b.climb - 0.12, b.climb + 0.08);
        marker.style.opacity = mIn;
        const locked = t - b.lock;
        const pop = locked > 0 ? 0.28 * Math.exp(-locked * 9) * Math.cos(locked * 22) : 0;
        marker.style.transform = `translateY(${px(yOf(cur))}) scale(${(lerp(0.5, 1, mIn) + pop).toFixed(4)})`;
      },
    };
  };

  /* 逐词字幕：不参与呼吸，要稳。每个词从略大、微虚弹到位 */
  function captions(stage, chunks) {
    const box = el("div", "rs-captions", stage);
    const items = chunks.map((c) => {
      const n = el("div", `rs-cap${c.accent ? " rs-accent" : ""}`, box, c.text);
      return { n, ...c };
    });
    return (t) => {
      items.forEach((c) => {
        const on = t >= c.start && t < c.end;
        c.n.style.visibility = on ? "visible" : "hidden";
        if (!on) return;
        const k = ease.expo(prog(t, c.start, c.start + 0.14));
        c.n.style.transform = `translateX(-50%) scale(${lerp(1.18, 1, k).toFixed(4)})`;
        c.n.style.filter = blurOf(4 * (1 - k));
      });
    };
  }

  /* 章节条：不参与呼吸，跨场景连续。进度按全片时间算，拼起来不会跳 */
  function chapters(host, list, sceneStart) {
    if (!list || !list.length) return () => {};
    host.classList.add("rs-has-chapters");
    const bar = el("div", "rs-chapters", host);
    const items = list.map((c) => {
      const n = el("div", "rs-chapter", bar, c.label);
      return { ...c, n, fill: el("i", "", n) };
    });
    return (t) => {
      const now = sceneStart + t;
      items.forEach((c) => {
        c.n.classList.toggle("is-on", now >= c.start && now < c.end);
        c.n.classList.toggle("is-done", now >= c.end);
        c.fill.style.transform = `scaleX(${prog(now, c.start, c.end).toFixed(4)})`;
      });
    };
  }

  /* ---------- 呼吸层：手持晃动、缓慢推近、部件各自漂浮、落地后的余震与跟随 ---------- */
  function life(cam, parts, lands, dur, opt) {
    const SWAY = opt.sway ?? 3.2;
    const ROT = opt.rot ?? 0.18;
    const FLOAT = opt.float ?? 3.6;
    const PUSH = opt.push ?? 0.035;
    const RAMP_AT = 0.45;
    const RAMP = 1.4;
    return (t) => {
      const k = prog(t, RAMP_AT, RAMP_AT + RAMP);
      const [sx, sy] = shock(t, lands, opt.shock ?? 6);
      const hx = SWAY * k * (Math.sin(t * 1.17) + 0.45 * Math.sin(t * 2.83 + 1.3)) + sx;
      const hy = SWAY * k * (Math.cos(t * 0.97 + 0.4) + 0.45 * Math.sin(t * 2.41)) + sy;
      cam.style.transform = `translate(${px(hx)},${px(hy)}) rotate(${(ROT * k * Math.sin(t * 0.63)).toFixed(3)}deg) scale(${(1 + (PUSH * t) / dur).toFixed(4)})`;
      parts.forEach((p, i) => {
        const phase = i * 2.1;
        const lag = 0.06 + (i % 3) * 0.02;
        const [ax, ay] = shock(t - lag, lands, opt.shock ?? 6);
        const fx = (ax - sx) * 0.7;
        const fy = (ay - sy) * 0.7;
        const w = 1.9 + (i % 4) * 0.13;
        p.style.translate = `${px(FLOAT * 0.35 * k * Math.sin(t * w * 0.71 + phase) + fx)} ${px(FLOAT * k * Math.sin(t * w + phase) + fy)}`;
      });
    };
  }

  /* 把声明好的场景拼起来，返回 render(t)。时间都已由 rs build 换算成场景内秒数 */
  function mount(host, scene) {
    feel.bounce = scene.motion?.bounce ?? 1;
    const frame = el("div", "rs-frame", host);
    const cam = el("div", "rs-cam", frame);
    const hardCut = scene.layout === "W";
    const ctx = { stage: cam, byId: {}, dur: scene.dur, hardCut, motion: scene.motion };
    const made = [];
    const yields = [];
    for (const b of scene.beats) {
      if (b.do === "yield") {
        yields.push(b);
        continue;
      }
      const f = blocks[b.do];
      if (!f) throw new Error(`未知动作：${b.do}`);
      const inst = f(b, ctx);
      inst.spec = b;
      ctx.byId[b.id] = inst;
      if (b.do !== "verdict") {
        inst.wrap = el("div", "rs-wrap");
        cam.insertBefore(inst.wrap, inst.node);
        inst.wrap.appendChild(inst.node);
        const pivot = b.pivot || (b.do === "evidence" ? [b.x + 190, 435] : [540, 480]);
        inst.wrap.style.transformOrigin = `${pivot[0]}px ${pivot[1]}px`;
      }
      made.push(inst);
    }
    const lands = made.flatMap((m) => m.lands);
    const parts = made.flatMap((m) => m.parts);
    const lifeOptions = { ...(scene.motion || {}), ...(scene.lifeOptions || {}) };
    const breathe = scene.life === false || hardCut ? () => {} : life(cam, parts, lands, scene.dur, lifeOptions);
    const cap = captions(host, scene.captions || []);
    const chapterBar = chapters(host, scene.chapters, scene.start);
    return (t) => {
      made.forEach((m) => m.render(t));
      const mods = {};
      made.forEach((m) => m.modifiers && m.modifiers(t, mods));
      for (const y of yields) {
        const k = ease.out3(prog(t, y.at, y.at + 0.5));
        if (k <= 0) continue;
        for (const id of y.targets) {
          const prior = mods[id] || {};
          mods[id] = { ...prior, opacity: (prior.opacity ?? 1) * (1 - (y.dim ?? 0.45) * k), scale: (prior.scale ?? 1) * (1 - (y.shrink ?? 0.05) * k) };
        }
      }
      /* 裁决、让位、退场都写在外层包裹上，动作自己的状态互不覆盖，也不读上一帧 */
      made.forEach((m) => {
        if (!m.wrap) return;
        const mod = mods[m.spec.id] || {};
        const exit = m.spec.exit === undefined ? 0 : hardCut ? (t >= m.spec.exit ? 1 : 0) : ease.in3(prog(t, m.spec.exit, m.spec.exit + 0.38));
        const filters = [];
        if (mod.gray) filters.push(`grayscale(${mod.gray.toFixed(3)})`);
        if (exit > 0.002) filters.push(`blur(${(18 * exit).toFixed(2)}px)`);
        m.wrap.style.filter = filters.join(" ") || "none";
        m.wrap.style.opacity = ((mod.opacity ?? 1) * (1 - exit)).toFixed(4);
        m.wrap.style.transform = `translate(${px(mod.x ?? 0)},${px((mod.y ?? 0) + (m.spec.exitY ?? -110) * exit)}) scale(${(mod.scale ?? 1).toFixed(4)})`;
      });
      breathe(t);
      cap(t);
      chapterBar(t);
    };
  }

  root.RS = { mount, blocks, ease, spring, shock, prog, clamp, lerp };
})(window);
