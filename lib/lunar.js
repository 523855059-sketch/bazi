/*
 * 农历 ↔ 公历转换（1900–2100）。
 *
 * 数据表 INFO 是通行的农历年编码，每年一个整数：
 *   bit 0–3   闰月月份，0 表示无闰月
 *   bit 4–15  十二个月的大小，1 = 30 天，0 = 29 天（bit15 为正月，bit4 为腊月）
 *   bit 16    闰月大小，1 = 30 天
 * 基准：1900 年正月初一 = 1900-01-31。
 *
 * 表已用已知春节日期与闰月校验：2024/2/10、2025/1/29、2026/2/17、2000/2/5、
 * 1984/2/2、2033/1/31；闰月 2020 闰四月、2023 闰二月、2025 闰六月、2033 闰十一月。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.BZ = root.BZ || {}; root.BZ.lunar = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var START = 1900;
  var END = 2100;

  var INFO = [
    0x4bd8, 0x4ae0, 0xa570, 0x54d5, 0xd260, 0xd950, 0x16554, 0x56a0, 0x9ad0, 0x55d2,
    0x4ae0, 0xa5b6, 0xa4d0, 0xd250, 0x1d255, 0xb540, 0xd6a0, 0xada2, 0x95b0, 0x14977,
    0x4970, 0xa4b0, 0xb4b5, 0x6a50, 0x6d40, 0x1ab54, 0x2b60, 0x9570, 0x52f2, 0x4970,
    0x6566, 0xd4a0, 0xea50, 0x6e95, 0x5ad0, 0x2b60, 0x186e3, 0x92e0, 0x1c8d7, 0xc950,
    0xd4a0, 0x1d8a6, 0xb550, 0x56a0, 0x1a5b4, 0x25d0, 0x92d0, 0xd2b2, 0xa950, 0xb557,
    0x6ca0, 0xb550, 0x15355, 0x4da0, 0xa5b0, 0x14573, 0x52b0, 0xa9a8, 0xe950, 0x6aa0,
    0xaea6, 0xab50, 0x4b60, 0xaae4, 0xa570, 0x5260, 0xf263, 0xd950, 0x5b57, 0x56a0,
    0x96d0, 0x4dd5, 0x4ad0, 0xa4d0, 0xd4d4, 0xd250, 0xd558, 0xb540, 0xb6a0, 0x195a6,
    0x95b0, 0x49b0, 0xa974, 0xa4b0, 0xb27a, 0x6a50, 0x6d40, 0xaf46, 0xab60, 0x9570,
    0x4af5, 0x4970, 0x64b0, 0x74a3, 0xea50, 0x6b58, 0x5ac0, 0xab60, 0x96d5, 0x92e0,
    0xc960, 0xd954, 0xd4a0, 0xda50, 0x7552, 0x56a0, 0xabb7, 0x25d0, 0x92d0, 0xcab5,
    0xa950, 0xb4a0, 0xbaa4, 0xad50, 0x55d9, 0x4ba0, 0xa5b0, 0x15176, 0x52b0, 0xa930,
    0x7954, 0x6aa0, 0xad50, 0x5b52, 0x4b60, 0xa6e6, 0xa4e0, 0xd260, 0xea65, 0xd530,
    0x5aa0, 0x76a3, 0x96d0, 0x4afb, 0x4ad0, 0xa4d0, 0x1d0b6, 0xd250, 0xd520, 0xdd45,
    0xb5a0, 0x56d0, 0x55b2, 0x49b0, 0xa577, 0xa4b0, 0xaa50, 0x1b255, 0x6d20, 0xada0,
    0x14b63, 0x9370, 0x49f8, 0x4970, 0x64b0, 0x168a6, 0xea50, 0x6b20, 0x1a6c4, 0xaae0,
    0x92e0, 0xd2e3, 0xc960, 0xd557, 0xd4a0, 0xda50, 0x5d55, 0x56a0, 0xa6d0, 0x55d4,
    0x52d0, 0xa9b8, 0xa950, 0xb4a0, 0xb6a6, 0xad50, 0x55a0, 0xaba4, 0xa5b0, 0x52b0,
    0xb273, 0x6930, 0x7337, 0x6aa0, 0xad50, 0x14b55, 0x4b60, 0xa570, 0x54e4, 0xd160,
    0xe968, 0xd520, 0xdaa0, 0x16aa6, 0x56d0, 0x4ae0, 0xa9d4, 0xa4d0, 0xd150, 0xf252,
    0xd520
  ];

  var MONTH_NAMES = ['正月', '二月', '三月', '四月', '五月', '六月',
    '七月', '八月', '九月', '十月', '冬月', '腊月'];

  var DAY_NAMES = (function () {
    var out = [];
    for (var i = 1; i <= 30; i++) {
      if (i === 10) out.push('初十');
      else if (i === 20) out.push('二十');
      else if (i === 30) out.push('三十');
      else {
        var tens = Math.floor(i / 10);
        var ones = i % 10;
        var prefix = tens === 0 ? '初' : tens === 1 ? '十' : tens === 2 ? '廿' : '三十';
        out.push(prefix + ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'][ones]);
      }
    }
    return out;
  })();

  function leapMonth(y) {
    checkYear(y);
    return INFO[y - START] & 0xf;
  }

  function leapDays(y) {
    if (!leapMonth(y)) return 0;
    return (INFO[y - START] & 0x10000) ? 30 : 29;
  }

  function monthDays(y, m) {
    checkYear(y);
    return (INFO[y - START] & (0x10000 >> m)) ? 30 : 29;
  }

  function yearDays(y) {
    checkYear(y);
    var sum = 348; // 12 × 29
    for (var i = 0x8000; i > 0x8; i >>= 1) {
      if (INFO[y - START] & i) sum += 1;
    }
    return sum + leapDays(y);
  }

  function checkYear(y) {
    if (!Number.isInteger(y) || y < START || y > END) {
      throw new Error('农历只支持 ' + START + '–' + END + ' 年');
    }
  }

  // 农历 → 公历。isLeap 为 true 时表示闰月。
  function toSolar(lYear, lMonth, lDay, isLeap) {
    checkYear(lYear);
    if (!Number.isInteger(lMonth) || lMonth < 1 || lMonth > 12) {
      throw new Error('农历月份应为 1–12');
    }
    var leap = leapMonth(lYear);
    if (isLeap && leap !== lMonth) {
      throw new Error(lYear + ' 年没有闰' + (lMonth - 1) + '月');
    }
    var maxDay = isLeap ? leapDays(lYear) : monthDays(lYear, lMonth);
    if (!Number.isInteger(lDay) || lDay < 1 || lDay > maxDay) {
      throw new Error('该月只有 ' + maxDay + ' 天');
    }

    var offset = 0;
    for (var y = START; y < lYear; y++) offset += yearDays(y);
    for (var m = 1; m < lMonth; m++) {
      offset += monthDays(lYear, m);
      if (leap === m) offset += leapDays(lYear);
    }
    if (isLeap) offset += monthDays(lYear, lMonth); // 闰月排在正常月之后
    offset += lDay - 1;

    var d = new Date(Date.UTC(1900, 0, 31) + offset * 86400000);
    var result = { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
    // 农历年末可能跨到次年 1 月，超出排盘支持范围就明确报错
    if (result.year > END) {
      throw new Error('这个农历日期换算后是 ' + result.year + ' 年，超出 2100 年范围');
    }
    return result;
  }

  function monthName(m, isLeap) {
    return (isLeap ? '闰' : '') + MONTH_NAMES[m - 1];
  }

  function dayName(d) {
    return DAY_NAMES[d - 1] || String(d);
  }

  return {
    START: START,
    END: END,
    MONTH_NAMES: MONTH_NAMES,
    DAY_NAMES: DAY_NAMES,
    leapMonth: leapMonth,
    leapDays: leapDays,
    monthDays: monthDays,
    yearDays: yearDays,
    toSolar: toSolar,
    monthName: monthName,
    dayName: dayName
  };
});
