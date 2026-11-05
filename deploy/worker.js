/*
 * Cloudflare Worker —— DeepSeek 转发层
 *
 * 作用：把浏览器的解读请求转给 api.deepseek.com，Key 只存在 Worker 的环境变量里，
 *       不会出现在网页源码中。
 *
 * 部署时需要配置的环境变量（Worker → Settings → Variables）：
 *   DEEPSEEK_KEY  必填，你的 DeepSeek API Key（勾选 Encrypt）
 *   ACCESS_CODE   可选，访问口令；设了之后前端必须在 lib/config.js 里填同一个值
 *   ALLOW_ORIGIN  可选，只允许这个来源调用；填你的站点地址，例如
 *                 https://523855059-sketch.github.io   （注意不带 /bazi 路径）
 *                 留空表示不限制来源
 *
 * 说明：这是降低滥用门槛，不是绝对防护。真正兜底的是 DeepSeek 账户的余额上限。
 */

export default {
  async fetch(request, env) {
    const allowOrigin = env.ALLOW_ORIGIN || '*';
    const cors = {
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Access-Code',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    };

    // 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== 'POST') {
      return reply(405, { error: '只接受 POST' }, cors);
    }

    // 来源检查：挡住别的网站直接盗用这个接口
    const origin = request.headers.get('Origin') || '';
    if (env.ALLOW_ORIGIN && env.ALLOW_ORIGIN !== '*' && origin !== env.ALLOW_ORIGIN) {
      return reply(403, { error: '来源不被允许' }, cors);
    }

    // 口令检查
    if (env.ACCESS_CODE) {
      const code = request.headers.get('X-Access-Code') || '';
      if (code !== env.ACCESS_CODE) {
        return reply(403, { error: '访问口令不正确' }, cors);
      }
    }

    if (!env.DEEPSEEK_KEY) {
      return reply(500, { error: 'Worker 未配置 DEEPSEEK_KEY' }, cors);
    }

    const body = await request.text();

    let upstream;
    try {
      upstream = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + env.DEEPSEEK_KEY,
          'Content-Type': 'application/json',
        },
        body,
      });
    } catch (e) {
      return reply(502, { error: '上游连接失败：' + (e && e.message ? e.message : e) }, cors);
    }

    // 正常时是 SSE 流，出错时是 JSON —— 分别标对 Content-Type
    const contentType = upstream.ok
      ? 'text/event-stream; charset=utf-8'
      : 'application/json; charset=utf-8';

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        ...cors,
        'Content-Type': contentType,
        'Cache-Control': 'no-cache',
      },
    });
  },
};

function reply(status, obj, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
  });
}
