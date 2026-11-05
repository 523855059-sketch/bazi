/*
 * 界面逻辑：表单 → 排盘 → 渲染 → AI 解读。
 *
 * 排盘完全在本机完成；只有点击「生成解读」时才会联网。
 */
(function () {
  'use strict';

  var BZ = window.BZ;
  if (!BZ || !BZ.JIEQI_DATA) {
    document.body.innerHTML = '<p style="padding:24px;color:#e08080">节气数据未加载，请确认 data/jieqi.js 存在。</p>';
    return;
  }
  BZ.jieqi.setTable(BZ.JIEQI_DATA);

  var WX_CLASS = { '木': 'wx-mu', '火': 'wx-huo', '土': 'wx-tu', '金': 'wx-jin', '水': 'wx-shui' };
  var WX_COLOR = { '木': '#5aa87c', '火': '#c9584a', '土': '#b8924e', '金': '#cfc9bd', '水': '#5b8fb9' };
  var POS_LABEL = { year: '年柱', month: '月柱', day: '日柱', hour: '时柱' };

  var $ = function (id) { return document.getElementById(id); };
  var state = { gender: 'male', solar: 'off', accuracy: 'exact', chart: null, abort: null, reqId: 0 };

  // 站点若配了解读代理（lib/config.js 的 proxyUrl），访客不填 Key 也能生成
  function proxyConf() {
    var c = BZ.config;
    if (!c || !c.proxyUrl) return null;
    return { url: c.proxyUrl, code: c.proxyCode || '' };
  }

  /* ---------------- 表单 ---------------- */

  function selectOption(containerId, attr, value) {
    var box = $(containerId);
    box.addEventListener('click', function (e) {
      var btn = e.target.closest('button.opt');
      if (!btn) return;
      Array.prototype.forEach.call(box.querySelectorAll('.opt'), function (b) {
        b.classList.toggle('active', b === btn);
      });
      state[attr] = btn.getAttribute('data-' + attr);
      if (attr === 'solar') {
        $('place-hint').textContent = state.solar === 'on'
          ? '中国跨五个时区，但统一用北京时间。同样写「中午 12 点出生」，喀什（东经 76°）实际是巳时，抚远（135°）是午时。'
          : '当前按北京时间排盘，下面选的出生地暂时不参与计算；想按当地真太阳时算，就把上面的「时辰口径」选成真太阳时。';
      }
    });
  }
  selectOption('gender', 'gender');
  selectOption('solar-mode', 'solar');

  /* ---------------- 出生地与时柱可信度 ---------------- */

  // 城市下拉：按省份分组，选中后把经度填进输入框
  (function fillCities() {
    var sel = $('city');
    if (!BZ.CITIES) return;
    BZ.CITIES.list().reduce(function (groups, c) {
      if (!groups[c.province]) {
        groups[c.province] = document.createElement('optgroup');
        groups[c.province].label = c.province;
        sel.appendChild(groups[c.province]);
      }
      var opt = document.createElement('option');
      opt.value = String(c.lng);
      opt.textContent = c.city;
      groups[c.province].appendChild(opt);
      return groups;
    }, {});
    sel.addEventListener('change', function () {
      if (sel.value) $('longitude').value = sel.value;
    });
  })();

  // 时间精度三档：只影响「时柱可不可信」的标注，不改变排盘算法
  (function bindAccuracy() {
    var box = $('time-accuracy');
    var HINTS = {
      exact: '时辰决定时柱。选「大概」或「不确定」时，程序会标注时柱不可靠。',
      approx: '时柱可能差一个时辰。解读会标注「时柱存疑」，涉及时的结论会留余地。',
      unknown: '时柱将按午时假定并明确标注。凡涉及时柱、时支、时柱神煞的结论，解读里不会展开。'
    };
    box.addEventListener('click', function (e) {
      var btn = e.target.closest('button.opt');
      if (!btn) return;
      Array.prototype.forEach.call(box.querySelectorAll('.opt'), function (b) {
        b.classList.toggle('active', b === btn);
      });
      state.accuracy = btn.getAttribute('data-accuracy');
      $('accuracy-hint').textContent = HINTS[state.accuracy] || HINTS.exact;
    });
  })();

  /* ---------------- 农历输入 ---------------- */

  var calendar = 'solar';

  (function bindCalendar() {
    var box = $('calendar-type');
    box.addEventListener('click', function (e) {
      var btn = e.target.closest('button.opt');
      if (!btn) return;
      Array.prototype.forEach.call(box.querySelectorAll('.opt'), function (b) {
        b.classList.toggle('active', b === btn);
      });
      calendar = btn.getAttribute('data-cal');
      var isLunar = calendar === 'lunar';
      $('solar-date-field').classList.toggle('hidden', isLunar);
      $('lunar-date-field').classList.toggle('hidden', !isLunar);
      if (isLunar && !$('lunar-year').value) {
        $('lunar-year').value = new Date().getFullYear();
        rebuildLunar(false);
      }
    });
  })();

  // 重建农历月、日下拉（月列随年份的闰月变化，日列随大小月变化）
  function rebuildLunar(keep) {
    if (!BZ.lunar) return;
    var y = Number($('lunar-year').value);
    if (!Number.isFinite(y)) y = new Date().getFullYear();
    y = Math.min(2100, Math.max(1900, Math.round(y)));
    $('lunar-year').value = y;

    var monthSel = $('lunar-month');
    var prev = keep ? monthSel.value : '';
    monthSel.innerHTML = '';

    var leap = BZ.lunar.leapMonth(y);
    for (var m = 1; m <= 12; m++) {
      var opt = document.createElement('option');
      opt.value = String(m);
      opt.textContent = BZ.lunar.monthName(m, false);
      monthSel.appendChild(opt);
      if (leap === m) {
        var lop = document.createElement('option');
        lop.value = m + 'L';
        lop.textContent = BZ.lunar.monthName(m, true);
        monthSel.appendChild(lop);
      }
    }
    if (prev && monthSel.querySelector('option[value="' + prev + '"]')) monthSel.value = prev;
    rebuildLunarDays();
  }

  function rebuildLunarDays() {
    if (!BZ.lunar) return;
    var y = Number($('lunar-year').value);
    var mv = $('lunar-month').value || '1';
    var isLeap = mv.indexOf('L') >= 0;
    var m = parseInt(mv, 10);
    var max = isLeap ? BZ.lunar.leapDays(y) : BZ.lunar.monthDays(y, m);

    var daySel = $('lunar-day');
    var prev = daySel.value;
    daySel.innerHTML = '';
    for (var d = 1; d <= max; d++) {
      var opt = document.createElement('option');
      opt.value = String(d);
      opt.textContent = BZ.lunar.dayName(d);
      daySel.appendChild(opt);
    }
    if (prev && Number(prev) <= max) daySel.value = prev;
    updateLunarNote();
  }

  function updateLunarNote() {
    var note = $('lunar-note');
    if (!note) return;
    try {
      var s = readLunar();
      note.textContent = '换算成公历：' + s.year + ' 年 ' + s.month + ' 月 ' + s.day + ' 日';
      note.classList.remove('err');
    } catch (e) {
      note.textContent = e.message;
      note.classList.add('err');
    }
  }

  function readLunar() {
    var y = Number($('lunar-year').value);
    var mv = $('lunar-month').value || '1';
    var isLeap = mv.indexOf('L') >= 0;
    var m = parseInt(mv, 10);
    var d = Number($('lunar-day').value);
    return BZ.lunar.toSolar(y, m, d, isLeap);
  }

  (function initLunar() {
    if (!BZ.lunar || !$('lunar-year')) return;
    $('lunar-year').addEventListener('change', function () { rebuildLunar(false); });
    $('lunar-month').addEventListener('change', function () { rebuildLunarDays(); });
    $('lunar-day').addEventListener('change', function () { updateLunarNote(); });
    $('lunar-year').value = new Date().getFullYear();
    rebuildLunar(false);
  })();

  // 默认填今天的日期，减少手输
  (function () {
    var d = new Date();
    var iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    $('birth-date').value = iso;
  })();

  /* ---------------- 排盘 ---------------- */

  $('run').addEventListener('click', function () {
    var timeStr = $('birth-time').value;
    if (!timeStr) {
      alert('请填写出生时间。时辰决定时柱，也会连带影响十神、旺衰和用神；确实不确定时，请按家人记忆尽量填一个，或先只把它当作参考。');
      return;
    }

    var dp;
    if (calendar === 'lunar') {
      try {
        var s = readLunar();
        dp = [s.year, s.month, s.day];
      } catch (e) {
        alert('农历日期有误：' + e.message);
        return;
      }
    } else {
      var dateStr = $('birth-date').value;
      if (!dateStr) { alert('请先选公历生日'); return; }
      dp = dateStr.split('-').map(Number);
    }
    var tp = timeStr.split(':').map(Number);
    var opts = {
      year: dp[0], month: dp[1], day: dp[2],
      hour: tp[0], minute: tp[1],
      gender: state.gender,
      timeConfidence: state.accuracy,
      useTrueSolar: state.solar === 'on',
      longitude: state.solar === 'on' ? Number($('longitude').value) : null
    };

    if (opts.year < 1900 || opts.year > 2100) { alert('节气表覆盖 1900–2100 年'); return; }
    if (opts.useTrueSolar && (isNaN(opts.longitude) || opts.longitude < 73 || opts.longitude > 135)) {
      alert('经度请填 73–135 之间的东经度数');
      return;
    }

    var chart;
    try {
      chart = BZ.bazi.calc(opts);
    } catch (e) {
      alert('排盘失败：' + e.message);
      return;
    }
    state.chart = chart;
    render(chart);
    $('result').scrollIntoView({ block: 'start' });
  });

  /* ---------------- 渲染 ---------------- */

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function pillarHTML(key, p, badge) {
    var ganCls = WX_CLASS[p.ganWuxing] || '';
    var zhiCls = WX_CLASS[p.zhiWuxing] || '';
    var hidden = p.hidden.map(function (h) {
      return h.gan + '<b>' + esc(h.shishen) + '</b>';
    }).join('　');
    return '<div class="pillar">'
      + (badge ? '<span class="pillar-badge">' + badge + '</span>' : '')
      + '<div class="pos">' + POS_LABEL[key] + '</div>'
      + '<div class="ss">' + esc(p.ganShishen) + '</div>'
      + '<div class="gz"><span class="gan ' + ganCls + '">' + p.gan + '</span>'
      + '<span class="zhi ' + zhiCls + '">' + p.zhi + '</span></div>'
      + '<div class="hidden-gan">' + hidden + '</div>'
      + '<div class="nayin">' + esc(p.nayin) + '</div>'
      + '</div>';
  }

  function wuxingHTML(chart) {
    var keys = ['木', '火', '土', '金', '水'];
    var full = chart.wuxing.full;
    var max = Math.max.apply(null, keys.map(function (k) { return full[k]; })) || 1;
    return '<div class="wuxing">' + keys.map(function (k) {
      var n = full[k];
      var w = Math.round((n / max) * 100);
      return '<div class="wx-row">'
        + '<span class="' + WX_CLASS[k] + '">' + k + '</span>'
        + '<span class="bar"><i style="width:' + w + '%;background:' + WX_COLOR[k] + '"></i></span>'
        + '<span class="num">' + n + '</span>'
        + '</div>';
    }).join('') + '</div>';
  }

  function analysisHTML(chart) {
    var an = chart.analysis;
    if (!an) return '';
    var st = an.strength, pt = an.pattern, ys = an.yongshen;
    var dw = BZ.constants.GAN_WUXING[BZ.constants.GAN.indexOf(chart.dayMaster)];

    var rows = '';
    rows += '<div class="judge-row"><span>日主</span><b class="' + (WX_CLASS[dw] || '') + '">'
      + chart.dayMaster + '（' + dw + '）' + st.levelText + ' <em>' + (st.score > 0 ? '+' : '') + st.score + '</em></b></div>';
    rows += '<div class="judge-row"><span>格局</span><b>' + pt.name
      + (pt.confidence === 'high' ? '' : ' <em>存疑</em>') + '</b></div>';
    rows += '<div class="judge-row"><span>用神</span><b class="' + (WX_CLASS[ys.primary] || '') + '">'
      + ys.primary + '</b><b class="sub-line">喜 ' + ys.secondary + ' · 忌 ' + ys.avoid.join('、') + '</b></div>';

    var detail = st.detail.map(function (d) {
      return '<li><span>' + esc(d.reason) + '</span><em>' + (d.score > 0 ? '+' : '') + d.score + '</em></li>';
    }).join('');

    var feats = an.features.map(function (f) {
      return '<li>' + esc(f.text) + '</li>';
    }).join('');

    return '<div class="card">'
      + '<h2>命局判断 <span class="sub">' + st.levelText + ' · ' + pt.name + '</span></h2>'
      + '<div class="judge">' + rows + '</div>'
      + '<p class="judge-note">' + esc(pt.basis) + '</p>'
      + '<details><summary>旺衰打分明细</summary><ul class="detail-list">' + detail + '</ul></details>'
      + '<p class="judge-note">' + esc(ys.reason) + '</p>'
      + (ys.tiaohou ? '<p class="judge-note">调候：' + esc(ys.tiaohou.reason) + '</p>' : '')
      + '<ul class="detail-list plain">' + feats + '</ul>'
      + '<p class="glossary">日主＝你自己　旺衰＝底子厚不厚　格局＝最突出的那条路数　用神＝最该补的方向</p>'
      + '</div>';
  }

  function shenshaHTML(chart) {
    var s = chart.shensha, r = chart.relations;
    if (!s) return '';
    var tags = s.list.map(function (x) {
      return '<span class="tag"><b>' + esc(x.name) + '</b>' + x.zhi + '<i>' + esc(x.at.join('、')) + '</i></span>';
    }).join('');
    if (!tags) tags = '<span class="tag-empty">通行神煞表中无落位</span>';

    var kw = s.kongwang;
    var kwText = '空亡 ' + kw.zhi.join('、') + (kw.at.length ? '（落' + kw.at.join('、') + '）' : '（未落）');

    var rels = [];
    ['liuhe', 'sanhe', 'sanhui', 'chong', 'xing', 'hai', 'po'].forEach(function (k) {
      if (r && r[k] && r[k].length) rels = rels.concat(r[k]);
    });
    var relHTML = rels.length
      ? rels.map(function (x) { return '<span class="tag rel">' + esc(x) + '</span>'; }).join('')
      : '<span class="tag-empty">四支之间无合冲刑害</span>';

    return '<div class="card">'
      + '<h2>神煞与关系 <span class="sub">只列事实，不下吉凶</span></h2>'
      + '<div class="tags">' + tags + '</div>'
      + '<div class="judge-note">' + esc(kwText) + '</div>'
      + '<div class="tags">' + relHTML + '</div>'
      + '</div>';
  }

  function dayunHTML(chart) {
    var list = chart.dayun.list;
    var nowYear = chart.meta.currentYear;
    var html = list.map(function (d) {
      var isNow = nowYear >= d.startYear && nowYear < d.startYear + 10;
      return '<div class="node' + (isNow ? ' now' : '') + '">'
        + '<span class="g">' + d.name + '</span>'
        + '<span class="t">' + d.startAge + '岁</span>'
        + '<span class="t">' + d.startYear + '</span>'
        + '</div>';
    }).join('');
    return '<div class="scroll-x"><div class="chain">' + html + '</div></div>';
  }

  function liunianHTML(chart) {
    var nowYear = chart.meta.currentYear;
    var html = chart.liunian.map(function (l) {
      var isNow = l.year === nowYear;
      return '<div class="node' + (isNow ? ' now' : '') + '">'
        + '<span class="g">' + l.name + '</span>'
        + '<span class="t">' + l.year + '</span>'
        + '<span class="t">' + (l.age > 0 ? l.age + '岁' : '出生前') + '</span>'
        + '</div>';
    }).join('');
    return '<div class="scroll-x"><div class="chain">' + html + '</div></div>';
  }

  function metaHTML(chart) {
    var m = chart.meta;
    var rows = [
      ['公历', m.gregorian.year + '-' + pad(m.gregorian.month) + '-' + pad(m.gregorian.day) + ' ' + pad(m.gregorian.hour) + ':' + pad(m.gregorian.minute)],
      ['日主', chart.dayMaster + '（' + BZ.constants.GAN_WUXING[BZ.constants.GAN.indexOf(chart.dayMaster)] + '）'],
      ['月令', m.monthJie.name + '（' + m.monthJie.zhi + '月）'],
      ['大运', (chart.dayun.forward ? '顺行' : '逆行') + ' · ' + chart.dayun.startAgeText + '起运']
    ];
    if (m.useTrueSolar) {
      rows.push(['真太阳时', '校正 ' + (m.correctionMinutes > 0 ? '+' : '') + m.correctionMinutes + ' 分钟']);
      rows.push(['换算钟面', pad(m.localClock.hour) + ':' + pad(m.localClock.minute)]);
    }
    if (m.lateZi) rows.push(['子时换日', '23 点后按次日算']);
    if (m.timeConfidence === 'unknown') rows.push(['时辰', '不详 · 时柱按午时假定']);
    else if (m.timeConfidence === 'approx') rows.push(['时辰', '大概 · 时柱可能差一格']);
    return '<div class="meta-grid">' + rows.map(function (r) {
      return '<div><span>' + r[0] + '</span><b>' + esc(r[1]) + '</b></div>';
    }).join('') + '</div>';
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function render(chart) {
    // 重绘会重建输入区：先留住用户刚输入但还没保存的内容
    var prevKey = '';
    var prevFocus = '';
    var oldInput = document.getElementById('api-key');
    if (oldInput) prevKey = oldInput.value;
    var oldFocus = document.getElementById('focus');
    if (oldFocus) prevFocus = oldFocus.value;

    var p = chart.pillars;
    var hourBadge = chart.meta.timeConfidence === 'unknown' ? '假定'
      : chart.meta.timeConfidence === 'approx' ? '约' : '';
    var html = '';

    html += '<div class="card">'
      + '<h2>四柱 <span class="sub">' + p.year.name + ' ' + p.month.name + ' ' + p.day.name + ' ' + p.hour.name + '</span></h2>'
      + '<div class="pillars">'
      + pillarHTML('year', p.year) + pillarHTML('month', p.month)
      + pillarHTML('day', p.day) + pillarHTML('hour', p.hour, hourBadge)
      + '</div>'
      + metaHTML(chart)
      + '</div>';

    html += '<div class="card">'
      + '<h2>五行 <span class="sub">含藏干</span></h2>'
      + wuxingHTML(chart)
      + '</div>';

    html += analysisHTML(chart);
    html += shenshaHTML(chart);

    html += '<div class="card">'
      + '<h2>大运 <span class="sub">每步十年 · 周岁</span></h2>'
      + dayunHTML(chart)
      + '</div>';

    html += '<div class="card">'
      + '<h2>流年 <span class="sub">今年起的十年 · 虚岁</span></h2>'
      + liunianHTML(chart)
      + '</div>';

    html += retroHTML();

    var proxy = proxyConf();
    html += '<div class="card" id="ai-card">'
      + '<h2>AI 解读 <span class="sub">' + (proxy ? '本站已开通' : '需要 DeepSeek API Key') + '</span></h2>'
      + '<p class="ai-note">' + (proxy
        ? '排盘在本机完成。点「生成解读」时，命盘信息经本站转发给 DeepSeek，不用填 Key。想用自己的额度直连，也可以在下面填自己的 Key。'
        : '排盘在本机完成。点「生成解读」时，上面的命盘信息会发送给 DeepSeek，由模型写出解读；API Key 只存在这台设备的浏览器里。')
      + '解读属传统术数推演，不构成医疗、投资、法律、婚育等建议。</p>'
      + '<div class="key-row">'
      + '<input id="api-key" type="password" placeholder="' + (proxy ? '（可选）自己的 Key，留空用本站服务' : 'sk-…') + '" autocomplete="off">'
      + '<button id="save-key" class="ghost">保存</button>'
      + '</div>'
      + '<div class="field"><label for="focus">想问的事<small>（可留空）</small></label>'
      + '<input id="focus" type="text" maxlength="60" placeholder="例如：这两年适合换工作吗" autocomplete="off"></div>'
      + '<button id="gen">生 成 解 读</button>'
      + '<div class="status" id="ai-status"></div>'
      + '<div class="reading" id="reading"></div>'
      + '</div>';

    $('result').innerHTML = html;
    $('result').classList.remove('hidden');

    // 回填已保存的 Key；用户刚输入未保存的值优先
    var saved = prevKey || readKey();
    if (saved) $('api-key').value = saved;
    if (prevFocus) $('focus').value = prevFocus;

    $('save-key').addEventListener('click', function () {
      var v = $('api-key').value.trim();
      if (!v) { setStatus('请先填入 Key', true); return; }
      if (writeKey(v)) setStatus('已保存到本机浏览器');
      else setStatus('这台浏览器不让保存（可能开了无痕模式），每次打开都要重填', true);
    });

    // 填完点别处就记住，不用特意去点「保存」
    $('api-key').addEventListener('blur', function () {
      var v = $('api-key').value.trim();
      if (v && v !== readKey()) writeKey(v);
    });

    $('gen').addEventListener('click', generateReading);
    bindRetro();
  }

  /* ---------------- API Key 存取 ---------------- */

  var KEY_STORE = 'bazi.deepseek.key';
  function readKey() {
    try { return localStorage.getItem(KEY_STORE) || ''; } catch (e) { return ''; }
  }
  function writeKey(v) {
    try { localStorage.setItem(KEY_STORE, v); return true; } catch (e) { return false; }   // 隐私模式下写不进去，交给调用方提示
  }

  function setStatus(text, isErr) {
    var el = $('ai-status');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('err', !!isErr);
  }

  /* ---------------- 回测 ---------------- */


  function retroHTML() {
    return '<div class="card" id="retro-card">'
      + '<h2>回测 <span class="sub">用过去的事检验这张盘</span></h2>'
      + '<p class="ai-note">填 2–3 件已经发生的事。程序算出那几年的流年，再由模型判断「按命理该发生什么」，你自己对照像不像。'
      + '命理师收钱后做的第一件事就是校时——如果多数对不上，很可能是出生时辰记错了。</p>'
      + '<div id="events"></div>'
      + '<div class="btn-row">'
      + '<button id="add-event" class="ghost" type="button">＋ 加一件事</button>'
      + '<button id="run-retro" type="button">回 测</button>'
      + '</div>'
      + '<div class="status" id="retro-status"></div>'
      + '<div class="reading" id="retro-reading"></div>'
      + '</div>';
  }

  function eventRowHTML() {
    var opts = BZ.retro.EVENT_TYPES.map(function (t) {
      return '<option>' + t + '</option>';
    }).join('');
    return '<div class="event-row">'
      + '<input class="ev-year" type="number" min="1900" max="2100" placeholder="哪一年">'
      + '<select class="ev-type">' + opts + '</select>'
      + '<button class="ev-del ghost" type="button" aria-label="删除这一行">×</button>'
      + '</div>';
  }

  function setRetroStatus(text, isErr) {
    var el = $('retro-status');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('err', !!isErr);
  }

  function bindRetro() {
    var box = $('events');
    if (!box) return;
    box.innerHTML = eventRowHTML() + eventRowHTML();

    $('add-event').addEventListener('click', function () {
      if (box.children.length >= 6) { setRetroStatus('最多填 6 件', true); return; }
      box.insertAdjacentHTML('beforeend', eventRowHTML());
    });

    box.addEventListener('click', function (e) {
      if (e.target.classList.contains('ev-del') && box.children.length > 1) {
        e.target.parentNode.remove();
      }
    });

    $('run-retro').addEventListener('click', runRetro);
  }

  function collectEvents() {
    var rows = $('events').querySelectorAll('.event-row');
    var out = [];
    Array.prototype.forEach.call(rows, function (row) {
      var y = Number(row.querySelector('.ev-year').value);
      if (!y) return;
      out.push({ year: y, type: row.querySelector('.ev-type').value });
    });
    return out;
  }

  function runRetro() {
    if (!state.chart) return;
    var key = ($('api-key') ? $('api-key').value.trim() : '') || readKey();
    var proxy = proxyConf();
    if (!key && !proxy) { setRetroStatus('回测需要模型判断，请先在下面的「AI 解读」里填好 API Key', true); return; }
    if (key && key !== readKey()) writeKey(key);   // 用过一次就记住，不用再点保存

    var events = collectEvents();
    if (events.length < 2) { setRetroStatus('至少填两件，一件说明不了问题', true); return; }

    var analysis = BZ.retro.analyzeEvents(state.chart, events);
    var lines = analysis.map(function (a) {
      return a.year + ' 年 · ' + a.ganzhi + '（' + a.age + ' 岁）'
        + '｜用户记得：' + (a.type || '未填')
        + '｜流年十神：' + a.shishen
        + '｜五行：' + a.ganWuxing + a.zhiWuxing
        + '｜与用神关系：' + a.role
        + '｜地支作用：' + (a.relations.length ? a.relations.join('；') : '无')
        + '｜粗判：' + a.tone;
    }).join('\n');

    var reading = $('retro-reading');
    var btn = $('run-retro');
    if (state.abort) state.abort.abort();
    state.abort = new AbortController();
    var myId = ++state.reqId;

    reading.textContent = '';
    reading.classList.add('cursor-blink');
    btn.disabled = true;
    setRetroStatus('正在回测…', false);

    BZ.deepseek.streamChat({
      apiKey: key,
      proxy: key ? null : proxy,
      messages: BZ.deepseek.buildRetroMessages(BZ.bazi.toPromptText(state.chart), lines),
      signal: state.abort.signal,
      onDelta: function (piece) {
        if (myId !== state.reqId) return;
        reading.textContent += piece;
      }
    }).then(function (full) {
      if (myId !== state.reqId) return;
      reading.classList.remove('cursor-blink');
      btn.disabled = false;
      setRetroStatus('回测完毕 · ' + full.length + ' 字', false);
    }).catch(function (e) {
      if (myId !== state.reqId) return;
      reading.classList.remove('cursor-blink');
      btn.disabled = false;
      setRetroStatus(BZ.deepseek.explainError(e), true);
    });
  }

  function generateReading() {
    if (!state.chart) return;
    var key = $('api-key').value.trim();
    var proxy = proxyConf();
    if (!key && !proxy) { setStatus('请先填入 DeepSeek API Key（可在 platform.deepseek.com 申请）', true); return; }
    if (key && key !== readKey()) writeKey(key);   // 用过一次就记住，不用再点保存

    var reading = $('reading');
    var btn = $('gen');
    var focus = $('focus').value.trim();

    // 已有一次请求时，先停掉；用自增编号避免旧请求的回调覆盖新请求的界面
    if (state.abort) state.abort.abort();
    state.abort = new AbortController();
    var myId = ++state.reqId;

    reading.textContent = '';
    reading.classList.add('cursor-blink');
    btn.disabled = true;
    setStatus('正在生成…');

    var messages = BZ.deepseek.buildMessages(BZ.bazi.toPromptText(state.chart), focus);

    BZ.deepseek.streamChat({
      apiKey: key,
      proxy: key ? null : proxy,
      messages: messages,
      signal: state.abort.signal,
    onDelta: function (piece) {
        if (myId !== state.reqId) return;
        reading.textContent += piece;
      }
    }).then(function (full) {
      if (myId !== state.reqId) return;
      reading.classList.remove('cursor-blink');
      btn.disabled = false;
      if (!full || !full.trim()) {
        setStatus('模型返回了空内容，请重试', true);
      } else {
        setStatus('生成完毕 · 共 ' + full.length + ' 字');
      }
    }).catch(function (e) {
      if (myId !== state.reqId) return;
      reading.classList.remove('cursor-blink');
      btn.disabled = false;
      setStatus(BZ.deepseek.explainError(e), true);
    });
  }

})();
