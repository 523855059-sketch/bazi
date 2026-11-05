/*
 * DeepSeek 解读调用（浏览器直连，流式）。
 *
 * 2026-11 实测：api.deepseek.com 的预检请求会回显 Origin，
 * 允许浏览器带 Authorization 头发起 POST，因此不需要中间代理。
 * API Key 只保存在本机浏览器的 localStorage 里。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.BZ = root.BZ || {}; root.BZ.deepseek = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ENDPOINT = 'https://api.deepseek.com/chat/completions';
  var MODEL = 'deepseek-chat';

  function ApiError(status, detail) {
    var e = new Error(detail || ('HTTP ' + status));
    e.name = 'ApiError';
    e.status = status;
    return e;
  }

  // 流式对话：每收到一段文本调用 onDelta(text)，结束返回全文。
  // opts.proxy 传入 {url, code} 时代理转发（Key 在服务端），否则用 opts.apiKey 直连。
  function streamChat(opts) {
    var apiKey = opts.apiKey;
    var proxy = opts.proxy;
    var messages = opts.messages;
    var onDelta = opts.onDelta || function () {};
    var signal = opts.signal;
    var model = opts.model || MODEL;
    var temperature = typeof opts.temperature === 'number' ? opts.temperature : 1.0;
    var maxTokens = opts.maxTokens || 4000;

    // 两条路都走不了时直接报错，别把空 Key 发出去换一个不知所云的 401
    if (!apiKey && !(proxy && proxy.url)) {
      return Promise.reject(ApiError(401, '没有可用的 Key，也没有配置解读服务'));
    }

    // 有代理配置且访客没填 Key 才走转发；只要填了 Key 就走直连（花他自己的额度）
    var url = ENDPOINT;
    var headers = { 'Content-Type': 'application/json' };
    if (proxy && proxy.url && !apiKey) {
      url = String(proxy.url).replace(/\/+$/, '') + '/chat';
      if (proxy.code) headers['X-Access-Code'] = proxy.code;
    } else {
      headers['Authorization'] = 'Bearer ' + apiKey;
    }

    return fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        model: model,
        messages: messages,
        stream: true,
        temperature: temperature,
        max_tokens: maxTokens
      }),
      signal: signal
    }).then(function (resp) {
      if (!resp.ok) {
        return resp.text().then(function (body) {
          var detail = '';
          try {
            var j = JSON.parse(body);
            detail = (j.error && j.error.message) || body.slice(0, 200);
          } catch (e) {
            detail = body.slice(0, 200);
          }
          throw ApiError(resp.status, detail);
        });
      }

      if (!resp.body || !resp.body.getReader) {
        // 极老的浏览器没有流式读取，退回一次性读取
        return resp.text().then(function (body) {
          var text = parseWhole(body);
          onDelta(text);
          return text;
        });
      }

      var reader = resp.body.getReader();
      var decoder = new TextDecoder('utf-8');
      var buffer = '';
      var full = '';
      var truncated = false;

      function pump() {
        return reader.read().then(function (r) {
          if (r.done) {
            buffer += decoder.decode(); // 收尾 flush，别丢掉最后半个多字节字符
            // 被 max_tokens 截断时不能当成功——否则界面会把半截解读报成「生成完毕」
            if (truncated) {
              throw ApiError(500, '输出达到长度上限被截断，请重试或把问题问短一些');
            }
            return full;
          }
          buffer += decoder.decode(r.value, { stream: true });
          var lines = buffer.split('\n');
          buffer = lines.pop();
          for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line || line.charAt(0) === ':') continue;
            if (line.indexOf('data:') !== 0) continue;
            var data = line.slice(5).trim();
            if (data === '[DONE]') {
              reader.cancel().catch(function () {});
              return full;
            }
            var j;
            try {
              j = JSON.parse(data);
            } catch (e) {
              continue; // 分块切断的半行 JSON，留给下一轮
            }
            // 流里下发的错误必须向上抛，不能当作正常结束——
            // 否则界面会把一段被截断的解读报成「生成完毕」。
            if (j.error) {
              throw ApiError(j.error.code || 500, j.error.message || '流式返回中断');
            }
            var choice = j.choices && j.choices[0];
            var piece = choice && choice.delta && choice.delta.content;
            if (piece) { full += piece; onDelta(piece); }
            if (choice && choice.finish_reason === 'length') truncated = true;
          }
          return pump();
        });
      }
      return pump();
    });
  }

  function parseWhole(body) {
    try {
      var j = JSON.parse(body);
      return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
    } catch (e) {
      return '';
    }
  }

  // 把底层错误翻译成用户能读懂的一句话
  function explainError(e) {
    if (!e) return '未知错误。';
    if (e.name === 'ApiError') {
      switch (e.status) {
        case 400: return '请求被拒绝（400）：' + (e.message || '参数有误');
        case 401: return 'API Key 无效或已失效，请检查后重新填写。';
        case 402: return '账户余额不足，请先充值。';
        case 403: return '请求被拒绝（403）：可能是访问口令不对，或站点不允许当前来源调用。';
        case 422: return '请求参数有误（422）：' + (e.message || '');
        case 429: return '请求太频繁，等半分钟再试。';
        case 500: case 502: case 503: return '服务端暂时不可用（' + e.status + '），稍后再试。';
        default: return '请求失败（HTTP ' + e.status + '）：' + (e.message || '');
      }
    }
    if (e.name === 'AbortError') return '已取消。';
    if (e instanceof TypeError) return '网络不通：检查网络，或浏览器拦截了跨域请求。';
    return '出错了：' + (e.message || String(e));
  }

  /* ---------------- 提示词 ---------------- */

  var SYSTEM_PROMPT = [
    '你是一位替人看八字的老师傅，坐在人对面说话。',
    '你的读者完全不懂命理，他只想听懂三件事：我是什么样的人、适合干什么、接下来这几年怎么样。',
    '',
    '【说话方式——这条最重要】',
    '1. 先说人话，再说术语。每句话的主干必须是日常汉语，术语只作为括号里的注脚。',
    '   反例：「日主己土生于寅月，失令，综合中和偏弱」',
    '   正例：「你是土命，生在早春，那时候木最旺，木克土，所以底子不算厚（命理上叫「日主偏弱」）」',
    '2. 一段里最多出现两个术语，超了就拆段，或者干脆换成大白话。',
    '3. 用生活里的事打比方，不要用命理内部的词去解释命理。',
    '4. 句子要短，多用句号，少用分号。不写「综上所述」「由此可见」这类词。',
    '5. 不要写成报告。想象你在跟一个朋友当面讲，他随时会打断你问「那到底什么意思」。',
    '',
    '【术语怎么翻译——按这个说，不要自创】',
    '- 日主 = 你自己',
    '- 旺衰 = 你底子厚不厚、扛不扛得住事',
    '- 格局 = 你这个人最突出的那条路数',
    '- 用神 = 对你最有用的那样东西，该往哪个方向补',
    '- 忌 = 最容易拖累你的',
    '- 印星 = 托着你的人和事：长辈、老师、学历、靠山、安全感',
    '- 比劫 = 跟你平起平坐的人：同辈、同行、朋友，能搭把手也容易争',
    '- 食伤 = 你往外使的劲：表达、手艺、创造、折腾',
    '- 财星 = 你要去拿的东西：钱、资源、看得见的结果',
    '- 官杀 = 管着你压着你的：规矩、责任、上司、压力',
    '- 大运 = 十年一段的大环境',
    '- 流年 = 单独某一年',
    '- 神煞 = 命理里的记号，只在确实相关时带一句，不展开',
    '',
    '【结构】按这个写，每节开头先给一句大白话结论：',
    '',
    '## 一、你这个人的底色',
    '一句话说清你是什么样的人，然后讲为什么——把旺衰、格局翻成人话。',
    '',
    '## 二、性格：什么时候你最顺，什么时候最别扭',
    '说具体场景，不要贴标签。',
    '',
    '## 三、工作和钱',
    '适合往哪个方向走、什么节奏、要注意什么。给方向，不给具体投资建议。',
    '',
    '## 四、感情和家人',
    '你在关系里的模式，容易在什么地方卡住。',
    '',
    '## 五、身体',
    '从五行偏枯说该注意的作息。只给生活建议，不做诊断。',
    '',
    '## 六、这十年',
    '当前大运是什么基调，对你意味着什么。',
    '',
    '## 七、接下来五年，一年一年说',
    '每年三到四句，说清这一年大概是什么气候，适合做什么、避开什么。',
    '',
    '## 八、三句话',
    '能把上面全部概括掉的三句话。',
    '',
    '【底线】',
    '· 不宿命：说「容易」「倾向于」「更适合」，不说「必定」「注定」。',
    '· 不做医疗、投资、法律、婚育的决定建议。',
    '· 判断要有依据，但依据放在括号里，别让它挡在句子前面。',
    '· 不讨好。这个盘有明显的问题（偏枯、冲刑多、用神无力）就直接说，不要用「不过你也有优点」把它中和掉。',
    '· 不因为读者可能不爱听就软化。该说的说完，再给应对方向。',
    '· 绝不推荐任何转运物品——水晶、饰品、颜色、摆件、方位。那是骗钱的套路。',
    '· 全文 1600–2400 字。'
  ].join('\n');

  function buildMessages(chartText, focus) {
    var user = [
      '下面是一张排好的四柱命盘，包含程序算出的旺衰、格局、用神、神煞与地支关系。',
      '这些是既定数据，你只需要把它们翻译成人话讲出来，不要另行排盘或改动结论。',
      '',
      chartText,
      '',
      '请按系统提示里的八节结构写。记住：读者不懂命理，听不懂就等于没写。'
    ];
    if (focus) {
      user.push('');
      user.push('提问者特别想知道：' + focus + '（把它自然融进对应章节，不要单独开一节）');
    }
    return [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: user.join('\n') }
    ];
  }

  /* ---------------- 回测提示词 ---------------- */

  var RETRO_PROMPT = [
    '你是一位命理师，正在做一件具体的事：回测。',
    '用户告诉你过去几年发生过什么，你要判断这张盘对不对得上。',
    '',
    '【规则】',
    '1. 逐年说。每一年说三件事：那年是什么干支、它和这个命盘怎么作用、按这个作用那一年「该发生什么类型的事」。',
    '2. 说完再对照：用户填的那件事，和你的判断是吻合、部分吻合，还是不吻合。不吻合就直说不吻合，不要牵强附会。',
    '3. 全部说完给一个总结：这几件里对上几件。如果多数对不上，明确说「可能是出生时辰记错了」，',
    '   并建议把时间往前或往后挪一个时辰重新排一次再试。',
    '4. 绝不为了让结果好看而曲解。回测的价值恰恰在于它能证伪——如果一个方法永远说「对上了」，它就一文不值。',
    '5. 用口语，短句。术语放括号里。不说「必定」「注定」，也不推荐任何转运物品。',
    '',
    '【格式】',
    '## 逐年对照',
    '**2015 年 · 乙未**',
    '那年是什么气候（一段话），按命理该发生什么。',
    '你填的是「换工作」——吻合 / 部分吻合 / 不吻合，为什么。',
    '（每年一个这样的小节）',
    '',
    '## 总结',
    '对上几件、对不上几件，以及这意味着什么。'
  ].join('\n');

  function buildRetroMessages(chartText, retroLines) {
    return [
      { role: 'system', content: RETRO_PROMPT },
      {
        role: 'user',
        content: [
          '这是命盘：',
          '',
          chartText,
          '',
          '用户记得的事，以及程序算出的那几年情况：',
          '',
          retroLines,
          '',
          '请按格式逐年对照，最后给总结。'
        ].join('\n')
      }
    ];
  }

  return {
    ENDPOINT: ENDPOINT,
    MODEL: MODEL,
    streamChat: streamChat,
    explainError: explainError,
    buildMessages: buildMessages,
    buildRetroMessages: buildRetroMessages,
    SYSTEM_PROMPT: SYSTEM_PROMPT,
    RETRO_PROMPT: RETRO_PROMPT
  };
});
