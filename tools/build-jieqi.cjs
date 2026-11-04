/*
 * 生成 1899–2101 年二十四节气时刻表（对外支持 1900–2100，前后各留一年余量）。
 *
 * 输出 data/jieqi.js：每年 24 个，从小寒起，值 = 该节气 UT 儒略日 − 基准日。
 * 基准日取起始年（1899）1 月 1 日 00:00 UT。
 * 对外支持范围是 1900–2100，表本身前后各多算一年，保证边界日期能算出来。
 *
 * 用法：node tools/build-jieqi.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const astro = require('../lib/astro.js');

const START_YEAR = 1899;
const END_YEAR = 2101;
const BASE_JD = astro.toJD(START_YEAR, 1, 1);

// 每个节气对应的太阳视黄经（从小寒 285° 起，每 15° 一个）
function longitudeOf(i) {
  return (285 + i * 15) % 360;
}

const values = [];
for (let year = START_YEAR; year <= END_YEAR; year++) {
  for (let i = 0; i < 24; i++) {
    // 小寒约在 1 月 5–6 日，之后每 15.22 天一个节气
    const guessUt = astro.toJD(year, 1, 6) + i * 15.2184;
    const guessTt = astro.utToTt(guessUt);
    const jde = astro.solveLongitude(longitudeOf(i), guessTt);
    const jdUt = astro.ttToUt(jde);
    values.push(Math.round((jdUt - BASE_JD) * 1e6) / 1e6);
  }
}

// 自检：相邻节气间隔应在 14–16.5 天之间
for (let i = 1; i < values.length; i++) {
  const gap = values[i] - values[i - 1];
  if (gap < 14 || gap > 16.5) {
    console.error(`间隔异常：第 ${i} 个节气与上一个相差 ${gap.toFixed(3)} 天`);
    process.exit(1);
  }
}

const out = `/*
 * 二十四节气时刻表（1899–2101），由 tools/build-jieqi.cjs 生成，请勿手改。
 * 值 = 该节气 UT 儒略日 − 基准日（1899-01-01 00:00 UT）。
 * 每年 24 个，从小寒起；偶数索引为「节」，奇数索引为「气」。
 */
(function (root) {
  var DATA = {
    baseJD: ${BASE_JD},
    startYear: ${START_YEAR},
    endYear: ${END_YEAR},
    values: ${JSON.stringify(values)}
  };
  if (typeof module === 'object' && module.exports) module.exports = DATA;
  else { root.BZ = root.BZ || {}; root.BZ.JIEQI_DATA = DATA; }
})(typeof self !== 'undefined' ? self : this);
`;

const target = path.join(__dirname, '..', 'data', 'jieqi.js');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, out, 'utf8');

console.log(`已生成 ${target}`);
console.log(`年份 ${START_YEAR}–${END_YEAR}，共 ${values.length} 个节气，文件 ${(out.length / 1024).toFixed(1)} KB`);
