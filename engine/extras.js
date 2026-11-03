/* 旧风格库迁来的动作：新闻快切、银色标题、大字、饼图、走势线、地铁图、节点路径、编号卡等。都是时间 t 的纯函数 */
(function (RS) {
  const { ease, spring, prog, clamp, lerp, kit } = RS;
  const { el, focusIn, popIn, rise } = kit;
  const NS = "http://www.w3.org/2000/svg";
  const svgEl = (tag, attrs, parent) => {
    const n = document.createElementNS(NS, tag);
    Object.entries(attrs || {}).forEach(([k, v]) => n.setAttribute(k, v));
    if (parent) parent.appendChild(n);
    return n;
  };
  const inline = (s) => String(s).replace(/\*(.+?)\*/g, "<em>$1</em>");
  /* 结尾的问号、逗号挂在行外，整行按文字居中 */
  const hang = (s) => String(s).replace(/([？，。！])$/, '<u class="rs-hang">$1</u>');
  const simple = (node, render, lands = [], parts = [node]) => ({ node, parts, lands, render });
  const fmt = (v, d = 0) => v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const dimLayer = (b, parent) => {
    if (!b.dim) return () => {};
    const n = el("div", "rs-x-dim", parent);
    return (t) => (n.style.opacity = ease.out3(prog(t, b.at, b.at + 0.3)) * (b.dim === true ? 1 : b.dim));
  };
  /* 从 1.25 倍缩回，字落定。不回弹的风格里只是收得干净 */
  const landIn = (n, t, at, from = 1.25) => {
    const k = ease.expo(prog(t, at, at + 0.5));
    n.style.opacity = t < at ? 0 : clamp((t - at) / 0.12);
    n.style.transform = `scale(${lerp(from, 1, k).toFixed(4)})`;
  };
  const growX = (n, t, at, dur = 0.45) => (n.style.transform = `scaleX(${ease.out3(prog(t, at, at + dur)).toFixed(4)})`);

  /* 新闻快切：底下的画面硬切，上面的字和卡片不动。视频元素由 rs 静态写进场景 */
  RS.blocks.news = (b, ctx) => {
    const node = el("div", "rs-news", ctx.stage);
    const shots = b.clips.map((c, i) => {
      const n = el("div", "rs-news-shot", node);
      const media = c.video ? document.getElementById(c.domId) : el("img", "", n);
      if (c.video) n.appendChild(media);
      else media.src = c.src;
      if (c.pos) media.style.objectPosition = c.pos;
      if (c.fit) media.style.objectFit = c.fit;
      if (c.bg) n.style.background = c.bg;
      if (c.dim) el("div", "rs-x-dim is-on", n).style.opacity = c.dim === true ? 1 : c.dim;
      if (c.source) el("div", "rs-news-src", n, c.source);
      const next = b.clips[i + 1];
      return { c, n, media, end: next ? next.at : Infinity };
    });
    return simple(node, (t) => {
      shots.forEach(({ c, n, media, end }) => {
        const on = t >= c.at && t < end;
        n.style.visibility = on ? "visible" : "hidden";
        /* 要和抠像对齐的镜头不能推近 */
        if (on && !c.still) media.style.transform = `scale(${(1 + 0.04 * clamp((t - c.at) / Math.max(1, (end === Infinity ? ctx.dur : end) - c.at))).toFixed(4)})`;
      });
    }, [], []);
  };

  /* 银色标题：章节开头和关键数字。上一行小字引子，下一行英文小字 */
  RS.blocks.silver = (b, ctx) => {
    const node = el("div", `rs-x rs-silver${b.dim ? " on-dark" : ""}`, ctx.stage);
    const dim = dimLayer(b, node);
    const k = b.kicker ? el("div", "rs-silver-k", node, b.kicker) : null;
    const main = el("div", "rs-silver-t", node, b.text);
    const e = b.en ? el("div", "rs-silver-e", node, b.en) : null;
    return simple(node, (t) => {
      dim(t);
      if (k) rise(k, t, b.at);
      landIn(main, t, b.at + 0.1, 1.12);
      if (e) rise(e, t, b.at + 0.4);
    }, [{ t: b.at + 0.3, weight: 0.7 }], [main]);
  };

  /* 大字：一句结论。sides 把字分在人的左右两边 */
  RS.blocks.big = (b, ctx) => {
    const node = el("div", `rs-x rs-big${b.sides ? " is-sides" : ""}${b.dim ? " on-dark" : ""}${b.onFace ? " on-face" : ""}`, ctx.stage);
    const dim = dimLayer(b, node);
    const k = b.kicker ? el("div", "rs-big-k", node, b.kicker) : null;
    const words = (b.sides || [b.text]).map((s) => {
      const n = el("div", "rs-big-w", node, hang(inline(s)));
      if (b.size) n.style.setProperty("--size", b.size);
      return n;
    });
    return simple(node, (t) => {
      dim(t);
      if (k) rise(k, t, b.at);
      words.forEach((w, i) => landIn(w, t, b.at + (b.sides ? i * (b.gap ?? 0.25) : 0)));
    }, [{ t: b.at + 0.25, weight: 0.8 }], words);
  };

  /* 书法大字：对立的两个词、结尾问句 */
  RS.blocks.brush = (b, ctx) => {
    const node = el("div", `rs-x rs-brush${b.dim ? " on-dark" : ""}${b.sides ? " is-sides" : ""}`, ctx.stage);
    const dim = dimLayer(b, node);
    const words = (b.sides || [b.text]).map((s) => el("div", "rs-brush-w", node, hang(s)));
    return simple(node, (t) => {
      dim(t);
      words.forEach((w, i) => landIn(w, t, b.at + i * (b.gap ?? 0.35), 1.15));
    }, [], words);
  };

  /* 荧光笔：色块从左往右刷出来，字在色块上面 */
  RS.blocks.highlight = (b, ctx) => {
    const node = el("div", `rs-x rs-hl${b.dim ? " on-dark" : ""}`, ctx.stage);
    const dim = dimLayer(b, node);
    const box = el("div", "rs-hl-t", node, hang(String(b.text).replace(/\*(.+?)\*/g, '<span class="rs-hlw"><i></i><b>$1</b></span>')));
    const marks = [...box.querySelectorAll("i")];
    return simple(node, (t) => {
      dim(t);
      focusIn(box, t, b.at, { dur: 0.5, blur: 8, scale: 1.03 });
      marks.forEach((m) => growX(m, t, b.hlAt ?? b.at + 0.6, 0.4));
    }, [], [box]);
  };

  /* 收缩条：一条满格的条讲到那个词时缩没，再弹出结论 */
  RS.blocks.shrink = (b, ctx) => {
    const node = el("div", "rs-x rs-shrink", ctx.stage);
    const box = el("div", "rs-shrink-box", node);
    if (b.label) el("div", "rs-shrink-l", box, b.label);
    const bar = el("i", "", el("div", "rs-shrink-track", box));
    const out = b.value ? el("div", "rs-shrink-n", box, b.value) : null;
    return simple(node, (t) => {
      focusIn(box, t, b.at, { dur: 0.4, blur: 8, y: 16, scale: 1 });
      bar.style.transform = `scaleX(${lerp(1, b.pct ?? 0.015, ease.inOut(prog(t, b.land, b.land + 0.55))).toFixed(4)})`;
      if (out) popIn(out, t, b.land + 0.45);
    }, [{ t: b.land + 0.55, weight: 0.7 }], [box]);
  };

  /* 饼图：比例从 0 补到目标值，补满后才出说明 */
  RS.blocks.pie = (b, ctx) => {
    const node = el("div", "rs-x rs-pie-wrap", ctx.stage);
    const pie = el("div", "rs-pie", node);
    const num = el("b", "", pie);
    const label = b.label ? el("div", "rs-pie-l", node, inline(b.label)) : null;
    const dur = b.dur ?? 0.9;
    return simple(node, (t) => {
      focusIn(pie, t, b.at, { dur: 0.35, blur: 6, scale: 0.94 });
      const p = b.value * ease.inOut(prog(t, b.at + 0.1, b.at + 0.1 + dur));
      pie.style.setProperty("--p", p.toFixed(2));
      num.textContent = `${fmt(p, b.digits ?? 0)}%`;
      if (label) rise(label, t, b.at + 0.1 + dur);
    }, [{ t: b.at + 0.1 + dur, weight: 0.6 }], [pie]);
  };

  /* 数字卡：描边框，上一行说明，中间巨大数字，下一行来源。单位放右下角。bare 不要框 */
  RS.blocks.stat = (b, ctx) => {
    const node = el("div", "rs-x rs-stat-wrap", ctx.stage);
    const box = el("div", `rs-stat${b.bare ? " is-bare" : ""}`, node);
    if (b.size) box.style.setProperty("--size", b.size);
    if (b.key) el("div", "rs-stat-k", box, b.key);
    const row = el("div", "rs-stat-n", box);
    const num = el("span", "", row);
    if (b.unit) el("sub", "", row, b.unit);
    if (b.note) el("div", "rs-stat-d", box, b.note);
    const land = b.land ?? b.at + 1;
    const digits = b.digits ?? 0;
    return simple(node, (t) => {
      focusIn(box, t, b.at, { dur: 0.4, blur: 8, y: 16, scale: 1 });
      num.textContent = `${b.prefix || ""}${fmt(b.value * ease.out3(prog(t, b.countAt ?? b.at, land)), digits)}`;
    }, [{ t: land, weight: 0.8 }], [box]);
  };

  /* 走势线：真实数据画成折线，跟着解说一段段画出来，头上一个圆点。不实时显示数值，标签到那里才弹 */
  RS.blocks.chart = (b, ctx) => {
    const W = 1000, H = 520, PAD = 30;
    const pts = b.points;
    const lo = b.min ?? Math.min(...pts);
    const hi = b.max ?? Math.max(...pts);
    const xy = pts.map((v, i) => [PAD + ((W - 2 * PAD) * i) / (pts.length - 1), H - PAD - ((H - 2 * PAD) * (v - lo)) / (hi - lo || 1)]);
    const cum = [0];
    xy.forEach((p, i) => i && cum.push(cum[i - 1] + Math.hypot(p[0] - xy[i - 1][0], p[1] - xy[i - 1][1])));
    const node = el("div", "rs-x rs-chart-wrap", ctx.stage);
    const box = el("div", "rs-chart", node);
    if (b.title) el("div", "rs-chart-t", box, b.title);
    const plot = el("div", "rs-chart-plot", box);
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}` }, plot);
    if (b.line) {
      const y = H - PAD - ((H - 2 * PAD) * (b.line.value - lo)) / (hi - lo || 1);
      svgEl("line", { x1: PAD, x2: W - PAD, y1: y, y2: y, class: "rs-chart-base" }, svg);
      const tag = el("div", "rs-chart-tag is-base", plot, b.line.text);
      tag.style.left = "3%";
      tag.style.top = `${((y + 8) / H) * 100}%`;
    }
    const line = svgEl("polyline", { points: xy.map((p) => p.map((v) => v.toFixed(1)).join(",")).join(" "), class: "rs-chart-line" }, svg);
    line.style.strokeDasharray = cum.at(-1);
    const dot = svgEl("circle", { r: 9, class: "rs-chart-dot" }, svg);
    const labels = (b.labels || []).map((l) => {
      const n = el("div", "rs-chart-tag", plot, l.text);
      const [x, y] = xy[l.i];
      n.style.left = `${(x / W) * 100}%`;
      n.style.top = `${((y + (l.dy ?? -36)) / H) * 100}%`;
      return { l, n };
    });
    const segs = b.segments || [{ at: b.at, dur: 2, upto: pts.length - 1 }];
    const reach = (t) => {
      let i = 0;
      for (const s of segs) {
        if (t < s.at) break;
        i = lerp(i, s.upto, ease.inOut(prog(t, s.at, s.at + (s.dur ?? 1.5))));
      }
      return i;
    };
    const posAt = (f) => {
      const a = Math.floor(f);
      const c = Math.min(a + 1, pts.length - 1);
      const u = f - a;
      return { len: lerp(cum[a], cum[c], u), x: lerp(xy[a][0], xy[c][0], u), y: lerp(xy[a][1], xy[c][1], u) };
    };
    return simple(node, (t) => {
      focusIn(box, t, b.at, { dur: 0.4, blur: 8, y: 14, scale: 1 });
      const f = reach(t);
      const p = posAt(f);
      line.style.strokeDashoffset = (cum.at(-1) - p.len).toFixed(1);
      dot.setAttribute("cx", p.x.toFixed(1));
      dot.setAttribute("cy", p.y.toFixed(1));
      labels.forEach(({ l, n }) => (n.style.opacity = f >= l.i ? 1 : 0));
    }, [], [box]);
  };

  /* 纸钞：一切表示钱的符号。a、b 是百分比坐标，几张错开飞过去；没有 b 就是一张大钞 */
  RS.blocks.money = (b, ctx) => {
    const node = el("div", "rs-money", ctx.stage);
    const count = b.b ? (b.count ?? 5) : 1;
    const notes = Array.from({ length: count }, () => el("div", `rs-bn${b.b ? "" : " is-big"}`, node, `<i>${b.sign || "¥"}</i>`));
    const dur = b.dur ?? 0.8;
    const gap = b.stagger ?? 0.16;
    const [ax, ay] = b.a || [50, 45];
    const [bx, by] = b.b || [ax, ay];
    return simple(node, (t) => {
      notes.forEach((n, i) => {
        const at = b.at + i * gap;
        const k = ease.inOut(prog(t, at, at + dur));
        n.style.left = `${lerp(ax, bx, k).toFixed(2)}%`;
        n.style.top = `${lerp(ay, by, k).toFixed(2)}%`;
        n.style.opacity = t < at ? 0 : b.b ? clamp((t - at) / 0.1) * (1 - prog(t, at + dur - 0.1, at + dur)) : clamp((t - at) / 0.15);
        n.style.rotate = b.b ? `${(i % 2 ? 6 : -6) * Math.sin(k * 3.14)}deg` : "0deg";
      });
    }, [], []);
  };

  /* 地铁线路图：每章开头，第几站、走到哪了。纸钞路标从上一站滑到这一站，barrier 画被卡住的一段 */
  RS.blocks.metro = (b, ctx) => {
    const node = el("div", "rs-x rs-metro-wrap", ctx.stage);
    const hd = el("div", "rs-metro-hd", node);
    if (b.kicker) el("div", "rs-metro-k", hd, b.kicker);
    if (b.title) el("div", "rs-metro-t", hd, b.title);
    const map = el("div", "rs-metro", node);
    el("div", "rs-metro-rail", map);
    const lit = el("div", "rs-metro-rail is-lit", map);
    const n = b.stations.length;
    const X = (i) => 5 + (90 * i) / (n - 1);
    const whole = b.cur >= n;
    const from = whole ? 0 : Math.max(0, b.cur - 1);
    const dest = whole ? n - 1 : b.cur;
    if (b.barrier) {
      const bar = el("div", "rs-metro-barrier", map);
      bar.style.left = `${X(b.barrier[0]) + 1.5}%`;
      bar.style.width = `${X(b.barrier[1]) - X(b.barrier[0]) - 3}%`;
    }
    const stops = b.stations.map((name, i) => {
      const s = el("div", "rs-metro-st", map, `<b></b><span>${name}</span>`);
      s.style.left = `${X(i)}%`;
      return s;
    });
    const coin = el("div", "rs-bn is-coin", map, `<i>${b.sign || "¥"}</i>`);
    const move = b.at + 0.5;
    return simple(node, (t) => {
      rise(hd, t, b.at);
      node.style.opacity = t < b.at ? 0 : 1;
      map.style.opacity = ease.out3(prog(t, b.at, b.at + 0.3));
      const k = ease.inOut(prog(t, move, move + 0.8));
      const x = lerp(X(from), X(dest), k);
      lit.style.width = `${(x - X(0)).toFixed(2)}%`;
      coin.style.left = `${x.toFixed(2)}%`;
      stops.forEach((s, i) => {
        const here = !whole && i === dest && k >= 1;
        s.classList.toggle("is-cur", here);
        s.classList.toggle("is-on", i < dest || (whole && k >= 1) || (whole && i <= from));
      });
    }, [], [hd]);
  };

  /* 玻璃气泡：讲到哪个哪个亮，其余压暗；箭头从前一个长到后一个，下面可挂价签 */
  RS.blocks.bubbles = (b, ctx) => {
    const node = el("div", "rs-x rs-bubs-wrap", ctx.stage);
    const row = el("div", "rs-bubs", node);
    if (b.size) row.style.setProperty("--bub", b.size);
    const items = b.items.map((it, i) => {
      const arrow = i ? el("i", "rs-arrow", row) : null;
      const cell = el("div", "rs-bub-cell", row);
      const bub = el("div", "rs-bub", cell, `<span>${inline(it.text)}</span>`);
      const tag = it.tag ? el("div", "rs-ptag", cell, `<em>${it.tag[0]}</em><b>${it.tag[1]}</b>`) : null;
      return { it, arrow, cell, bub, tag };
    });
    return simple(node, (t) => {
      const cur = items.reduce((v, x, i) => (t >= x.it.at ? i : v), -1);
      const all = b.allAt !== undefined && t >= b.allAt;
      items.forEach((x, i) => {
        const u = t - x.it.at;
        x.cell.style.opacity = u <= 0 ? 0 : clamp(u / 0.2) * (all || i === cur ? 1 : 0.3);
        x.cell.style.scale = u <= 0 ? 0.9 : lerp(0.9, 1, spring(u, 16, 8)).toFixed(4);
        if (x.arrow) growX(x.arrow, t, x.it.at - 0.3, 0.3);
        if (x.tag) rise(x.tag, t, x.it.at + 0.3);
      });
    }, [], []);
  };

  /* 节点路径：讲流程、路线图。一条底线加一条填充线，讲到哪一步节点变实心，放一圈波纹 */
  RS.blocks.path = (b, ctx) => {
    const node = el("div", "rs-x rs-path-wrap", ctx.stage);
    const box = el("div", "rs-path", node);
    el("div", "rs-path-base", box);
    const fill = el("div", "rs-path-fill", box);
    const n = b.nodes.length;
    const X = (i) => (n === 1 ? 50 : (100 * i) / (n - 1));
    const nodes = b.nodes.map((s, i) => {
      const dot = el("div", "rs-path-node", box, "<i></i><b></b>");
      dot.style.left = `${X(i)}%`;
      const pill = el("div", `rs-path-pill${i % 2 ? " is-low" : ""}`, box, s.label);
      pill.style.left = `${X(i)}%`;
      return { s, dot, ring: dot.firstChild, pill };
    });
    return simple(node, (t) => {
      box.style.opacity = ease.out3(prog(t, b.at, b.at + 0.3));
      let x = 0;
      nodes.forEach(({ s }, i) => {
        if (t >= s.at) x = lerp(i ? X(i - 1) : 0, X(i), ease.out3(prog(t, s.at, s.at + 0.4)));
      });
      fill.style.width = `${x.toFixed(2)}%`;
      nodes.forEach(({ s, dot, ring, pill }) => {
        const u = t - s.at;
        dot.classList.toggle("is-on", u >= 0);
        const k = clamp(u / 0.7);
        ring.style.opacity = u < 0 ? 0 : 0.7 * (1 - k);
        ring.style.transform = `scale(${lerp(1, 3, k).toFixed(3)})`;
        rise(pill, t, Math.min(s.at, s.showAt ?? s.at));
      });
    }, [], []);
  };

  /* 胶囊横排：列举，否定项红叉，肯定项绿勾。放在口播页 */
  RS.blocks.pills = (b, ctx) => {
    const node = el("div", "rs-pills", ctx.stage);
    if (b.left !== undefined) node.style.left = `${b.left}px`;
    if (b.top !== undefined) node.style.top = `${b.top}px`;
    const items = b.items.map((it) => el("div", `rs-pill${it.kind ? ` is-${it.kind}` : ""}`, node, `${it.kind ? `<u>${it.kind === "ok" ? "✓" : "✕"}</u>` : ""}${it.text}`));
    return simple(node, (t) => {
      items.forEach((n, i) => {
        const at = b.items[i].at;
        const k = ease.out3(prog(t, at, at + 0.35));
        n.style.opacity = t < at ? 0 : k;
        n.style.transform = `translateY(${(12 * (1 - k)).toFixed(2)}px)`;
      });
    }, [], []);
  };

  /* 人身后的大字：叠放是真人、字、抠像。抠像由场景的 matte 字段放在图形层上面。字放头两侧，不放头正中 */
  RS.blocks.behind = (b, ctx) => {
    const node = el("div", "rs-behind", ctx.stage);
    const items = b.items.map((it) => {
      const n = el("div", "rs-behind-w", node, it.text);
      n.style.left = `${it.x}px`;
      n.style.top = `${it.y}px`;
      n.style.fontSize = `${it.size ?? b.size ?? 380}px`;
      return { it, n };
    });
    return simple(node, (t) => {
      items.forEach(({ it, n }) => landIn(n, t, it.at ?? b.at, 1.08));
    }, [], []);
  };

  /* 名词字卡：整屏强调色底，放原词 */
  RS.blocks.term = (b, ctx) => {
    const node = el("div", "rs-term", ctx.stage);
    const main = el("div", "rs-term-t", node, b.text);
    const zh = b.zh ? el("div", "rs-term-z", node, b.zh) : null;
    return simple(node, (t) => {
      node.style.opacity = t < b.at ? 0 : 1;
      landIn(main, t, b.at, 1.08);
      if (zh) rise(zh, t, b.at + 0.35);
    }, [], []);
  };

  /* 条形对比：从左长出来 */
  RS.blocks.bars = (b, ctx) => {
    const node = el("div", "rs-x rs-bars-wrap", ctx.stage);
    const box = el("div", "rs-bars", node);
    const max = b.max ?? Math.max(...b.items.map((x) => x.value));
    const items = b.items.map((it) => {
      const row = el("div", `rs-bar${it.hit ? " is-hit" : ""}`, box);
      el("div", "rs-bar-l", row, it.label);
      const track = el("div", "rs-bar-t", row);
      const fill = el("i", "", track);
      fill.style.width = `${(it.value / max) * 100}%`;
      const val = el("div", "rs-bar-v", row);
      return { it, row, fill, val };
    });
    return simple(node, (t) => {
      items.forEach(({ it, row, fill, val }) => {
        rise(row, t, it.at);
        const k = ease.out3(prog(t, it.at, it.at + 0.6));
        growX(fill, t, it.at, 0.6);
        val.textContent = it.text ?? fmt(it.value * k, it.digits ?? 0);
      });
    }, [], [box]);
  };

  /* 渗流网格：贯穿全片的示意图。种子固定，每条边一个固定的数，打通比例 p 时小于 p 的边是通的 */
  const seeded = (a) => () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let v = Math.imul(a ^ (a >>> 15), 1 | a);
    v = (v + Math.imul(v ^ (v >>> 7), 61 | v)) ^ v;
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
  RS.blocks.percolate = (b, ctx) => {
    const node = el("div", "rs-x rs-perc-wrap", ctx.stage);
    const C = b.cols ?? 12, R = b.rows ?? 12, GAP = 50;
    const svg = svgEl("svg", { viewBox: `-14 -14 ${(C - 1) * GAP + 28} ${(R - 1) * GAP + 28}`, class: "rs-perc" }, node);
    const rnd = seeded(b.seed ?? 96);
    const gE = svgEl("g", {}, svg);
    const gN = svgEl("g", {}, svg);
    const edges = [];
    const dots = [];
    for (let r = 0; r < R; r++)
      for (let c = 0; c < C; c++) {
        dots.push(svgEl("circle", { cx: c * GAP, cy: r * GAP, r: 6 }, gN));
        const add = (to, x2, y2) => edges.push({ a: r * C + c, b: to, u: rnd(), n: svgEl("line", { x1: c * GAP, y1: r * GAP, x2, y2 }, gE) });
        if (c < C - 1) add(r * C + c + 1, (c + 1) * GAP, r * GAP);
        if (r < R - 1) add((r + 1) * C + c, c * GAP, (r + 1) * GAP);
      }
    const reach = (p) => {
      const adj = Array.from({ length: C * R }, () => []);
      for (const e of edges)
        if (e.u < p) {
          adj[e.a].push(e.b);
          adj[e.b].push(e.a);
        }
      const seen = new Uint8Array(C * R);
      const q = [];
      for (let c = 0; c < C; c++) {
        seen[c] = 1;
        q.push(c);
      }
      while (q.length) for (const m of adj[q.pop()]) if (!seen[m]) (seen[m] = 1), q.push(m);
      let span = false;
      for (let c = 0; c < C; c++) if (seen[(R - 1) * C + c]) span = true;
      return { seen, span };
    };
    /* 贯通点：二分找最小的 p，phases 里可以直接写 "critical" 和 "critical-0.01" */
    const us = edges.map((e) => e.u).sort((x, y) => x - y);
    let lo = 0, hi = us.length - 1;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (reach(us[m] + 1e-9).span) hi = m;
      else lo = m + 1;
    }
    const pc = us[lo] + 1e-9;
    const val = (v) => (typeof v === "number" ? v : pc + Number(String(v).replace("critical", "") || 0));
    const readout = b.showP ? el("div", "rs-perc-p", node) : null;
    let last = "";
    return simple(node, (t) => {
      node.style.opacity = ease.out3(prog(t, b.at, b.at + 0.3));
      let p = val(b.start ?? 0);
      for (const ph of b.phases || []) if (t >= ph.at) p = lerp(p, val(ph.p), ease.inOut(prog(t, ph.at, ph.to ?? ph.at + 1)));
      const key = `${p.toFixed(4)}`;
      if (key === last) return;
      last = key;
      const { seen, span } = reach(p);
      for (const e of edges) {
        const on = e.u < p;
        const wet = b.gas && on && seen[e.a] && seen[e.b];
        e.n.setAttribute("class", wet ? (span ? "is-span" : "is-wet") : on ? "is-open" : "");
      }
      dots.forEach((d, i) => d.setAttribute("class", b.gas && seen[i] ? (span ? "is-span" : "is-wet") : ""));
      if (readout) readout.textContent = `${Math.round(p * 100)}%`;
    }, [], []);
  };

  /* 编号卡：胸口一个巨大的 #N，项目名逐个字母出现 */
  RS.blocks.numcard = (b, ctx) => {
    const node = el("div", "rs-numcard", ctx.stage);
    if (b.top !== undefined) node.style.top = `${b.top}px`;
    const num = el("div", "rs-numcard-n", node, `#${b.n}`);
    const name = el("div", "rs-numcard-name", node);
    const letters = [...b.name].map((c) => el("span", "", name, c === " " ? "&nbsp;" : c));
    return simple(node, (t) => {
      const k = ease.out3(prog(t, b.at, b.at + 0.28));
      num.style.opacity = t < b.at ? 0 : clamp((t - b.at) / 0.1);
      num.style.transform = `scale(${lerp(1.18, 1, k).toFixed(4)})`;
      letters.forEach((c, i) => {
        const at = b.at + 0.2 + i * 0.03;
        const u = ease.out3(prog(t, at, at + 0.25));
        c.style.opacity = t < at ? 0 : u;
        c.style.transform = `translateY(${(26 * (1 - u)).toFixed(2)}px)`;
      });
    }, [], []);
  };

  /* 一排 logo 依次弹出 */
  RS.blocks.logos = (b, ctx) => {
    const node = el("div", "rs-logos", ctx.stage);
    if (b.top !== undefined) node.style.top = `${b.top}px`;
    const items = b.items.map((it) => el("div", "rs-logo", node, `<img src="${it.src}" alt="" />${it.label ? `<span>${it.label}</span>` : ""}`));
    return simple(node, (t) => items.forEach((n, i) => popIn(n, t, b.items[i].at)), [], []);
  };

  /* 串线：几个 logo 连成一条线，每说一个词落一个关键词 */
  RS.blocks.thread = (b, ctx) => {
    const node = el("div", "rs-x rs-thread-wrap", ctx.stage);
    const box = el("div", "rs-thread", node);
    const line = el("div", "rs-thread-line", box);
    const items = b.items.map((it) => {
      const cell = el("div", "rs-thread-cell", box);
      const logo = el("div", "rs-thread-logo", cell, it.src ? `<img src="${it.src}" alt="" />` : "<i></i>");
      const word = el("div", "rs-thread-w", cell, it.word);
      return { it, logo, word };
    });
    const last = b.items.at(-1).at;
    return simple(node, (t) => {
      line.style.transform = `scaleX(${ease.inOut(prog(t, b.at, last)).toFixed(4)})`;
      items.forEach(({ it, logo, word }) => {
        popIn(logo, t, Math.min(it.at, b.at));
        rise(word, t, it.at);
      });
    }, [], [box]);
  };

  /* 引语卡：虚化照片底，媒体名，中文译文，关键短语反白 */
  RS.blocks.quote = (b, ctx) => {
    const node = el("div", "rs-quote", ctx.stage);
    if (b.bg) el("img", "rs-quote-bg", node).src = b.bg;
    el("div", "rs-x-dim is-on", node);
    const box = el("div", "rs-quote-box", node);
    if (b.media) el("div", "rs-quote-m", box, b.media);
    el("div", "rs-quote-t", box, inline(b.text));
    if (b.note) el("div", "rs-quote-n", box, b.note);
    return simple(node, (t) => {
      node.style.opacity = ease.out3(prog(t, b.at, b.at + 0.25));
      focusIn(box, t, b.at, { dur: 0.5, blur: 8, y: 20, scale: 1 });
    }, [], [box]);
  };

  /* 推文卡：截图放白卡，下面一行中文译文 */
  RS.blocks.tweet = (b, ctx) => {
    const node = el("div", "rs-x rs-tw-wrap", ctx.stage);
    const box = el("div", "rs-tw", node);
    el("img", "", box).src = b.src;
    const tr = b.text ? el("div", "rs-tw-t", node, inline(b.text)) : null;
    return simple(node, (t) => {
      focusIn(box, t, b.at, { dur: 0.5, blur: 10, y: 24, scale: 1.02 });
      if (tr) rise(tr, t, b.textAt ?? b.at + 0.4);
    }, [], [box]);
  };

  /* 人名条：新人物出场。深色卡，左边一道竖线，nick 用书法字 */
  RS.blocks.name = (b, ctx) => {
    const node = el("div", "rs-name", ctx.stage);
    if (b.left !== undefined) node.style.left = `${b.left}px`;
    if (b.top !== undefined) node.style.top = `${b.top}px`;
    if (b.img) el("img", "", node).src = b.img;
    const tx = el("div", "", node);
    if (b.en) el("div", "rs-name-en", tx, b.en);
    if (b.zh) el("div", "rs-name-zh", tx, b.zh);
    const nick = b.nick ? el("div", "rs-name-nick", ctx.stage, b.nick) : null;
    return simple(node, (t) => {
      const k = ease.out3(prog(t, b.at, b.at + 0.35));
      node.style.opacity = t < b.at ? 0 : k;
      node.style.transform = `translateX(${(-30 * (1 - k)).toFixed(2)}px)`;
      if (nick) landIn(nick, t, b.at + 0.3, 1.2);
    }, [], []);
  };

  /* 年份刻度尺：圆点跟着讲到的年份移动 */
  RS.blocks.ruler = (b, ctx) => {
    const node = el("div", "rs-ruler", ctx.stage);
    const box = el("div", "rs-ruler-box", node);
    const [y0, y1] = b.years;
    const X = (y) => ((y - y0) / (y1 - y0)) * 100;
    const step = b.step ?? 10;
    for (let y = y0; y <= y1; y += step) {
      const n = el("div", "rs-ruler-tick", box, `<span>${y}</span>`);
      n.style.left = `${X(y)}%`;
    }
    const dot = el("div", "rs-ruler-dot", box, "<b></b>");
    const stops = b.stops;
    return simple(node, (t) => {
      node.style.opacity = ease.out3(prog(t, b.at, b.at + 0.3));
      let y = stops[0].year;
      stops.forEach((s, i) => {
        if (i && t >= s.at) y = lerp(stops[i - 1].year, s.year, ease.inOut(prog(t, s.at, s.at + 0.6)));
      });
      dot.style.left = `${X(y).toFixed(2)}%`;
      dot.firstChild.textContent = Math.round(y);
    }, [], []);
  };

  /* 进度条：规则的时间限制，渐变填充，上面有标签 */
  RS.blocks.track = (b, ctx) => {
    const node = el("div", "rs-x rs-trk-wrap", ctx.stage);
    const box = el("div", "rs-trk", node);
    if (b.label) el("div", "rs-trk-l", box, b.label);
    const bar = el("div", "rs-trk-bar", box);
    const fill = el("i", "", bar);
    fill.style.width = `${b.pct ?? 100}%`;
    const pins = (b.pins || []).map((p) => {
      const n = el("div", "rs-trk-pin", bar, `<span>${p.text}</span>`);
      n.style.left = `${p.pct}%`;
      return { p, n };
    });
    return simple(node, (t) => {
      focusIn(box, t, b.at, { dur: 0.4, blur: 8, y: 14, scale: 1 });
      growX(fill, t, b.fill ?? b.at + 0.3, b.dur ?? 1);
      pins.forEach(({ p, n }) => rise(n, t, p.at));
    }, [], [box]);
  };
})(window.RS);
