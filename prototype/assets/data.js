/* ==========================================================================
   data.js — 全部 mock 数据
   字段清单唯一来源：docs/00-brief.md §3（字段名 / 层级 / 顺序一律不改）
   数值缺失处一律 "—"（禁止补 0）；每处 "—" 均配 12px「数据未接入」说明
   ========================================================================== */

window.CK = window.CK || {};

/* --------------------------------------------------------------------------
   全局元信息（顶栏）
   -------------------------------------------------------------------------- */
CK.meta = {
  sys: '数智综合驾驶舱',
  prison: '浙江省乔司监狱',
  weather: '晴 17~28℃',
  time: '17:12:04',
  updated: '2026-11-06 17:12:04',
  range: '统计区间 11-01 ~ 11-06'
};

/* --------------------------------------------------------------------------
   预警严重度 —— 内联自 docs/25-warning-severity.json，改动请同步
   （file:// 下 fetch 会被 CORS 拦截，故原样内联，不在运行时读取 JSON）
   -------------------------------------------------------------------------- */
CK.warnings = {
  "schema": "warning-severity@1",
  "source": "docs/00-brief.md §3 与 docs/15-decisions.md D3；严重度模型见 docs/20-layout-spec.md §3.2",
  "note": "total 为待处置预警（critical + warning + attention），不含 normal；条目总数为 11。metric 为 brief 原文派生数值，无源数据者记为 \"—\"（禁止补 0）。",
  "summary": { "total": 8, "critical": 3, "warning": 3, "attention": 2, "normal": 3 },
  "items": [
    { "board": "监管改造", "title": "人数清点互监身份异常", "severity": "critical", "metric": "7 人" },
    { "board": "监管改造", "title": "劳动工具清点人身识别异常", "severity": "critical", "metric": "9 例" },
    { "board": "监管改造", "title": "渗透破坏监管秩序预警", "severity": "critical", "metric": "—" },
    { "board": "监管改造", "title": "监外罪犯事务管理", "severity": "warning", "metric": "4 人" },
    { "board": "监管改造", "title": "罪犯消费异常预警", "severity": "warning", "metric": "11 人" },
    { "board": "教育改造", "title": "普通罪犯出监前3个月未完成再犯罪危险性评估", "severity": "warning", "metric": "1 项" },
    { "board": "监管改造", "title": "罪犯日用品采购管理", "severity": "attention", "metric": "2 人" },
    { "board": "监管改造", "title": "监内计算机管理", "severity": "attention", "metric": "—" },
    { "board": "教育改造", "title": "罪犯未按时开展顽（危）犯心理矫治", "severity": "normal", "metric": "0 项" },
    { "board": "教育改造", "title": "涉恐罪犯释放前6个月未完成再犯罪评估专项工作预警", "severity": "normal", "metric": "0 项" },
    { "board": "教育改造", "title": "3日内未完成扣20分以上罪犯危险性评估预警", "severity": "normal", "metric": "0 项" }
  ]
};

/* 预警发生时间：JSON 未提供时间字段，此处为原型展示用占位时间（数据层提供后替换） */
CK.warningTime = {
  '人数清点互监身份异常': '11-06 17:02',
  '劳动工具清点人身识别异常': '11-06 16:48',
  '渗透破坏监管秩序预警': '11-06 16:20',
  '监外罪犯事务管理': '11-06 15:34',
  '罪犯消费异常预警': '11-06 14:52',
  '普通罪犯出监前3个月未完成再犯罪危险性评估': '11-06 11:26',
  '罪犯日用品采购管理': '11-06 10:08',
  '监内计算机管理': '11-06 09:40',
  '罪犯未按时开展顽（危）犯心理矫治': '11-06 08:55',
  '涉恐罪犯释放前6个月未完成再犯罪评估专项工作预警': '11-06 08:30',
  '3日内未完成扣20分以上罪犯危险性评估预警': '11-06 08:12'
};

CK.SEV = {
  critical: { rank: 4, label: '严重', cls: 'critical', color: 'var(--danger-text)' },
  warning:  { rank: 3, label: '预警', cls: 'warning',  color: 'var(--warn-text)' },
  attention:{ rank: 2, label: '关注', cls: 'attention', color: 'var(--blue-400)' },
  normal:   { rank: 1, label: '正常', cls: 'normal',   color: 'var(--ok-text)' }
};

/* --------------------------------------------------------------------------
   六大板块 + 健康度（由 CK.warnings 派生，不新增字段）
   状态判定（layout §3.2）：有 L1 → 预警；无 L1 有 L2 → 关注；只有 L3/L4 → 正常
   -------------------------------------------------------------------------- */
CK.boards = [
  { key: 'supervision', no: '01', name: '监管改造', route: '#/supervision' },
  { key: 'labor',       no: '02', name: '劳动改造', route: '#/labor' },
  { key: 'education',   no: '03', name: '教育改造', route: '#/education' },
  { key: 'justice',     no: '04', name: '公正执法', route: '#/justice' },
  { key: 'health',      no: '05', name: '卫生防疫', route: '#/health' },
  { key: 'team',        no: '06', name: '队伍管理', route: '#/team' }
];

CK.boardHealth = function () {
  return CK.boards.map(function (b) {
    var items = CK.warnings.items.filter(function (w) { return w.board === b.name; });
    var sev = { critical: 0, warning: 0, attention: 0, normal: 0 };
    items.forEach(function (w) { sev[w.severity]++; });
    var pending = sev.critical + sev.warning + sev.attention;
    var state = sev.critical > 0 ? 'warning' : (sev.warning > 0 ? 'attention' : 'normal');
    var reasons = items
      .filter(function (w) { return w.severity !== 'normal'; })
      .map(function (w) { return w.title; });
    if (!reasons.length) {
      reasons = items.map(function (w) { return w.title; });
    }
    return {
      no: b.no, name: b.name, route: b.route, sev: sev,
      pending: pending, state: state,
      reasons: reasons.slice(0, 2),
      empty: items.length === 0
    };
  });
};

/* 导航（底部 7 项） */
CK.nav = [
  { key: 'home',        label: '首页',     route: '#/home' },
  { key: 'supervision', label: '监管改造', route: '#/supervision' },
  { key: 'labor',       label: '劳动改造', route: '#/labor' },
  { key: 'education',   label: '教育改造', route: '#/education' },
  { key: 'justice',     label: '公正执法', route: '#/justice' },
  { key: 'health',      label: '卫生防疫', route: '#/health' },
  { key: 'team',        label: '队伍管理', route: '#/team' }
];

/* ==========================================================================
   分页数据
   ========================================================================== */
CK.data = {

  /* ---------------- P0 首页 ---------------- */
  p0: {
    /* 模型数量分布：brief 给出前 6 项原文，其余为原型占位行（同一命名域，数量降序） */
    models: [
      { name: '罪犯心理危机预警', value: 10 },
      { name: '邪教类罪犯', value: 5 },
      { name: '罪犯自杀危险', value: 5 },
      { name: '罪犯脱逃危险', value: 5 },
      { name: '罪犯狱内又犯罪', value: 4 },
      { name: '罪犯家庭重大变故', value: 4 },
      { name: '罪犯暴力倾向预警', value: 3 },
      { name: '罪犯自伤自残预警', value: 3 },
      { name: '罪犯抑郁情绪预警', value: 2 },
      { name: '罪犯帮派结伙预警', value: 2 },
      { name: '罪犯违规违纪预警', value: 2 },
      { name: '罪犯脱管失控预警', value: 1 },
      { name: '罪犯重大疾病预警', value: 1 }
    ],
    /* 原 3D 地球上的 9 个浮动标签 → 折叠为应用清单（§2.1.5），无数量字段 */
    apps: [
      '监狱医院管理', '罪犯健康档案', '罪犯营养餐管理', '重点罪犯分析', '监狱安全管理',
      '罪犯心理咨询', '监所综合业务', '监狱安防管理', '监所政务管理'
    ],
    /* 事务犯审批各类模型：brief 只给百分比，未给类别名 → 按数据源顺序编号 */
    approval: {
      center: '80%',
      centerSub: '最高占比',
      items: [
        { name: '类别 01', pct: '80.00%', value: 80 },
        { name: '类别 02', pct: '0.00%', value: 0 },
        { name: '类别 03', pct: '0.00%', value: 0 },
        { name: '类别 04', pct: '0.00%', value: 0 }
      ]
    },
    /* 罪犯劳动报酬发放（首页 Top 3，共 5 项，完整 5 项在 P2） */
    pay: [
      { name: '上月住院暂未发劳动报酬', value: 79 },
      { name: '解回再审罪犯回落劳动报酬未发', value: 20 },
      { name: '扣分未发报酬', value: 11 },
      { name: '高戒备罪犯劳动报酬未发', value: 10 },
      { name: '解回再审罪犯离监劳动报酬未发', value: 5 }
    ],
    /* 罪犯1档保外就医一诊断多账率（7 个分监区，合计 47 例） */
    diag: [
      { name: '第一分监区', value: 13 },
      { name: '第二分监区', value: 13 },
      { name: '第三分监区', value: 7 },
      { name: '第四分监区', value: 6 },
      { name: '第五分监区', value: 4 },
      { name: '第六分监区', value: 3 },
      { name: '第七分监区', value: 1 }
    ],
    /* 劳动工具应静未静：brief 只给 4 个组名，未给数值 → 禁止补 0 */
    tools: [
      { name: '所内劳动工具应静未静' },
      { name: '民警保管工具应静未静' },
      { name: '罪犯保管工具应静未静' },
      { name: '工具应静未静未…' }
    ]
  },

  /* ---------------- P1 监管改造 ---------------- */
  p1: {
    kpi: [
      { name: '罪犯分数情况', value: '21', unit: '人' },
      { name: '罪犯被卡管理', value: '11', unit: '人' },
      { name: '罪犯通连管理', value: '273', unit: '' },
      { name: '罪犯分数异常', value: '6', unit: '人' }
    ],
    /* 项（危）罪犯管理：序号 / 罪犯编号 / 罪犯姓名 / 危险等级 / 签发时间 */
    danger: [
      { no: 1,  code: '330124770', name: '夏建明', level: '人身', time: '2026-08-30 19:12' },
      { no: 2,  code: '330124770', name: '夏建明', level: '日常', time: '2026-04-12 09:40' },
      { no: 3,  code: '330125183', name: '顾伟',   level: '人身', time: '2026-08-28 15:02' },
      { no: 4,  code: '330126604', name: '周海兵', level: '突发', time: '2026-08-26 10:31' },
      { no: 5,  code: '330127182', name: '李国平', level: '日常', time: '2026-08-24 14:18' },
      { no: 6,  code: '330128356', name: '王振华', level: '人身', time: '2026-08-21 08:55' },
      { no: 7,  code: '330129044', name: '张顺义', level: '日常', time: '2026-08-19 16:44' },
      { no: 8,  code: '330130271', name: '陈志强', level: '突发', time: '2026-08-17 11:09' },
      { no: 9,  code: '330131508', name: '林大勇', level: '人身', time: '2026-08-14 13:27' },
      { no: 10, code: '330132619', name: '徐守业', level: '日常', time: '2026-08-11 09:16' },
      { no: 11, code: '330133702', name: '何金水', level: '人身', time: '2026-08-08 17:33' },
      { no: 12, code: '330134815', name: '孙立群', level: '突发', time: '2026-08-05 10:52' }
    ],
    /* 涉黑涉恶罪犯管理：序号 / 罪犯编号 / 罪犯姓名 / 分监区 / 分管罪犯编号 / 分管罪犯姓名 */
    gang: [
      { no: 1,  code: '331302814', name: '顾长海', area: '一监区-一分监区', mgrCode: '120140318', mgr: '周海兵' },
      { no: 2,  code: '331303927', name: '李成栋', area: '一监区-一分监区', mgrCode: '120140318', mgr: '周海兵' },
      { no: 3,  code: '331304156', name: '周立本', area: '一监区-一分监区', mgrCode: '120140318', mgr: '周海兵' },
      { no: 4,  code: '331305288', name: '王开山', area: '二监区-三分监区', mgrCode: '120140427', mgr: '吴建平' },
      { no: 5,  code: '331306391', name: '陈天禄', area: '二监区-三分监区', mgrCode: '120140427', mgr: '吴建平' },
      { no: 6,  code: '331307504', name: '张明礼', area: '三监区-一分监区', mgrCode: '120140536', mgr: '郑国华' },
      { no: 7,  code: '331308617', name: '何正清', area: '三监区-一分监区', mgrCode: '120140536', mgr: '郑国华' },
      { no: 8,  code: '331309720', name: '徐宏斌', area: '四监区-二分监区', mgrCode: '120140645', mgr: '林永康' },
      { no: 9,  code: '331310833', name: '胡国梁', area: '四监区-二分监区', mgrCode: '120140645', mgr: '林永康' },
      { no: 10, code: '331311946', name: '林志刚', area: '五监区-一分监区', mgrCode: '120140754', mgr: '叶向阳' },
      { no: 11, code: '331312059', name: '杨春生', area: '五监区-一分监区', mgrCode: '120140754', mgr: '叶向阳' },
      { no: 12, code: '331313162', name: '赵金福', area: '六监区-三分监区', mgrCode: '120140863', mgr: '钱国平' },
      { no: 13, code: '331314275', name: '沈国栋', area: '六监区-三分监区', mgrCode: '120140863', mgr: '钱国平' }
    ],
    /* 安屋消防工作预警 / 核查情况：brief 只给 Y 轴刻度与 X 轴状态，未给数值 */
    fire: { cats: ['未核查状态', '正在核查中', '核查完毕'], ticks: [0, 17, 33, 50] },
    /* 事务犯管理：5 组（流程顺序），无源数值 */
    affairs: ['呈报前', '有违规扣分', '从严审批', '审批不同意', '情节轻微'],
    /* 劳动工具管理：2 组，无源数值 */
    tools: ['所内劳动工具应静未静', '罪犯保管劳动工具应静未静']
  },

  /* ---------------- P2 劳动改造 ---------------- */
  p2: {
    pay: [
      { name: '上月住院暂未发劳动报酬', value: 79, cap: '累计 · 未发原因=住院' },
      { name: '解回再审罪犯回落劳动报酬未发', value: 20, cap: '累计 · 未发原因=解回再审' },
      { name: '扣分未发报酬', value: 11, cap: '累计 · 未发原因=考核扣分' },
      { name: '高戒备罪犯劳动报酬未发', value: 10, cap: '累计 · 未发原因=高戒备管控' },
      { name: '解回再审罪犯离监劳动报酬未发', value: 5, cap: '累计 · 未发原因=已离监' }
    ],
    /* 电梯维保（超 15 天）9 例：序号 / 罪犯姓名 / 罪犯编号 / 上次维保时间 / 间隔时长 / 完成点 */
    lift: [
      { no: 1, name: '沈满宇', code: '331304521', last: '2026-10-04 09:20', days: 33, point: '首次核查' },
      { no: 2, name: '林昭',   code: '331305634', last: '2026-10-09 14:05', days: 28, point: '首次核查' },
      { no: 3, name: '郑小军', code: '331306747', last: '2026-10-12 08:36', days: 25, point: '复查待确认' },
      { no: 4, name: '吴德胜', code: '331307850', last: '2026-10-16 16:12', days: 21, point: '复查待确认' },
      { no: 5, name: '唐维',   code: '331308963', last: '2026-10-17 10:44', days: 20, point: '已完成' },
      { no: 6, name: '许向阳', code: '331309076', last: '2026-10-18 11:28', days: 19, point: '已完成' },
      { no: 7, name: '高建平', code: '331310189', last: '2026-10-19 15:52', days: 18, point: '已完成' },
      { no: 8, name: '钱伟民', code: '331311292', last: '2026-10-21 09:08', days: 16, point: '已完成' },
      { no: 9, name: '叶春林', code: '331312305', last: '2026-10-22 13:35', days: 15, point: '已完成' }
    ],
    /* 定时劳动岗位安排 2 例：所属监区/分监区 / 罪犯姓名 / 罪犯编号 / 岗位 / 考核月份 / 次月岗位考核月份 */
    post: [
      { area: '一监区-二分监区', name: '钟晓', code: '331304187', post: '入监队劳动岗', month: '2025-10', next: '2025-11' },
      { area: '四监区-一分监区', name: '罗成', code: '331307258', post: '伙房劳动岗',  month: '2025-10', next: '2025-11' }
    ],
    /* 间隔时长分档：由区块 02 的「间隔时长」分组，非新增字段 */
    tiers: [
      { label: '15–20 天', value: 5 },
      { label: '21–30 天', value: 3 },
      { label: '>30 天',   value: 1 }
    ]
  },

  /* ---------------- P3 教育改造 ---------------- */
  p3: {
    /* 入监教育时间不足 10：所属分监区 / 罪犯姓名 / 罪犯编号 / 入监教育天数 / 原因 */
    entry: [
      { area: '一分监区',  name: '唐维',  code: '331304821', days: 23, reason: '教育不足' },
      { area: '二分监区',  name: '林昭',  code: '331305934', days: 23, reason: '教育不足' },
      { area: '三分监区',  name: '郑军',  code: '331307047', days: 22, reason: '转押中断' },
      { area: '四分监区',  name: '吴胜',  code: '331308150', days: 21, reason: '教育不足' },
      { area: '五分监区',  name: '徐平',  code: '331309263', days: 20, reason: '病假中断' },
      { area: '六分监区',  name: '张勇',  code: '331310376', days: 19, reason: '教育不足' },
      { area: '七分监区',  name: '陈强',  code: '331311489', days: 18, reason: '延期入监' },
      { area: '八分监区',  name: '王军',  code: '331312592', days: 16, reason: '转押中断' },
      { area: '九分监区',  name: '杨明',  code: '331313605', days: 14, reason: '教育不足' },
      { area: '十分监区',  name: '赵刚',  code: '331314718', days: 12, reason: '病假中断' }
    ],
    /* 罪犯出监申请 1：所属监区 / 罪犯姓名 / 罪犯编号 / 刑满释放日 / 申请事由 */
    release: [
      { area: '十监区', name: '王明', code: '331312476', date: '2026-12-05', reason: '出监安置' }
    ],
    /* 临释罪犯重大违规违纪 1：序号 + 7 字段 */
    breach: [
      {
        no: 1, area: '第十监区-二监区', name: '王明', code: '331312476',
        type: '监督扣分', advice: '扣 40 分', reason: '罪犯不服从民警管理',
        time: '2026-08-30 19:12:32'
      }
    ]
  },

  /* ---------------- P4 公正执法 ---------------- */
  p4: {
    /* 未呈报人员扣分预测：3 组，Y 轴 0/7/13/20/22 */
    report: {
      cats: ['第一分监区', '第七分监区', '第三分监区'],
      values: [22, 17, 12],
      ticks: [0, 7, 13, 20, 22]
    },
    /* 呈报前动态风控：扣分事件（分值占比 / 时间分布） */
    risk: {
      byScore: [
        { name: '2.0 分', value: 67 },
        { name: '1.0 分', value: 33 }
      ],
      byTime: [
        { name: '08:00–12:00', value: 50 },
        { name: '12:00–16:00', value: 30 },
        { name: '16:00–20:00', value: 20 }
      ],
      center: '2.0',
      centerSub: '67%'
    },
    /* 同案犯减刑假释参考模型：仪表 0–6000，中心 842 人 */
    commutation: { value: 842, max: 6000, ticks: [0, 3000, 6000], unit: '人' }
  },

  /* ---------------- P5 卫生防疫 ---------------- */
  p5: {
    /* 医疗隐患预警 / 罪犯近1月因同一诊断多次就诊：8 个分监区 */
    clinic: [
      { name: '第一分监区', value: 12 },
      { name: '第二分监区', value: 12 },
      { name: '第三分监区', value: 3 },
      { name: '第四分监区', value: 3 },
      { name: '第五分监区', value: 2 },
      { name: '第六分监区', value: 2 },
      { name: '第七分监区', value: 2 },
      { name: '第八分监区', value: 1 }
    ],
    /* 罪犯猝死风险评估：环形 51% + 图例 4 项（brief 只给占比，未给类别名） */
    sudden: {
      center: '51%',
      items: [
        { name: '类别 01', pct: '51%', value: 51 },
        { name: '类别 02', pct: '18%', value: 18 },
        { name: '类别 03', pct: '18%', value: 18 },
        { name: '类别 04', pct: '13%', value: 13 }
      ]
    },
    /* 三类分值：人身危险类 1.1 / 日常危险类 1.88 / 突发疾病类 1.6 */
    scores: [
      { no: '03', name: '人身危险类分值', value: '1.1',  cap: '分值 · 区间 10-07 ~ 11-06',
        mean: '按人身危险性维度加权计算，得分越高代表该类风险越突出；分值与中栏猝死风险评估环形同源，均基于同一批在押罪犯的门诊与评估记录统计。' },
      { no: '04', name: '日常危险类分值', value: '1.88', cap: '分值 · 区间 10-07 ~ 11-06',
        mean: '按日常危险行为维度加权计算，得分越高代表该类风险越突出；分值与中栏猝死风险评估环形同源，均基于同一批在押罪犯的日常行为记分统计。' },
      { no: '05', name: '突发疾病类分值', value: '1.6',  cap: '分值 · 区间 10-07 ~ 11-06',
        mean: '按突发疾病易感维度加权计算，得分越高代表该类风险越突出；分值与中栏猝死风险评估环形同源，均基于同一批在押罪犯的病历与体检记录统计。' }
    ]
  },

  /* ---------------- P6 队伍管理 ---------------- */
  p6: {
    /* 民警饮酒风险预警 / 饮酒嗜好占比：brief 列 6 个类别名（标题计数 7 项为 brief 原文） */
    drink: {
      items: [
        { name: '无',   pct: '27%', value: 27 },
        { name: '偶尔', pct: '64%', value: 64 },
        { name: '经常', pct: '8%',  value: 8 },
        { name: '固定', pct: '3%',  value: 3 },
        { name: '戒',   pct: '3%',  value: 3 },
        { name: '其他', pct: '1%',  value: 1 }
      ]
    },
    /* 基本情况：8 个字段（2 行 × 4 格） */
    base: [
      { name: '当前总押数',       value: '1,792', unit: '人', cap: '累计 · 截至 11-06 17:11' },
      { name: '当前在岗民警',     value: '1,760', unit: '人', cap: '当前时点' },
      { name: '主要领导当前在岗', value: '28',    unit: '人', cap: '当前时点' },
      { name: '主要领导当前在岗', value: '1',     unit: '人', cap: '当前时点' },
      { name: '人员流动',         value: '220.49',unit: '人', cap: '月均 · 统计区间 10-01 ~ 10-31' },
      { name: '人员流动',         value: '698',   unit: '人', cap: '累计 · 本月' },
      { name: '人员流动',         value: '5',     unit: '人', cap: '累计 · 本月' },
      { name: '出勤人数',         value: '—',     unit: '',   cap: '当日 · 截至 17:11 · 数据未接入' }
    ],
    /* 风险占比 3 仪表 */
    gauges: [
      { name: '酒驾风险', value: 56.5, max: 100, unit: '%' },
      { name: '整体比例', value: 3.0,  max: 100, unit: '%' },
      { name: '廉洁风险', value: 43.5, max: 100, unit: '%' }
    ],
    /* 队伍风险追踪器 / 四涉分布 */
    four: {
      items: [
        { name: '涉赌', pct: '13%', value: 13 },
        { name: '涉黄', pct: '13%', value: 13 },
        { name: '涉毒', pct: '13%', value: 13 },
        { name: '涉黑', pct: '2%',  value: 2 },
        { name: '其他', pct: '37%', value: 37 }
      ]
    }
  }
};
