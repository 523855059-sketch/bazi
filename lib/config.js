/*
 * 站点配置 —— 解读服务的两种模式
 *
 * 直连模式（默认）：proxyUrl 留空。每个人在页面上填自己的 DeepSeek Key，
 *                   浏览器直接调 api.deepseek.com，Key 只存在他自己设备上。
 *
 * 代理模式：填上部署好的 Worker 地址。访客不填 Key 也能点「生成解读」，
 *           请求先发到 Worker，由 Worker 带上站点所有者的 Key 去调 DeepSeek。
 *           网页源码里只有 Worker 地址，看不到 Key。
 *
 * 两种模式可以并存：访客自己填了 Key 就走直连（不占站点的额度）。
 */
(function () {
  'use strict';
  window.BZ = window.BZ || {};
  window.BZ.config = {
    // 例：'https://bazi-proxy.example.workers.dev'
    proxyUrl: '',
    // 与 Worker 里 ACCESS_CODE 一致；Worker 没设口令时留空
    proxyCode: ''
  };
})();
