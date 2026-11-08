/* ==========================================================================
   stage3d.js — 首页中区 3D 背景装饰层（visual §4.1 / §4.2）
   · 纯 Canvas2D 线框球，无第三方库、无 WebGL 依赖
   · 只做装饰：opacity 由 CSS 控制（≤ 0.25），pointer-events: none
   · ≤ 30fps；页面隐藏暂停；prefers-reduced-motion / data-fx="off" 时停帧
   · 不承载任何信息：关掉后中栏信息量不变（V5.4）
   ========================================================================== */

CK.stage3d = (function () {
  'use strict';

  var canvas = null;
  var ctx = null;
  var raf = 0;
  var lastTs = 0;
  var rot = 0;
  var W = 0, H = 0, dpr = 1;
  var FPS = 30;
  var FRAME = 1000 / FPS;

  /* 固定种子的点云（每次渲染一致，避免每帧抖动） */
  var dots = (function () {
    var a = [], seed = 7;
    function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
    for (var i = 0; i < 140; i++) {
      var u = rnd() * 2 - 1;
      var th = rnd() * Math.PI * 2;
      var s = Math.sqrt(1 - u * u);
      a.push([s * Math.cos(th), u, s * Math.sin(th)]);
    }
    return a;
  })();

  function enabled() {
    return document.documentElement.getAttribute('data-fx') !== 'off';
  }
  function reduced() {
    return document.documentElement.getAttribute('data-motion') === 'reduced';
  }

  function init() {
    var el = document.getElementById('ck-stage3d');
    if (!el || el === canvas) return !!el;
    stop();
    canvas = el;
    ctx = canvas.getContext ? canvas.getContext('2d') : null;
    if (!ctx) { canvas = null; return false; }
    resize();
    return true;
  }

  function resize() {
    if (!canvas) return;
    W = canvas.clientWidth || 916;
    H = canvas.clientHeight || 420;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function project(p, cx, cy, r) {
    var x = p[0], y = p[1], z = p[2];
    var ca = Math.cos(rot), sa = Math.sin(rot);
    var rx = x * ca + z * sa;
    var rz = -x * sa + z * ca;
    return [cx + r * rx, cy - r * y, rz];
  }

  function ring(cx, cy, r, fn, strokeStyle, width) {
    ctx.beginPath();
    var started = false;
    for (var i = 0; i <= 72; i++) {
      var p = project(fn(i / 72), cx, cy, r);
      if (p[2] < -0.02) { started = false; continue; }   /* 背面不画 */
      if (!started) { ctx.moveTo(p[0], p[1]); started = true; }
      else ctx.lineTo(p[0], p[1]);
    }
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  function draw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);

    var r = Math.min(W * 0.22, H * 0.40);
    var cx = W * 0.5;
    var cy = H * 0.52;

    /* 外圈光晕 */
    var g = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 1.45);
    g.addColorStop(0, 'rgba(57, 210, 224, 0.10)');
    g.addColorStop(0.55, 'rgba(59, 158, 255, 0.05)');
    g.addColorStop(1, 'rgba(59, 158, 255, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.45, 0, Math.PI * 2);
    ctx.fill();

    /* 经线 */
    for (var k = 0; k < 6; k++) {
      (function (lon) {
        ring(cx, cy, r, function (t) {
          var lat = (t - 0.5) * Math.PI;
          return [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)];
        }, 'rgba(57, 210, 224, 0.30)', 1);
      })(k * Math.PI / 6);
    }

    /* 纬线 */
    for (var j = -2; j <= 2; j++) {
      (function (lat) {
        var y = Math.sin(lat), rr = Math.cos(lat);
        ring(cx, cy, r, function (t) {
          var a = t * Math.PI * 2;
          return [rr * Math.cos(a), y, rr * Math.sin(a)];
        }, 'rgba(59, 158, 255, 0.22)', 1);
      })(j * Math.PI / 6);
    }

    /* 赤道加亮 */
    ring(cx, cy, r, function (t) {
      var a = t * Math.PI * 2;
      return [Math.cos(a), 0, Math.sin(a)];
    }, 'rgba(57, 210, 224, 0.55)', 1.2);

    /* 点云 */
    for (var i = 0; i < dots.length; i++) {
      var p = project(dots[i], cx, cy, r);
      if (p[2] < 0) continue;
      var a = 0.12 + p[2] * 0.55;
      ctx.fillStyle = 'rgba(120, 220, 255, ' + a.toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(p[0], p[1], 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function loop(ts) {
    raf = window.requestAnimationFrame(loop);
    if (!lastTs) lastTs = ts;
    var dt = ts - lastTs;
    if (dt < FRAME) return;           /* 30fps 上限 */
    lastTs = ts - (dt % FRAME);
    rot += Math.min(dt, 100) * 0.00006;
    draw();
  }

  function start() {
    if (raf || !ctx) return;
    lastTs = 0;
    raf = window.requestAnimationFrame(loop);
  }

  function stop() {
    if (raf) { window.cancelAnimationFrame(raf); raf = 0; }
  }

  function sync() {
    var el = document.getElementById('ck-stage3d');
    if (!el) { stop(); canvas = null; ctx = null; return; }
    if (el !== canvas) {
      if (!init()) return;
    }
    resize();
    if (enabled() && !reduced() && !document.hidden) start();
    else { stop(); draw(); }
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop();
    else if (canvas && enabled() && !reduced()) start();
  });

  window.addEventListener('resize', function () {
    if (!canvas) return;
    resize();
    if (!enabled() || reduced()) draw();
  });

  return { sync: sync, stop: stop, start: start };
})();
