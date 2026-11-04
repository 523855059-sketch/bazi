/*
 * 神煞与地支关系。
 *
 * 神煞取通行表（以日干或年支为基准查四柱），流派差异较大，
 * 输出时只报「命中有此神煞」，不下吉凶结论——同一神煞在不同流派里吉凶相反，
 * 这里只提供事实，判断交给解读层并标注分歧。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./constants.js'));
  else { root.BZ = root.BZ || {}; root.BZ.shensha = factory(root.BZ.constants); }
})(typeof self !== 'undefined' ? self : this, function (C) {
  'use strict';

  var ZHI = C.ZHI;

  /* ---------------- 以日干查 ---------------- */

  // 天乙贵人：甲戊庚牛羊，乙己鼠猴乡，丙丁猪鸡位，壬癸兔蛇藏，六辛逢马虎
  var TIANYI = {
    '甲': ['丑', '未'], '戊': ['丑', '未'], '庚': ['丑', '未'],
    '乙': ['子', '申'], '己': ['子', '申'],
    '丙': ['亥', '酉'], '丁': ['亥', '酉'],
    '壬': ['卯', '巳'], '癸': ['卯', '巳'],
    '辛': ['午', '寅']
  };

  // 文昌：甲乙巳午报君知，丙戊申宫丁己鸡，庚猪辛鼠壬逢虎，癸人见卯入云梯
  var WENCHANG = {
    '甲': '巳', '乙': '午', '丙': '申', '丁': '酉', '戊': '申',
    '己': '酉', '庚': '亥', '辛': '子', '壬': '寅', '癸': '卯'
  };

  // 禄神：日干的临官位
  var LUSHEN = {
    '甲': '寅', '乙': '卯', '丙': '巳', '丁': '午', '戊': '巳',
    '己': '午', '庚': '申', '辛': '酉', '壬': '亥', '癸': '子'
  };

  // 羊刃：阳干之刃。阴干各家所论不一，此处只列阳干。
  var YANGREN = { '甲': '卯', '丙': '午', '戊': '午', '庚': '酉', '壬': '子' };

  /* ---------------- 以年支或日支查 ---------------- */

  function byTriad(table, baseZhi) {
    // 三合局：申子辰、寅午戌、巳酉丑、亥卯未
    var groups = {
      '申': '申子辰', '子': '申子辰', '辰': '申子辰',
      '寅': '寅午戌', '午': '寅午戌', '戌': '寅午戌',
      '巳': '巳酉丑', '酉': '巳酉丑', '丑': '巳酉丑',
      '亥': '亥卯未', '卯': '亥卯未', '未': '亥卯未'
    };
    var g = groups[baseZhi];
    return g ? table[g] : null;
  }

  var TAOHUA = { '申子辰': '酉', '寅午戌': '卯', '巳酉丑': '午', '亥卯未': '子' };
  var YIMA = { '申子辰': '寅', '寅午戌': '申', '巳酉丑': '亥', '亥卯未': '巳' };
  var HUAGAI = { '申子辰': '辰', '寅午戌': '戌', '巳酉丑': '丑', '亥卯未': '未' };
  var JIANGXING = { '申子辰': '子', '寅午戌': '午', '巳酉丑': '酉', '亥卯未': '卯' };

  // 孤辰寡宿：以年支所属方局查
  var GUCHEN = { '亥子丑': '寅', '寅卯辰': '巳', '巳午未': '申', '申酉戌': '亥' };
  var GUASU = { '亥子丑': '戌', '寅卯辰': '丑', '巳午未': '辰', '申酉戌': '未' };

  function fangju(zhi) {
    var i = ZHI.indexOf(zhi);
    if (i <= 1 || i === 11) return '亥子丑';
    if (i >= 2 && i <= 4) return '寅卯辰';
    if (i >= 5 && i <= 7) return '巳午未';
    return '申酉戌';
  }

  /* ---------------- 空亡 ---------------- */

  // 以日柱所在旬定空亡
  var KONGWANG = [
    ['戌', '亥'], // 甲子旬
    ['申', '酉'], // 甲戌旬
    ['午', '未'], // 甲申旬
    ['辰', '巳'], // 甲午旬
    ['寅', '卯'], // 甲辰旬
    ['子', '丑']  // 甲寅旬
  ];

  function kongwangOf(dayGanzhiIndex) {
    return KONGWANG[Math.floor(((dayGanzhiIndex % 60) + 60) % 60 / 10)];
  }

  /* ---------------- 汇总 ---------------- */

  // pillars: bazi.calc 的四柱（含 hidden）
  function calc(pillars, dayGanzhiIndex) {
    var zhis = ['year', 'month', 'day', 'hour'].map(function (k) { return pillars[k].zhi; });
    var gans = ['year', 'month', 'day', 'hour'].map(function (k) { return pillars[k].gan; });
    var dayGan = pillars.day.gan;
    var yearZhi = pillars.year.zhi;
    var dayZhi = pillars.day.zhi;

    var out = [];
    function add(name, target, basis) {
      if (!target) return;
      var hits = [];
      for (var i = 0; i < zhis.length; i++) {
        if (zhis[i] === target) hits.push(['年柱', '月柱', '日柱', '时柱'][i]);
      }
      if (hits.length) out.push({ name: name, zhi: target, at: hits, basis: basis });
    }

    // 天乙贵人
    (TIANYI[dayGan] || []).forEach(function (z) { add('天乙贵人', z, '以日干' + dayGan + '查'); });
    // 文昌
    add('文昌', WENCHANG[dayGan], '以日干' + dayGan + '查');
    // 禄神
    add('禄神', LUSHEN[dayGan], '以日干' + dayGan + '查');
    // 羊刃
    add('羊刃', YANGREN[dayGan], '以日干' + dayGan + '查（只论阳干）');

    // 桃花、驿马、华盖、将星——年支、日支各查一次，同一结果靠 dedupe 去重
    [byTriad(TAOHUA, yearZhi), byTriad(TAOHUA, dayZhi)].forEach(function (z, idx) {
      add('桃花', z, idx === 0 ? '以年支' + yearZhi + '查' : '以日支' + dayZhi + '查');
    });
    [byTriad(YIMA, yearZhi), byTriad(YIMA, dayZhi)].forEach(function (z, idx) {
      add('驿马', z, idx === 0 ? '以年支' + yearZhi + '查' : '以日支' + dayZhi + '查');
    });
    [byTriad(HUAGAI, yearZhi), byTriad(HUAGAI, dayZhi)].forEach(function (z, idx) {
      add('华盖', z, idx === 0 ? '以年支' + yearZhi + '查' : '以日支' + dayZhi + '查');
    });
    [byTriad(JIANGXING, yearZhi), byTriad(JIANGXING, dayZhi)].forEach(function (z, idx) {
      add('将星', z, idx === 0 ? '以年支' + yearZhi + '查' : '以日支' + dayZhi + '查');
    });

    // 孤辰寡宿
    var fj = fangju(yearZhi);
    add('孤辰', GUCHEN[fj], '以年支' + yearZhi + '所属方局查');
    add('寡宿', GUASU[fj], '以年支' + yearZhi + '所属方局查');

    // 空亡：报四柱中落空的地支
    var kw = kongwangOf(dayGanzhiIndex);
    var kwHits = [];
    for (var i = 0; i < zhis.length; i++) {
      if (kw.indexOf(zhis[i]) >= 0) kwHits.push(['年柱', '月柱', '日柱', '时柱'][i]);
    }

    return {
      list: dedupe(out),
      kongwang: { zhi: kw, at: kwHits }
    };
  }

  function dedupe(list) {
    var seen = {};
    return list.filter(function (x) {
      var key = x.name + '|' + x.zhi;
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  /* ---------------- 地支关系 ---------------- */

  var LIUHE = [['子', '丑'], ['寅', '亥'], ['卯', '戌'], ['辰', '酉'], ['巳', '申'], ['午', '未']];
  var SANHE = [
    { zhis: ['申', '子', '辰'], wuxing: '水' },
    { zhis: ['亥', '卯', '未'], wuxing: '木' },
    { zhis: ['寅', '午', '戌'], wuxing: '火' },
    { zhis: ['巳', '酉', '丑'], wuxing: '金' }
  ];
  var SANHUI = [
    { zhis: ['寅', '卯', '辰'], wuxing: '木' },
    { zhis: ['巳', '午', '未'], wuxing: '火' },
    { zhis: ['申', '酉', '戌'], wuxing: '金' },
    { zhis: ['亥', '子', '丑'], wuxing: '水' }
  ];
  var LIUCHONG = [['子', '午'], ['丑', '未'], ['寅', '申'], ['卯', '酉'], ['辰', '戌'], ['巳', '亥']];
  var LIUHAI = [['子', '未'], ['丑', '午'], ['寅', '巳'], ['卯', '辰'], ['申', '亥'], ['酉', '戌']];
  var LIUPO = [['子', '酉'], ['丑', '辰'], ['寅', '亥'], ['卯', '午'], ['巳', '申'], ['未', '戌']];

  var POS = ['年', '月', '日', '时'];

  function calcRelations(pillars) {
    var zhis = POS.map(function (p) { return pillars[p === '年' ? 'year' : p === '月' ? 'month' : p === '日' ? 'day' : 'hour'].zhi; });
    var result = { liuhe: [], sanhe: [], sanhui: [], chong: [], xing: [], hai: [], po: [] };

    // 两两查
    for (var i = 0; i < zhis.length; i++) {
      for (var j = i + 1; j < zhis.length; j++) {
        var a = zhis[i], b = zhis[j];
        LIUHE.forEach(function (p) {
          if ((a === p[0] && b === p[1]) || (a === p[1] && b === p[0])) {
            result.liuhe.push(POS[i] + POS[j] + ' ' + a + b + '合');
          }
        });
        LIUCHONG.forEach(function (p) {
          if ((a === p[0] && b === p[1]) || (a === p[1] && b === p[0])) {
            result.chong.push(POS[i] + POS[j] + ' ' + a + b + '冲');
          }
        });
        LIUHAI.forEach(function (p) {
          if ((a === p[0] && b === p[1]) || (a === p[1] && b === p[0])) {
            result.hai.push(POS[i] + POS[j] + ' ' + a + b + '害');
          }
        });
        LIUPO.forEach(function (p) {
          if ((a === p[0] && b === p[1]) || (a === p[1] && b === p[0])) {
            result.po.push(POS[i] + POS[j] + ' ' + a + b + '破');
          }
        });
      }
    }

    // 三合、三会：四支中凑齐三字
    SANHE.forEach(function (g) {
      var found = g.zhis.every(function (z) { return zhis.indexOf(z) >= 0; });
      if (found) result.sanhe.push(g.zhis.join('') + '合' + g.wuxing + '局');
    });
    SANHUI.forEach(function (g) {
      var found = g.zhis.every(function (z) { return zhis.indexOf(z) >= 0; });
      if (found) result.sanhui.push(g.zhis.join('') + '会' + g.wuxing + '方');
    });

    // 三刑
    var XING_GROUPS = [
      { zhis: ['寅', '巳', '申'], name: '寅巳申三刑' },
      { zhis: ['丑', '戌', '未'], name: '丑戌未三刑' }
    ];
    XING_GROUPS.forEach(function (g) {
      var found = g.zhis.every(function (z) { return zhis.indexOf(z) >= 0; });
      if (found) result.xing.push(g.name);
    });
    // 子卯相刑
    if (zhis.indexOf('子') >= 0 && zhis.indexOf('卯') >= 0) result.xing.push('子卯相刑');
    // 自刑
    ['辰', '午', '酉', '亥'].forEach(function (z) {
      var n = zhis.filter(function (x) { return x === z; }).length;
      if (n >= 2) result.xing.push(z + z + '自刑');
    });

    return result;
  }

  return {
    calc: calc,
    calcRelations: calcRelations,
    kongwangOf: kongwangOf,
    TIANYI: TIANYI,
    WENCHANG: WENCHANG,
    LUSHEN: LUSHEN,
    YANGREN: YANGREN
  };
});
