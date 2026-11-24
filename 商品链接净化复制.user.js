// ==UserScript==
// @name         商品链接净化复制助手（淘宝 / 天猫 / 京东）
// @namespace    local.product-link-cleaner
// @version      1.0.0
// @description  在商品详情页显示悬浮按钮，去除多余参数后复制链接；淘宝、天猫保留商品 ID 和规格 ID。
// @match        *://item.taobao.com/item.htm*
// @match        *://detail.tmall.com/item.htm*
// @match        *://item.jd.com/*
// @grant        GM_setClipboard
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  /** 仅保留指定平台的商品定位参数，不发起任何网络请求。 */
  function cleanProductUrl(input) {
    let url;
    try {
      url = new URL(input);
    } catch {
      return null;
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.port || url.username || url.password) {
      return null;
    }

    const isProductId = (value) => /^[1-9]\d*$/.test(value || '');
    if (['item.taobao.com', 'detail.tmall.com'].includes(url.hostname)) {
      if (url.pathname !== '/item.htm') return null;
      const id = url.searchParams.get('id');
      if (!isProductId(id)) return null;

      // ID 保留为字符串，避免长数字经过数值转换后失去精度。
      const result = new URL(`https://${url.hostname}/item.htm`);
      result.searchParams.set('id', id);
      const skuId = url.searchParams.get('skuId');
      if (isProductId(skuId)) result.searchParams.set('skuId', skuId);
      return result.href;
    }

    if (url.hostname === 'item.jd.com' && /^\/[1-9]\d*\.html$/.test(url.pathname)) {
      return `https://item.jd.com${url.pathname}`;
    }
    return null;
  }

  // 允许本地验证直接调用净化函数，浏览器安装时无需任何依赖。
  if (typeof module === 'object' && module.exports) {
    module.exports = { cleanProductUrl };
  }
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const hostId = 'product-link-cleaner-widget';
  if (document.getElementById(hostId)) return;

  const host = document.createElement('div');
  host.id = hostId;
  host.style.cssText = 'all:initial!important;position:fixed!important;right:18px!important;bottom:96px!important;z-index:2147483647!important;display:none!important;';

  // 独立样式区域，避免购物网站的按钮、输入框样式影响悬浮工具。
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      :host { color-scheme: light; font-family: "Microsoft YaHei", system-ui, sans-serif; }
      * { box-sizing: border-box; }
      .widget { display: flex; flex-direction: column; align-items: flex-end; gap: 10px; }
      button {
        display: inline-flex; align-items: center; justify-content: center; gap: 8px;
        min-height: 46px; padding: 0 18px; border: 1px solid rgba(255,255,255,.22);
        border-radius: 24px; color: #fff; background: #1765d8;
        box-shadow: 0 4px 18px rgba(23,101,216,.24); cursor: pointer;
        font: 600 14px/1.5 "Microsoft YaHei", system-ui, sans-serif;
        white-space: nowrap; transition: background .15s, box-shadow .15s;
      }
      button:hover { background: #1057c2; box-shadow: 0 5px 20px rgba(23,101,216,.32); }
      button:focus-visible, input:focus-visible { outline: 3px solid #f5a623; outline-offset: 3px; }
      button:disabled { cursor: progress; opacity: .8; }
      button[data-state="success"] { background: #16784a; }
      button[data-state="error"] { background: #a83b20; }
      svg { width: 18px; height: 18px; flex-shrink: 0; }
      .notice {
        width: min(340px, calc(100vw - 36px)); padding: 14px; border: 1px solid #dce3ee;
        border-radius: 14px; background: #fff; color: #203048;
        box-shadow: 0 5px 24px rgba(25,42,70,.16); font-size: 13px; line-height: 1.6;
      }
      .notice[hidden] { display: none; }
      .message { margin: 0 0 8px; }
      input {
        display: block; width: 100%; min-height: 36px; padding: 7px 9px;
        border: 1px solid #dce3ee; border-radius: 7px; color: #203048; background: #f6f8fb;
        font: 12px/1.6 Consolas, monospace;
      }
      @media (prefers-reduced-motion: reduce) { button { transition: none; } }
    </style>
    <div class="widget">
      <div class="notice" hidden>
        <p class="message" role="status" aria-live="polite"></p>
        <input type="text" readonly aria-label="净化后的商品链接" title="点击选中完整链接">
      </div>
      <button type="button" data-state="idle" aria-label="转链并复制商品链接">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <rect x="8" y="8" width="12" height="13" rx="2"></rect>
          <path d="M15 5V4a1 1 0 0 0-1-1H5a2 2 0 0 0-2 2v9a1 1 0 0 0 1 1h1"></path>
        </svg>
        <span>转链并复制</span>
      </button>
    </div>
  `;
  document.documentElement.appendChild(host);

  const button = shadow.querySelector('button');
  const label = button.querySelector('span');
  const notice = shadow.querySelector('.notice');
  const message = shadow.querySelector('.message');
  const output = shadow.querySelector('input');
  let lastHref = '';
  let resetTimer;

  /** 优先使用油猴授权的剪贴板能力，并等待完成后再显示成功。 */
  async function copyText(text) {
    if (typeof GM_setClipboard === 'function') {
      try {
        await new Promise((resolve, reject) => {
          const timer = window.setTimeout(() => reject(new Error('剪贴板操作超时')), 3000);
          const finish = () => { window.clearTimeout(timer); resolve(); };
          const fail = (error) => { window.clearTimeout(timer); reject(error); };
          try {
            const result = GM_setClipboard(text, 'text', finish);
            // 同时兼容返回 Promise 的脚本管理器实现。
            if (result && typeof result.then === 'function') result.then(finish, fail);
          } catch (error) {
            fail(error);
          }
        });
        return;
      } catch {
        // 扩展权限异常时继续尝试浏览器剪贴板。
      }
    }
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return;
    }
    throw new Error('当前浏览器无法自动复制');
  }

  function resetFeedback() {
    window.clearTimeout(resetTimer);
    notice.hidden = true;
    message.textContent = '';
    output.value = '';
    button.dataset.state = 'idle';
    label.textContent = '转链并复制';
  }

  function refreshProductUrl() {
    if (lastHref === window.location.href) return;
    lastHref = window.location.href;
    const cleanUrl = cleanProductUrl(lastHref);
    host.style.setProperty('display', cleanUrl ? 'block' : 'none', 'important');
    button.title = cleanUrl ? `复制：${cleanUrl}` : '当前页面不是支持的商品详情页';
    if (!button.disabled) resetFeedback();
  }

  output.addEventListener('click', () => output.select());
  output.addEventListener('focus', () => output.select());
  button.addEventListener('click', async () => {
    // 每次点击都读取实时地址，支持不刷新页面就切换 URL 中的规格。
    refreshProductUrl();
    const cleanUrl = cleanProductUrl(window.location.href);
    if (!cleanUrl) return;
    resetFeedback();
    button.disabled = true;
    label.textContent = '正在复制…';
    output.value = cleanUrl;
    try {
      await copyText(cleanUrl);
      button.dataset.state = 'success';
      label.textContent = '已复制 ✓';
      message.textContent = '商品链接已复制';
      resetTimer = window.setTimeout(resetFeedback, 4000);
    } catch {
      button.dataset.state = 'error';
      label.textContent = '重新复制';
      message.textContent = '自动复制失败，请点击下方链接选中，再按 Ctrl+C（Mac：⌘C）复制。';
    } finally {
      notice.hidden = false;
      button.disabled = false;
    }
  });

  refreshProductUrl();
  window.addEventListener('popstate', refreshProductUrl);
  window.addEventListener('hashchange', refreshProductUrl);
  // 只比较地址；兼容网站通过 pushState/replaceState 切换地址的情况。
  window.setInterval(refreshProductUrl, 1000);
})();
