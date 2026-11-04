/*
 * 天文历法核心：儒略日、太阳视黄经、ΔT、均时差。
 *
 * 八字排盘的正确性几乎全部落在这里：
 *   年柱以立春为界、月柱以「节」为界，都要先知道节气发生的准确时刻。
 *
 * 太阳黄经用 VSOP87（Meeus《Astronomical Algorithms》附录 III 地球 L 级数），
 * 求解器把视黄经逼近到 1e-7 度，对应时间误差远小于 1 秒；
 * 真正的精度瓶颈在 ΔT 的近似公式（几十秒），对排盘无实际影响。
 *
 * 浏览器与 Node 共用：UMD 包装，浏览器挂到 window.BZ，Node 走 module.exports。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.BZ = root.BZ || {}; root.BZ.astro = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var RAD = Math.PI / 180;
  var DEG = 180 / Math.PI;

  /* ---------------- 儒略日 ---------------- */

  // 公历日期（可带小数日）→ 儒略日。1582-10-15 之后适用，本项目的 1900–2100 全在范围内。
  function toJD(y, m, d) {
    var yy = y, mm = m;
    if (mm <= 2) { yy -= 1; mm += 12; }
    var A = Math.floor(yy / 100);
    var B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (yy + 4716)) + Math.floor(30.6001 * (mm + 1)) + d + B - 1524.5;
  }

  // 儒略日 → 公历（含小数日）
  function fromJD(jd) {
    var Z = Math.floor(jd + 0.5);
    var F = jd + 0.5 - Z;
    var A = Z;
    if (Z >= 2299161) {
      var alpha = Math.floor((Z - 1867216.25) / 36524.25);
      A = Z + 1 + alpha - Math.floor(alpha / 4);
    }
    var B = A + 1524;
    var C = Math.floor((B - 122.1) / 365.25);
    var D = Math.floor(365.25 * C);
    var E = Math.floor((B - D) / 30.6001);
    var day = B - D - Math.floor(30.6001 * E) + F;
    var month = E < 14 ? E - 1 : E - 13;
    var year = month > 2 ? C - 4716 : C - 4715;
    return { year: year, month: month, day: day };
  }

  /* ---------------- ΔT（TT − UT，秒） ---------------- */
  // Espenak & Meeus (2006) 分段多项式，1900–2150 区间。
  function deltaT(year) {
    var t;
    if (year < 1920) {
      t = year - 1900;
      return -2.79 + 1.494119 * t - 0.0598939 * t * t + 0.0061966 * t * t * t - 0.000197 * t * t * t * t;
    }
    if (year < 1941) {
      t = year - 1920;
      return 21.20 + 0.84493 * t - 0.076100 * t * t + 0.0020936 * t * t * t;
    }
    if (year < 1961) {
      t = year - 1950;
      return 29.07 + 0.407 * t - t * t / 233 + t * t * t / 2547;
    }
    if (year < 1986) {
      t = year - 1975;
      return 45.45 + 1.067 * t - t * t / 260 - t * t * t / 718;
    }
    if (year < 2005) {
      t = year - 2000;
      return 63.86 + 0.3345 * t - 0.060374 * t * t + 0.0017275 * t * t * t
        + 0.000651814 * t * t * t * t + 0.00002373599 * t * t * t * t * t;
    }
    if (year < 2050) {
      t = year - 2000;
      return 62.92 + 0.32217 * t + 0.005589 * t * t;
    }
    t = (year - 1820) / 100;
    return -20 + 32 * t * t - 0.5628 * (2150 - year);
  }

  /* ---------------- 太阳视黄经（VSOP87 地球级数） ---------------- */
  // 每项 [A, B, C]：A·cos(B + C·τ)，A 的单位是 1e-8 弧度，τ 为千儒略年。

  var L0 = [
    [175347046, 0, 0], [3341656, 4.6692568, 6283.07585], [34894, 4.6261, 12566.1517],
    [3497, 2.7441, 5753.3849], [3418, 2.8289, 3.5231], [3136, 3.6277, 77713.7715],
    [2676, 4.4181, 7860.4194], [2343, 6.1352, 3930.2097], [1324, 0.7425, 11506.7698],
    [1273, 2.0371, 529.691], [1199, 1.1096, 1577.3435], [990, 5.233, 5884.927],
    [902, 2.045, 26.298], [857, 3.508, 398.149], [780, 1.179, 5223.694],
    [753, 2.533, 5507.553], [505, 4.583, 18849.228], [492, 4.205, 775.523],
    [357, 2.92, 0.067], [317, 5.849, 11790.629], [284, 1.899, 796.298],
    [271, 0.315, 10977.079], [243, 0.345, 5486.778], [206, 4.806, 2544.314],
    [205, 1.869, 5573.143], [202, 2.458, 6069.777], [156, 0.833, 213.299],
    [132, 3.411, 2942.463], [126, 1.083, 20.775], [115, 0.645, 0.98],
    [103, 0.636, 4694.003], [102, 0.976, 15720.839], [102, 4.267, 7.114],
    [99, 6.21, 2146.17], [98, 0.68, 155.42], [86, 5.98, 161000.69],
    [85, 1.3, 6275.96], [85, 3.67, 71430.7], [80, 1.81, 17260.15],
    [79, 3.04, 12036.46], [75, 1.76, 5088.63], [74, 3.5, 3154.69],
    [74, 4.68, 801.82], [70, 0.83, 9437.76], [62, 3.98, 8827.39],
    [61, 1.82, 7084.9], [57, 2.78, 6286.6], [56, 4.39, 14143.5],
    [56, 3.47, 6279.55], [52, 0.19, 12139.55], [52, 1.33, 1748.02],
    [51, 0.28, 5856.48], [49, 0.49, 1194.45], [41, 5.37, 8429.24],
    [41, 2.4, 19651.05], [39, 6.17, 10447.39], [37, 6.04, 10213.29],
    [37, 2.57, 1059.38], [36, 1.71, 2352.87], [36, 1.78, 6812.77],
    [33, 0.59, 17789.85], [30, 0.44, 83996.85], [30, 2.74, 1349.87],
    [25, 3.16, 4690.48]
  ];

  var L1 = [
    [628331966747, 0, 0], [206059, 2.678235, 6283.07585], [4303, 2.6351, 12566.1517],
    [425, 1.59, 3.523], [119, 5.796, 26.298], [109, 2.966, 1577.344],
    [93, 2.59, 18849.23], [72, 1.14, 529.69], [68, 1.87, 398.15],
    [67, 4.41, 5507.55], [59, 2.89, 5223.69], [56, 2.17, 155.42],
    [45, 0.4, 796.3], [36, 0.47, 775.52], [29, 2.65, 7.11],
    [21, 5.34, 0.98], [19, 1.85, 5486.78], [19, 4.97, 213.3],
    [17, 2.99, 6275.96], [16, 0.03, 2544.31], [16, 1.43, 2146.17],
    [15, 1.21, 10977.08], [12, 2.83, 1748.02], [12, 3.26, 5088.63],
    [12, 5.27, 1194.45], [12, 2.08, 4694], [11, 0.77, 553.57],
    [10, 1.3, 6286.6], [10, 4.24, 1349.87], [9, 2.7, 242.73],
    [9, 5.64, 951.72], [8, 5.3, 2352.87], [6, 2.65, 9437.76],
    [6, 4.67, 4690.48]
  ];

  var L2 = [
    [52919, 0, 0], [8720, 1.0721, 6283.0758], [309, 0.867, 12566.152],
    [27, 0.05, 3.52], [16, 5.19, 26.3], [16, 3.68, 155.42],
    [10, 0.76, 18849.23], [9, 2.06, 77713.77], [7, 0.83, 775.52],
    [5, 4.66, 1577.34], [4, 1.03, 7.11], [4, 3.44, 5573.14],
    [3, 5.14, 796.3], [3, 6.05, 5507.55], [3, 1.19, 242.73],
    [3, 6.12, 529.69], [3, 0.31, 398.15], [3, 2.28, 553.57],
    [2, 4.38, 5223.69], [2, 3.75, 0.98]
  ];

  var L3 = [
    [289, 5.844, 6283.076], [35, 0, 0], [17, 5.49, 12566.15],
    [3, 5.2, 155.42], [1, 4.72, 3.52], [1, 5.3, 18849.23],
    [1, 5.97, 242.73]
  ];

  var L4 = [[114, 3.142, 0], [8, 4.13, 6283.08], [1, 3.84, 12566.15]];
  var L5 = [[1, 3.14, 0]];

  function series(terms, tau) {
    var s = 0;
    for (var i = 0; i < terms.length; i++) {
      s += terms[i][0] * Math.cos(terms[i][1] + terms[i][2] * tau);
    }
    return s;
  }

  // 太阳视黄经（度，0–360）。入参为 TT 儒略日。
  function sunApparentLongitude(jde) {
    var tau = (jde - 2451545.0) / 365250.0;

    // 地球日心黄经（弧度），L 总和除以 1e8
    var L = series(L0, tau) + series(L1, tau) * tau + series(L2, tau) * tau * tau
      + series(L3, tau) * tau * tau * tau + series(L4, tau) * Math.pow(tau, 4)
      + series(L5, tau) * Math.pow(tau, 5);
    L = L / 1e8;

    // 地心太阳黄经 = 日心地球黄经 + 180°
    var lon = L * DEG + 180;

    // 章动（Meeus 第 22 章简化式，精度约 0.5″）
    var T = (jde - 2451545.0) / 36525.0;
    var omega = (125.04452 - 1934.136261 * T) * RAD;
    var Ls = (280.4665 + 36000.7698 * T) * RAD;
    var Lm = (218.3165 + 481267.8813 * T) * RAD;
    var dpsi = (-17.20 * Math.sin(omega) - 1.32 * Math.sin(2 * Ls)
      - 0.23 * Math.sin(2 * Lm) + 0.21 * Math.sin(2 * omega)); // 角秒

    // 光行差：地球距离取 1 AU，误差在 0.001″ 量级
    var aberration = -20.4898;

    var lambda = lon + (dpsi + aberration) / 3600;
    return ((lambda % 360) + 360) % 360;
  }

  // 求解「太阳视黄经 = target 度」的时刻（TT 儒略日）。guess 需与目标相差不超过半个月。
  function solveLongitude(target, guess) {
    var jde = guess;
    for (var i = 0; i < 40; i++) {
      var l = sunApparentLongitude(jde);
      var diff = target - l;
      diff = ((diff + 180) % 360 + 360) % 360 - 180;
      if (Math.abs(diff) < 1e-7) break;
      jde += diff / 0.9856473; // 太阳平均每日黄经增量
    }
    return jde;
  }

  // 均时差（分钟）：真太阳时 − 平太阳时
  function equationOfTime(jde) {
    var T = (jde - 2451545.0) / 36525.0;
    var L0mean = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
    var lambda = sunApparentLongitude(jde) * RAD;
    var eps = (23.439291 - 0.0130042 * T) * RAD;
    var alpha = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)) * DEG;
    var E = L0mean - 0.0057183 - alpha;
    E = ((E + 180) % 360 + 360) % 360 - 180;
    return E * 4;
  }

  /* ---------------- 时间换算工具 ---------------- */

  // TT ↔ UT
  function ttToUt(jde) {
    var d = fromJD(jde);
    return jde - deltaT(d.year) / 86400;
  }
  function utToTt(jd) {
    var d = fromJD(jd);
    return jd + deltaT(d.year) / 86400;
  }

  // JD → 北京时间（UTC+8）的「年月日时分秒」
  function jdToBeijing(jdUt) {
    var d = fromJD(jdUt + 8 / 24);
    var day = Math.floor(d.day);
    var frac = d.day - day;
    var totalSec = Math.round(frac * 86400);
    var hh = Math.floor(totalSec / 3600);
    var mm = Math.floor((totalSec % 3600) / 60);
    var ss = totalSec % 60;
    if (hh === 24) { hh = 0; day += 1; }
    return { year: d.year, month: d.month, day: day, hour: hh, minute: mm, second: ss };
  }

  // 北京时间的年月日时分 → JD（UT）
  function beijingToJD(y, m, d, hh, mi) {
    return toJD(y, m, d + (hh * 60 + mi) / 1440) - 8 / 24;
  }

  return {
    toJD: toJD,
    fromJD: fromJD,
    deltaT: deltaT,
    sunApparentLongitude: sunApparentLongitude,
    solveLongitude: solveLongitude,
    equationOfTime: equationOfTime,
    ttToUt: ttToUt,
    utToTt: utToTt,
    jdToBeijing: jdToBeijing,
    beijingToJD: beijingToJD
  };
});
