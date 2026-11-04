/*
 * 命理判断层：旺衰、格局、用神。
 *
 * 这里不追求「大师级」的精细，追求三件事：
 *   ① 每个结论都能追到具体的干支（可解释，不是黑箱）
 *   ② 判断口径写死并可从 README 查到（可复现）
 *   ③ 拿不准的地方标出来（如月令不透、从格存疑）
 *
 * 输出的分数是「传统旺衰」的量化近似，用于给解读层一个稳定的判断骨架；
 * 它不替代命理师对全局的权衡，也不能当成吉凶结论。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./constants.js'), require('./shensha.js'));
  else { root.BZ = root.BZ || {}; root.BZ.analysis = factory(root.BZ.constants, root.BZ.shensha); }
})(typeof self !== 'undefined' ? self : this, function (C, S) {
  'use strict';

  var GAN = C.GAN, ZHI = C.ZHI;

  function wxOfGan(g) { return C.GAN_WUXING[GAN.indexOf(g)]; }
  function wxOfZhi(z) { return C.ZHI_WUXING[ZHI.indexOf(z)]; }
  function mod(n, m) { return ((n % m) + m) % m; }

  /* ---------------- 旺衰 ---------------- */

  function strength(chart) {
    var p = chart.pillars;
    var dayGan = chart.dayMaster;
    var dw = wxOfGan(dayGan);
    var monthZhi = p.month.zhi;
    var mw = wxOfZhi(monthZhi);

    var detail = [];
    var score = 0;

    // 1) 得令：日主五行与月令五行的生克关系
    var lingScore, lingName;
    if (mw === dw) { lingScore = 3; lingName = '得令（旺）'; }
    else if (C.wuxingGenerates(mw) === dw) { lingScore = 2; lingName = '得令（相）'; }
    else if (C.wuxingGenerates(dw) === mw) { lingScore = 0; lingName = '失令（休）'; }
    else if (C.wuxingControls(dw) === mw) { lingScore = -2; lingName = '失令（囚）'; }
    else { lingScore = -3; lingName = '失令（死）'; }
    score += lingScore;
    detail.push({
      item: '月令',
      score: lingScore,
      reason: '日主' + dayGan + '（' + dw + '）生于' + monthZhi + '月（' + mw + '），' + lingName
    });

    // 2) 通根：四支藏干中与日主同五行者
    ['year', 'month', 'day', 'hour'].forEach(function (k) {
      p[k].hidden.forEach(function (h, idx) {
        if (wxOfGan(h.gan) !== dw) return;
        var s = idx === 0 ? 2 : idx === 1 ? 1 : 0.5;
        score += s;
        detail.push({
          item: '通根',
          score: s,
          reason: ({ year: '年', month: '月', day: '日', hour: '时' })[k] + '支' + p[k].zhi
            + '中藏' + h.gan + '（' + (idx === 0 ? '本气' : idx === 1 ? '中气' : '余气') + '）'
        });
      });
    });

    // 3) 天干帮扶：年、月、时干中的比劫与印星（日干本身不计）
    ['year', 'month', 'hour'].forEach(function (k) {
      var g = p[k].gan, gw = wxOfGan(g);
      var label = ({ year: '年', month: '月', hour: '时' })[k];
      if (gw === dw) {
        score += 1;
        detail.push({ item: '天干帮扶', score: 1, reason: label + '干' + g + '为比劫' });
      } else if (C.wuxingGenerates(gw) === dw) {
        score += 0.8;
        detail.push({ item: '天干帮扶', score: 0.8, reason: label + '干' + g + '为印星' });
      }
    });

    // 4) 克泄耗：天干与地支本气中的官杀、财、食伤
    ['year', 'month', 'hour'].forEach(function (k) {
      var g = p[k].gan, gw = wxOfGan(g);
      var label = ({ year: '年', month: '月', hour: '时' })[k] + '干' + g;
      if (C.wuxingControls(gw) === dw) { score -= 1.2; detail.push({ item: '克泄耗', score: -1.2, reason: label + '为官杀' }); }
      else if (C.wuxingControls(dw) === gw) { score -= 1; detail.push({ item: '克泄耗', score: -1, reason: label + '为财星' }); }
      else if (C.wuxingGenerates(dw) === gw) { score -= 0.8; detail.push({ item: '克泄耗', score: -0.8, reason: label + '为食伤' }); }
    });
    ['year', 'month', 'day', 'hour'].forEach(function (k) {
      var z = p[k].zhi, zw = wxOfZhi(z);
      var label = ({ year: '年', month: '月', day: '日', hour: '时' })[k] + '支' + z;
      if (C.wuxingControls(zw) === dw) { score -= 1.2; detail.push({ item: '克泄耗', score: -1.2, reason: label + '为官杀' }); }
      else if (C.wuxingControls(dw) === zw) { score -= 1; detail.push({ item: '克泄耗', score: -1, reason: label + '为财星' }); }
      else if (C.wuxingGenerates(dw) === zw) { score -= 0.8; detail.push({ item: '克泄耗', score: -0.8, reason: label + '为食伤' }); }
    });

    score = Math.round(score * 10) / 10;

    var level, levelText;
    if (score >= 5) { level = 'strong'; levelText = '偏强'; }
    else if (score >= 2) { level = 'medium-strong'; levelText = '中和偏强'; }
    else if (score > -2) { level = 'balanced'; levelText = '中和'; }
    else if (score > -5) { level = 'medium-weak'; levelText = '中和偏弱'; }
    else { level = 'weak'; levelText = '偏弱'; }

    return { score: score, level: level, levelText: levelText, detail: detail };
  }

  /* ---------------- 格局 ---------------- */

  var GE_NAME = {
    '正官': '正官格', '七杀': '七杀格',
    '正财': '正财格', '偏财': '偏财格',
    '正印': '正印格', '偏印': '偏印格',
    '食神': '食神格', '伤官': '伤官格'
  };

  function pattern(chart) {
    var p = chart.pillars;
    var dayGan = chart.dayMaster;
    var monthZhi = p.month.zhi;
    var hidden = p.month.hidden; // [{gan, shishen}]

    // 建禄格 / 羊刃格：月支正是日主的禄位或刃位（表与神煞共用，避免两处漂移）
    var LU = S.LUSHEN;
    var REN = S.YANGREN;
    if (LU[dayGan] === monthZhi) {
      return { name: '建禄格', basis: '日主' + dayGan + '的禄位在' + monthZhi + '，月支即禄', confidence: 'high', ge: '比劫' };
    }
    if (REN[dayGan] === monthZhi) {
      return { name: '羊刃格', basis: '日主' + dayGan + '的刃位在' + monthZhi + '，月支即刃', confidence: 'high', ge: '比劫' };
    }

    // 月令藏干依次查是否透干（年、月、时干）
    var touGan = [p.year.gan, p.month.gan, p.hour.gan];
    var names = ['本气', '中气', '余气'];

    for (var i = 0; i < hidden.length; i++) {
      var h = hidden[i];
      if (touGan.indexOf(h.gan) >= 0) {
        var geName = GE_NAME[h.shishen];
        if (!geName) continue; // 比肩劫财透出，不作八格论，往下看
        return {
          name: geName,
          basis: '月支' + monthZhi + names[i] + h.gan + '透出天干，取' + h.shishen + '为格',
          confidence: 'high',
          ge: h.shishen
        };
      }
    }

    // 都不透：以月令本气论格，标注存疑
    var main = hidden[0];
    var mainTou = touGan.indexOf(main.gan) >= 0;
    var fallback = GE_NAME[main.shishen];
    if (fallback) {
      return {
        name: fallback,
        basis: '月支' + monthZhi + '藏干均未透出，权以本气' + main.gan + '（' + main.shishen + '）论格',
        confidence: 'low',
        ge: main.shishen
      };
    }
    return {
      name: '月劫格',
      basis: '月支' + monthZhi + '本气' + main.gan + '为' + main.shishen
        + (mainTou ? '，比劫透出不入八格，权作月劫格' : '，未透出'),
      confidence: 'low',
      ge: '比劫'
    };
  }

  /* ---------------- 用神 ---------------- */

  function yongshen(chart, strengthResult, patternResult) {
    var dw = wxOfGan(chart.dayMaster);
    var gen = C.wuxingGeneratedBy(dw);   // 生我（印）
    var con = C.wuxingControlledBy(dw);  // 克我（官杀）
    var genBy = C.wuxingGenerates(dw);   // 我生（食伤）
    var ctl = C.wuxingControls(dw);      // 我克（财）

    var s = strengthResult.level;
    var primary, secondary, avoid, method, reason;

    if (s === 'weak' || s === 'medium-weak') {
      primary = gen; secondary = dw; avoid = [ctl, con, genBy];
      method = '扶抑（身弱用印比）';
      reason = '日主' + chart.dayMaster + '（' + dw + '）' + strengthResult.levelText
        + '，宜生扶：取' + gen + '（印星）生身，' + dw + '（比劫）帮身；'
        + '忌' + ctl + '（财）耗、' + con + '（官杀）克、' + genBy + '（食伤）泄';
    } else if (s === 'strong' || s === 'medium-strong') {
      primary = con; secondary = ctl; avoid = [gen, dw];
      method = '扶抑（身强用官财）';
      reason = '日主' + chart.dayMaster + '（' + dw + '）' + strengthResult.levelText
        + '，宜克泄：取' + con + '（官杀）制身，' + ctl + '（财）耗身；忌' + gen + '（印）生、' + dw + '（比劫）帮';
    } else {
      // 中和：按格局取
      var ge = patternResult.ge;
      var map = {
        '正官': { p: ctl, s: gen, a: [dw], t: '财生官' },
        '七杀': { p: genBy, s: ctl, a: [dw], t: '食伤制杀' },
        '正财': { p: genBy, s: con, a: [dw], t: '食伤生财' },
        '偏财': { p: genBy, s: con, a: [dw], t: '食伤生财' },
        '正印': { p: con, s: ctl, a: [gen], t: '官杀生印' },
        '偏印': { p: con, s: ctl, a: [gen], t: '官杀生印' },
        '食神': { p: ctl, s: genBy, a: [gen], t: '食神生财' },
        '伤官': { p: ctl, s: gen, a: [con], t: '伤官生财' },
        '比劫': { p: con, s: ctl, a: [dw], t: '官杀制比劫' }
      };
      var m = map[ge] || { p: ctl, s: gen, a: [dw], t: '泄秀' };
      primary = m.p; secondary = m.s; avoid = m.a;
      method = '格局取用（' + m.t + '）';
      reason = '日主' + chart.dayMaster + '（' + dw + '）' + strengthResult.levelText
        + '，以' + patternResult.name + '论，取' + primary + '为用，' + secondary + '为喜；忌' + avoid.join('、');
    }

    // 调候：冬生取火、夏生取水（只作补充提示，不覆盖扶抑结论）
    var monthZhi = chart.pillars.month.zhi;
    var tiaohou = null;
    if (['亥', '子', '丑'].indexOf(monthZhi) >= 0) {
      tiaohou = { wuxing: '火', reason: '生于' + monthZhi + '月，天寒，先看调候是否有火' };
    } else if (['巳', '午', '未'].indexOf(monthZhi) >= 0) {
      tiaohou = { wuxing: '水', reason: '生于' + monthZhi + '月，天热，先看调候是否有水' };
    }

    return {
      method: method,
      primary: primary,
      secondary: secondary,
      avoid: avoid,
      reason: reason,
      tiaohou: tiaohou
    };
  }

  /* ---------------- 命局特征 ---------------- */

  function features(chart, strengthResult) {
    var out = [];
    var w = chart.wuxing.full;

    // 五行偏枯
    var zero = [], heavy = [];
    ['木', '火', '土', '金', '水'].forEach(function (k) {
      if (w[k] === 0) zero.push(k);
      if (w[k] >= 4) heavy.push(k + '×' + w[k]);
    });
    if (zero.length) out.push({ type: '缺', text: '命局五行缺' + zero.join('、') + '（天干地支藏干均无）' });
    if (heavy.length) out.push({ type: '旺', text: '五行偏聚：' + heavy.join('、') });

    // 十神分布（最高计数取到 3 以上才说“为多”，否则只列分布）
    var ss = chart.shishen;
    var sorted = Object.keys(ss).sort(function (a, b) { return ss[b] - ss[a]; });
    if (sorted.length) {
      var top = ss[sorted[0]];
      var names = sorted.slice(0, 2).map(function (k) { return k + '（' + ss[k] + '）'; }).join('、');
      out.push({
        type: '十神',
        text: top >= 3 ? '十神以' + names + '为多' : '十神分布平均，较多者为' + names
      });
    }

    // 日主强弱
    out.push({ type: '旺衰', text: '日主' + chart.dayMaster + strengthResult.levelText + '（综合 ' + strengthResult.score + ' 分）' });

    return out;
  }

  /* ---------------- 汇总 ---------------- */

  function analyze(chart) {
    var st = strength(chart);
    var pt = pattern(chart);
    var ys = yongshen(chart, st, pt);
    return {
      strength: st,
      pattern: pt,
      yongshen: ys,
      features: features(chart, st)
    };
  }

  return {
    analyze: analyze,
    strength: strength,
    pattern: pattern,
    yongshen: yongshen,
    features: features
  };
});
