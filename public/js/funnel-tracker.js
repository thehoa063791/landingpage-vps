(function () {
  'use strict';
  if (window.__FUNNEL_TRACKER__) return;
  window.__FUNNEL_TRACKER__ = true;

  const script = document.currentScript;
  const funnel = script?.dataset.funnel || location.pathname.match(/\/p\/([^/]+)/)?.[1] || 'default';
  const step = script?.dataset.step || (/thank[-_ ]?you|register[-_ ]?su+c?ess/i.test(location.pathname) ? 'thank-you' : 'home');
  const pageId = step === 'thank-you' ? `${funnel}-thank-you` : funnel;
  const params = new URLSearchParams(location.search);
  const attributionKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid', 'ttclid', 'msclkid', 'twclid'];
  const prefix = `funnel:${funnel}:`;
  const get = key => { try { return sessionStorage.getItem(prefix + key) || ''; } catch { return ''; } };
  const set = (key, value) => { try { if (value) sessionStorage.setItem(prefix + key, value); } catch {} };
  const uuid = () => crypto.randomUUID?.() || `evt_${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  const navigationId = window.__FUNNEL_NAVIGATION_ID__ || uuid();
  window.__FUNNEL_NAVIGATION_ID__ = navigationId;
  let sessionId = get('session_id');
  if (!sessionId) { sessionId = uuid(); set('session_id', sessionId); }
  attributionKeys.forEach(key => set(key, params.get(key) || get(key)));
  set('referrer', get('referrer') || document.referrer);

  function context() {
    return Object.fromEntries(attributionKeys.map(key => [key, params.get(key) || get(key)]).concat([
      ['referrer', get('referrer') || document.referrer], ['session_id', sessionId], ['navigation_id', navigationId], ['page_id', pageId], ['funnel_id', funnel], ['funnel_step', step], ['url', location.href],
    ]));
  }

  function track(event, details) {
    const body = JSON.stringify({ event, session_id: sessionId, data: { ...context(), ...(details || {}), event_id: uuid() } });
    let sent = false;
    try { sent = !!navigator.sendBeacon?.('/api/track', new Blob([body], { type: 'application/json' })); } catch {}
    if (!sent) fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
  }

  // Add complete attribution to every registration, including funnels added in
  // the future that do not yet use the shared core.js form engine.
  const originalFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (/\/api\/register(?:\?|$)/.test(url) && String(init?.method || 'GET').toUpperCase() === 'POST') {
      try {
        const body = JSON.parse(init.body || '{}');
        init = { ...init, body: JSON.stringify({ ...context(), ...body, page_id: body.page_id || funnel, session_id: body.session_id || sessionId, event_source_url: body.event_source_url || location.href }) };
      } catch {}
    }
    return originalFetch(input, init);
  };

  function boot() {
    const hasDedicatedTracker = !!document.querySelector('script[src*="/js/core.js"],script[src$="/tracking.js"]');
    if (!hasDedicatedTracker && !window.__FUNNEL_PAGEVIEW_SENT__) {
      window.__FUNNEL_PAGEVIEW_SENT__ = true;
      track('pageview', { title: document.title });
      let formOpened = false;
      document.addEventListener('focusin', event => {
        if (!formOpened && event.target.closest?.('form')) { formOpened = true; track('form_open'); }
      });
      document.addEventListener('click', event => {
        const target = event.target.closest?.('a,button');
        if (!target) return;
        const position = target.closest('section')?.id || (target.closest('header') ? 'header' : 'page');
        const label = (target.textContent || '').trim().slice(0, 80);
        if (target.matches('[data-sale],[data-checkout]') || /mua|thanh toán|buy|checkout/i.test(label)) track('sale_click', { position, label });
        if (target.matches('[data-cta],[href^="#"],button[type="submit"]') || /đăng ký|tư vấn|liên hệ|tham gia|get started/i.test(label)) track('cta_click', { position, label });
      });
      const depths = new Set();
      window.addEventListener('scroll', () => {
        const range = document.documentElement.scrollHeight - innerHeight;
        if (range <= 0) return;
        const depth = Math.round(scrollY / range * 100);
        [25, 50, 75, 90].forEach(value => {
          if (depth >= value && !depths.has(value)) { depths.add(value); track('scroll_depth', { depth: value }); }
        });
      }, { passive: true });
    }
    // Dedicated page trackers already cover their own CTA/scroll events, but
    // these two signals are shared consistently by every funnel.
    [30, 60, 120].forEach(seconds => setTimeout(() => {
      if (document.visibilityState === 'visible') track('time_on_page', { seconds });
    }, seconds * 1000));
    let exitSent = false;
    document.addEventListener('mouseout', event => {
      if (!exitSent && event.clientY <= 0 && !event.relatedTarget) { exitSent = true; track('exit_intent'); }
    });
    window.FunnelTracking = { funnel, step, pageId, sessionId, context, track };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
