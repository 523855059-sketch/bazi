/*
 * 二十四节气表：查找与定位。
 *
 * 节气时刻由 tools/build-jieqi.cjs 用天文算法预先算好，存成相对基准日的天数，
 * 运行时只做查表与二分，不再算级数。
 *
 * 索引约定：每年 24 个，从当年「小寒」开始，偶数索引是「节」（分月用），
 * 奇数索引是「气」。例：0 小寒、1 大寒、2 立春、3 雨水……23 冬至。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.BZ = root.BZ || {}; root.BZ.jieqi = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var NAMES = [
    '小寒', '大寒', '立春', '雨水', '惊蛰', '春分',
    '清明', '谷雨', '立夏', '小满', '芒种', '夏至',
    '小暑', '大暑', '立秋', '处暑', '白露', '秋分',
    '寒露', '霜降', '立冬', '小雪', '大雪', '冬至'
  ];

  // 每个节对应的月支（农历月序以寅月为正月）
  var JIE_ZHI = ['丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '子'];

  var table = null; // { baseJD, startYear, values: number[] }

  function setTable(t) { table = t; }
  function hasTable() { return !!table; }

  // 全局第 i 个节气的 JD（UT）。i 从 startYear 的小寒算起。
  function termJD(i) {
    return table.baseJD + table.values[i];
  }

  function count() {
    return table.values.length;
  }

  function termName(i) {
    return NAMES[((i % 24) + 24) % 24];
  }

  function termYear(i) {
    return table.startYear + Math.floor(i / 24);
  }

  // 找到「时刻 jd 之前最近的一个节气」的下标。表外（早于表头或晚于表尾）返回 -1，
  // 让调用方显式报越界，而不是拿表尾的节气冒充。
  function indexBefore(jd) {
    var lo = 0, hi = table.values.length - 1;
    if (jd < termJD(0)) return -1;
    if (jd >= termJD(hi)) return -1;
    while (lo < hi) {
      var mid = (lo + hi + 1) >> 1;
      if (termJD(mid) <= jd) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  // 某年某个节气的 JD
  function termJDOfYear(year, termIndex) {
    var i = (year - table.startYear) * 24 + termIndex;
    if (i < 0 || i >= table.values.length) return null;
    return termJD(i);
  }

  // 立春（用于年柱分界）
  function lichunJD(year) {
    return termJDOfYear(year, 2);
  }

  // 时刻 jd 所属的月支，以及这个月是从哪个「节」开始的
  function monthZhiAt(jd) {
    var i = indexBefore(jd);
    if (i < 0) return null;
    var jieIndex = i - (i % 2);            // 退到最近的「节」
    if (jieIndex + 2 >= table.values.length) return null; // 下一个节不在表内，算不出月界
    var nth = Math.floor((jieIndex % 24) / 2); // 0 小寒、1 立春、2 惊蛰……
    return {
      zhi: JIE_ZHI[nth],
      jieName: NAMES[jieIndex % 24],
      jieJD: termJD(jieIndex),
      nextJieJD: termJD(jieIndex + 2)
    };
  }

  // 年柱分界：返回该时刻所属「立春年」
  function lichunYearAt(jd) {
    var i = indexBefore(jd);
    if (i < 0) return null;
    var y = termYear(i);
    // 若当前时刻还没到当年的立春，则属于上一年
    var lc = lichunJD(y);
    if (lc == null) return y;
    return jd < lc ? y - 1 : y;
  }

  return {
    NAMES: NAMES,
    JIE_ZHI: JIE_ZHI,
    setTable: setTable,
    hasTable: hasTable,
    termJD: termJD,
    termName: termName,
    termYear: termYear,
    count: count,
    indexBefore: indexBefore,
    termJDOfYear: termJDOfYear,
    lichunJD: lichunJD,
    monthZhiAt: monthZhiAt,
    lichunYearAt: lichunYearAt
  };
});
