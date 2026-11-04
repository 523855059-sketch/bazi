/*
 * 排盘自检：天文数据、干支推算、边界规则。
 *
 * 用法：node tools/verify-bazi.cjs
 *
 * 每条断言都写明依据。权威节气时刻取自公开历书（2024/2025 年的立春、春分、
 * 夏至、冬至），容差 2 分钟——超过就说明级数或时间转换有问题。
 */
'use strict';

const astro = require('../lib/astro.js');
const jq = require('../lib/jieqi.js');
const C = require('../lib/constants.js');
const DATA = require('../data/jieqi.js');

jq.setTable(DATA);
const bz = require('../lib/bazi.js');

let pass = 0, fail = 0;
const failures = [];

function ok(name, cond, detail) {
  if (cond) { pass++; return; }
  fail++;
  failures.push(name + (detail ? '：' + detail : ''));
}
function eq(name, actual, expected) {
  ok(name, actual === expected, `期望 ${expected}，实得 ${actual}`);
}

function bjParts(jd) {
  return astro.jdToBeijing(jd);
}
function bjStr(jd) {
  const t = bjParts(jd);
  const p = (n) => String(n).padStart(2, '0');
  return `${t.year}-${p(t.month)}-${p(t.day)} ${p(t.hour)}:${p(t.minute)}`;
}

/* ---------- 1. 节气时刻对照公开历书 ---------- */
const TERM_CASES = [
  { year: 2024, idx: 2, expect: '2024-02-04 16:26' },  // 立春
  { year: 2024, idx: 5, expect: '2024-03-20 11:06' },  // 春分
  { year: 2024, idx: 11, expect: '2024-06-21 04:50' }, // 夏至
  { year: 2024, idx: 23, expect: '2024-12-21 17:20' }, // 冬至
  { year: 2025, idx: 2, expect: '2025-02-03 22:10' },  // 立春
  { year: 1984, idx: 2, expect: '1984-02-04 23:18' },  // 立春（23:19 前后）
];

// 允许 ±2 分钟
function withinMinutes(jd, expectStr, minutes) {
  const t = bjParts(jd);
  const got = Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second);
  const [y, m, d, hh, mi] = expectStr.split(/[- :]/).map(Number);
  const exp = Date.UTC(y, m - 1, d, hh, mi, 0);
  return Math.abs(got - exp) <= minutes * 60000;
}

for (const c of TERM_CASES) {
  const jd = jq.termJDOfYear(c.year, c.idx);
  ok(`节气 ${c.year} ${jq.NAMES[c.idx]}`, withinMinutes(jd, c.expect, 2), `实得 ${bjStr(jd)}，期望 ${c.expect}`);
}

/* ---------- 2. 日柱：已知锚点与连续性 ---------- */
// 2024-01-01 为甲子日（公开万年历：癸卯年 甲子月 甲子日）
eq('日柱 2024-01-01 甲子', C.ganzhiName(bz.dayGanzhiIndex(2024, 1, 1)), '甲子');
// 2000-01-01 为戊午日
eq('日柱 2000-01-01 戊午', C.ganzhiName(bz.dayGanzhiIndex(2000, 1, 1)), '戊午');
// 1984-02-04 为戊辰日
eq('日柱 1984-02-04 戊辰', C.ganzhiName(bz.dayGanzhiIndex(1984, 2, 4)), '戊辰');

// 连续 800 天，日柱必须逐日 +1（跨闰年、跨年、跨月）
{
  let prev = bz.dayGanzhiIndex(2023, 11, 1);
  let bad = 0;
  for (let i = 1; i <= 800; i++) {
    const d = astro.fromJD(astro.toJD(2023, 11, 1) + i);
    const cur = bz.dayGanzhiIndex(d.year, d.month, Math.floor(d.day));
    if (cur !== (prev + 1) % 60) bad++;
    prev = cur;
  }
  eq('日柱连续性（800 天）', bad, 0);
}

/* ---------- 3. 五虎遁：10 年干 × 12 月支 ---------- */
{
  const expect = {
    '甲': { '寅': '丙', '卯': '丁', '辰': '戊', '巳': '己', '午': '庚', '未': '辛', '申': '壬', '酉': '癸', '戌': '甲', '亥': '乙', '子': '丙', '丑': '丁' },
    '乙': { '寅': '戊', '卯': '己', '辰': '庚', '巳': '辛', '午': '壬', '未': '癸', '申': '甲', '酉': '乙', '戌': '丙', '亥': '丁', '子': '戊', '丑': '己' },
    '丙': { '寅': '庚', '卯': '辛', '辰': '壬', '巳': '癸', '午': '甲', '未': '乙', '申': '丙', '酉': '丁', '戌': '戊', '亥': '己', '子': '庚', '丑': '辛' },
    '丁': { '寅': '壬', '卯': '癸', '辰': '甲', '巳': '乙', '午': '丙', '未': '丁', '申': '戊', '酉': '己', '戌': '庚', '亥': '辛', '子': '壬', '丑': '癸' },
    '戊': { '寅': '甲', '卯': '乙', '辰': '丙', '巳': '丁', '午': '戊', '未': '己', '申': '庚', '酉': '辛', '戌': '壬', '亥': '癸', '子': '甲', '丑': '乙' },
    '己': { '寅': '丙', '卯': '丁', '辰': '戊', '巳': '己', '午': '庚', '未': '辛', '申': '壬', '酉': '癸', '戌': '甲', '亥': '乙', '子': '丙', '丑': '丁' },
    '庚': { '寅': '戊', '卯': '己', '辰': '庚', '巳': '辛', '午': '壬', '未': '癸', '申': '甲', '酉': '乙', '戌': '丙', '亥': '丁', '子': '戊', '丑': '己' },
    '辛': { '寅': '庚', '卯': '辛', '辰': '壬', '巳': '癸', '午': '甲', '未': '乙', '申': '丙', '酉': '丁', '戌': '戊', '亥': '己', '子': '庚', '丑': '辛' },
    '壬': { '寅': '壬', '卯': '癸', '辰': '甲', '巳': '乙', '午': '丙', '未': '丁', '申': '戊', '酉': '己', '戌': '庚', '亥': '辛', '子': '壬', '丑': '癸' },
    '癸': { '寅': '甲', '卯': '乙', '辰': '丙', '巳': '丁', '午': '戊', '未': '己', '申': '庚', '酉': '辛', '戌': '壬', '亥': '癸', '子': '甲', '丑': '乙' },
  };
  let bad = 0;
  for (const g of C.GAN) {
    for (const z of C.ZHI) {
      if (bz.monthGan(g, z) !== expect[g][z]) {
        bad++;
        failures.push(`五虎遁 ${g}年${z}月：期望 ${expect[g][z]}，实得 ${bz.monthGan(g, z)}`);
      }
    }
  }
  eq('五虎遁（120 组）', bad, 0);
}

/* ---------- 4. 五鼠遁：10 日干 × 12 时辰 ---------- */
{
  // 显式口诀表，不从实现的公式反推（否则实现错了测试也跟着错）
  // 每行 12 字，依次是子、丑、寅……亥时的天干
  const TABLE = {
    '甲': '甲乙丙丁戊己庚辛壬癸甲乙',
    '乙': '丙丁戊己庚辛壬癸甲乙丙丁',
    '丙': '戊己庚辛壬癸甲乙丙丁戊己',
    '丁': '庚辛壬癸甲乙丙丁戊己庚辛',
    '戊': '壬癸甲乙丙丁戊己庚辛壬癸',
    '己': '甲乙丙丁戊己庚辛壬癸甲乙',
    '庚': '丙丁戊己庚辛壬癸甲乙丙丁',
    '辛': '戊己庚辛壬癸甲乙丙丁戊己',
    '壬': '庚辛壬癸甲乙丙丁戊己庚辛',
    '癸': '壬癸甲乙丙丁戊己庚辛壬癸'
  };
  let bad = 0;
  for (const g of C.GAN) {
    for (let i = 0; i < 12; i++) {
      const expect = TABLE[g][i];
      const got = bz.hourGan(g, C.ZHI[i]);
      if (got !== expect) { bad++; failures.push(`五鼠遁 ${g}日${C.ZHI[i]}时：期望 ${expect}，实得 ${got}`); }
    }
  }
  eq('五鼠遁（120 组）', bad, 0);
}

/* ---------- 5. 立春边界：年柱切换 ---------- */
{
  const lichun = jq.lichunJD(1984); // 1984-02-04 23:18
  const before = astro.jdToBeijing(lichun - 1 / 1440); // 前一分钟
  const after = astro.jdToBeijing(lichun + 1 / 1440);  // 后一分钟
  const c1 = bz.calc({ year: before.year, month: before.month, day: before.day, hour: before.hour, minute: before.minute });
  const c2 = bz.calc({ year: after.year, month: after.month, day: after.day, hour: after.hour, minute: after.minute });
  eq('立春前年柱', c1.pillars.year.name, '癸亥');
  eq('立春后年柱', c2.pillars.year.name, '甲子');
  eq('立春前月柱', c1.pillars.month.name, '乙丑');
  eq('立春后月柱', c2.pillars.month.name, '丙寅');
}

/* ---------- 6. 23:00 换日 ---------- */
{
  const c1 = bz.calc({ year: 2024, month: 1, day: 1, hour: 22, minute: 59 });
  const c2 = bz.calc({ year: 2024, month: 1, day: 1, hour: 23, minute: 0 });
  eq('22:59 日柱', c1.pillars.day.name, '甲子');
  eq('23:00 日柱（换日）', c2.pillars.day.name, '乙丑');
  eq('22:59 时柱', c1.pillars.hour.name, '乙亥');
  eq('23:00 时柱', c2.pillars.hour.name, '丙子');
}

/* ---------- 7. 月柱边界：惊蛰 ---------- */
{
  const jingzhe = jq.termJDOfYear(2024, 4);
  const before = astro.jdToBeijing(jingzhe - 2 / 1440);
  const after = astro.jdToBeijing(jingzhe + 2 / 1440);
  const c1 = bz.calc({ year: before.year, month: before.month, day: before.day, hour: before.hour, minute: before.minute });
  const c2 = bz.calc({ year: after.year, month: after.month, day: after.day, hour: after.hour, minute: after.minute });
  eq('惊蛰前月支', c1.pillars.month.zhi, '寅');
  eq('惊蛰后月支', c2.pillars.month.zhi, '卯');
}

/* ---------- 8. 藏干与纳音 ---------- */
eq('纳音 甲子', C.nayinOf(0), '海中金');
eq('纳音 壬戌', C.nayinOf(C.ganzhiIndex('壬', '戌')), '大海水');
eq('藏干 寅', C.HIDDEN_GAN['寅'].join(''), '甲丙戊');
eq('十神 甲见庚', C.shishen('甲', '庚'), '七杀');
eq('十神 甲见辛', C.shishen('甲', '辛'), '正官');
eq('十神 甲见丙', C.shishen('甲', '丙'), '食神');
eq('十神 甲见癸', C.shishen('甲', '癸'), '正印');

/* ---------- 9. 大运方向 ---------- */
{
  // 1984 甲子年（阳年）男 → 顺行；女 → 逆行
  const m = bz.calc({ year: 1984, month: 6, day: 1, hour: 12, minute: 0, gender: 'male' });
  const f = bz.calc({ year: 1984, month: 6, day: 1, hour: 12, minute: 0, gender: 'female' });
  eq('阳年男顺行', m.dayun.forward, true);
  eq('阳年女逆行', f.dayun.forward, false);
  // 1985 乙丑年（阴年）男 → 逆行
  const m2 = bz.calc({ year: 1985, month: 6, day: 1, hour: 12, minute: 0, gender: 'male' });
  eq('阴年男逆行', m2.dayun.forward, false);
  // 大运首步必须接着月柱
  const first = m.dayun.list[0];
  eq('大运首步接月柱', first.name, C.ganzhiName(m.pillars.month.index + 1));
}

/* ---------- 10. 真太阳时 ---------- */
{
  // 乌鲁木齐（东经 87.6°）：经度项 = (87.6−120)×4 = −129.6 分钟，均时差另计
  const c = bz.calc({ year: 2024, month: 6, day: 1, hour: 12, minute: 0, useTrueSolar: true, longitude: 87.6 });
  const lonTerm = c.meta.correctionMinutes - c.meta.equationOfTime;
  ok('真太阳时经度项', Math.abs(lonTerm + 129.6) < 0.25, `实得 ${lonTerm.toFixed(1)} 分钟`);
  ok('均时差量级', Math.abs(c.meta.equationOfTime) < 6, `实得 ${c.meta.equationOfTime} 分钟`);
  eq('真太阳时时辰', c.pillars.hour.zhi, '巳');
}
{
  // 00:30 经度校正约 −128 分钟 → 回到前一日 22:22，dayShift 必须为 −1
  const c = bz.calc({ year: 2024, month: 1, day: 1, hour: 0, minute: 30, useTrueSolar: true, longitude: 87.6 });
  eq('真太阳时跨日 dayShift', c.meta.dayShift, -1);
  eq('真太阳时跨日后日柱', c.pillars.day.name, '癸亥');
}

/* ---------- 11. 范围边界（表前后各留一年余量，越界必须报错） ---------- */
{
  const c = bz.calc({ year: 1900, month: 1, day: 1, hour: 0, minute: 0 });
  ok('1900-01-01 可排', !!c.pillars.year.name, c.pillars.year.name);
}
{
  const c = bz.calc({ year: 2100, month: 12, day: 31, hour: 12, minute: 0, gender: 'male' });
  ok('2100-12-31 可排且大运起运数为数值', typeof c.dayun.startYears === 'number' && !isNaN(c.dayun.startYears),
    `起运 ${c.dayun.startYears} 岁，首运 ${c.dayun.list[0].name}`);
  ok('2100-12-31 大运首步年龄非 NaN', !isNaN(c.dayun.list[0].startAge));
}
function expectThrow(name, opts) {
  let threw = false;
  try { bz.calc(opts); } catch (e) { threw = true; }
  ok(name, threw, '应当抛越界错误但未抛');
}
expectThrow('1899-12-31 报越界', { year: 1899, month: 12, day: 31, hour: 12, minute: 0 });
expectThrow('2101-01-01 报越界', { year: 2101, month: 1, day: 1, hour: 12, minute: 0 });
expectThrow('hour 缺失报错', { year: 2024, month: 1, day: 1 });

/* ---------- 12. 逆排大运的纳音（负下标回归） ---------- */
{
  // 2028 戊申年（阳年）女 → 逆行；子月月柱为甲子（甲子序号 0），第一步 idx = −1
  const c = bz.calc({ year: 2028, month: 12, day: 15, hour: 12, minute: 0, gender: 'female' });
  eq('戊年子月月柱', c.pillars.month.name, '甲子');
  ok('逆排首步纳音非空', !!c.dayun.list[0].nayin, `实得 ${c.dayun.list[0].nayin}`);
}

/* ---------- 13. 虚岁按立春年 ---------- */
{
  const c = bz.calc({ year: 2024, month: 1, day: 15, hour: 12, minute: 0 });
  eq('立春前出生年柱', c.pillars.year.name, '癸卯');
  // 固定 refYear，不拿实现输出反推：2024-01-15 属癸卯年（2023），2025 年虚岁为 2025−2023+1=3
  const c2 = bz.calc({ year: 2024, month: 1, day: 15, hour: 12, minute: 0, refYear: 2025 });
  eq('立春前出生 2025 年虚岁', c2.liunian[0].age, 3);
  eq('流年起点为立春年', c2.liunian[0].year, 2025);
}

/* ---------- 14. 节气表覆盖范围 ---------- */
{
  ok('节气表起始', jq.termYear(0) === 1899, `实得 ${jq.termYear(0)}`);
  ok('节气表结束', jq.termYear(jq.count() - 1) === 2101, `实得 ${jq.termYear(jq.count() - 1)}`);
  ok('节气数量', jq.count() === 203 * 24, `实得 ${jq.count()}`);
}

/* ---------- 15. 判断层：旺衰、格局、用神、神煞、地支关系 ---------- */
{
  // 1984-02-05 12:00 男：甲子 丙寅 己巳 庚午
  // 己土生寅月失令，赖巳午中戊己通根、月干丙印生扶，综合中和偏弱；
  // 月支寅本气甲透年干，甲对己为正官 → 正官格
  const c = bz.calc({ year: 1984, month: 2, day: 5, hour: 12, minute: 0, gender: 'male' });
  eq('旺衰判定', c.analysis.strength.levelText, '中和偏弱');
  ok('旺衰分数为负', c.analysis.strength.score < 0, `实得 ${c.analysis.strength.score}`);
  eq('格局判定', c.analysis.pattern.name, '正官格');
  eq('格局置信度', c.analysis.pattern.confidence, 'high');
  eq('用神取火', c.analysis.yongshen.primary, '火');
  eq('喜神取土', c.analysis.yongshen.secondary, '土');
  ok('忌神含水', c.analysis.yongshen.avoid.indexOf('水') >= 0);
  ok('天乙贵人落年支子', c.shensha.list.some(function (s) { return s.name === '天乙贵人' && s.zhi === '子'; }));
  ok('禄神落时支午', c.shensha.list.some(function (s) { return s.name === '禄神' && s.zhi === '午'; }));
  // 年支子（申子辰）桃花在酉，日支巳（巳酉丑）桃花在午；四支中有午，必须报出来
  ok('桃花落时支午', c.shensha.list.some(function (s) { return s.name === '桃花' && s.zhi === '午'; }),
    '日支巳属巳酉丑，桃花在午，时支正是午');
  eq('空亡取旬', c.shensha.kongwang.zhi.join(''), '戌亥');
  ok('检出子午冲', c.relations.chong.some(function (x) { return x.indexOf('子午') >= 0; }));
  ok('检出寅巳害', c.relations.hai.some(function (x) { return x.indexOf('寅巳') >= 0; }));
}
{
  // 建禄格：甲日生于寅月（禄位）
  let sample = null;
  for (let d = 10; d <= 28 && !sample; d++) {
    const c = bz.calc({ year: 2024, month: 2, day: d, hour: 12, minute: 0 });
    if (c.dayMaster === '甲' && c.pillars.month.zhi === '寅') sample = c;
  }
  ok('找到甲日寅月样本', !!sample);
  if (sample) eq('建禄格', sample.analysis.pattern.name, '建禄格');
}
{
  // 身强例：取一个日主偏强的盘，用神应取克泄耗
  let strong = null;
  for (let m = 1; m <= 12 && !strong; m++) {
    for (let d = 1; d <= 28 && !strong; d++) {
      const c = bz.calc({ year: 2000, month: m, day: d, hour: 12, minute: 0 });
      if (c.analysis.strength.level === 'strong') strong = c;
    }
  }
  ok('存在偏强的样本', !!strong);
  if (strong) {
    // 身强取克泄耗：用神方法应写明“身强”，且忌神必须含日主本行（比劫）
    const dwSelf = C.GAN_WUXING[C.GAN.indexOf(strong.dayMaster)];
    ok('身强用神取克泄耗',
      strong.analysis.yongshen.method.indexOf('身强') >= 0
        && strong.analysis.yongshen.avoid.indexOf(dwSelf) >= 0,
      `实得 ${strong.analysis.yongshen.method}，忌 ${strong.analysis.yongshen.avoid.join('')}`);
  }
}

/* ---------- 16. 时间精度与出生地 ---------- */
{
  const CITIES = require('../data/cities.js');

  const bj = CITIES.lookup('北京');
  ok('城市表含北京', !!bj && Math.abs(bj.lng - 116.41) < 0.01);
  const ks = CITIES.lookup('喀什');
  ok('城市表含喀什', !!ks && Math.abs(ks.lng - 75.99) < 0.01);
  ok('未收录城市返回空', CITIES.lookup('不存在的城市') === null);

  // 喀什东经 75.99°，北京时间 12:00 校正约 −190 分钟 → 08:50，应为辰时
  const c = bz.calc({ year: 1984, month: 2, day: 5, hour: 12, minute: 0, useTrueSolar: true, longitude: ks.lng });
  eq('喀什 12:00 落辰时', c.pillars.hour.zhi, '辰');

  // 时辰不详：时柱照排但标记，提示词必须禁止基于时柱下结论
  const cu = bz.calc({ year: 1984, month: 2, day: 5, hour: 12, minute: 0, timeConfidence: 'unknown' });
  eq('时辰不详标记', cu.meta.timeConfidence, 'unknown');
  ok('提示词含时柱警告', bz.toPromptText(cu).indexOf('时柱不可靠') >= 0);

  const ca = bz.calc({ year: 1984, month: 2, day: 5, hour: 12, minute: 0, timeConfidence: 'approx' });
  eq('时辰大概标记', ca.meta.timeConfidence, 'approx');
  ok('提示词含存疑提示', bz.toPromptText(ca).indexOf('可能差一个时辰') >= 0);

  eq('默认按精确', bz.calc({ year: 1984, month: 2, day: 5, hour: 12, minute: 0 }).meta.timeConfidence, 'exact');
}

/* ---------- 17. 农历转换 ---------- */
{
  const L = require('../lib/lunar.js');

  // 已知春节日期：正月初一对应的公历
  const SPRING = [
    [2024, 2024, 2, 10], [2025, 2025, 1, 29], [2026, 2026, 2, 17],
    [2000, 2000, 2, 5], [1984, 1984, 2, 2], [2033, 2033, 1, 31]
  ];
  SPRING.forEach(function (c) {
    const s = L.toSolar(c[0], 1, 1, false);
    eq(`农历 ${c[0]} 春节 → ${c[1]}-${c[2]}-${c[3]}`, `${s.year}-${s.month}-${s.day}`, `${c[1]}-${c[2]}-${c[3]}`);
  });

  // 闰月：月序插在正常月之后
  eq('2020 闰四月', L.leapMonth(2020), 4);
  eq('2023 闰二月', L.leapMonth(2023), 2);
  eq('2025 闰六月', L.leapMonth(2025), 6);
  eq('2033 闰十一月', L.leapMonth(2033), 11);
  eq('2024 无闰月', L.leapMonth(2024), 0);

  const leap2023 = L.toSolar(2023, 2, 1, true);
  eq('2023 闰二月初一 → 3-22', `${leap2023.month}-${leap2023.day}`, '3-22');

  // 非法输入必须报错，不能静默算出别的日子
  function expectLunarThrow(name, fn) {
    let threw = false;
    try { fn(); } catch (e) { threw = true; }
    ok(name, threw);
  }
  expectLunarThrow('非闰月传 isLeap 报错', function () { L.toSolar(2024, 2, 1, true); });
  expectLunarThrow('农历 2099-13-1 报错', function () { L.toSolar(2099, 13, 1, false); });
  expectLunarThrow('农历 1899 年报错', function () { L.toSolar(1899, 1, 1, false); });
  expectLunarThrow('小月 30 日报错', function () {
    const max = L.monthDays(2024, 1); // 29 天
    L.toSolar(2024, 1, max + 1, false);
  });

  // 农历换算出的公历日期能直接进排盘
  const s = L.toSolar(2024, 1, 1, false);
  const chart = bz.calc({ year: s.year, month: s.month, day: s.day, hour: 12, minute: 0 });
  eq('农历 2024 正月初一排盘年柱', chart.pillars.year.name, '甲辰');
  eq('农历 2024 正月初一排盘月柱', chart.pillars.month.name, '丙寅');
}

/* ---------- 18. 回测 ---------- */
{
  const R = require('../lib/retro.js');
  const c = bz.calc({ year: 1984, month: 2, day: 5, hour: 12, minute: 0, gender: 'male' });

  const a = R.analyzeYear(c, 2022);
  eq('回测 2022 流年干支', a.ganzhi, '壬寅');
  eq('回测 2022 十神', a.shishen, '正财');
  ok('回测检出与原局的地支作用', a.relations.length > 0, a.relations.join('；'));

  // 同一年重复填只算一次
  const list = R.analyzeEvents(c, [
    { year: 2019, type: '生病' },
    { year: 2013, type: '换工作' },
    { year: 2019, type: '搬家' }
  ]);
  eq('同年去重', list.length, 2);
  eq('按年份排序', list[0].year, 2013);

  // 空年份被忽略，不产生垃圾数据
  const list2 = R.analyzeEvents(c, [{ year: NaN, type: '其他' }, { year: 2013, type: '换工作' }]);
  eq('非数值年份被忽略', list2.length, 1);
}

/* ---------- 汇总 ---------- */
console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
if (fail) {
  console.log('\n失败明细：');
  for (const f of failures) console.log('  ✗ ' + f);
  process.exit(1);
}
console.log('全部通过。');
