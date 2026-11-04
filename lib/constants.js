/*
 * 干支基础数据与关系。
 *
 * 所有表都取自子平命理的通行口径，遇到流派分歧处在注释里写明本项目取哪一个。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.BZ = root.BZ || {}; root.BZ.constants = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
  var ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

  // 五行按相生顺序排列：木 → 火 → 土 → 金 → 水 → 木
  var WUXING = ['木', '火', '土', '金', '水'];

  var GAN_WUXING = ['木', '木', '火', '火', '土', '土', '金', '金', '水', '水'];
  var ZHI_WUXING = ['水', '土', '木', '木', '土', '火', '火', '土', '金', '金', '土', '水'];

  // 阳 = true。天干、地支都按「阳阴交替」排列。
  var GAN_YANG = [true, false, true, false, true, false, true, false, true, false];
  var ZHI_YANG = [true, false, true, false, true, false, true, false, true, false, true, false];

  // 地支藏干：按本气、中气、余气排列。
  var HIDDEN_GAN = {
    '子': ['癸'],
    '丑': ['己', '癸', '辛'],
    '寅': ['甲', '丙', '戊'],
    '卯': ['乙'],
    '辰': ['戊', '乙', '癸'],
    '巳': ['丙', '戊', '庚'],
    '午': ['丁', '己'],
    '未': ['己', '丁', '乙'],
    '申': ['庚', '壬', '戊'],
    '酉': ['辛'],
    '戌': ['戊', '辛', '丁'],
    '亥': ['壬', '甲']
  };

  // 六十甲子纳音，每两个干支共用一个。
  var NAYIN = [
    '海中金', '炉中火', '大林木', '路旁土', '剑锋金',
    '山头火', '涧下水', '城头土', '白蜡金', '杨柳木',
    '泉中水', '屋上土', '霹雳火', '松柏木', '长流水',
    '沙中金', '山下火', '平地木', '壁上土', '金箔金',
    '覆灯火', '天河水', '大驿土', '钗钏金', '桑柘木',
    '大溪水', '沙中土', '天上火', '石榴木', '大海水'
  ];

  // 干支序号（0–59）→ 纳音
  function nayinOf(ganzhiIndex) {
    return NAYIN[Math.floor(ganzhiIndex / 2)];
  }

  function ganzhiName(index) {
    var i = ((index % 60) + 60) % 60;
    return GAN[i % 10] + ZHI[i % 12];
  }

  // 由天干、地支反推六十甲子序号；不合法组合返回 -1。
  function ganzhiIndex(gan, zhi) {
    var g = GAN.indexOf(gan), z = ZHI.indexOf(zhi);
    if (g < 0 || z < 0) return -1;
    for (var i = 0; i < 60; i++) {
      if (i % 10 === g && i % 12 === z) return i;
    }
    return -1;
  }

  /* ---------------- 五行生克 ---------------- */

  // 我生者
  function wuxingGenerates(w) {
    return WUXING[(WUXING.indexOf(w) + 1) % 5];
  }
  // 我克者
  function wuxingControls(w) {
    return WUXING[(WUXING.indexOf(w) + 2) % 5];
  }
  // 生我者
  function wuxingGeneratedBy(w) {
    return WUXING[(WUXING.indexOf(w) + 4) % 5];
  }
  // 克我者
  function wuxingControlledBy(w) {
    return WUXING[(WUXING.indexOf(w) + 3) % 5];
  }

  /* ---------------- 十神 ---------------- */
  // 以日干为我，判断另一个天干与我的关系。
  function shishen(dayGan, otherGan) {
    var di = GAN.indexOf(dayGan), oi = GAN.indexOf(otherGan);
    if (di < 0 || oi < 0) return '';
    var dw = GAN_WUXING[di], ow = GAN_WUXING[oi];
    var samePolarity = GAN_YANG[di] === GAN_YANG[oi];

    if (dw === ow) return samePolarity ? '比肩' : '劫财';
    if (wuxingGenerates(ow) === dw) return samePolarity ? '偏印' : '正印'; // 生我
    if (wuxingGenerates(dw) === ow) return samePolarity ? '食神' : '伤官'; // 我生
    if (wuxingControls(ow) === dw) return samePolarity ? '七杀' : '正官'; // 克我
    if (wuxingControls(dw) === ow) return samePolarity ? '偏财' : '正财'; // 我克
    return '';
  }

  // 十神归类，用于统计与展示
  var SHISHEN_GROUP = {
    '比肩': '比劫', '劫财': '比劫',
    '食神': '食伤', '伤官': '食伤',
    '正财': '财星', '偏财': '财星',
    '正官': '官杀', '七杀': '官杀',
    '正印': '印星', '偏印': '印星'
  };

  return {
    GAN: GAN,
    ZHI: ZHI,
    WUXING: WUXING,
    GAN_WUXING: GAN_WUXING,
    ZHI_WUXING: ZHI_WUXING,
    GAN_YANG: GAN_YANG,
    ZHI_YANG: ZHI_YANG,
    HIDDEN_GAN: HIDDEN_GAN,
    NAYIN: NAYIN,
    SHISHEN_GROUP: SHISHEN_GROUP,
    nayinOf: nayinOf,
    ganzhiName: ganzhiName,
    ganzhiIndex: ganzhiIndex,
    wuxingGenerates: wuxingGenerates,
    wuxingControls: wuxingControls,
    wuxingGeneratedBy: wuxingGeneratedBy,
    wuxingControlledBy: wuxingControlledBy,
    shishen: shishen
  };
});
