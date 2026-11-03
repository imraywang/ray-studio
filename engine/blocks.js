/* 解说片常用动作：层级开场、打字文档卡、张力曲线、结尾高潮、导流卡。都是时间 t 的纯函数 */
(function (RS) {
  const { ease, spring, prog, clamp, lerp } = RS;
  const el = (tag, cls, parent, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    if (parent) parent.appendChild(n);
    return n;
  };
  const blurOf = (v) => (v > 0.04 ? `blur(${v.toFixed(2)}px)` : "none");
  function focusIn(node, t, at, { dur = 0.6, blur = 16, y = 0, scale = 1.06 } = {}) {
    const k = ease.expo(prog(t, at, at + dur));
    node.style.opacity = t < at ? 0 : k;
    node.style.filter = blurOf(blur * (1 - k));
    node.style.transform = `translateY(${(y * (1 - k)).toFixed(2)}px) scale(${lerp(scale, 1, k).toFixed(4)})`;
  }
  const popIn = (node, t, at, { from = 0.6, freq = 17, decay = 8 } = {}) => {
    const s = t - at;
    node.style.opacity = s <= 0 ? 0 : clamp(s / 0.08);
    node.style.transform = `scale(${(s <= 0 ? from : lerp(from, 1, spring(s, freq, decay))).toFixed(4)})`;
  };
  /* 把 "不是，*重点*" 拆成单字：*包住的是重点，strike 标记要被划掉的短语 */
  function chars(parent, text, strike) {
    const list = [];
    const parts = text.split("*");
    parts.forEach((seg, i) => {
      let host = parent;
      if (i % 2 === 1) host = el("em", "rs-em", parent);
      /* 标点粘在前一个字上，不会单独掉到行首 */
      const addRun = (run, into) =>
        [...run].forEach((c) => {
          if (list.length && /[，。？！、：；）》”]/.test(c)) list[list.length - 1].textContent += c;
          else list.push(el("span", "rs-tc", into, c === " " ? "&nbsp;" : c));
        });
      if (strike && seg.includes(strike)) {
        const [a, b] = seg.split(strike);
        addRun(a, host);
        const box = el("span", "rs-sk", host);
        addRun(strike, box);
        addRun(b, host);
      } else addRun(seg, host);
    });
    return list;
  }
  const rise = (c, t, at) => {
    const k = ease.out3(prog(t, at, at + 0.22));
    c.style.opacity = t < at ? 0 : k;
    c.style.transform = `translateY(${(14 * (1 - k)).toFixed(2)}px)`;
    c.style.filter = blurOf(6 * (1 - k));
  };
  RS.kit = { el, focusIn, popIn, rise, chars };

  /* 层级开场：梯子亮起这一层，镜头扎进这一格；左边留一架小梯子当进度条 */
  RS.blocks.levelIntro = (b, ctx) => {
    const node = el("div", "rs-level", ctx.stage);
    const big = el("div", "rs-ladder rs-level-big", node);
    const inner = el("div", "rs-dive", big);
    const H = 88;
    const GAP = 18;
    const n = b.items.length;
    const cur = b.level - 1;
    const hold = b.hold ?? 1.25;
    [0, 1].forEach((i) => el("div", `rs-rail ${i ? "rs-rail-r" : "rs-rail-l"}`, inner));
    let curBody = null;
    let shine = null;
    b.items.forEach((label, i) => {
      const p = el("div", "rs-plate", inner);
      p.style.top = `${(n - 1 - i) * (H + GAP)}px`;
      const body = el("div", `rs-plate-body${i === cur ? " is-on" : ""}`, p, `<b>第 ${i + 1} 层</b><span>${label}</span>`);
      if (i < cur) body.style.opacity = 0.55;
      if (i > cur) body.style.opacity = 0.4;
      if (i === cur) {
        curBody = body;
        body.style.overflow = "hidden";
        shine = el("i", "rs-shine", body);
      }
    });
    const cy = (n - 1 - cur) * (H + GAP) + H / 2;
    inner.style.transformOrigin = `350px ${cy}px`;
    const mini = el("div", "rs-mini", node);
    b.items.forEach((_, i) => {
      const r = el("div", `rs-mini-r${i === cur ? " is-on" : ""}${i < cur ? " is-past" : ""}`, mini, String(i + 1));
      r.style.top = `${(n - 1 - i) * 60}px`;
    });
    return {
      node,
      parts: [mini],
      lands: [{ t: 0.28, weight: 0.7 }, { t: hold + 0.46, weight: 0.9 }],
      render(t) {
        const dive = ease.in3(prog(t, hold, hold + 0.5));
        focusIn(big, t, 0, { dur: 0.55, blur: 14, scale: 0.92 });
        big.style.opacity = Number(big.style.opacity) * (1 - dive);
        big.style.visibility = dive >= 1 ? "hidden" : "visible";
        inner.style.transform = `scale(${lerp(1, 3.6, dive).toFixed(4)})`;
        inner.style.filter = blurOf(16 * dive);
        const pop = t < 0.28 ? 0.84 : lerp(0.84, 1, spring(t - 0.28, 18, 8));
        curBody.style.transform = `scale(${pop.toFixed(4)})`;
        shine.style.transform = `translateX(${lerp(-200, 760, ease.inOut(prog(t, 0.5, 1.1))).toFixed(1)}px) skewX(-18deg)`;
        focusIn(mini, t, hold + 0.4, { dur: 0.6, blur: 12, scale: 1.2 });
      },
    };
  };

  /* 打字文档卡：字跟着口播一个个浮上来。支持配图、划掉一个短语、选项、图标、封面 */
  RS.blocks.doc = (b, ctx) => {
    const node = el("div", `rs-doc-wrap${b.wide ? " is-wide" : ""}`, ctx.stage);
    const card = el("div", "rs-doc", node);
    if (b.head) el("div", "rs-doc-hd", card, b.head);
    const updates = [];
    const lands = [];
    let jolt = null;
    for (const it of b.items) {
      if (it.type === "text") {
        const p = el("p", `rs-doc-p${it.dim ? " is-dim" : ""}${it.big ? " is-big" : ""}`, card);
        if (it.static) {
          p.textContent = it.static;
          continue;
        }
        const strikeText = it.strike && it.strike.phrase;
        const list = chars(p, it.text, strikeText);
        const span = Math.max(it.to - it.from, 0.2);
        const skBox = p.querySelector(".rs-sk");
        let line = null;
        if (skBox) line = el("i", "rs-sk-line", skBox);
        updates.push((t) => {
          list.forEach((c, i) => rise(c, t, it.from + (span * i) / Math.max(1, list.length - 1 || 1)));
          if (line) {
            const a = it.strike.at;
            line.style.transform = `scaleX(${ease.out3(prog(t, a, a + 0.22)).toFixed(4)})`;
            p.style.opacity = (1 - 0.5 * prog(t, a + 0.1, a + 0.3)).toFixed(3);
          }
        });
        if (it.strike) {
          lands.push({ t: it.strike.at, weight: 1.3 });
          jolt = it.strike.at;
        }
      } else if (it.type === "img") {
        const im = el("img", "rs-doc-img", card);
        im.src = it.src;
        if (it.height) im.style.height = `${it.height}px`;
        updates.push((t) => focusIn(im, t, it.at, { dur: 0.6, blur: 12, scale: 1.08 }));
      } else if (it.type === "choice") {
        const row = el("div", "rs-choice", card);
        const opts = it.options.map((o, i) => ({ o, n: el("div", `rs-opt${i === 0 ? " is-a" : ""}`, row, o.label) }));
        updates.push((t) => opts.forEach(({ o, n }) => popIn(n, t, o.at)));
        it.options.forEach((o) => lands.push({ t: o.at + 0.04, weight: 0.5 }));
      } else if (it.type === "feature") {
        /* 左封面右金句：判断要落在一张真实封面旁边 */
        const row = el("div", "rs-feature", card);
        const cover = el("img", "rs-feature-cover", row);
        cover.src = it.cover;
        const right = el("div", "rs-feature-q", row);
        const list = chars(right, it.quote);
        const span = Math.max(it.to - it.from, 0.2);
        const sig = el("div", "rs-feature-sig", right, it.sign || "");
        updates.push((t) => {
          const k = ease.expo(prog(t, it.coverAt, it.coverAt + 0.7));
          cover.style.opacity = t < it.coverAt ? 0 : k;
          cover.style.filter = blurOf(14 * (1 - k));
          cover.style.transform = `rotate(${(-6 * (1 - k)).toFixed(3)}deg) scale(${lerp(1.15, 1, k).toFixed(4)})`;
          list.forEach((c, i) => rise(c, t, it.from + (span * i) / Math.max(1, list.length - 1)));
          focusIn(sig, t, it.to, { dur: 0.5, blur: 10, scale: 1 });
        });
      } else if (it.type === "icons") {
        const row = el("div", "rs-icons", card);
        const cells = it.icons.map((o) => ({ o, n: el("div", "rs-icon", row, o.svg) }));
        updates.push((t) => cells.forEach(({ o, n }) => popIn(n, t, o.at, { from: 0.7 })));
        it.icons.forEach((o) => lands.push({ t: o.at + 0.04, weight: 0.5 }));
      } else if (it.type === "pull") {
        /* 先把人往一个方向带，再一把拽回来 */
        const box = el("div", "rs-pull", card, '<i class="rs-pull-line"></i><i class="rs-pull-head"></i>');
        const line = box.children[0];
        const head = box.children[1];
        updates.push((t) => {
          const go = ease.out3(prog(t, it.go, it.yank));
          const back = spring(t - it.yank, 15, 7.5);
          const x = t < it.yank ? go * 470 : lerp(470, 60, back);
          /* 前进时线从起点长出去；被拽回时线尾留在远端，箭头拖着线往回走 */
          line.style.left = `${(t < it.yank ? 0 : x).toFixed(1)}px`;
          line.style.width = `${Math.max(0, t < it.yank ? x : 470 - x).toFixed(1)}px`;
          head.style.transform = `translateX(${x.toFixed(1)}px) rotate(${t < it.yank ? 45 : -135}deg)`;
          const on = prog(t, it.go - 0.2, it.go);
          box.style.opacity = (on * (1 - prog(t, it.out, it.out + 0.3))).toFixed(3);
        });
        lands.push({ t: it.yank, weight: 1.4 });
      }
    }
    let badge = null;
    if (b.checkAt !== undefined) {
      badge = el("div", "rs-check rs-doc-check", card, '<svg viewBox="0 0 24 24"><path pathLength="1" d="M5 12.5 10 17.5 19 7"/></svg>');
      lands.push({ t: b.checkAt, weight: 0.5 });
    }
    const tick = badge && badge.querySelector("path");
    return {
      node,
      parts: [node],
      lands,
      render(t) {
        focusIn(node, t, b.at, { dur: 0.7, blur: 18, y: 0, scale: 1.12 });
        updates.forEach((u) => u(t));
        const s = jolt === null ? -1 : t - jolt;
        const j = s > 0 && s < 0.5 ? 24 * Math.sin(s * 42) * Math.exp(-s * 9) : 0;
        card.style.transform = `translateX(${j.toFixed(2)}px) rotate(${(j * 0.05).toFixed(3)}deg)`;
        if (badge) {
          badge.style.opacity = t < b.checkAt ? 0 : 1;
          badge.style.transform = `scale(${(t < b.checkAt ? 0 : spring(t - b.checkAt, 17, 8)).toFixed(4)})`;
          tick.style.strokeDashoffset = 1 - ease.out3(prog(t, b.checkAt + 0.12, b.checkAt + 0.36));
        }
      },
    };
  };

  /* 张力曲线：亮笔尖走在最前，跟着台词到每个节点，节点弹出、标签浮现 */
  RS.blocks.curve = (b, ctx) => {
    const NS = "http://www.w3.org/2000/svg";
    const node = el("div", "rs-doc-wrap", ctx.stage);
    const card = el("div", "rs-doc rs-curve", node);
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 690 560");
    const make = (tag, attrs, parent = svg) => {
      const n = document.createElementNS(NS, tag);
      Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
      parent.appendChild(n);
      return n;
    };
    const defs = make("defs", {});
    const clip = make("clipPath", { id: `${b.id}-reveal` }, defs);
    const clipRect = make("rect", { x: 0, y: 0, width: 0, height: 560 }, clip);
    make("line", { x1: 50, y1: 480, x2: 650, y2: 480, style: "stroke:var(--well)", "stroke-width": 4 });
    make("path", { d: `${b.path} L 650 480 L 50 480 Z`, style: "fill:var(--accent)", opacity: 0.1, "clip-path": `url(#${b.id}-reveal)` });
    const curve = make("path", { d: b.path, style: "fill:none;stroke:var(--accent)", "stroke-width": 8, "stroke-linecap": "round", "clip-path": `url(#${b.id}-reveal)` });
    const halo = make("circle", { r: 24, style: "fill:var(--accent)", opacity: 0 });
    const tip = make("circle", { r: 10, style: "fill:var(--accent)", opacity: 0 });
    card.appendChild(svg);
    const total = curve.getTotalLength();
    const lengthAtX = (x) => {
      let lo = 0;
      let hi = total;
      for (let i = 0; i < 24; i++) {
        const m = (lo + hi) / 2;
        if (curve.getPointAtLength(m).x < x) lo = m;
        else hi = m;
      }
      return (lo + hi) / 2;
    };
    const stops = b.route.map((s) => ({ ...s, len: lengthAtX(s.x), pt: curve.getPointAtLength(lengthAtX(s.x)) }));
    const marks = stops
      .filter((s) => s.mark)
      .map((s) => {
        const dot = make("circle", { cx: s.pt.x, cy: s.pt.y, r: 14, style: `fill:var(${s.dark ? "--ink" : "--accent"})`, opacity: 0 });
        dot.style.transformOrigin = `${s.pt.x}px ${s.pt.y}px`;
        const tag = s.tag ? el("div", `rs-tag${s.dark ? " is-dark" : ""}`, card, s.tag) : null;
        if (tag) {
          tag.style.left = `${s.pt.x + (s.tagDx ?? -30)}px`;
          tag.style.top = `${s.pt.y + (s.tagDy ?? -82)}px`;
        }
        return { s, dot, tag };
      });
    const xAt = (t) => {
      if (t <= stops[0].at) return stops[0].x;
      for (let i = 1; i < stops.length; i++) {
        if (t < stops[i].at) return lerp(stops[i - 1].x, stops[i].x, ease.inOut(prog(t, stops[i - 1].at, stops[i].at)) * 0.35 + prog(t, stops[i - 1].at, stops[i].at) * 0.65);
      }
      return stops[stops.length - 1].x;
    };
    return {
      node,
      parts: [node],
      lands: stops.filter((s) => s.land).map((s) => ({ t: s.at, weight: 1.4 })),
      render(t) {
        focusIn(node, t, b.at, { dur: 0.7, blur: 18, scale: 1.12 });
        const x = xAt(t);
        clipRect.setAttribute("width", Math.max(0, x + 8).toFixed(2));
        const pt = curve.getPointAtLength(lengthAtX(x));
        const on = prog(t, stops[0].at - 0.1, stops[0].at + 0.1) * (1 - prog(t, stops[stops.length - 1].at, stops[stops.length - 1].at + 0.3));
        tip.setAttribute("cx", pt.x.toFixed(2));
        tip.setAttribute("cy", pt.y.toFixed(2));
        tip.setAttribute("opacity", on.toFixed(3));
        halo.setAttribute("cx", pt.x.toFixed(2));
        halo.setAttribute("cy", pt.y.toFixed(2));
        halo.setAttribute("opacity", (0.28 * on).toFixed(3));
        marks.forEach(({ s, dot, tag }) => {
          const u = t - s.at;
          dot.setAttribute("opacity", u > 0 ? 1 : 0);
          dot.style.transform = `scale(${(u > 0 ? spring(u, 18, 7) : 0).toFixed(4)})`;
          if (tag) popIn(tag, t, s.tagAt ?? s.at, { from: 0.7 });
        });
        const land = stops.find((s) => s.land);
        const u = land ? t - land.at : -1;
        const pulse = u > 0 ? 0.04 * Math.exp(-u * 7) * Math.cos(u * 22) : 0;
        card.style.transform = `scale(${(1 + pulse).toFixed(4)})`;
      },
    };
  };

  /* 能数出来的比例：一百个点先全亮，再按比例熄灭，只留下真正命中的那几个 */
  RS.blocks.tally = (b, ctx) => {
    const node = el("div", "rs-tally", ctx.stage);
    const grid = el("div", "rs-tally-grid", node);
    const total = b.total ?? 100;
    const dots = Array.from({ length: total }, () => el("i", "", grid));
    const big = el("div", "rs-tally-big", node, `<span>${b.value}</span><small>${b.unit || ""}</small>`);
    const label = b.label ? el("div", "rs-tally-label", node, b.label) : null;
    const miss = total - b.hit;
    return {
      node,
      parts: [node],
      lands: [{ t: b.land, weight: 1.5 }],
      render(t) {
        focusIn(node, t, b.at, { dur: 0.5, blur: 12, scale: 1.05 });
        dots.forEach((d, i) => {
          const on = prog(t, b.at + i * 0.006, b.at + 0.1 + i * 0.006);
          const off = i < miss ? ease.out3(prog(t, b.fade + (i / miss) * (b.land - b.fade), b.fade + (i / miss) * (b.land - b.fade) + 0.12)) : 0;
          d.style.opacity = (on * (1 - 0.82 * off)).toFixed(3);
          d.style.background = i >= miss && t >= b.land ? "var(--accent)" : "var(--ink)";
          const keep = i >= miss && t >= b.land ? 1 + 0.5 * Math.exp(-(t - b.land) * 7) * Math.cos((t - b.land) * 20) : 1;
          d.style.transform = `scale(${keep.toFixed(3)})`;
        });
        const k = prog(t, b.fade, b.land);
        const s = t - b.land;
        big.style.opacity = k > 0 ? 1 : 0;
        if (label) label.style.opacity = k > 0 ? clamp(k * 6) : 0;
        big.firstChild.textContent = String(Math.round(b.value * ease.out3(k)));
        big.style.transform = `scale(${(s > 0 ? 1 + 0.12 * Math.exp(-s * 10) * Math.cos(s * 24) : 1).toFixed(4)})`;
      },
    };
  };

  /* 口播页的白卡：一句判断逐字浮上来 */
  RS.blocks.lower = (b, ctx) => {
    const node = el("div", "rs-lower", ctx.stage);
    const list = chars(node, b.text);
    const end = b.to ?? b.at + list.length * 0.08;
    return {
      node,
      parts: [node],
      lands: [],
      render(t) {
        focusIn(node, t, b.at, { dur: 0.45, blur: 10, y: 16, scale: 0.98 });
        list.forEach((c, i) => rise(c, t, b.at + ((end - b.at) * i) / Math.max(1, list.length - 1)));
      },
    };
  };

  /* 真实录屏：放进带窗口栏的画框。focus 让镜头推到一处，label 贴一句人话。视频元素由 rs 静态写进场景 */
  RS.blocks.screen = (b, ctx) => {
    const node = el("div", `rs-screen${b.wide === false ? "" : " is-wide"}${b.paper ? " is-paper" : ""}`, ctx.stage);
    if (b.top !== undefined) node.style.top = `${b.top}px`;
    if (b.above) el("div", "rs-screen-above", node, b.above);
    const bar = el("div", "rs-screen-bar", node, "<i></i><i></i><i></i>");
    if (b.tab) el("span", "", bar, b.tab);
    const view = el("div", "rs-screen-view", node);
    const inner = el("div", "rs-screen-inner", view);
    const media = b.video ? document.getElementById(b.domId) : el("img", "", inner);
    if (b.video) inner.appendChild(media);
    else media.src = b.src;
    media.classList.add("rs-screen-media");
    /* 长条截图写 fit: contain，四边留底色，不被裁掉；mark 的坐标都按画框算 */
    if (b.fit) media.style.objectFit = b.fit;
    if (b.matte) view.style.background = b.matte;
    const focus = (b.focus || []).slice().sort((x, y) => x.at - y.at);
    const labels = (b.labels || []).map((l) => {
      const n = el("div", `rs-screen-label${l.dark ? " is-dark" : ""}`, view, l.text);
      n.style.left = `${l.x}%`;
      n.style.top = `${l.y}%`;
      return { l, n };
    });
    /* mark 框在素材坐标上，跟着镜头一起动；说明文字不缩放，每帧按镜头算位置，贴在框的上下，不压内容 */
    const marks = (b.marks || []).map((m) => {
      const n = el("div", `rs-mark${m.pen ? " is-pen" : ""}`, inner);
      n.style.cssText = `left:${m.x}%;top:${m.y}%;width:${m.w}%;height:${m.h}%`;
      const dim = m.dim === false || m.pen ? null : el("i", "rs-mark-dim", n);
      const box = el("b", "rs-mark-box", n);
      const tag = m.text ? el("div", "rs-mark-tag", view, m.text) : null;
      return { m, n, dim, box, tag };
    });
    if (b.source) el("div", "rs-screen-src", node, b.source);
    const cam = (t) => {
      let cur = { x: 50, y: 50, zoom: 1 };
      for (const f of focus) {
        if (t < f.at) break;
        const k = ease.inOut(prog(t, f.at, f.at + (f.dur ?? 0.6)));
        cur = { x: lerp(cur.x, f.x, k), y: lerp(cur.y, f.y, k), zoom: lerp(cur.zoom, f.zoom ?? 1.8, k) };
      }
      return cur;
    };
    return {
      node,
      parts: [node],
      lands: focus.filter((f) => f.land).map((f) => ({ t: f.at + (f.dur ?? 0.6), weight: 0.8 })),
      render(t) {
        const toView = (v, origin, scale) => origin + (v - origin) * scale;
        if (ctx.hardCut) {
          node.style.opacity = t < b.at ? 0 : 1;
        } else focusIn(node, t, b.at, { dur: 0.6, blur: 18, y: 30, scale: 1.05 });
        const c = cam(t);
        const drift = 1 + 0.03 * prog(t, b.at, b.exit ?? ctx.dur);
        inner.style.transformOrigin = `${c.x}% ${c.y}%`;
        const scale = c.zoom * drift;
        inner.style.transform = `scale(${scale.toFixed(4)})`;
        marks.forEach(({ m, n, dim, box, tag }) => {
          const off = m.to === undefined ? 1 : 1 - prog(t, m.to, m.to + 0.25);
          const k = ease.out3(prog(t, m.at, m.at + 0.35));
          n.style.opacity = t < m.at ? 0 : off;
          box.style.clipPath = `inset(-8px ${(100 * (1 - k)).toFixed(2)}% -8px -8px)`;
          if (dim) dim.style.opacity = k;
          if (!tag) return;
          const left = toView(m.x + m.w / 2, c.x, scale);
          const top = toView(m.y, c.y, scale);
          const bottom = toView(m.y + m.h, c.y, scale);
          const below = bottom < 72;
          const u = t - (m.at + 0.2);
          tag.style.left = `${clamp(left, 16, 84).toFixed(2)}%`;
          tag.style.top = `${clamp(below ? bottom + 2 : top - 2, 8, 84).toFixed(2)}%`;
          tag.style.opacity = u <= 0 ? 0 : clamp(u / 0.15) * off;
          tag.style.transform = `translate(-50%,${below ? "0" : "-100%"}) translateY(${(10 * (1 - ease.out3(clamp(u / 0.25)))).toFixed(2)}px)`;
        });
        labels.forEach(({ l, n }) => {
          const u = t - l.at;
          n.style.opacity = u <= 0 ? 0 : clamp(u / 0.08);
          n.style.transform = `translate(-50%,-50%) scale(${(u <= 0 ? 0.7 : lerp(0.7, 1, spring(u, 18, 8))).toFixed(4)})`;
        });
      },
    };
  };

  /* 单据画板：把「一条条、一张张」的手工活演出来。填表、逐个走过、某一项被标出来，都按台词 */
  RS.blocks.sheet = (b, ctx) => {
    const node = el("div", `rs-sheet is-${b.cards ? "cards" : "rows"}`, ctx.stage);
    if (b.top !== undefined) node.style.top = `${b.top}px`;
    const head = el("div", "rs-sheet-hd", node);
    const heads = chars(head, b.head);
    if (b.note) el("div", "rs-sheet-note", node, b.note);
    const body = el("div", "rs-sheet-body", node);
    const items = (b.cards || b.rows).map((it) => {
      const n = el("div", "rs-sheet-item", body);
      if (b.cards) {
        el("div", "rs-sheet-title", n, it.title);
        const value = el("div", "rs-sheet-value", n, it.value);
        return { n, value };
      }
      const cells = el("div", "rs-sheet-cells", n);
      it.cells.forEach((c) => el("span", "", cells, c));
      const check = el("div", "rs-sheet-check", n, '<svg viewBox="0 0 24 24"><path d="M4 13l5 5L20 6" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>');
      return { n, cells, check };
    });
    const count = items.length;
    const flags = (b.flags || []).map((f) => ({ ...f, n: el("div", "rs-sheet-flag", items[f.item].n, f.text) }));
    const walks = b.walks || [];
    const fill = b.fill || { from: b.at, to: b.at };
    const fillAt = (i) => fill.from + ((fill.to - fill.from) * i) / Math.max(1, count - 1);
    const bounce = ctx.motion?.bounce ?? 1;
    return {
      node,
      parts: [node],
      lands: flags.map((f) => ({ t: f.at, weight: 0.8 })),
      render(t) {
        focusIn(node, t, b.at, { dur: 0.5, blur: 12, y: 24, scale: 1.02 });
        const headEnd = b.headTo ?? b.at + 0.4;
        heads.forEach((c, i) => rise(c, t, b.at + ((headEnd - b.at) * i) / Math.max(1, heads.length - 1)));
        const hit = flags.reduce((v, f) => (t >= f.at ? f.at : v), -1);
        const s = hit < 0 ? 0 : t - hit;
        node.style.translate = hit < 0 || !bounce ? "0 0" : `${(9 * bounce * Math.sin(s * 44) * Math.exp(-s * 8)).toFixed(2)}px 0`;
        items.forEach((it, i) => {
          const u = t - fillAt(i);
          it.n.classList.toggle("is-empty", u <= 0);
          const k = ease.out3(clamp(u / 0.22));
          const inner = it.cells || it.n;
          if (it.cells) {
            inner.style.opacity = u <= 0 ? 0 : k;
            inner.style.transform = `translateY(${(10 * (1 - k)).toFixed(2)}px)`;
          } else {
            it.n.style.opacity = u <= 0 ? 0.28 : lerp(0.28, 1, k);
          }
          let on = 0;
          let done = false;
          let shown = false;
          for (const w of walks) {
            const step = (w.to - w.from) / count;
            const pos = w.reverse ? count - 1 - i : i;
            const a = w.from + step * pos;
            if (t >= a) {
              if (w.tick) done = true;
              if (w.reveal) shown = true;
              if (t < a + step) on = 1;
            }
          }
          it.n.classList.toggle("is-on", on === 1);
          if (it.check) it.check.style.opacity = done ? 1 : 0;
          if (it.value) it.value.style.opacity = !walks.some((w) => w.reveal) || shown ? 1 : 0;
          it.n.classList.toggle("is-flag", flags.some((f) => f.item === i && t >= f.at));
        });
        flags.forEach((f, j) => {
          const next = flags.slice(j + 1).find((g) => g.item === f.item);
          const live = t >= f.at && (!next || t < next.at);
          f.n.style.opacity = live ? ease.out3(prog(t, f.at, f.at + 0.15)) : 0;
        });
      },
    };
  };

  /* 真实画面：截图或照片虚焦进场，整段缓慢推近，下面带来源 */
  RS.blocks.figure = (b, ctx) => {
    const node = el("div", "rs-figure", ctx.stage);
    const frame = el("div", "rs-figure-frame", node);
    const im = el("img", "", frame);
    im.src = b.src;
    if (b.pos) im.style.objectPosition = b.pos;
    if (b.fit !== "cover") im.className = "is-contain";
    if (b.source) el("div", "rs-figure-src", node, b.source);
    const end = b.exit ?? ctx.dur;
    return {
      node,
      parts: [node],
      lands: [],
      render(t) {
        focusIn(node, t, b.at, { dur: 0.7, blur: 20, scale: 1.08 });
        im.style.transform = `scale(${lerp(1, 1.06, prog(t, b.at, end)).toFixed(4)})`;
      },
    };
  };

  /* 全片唯一一次高潮：五格依次点亮，背后放射光，最后镜头扎进去 */
  RS.blocks.climax = (b, ctx) => {
    const node = el("div", "rs-level", ctx.stage);
    const rays = el("div", "rs-rays", node);
    for (let i = 0; i < 16; i++) el("i", "", rays).style.transform = `rotate(${i * 22.5}deg)`;
    const big = el("div", "rs-ladder rs-level-big", node);
    const inner = el("div", "rs-dive", big);
    inner.style.transformOrigin = "350px 256px";
    [0, 1].forEach((i) => el("div", `rs-rail ${i ? "rs-rail-r" : "rs-rail-l"}`, inner));
    const n = b.items.length;
    const plates = b.items.map((label, i) => {
      const p = el("div", "rs-plate", inner);
      p.style.top = `${(n - 1 - i) * 106}px`;
      return el("div", "rs-plate-body", p, `<b>第 ${i + 1} 层</b><span>${label}</span>`);
    });
    return {
      node,
      parts: [],
      lands: plates.map((_, i) => ({ t: b.lit + i * 0.12, weight: 0.45 })),
      render(t) {
        const dive = ease.in3(prog(t, b.dive, b.dive + 0.45));
        focusIn(big, t, b.at, { dur: 0.6, blur: 14, scale: 0.92 });
        big.style.opacity = Number(big.style.opacity) * (1 - dive);
        big.style.visibility = dive >= 1 ? "hidden" : "visible";
        inner.style.transform = `scale(${lerp(1, 2.8, dive).toFixed(4)})`;
        inner.style.filter = blurOf(16 * dive);
        plates.forEach((p, i) => {
          const at = b.lit + i * 0.12;
          p.classList.toggle("is-on", t >= at);
          p.style.transform = `scale(${(t < at ? 1 : 1 + 0.06 * Math.exp(-(t - at) * 9) * Math.cos((t - at) * 24)).toFixed(4)})`;
        });
        const r = ease.expo(prog(t, b.burst, b.burst + 0.8));
        rays.style.opacity = (0.32 * r * (1 - dive)).toFixed(3);
        rays.style.transform = `translate(-50%,-50%) rotate(${(-10 + 10 * r + Math.max(0, t - b.burst) * 6).toFixed(2)}deg) scale(${lerp(0.5, 1, r).toFixed(4)})`;
      },
    };
  };

  /* 导流：墨绿卡说动作，巨号关键词落下来，小字说明换来什么 */
  RS.blocks.cta = (b, ctx) => {
    const node = el("div", "rs-cta", ctx.stage);
    const card = el("div", "rs-cta-card", node, b.action);
    const kw = el("div", "rs-cta-kw", node, b.keyword);
    const sub = el("div", "rs-cta-sub", node, b.reward);
    return {
      node,
      parts: [card, sub],
      lands: [{ t: b.kwAt, weight: 1.6 }],
      render(t) {
        focusIn(card, t, b.at, { dur: 0.6, blur: 20, y: 80, scale: 1.1 });
        const s = t - b.kwAt;
        kw.style.opacity = s <= 0 ? 0 : clamp(s / 0.06);
        kw.style.transform = `scale(${(s <= 0 ? 1.8 : lerp(1.8, 1, spring(s, 16, 8))).toFixed(4)})`;
        focusIn(sub, t, b.subAt, { dur: 0.5, blur: 10, y: 20, scale: 1 });
      },
    };
  };
})(window.RS);
