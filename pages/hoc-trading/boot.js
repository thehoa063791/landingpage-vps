'use strict';
(() => {
  // Resolve relative to this script so exported HTML also works in IDE previews.
  const assetBase = new URL('./', document.currentScript.src).href;
  const preview = location.protocol === 'file:' || /\/pages\/hoc-trading\//.test(location.pathname);
  const load = file => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL(file, assetBase).href;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Không tải được giao diện. Vui lòng tải lại trang.'));
    document.head.appendChild(script);
  });
  async function boot() {
    const status = document.createElement('p');
    status.textContent = 'Đang tải trang…';
    status.setAttribute('role', 'status');
    status.style.cssText = 'padding:24px;text-align:center;font:16px sans-serif';
    document.body.prepend(status);
    try {
      if (preview) {
        const template = document.querySelector('x-dc');
        template.innerHTML = template.innerHTML.replaceAll('/p/hoc-trading/', assetBase);
        const logic = document.querySelector('script[data-dc-script]');
        logic.textContent = logic.textContent.replaceAll('/p/hoc-trading/', assetBase);
      }
      // Reuse the exact React versions shipped with the original runtime, locally.
      await load('vendor/react.production.min.js');
      await load('vendor/react-dom.production.min.js');
      await load('registration.js');
      if (!preview) {
        if (!window.HocTradingTracking) await load('tracking.js');
        // Analytics loading must not prevent the page from rendering.
        if (!window.__META_BROWSER_PIXEL) load('/js/meta-pixel.js').catch(() => {});
      } else {
        window.HOC_TRADING_PREVIEW = true;
        // Do not fetch the original HTML over file:// or undo rewritten assets.
        window.__resources = {};
      }
      await load('support.js');
      status.remove();
    } catch (error) {
      status.textContent = error.message;
      const retry = document.createElement('button');
      retry.textContent = 'Tải lại';
      retry.onclick = () => location.reload();
      status.append(' ', retry);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
