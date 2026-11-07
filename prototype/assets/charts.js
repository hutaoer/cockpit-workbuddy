/* ==========================================================================
   charts.js — 手写 SVG 图表（裁定 D6：零外部图表库）
   参数严格按 docs/10-visual-direction.md §5.6
   · 仅水平网格 / 基线完整可见 / 段间 2px 用卡底割开
   · 1px 线一律 vector-effect="non-scaling-stroke"
   主题：颜色一律通过 CSS 变量取（内联 SVG 的 presentation attribute 支持 var()），
   因此 [data-theme] 切换即时生效，本文件不含任何裸色值；
   仅「柱体渐变 / 仪表弧渐变 / 端点圆点 / 顶部亮边」这类需要 <defs> 的形态
   由 CK.chart.theme 决定是否绘制（calm 主题下由 CSS display:none 隐藏）。
   ========================================================================== */

CK.chart = (function () {
  'use strict';

  var C = {
    grid:  'var(--chart-grid)',
    base:  'var(--chart-base)',
    track: 'var(--chart-track)',
    axis:  'var(--neutral-3)',
    val:   'var(--neutral-2)',
    n0:    'var(--neutral-0)',
    card:  'var(--bg-card)',
    s1:    'var(--s1)',
    s2:    'var(--s2)',
    s3:    'var(--s3)',
    s4:    'var(--s4)',
    s5:    'var(--s5)',
    s6:    'var(--s6)',
    s7:    'var(--s7)'
  };

  var theme = 'cockpit';   /* 'cockpit' | 'calm'，由 pages.js 同步 */
  var uid = 0;

  function isCockpit() { return theme === 'cockpit'; }
  /* cockpit 主题下轴标签/刻度/数值标签抬一档（12→13），与 HTML 文字层的地板一致 */
  function tfs(base) { return isCockpit() ? base + 1 : base; }
  function setTheme(t) { theme = t === 'calm' ? 'calm' : 'cockpit'; }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function n(v) { return Math.round(v * 100) / 100; }
  function uidOf(p) { return 'ck' + uid + '-' + p; }

  /* 开画布：cockpit 主题下顺带注入本实例的渐变定义（id 唯一，避免同页冲突） */
  function open(w, h, label) {
    var defs = '';
    if (isCockpit()) {
      defs = '<defs>' +
        '<linearGradient id="' + uidOf('bar') + '" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#56B4FF"/><stop offset="1" stop-color="#1E5C99"/></linearGradient>' +
        '<linearGradient id="' + uidOf('arc') + '" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="#3B9EFF"/><stop offset="1" stop-color="#39D2E0"/></linearGradient>' +
        '</defs>';
    }
    return '<svg class="chart" viewBox="0 0 ' + n(w) + ' ' + n(h) + '" width="100%" height="100%" ' +
      'preserveAspectRatio="xMidYMid meet" role="img" aria-label="' + esc(label || '图表') + '">' + defs;
  }
  function hline(x0, x1, y, color, sw, cls) {
    return '<line class="' + (cls || 'ch-grid') + '" x1="' + n(x0) + '" y1="' + n(y) + '" x2="' + n(x1) + '" y2="' + n(y) +
      '" stroke="' + color + '" stroke-width="' + (sw || 1) + '" vector-effect="non-scaling-stroke" shape-rendering="crispEdges"/>';
  }
  function txt(x, y, s, o) {
    o = o || {};
    return '<text class="ch-txt" x="' + n(x) + '" y="' + n(y) + '" fill="' + (o.fill || C.axis) +
      '" font-size="' + (o.size || 12) + '" font-weight="' + (o.weight || 400) +
      '" text-anchor="' + (o.anchor || 'middle') + '"' +
      (o.opacity ? ' opacity="' + o.opacity + '"' : '') + '>' + esc(s) + '</text>';
  }

  /* ---------- ① 折线（线宽 1.5，3 点内开 symbol 2.5） ---------- */
  function line(o) {
    uid++;
    var w = o.w, h = o.h;
    var padT = o.padT || 16, padL = o.padL || 34, padR = o.padR || 12;
    var labelH = o.labelH || 32;
    var plotH = h - padT - labelH;
    var baseY = padT + plotH;
    var cats = o.cats || [], nCat = cats.length;
    var x0 = padL, x1 = w - padR;
    var step = nCat > 1 ? (x1 - x0) / (nCat - 1) : 0;
    var ticks = o.ticks || [];
    var max = o.max || (ticks.length ? ticks[ticks.length - 1] : 1);
    var s = '';

    ticks.forEach(function (t) {
      var y = baseY - (t / max) * plotH;
      if (t !== 0) s += hline(x0, x1, y, C.grid, 1, 'ch-grid');
      s += txt(padL - 8, y + 4, t, { size: tfs(12), fill: C.axis, anchor: 'end' });
    });
    s += hline(x0, x1, baseY, C.base, 1, 'ch-base');

    /* X 轴标签 */
    cats.forEach(function (c, i) {
      var x = nCat > 1 ? x0 + step * i : x0;
      s += txt(x, baseY + 22, c, { size: tfs(12), fill: C.axis });
    });

    if (o.noData) {
      s += txt((x0 + x1) / 2, padT + 8, '数据未接入', { size: tfs(12), fill: C.axis, weight: 400 });
      s += txt(padL - 8, padT + 12, '', { size: 12 });
      return open(w, h, o.label) + s + '</svg>';
    }

    var vals = o.values || [];
    var pts = vals.map(function (v, i) {
      var x = nCat > 1 ? x0 + step * i : x0;
      var y = baseY - (v / max) * plotH;
      return [x, y];
    });
    s += '<polyline class="ch-line" fill="none" stroke="' + C.s1 + '" stroke-width="1.5" stroke-linejoin="round" ' +
      'vector-effect="non-scaling-stroke" points="' + pts.map(function (p) { return n(p[0]) + ',' + n(p[1]); }).join(' ') + '"/>';
    pts.forEach(function (p, i) {
      s += '<circle class="ch-dot" cx="' + n(p[0]) + '" cy="' + n(p[1]) + '" r="2.5" fill="' + C.s1 + '"/>';
      s += txt(p[0], p[1] - 10, vals[i], { size: tfs(12), weight: 500, fill: C.val });
    });
    return open(w, h, o.label) + s + '</svg>';
  }

  /* ---------- ② 柱状（柱宽 ≤6 组 24px，组距 = 柱宽×0.6，柱顶 2px 圆角） ---------- */
  function barTopPath(x, y, w, h, r) {
    r = Math.min(r, w / 2, h);
    if (h <= 0) return '';
    return 'M' + n(x) + ' ' + n(y + h) + ' L' + n(x) + ' ' + n(y + r) +
      ' Q' + n(x) + ' ' + n(y) + ' ' + n(x + r) + ' ' + n(y) +
      ' L' + n(x + w - r) + ' ' + n(y) + ' Q' + n(x + w) + ' ' + n(y) + ' ' + n(x + w) + ' ' + n(y + r) +
      ' L' + n(x + w) + ' ' + n(y + h) + ' Z';
  }

  function bar(o) {
    uid++;
    var w = o.w, h = o.h;
    var padT = o.padT || 22, padL = o.padL || 34, padR = o.padR || 12;
    var labelH = o.labelH || 32;
    var plotH = h - padT - labelH;
    var baseY = padT + plotH;
    var cats = o.cats || [], nCat = cats.length;
    var x0 = padL, x1 = w - padR;
    var band = o.bandW || (x1 - x0) / nCat;
    var groupW = band * nCat;
    var bandX0 = o.bandW ? x0 + Math.max((x1 - x0 - groupW) / 2, 0) : x0;
    var barW = o.barW || 24;
    var ticks = o.ticks || [];
    var max = o.max || (ticks.length ? ticks[ticks.length - 1] : 1);
    var s = '';
    var fill = isCockpit() ? 'url(#' + uidOf('bar') + ')' : C.s1;

    ticks.forEach(function (t) {
      var y = baseY - (t / max) * plotH;
      if (t !== 0) s += hline(x0, x1, y, C.grid, 1, 'ch-grid');
      s += txt(padL - 8, y + 4, t, { size: tfs(12), fill: C.axis, anchor: 'end' });
    });
    s += hline(x0, x1, baseY, C.base, 1, 'ch-base');

    cats.forEach(function (c, i) {
      var cx = bandX0 + band * i + band / 2;
      var lines = Array.isArray(c) ? c : [c];
      lines.forEach(function (ln, li) {
        s += txt(cx, baseY + 18 + li * 15, ln, { size: tfs(12), fill: C.axis });
      });
    });

    var vals = o.values || [];
    if (o.noData) {
      cats.forEach(function (c, i) {
        var cx = bandX0 + band * i + band / 2;
        s += txt(cx, baseY - 8, '—', { size: tfs(12), weight: 500, fill: C.axis });
      });
      s += txt((x0 + x1) / 2, padT + 6, '数据未接入 · 数值待数据层提供', { size: tfs(12), fill: C.axis });
      return open(w, h, o.label) + s + '</svg>';
    }

    vals.forEach(function (v, i) {
      var cx = bandX0 + band * i + band / 2;
      var bh = (v / max) * plotH;
      s += '<path class="ch-bar" d="' + barTopPath(cx - barW / 2, baseY - bh, barW, bh, 2) + '" fill="' + fill + '"/>';
      /* 柱顶 1px 亮边（calm 主题下 display:none） */
      s += '<line class="ch-bar-top" x1="' + n(cx - barW / 2 + 2) + '" y1="' + n(baseY - bh + 1) +
        '" x2="' + n(cx + barW / 2 - 2) + '" y2="' + n(baseY - bh + 1) +
        '" stroke="#A8D8FF" stroke-width="1" vector-effect="non-scaling-stroke"/>';
      s += txt(cx, baseY - bh - 8, v, { size: tfs(12), weight: 500, fill: C.val });
    });
    return open(w, h, o.label) + s + '</svg>';
  }

  /* ---------- 横向条形（标签左 / 条中 / 数值右） ---------- */
  function hbar(o) {
    uid++;
    var w = o.w, rows = o.rows || [], rowH = o.rowH || 32, gap = o.gap == null ? 1 : o.gap;
    var h = rows.length * rowH + (rows.length - 1) * gap;
    var labelW = o.labelW || 96;
    var valueW = o.valueW || 60;
    var barH = o.barH || 10;
    var max = o.max || 1;
    var x0 = labelW, x1 = w - valueW;
    var s = '';
    rows.forEach(function (r, i) {
      var y = i * (rowH + gap);
      var cy = y + rowH / 2;
      s += txt(0, cy + 6, r.name, { size: o.labelSize || 13, fill: C.axis, anchor: 'start' });
      s += '<rect class="ch-track" x="' + n(x0) + '" y="' + n(cy - barH / 2) + '" width="' + n(x1 - x0) + '" height="' + barH +
        '" rx="2" fill="' + C.track + '"/>';
      var bw = r.value == null ? 0 : (r.value / max) * (x1 - x0);
      if (bw > 0) {
        s += '<rect class="ch-bar" x="' + n(x0) + '" y="' + n(cy - barH / 2) + '" width="' + n(bw) + '" height="' + barH +
          '" rx="2" fill="' + C.s1 + '"/>';
      }
      s += txt(w, cy + 7, r.value == null ? '—' : r.value + (o.unit || ''), {
        size: o.valueSize || 14, weight: 600, fill: C.val, anchor: 'end'
      });
    });
    return open(w, h, o.label) + s + '</svg>';
  }

  /* ---------- ③ 环形（12 点起顺时针，段间 2px 用卡底割开） ---------- */
  function donut(o) {
    uid++;
    var size = o.size || 120;
    var ring = o.ring || 12;
    var r = (size - ring) / 2;
    var cx = size / 2, cy = size / 2;
    var circ = 2 * Math.PI * r;
    var segs = (o.segs || []).filter(function (s) { return s.value > 0; });
    var total = segs.reduce(function (a, s) { return a + s.value; }, 0);
    var s = open(size, size, o.label);
    s += '<circle class="ch-track" cx="' + cx + '" cy="' + cy + '" r="' + n(r) + '" fill="none" stroke="' + C.track +
      '" stroke-width="' + ring + '"/>';

    var caps = '';
    if (total > 0) {
      var acc = 0;
      segs.forEach(function (sg) {
        var len = (sg.value / total) * circ;
        var dash = Math.max(len - 2, 0.6);
        s += '<circle class="ch-seg" cx="' + cx + '" cy="' + cy + '" r="' + n(r) + '" fill="none" stroke="' + (sg.color || C.s1) +
          '" stroke-width="' + ring + '" stroke-dasharray="' + n(dash) + ' ' + n(circ) +
          '" stroke-dashoffset="' + n(-(acc + 1)) + '" transform="rotate(-90 ' + cx + ' ' + cy + ')"/>';
        /* 段端点 3px 圆点：几何始终计算，calm 主题由 CSS 隐藏 */
        var ang = ((acc + len) / circ) * Math.PI * 2 - Math.PI / 2;
        caps += '<circle class="ch-cap" cx="' + n(cx + r * Math.cos(ang)) + '" cy="' + n(cy + r * Math.sin(ang)) +
          '" r="3" fill="' + (sg.color || C.s1) + '"/>';
        acc += len;
      });
      s += '<g class="ch-caps">' + caps + '</g>';
    }

    if (o.center) {
      s += txt(cx, cy + 2, o.center.value, { size: o.centerSize || 28, weight: 600, fill: C.n0 });
      if (o.center.sub) s += txt(cx, cy + 20, o.center.sub, { size: tfs(12), fill: C.axis });
    }
    s += '</svg>';
    return s;
  }

  /* ---------- ④ 仪表（240°，缺口朝下，无指针） ---------- */
  function polar(cx, cy, r, deg) {
    var a = deg * Math.PI / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  }
  function arc(cx, cy, r, a0, a1) {
    var p0 = polar(cx, cy, r, a0), p1 = polar(cx, cy, r, a1);
    var large = Math.abs(a1 - a0) > 180 ? 1 : 0;
    return 'M' + n(p0[0]) + ' ' + n(p0[1]) + ' A' + n(r) + ' ' + n(r) + ' 0 ' + large + ' 1 ' +
      n(p1[0]) + ' ' + n(p1[1]);
  }

  function gauge(o) {
    uid++;
    var w = o.w, h = o.h;
    var tickH = o.tickH || 18;
    var R = Math.min((w - 56) / 1.732, (h - tickH - 28) / 1.5);
    var cx = w / 2;
    var cy = 14 + R;
    var A0 = -210, SWEEP = 240;
    var max = o.max || 100;
    var v = Math.max(0, Math.min(o.value, max));
    var s = open(w, h, o.label);
    var stroke = o.color || (isCockpit() ? 'url(#' + uidOf('arc') + ')' : C.s1);

    /* 轨道 + 值弧（宽 6，端点圆头） */
    s += '<path class="ch-track" d="' + arc(cx, cy, R, A0, A0 + SWEEP) + '" fill="none" stroke="' + C.track +
      '" stroke-width="6" stroke-linecap="round"/>';
    if (v > 0) {
      s += '<path class="ch-arc" d="' + arc(cx, cy, R, A0, A0 + SWEEP * (v / max)) + '" fill="none" stroke="' + stroke +
        '" stroke-width="6" stroke-linecap="round"/>';
      var pEnd = polar(cx, cy, R, A0 + SWEEP * (v / max));
      s += '<circle class="ch-cap" cx="' + n(pEnd[0]) + '" cy="' + n(pEnd[1]) + '" r="3" fill="' + C.s1 + '"/>';
    }

    /* 刻度：只保留 3 个 */
    (o.ticks || [0, max / 2, max]).forEach(function (t) {
      var ang = A0 + SWEEP * (t / max);
      var p = polar(cx, cy, R + 15, ang);
      /* 中段刻度落在弧顶，需夹住基线，否则标签被 viewBox 顶边切掉 */
      var ty = Math.max(p[1] + 4, tfs(12) + 3);
      s += txt(p[0], ty, t, { size: tfs(12), fill: C.axis });
    });

    /* 中心值 */
    var unitSize = 12;
    s += txt(cx, cy - 4, o.valueText != null ? o.valueText : v, { size: o.centerSize || 32, weight: 600, fill: C.n0 });
    if (o.unit) s += txt(cx, cy + 18, o.unit, { size: tfs(unitSize), fill: C.axis });
    s += '</svg>';
    return s;
  }

  return {
    line: line, bar: bar, hbar: hbar, donut: donut, gauge: gauge,
    C: C, setTheme: setTheme, isCockpit: isCockpit,
    get theme() { return theme; }
  };
})();
