/*
 * 回测：拿已经发生的事，检验这张盘。
 *
 * 用途不是「预测未来」，而是「验证过去」——命理师收钱后第一件事就是校时：
 * 用你过去几年发生过什么，反推出生时辰记没记错。这一步现在没有 App 做。
 *
 * 输出的 tone 只是粗判（流年五行与用神的关系 + 与原局地支的冲合），
 * 不是断语；真正的话交给解读层，并要求它「对不上就说对不上」。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./constants.js'));
  else { root.BZ = root.BZ || {}; root.BZ.retro = factory(root.BZ.constants); }
})(typeof self !== 'undefined' ? self : this, function (C) {
  'use strict';

  var GAN = C.GAN, ZHI = C.ZHI;

  function mod(n, m) { return ((n % m) + m) % m; }

  // 地支关系表
  var CHONG = { '子': '午', '午': '子', '丑': '未', '未': '丑', '寅': '申', '申': '寅', '卯': '酉', '酉': '卯', '辰': '戌', '戌': '辰', '巳': '亥', '亥': '巳' };
  var HE = { '子': '丑', '丑': '子', '寅': '亥', '亥': '寅', '卯': '戌', '戌': '卯', '辰': '酉', '酉': '辰', '巳': '申', '申': '巳', '午': '未', '未': '午' };
  var HAI = { '子': '未', '未': '子', '丑': '午', '午': '丑', '寅': '巳', '巳': '寅', '卯': '辰', '辰': '卯', '申': '亥', '亥': '申', '酉': '戌', '戌': '酉' };
  var XING_GROUPS = [['寅', '巳', '申'], ['丑', '戌', '未'], ['子', '卯']];

  var POS = ['year', 'month', 'day', 'hour'];
  var POS_CN = { year: '年支', month: '月支', day: '日支', hour: '时支' };
  var EVENT_TYPES = [
    '换工作', '升职', '失业', '创业', '考试升学', '毕业',
    '恋爱', '结婚', '分手', '离婚', '生孩子',
    '搬家', '买房', '生病', '受伤', '亲人离世',
    '破财', '进财', '出国', '其他'
  ];

  function ganzhiOfYear(year) {
    var i = mod(year - 4, 60);
    return { index: i, gan: GAN[i % 10], zhi: ZHI[i % 12], name: C.ganzhiName(i) };
  }

  // 分析某一年：流年干支与原局如何作用
  function analyzeYear(chart, year) {
    var gz = ganzhiOfYear(year);
    var dayMaster = chart.dayMaster;
    var dw = C.GAN_WUXING[GAN.indexOf(dayMaster)];
    var ys = chart.analysis ? chart.analysis.yongshen : null;

    var ganWx = C.GAN_WUXING[GAN.indexOf(gz.gan)];
    var zhiWx = C.ZHI_WUXING[ZHI.indexOf(gz.zhi)];

    // 流年天干对日主的十神
    var shishen = C.shishen(dayMaster, gz.gan);

    // 流年地支与原局四支的关系
    var relations = [];
    POS.forEach(function (k) {
      var pz = chart.pillars[k].zhi;
      if (CHONG[gz.zhi] === pz) relations.push('流年支' + gz.zhi + '冲' + POS_CN[k] + pz);
      if (HE[gz.zhi] === pz) relations.push('流年支' + gz.zhi + '合' + POS_CN[k] + pz);
      if (HAI[gz.zhi] === pz) relations.push('流年支' + gz.zhi + '害' + POS_CN[k] + pz);
      if (gz.zhi === pz) relations.push('流年支' + gz.zhi + '临' + POS_CN[k]);
    });
    XING_GROUPS.forEach(function (g) {
      if (g.indexOf(gz.zhi) >= 0) {
        var others = g.filter(function (x) { return x !== gz.zhi; });
        var hit = others.filter(function (x) {
          return POS.some(function (k) { return chart.pillars[k].zhi === x; });
        });
        if (hit.length) relations.push('流年支' + gz.zhi + '与' + hit.join('、') + '相刑');
      }
    });

    // 粗判吉凶基调：看流年五行是用神、喜神还是忌神
    var role = '闲神';
    if (ys) {
      if (ganWx === ys.primary || zhiWx === ys.primary) role = '用神';
      else if (ganWx === ys.secondary || zhiWx === ys.secondary) role = '喜神';
      else if (ys.avoid && ys.avoid.indexOf(ganWx) >= 0 && ys.avoid.indexOf(zhiWx) >= 0) role = '忌神';
    }

    var badRelations = relations.filter(function (r) { return r.indexOf('冲') >= 0 || r.indexOf('刑') >= 0 || r.indexOf('害') >= 0; });
    var goodRelations = relations.filter(function (r) { return r.indexOf('合') >= 0; });

    var tone;
    if (role === '用神') tone = badRelations.length ? '偏吉（有冲刑，打个折）' : '偏吉';
    else if (role === '喜神') tone = badRelations.length ? '稍吉' : '偏吉';
    else if (role === '忌神') tone = '偏紧';
    else tone = badRelations.length ? '有变动' : '平';

    return {
      year: year,
      ganzhi: gz.name,
      gan: gz.gan,
      zhi: gz.zhi,
      age: year - chart.lunarYear + 1,
      shishen: shishen,
      ganWuxing: ganWx,
      zhiWuxing: zhiWx,
      role: role,
      relations: relations,
      tone: tone,
      dayMasterElement: dw
    };
  }

  // 批量分析事件：events = [{ year, type }]
  function analyzeEvents(chart, events) {
    var out = [];
    var seen = {};
    events.forEach(function (e) {
      var y = Number(e.year);
      if (!Number.isFinite(y)) return;
      if (seen[y]) return; // 同一年只算一次
      seen[y] = true;
      var a = analyzeYear(chart, y);
      a.type = e.type || '';
      out.push(a);
    });
    out.sort(function (a, b) { return a.year - b.year; });
    return out;
  }

  return {
    EVENT_TYPES: EVENT_TYPES,
    ganzhiOfYear: ganzhiOfYear,
    analyzeYear: analyzeYear,
    analyzeEvents: analyzeEvents
  };
});
