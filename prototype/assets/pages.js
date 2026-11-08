/* ==========================================================================
   pages.js — 7 页业务 render + 1 页设计规范 + hash 路由 + 交互
   布局依据：docs/20-layout-spec.md §2.x（区块序号 / 模块名 / span / 宽×高 / 字段 / 条数 / 排序）
   ========================================================================== */

(function () {
  'use strict';

  var CH = CK.chart;

  /* ------------------------------------------------------------------------ */
  /* 基础工具                                                                  */
  /* ------------------------------------------------------------------------ */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c];
    });
  }
  function attr(s) { return String(s == null ? '' : s).replace(/"/g, '&quot;'); }
  function px(v) { return v + 'px'; }

  /* 严重度徽标（文字 + 色，双编码） */
  function badge(sev, text) {
    var m = CK.SEV[sev] || CK.SEV.normal;
    return '<span class="badge badge--' + m.cls + '">' + (text || m.label) + '</span>';
  }

  /* 板块标题：编号 + 竖分隔 + 标题 + 计数 + 操作（全站唯一形态） */
  function head(o) {
    return '<div class="card__head">' +
      '<span class="head__no">' + esc(o.no) + '</span>' +
      '<span class="head__sep"></span>' +
      '<span class="head__title" title="' + attr(o.title) + '">' + esc(o.title) + '</span>' +
      (o.count ? '<span class="head__count">' + esc(o.count) + '</span>' : '') +
      '<span class="head__ops">' + (o.ops || '<button class="head__dots" data-act="noop" aria-label="更多操作">⋯</button>') + '</span>' +
      '</div>';
  }

  function card(o) {
    var style = '';
    if (o.h) style += 'height:' + px(o.h) + ';';
    if (o.sev) {
      style += '--sev:' + o.sev + ';';
      /* 严重度 → 描边/外晕一对 token（visual §3.2 L2-1） */
      var sk = o.sev.indexOf('danger') > -1 ? 'danger' : (o.sev.indexOf('warn') > -1 ? 'warn' : 'ok');
      style += '--sev-ring:var(--' + sk + '-line);--sev-glow:var(--' + sk + '-glow);';
    }
    return '<section class="card ' + (o.cls || '') + '"' + (o.id ? ' id="' + o.id + '"' : '') +
      (style ? ' style="' + style + '"' : '') + ' aria-label="' + attr(o.title) + '">' +
      head(o) +
      '<div class="card__body">' + o.body + '</div>' +
      '</section>';
  }

  /* KPI 带：一张卡内 N 格等分，格间 1px 竖线 */
  function kpiBand(cells, o) {
    o = o || {};
    var s = '<div class="kpi' + (o.display ? ' kpi--display' : '') + '" role="group" aria-label="' + attr(o.label || '') + '">';
    cells.forEach(function (c) {
      s += '<div class="kpi__cell">' +
        '<div class="kpi__name" title="' + attr(c.name) + '">' + esc(c.name) + '</div>' +
        '<div class="kpi__valrow"><b class="kpi__val num">' + esc(c.value) + '</b>' +
        (c.unit ? '<span class="kpi__unit">' + esc(c.unit) + '</span>' : '') + '</div>' +
        '<div class="kpi__cap cap" title="' + attr(c.cap) + '">' + esc(c.cap) + '</div>' +
        '</div>';
    });
    return s + '</div>';
  }

  /* 图例
     o.pctOnly：只保留色块 + 百分比（类别名未随接口返回时使用，避免灰色编号占位） */
  function legend(items, o) {
    o = o || {};
    var s = '<div class="legend' + (o.twoCol ? ' legend--2col' : '') + (o.dense ? ' legend--dense' : '') + '">';
    items.forEach(function (it) {
      s += '<div class="legend__row">' +
        '<i class="legend__dot" style="background:' + it.color + '"></i>' +
        (o.pctOnly ? '' :
          '<span class="legend__name" title="' + attr(it.name) + '">' + esc(it.name) + '</span>') +
        '<span class="legend__val">' + esc(it.pct) + '</span>' +
        '</div>';
    });
    return s + '</div>';
  }

  var PALETTE = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)'];
  /* SVG 的 presentation attribute 支持 var()，故调色板单一来源即可跟随主题 */
  var PALETTE_HEX = PALETTE;

  /* ------------------------------------------------------------------------ */
  /* 状态                                                                      */
  /* ------------------------------------------------------------------------ */

  var st = {
    route: 'home',
    dist: 'mid',
    theme: 'cockpit',   /* 'cockpit'（默认驾驶舱质感）| 'calm'（沉静政务） */
    fx: 'on',           /* on | led | off（visual §4.4 光效三态） */
    motion: 'full',     /* full | reduced */
    tbl: {},
    warnSort: {},
    view: {},
    donut: {},
    filterOpen: false,
    loading: false
  };

  function tstate(id) {
    if (!st.tbl[id]) st.tbl[id] = { si: -1, dir: 0, page: 1, sel: -1 };
    return st.tbl[id];
  }

  /* ------------------------------------------------------------------------ */
  /* 表格组件：table-layout:fixed + 百分比列宽 + sticky 表头 + 分页 44px        */
  /* ------------------------------------------------------------------------ */

  function table(o) {
    var s = tstate(o.id);
    var rows = o.rows.slice();
    /* §9.5 分页策略：n ≤ 14 全量直出、无分页控件；n > 14 才 10 条/页 */
    var PAGE_LIMIT = 14;
    var usePager = rows.length > PAGE_LIMIT;
    var per = usePager ? 10 : rows.length;

    if (s.si >= 0 && s.dir !== 0) {
      var i = s.si;
      rows.sort(function (a, b) {
        var av = a[i], bv = b[i];
        if (typeof av === 'number' && typeof bv === 'number') return av - bv;
        return String(av).localeCompare(String(bv), 'zh-Hans-CN');
      });
      if (s.dir < 0) rows.reverse();
    }

    var pages = Math.max(1, Math.ceil(rows.length / per));
    if (s.page > pages) s.page = pages;
    var start = (s.page - 1) * per;
    var view = rows.slice(start, start + per);

    var s0 = '<div class="tbl"><div class="tbl__scroll"><table class="t' +
      (o.compact ? ' t--compact' : '') + (o.tight ? ' t--tight' : '') + (o.sm ? ' t--sm' : '') +
      (o.loose ? ' t--loose' : '') + (o.loose2 ? ' t--loose2' : '') + (o.rowH ? ' t--rows' : '') + '"' +
      (o.rowH ? ' style="--row-h-set:' + px(o.rowH) + '"' : '') + '>';

    s0 += '<colgroup>';
    o.cols.forEach(function (c) { s0 += '<col style="width:' + c.w + '">'; });
    s0 += '</colgroup><thead><tr>';
    o.cols.forEach(function (c, idx) {
      var sorted = s.si === idx && s.dir !== 0;
      var arrowCls = s.si === idx ? (s.dir === -1 ? ' is-desc' : (s.dir === 1 ? ' is-asc' : '')) : '';
      if (c.sort) {
        s0 += '<th' + (sorted ? ' class="is-sorted"' : '') + '><button class="th" data-act="sort" data-tbl="' + o.id +
          '" data-i="' + idx + '"><span class="th-sort' + arrowCls + '"><span>' + esc(c.t) + '</span>' +
          '<i class="th-sort__arrow"></i></span></button></th>';
      } else {
        s0 += '<th>' + esc(c.t) + '</th>';
      }
    });
    s0 += '</tr></thead><tbody>';

    if (!view.length) {
      s0 += '<tr><td colspan="' + o.cols.length + '" class="t-empty">暂无数据</td></tr>';
    } else {
      view.forEach(function (r, ri) {
        var realIdx = start + ri;
        s0 += '<tr data-act="row" data-tbl="' + o.id + '" data-row="' + realIdx + '"' +
          (s.sel === realIdx ? ' class="is-sel"' : '') + ' tabindex="0">';
        o.cols.forEach(function (c, ci) {
          s0 += '<td class="' + (c.cls || '') + '"' + (c.title ? ' title="' + attr(r[ci]) + '"' : '') + '>' +
            esc(r[ci]) + '</td>';
        });
        s0 += '</tr>';
      });
    }
    s0 += '</tbody></table></div>';

    /* §9.5：≤14 条不出分页控件，也不留 44px 占位（标注位在标题面，见 doneLabel） */
    if (usePager) {
      s0 += '<div class="pager">';
      s0 += '<button class="pager__btn pager__btn--nav" data-act="page" data-tbl="' + o.id + '" data-p="' + (s.page - 1) + '"' +
        (s.page === 1 ? ' disabled' : '') + ' aria-label="上一页">‹</button>';
      for (var p = 1; p <= pages; p++) {
        s0 += '<button class="pager__btn' + (p === s.page ? ' is-on' : '') + '" data-act="page" data-tbl="' + o.id +
          '" data-p="' + p + '">' + p + '</button>';
      }
      s0 += '<button class="pager__btn pager__btn--nav" data-act="page" data-tbl="' + o.id + '" data-p="' + (s.page + 1) + '"' +
        (s.page === pages ? ' disabled' : '') + ' aria-label="下一页">›</button>';
      s0 += '<span class="pager__spacer"></span><span>10 条/页</span><span>共 ' + rows.length + ' 条</span>';
      s0 += '</div>';
    }

    s0 += '</div>';
    return s0;
  }

  /* §9.5 标题面标注：「共 N 条 · 已全部显示」（不占表体高度） */
  function doneLabel(n) {
    return '共 ' + n + ' 条 · 已全部显示';
  }

  /* ------------------------------------------------------------------------ */
  /* §9.3「待接入模块 (N)」聚合卡                                              */
  /*   N=3 → 251 / N=2 → 198：16 + 44 + 12 + [N×52 + (N−1)×1 + 1] + 20       */
  /* ------------------------------------------------------------------------ */
  function aggCard(o) {
    var n = o.items.length;
    var h = n === 2 ? 198 : (n === 4 ? 304 : 251);
    var rows = o.items.map(function (it) {
      return '<div class="aggrow">' +
        '<div class="aggrow__top">' +
        '<span class="aggrow__name" title="' + attr(it.name) + '">' + esc(it.name) + '</span>' +
        '<span class="badge badge--unconnected">未接入</span>' +
        '</div>' +
        '<div class="aggrow__st">原计划位置：' + esc(it.pos) + '</div>' +
        '</div>';
    }).join('');
    return card({
      no: o.no, title: '待接入模块 (' + n + ')', count: n + ' 项', h: h, cls: 'card--agg',
      ops: '<button class="head__dots" data-act="noop" aria-label="更多操作">⋯</button>',
      body: '<div class="agglist">' + rows + '</div>'
    });
  }

  /* E1 占位卡 140 = 16 + 44 + 12 + 48 + 20 */
  function noDataCard(o) {
    return card({
      no: o.no, title: o.title, count: o.count || '0 项', h: 140, cls: 'card--nodata',
      ops: '<button class="head__dots" data-act="noop" aria-label="更多操作">⋯</button>',
      body: '<div class="nocard">' +
        '<span class="cap">数据源未接入，接入后自动展示</span>' +
        '<span class="cap">不影响本页其余口径与合计</span>' +
        '</div>'
    });
  }

  /* ------------------------------------------------------------------------ */
  /* 预警列表（色相 + 文字徽标 + 位置 三重编码 + 显式排序依据）                 */
  /* ------------------------------------------------------------------------ */

  function splitMetric(metric) {
    if (!metric || metric === '—') return { v: '—', u: '', missing: true };
    var m = String(metric).match(/^([\d.,]+)\s*(.*)$/);
    if (!m) return { v: metric, u: '', missing: false };
    return { v: m[1], u: m[2] || '', missing: false };
  }

  function sortWarnings(items, basis) {
    var a = items.slice();
    a.sort(function (x, y) {
      var rx = CK.SEV[x.severity].rank, ry = CK.SEV[y.severity].rank;
      var tx = x.time || '', ty = y.time || '';
      if (basis === 'time') {
        if (tx !== ty) return tx < ty ? 1 : -1;
        return ry - rx;
      }
      if (rx !== ry) return ry - rx;
      if (tx !== ty) return tx < ty ? 1 : -1;
      return x.title.localeCompare(y.title, 'zh-Hans-CN');
    });
    return a;
  }

  function warnItems(board) {
    return CK.warnings.items
      .filter(function (w) { return !board || w.board === board; })
      .map(function (w) {
        return {
          board: w.board, title: w.title, severity: w.severity, metric: w.metric,
          time: CK.warningTime[w.title] || '—'
        };
      });
  }

  function warnList(items, o) {
    o = o || {};
    var key = o.key || 'default';
    var basis = st.warnSort[key] || 'sev';
    var list = sortWarnings(items, basis);
    var s = '<div class="wlist">';
    list.forEach(function (w) {
      var m = splitMetric(w.metric);
      var sub = w.time + ' · ' + w.board + (m.missing ? ' · 数据未接入' : '');
      s += '<button class="witem witem--' + w.severity + (o.tall ? ' witem--tall' : '') +
        '" data-act="warn" data-route="' + boardRoute(w.board) + '"' +
        ' aria-label="' + attr(w.title + ' ' + w.metric) + '">' +
        '<span class="witem__main">' +
        '<span class="witem__line1">' + badge(w.severity) +
        '<span class="witem__title" title="' + attr(w.title) + '">' + esc(w.title) + '</span></span>' +
        '<span class="witem__sub">' + esc(sub) + '</span>' +
        '</span>' +
        '<span class="witem__val' + (m.missing ? ' dash' : '') + '">' + esc(m.v) +
        (m.u ? '<span>' + esc(m.u) + '</span>' : '') + '</span>' +
        '</button>';
    });
    return s + '</div>';
  }

  function warnSortBasis(key) {
    return (st.warnSort[key] || 'sev') === 'sev' ? '按严重度 ↓' : '按时间 ↓';
  }

  function warnSortTabs(key) {
    var basis = st.warnSort[key] || 'sev';
    return '<span class="head__hint">' + warnSortBasis(key) + '</span>' +
      '<span class="tabs tabs--sm">' +
      '<button class="tab' + (basis === 'sev' ? ' is-on' : '') + '" data-act="warnsort" data-key="' + key + '" data-v="sev">严重度</button>' +
      '<button class="tab' + (basis === 'time' ? ' is-on' : '') + '" data-act="warnsort" data-key="' + key + '" data-v="time">时间</button>' +
      '</span>';
  }

  function boardRoute(name) {
    var b = CK.boards.filter(function (x) { return x.name === name; })[0];
    return b ? b.route : '#/home';
  }

  /* ======================================================================== */
  /* P0 首页                                                                   */
  /* ======================================================================== */

  function pageHome() {
    var d = CK.data.p0;
    var sum = CK.warnings.summary;

    /* [01] 四级预警分布 KPI 带（146，44px 版；4 格同口径，3+3+2=8 可验算）
       第 1 格给汇总口径，2–4 格改给「占待处置」占比（3/8、3/8、2/8），不与首格重复同一句话 */
    function pctOf(v) {
      var r = Math.round(v / sum.total * 1000) / 10;
      return '占待处置 ' + r + '%';
    }
    var band = kpiBand([
      { name: '待处置预警', value: sum.total, unit: '项', cap: '汇总自 6 个板块 · 按严重度分级' },
      { name: '严重', value: sum.critical, unit: '项', cap: pctOf(sum.critical) },
      { name: '预警', value: sum.warning, unit: '项', cap: pctOf(sum.warning) },
      { name: '关注', value: sum.attention, unit: '项', cap: pctOf(sum.attention) }
    ], { display: true, label: '四级预警分布' });

    /* [02] 模型数量分布 446×344：7 行可见（32）+ 视图切换 24 */
    var view = st.view.models || 'models';
    var listHtml = '';
    if (view === 'models') {
      var maxM = d.models[0].value;
      listHtml = '<div class="list">' + d.models.map(function (m) {
        return '<div class="listrow"><span class="listrow__name" title="' + attr(m.name) + '">' + esc(m.name) + '</span>' +
          '<span class="meter"><i style="width:' + Math.round(m.value / maxM * 100) + '%"></i></span>' +
          '<span class="listrow__val">' + m.value + '<span class="listrow__unit">人</span></span></div>';
      }).join('') + '</div>';
    } else {
      listHtml = '<div class="list">' + d.apps.map(function (a) {
        return '<button class="listrow listrow--app" data-act="noop"><span class="listrow__name">' + esc(a) + '</span>' +
          '<span class="listrow__go">›</span></button>';
      }).join('') + '</div>';
    }
    var c02 = card({
      no: '02', title: '模型数量分布', count: '13 项', h: 344,
      ops: '<button class="head__dots" data-act="noop" aria-label="更多操作">⋯</button>',
      body: listHtml +
        '<div class="viewswitch"><span class="cap">视图切换</span>' +
        '<span class="tabs tabs--sm">' +
        '<button class="tab' + (view === 'models' ? ' is-on' : '') + '" data-act="view" data-k="models" data-v="models">模型 13</button>' +
        '<button class="tab' + (view === 'apps' ? ' is-on' : '') + '" data-act="view" data-k="models" data-v="apps">应用 9 ›</button>' +
        '</span></div>'
    });

    /* [03] 事务犯审批各类模型 446×192：环形外径 96 + 图例 2×2（仅色块+占比）+ 1 行说明 */
    var ap = d.approval;
    var c03 = card({
      no: '03', title: '事务犯审批各类模型', count: '4 项', h: 192,
      body: '<div class="donutwrap">' +
        '<div class="donut" style="width:94px;height:94px">' +
        CH.donut({
          size: 94, ring: 10, centerSize: 22,
          segs: ap.items.map(function (it, i) { return { value: it.value, color: PALETTE_HEX[i] }; }),
          center: { value: ap.center, sub: ap.centerSub }, label: '事务犯审批各类模型占比'
        }) + '</div>' +
        '<div class="legendwrap legendwrap--col">' +
        legend(ap.items.map(function (it, i) { return { pct: it.pct, color: PALETTE[i] }; }), { twoCol: true, dense: true, pctOnly: true }) +
        '<div class="cap">类别名称未随接口返回，仅提供占比</div>' +
        '</div>' +
        '</div>'
    });

    /* [03b] 罪犯劳动报酬发放 446×194：Top 3 + 计数「5 项」+ 详情下钻 */
    var c03b = card({
      no: '03b', title: '罪犯劳动报酬发放', count: '5 项', h: 194,
      ops: '<a class="btn-link" href="#/labor" data-act="goto" data-route="#/labor" data-anchor="pay">共 5 项 · 详情 ›</a>',
      body: '<div class="list">' + d.pay.slice(0, 3).map(function (p) {
        return '<div class="listrow"><span class="listrow__name" title="' + attr(p.name) + '">' + esc(p.name) + '</span>' +
          '<span class="listrow__val">' + p.value + '<span class="listrow__unit">/例</span></span></div>';
      }).join('') + '</div><div class="spacer"></div>'
    });

    /* [04] 六大板块运行健康度 916×286：6 格 × 152.67，格内 11 段 / 178 */
    var health = CK.boardHealth();
    var cellsHtml = health.map(function (h) {
      var segs = '';
      var total = h.sev.critical + h.sev.warning + h.sev.attention + h.sev.normal;
      [['critical', 'var(--danger-text)'], ['warning', 'var(--warn-text)'],
       ['attention', 'var(--s1)'], ['normal', 'var(--ok-text)']].forEach(function (p) {
        if (h.sev[p[0]] > 0) segs += '<i style="flex:' + h.sev[p[0]] + ';background:' + p[1] + '"></i>';
      });
      /* 空态（本板块无预警）：只保留大数字 0 项 + 空轨堆积条 + 正常徽标，
         不再重复「无预警条目 / — / 本板块无预警条目」；被删文字的位置留白，格高不变 */
      var isEmpty = total === 0;
      var capTxt = isEmpty ? '' :
        '严重' + h.sev.critical + ' 预警' + h.sev.warning + ' 关注' + h.sev.attention;
      var stateLabel = h.state === 'warning' ? '预警' : (h.state === 'attention' ? '关注' : '正常');
      var reasons = isEmpty ? [] : (h.reasons.length ? h.reasons : []);
      /* 格内只有 2 行（36px）——只放 1 条事由：
         放 2 条会让第 2 条挤到第 3 行，从而在第 1 条末尾误挂「…」（内容其实没超）。
         完整事由列表进 title，悬停可看。 */
      var reasonTxt = reasons[0] || '';
      return '<a class="hcell" href="' + h.route + '" data-act="goto" data-route="' + h.route + '">' +
        '<span class="hcell__name" title="' + attr(h.name) + '">' + esc(h.name) + '</span>' +
        '<span class="hcell__valrow"><b class="hcell__val">' + h.pending + '</b><span class="hcell__unit">项</span></span>' +
        '<span class="hcell__cap">' + esc(capTxt) + '</span>' +
        '<span class="hcell__bar"><span class="stack">' + segs + '</span></span>' +
        '<span class="hcell__badge">' + badge(h.state, stateLabel) + '</span>' +
        '<span class="hcell__reason" title="' + attr(reasons.join(' / ')) + '">' + esc(reasonTxt) + '</span>' +
        '</a>';
    }).join('');

    var c04 = card({
      no: '04', title: '六大板块运行健康度', count: '6 项', h: 286, cls: 'card--overview',
      ops: '<span class="head__hint">按严重度分级</span><button class="head__dots" data-act="noop" aria-label="更多操作">⋯</button>',
      body: '<canvas class="stage3d" id="ck-stage3d" aria-hidden="true"></canvas>' +
        '<div class="hgrid">' + cellsHtml + '</div>'
    });

    /* [05] 跨板块 Top 异常 916×460：5 条 ×72 + 4 分割 = 364 */
    var top5 = sortWarnings(warnItems(), st.warnSort.top5 || 'sev').slice(0, 5);
    var c05 = card({
      no: '05', title: '跨板块 Top 异常', count: 'Top 5', h: 460,
      ops: warnSortTabs('top5'),
      body: warnList(top5, { key: 'top5', tall: true })
    });

    /* [06] 罪犯1档保外就医一诊断多账率 446×380 */
    var dg = d.diag;
    var dgSum = dg.reduce(function (a, b) { return a + b.value; }, 0);
    var dgMax = dg[0].value;
    var c06 = card({
      no: '06', title: '罪犯1档保外就医一诊断多账率', count: '7 项', h: 606,
      ops: '<button class="head__dots" data-act="noop" aria-label="更多操作">⋯</button>',
      body: '<div class="chartbox" style="height:454px">' +
        CH.hbar({
          w: 406, rows: dg, rowH: 64, gap: 1, labelW: 84, valueW: 60, barH: 20, max: dgMax, unit: '',
          labelSize: 14, valueSize: 20, label: '一诊断多账率'
        }) + '</div>' +
        '<div class="sumrow"><span class="cap">合计</span><b class="num">' + dgSum + '</b><span class="cap">例 · 7 个分监区</span></div>' +
        '<div class="chart-note"><span>统计区间 10-07 ~ 11-06 · 单位：例</span></div>'
    });

    /* [07] 劳动工具应静未静 446×140（E1 占位卡：72 标题区 + 68 说明区） */
    var c07 = noDataCard({ no: '07', title: '劳动工具应静未静', count: '4 组' });

    return '<div class="page page--p0">' +
      '<div class="band band--p0">' + band + '</div>' +
      '<div class="page__cols">' +
      '<div class="col">' + c02 + c03 + c03b + '</div>' +
      '<div class="col">' + c04 + c05 + '</div>' +
      '<div class="col">' + c06 + c07 + '</div>' +
      '</div></div>';
  }

  /* ======================================================================== */
  /* P1 监管改造                                                               */
  /* ======================================================================== */

  function pageSupervision() {
    var d = CK.data.p1;

    var band = kpiBand(d.kpi.map(function (k) {
      return { name: k.name, value: k.value, unit: k.unit, cap: '统计区间 11-01 ~ 11-06' };
    }), { display: false, label: '监管改造 KPI' });

    /* [02] 项（危）罪犯管理 446×519：内容 431 = 36 表头 + 12 行 × 32 + 11
       §9.5：12 ≤ 14 → 无分页控件，全量直出，标注位在标题面 */
    var c02 = card({
      no: '02', title: '项（危）罪犯管理', count: doneLabel(d.danger.length), h: 519, cls: 'card--tbl',
      ops: '<button class="head__dots" data-act="noop" aria-label="更多操作">⋯</button>',
      body: table({
        id: 'danger', compact: true, tight: true,
        cols: [
          { t: '序号', w: '13%', cls: 't-num', sort: true },
          { t: '罪犯编号', w: '22%', cls: 't-num' },
          { t: '罪犯姓名', w: '16%', cls: '' },
          { t: '危险等级', w: '17%', cls: '' },
          { t: '签发时间', w: '32%', cls: 't-time', sort: true }
        ],
        rows: d.danger.map(function (r) { return [r.no, r.code, r.name, r.level, r.time]; })
      })
    });

    /* [04] 待接入模块 (3) 446×251：事务犯管理 / 劳动工具管理 / 安屋消防（§9.3） */
    var agg1 = aggCard({
      no: '04',
      items: [
        { name: '事务犯管理', pos: '左栏 · 见 §2.2 区块 04' },
        { name: '劳动工具管理', pos: '右栏 · 见 §2.2 区块 05' },
        { name: '安屋消防工作预警', pos: '中栏 · 见 §2.2 区块 07' }
      ]
    });

    /* [03] 涉黑涉恶罪犯管理 916×786：内容 698 = 36 表头 + 13 行 × 50 + 12 */
    var c03 = card({
      no: '03', title: '涉黑涉恶罪犯管理', count: doneLabel(d.gang.length), h: 786, cls: 'card--tbl',
      ops: '<button class="head__dots" data-act="noop" aria-label="更多操作">⋯</button>',
      body: table({
        id: 'gang', loose: true,
        cols: [
          { t: '序号', w: '7%', cls: 't-num', sort: true },
          { t: '罪犯编号', w: '20%', cls: 't-num' },
          { t: '罪犯姓名', w: '11%', cls: 't-first' },
          { t: '分监区', w: '21%', cls: '' },
          { t: '分管罪犯编号', w: '20%', cls: 't-num' },
          { t: '分管罪犯姓名', w: '21%', cls: '' }
        ],
        rows: d.gang.map(function (r) { return [r.no, r.code, r.name, r.area, r.mgrCode, r.mgr]; })
      })
    });

    /* [06] 预警 446×786：内容 690 = 排序条 32 + 7 条 × 72 + 统计条 56 + 口径 36 + 处置提示 36 + 呼吸 */
    var w7 = warnItems('监管改造');
    var sev7 = { critical: 0, warning: 0, attention: 0, normal: 0 };
    w7.forEach(function (w) { sev7[w.severity]++; });
    var c06 = card({
      no: '06', title: '预警', count: w7.length + ' 条', h: 786, cls: 'card--warn', sev: 'var(--danger-text)',
      ops: '<button class="head__dots" data-act="noop" aria-label="更多操作">⋯</button>',
      body: '<div class="warnbar">' +
        '<span class="warnbar__k">排序依据：' + warnSortBasis('p1') + '</span>' +
        warnSortTabs('p1') +
        '</div>' +
        warnList(w7, { key: 'p1', tall: true }) +
        '<div class="warnstat">' +
        '<span class="warnstat__t">本板块 <b>' + w7.length + '</b> 条 · 待处置 ' +
        (sev7.critical + sev7.warning + sev7.attention) + ' 条</span>' +
        '<span class="warnstat__sev">' +
        '<span>严重 ' + sev7.critical + '</span><span>预警 ' + sev7.warning + '</span>' +
        '<span>关注 ' + sev7.attention + '</span><span>正常 ' + sev7.normal + '</span>' +
        '</span></div>' +
        '<div class="warnfoot">' +
        '<span class="cap">口径：统计区间 11-01 ~ 11-06 · 严重度按 §3.2 四级模型判定</span>' +
        '<span class="cap">来源：监管改造预警中心 · 计数为待处置条目数</span>' +
        '</div>' +
        '<div class="warnhint">' +
        '<span class="cap">处置提示：严重级须 24 小时内反馈，预警级 3 个工作日，关注级纳入周例会</span>' +
        '<span class="cap">点击条目可下钻至对应业务页，本页仅作汇总，不在此处处置</span>' +
        '</div>' +
        '<div class="spacer"></div>'
    });

    return '<div class="page page--p1">' +
      '<div class="band band--p1">' + band + '</div>' +
      '<div class="page__cols">' +
      '<div class="col">' + c02 + agg1 + '</div>' +
      '<div class="col">' + c03 + '</div>' +
      '<div class="col">' + c06 + '</div>' +
      '</div></div>';
  }

  /* ======================================================================== */
  /* P2 劳动改造                                                               */
  /* ======================================================================== */

  function pageLabor() {
    var d = CK.data.p2;
    var paySum = d.pay.reduce(function (a, b) { return a + b.value; }, 0);
    var payMax = d.pay[0].value;

    /* [01] 罪犯劳动报酬发放 446×924：口径 48 + 5×136 + 合计 56 + 底注 44 */
    var rowsHtml = d.pay.map(function (p) {
      return '<div class="payrow">' +
        '<div class="payrow__name" title="' + attr(p.name) + '">' + esc(p.name) + '</div>' +
        '<div class="payrow__valrow"><b class="payrow__val">' + p.value + '</b><span class="payrow__unit">例</span></div>' +
        '<div class="payrow__bar"><div class="bar10"><i style="width:' + Math.round(p.value / payMax * 100) + '%"></i></div></div>' +
        '<div class="payrow__cap"><span class="cap">' + esc(p.cap) + '</span></div>' +
        '</div>';
    }).join('');

    var c01 = card({
      no: '01', title: '罪犯劳动报酬发放', count: '5 项', h: 924, id: 'pay',
      ops: '<span class="head__hint">' + CK.meta.range + '</span>',
      body: '<div class="paybar-cap"><span class="cap">统计口径 ' + '11-01 ~ 11-06 · 单位：例 · 条形长度 = 相对最大项比例</span></div>' +
        rowsHtml +
        '<div class="sumrow sumrow--56"><span class="cap">合计</span><b class="num">' + paySum + '</b>' +
        '<span class="cap">例 · 5 项</span></div>' +
        '<div class="chart-note"><span>数据来源：劳动报酬发放台账 · 缺失项不计入合计</span></div>'
    });

    /* [02] 电梯维保（超 15 天）9 例 916×560：6 列 6/10/18/24/16/26 */
    var c02 = card({
      no: '02', title: '电梯维保（超 15 天）', count: doneLabel(9), h: 560, cls: 'card--tbl',
      ops: '<button class="head__dots" data-act="noop" aria-label="更多操作">⋯</button>',
      body: table({
        id: 'lift', rowH: 44,
        cols: [
          { t: '序号', w: '6%', cls: 't-num', sort: true },
          { t: '罪犯姓名', w: '10%', cls: 't-first' },
          { t: '罪犯编号', w: '18%', cls: 't-num' },
          { t: '上次维保时间', w: '24%', cls: 't-time', sort: true },
          { t: '间隔时长', w: '16%', cls: 't-num', sort: true },
          { t: '完成点', w: '26%', cls: '' }
        ],
        rows: d.lift.map(function (r) { return [r.no, r.name, r.code, r.last, r.days + ' 天', r.point]; })
      }) + '<div class="tbl-note"><span class="cap">口径：间隔时长 = 统计截止日 − 上次维保时间；超 15 天计入本表</span></div>'
    });

    /* [03] 定时劳动岗位安排 2 例 916×348 */
    var c03 = card({
      no: '03', title: '定时劳动岗位安排', count: doneLabel(d.post.length), h: 348, cls: 'card--tbl',
      ops: '<button class="head__dots" data-act="noop" aria-label="更多操作">⋯</button>',
      body: table({
        id: 'post', rowH: 56,
        cols: [
          { t: '所属监区/分监区', w: '20%', cls: 't-first' },
          { t: '罪犯姓名', w: '10%', cls: '' },
          { t: '罪犯编号', w: '18%', cls: 't-num' },
          { t: '岗位', w: '16%', cls: '' },
          { t: '考核月份', w: '16%', cls: 't-num', sort: true },
          { t: '次月岗位考核月份', w: '20%', cls: 't-num' }
        ],
        rows: d.post.map(function (r) { return [r.area, r.name, r.code, r.post, r.month, r.next]; })
      }) + '<div class="tbl-note tbl-note--100"><span class="cap cap--wrap">说明：定时劳动岗位安排指按考核月份固定排定的岗位任务；' +
        '「次月岗位考核月份」为下一考核周期的排定月份，随本表同步更新。</span></div>'
    });

    /* [04] 禁止性情形安排（已固化）446×460：0 例是结论，不是空态 */
    var c04 = card({
      no: '04', title: '禁止性情形安排（已固化）', count: '0 例', h: 460,
      ops: '<button class="head__dots" data-act="noop" aria-label="更多操作">⋯</button>',
      body: '<div class="statecard">' +
        '<div class="statecard__big">0<span>例</span></div>' +
        '<div class="statecard__badge">' + badge('normal', '已固化') + '</div>' +
        '<div class="statecard__note"><span class="cap">统计区间 11-01 ~ 11-06</span>' +
        '<span class="cap">近 30 日新增 0 例</span></div>' +
        '<div class="spacer"></div>' +
        '<div class="statecard__note"><span class="cap cap--wrap">口径：禁止性情形清单已固化至规则库，命中即拦截；' +
        '本区间内无触发记录，计数 0 为有效结论。</span>' +
        '<span class="cap cap--wrap">来源：劳动改造规则引擎 · 版本冻结 11-06。</span></div>' +
        '</div>'
    });

    /* [05] 电梯维保·间隔时长分档 446×448：3 段×64 + 段距 32 + 标尺 24 + 口径 104 */
    var tierMax = Math.max.apply(null, d.tiers.map(function (t) { return t.value; }));
    var tierHtml = d.tiers.map(function (t) {
      return '<div class="tierrow">' +
        '<div class="tierrow__top"><span class="tierrow__label">' + esc(t.label) + '</span>' +
        '<span class="tierrow__val">' + t.value + ' 例</span></div>' +
        '<div class="tierrow__bar"><div class="bar10"><i style="width:' + Math.round(t.value / tierMax * 100) + '%"></i></div></div>' +
        '</div>';
    }).join('');

    var c05 = card({
      no: '05', title: '电梯维保·间隔时长分档', count: '3 档', h: 448,
      ops: '<button class="head__dots" data-act="noop" aria-label="更多操作">⋯</button>',
      body: '<div class="tierlist">' + tierHtml + '</div>' +
        '<div class="ruler"><span class="ruler__txt">0</span><span class="ruler__line"></span><span class="ruler__txt">' + tierMax + ' 例</span></div>' +
        '<div class="spacer"></div>' +
        '<div class="tiernote">' +
        '<span class="cap cap--wrap">口径：按「间隔时长」分组统计，档位 15–20 天 / 21–30 天 / &gt;30 天。</span>' +
        '<span class="cap cap--wrap">由本节 9 条记录按「间隔时长」派生 · 非独立数据源。</span>' +
        '<span class="cap cap--wrap">与区块 02（电梯维保主表）同屏可见，可直接对照逐条记录。</span>' +
        '</div>'
    });

    return '<div class="page"><div class="page__cols">' +
      '<div class="col">' + c01 + '</div>' +
      '<div class="col">' + c02 + c03 + '</div>' +
      '<div class="col">' + c04 + c05 + '</div>' +
      '</div></div>';
  }

  /* ======================================================================== */
  /* P3 教育改造                                                               */
  /* ======================================================================== */

  function pageEducation() {
    var d = CK.data.p3;

    /* [01] 入监教育时间不足 10 · 446×620：5 列 26/11/21/12/30 */
    var c01 = card({
      no: '01', title: '入监教育时间不足', count: doneLabel(d.entry.length), h: 620, cls: 'card--tbl',
      ops: '<button class="head__dots" data-act="noop" aria-label="更多操作">⋯</button>',
      body: table({
        id: 'entry', tight: true, sm: true, rowH: 44,
        cols: [
          { t: '所属分监区', w: '21%', cls: 't-first' },
          { t: '罪犯姓名', w: '16%', cls: '' },
          { t: '罪犯编号', w: '22%', cls: 't-num' },
          { t: '入监教育天数', w: '22%', cls: 't-num', sort: true },
          { t: '原因', w: '19%', cls: '', title: true }
        ],
        rows: d.entry.map(function (r) { return [r.area, r.name, r.code, r.days, r.reason]; })
      }) + '<div class="tbl-note tbl-note--52"><span class="cap">口径：入监教育应满 30 天；本表按天数升序，天数可排序</span></div>'
    });

    /* [02] 罪犯出监申请 446×288：5 列 20/12/22/20/26 */
    var c02 = card({
      no: '02', title: '罪犯出监申请', count: doneLabel(d.release.length), h: 288, cls: 'card--tbl',
      ops: '<button class="head__dots" data-act="noop" aria-label="更多操作">⋯</button>',
      body: table({
        id: 'release', tight: true, sm: true, rowH: 70,
        cols: [
          { t: '所属监区', w: '18%', cls: 't-first' },
          { t: '罪犯姓名', w: '16%', cls: '' },
          { t: '罪犯编号', w: '22%', cls: 't-num' },
          { t: '刑满释放日', w: '22%', cls: 't-time', sort: true },
          { t: '申请事由', w: '22%', cls: '', title: true }
        ],
        rows: d.release.map(function (r) { return [r.area, r.name, r.code, r.date, r.reason]; })
      }) + '<div class="tbl-note tbl-note--80"><span class="cap cap--wrap">说明：出监申请记录按刑满释放日升序排列；' +
        '申请事由为摘要列，悬停可看全文，完整事由以业务台账为准。</span></div>'
    });

    /* [03] 临释罪犯重大违规违纪 1 · 916×924（弹性）：表 76 + 8 字段详情 448 + 全文 132 + 底注 96 */
    var b = d.breach[0];
    var fields = [
      ['序号', String(b.no)],
      ['所属分监区', b.area],
      ['罪犯姓名', b.name],
      ['罪犯编号', b.code],
      ['处置类型', b.type],
      ['处置意见', b.advice],
      ['事由名称', b.reason],
      ['录入时间', b.time]
    ];
    var detailHtml = '<div class="fieldlist">' + fields.map(function (f) {
      return '<div class="fieldrow"><span class="fieldrow__k">' + esc(f[0]) + '</span>' +
        '<span class="fieldrow__v" title="' + attr(f[1]) + '">' + esc(f[1]) + '</span></div>';
    }).join('') + '</div>';

    var c03 = card({
      no: '03', title: '临释罪犯重大违规违纪', count: doneLabel(d.breach.length), h: 0, cls: 'card--tbl card--flex',
      ops: '<button class="head__dots" data-act="noop" aria-label="更多操作">⋯</button>',
      body: table({
        id: 'breach', sm: true, rowH: 56,
        cols: [
          { t: '序号', w: '6%', cls: 't-num' },
          { t: '所属分监区', w: '15%', cls: '' },
          { t: '罪犯姓名', w: '9%', cls: 't-first' },
          { t: '罪犯编号', w: '13%', cls: 't-num' },
          { t: '处置类型', w: '10%', cls: '' },
          { t: '处置意见', w: '12%', cls: '' },
          { t: '事由名称', w: '17%', cls: '', title: true },
          { t: '录入时间', w: '18%', cls: 't-time', sort: true }
        ],
        rows: d.breach.map(function (r) { return [r.no, r.area, r.name, r.code, r.type, r.advice, r.reason, r.time]; })
      }) +
        '<div class="detailhead"><span class="cap">该记录字段详情（8 个字段，与表列同源）</span></div>' +
        detailHtml +
        '<div class="fulltext"><span class="fulltext__k">事由全文与处置说明</span>' +
        '<span class="fulltext__v">' + esc(b.reason) + '：经分监区核实，该罪犯在临释前教育期内未服从民警现场管理，' +
        '已按' + esc(b.type) + '处理，' + esc(b.advice) + '；处置意见已录入考核系统并同步至临释衔接台账。</span></div>' +
        '<div class="spacer"></div>' +
        '<div class="notefoot">' +
        '<span class="cap">口径：统计区间 11-01 ~ 11-06 · 处置类型与处置意见为同一业务单据的两列</span>' +
        '<span class="cap">来源：教育改造违规违纪登记 · 录入时间 ' + esc(b.time) + '</span>' +
        '<span class="cap">数据更新时间 ' + esc(CK.meta.updated) + '</span>' +
        '</div>'
    });

    /* [04] 教育改造预警 ×4 446×924：排序条 32 + 4×144 + 3 分割 + 合计 96 */
    var w4 = warnItems('教育改造');
    var list4 = sortWarnings(w4, st.warnSort.p3 || 'sev');
    var bigHtml = list4.map(function (w) {
      var m = splitMetric(w.metric);
      return '<div class="wbig wbig--' + w.severity + '">' +
        '<div class="wbig__top"><span class="wbig__title" title="' + attr(w.title) + '">' + esc(w.title) + '</span>' +
        badge(w.severity) + '</div>' +
        '<div class="wbig__count">' + esc(m.v) + (m.u ? '<span>' + esc(m.u) + '</span>' : '') + '</div>' +
        '<div class="wbig__cap">' + esc(w.time) + ' · ' + esc(w.board) + (m.missing ? ' · 数据未接入' : '') +
        ' · 口径：' + (m.v === '0' ? '计数 0 为有效结论' : '按严重度判定') + '</div>' +
        '</div>';
    }).join('');

    var c04 = card({
      no: '04', title: '教育改造预警', count: '4 条', h: 924, cls: 'card--warn', sev: 'var(--warn-text)',
      ops: warnSortTabs('p3'),
      body: '<div class="warnbar">' +
        '<span class="warnbar__k">排序依据：' + warnSortBasis('p3') + '</span>' +
        '<span class="warnbar__k">共 ' + w4.length + ' 条</span>' +
        '</div>' +
        '<div class="wbiglist">' + bigHtml + '</div>' +
        '<div class="warnstat">' +
        '<span class="warnstat__t">本板块预警合计 <b>' +
        CK.warnings.items.filter(function (w) { return w.board === '教育改造' && w.severity !== 'normal'; }).length +
        '</b> 项</span>' +
        '<span class="warnstat__sev"><span>严重 0</span><span>预警 1</span><span>关注 0</span><span>正常 3</span></span>' +
        '</div>' +
        '<div class="warnfoot">' +
        '<span class="cap">口径：统计区间 11-01 ~ 11-06 · 仅统计本板块，正常级不计入待处置</span>' +
        '<span class="cap">来源：教育改造违规违纪登记与再犯罪评估专项</span>' +
        '</div>' +
        '<div class="warnhint">' +
        '<span class="cap">处置提示：普通罪犯出监前 3 个月须完成再犯罪危险性评估，逾期即计入本卡</span>' +
        '<span class="cap">点击条目可下钻至对应业务页，本页仅作汇总，不在此处处置</span>' +
        '</div>' +
        '<div class="infoblock infoblock--48">' +
        '<span class="cap cap--wrap">条目尺寸：本卡仅 4 条，按 §2.4.4-② 允许使用 144px 大号条目；' +
        '条数 ≥ 5 时回落到 72px，卡高不变。</span>' +
        '</div>' +
        '<div class="spacer"></div>'
    });

    return '<div class="page"><div class="page__cols">' +
      '<div class="col">' + c01 + c02 + '</div>' +
      '<div class="col">' + c03 + '</div>' +
      '<div class="col">' + c04 + '</div>' +
      '</div></div>';
  }

  /* ======================================================================== */
  /* P4 公正执法（柱 + 环 + Tab + 仪表 + 状态块 5 种组件）                     */
  /* ======================================================================== */

  function pageJustice() {
    var d = CK.data.p4;

    /* [03] 呈报前动态风控：扣分事件 446×560：内容 464 = Tab 32 + 图形区 240 + 图例 44 + 口径 40 + 说明 108 */
    var tab = st.donut.risk || 'score';
    var items = tab === 'score' ? d.risk.byScore : d.risk.byTime;
    var center = tab === 'score' ? { value: d.risk.center, sub: d.risk.centerSub } : { value: '120', sub: '事件' };
    var c03 = card({
      no: '03', title: '呈报前动态风控：扣分事件', count: items.length + ' 项', h: 560,
      ops: '<button class="head__dots" data-act="noop" aria-label="更多操作">⋯</button>',
      body: '<div class="tabbar">' +
        '<span class="warnbar__k">呈现维度</span>' +
        '<span class="tabs tabs--sm">' +
        '<button class="tab' + (tab === 'score' ? ' is-on' : '') + '" data-act="donut" data-k="risk" data-v="score">分值占比</button>' +
        '<button class="tab' + (tab === 'time' ? ' is-on' : '') + '" data-act="donut" data-k="risk" data-v="time">时间分布</button>' +
        '</span></div>' +
        '<div class="chartbox" style="height:248px">' +
        '<div class="donutrow">' +
        '<div class="donut" style="width:200px;height:200px">' +
        CH.donut({
          size: 200, ring: 20, centerSize: 40,
          segs: items.map(function (it, i) { return { value: it.value, color: PALETTE_HEX[i] }; }),
          center: center, label: '呈报前动态风控扣分事件'
        }) + '</div>' +
        legend(items.map(function (it, i) {
          return { name: it.name, pct: it.value + '%', color: PALETTE[i] };
        }), {}) +
        '</div></div>' +
        '<div class="axisnote axisnote--48">' +
        '<span class="cap">' + (tab === 'score' ? '分值占比：2.0 分 67% / 1.0 分 33%' : '时间分布：按同一批事件的录入时段分组') + '</span>' +
        '<span class="cap">口径：仅统计本区间内已触发扣分事件 · 环形 12 点起顺时针</span>' +
        '</div>' +
        '<div class="infoblock infoblock--136">' +
        '<span class="cap cap--wrap">说明：Tab 切换只切换图形，不重排卡片、不触发数据刷新；' +
        '两种视图共用同一批事件，分母一致，可直接横向对照。</span>' +
        '<span class="cap cap--wrap">图例列出每一段的名称与占比，色板按 S1→S6 顺序取用，不使用彩虹配色；' +
        '环形段间留 2px 卡底间隙，四段以上自动按占比降序归并。</span>' +
        '<span class="cap cap--wrap">数据来源：计分考核规则引擎 · 与左栏同案犯模型、右栏零异常卡共用同一统计区间。</span>' +
        '</div>'
    });

    /* [02] 同案犯减刑假释参考模型 446×348：仪表 0–6000，无指针 */
    var gm = d.commutation;
    var c02 = card({
      no: '02', title: '同案犯减刑假释参考模型', count: '1 项', h: 348,
      ops: '<button class="head__dots" data-act="noop" aria-label="更多操作">⋯</button>',
      body: '<div class="chartbox" style="height:168px">' +
        CH.gauge({
          w: 406, h: 168, value: gm.value, max: gm.max, ticks: gm.ticks,
          valueText: gm.value, unit: '人', centerSize: 32, label: '同案犯减刑假释参考模型'
        }) + '</div>' +
        '<div class="gaugelabel"><span class="gauge__name">参考人数 · 区间 0 ~ 6,000 人</span></div>' +
        '<div class="axisnote">' +
        '<span class="cap">口径：240° 弧长表达数值 · 无指针 · 刻度 0 / 3,000 / 6,000</span>' +
        '<span class="cap">来源：同案犯减刑假释参考模型 · 版本冻结 11-06</span>' +
        '</div><div class="spacer"></div>'
    });

    /* [01] 未呈报人员扣分预测 916×924（中栏主图）：内容 828
       = 绘图区 600 + X 轴标签 32 + 数值/口径 96 + 说明 36 + 呼吸 64
       绘图区 600 → SVG 658（padT 26 + 600 + labelH 32）；柱宽 48、组距 120 */
    var c01 = card({
      no: '01', title: '未呈报人员扣分预测', count: '3 项', h: 924,
      ops: '<button class="head__dots" data-act="noop" aria-label="更多操作">⋯</button>',
      body: '<div class="chartbox" style="height:658px">' +
        CH.bar({
          w: 884, h: 658, padT: 26, labelH: 32, padL: 56, padR: 24, barW: 48, bandW: 168,
          cats: d.report.cats, values: d.report.values, ticks: d.report.ticks, max: 22,
          label: '未呈报人员扣分预测'
        }) + '</div>' +
        '<div class="axisnote axisnote--96">' +
        '<span class="cap">Y 轴 0 / 7 / 13 / 20 / 22 · 单位：人</span>' +
        '<span class="cap">统计区间 11-01 ~ 11-06 · 按分值降序</span>' +
        '<span class="cap">基线完整可见 · 柱底与基线重合</span>' +
        '<span class="cap">第一分监区 22 人 · 第七分监区 17 人 · 第三分监区 12 人</span>' +
        '</div>' +
        '<div class="infoblock">' +
        '<span class="cap cap--wrap">说明：柱图独占中栏，柱宽与组距按画布放大（柱宽 48 / 组距 120），' +
        '三组数据仍为同一口径，可与左栏环形共用同一批扣分事件对照。</span>' +
        '</div>' +
        '<div class="spacer"></div>'
    });

    /* [04] 零异常 · 已核查 446×924：内容 828 = 3 格 × 220 + 2×16 + 说明区 96 + 呼吸 40
       §9 约束 3：0 件 / 0 例不是空态，四要素（数值 + 单位 + 已核查/已固化 徽标 + 口径行）必须齐 */
    function zerocell(name, num, unit, sev, sevText, cap, def) {
      return '<div class="zerocell">' +
        '<div class="zerocell__name">' + esc(name) + '</div>' +
        '<div class="zerocell__gap6"></div>' +
        '<div class="zerocell__valrow"><b class="zerocell__val">' + esc(num) + '</b>' +
        '<span class="zerocell__unit">' + esc(unit) + '</span></div>' +
        '<div class="zerocell__gap6"></div>' +
        '<div class="zerocell__badge">' + badge(sev, sevText) + '</div>' +
        '<div class="zerocell__gap6"></div>' +
        '<div class="zerocell__cap">' + esc(cap) + '</div>' +
        '<div class="zerocell__def">' + esc(def) + '</div>' +
        '</div>';
    }

    var c04 = card({
      no: '04', title: '零异常 · 已核查', count: '3 项', h: 924,
      ops: '<button class="head__dots" data-act="noop" aria-label="更多操作">⋯</button>',
      body: zerocell('办案超时', '0', '件', 'normal', '已核查', '统计区间 11-01 ~ 11-06',
        '超时定义：立案至结案 > 30 日；本区间无超时结案记录，计数 0 为有效结论。') +
        zerocell('证据未及时登记', '0', '件', 'normal', '已核查', '统计区间 11-01 ~ 11-06',
          '登记时限：证据入库后 24 小时内；本区间无逾期登记记录，计数 0 为有效结论。') +
        zerocell('计分考核', '0', '例', 'normal', '已固化', '统计区间 11-01 ~ 11-06 · 模型版本冻结 11-06',
          '计分考核规则已固化，命中规则的事件在呈报前被拦截；本区间无异常记录。') +
        '<div class="infoblock infoblock--108">' +
        '<span class="cap cap--wrap">说明：三格均为 0，属结论性数值，照常显示 0 并配「已核查 / 已固化」徽标，' +
        '不使用空态文案，也不以「—」代替。</span>' +
        '<span class="cap cap--wrap">口径：三项共用同一统计区间 11-01 ~ 11-06，单位为件 / 例；' +
        '数据来源为案件办理流程系统与计分考核规则引擎。</span>' +
        '<span class="cap cap--wrap">数据更新时间 ' + esc(CK.meta.updated) + '。</span>' +
        '</div>' +
        '<div class="spacer"></div>'
    });

    return '<div class="page"><div class="page__cols">' +
      '<div class="col">' + c03 + c02 + '</div>' +
      '<div class="col">' + c01 + '</div>' +
      '<div class="col">' + c04 + '</div>' +
      '</div></div>';
  }

  /* ======================================================================== */
  /* P5 卫生防疫                                                               */
  /* ======================================================================== */

  function pageHealth() {
    var d = CK.data.p5;
    var sum = d.clinic.reduce(function (a, b) { return a + b.value; }, 0);
    var max = d.clinic[0].value;

    /* [01] 医疗隐患预警 / 罪犯近1月因同一诊断多次就诊 446×924：8 条 ×92 + 合计 48 */
    var rowsHtml = d.clinic.map(function (r) {
      return '<div class="clinicrow">' +
        '<div class="clinicrow__name" title="' + attr(r.name) + '">' + esc(r.name) + '</div>' +
        '<div class="clinicrow__bar"><div class="bar12"><i style="width:' + Math.round(r.value / max * 100) + '%"></i></div></div>' +
        '<div class="clinicrow__val"><b class="num">' + r.value + '</b><span>人</span></div>' +
        '</div>';
    }).join('');

    var c01 = card({
      no: '01', title: '医疗隐患预警', count: '8 项', h: 924,
      ops: '<button class="head__dots" data-act="noop" aria-label="更多操作">⋯</button>',
      body: '<div class="carddesc carddesc--16" title="罪犯近 1 月因同一诊断多次就诊 · 统计区间 10-07 ~ 11-06">' +
        '罪犯近 1 月因同一诊断多次就诊 · 统计区间 10-07 ~ 11-06</div>' +
        rowsHtml +
        '<div class="sumrow sumrow--42"><span class="cap">合计</span><b class="num">' + sum + '</b>' +
        '<span class="cap">人次 · 8 个分监区 · 数值降序（同值按分监区序）</span></div>'
    });

    /* [02] 罪犯猝死风险评估 916×924（弹性）：内容 828
       = 环形区 380（环径 240 / 环宽 24 / 中心值 44 + 图例 4×44）+ 口径 96 + 构成说明 132 + 呼吸 44 */
    var sd = d.sudden;
    var c02 = card({
      no: '02', title: '罪犯猝死风险评估', count: '4 项', h: 924, cls: 'card--flex',
      ops: '<button class="head__dots" data-act="noop" aria-label="更多操作">⋯</button>',
      body: '<div class="donutbig donutbig--380">' +
        '<div class="donut" style="width:240px;height:240px">' +
        CH.donut({
          size: 240, ring: 24, centerSize: 44,
          segs: sd.items.map(function (it, i) { return { value: it.value, color: PALETTE_HEX[i] }; }),
          center: { value: sd.center, sub: '综合占比' }, label: '罪犯猝死风险评估综合占比'
        }) + '</div>' +
        '</div>' +
        '<div class="legendwrap legendwrap--col legendwrap--176">' +
        legend(sd.items.map(function (it, i) { return { pct: it.pct, color: PALETTE[i] }; }), { pctOnly: true }) +
        '<div class="cap cap--wrap">类别名称未随接口返回，仅提供占比</div>' +
        '</div>' +
        '<div class="infoblock infoblock--96">' +
        '<span class="cap cap--wrap">口径：统计区间 10-07 ~ 11-06 · 单位：占比 %；环形按占比降序分段，段间 2px 用卡底割开。</span>' +
        '<span class="cap cap--wrap">来源：门诊诊断记录与猝死风险评估模型 · 版本冻结 11-06。</span>' +
        '<span class="cap cap--wrap">数据更新时间 ' + esc(CK.meta.updated) + '。</span>' +
        '</div>' +
        '<div class="infoblock infoblock--132">' +
        '<span class="cap cap--wrap">构成说明：环形四段分别对应风险评估模型的四档结论，段长即该档在全部在押罪犯中的占比，' +
        '四段合计 100%；图例按同一顺序逐段列出占比，不另行标注名称。</span>' +
        '<span class="cap cap--wrap">读法：中心值 51% 为占比最高档；环形无面积渐变、无投影，' +
        '段间留 2px 卡底间隙用于区分相邻色块。</span>' +
        '</div>' +
        '<div class="spacer"></div>'
    });

    /* [03][04][05] 三类分值 446×300 / 300 / 292：内容 204 = 徽标 24 + 分值 48 + 6 + 指标名 22
       + 口径 18 + 含义说明 2 行 36 + 同源行 18 + 呼吸 32 */
    function scoreCard(s, h) {
      var mean = 54;
      return card({
        no: s.no, title: s.name, count: '1 项', h: h,
        ops: '<button class="head__dots" data-act="noop" aria-label="更多操作">⋯</button>',
        body: '<div class="scorecard6">' +
          '<div class="scorecard6__badge"><span class="badge badge--muted">已接入</span></div>' +
          '<div class="scorecard6__valrow"><b class="scorecard6__val">' + esc(s.value) + '</b></div>' +
          '<div class="scorecard6__gap6"></div>' +
          '<div class="scorecard6__name">' + esc(s.name) + '</div>' +
          '<div class="scorecard6__cap">' + esc(s.cap) + '</div>' +
          '<div class="scorecard6__mean" style="height:' + mean + 'px">' + esc(s.mean) + '</div>' +
          '<div class="scorecard6__mom">同源：与中栏猝死风险评估环形占比同源</div>' +
          '</div>' +
          '<div class="spacer"></div>'
      });
    }

    return '<div class="page"><div class="page__cols">' +
      '<div class="col">' + c01 + '</div>' +
      '<div class="col">' + c02 + '</div>' +
      '<div class="col">' + scoreCard(d.scores[0], 300) + scoreCard(d.scores[1], 300) + scoreCard(d.scores[2], 292) + '</div>' +
      '</div></div>';
  }

  /* ======================================================================== */
  /* P6 队伍管理                                                               */
  /* ======================================================================== */

  function pageTeam() {
    var d = CK.data.p6;

    /* [01] 民警饮酒风险预警 / 饮酒嗜好占比 446×710：内容 614
       = 环形区 240（环径 180 / 环宽 18）+ 图例 7 行 × 44(308) + 口径 36 + 呼吸 30 */
    var dr = d.drink;
    var top = dr.items.slice().sort(function (a, b) { return b.value - a.value; })[0];
    var drMax = top.value;
    var c01 = card({
      no: '01', title: '民警饮酒风险预警 / 饮酒嗜好占比', count: '7 项', h: 710,
      ops: '<button class="head__dots" data-act="noop" aria-label="更多操作">⋯</button>',
      body: '<div class="donutbig donutbig--240">' +
        '<div class="donut" style="width:180px;height:180px">' +
        CH.donut({
          size: 180, ring: 18, centerSize: 36,
          segs: dr.items.map(function (it, i) { return { value: it.value, color: PALETTE_HEX[i % 6] }; }),
          center: { value: top.pct, sub: top.name }, label: '饮酒嗜好占比'
        }) + '</div>' +
        '</div>' +
        '<div class="legend legend--detail">' +
        dr.items.map(function (it, i) {
          return '<div class="legend__row legend__row--44">' +
            '<i class="legend__dot" style="background:' + PALETTE[i % 6] + '"></i>' +
            '<span class="legend__name">' + esc(it.name) + '</span>' +
            '<span class="legend__meter"><i style="width:' +
            (drMax ? Math.round(it.value / drMax * 100) : 0) + '%"></i></span>' +
            '<span class="legend__val">' + esc(it.pct) + '</span>' +
            '</div>';
        }).join('') +
        '</div>' +
        '<div class="infoblock infoblock--66">' +
        '<span class="cap cap--wrap">口径：按民警饮酒嗜好申报类别统计，中心值为占比最高类别「' + esc(top.name) + '」；' +
        '条形长度 = 相对最高类别比例。</span>' +
        '<span class="cap">来源：民警健康与行为风险档案 · 区间 11-01 ~ 11-06</span>' +
        '</div>' +
        '<div class="spacer"></div>'
    });

    /* [02] 待接入模块 (2) 446×198：八小时外重点风险预警 / 勤务管理模型（§9.3） */
    var agg2 = aggCard({
      no: '02',
      items: [
        { name: '民警八小时外重点风险预警', pos: '左栏 · 见 §2.7 区块 02' },
        { name: '民警勤务管理模型', pos: '左栏 · 见 §2.7 区块 03' }
      ]
    });

    /* [04] 基本情况 916×320：2 行 × 4 格，格高 104 */
    var info = d.base.map(function (b) {
      return '<div class="info__cell">' +
        '<div class="info__name" title="' + attr(b.name) + '">' + esc(b.name) + '</div>' +
        '<div class="info__valrow"><b class="info__val num' + (b.value === '—' ? ' dash' : '') + '">' + esc(b.value) + '</b>' +
        (b.unit ? '<span class="info__unit">' + esc(b.unit) + '</span>' : '') + '</div>' +
        '<div class="info__cap cap" title="' + attr(b.cap) + '">' + esc(b.cap) + '</div>' +
        '</div>';
    }).join('');

    var c04 = card({
      no: '04', title: '基本情况', count: '6 项', h: 320,
      ops: '<span class="head__hint">在押与警力 · 人员流动</span>',
      body: '<div class="infogrid">' + info + '</div>'
    });

    /* [05] 风险占比 3 仪表共用一条基线 916×588 */
    var gs = d.gauges;
    var gHtml = gs.map(function (g) {
      return '<div class="gauge">' +
        '<div class="chartbox" style="height:298px">' +
        CH.gauge({
          w: 289, h: 298, value: g.value, max: g.max, ticks: [0, g.max / 2, g.max],
          valueText: g.value.toFixed(1) + '%', centerSize: 32, label: g.name
        }) + '</div>' +
        '<div class="gauge__name">' + esc(g.name) + '</div>' +
        '</div>';
    }).join('');

    var c05 = card({
      no: '05', title: '风险占比', count: '3 项', h: 588,
      ops: '<button class="head__dots" data-act="noop" aria-label="更多操作">⋯</button>',
      body: '<div class="gauges">' + gHtml + '</div>' +
        '<div class="gaugebase"><span class="gaugebase__line"></span>' +
        '<span class="cap">3 个仪表共用一条基线 · 刻度行 y 坐标一致 · 无指针</span></div>' +
        '<div class="notefoot notefoot--96">' +
        '<span class="cap">口径：比率为该风险类别占全体民警的加权比例，保留 1 位小数</span>' +
        '<span class="cap">区间 11-01 ~ 11-06 · 单位：%</span>' +
        '<span class="cap">来源：队伍风险模型 · 版本冻结 11-06</span>' +
        '</div>' +
        '<div class="infoblock infoblock--52">' +
        '<span class="cap cap--wrap">读法：三支仪表共用同一条基线与同一组刻度（0 / 50 / 100），弧长即比率；' +
        '仪表无指针，中心值即当前比率，三个口径可直接横向比较。</span>' +
        '</div>' +
        '<div class="spacer"></div>'
    });

    /* [06] 队伍风险追踪器 / 四涉分布 446×924（弹性） */
    var f = d.four;
    var ftop = f.items.slice().sort(function (a, b) { return b.value - a.value; })[0];
    var c06 = card({
      no: '06', title: '队伍风险追踪器 / 四涉分布', count: '5 项', h: 924, cls: 'card--flex',
      ops: '<button class="head__dots" data-act="noop" aria-label="更多操作">⋯</button>',
      body: '<div class="donutbig donutbig--320">' +
        '<div class="donut" style="width:240px;height:240px">' +
        CH.donut({
          size: 240, ring: 24, centerSize: 48,
          segs: f.items.map(function (it, i) { return { value: it.value, color: PALETTE_HEX[i % 6] }; }),
          center: { value: ftop.pct, sub: ftop.name }, label: '四涉分布'
        }) + '</div>' +
        '</div>' +
        '<div class="legendwrap legendwrap--132">' +
        legend(f.items.map(function (it, i) { return { name: it.name, pct: it.pct, color: PALETTE[i % 6] }; }), { twoCol: true }) +
        '</div>' +
        '<div class="infoblock infoblock--96">' +
        '<span class="cap cap--wrap">口径：四涉指涉赌 / 涉黄 / 涉毒 / 涉黑四类风险线索，按占比降序；' +
        '「其他」为未归入四涉的剩余类别，中心值为占比最高类别。</span>' +
        '<span class="cap cap--wrap">来源：队伍风险追踪器 · 区间 11-01 ~ 11-06 · 数据更新时间 ' + esc(CK.meta.updated) + '。</span>' +
        '<span class="cap cap--wrap">图例两列排布，名称与占比同源；色板按 S1→S6 顺序取用，不使用彩虹配色。</span>' +
        '</div>' +
        '<div class="infoblock infoblock--216">' +
        '<span class="cap cap--wrap">构成说明：四涉线索按线索类型归并统计，同一民警涉及多类时分别计入；' +
        '「其他」为未归入四涉的剩余线索，五项合计 100%。</span>' +
        '<span class="cap cap--wrap">读法：中心值 37% 为「其他」类别占比，说明本区间四类风险线索占比合计 63%，' +
        '未形成单一类别主导；涉黑类仅 2%，属低频高敏线索，仍需按严重度单独跟踪。</span>' +
        '<span class="cap cap--wrap">与中栏「风险占比」三支仪表同源同区间，仪表看单类比率，环形看类别结构，两者分母一致。</span>' +
        '</div>' +
        '<div class="spacer"></div>'
    });

    return '<div class="page"><div class="page__cols">' +
      '<div class="col">' + c01 + agg2 + '</div>' +
      '<div class="col">' + c04 + c05 + '</div>' +
      '<div class="col">' + c06 + '</div>' +
      '</div></div>';
  }

  /* ======================================================================== */
  /* 设计规范页 #/tokens                                                       */
  /* ======================================================================== */

  function pageTokens() {
    /* 规格页随主题自证：色值实时取当前主题的 CSS 变量，对比度现算，
       这样 cockpit / calm 两套皮肤下都不会出现「色块与标注不符」 */
    function cv(name) {
      var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || '';
    }
    function toRGB(c) {
      c = String(c).trim();
      if (c.charAt(0) === '#') {
        var h = c.length === 4 ? c[1] + c[1] + c[2] + c[2] + c[3] + c[3] : c.slice(1);
        return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
      }
      var m = c.match(/[\d.]+/g);
      return m ? m.slice(0, 3).map(Number) : [0, 0, 0];
    }
    function relLum(c) {
      var m = toRGB(c);
      var f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]);
    }
    function ratio(c) {
      var a = relLum(c), b = relLum(cv('--bg-card'));
      var hi = Math.max(a, b), lo = Math.min(a, b);
      return ((hi + 0.05) / (lo + 0.05)).toFixed(2);
    }

    var bg = [
      ['--bg-canvas', '#04080E', '画布 / 顶栏 / 底导航'],
      ['--bg-region', '#0A1520', '区块底 / 表头 / 输入框'],
      ['--bg-card', '#0E1C2A', '业务卡片（基准）'],
      ['--bg-elevated', '#13293C', '下拉 / Tooltip / 模态'],
      ['--bg-row-hover', 'rgba(59,158,255,.06)', '表格行 hover'],
      ['--border-divider', 'rgba(59,158,255,.14)', '卡片内部线'],
      ['--border-default', 'rgba(59,158,255,.30)', '卡片外框']
    ];
    var neu = [
      ['--neutral-0', '#E8F2FF', '大数字'],
      ['--neutral-1', '#C9DFF2', '标题'],
      ['--neutral-2', '#AFC6DC', '正文 14px'],
      ['--neutral-3', '#7E96AE', '次文字 13px（地板）'],
      ['--neutral-4', '#6C8AA6', '弱文字（不承载数据）'],
      ['--neutral-5', '#35506A', '图形件'],
      ['--neutral-6', '#1B2E42', '极弱分隔']
    ];
    var sem = [
      ['--blue-600', '#2F86D8', '主色实底'],
      ['--blue-400', '#3B9EFF', '主色深底文字 / 焦点环'],
      ['--ok-text', '#2FD9A8', '正常'],
      ['--warn-text', '#FFAA3B', '预警'],
      ['--danger-text', '#FF5C5C', '危险'],
      ['--s1', '#3B9EFF', '图表主序列'],
      ['--s2', '#39D2E0', '图表第二序列']
    ];

    function swatch(list) {
      return '<div class="swatches">' + list.map(function (s) {
        var hex = cv(s[0]) || s[1];
        var isHex = hex.charAt(0) === '#';
        /* 只有不透明色才给对比度；rgba 给出的是合成前色值，标注比值会误导 */
        var meta = isHex ? (hex + ' · ' + ratio(hex) + ':1') : (hex + ' · 半透明');
        return '<div class="swatch"><div class="swatch__chip" style="background:' + hex + '"></div>' +
          '<div class="swatch__meta"><span class="swatch__name">' + s[0] + '</span>' +
          '<span class="swatch__hex">' + meta + ' · ' + s[2] + '</span></div></div>';
      }).join('') + '</div>';
    }

    var typeRows = [
      ['--fs-display', '44px/48 600', '1,792', 'font-size:44px;line-height:48px'],
      ['--fs-metric', '32px/38 600', '2,043', ''],
      ['--fs-h1', '26px/34 600', '监管改造', ''],
      ['--fs-h2', '18px/26 600', '模型数量分布', ''],
      ['--fs-h3', '15px/22 500', '案件办理', ''],
      ['--fs-body', '14px/22 400', '罪犯心理危机预警 · 表格正文', ''],
      ['--fs-sm', '13px/20 400', '累计 · 未发原因=住院', ''],
      ['--fs-xs', '12px/18 400', '2026-11-06 17:11:24', '']
    ].map(function (r) {
      /* 阶梯样本与右侧规格都从当前主题的 token 现取，切主题后不再对不上 */
      var size = cv(r[0]);
      var lh = cv(r[0].replace('fs', 'lh'));
      var weight = String(r[1]).split(' ').pop();
      return '<div class="type-row"><span class="type-row__tok">' + r[0] + '</span>' +
        '<span class="type-row__sample" style="font-size:' + size + ';line-height:' + lh + '">' + r[2] + '</span>' +
        '<span class="type-row__tok" style="margin-left:auto;text-align:right">' + size + '/' + lh + ' ' + weight + '</span></div>';
    }).join('');

    var spaceRows = [['--s-1', 4], ['--s-2', 8], ['--s-3', 12], ['--s-4', 16], ['--s-5', 20],
      ['--s-6', 24], ['--s-7', 32], ['--s-8', 40], ['--s-9', 48], ['--s-10', 64]]
      .map(function (s) {
        return '<div class="space-row"><span class="space-row__tok">' + s[0] + '</span>' +
          '<span class="space-row__bar" style="width:' + s[1] * 3 + 'px"></span>' +
          '<span class="space-row__val">' + s[1] + 'px</span></div>';
      }).join('');

    /* 6 类组件各一例 */
    var demoCard = card({
      no: '01', title: '业务卡片（含板块标题五要素）', count: '13 项', h: 0,
      ops: '<a class="btn-link" href="#/tokens" data-act="noop">详情 ›</a>',
      body: '<div class="spec-note">背景 --bg-card + 1px --border-default 描边 + 4px 圆角 + padding 20；' +
        '标题块固定 44px（编号 / 竖分隔 / 18px 标题 / 计数 / 操作），标题下 1px --border-divider。</div>'
    });

    var demoKpi = '<div style="height:122px">' + kpiBand([
      { name: '罪犯分数情况', value: '21', unit: '人', cap: '统计区间 11-01 ~ 11-06' },
      { name: '罪犯被卡管理', value: '11', unit: '人', cap: '统计区间 11-01 ~ 11-06' },
      { name: '罪犯通连管理', value: '273', unit: '', cap: '统计区间 11-01 ~ 11-06' },
      { name: '罪犯分数异常', value: '6', unit: '人', cap: '统计区间 11-01 ~ 11-06' }
    ]) + '</div>';

    var demoTbl = card({
      no: '02', title: '数据表格（sticky 表头 / 固定列宽 / 排序）', count: '共 3 条', h: 0, cls: 'card--tbl',
      body: table({
        id: 'demo', pager: false,
        cols: [
          { t: '序号', w: '10%', cls: 't-num', sort: true },
          { t: '罪犯编号', w: '28%', cls: 't-num' },
          { t: '罪犯姓名', w: '20%', cls: 't-first' },
          { t: '危险等级', w: '18%', cls: '' },
          { t: '签发时间', w: '24%', cls: 't-time', sort: true }
        ],
        rows: [[1, '330124770', '夏建明', '人身', '2026-08-30 19:12'],
               [2, '330125183', '顾伟', '日常', '2026-08-28 15:02'],
               [3, '330126604', '周海兵', '突发', '2026-08-26 10:31']]
      })
    });

    var demoWarn = '<div class="card" style="height:auto"><div class="card__body">' +
      '<div class="wlist">' + warnItems().slice(0, 2).map(function (w) {
        var m = splitMetric(w.metric);
        return '<button class="witem witem--' + w.severity + '" data-act="noop">' +
          '<span class="witem__main"><span class="witem__line1">' + badge(w.severity) +
          '<span class="witem__title">' + esc(w.title) + '</span></span>' +
          '<span class="witem__sub">' + esc(w.time + ' · ' + w.board) + '</span></span>' +
          '<span class="witem__val">' + esc(m.v) + (m.u ? '<span>' + esc(m.u) + '</span>' : '') + '</span></button>';
      }).join('') + '</div></div></div>';

    var demoBadges = '<div class="spec-badges">' +
      badge('critical') + badge('warning') + badge('attention') + badge('normal') +
      badge('normal', '已固化') + '<span class="badge badge--muted">占位</span></div>';

    var demoBtns = '<div class="spec-btns"><button class="btn">主按钮</button>' +
      '<button class="btn btn--ghost">次按钮</button>' +
      '<a class="btn-link" href="#/tokens" data-act="noop">文字按钮 ›</a>' +
      '<span class="tabs"><button class="tab is-on">Tab 激活</button><button class="tab">Tab 默认</button></span>' +
      '<select class="sel"><option>全局筛选 · 全部监区</option></select></div>';

    /* 4 类图表各一例 */
    var demoLine = '<div class="chartbox" style="height:180px">' + CH.line({
      w: 560, h: 180, cats: ['未核查状态', '正在核查中', '核查完毕'], values: [8, 24, 41],
      ticks: [0, 17, 33, 50], max: 50, padL: 40, label: '折线示例'
    }) + '</div>';

    var demoBar = '<div class="chartbox" style="height:180px">' + CH.bar({
      w: 560, h: 180, cats: ['第一分监区', '第七分监区', '第三分监区'], values: [22, 17, 12],
      ticks: [0, 7, 13, 20, 22], max: 22, padL: 40, barW: 24, label: '柱状示例'
    }) + '</div>';

    var demoDonut = '<div class="donutrow" style="height:180px">' +
      '<div class="donut" style="width:120px;height:120px">' +
      CH.donut({
        size: 120, ring: 12, centerSize: 28,
        segs: [{ value: 67, color: PALETTE_HEX[0] }, { value: 33, color: PALETTE_HEX[1] }],
        center: { value: '2.0', sub: '67%' }, label: '环形示例'
      }) + '</div>' +
      legend([{ name: '2.0 分', pct: '67%', color: PALETTE[0] }, { name: '1.0 分', pct: '33%', color: PALETTE[1] }], {}) +
      '</div>';

    var demoGauge = '<div class="chartbox" style="height:198px">' + CH.gauge({
      w: 560, h: 198, value: 842, max: 6000, ticks: [0, 3000, 6000], valueText: '842', unit: '人', label: '仪表示例'
    }) + '</div>';

    return '<div class="spec">' +
      '<div class="spec__sec"><div class="spec__h"><b>色板 · 背景 4 级 + 中性 7 级</b><i>禁用第 5 级背景 / 禁用纯白（蓝实底按钮除外）</i></div>' +
      swatch(bg) + '<div style="height:8px"></div>' + swatch(neu) + '</div>' +

      '<div class="spec__sec"><div class="spec__h"><b>色板 · 主色与语义色</b><i>语义色只表达状态：预警条目 / 状态徽标 / 环比 / 阈值超限</i></div>' +
      swatch(sem) + '</div>' +

      '<div class="spec__sec"><div class="spec__h"><b>字号阶梯</b><i>12px 为绝对地板；数字一律 tabular-nums</i></div>' +
      '<div class="spec__grid2"><div>' + typeRows + '</div>' +
      '<div><div class="spec-note">观看距离三档（顶栏「近 / 中 / 远」切换，只换字号 token，不使用 transform: scale）：<br>' +
      'near ≤1.5m 基准；mid 1.5–3m 数据类 12px 升一档；far ≥3m display ×1.25、h1 ×1.20、h2 ×1.10、禁止 12px 承载数据。</div></div></div></div>' +

      '<div class="spec__sec"><div class="spec__h"><b>间距标尺</b><i>8pt 基准，只用这 10 档，禁止 5/7/9/11px</i></div>' +
      '<div class="spec__grid2">' + spaceRows + '</div></div>' +

      '<div class="spec__sec"><div class="spec__h"><b>组件 · 6 类各一例</b><i>业务卡片 / 板块标题 / KPI 格 / 表格 / 预警条目 / 按钮与徽标</i></div>' +
      demoCard + demoKpi + demoTbl + demoWarn + demoBadges + demoBtns + '</div>' +

      '<div class="spec__sec"><div class="spec__h"><b>图表 · 4 类各一例</b><i>手写 SVG，无第三方库；仅水平网格，基线完整可见</i></div>' +
      '<div class="spec__grid2">' +
      '<div class="card"><div class="card__body"><div class="spec-note">① 折线：线宽 1.5，3 点内开 symbol 2.5，无平滑曲线</div>' + demoLine + '</div></div>' +
      '<div class="card"><div class="card__body"><div class="spec-note">② 柱状：柱宽 24，柱顶 2px 圆角，柱底贴基线</div>' + demoBar + '</div></div>' +
      '<div class="card"><div class="card__body"><div class="spec-note">③ 环形：12 点起顺时针，段间 2px 用卡底割开</div>' + demoDonut + '</div></div>' +
      '<div class="card"><div class="card__body"><div class="spec-note">④ 仪表：240° 缺口朝下，无指针，仅 3 刻度</div>' + demoGauge + '</div></div>' +
      '</div></div>' +
      '</div>';
  }

  /* ======================================================================== */
  /* 壳层：顶栏 / 底部导航 / 路由                                               */
  /* ======================================================================== */

  var PAGES = {
    home: { title: '数智综合驾驶舱', sub: '', fn: pageHome, nav: 'home' },
    supervision: { title: '监管改造', sub: '', fn: pageSupervision, nav: 'supervision' },
    labor: { title: '劳动改造', sub: '', fn: pageLabor, nav: 'labor' },
    education: { title: '教育改造', sub: '', fn: pageEducation, nav: 'education' },
    justice: { title: '公正执法', sub: '「两项指数」智能优化', fn: pageJustice, nav: 'justice' },
    health: { title: '卫生防疫', sub: '', fn: pageHealth, nav: 'health' },
    team: { title: '队伍管理', sub: '', fn: pageTeam, nav: 'team' },
    tokens: { title: '设计规范', sub: '色板 / 字号 / 间距 / 组件 / 图表', fn: pageTokens, nav: '' }
  };

  function renderTop() {
    var p = PAGES[st.route] || PAGES.home;
    var sum = CK.warnings.summary;
    var dists = [['near', '近'], ['mid', '中'], ['far', '远']];
    var html = '<div class="top__brand">' +
      '<span class="top__sys">' + esc(CK.meta.sys) + '</span>' +
      '<span class="top__vsep"></span>' +
      '<span class="top__prison">' + esc(CK.meta.prison) + '</span>' +
      '<span class="top__vsep"></span>' +
      '<span class="themesw" role="group" aria-label="界面主题">' +
      '<button class="themesw__b' + (st.theme === 'cockpit' ? ' is-on' : '') + '" data-act="theme" data-v="cockpit"' +
      (st.theme === 'cockpit' ? ' aria-pressed="true"' : ' aria-pressed="false"') + '>驾驶舱</button>' +
      '<button class="themesw__b' + (st.theme === 'calm' ? ' is-on' : '') + '" data-act="theme" data-v="calm"' +
      (st.theme === 'calm' ? ' aria-pressed="true"' : ' aria-pressed="false"') + '>沉静</button>' +
      '</span>' +
      '</div>' +
      '<div class="top__center">' +
      (st.route === 'home' ? '' :
        '<span class="top__title" tabindex="-1">' + esc(p.title) + '</span>' +
        (p.sub ? '<span class="top__sub" title="' + attr(p.sub) + '">' + esc(p.sub) + '</span>' : '')) +
      '</div>' +
      '<div class="top__right">' +
      '<div class="top__group"><span class="top__upd">更新 ' + esc(CK.meta.time) + '</span>' +
      '<span class="top__alarm">异常 <b>' + sum.total + '</b></span></div>' +
      '<div class="tabs tabs--dist" role="group" aria-label="观看距离">' +
      dists.map(function (d) {
        return '<button class="tab' + (st.dist === d[0] ? ' is-on' : '') + '" data-act="dist" data-v="' + d[0] + '">' + d[1] + '</button>';
      }).join('') + '</div>' +
      '<button class="btn btn--ghost fxbtn" data-act="fx" aria-label="光效强度" ' +
      'title="光效三态：开 / LED 衰减 / 关">特效 ' +
      (st.fx === 'on' ? '开' : (st.fx === 'led' ? 'LED' : '关')) + '</button>' +
      '<button class="btn btn--ghost" data-act="filter" aria-haspopup="true">全局筛选 ▾</button>' +
      '<button class="btn btn--ghost" data-act="fullscreen" style="width:32px;padding:0;justify-content:center" aria-label="全屏">' +
      '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" stroke="#8494A6" stroke-width="1.3"/></svg></button>' +
      '<span class="top__weather">' + esc(CK.meta.weather) + '</span>' +
      '</div>';

    if (st.filterOpen) {
      html += '<div class="popover" role="dialog" aria-label="全局筛选">' +
        '<div class="row"><span>时间区间</span><select class="sel"><option>11-01 ~ 11-06</option><option>10-07 ~ 11-06</option><option>本月</option></select></div>' +
        '<div class="row"><span>监区</span><select class="sel"><option>全部监区</option><option>一监区</option><option>二监区</option></select></div>' +
        '<div class="row"><span>分监区</span><select class="sel"><option>全部分监区</option><option>一分监区</option><option>二分监区</option></select></div>' +
        '<div class="popover__foot"><button class="btn btn--ghost" data-act="filterclose">取消</button>' +
        '<button class="btn" data-act="filterapply">应用</button></div>' +
        '</div>';
    }
    document.getElementById('ck-top').innerHTML = html;
  }

  function renderNav() {
    var p = PAGES[st.route] || PAGES.home;
    document.getElementById('ck-nav').innerHTML = CK.nav.map(function (n) {
      return '<a class="navitem' + (p.nav === n.key ? ' is-on' : '') + '" href="' + n.route + '" data-act="goto" data-route="' +
        n.route + '">' + esc(n.label) + '</a>';
    }).join('');
  }

  function renderMain(enter) {
    var p = PAGES[st.route] || PAGES.home;
    var main = document.getElementById('ck-main');
    main.className = 'ck__main' + (st.loading ? ' is-loading' : '') + (st.route === 'tokens' ? ' is-scroll' : '');
    main.innerHTML = '<div class="' + (st.route === 'tokens' ? 'specwrap' : 'pagetop') + '">' +
      (enter ? '' : '') + p.fn() + '</div>';
    var pageEl = main.querySelector('.page');
    if (pageEl) { pageEl.classList.add('is-enter'); }
    main.scrollTop = 0;

    /* 首页中区 3D 背景层：重渲染后重新挂载（V5.5 独立 canvas） */
    if (CK.stage3d) CK.stage3d.sync();
    document.title = p.title + ' · ' + CK.meta.sys;

    /* 入场 stagger：只在路由切换 / 主题切换的首帧挂类，状态重渲染不挂，避免闪烁 */
    var root = document.documentElement;
    if (enter) {
      root.classList.add('ck-enter');
      countUp(main);
      window.setTimeout(function () { root.classList.remove('ck-enter'); }, 900);
    }
  }

  /* 主题落盘：<html data-theme> 决定 tokens，CK.chart.theme 决定柱体渐变/端点圆点 */
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', st.theme);
    if (CK.chart && CK.chart.setTheme) CK.chart.setTheme(st.theme);
  }

  /* 光效三态 + 动效开关落盘（visual §4.4） */
  function applyFx() {
    var root = document.documentElement;
    root.setAttribute('data-fx', st.fx);
    root.setAttribute('data-motion', st.motion);
    if (CK.stage3d && CK.stage3d.sync) CK.stage3d.sync();
  }

  /* 数字 count-up 400ms：只对纯整数文本生效，tabular-nums 保证不抖动 */
  function countUp(root) {
    if (!root || !window.matchMedia) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (st.theme !== 'cockpit') return;
    var els = root.querySelectorAll('.kpi__val, .hcell__val');
    Array.prototype.forEach.call(els, function (el) {
      var raw = (el.textContent || '').trim();
      if (!/^\d{1,3}(,\d{3})*$/.test(raw)) return;
      var target = parseInt(raw.replace(/,/g, ''), 10);
      if (!target) return;
      var t0 = 0;
      function step(t) {
        if (!t0) t0 = t;
        var k = Math.min((t - t0) / 400, 1);
        var v = Math.round(target * (1 - Math.pow(1 - k, 3)));
        el.textContent = String(v);
        if (k < 1) requestAnimationFrame(step);
        else el.textContent = raw;
      }
      el.textContent = '0';
      requestAnimationFrame(step);
    });
  }

  function render(enter) {
    renderTop();
    renderNav();
    renderMain(enter);
  }

  function applyRoute() {
    var h = (location.hash || '#/home').replace(/^#\/?/, '');
    if (!PAGES[h]) h = 'home';
    var changed = h !== st.route;
    st.route = h;
    if (changed) {
      st.tbl = {};
      st.filterOpen = false;
      st.warnSort = {};
    }
    render(changed);
    if (changed) {
      var t = document.querySelector('.top__title');
      if (t) t.focus && t.focus();
    }
  }

  /* ------------------------------------------------------------------------ */
  /* 交互                                                                      */
  /* ------------------------------------------------------------------------ */

  function onClick(e) {
    var el = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!el) {
      if (st.filterOpen && !e.target.closest('.popover') && !e.target.closest('[data-act="filter"]')) {
        st.filterOpen = false;
        renderTop();
      }
      return;
    }
    var act = el.getAttribute('data-act');

    if (act === 'goto') {
      var r = el.getAttribute('data-route');
      e.preventDefault();
      if (r && location.hash !== r) location.hash = r;
      return;
    }
    if (act === 'noop') { e.preventDefault(); return; }
    if (act === 'warn') {
      var rr = el.getAttribute('data-route');
      e.preventDefault();
      if (rr && location.hash !== rr) location.hash = rr;
      return;
    }
    if (act === 'sort') {
      var id = el.getAttribute('data-tbl');
      var i = parseInt(el.getAttribute('data-i'), 10);
      var s = tstate(id);
      if (s.si !== i) { s.si = i; s.dir = -1; }
      else if (s.dir === -1) { s.dir = 1; }
      else if (s.dir === 1) { s.dir = 0; s.si = -1; }
      else { s.dir = -1; }
      render(false);
      return;
    }
    if (act === 'page') {
      var id2 = el.getAttribute('data-tbl');
      var p = parseInt(el.getAttribute('data-p'), 10);
      var s2 = tstate(id2);
      if (p >= 1) s2.page = p;
      render(false);
      return;
    }
    if (act === 'row') {
      var id3 = el.getAttribute('data-tbl');
      var r3 = parseInt(el.getAttribute('data-row'), 10);
      var s3 = tstate(id3);
      s3.sel = s3.sel === r3 ? -1 : r3;
      render(false);
      return;
    }
    if (act === 'warnsort') {
      st.warnSort[el.getAttribute('data-key')] = el.getAttribute('data-v');
      render(false);
      return;
    }
    if (act === 'view') {
      st.view[el.getAttribute('data-k')] = el.getAttribute('data-v');
      render(false);
      return;
    }
    if (act === 'donut') {
      st.donut[el.getAttribute('data-k')] = el.getAttribute('data-v');
      render(false);
      return;
    }
    if (act === 'theme') {
      st.theme = el.getAttribute('data-v') === 'calm' ? 'calm' : 'cockpit';
      applyTheme();
      render(true);          /* 重渲染以让柱体渐变/端点圆点按新主题重建 */
      return;
    }
    if (act === 'fx') {
      /* on → led → off → on */
      st.fx = st.fx === 'on' ? 'led' : (st.fx === 'led' ? 'off' : 'on');
      applyFx();
      renderTop();
      return;
    }
    if (act === 'dist') {
      st.dist = el.getAttribute('data-v');
      document.documentElement.setAttribute('data-reading-distance', st.dist);
      render(false);
      return;
    }
    if (act === 'filter') { st.filterOpen = !st.filterOpen; renderTop(); return; }
    if (act === 'filterclose') { st.filterOpen = false; renderTop(); return; }
    if (act === 'filterapply') {
      st.filterOpen = false;
      var now = new Date();
      var hh = String(now.getHours()).padStart(2, '0');
      var mm = String(now.getMinutes()).padStart(2, '0');
      var ss = String(now.getSeconds()).padStart(2, '0');
      CK.meta.time = hh + ':' + mm + ':' + ss;
      CK.meta.updated = '2026-11-06 ' + CK.meta.time;
      st.loading = true;
      render(false);
      setTimeout(function () { st.loading = false; render(false); }, 620);
      return;
    }
    if (act === 'fullscreen') {
      var d = document.documentElement;
      if (!document.fullscreenElement) { if (d.requestFullscreen) d.requestFullscreen(); }
      else if (document.exitFullscreen) { document.exitFullscreen(); }
      return;
    }
  }

  function onKey(e) {
    if (e.key === 'Escape' && st.filterOpen) { st.filterOpen = false; renderTop(); }
  }

  /* ------------------------------------------------------------------------ */
  /* 启动                                                                      */
  /* ------------------------------------------------------------------------ */

  CK.boot = function () {
    var init = (location.hash || '#/home').replace(/^#\/?/, '');
    st.route = PAGES[init] ? init : 'home';
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      st.motion = 'reduced';
    }
    document.documentElement.setAttribute('data-reading-distance', st.dist);
    applyTheme();
    applyFx();
    render(true);
    window.addEventListener('hashchange', applyRoute);
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
  };

  CK.PAGES = PAGES;
  CK.st = st;
})();
