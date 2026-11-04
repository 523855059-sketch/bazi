/*
 * 四柱排盘引擎。
 *
 * 口径（与主流子平排盘一致）：
 *   · 年柱以立春为界，不是以正月初一为界
 *   · 月柱以「节」为界（立春、惊蛰、清明……），不是以中气或农历初一为界
 *   · 日柱按儒略日连续推算，23:00 起算次日（子时换日）
 *   · 时柱由日干五鼠遁推出
 *   · 真太阳时修正按经度差 + 均时差，默认关闭（即按北京时间）
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./astro.js'),
      require('./jieqi.js'),
      require('./constants.js'),
      require('./shensha.js'),
      require('./analysis.js')
    );
  } else {
    root.BZ = root.BZ || {};
    root.BZ.bazi = factory(root.BZ.astro, root.BZ.jieqi, root.BZ.constants, root.BZ.shensha, root.BZ.analysis);
  }
})(typeof self !== 'undefined' ? self : this, function (astro, jq, C, S, A) {
  'use strict';

  var GAN = C.GAN, ZHI = C.ZHI;

  function mod(n, m) { return ((n % m) + m) % m; }

  // 由日历日期求日柱（六十甲子序号）
  function dayGanzhiIndex(y, m, d) {
    var jdn = astro.toJD(y, m, d) + 0.5;
    return mod(Math.round(jdn) + 49, 60);
  }

  // 年柱序号：以立春年为准
  function yearGanzhiIndex(lunarYear) {
    return mod(lunarYear - 4, 60);
  }

  // 月干：五虎遁——甲己之年丙作首
  function monthGan(yearGan, monthZhi) {
    var firstMonthGan = (GAN.indexOf(yearGan) % 5) * 2 + 2;
    var order = mod(ZHI.indexOf(monthZhi) - 2, 12) + 1; // 寅=1 … 丑=12
    return GAN[mod(firstMonthGan + order - 1, 10)];
  }

  // 时干：五鼠遁——甲己还加甲
  function hourGan(dayGan, hourZhi) {
    return GAN[mod((GAN.indexOf(dayGan) % 5) * 2 + ZHI.indexOf(hourZhi), 10)];
  }

  // 当前时刻所属的立春年，用于「今年流年」的默认起点
  function currentLichunYear() {
    var now = new Date();
    var jd = astro.toJD(now.getFullYear(), now.getMonth() + 1,
      now.getDate() + (now.getHours() * 60 + now.getMinutes()) / 1440) - 8 / 24;
    var y = jq.lichunYearAt(jd);
    return y == null ? now.getFullYear() : y;
  }

  // 时辰地支：23–00:59 子，01–02:59 丑……
  function hourZhiIndex(hour) {
    return Math.floor((hour + 1) / 2) % 12;
  }

  function ganzhiOf(idx) {
    return { gan: GAN[mod(idx, 10)], zhi: ZHI[mod(idx, 12)], name: C.ganzhiName(idx), index: mod(idx, 60) };
  }

  /* ---------------- 主入口 ---------------- */

  function calc(opts) {
    var y = opts.year, mo = opts.month, d = opts.day;
    var hh = opts.hour, mi = opts.minute || 0;

    // 入参必须是有限数值：NaN 会让下面的越界比较全部为 false，
    // 于是一路算下去得到满屏 NaN 的盘而不报错。
    if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)
      || !Number.isFinite(hh) || !Number.isFinite(mi)) {
      throw new Error('出生时间参数不完整：年月日时必须是数值');
    }
    var gender = opts.gender === 'female' ? 'female' : 'male';
    var useTrueSolar = !!opts.useTrueSolar;
    var longitude = typeof opts.longitude === 'number' ? opts.longitude : null;

    if (!jq.hasTable()) throw new Error('节气表未加载：请先调用 BZ.jieqi.setTable(...)');

    // 1) 北京时间 → UT 儒略日
    var jdUt = astro.toJD(y, mo, d + (hh * 60 + mi) / 1440) - 8 / 24;

    // 对外支持范围：1900-01-01 至 2100-12-31。表本身多算了一年余量（一前一后），
    // 但越界仍然报错——宁可拒绝，不要拿错位的年表冒充。
    var jdMin = astro.toJD(1900, 1, 1) - 8 / 24;
    var jdMax = astro.toJD(2101, 1, 1) - 8 / 24;
    if (jdUt < jdMin || jdUt >= jdMax) {
      throw new Error('出生时间超出节气表范围（1900–2100）');
    }

    // 2) 真太阳时修正（只影响钟面读数，不改变绝对时刻）
    var deltaMin = 0;
    var eot = astro.equationOfTime(astro.utToTt(jdUt));
    if (useTrueSolar && longitude != null) {
      deltaMin = (longitude - 120) * 4 + eot;
    }

    // 3) 归一化到本地钟面时刻（修正后可能跨日）
    var totalMin = hh * 60 + mi + deltaMin;
    var dayShift = Math.floor(totalMin / 1440);
    totalMin = mod(totalMin, 1440);
    var hhLocal = Math.floor(totalMin / 60);
    var miLocal = Math.round(totalMin % 60);
    if (miLocal === 60) { miLocal = 0; hhLocal += 1; }
    if (hhLocal === 24) { hhLocal = 0; dayShift += 1; }

    // 出生当天的日历日期（含真太阳时跨日）
    var dateShifted = astro.fromJD(astro.toJD(y, mo, d) + dayShift);
    var dy = dateShifted.year, dm = dateShifted.month, dd = Math.floor(dateShifted.day);

    // 4) 子时换日：23:00 起算次日
    var dayForPillar = { y: dy, m: dm, d: dd };
    if (hhLocal >= 23) {
      var next = astro.fromJD(astro.toJD(dy, dm, dd) + 1);
      dayForPillar = { y: next.year, m: next.month, d: Math.floor(next.day) };
    }

    // 5) 四柱
    var dayIdx = dayGanzhiIndex(dayForPillar.y, dayForPillar.m, dayForPillar.d);
    var day = ganzhiOf(dayIdx);

    var lunarYear = jq.lichunYearAt(jdUt);
    if (lunarYear == null) throw new Error('出生时间超出节气表范围（1900–2100）');
    var year = ganzhiOf(yearGanzhiIndex(lunarYear));

    var monthInfo = jq.monthZhiAt(jdUt);
    if (!monthInfo) throw new Error('出生时间超出节气表范围（1900–2100）');
    var monthGanzhi = monthGan(year.gan, monthInfo.zhi);
    var month = {
      gan: monthGanzhi,
      zhi: monthInfo.zhi,
      index: C.ganzhiIndex(monthGanzhi, monthInfo.zhi)
    };
    month.name = C.ganzhiName(month.index);

    var hzIdx = hourZhiIndex(hhLocal);
    var hourZhi = ZHI[hzIdx];
    var hourGanzhi = hourGan(day.gan, hourZhi);
    var hour = {
      gan: hourGanzhi,
      zhi: hourZhi,
      index: C.ganzhiIndex(hourGanzhi, hourZhi)
    };
    hour.name = C.ganzhiName(hour.index);

    // 6) 十神与藏干
    var dayMaster = day.gan;
    function decorate(p) {
      var hidden = (C.HIDDEN_GAN[p.zhi] || []).map(function (g) {
        return { gan: g, shishen: C.shishen(dayMaster, g) };
      });
      return {
        gan: p.gan,
        zhi: p.zhi,
        name: p.name,
        index: p.index,
        ganShishen: p.gan === dayMaster ? '日主' : C.shishen(dayMaster, p.gan),
        nayin: C.nayinOf(p.index),
        hidden: hidden,
        ganWuxing: C.GAN_WUXING[GAN.indexOf(p.gan)],
        zhiWuxing: C.ZHI_WUXING[ZHI.indexOf(p.zhi)]
      };
    }

    var pillars = {
      year: decorate(year),
      month: decorate(month),
      day: decorate(day),
      hour: decorate(hour)
    };

    // 7) 五行统计
    var wuxingCount = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
    var wuxingFull = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
    ['year', 'month', 'day', 'hour'].forEach(function (k) {
      var p = pillars[k];
      wuxingCount[p.ganWuxing] += 1;
      wuxingCount[p.zhiWuxing] += 1;
      wuxingFull[p.ganWuxing] += 1;
      wuxingFull[p.zhiWuxing] += 1;
      p.hidden.forEach(function (x) {
        wuxingFull[C.GAN_WUXING[GAN.indexOf(x.gan)]] += 1;
      });
    });

    // 8) 十神统计（天干 + 藏干）
    var shishenCount = {};
    ['year', 'month', 'hour'].forEach(function (k) {
      var s = pillars[k].ganShishen;
      shishenCount[s] = (shishenCount[s] || 0) + 1;
    });
    ['year', 'month', 'day', 'hour'].forEach(function (k) {
      pillars[k].hidden.forEach(function (x) {
        if (x.shishen) shishenCount[x.shishen] = (shishenCount[x.shishen] || 0) + 1;
      });
    });

    // 9) 大运
    var yearYang = C.GAN_YANG[GAN.indexOf(year.gan)];
    var forward = (yearYang && gender === 'male') || (!yearYang && gender === 'female');
    var birthJD = jdUt;
    var gapDays = forward
      ? (monthInfo.nextJieJD - birthJD)
      : (birthJD - monthInfo.jieJD);
    var yearsExact = gapDays / 3;
    var startYears = Math.floor(yearsExact);
    var startMonths = Math.round((yearsExact - startYears) * 12);
    if (startMonths >= 12) { startYears += 1; startMonths -= 12; }

    var dayunList = [];
    var baseIdx = month.index;
    for (var i = 1; i <= 10; i++) {
      var idx = baseIdx + (forward ? i : -i);
      var gz = ganzhiOf(idx);
      dayunList.push({
        index: mod(idx, 60),
        gan: gz.gan,
        zhi: gz.zhi,
        name: gz.name,
        nayin: C.nayinOf(mod(idx, 60)),
        startAge: startYears + (i - 1) * 10,
        // 起运年份从出生公历年起算（周岁）：用立春年会令元旦至立春间出生者早一年
        startYear: y + startYears + (i - 1) * 10
      });
    }

    // 10) 流年（默认从「今年」起算十年；今年按立春年计，与年柱同口径）
    var refYear = opts.refYear || currentLichunYear();
    var liunian = [];
    for (var j = 0; j < 10; j++) {
      var ly = refYear + j;
      var lz = ganzhiOf(yearGanzhiIndex(ly));
      liunian.push({
        year: ly,
        gan: lz.gan,
        zhi: lz.zhi,
        name: lz.name,
        nayin: C.nayinOf(lz.index),
        age: ly - lunarYear + 1
      });
    }

    var result = {
      pillars: pillars,
      dayMaster: dayMaster,
      lunarYear: lunarYear,
      wuxing: { simple: wuxingCount, full: wuxingFull },
      shishen: shishenCount,
      dayun: {
        forward: forward,
        startYears: startYears,
        startMonths: startMonths,
        startAgeText: startYears + '岁' + (startMonths ? startMonths + '个月' : ''),
        list: dayunList
      },
      liunian: liunian,
      meta: {
        gregorian: { year: y, month: mo, day: d, hour: hh, minute: mi },
        localClock: { year: dy, month: dm, day: dd, hour: hhLocal, minute: miLocal },
        useTrueSolar: useTrueSolar && longitude != null,
        longitude: longitude,
        correctionMinutes: Math.round(deltaMin * 10) / 10,
        equationOfTime: Math.round(eot * 10) / 10,
        monthJie: { name: monthInfo.jieName, zhi: monthInfo.zhi },
        dayShift: dayShift,
        lateZi: hhLocal >= 23,
        gender: gender,
        currentYear: refYear,
        timeConfidence: opts.timeConfidence === 'unknown' ? 'unknown'
          : opts.timeConfidence === 'approx' ? 'approx' : 'exact'
      }
    };

    // 11) 判断层：旺衰、格局、用神、神煞、地支关系
    result.analysis = A.analyze(result);
    result.shensha = S.calc(result.pillars, dayIdx);
    result.relations = S.calcRelations(result.pillars);

    return result;
  }

  /* ---------------- 给大模型的文本描述 ---------------- */

  function toPromptText(chart, opts) {
    opts = opts || {};
    var p = chart.pillars;
    var lines = [];
    lines.push('公历：' + fmtDate(chart.meta.gregorian) + '（' + (chart.meta.gender === 'female' ? '女' : '男') + '）');
    if (chart.meta.timeConfidence === 'unknown') {
      lines.push('');
      lines.push('【重要·时柱不可靠】出生时辰不详，时柱是按午时假定的，不是真实信息。');
      lines.push('凡涉及时柱、时支、时柱十神与神煞、子时换日、时柱参与的合冲刑害，一律不得作为结论依据；');
      lines.push('需要判断时辰相关的事，请直接说明「这一点取决于出生时辰，目前无法判断」。');
    } else if (chart.meta.timeConfidence === 'approx') {
      lines.push('');
      lines.push('【注意】出生时间只有大概范围，时柱可能差一个时辰，涉及时的结论请留余地。');
    }
    if (chart.meta.useTrueSolar) {
      lines.push('真太阳时校正：经度 ' + chart.meta.longitude + '°，校正 ' + chart.meta.correctionMinutes + ' 分钟（其中均时差 ' + chart.meta.equationOfTime + ' 分钟）');
    }
    lines.push('四柱：' + p.year.name + ' ' + p.month.name + ' ' + p.day.name + ' ' + p.hour.name);
    lines.push('日主：' + chart.dayMaster + '（' + C.GAN_WUXING[GAN.indexOf(chart.dayMaster)] + '）');
    lines.push('月令：' + chart.meta.monthJie.name + '（' + chart.meta.monthJie.zhi + '月）');
    lines.push('');
    lines.push('各柱明细：');
    ['year', 'month', 'day', 'hour'].forEach(function (k) {
      var label = { year: '年柱', month: '月柱', day: '日柱', hour: '时柱' }[k];
      var q = p[k];
      lines.push('  ' + label + ' ' + q.name + '｜天干十神 ' + q.ganShishen
        + '｜纳音 ' + q.nayin
        + '｜藏干 ' + q.hidden.map(function (x) { return x.gan + '(' + x.shishen + ')'; }).join(' '));
    });
    lines.push('');
    lines.push('五行个数（天干+地支本气）：' + fmtWuxing(chart.wuxing.simple));
    lines.push('五行个数（含藏干）：' + fmtWuxing(chart.wuxing.full));
    lines.push('十神分布（天干+藏干）：' + Object.keys(chart.shishen).map(function (k) {
      return k + '×' + chart.shishen[k];
    }).join(' '));

    // ---- 判断层：旺衰、格局、用神（这是解读的地基，模型必须据此推演）----
    if (chart.analysis) {
      var an = chart.analysis;
      lines.push('');
      lines.push('【旺衰】' + an.strength.levelText + '（综合 ' + an.strength.score + ' 分）');
      an.strength.detail.forEach(function (d) {
        lines.push('  · ' + d.reason + '（' + (d.score > 0 ? '+' : '') + d.score + '）');
      });
      lines.push('');
      lines.push('【格局】' + an.pattern.name + '｜' + an.pattern.basis
        + '｜置信度：' + (an.pattern.confidence === 'high' ? '高' : '低（月令不透，存疑）'));
      lines.push('');
      lines.push('【用神】' + an.yongshen.method + '：用 ' + an.yongshen.primary
        + '，喜 ' + an.yongshen.secondary + '，忌 ' + an.yongshen.avoid.join('、'));
      lines.push('  ' + an.yongshen.reason);
      if (an.yongshen.tiaohou) {
        lines.push('  【调候】' + an.yongshen.tiaohou.reason + '，宜见' + an.yongshen.tiaohou.wuxing);
      }
      lines.push('');
      lines.push('【命局特征】');
      an.features.forEach(function (f) { lines.push('  · ' + f.text); });
    }

    if (chart.shensha) {
      lines.push('');
      lines.push('【神煞】');
      if (chart.shensha.list.length) {
        chart.shensha.list.forEach(function (s) {
          lines.push('  · ' + s.name + '：' + s.zhi + '（' + s.at.join('、') + '）— ' + s.basis);
        });
      } else {
        lines.push('  · 通行神煞表中无落位');
      }
      lines.push('  · 空亡：' + chart.shensha.kongwang.zhi.join('、')
        + (chart.shensha.kongwang.at.length ? '，落' + chart.shensha.kongwang.at.join('、') : '（四柱未落）'));
    }

    if (chart.relations) {
      var r = chart.relations;
      var relParts = [];
      ['liuhe', 'sanhe', 'sanhui', 'chong', 'xing', 'hai', 'po'].forEach(function (k) {
        if (r[k] && r[k].length) relParts.push(r[k].join('、'));
      });
      lines.push('');
      lines.push('【地支关系】' + (relParts.length ? relParts.join('；') : '四支之间无合冲刑害'));
    }

    lines.push('');
    lines.push('大运：' + (chart.dayun.forward ? '顺行' : '逆行') + '，' + chart.dayun.startAgeText + '起运');
    lines.push('  ' + chart.dayun.list.map(function (d) {
      return d.name + '(' + d.startAge + '岁/ ' + d.startYear + ')';
    }).join('  '));
    lines.push('');
    lines.push('流年：' + chart.liunian.slice(0, 10).map(function (l) {
      return l.year + ' ' + l.name;
    }).join('  '));

    if (opts.focus) lines.push('');
    if (opts.focus) lines.push('本次想问：' + opts.focus);

    return lines.join('\n');
  }

  function fmtDate(g) {
    return g.year + '年' + g.month + '月' + g.day + '日 ' + pad(g.hour) + ':' + pad(g.minute);
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmtWuxing(o) {
    return ['木', '火', '土', '金', '水'].map(function (k) { return k + o[k]; }).join(' ');
  }

  return {
    calc: calc,
    toPromptText: toPromptText,
    dayGanzhiIndex: dayGanzhiIndex,
    monthGan: monthGan,
    hourGan: hourGan,
    hourZhiIndex: hourZhiIndex
  };
});
