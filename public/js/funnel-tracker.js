(function () {
  'use strict';
  if (window.__FUNNEL_TRACKER__) return;
  window.__FUNNEL_TRACKER__ = true;

  const script = document.currentScript;
  const spa = script?.dataset.spa === 'true';
  const api = script?.dataset.api || '/api/track';
  const configUrl = script?.dataset.config || '/api/meta-config';
  const funnel = script?.dataset.funnel || location.pathname.match(/\/p\/([^/]+)/)?.[1] || 'default';
  let step = script?.dataset.step || (/thank[-_ ]?you|register[-_ ]?su+c?ess/i.test(location.pathname) ? 'thank-you' : 'home');
  const pageId = step === 'thank-you' ? `${funnel}-thank-you` : funnel;
  const attributionKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid', 'ttclid', 'msclkid', 'twclid'];
  const prefix = `funnel:${funnel}:`;
  const memory = {};
  const get = key => { try { return sessionStorage.getItem(prefix + key) || memory[key] || ''; } catch { return memory[key] || ''; } };
  const set = (key, value) => { if (!value) return; memory[key] = value; try { sessionStorage.setItem(prefix + key, value); } catch {} };
  const sharedGet = key => { try { return sessionStorage.getItem(key) || ''; } catch { return ''; } };
  const sharedSet = (key, value) => { try { if (value) sessionStorage.setItem(key, value); } catch {} };
  const cookie = name => { try { return decodeURIComponent(document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'))?.[1] || ''); } catch { return ''; } };
  const setCookie = (name, value) => { document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${90 * 24 * 60 * 60}; path=/; SameSite=Lax`; };
  const uuid = () => crypto.randomUUID?.() || `evt_${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  let navigationId = window.__FUNNEL_NAVIGATION_ID__ || uuid();
  window.__FUNNEL_NAVIGATION_ID__ = navigationId;
  let sessionId = sharedGet('_sid_' + pageId) || get('session_id');
  if (!sessionId) { sessionId = uuid(); set('session_id', sessionId); }
  sharedSet('_sid_' + pageId, sessionId);
  set('session_id', sessionId);
  window._sessionId = sessionId;
  function capture() {
    const params = new URLSearchParams(location.search);
    attributionKeys.forEach(key => {
      const value = params.get(key) || sharedGet(key) || get(key);
      set(key, value); sharedSet(key, value);
    });
    const fbclid = get('fbclid');
    if (fbclid && cookie('_fbc').split('.').slice(3).join('.') !== fbclid) setCookie('_fbc', `fb.1.${Date.now()}.${fbclid}`);
    if (!cookie('_fbp')) setCookie('_fbp', `fb.1.${Date.now()}.${Math.floor(Math.random() * 2147483647)}`);
    for (const [key, name] of [['fbc', '_fbc'], ['fbp', '_fbp'], ['ga', '_ga']]) sharedSet(key, cookie(name));
  }
  capture();
  set('referrer', get('referrer') || sharedGet('referrer') || document.referrer);
  sharedSet('referrer', get('referrer'));

  function context() {
    capture();
    return Object.fromEntries(attributionKeys.map(key => [key, get(key)]).concat([
      ['fbc', cookie('_fbc')], ['fbp', cookie('_fbp')], ['ga', cookie('_ga')],
      ['referrer', get('referrer') || document.referrer], ['session_id', sessionId], ['navigation_id', navigationId], ['page_id', pageId], ['funnel_id', funnel], ['funnel_step', step], ['url', location.href],
    ]));
  }

  function track(event, details) {
    const eventId = event === 'pageview' ? (window.__META_PAGEVIEW_EVENT_ID || uuid()) : uuid();
    if (event === 'pageview') window.__META_PAGEVIEW_EVENT_ID = eventId;
    const body = JSON.stringify({ event, session_id: sessionId, data: { ...context(), ...(details || {}), event_id: eventId } });
    const token = window.FunnelTrackingToken?.();
    let sent = false;
    try { if (!token) sent = !!navigator.sendBeacon?.(api, new Blob([body], { type: 'application/json' })); } catch {}
    if (!sent) fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body, keepalive: true }).catch(() => {});
    if (spa) browserEvent(event, details || {}, eventId);
    if (!spa && event === 'form_open') {
      const item = { params: { content_name: pageId, content_category: 'landing_page' }, eventID: eventId };
      if (window.__META_BROWSER_PIXEL?.initialized && typeof window.fbq === 'function') {
        window.fbq('track', 'ViewContent', item.params, { eventID: item.eventID });
      } else {
        window.__META_PENDING_VIEWCONTENT = item;
      }
    }
  }

  function browserEvent(event, details, id) {
    const names = { pageview: 'PageView', form_open: 'ViewContent', form_submit: 'SubmitApplication', cta_click: 'Contact', conversion: 'CompleteRegistration', view_content: 'ViewContent' };
    const params = { content_name: pageId, content_category: step === 'learn' ? 'lesson' : 'landing_page', ...details };
    // The shared Pixel loader queues events until the project configuration arrives.
    // Canonical time/scroll Pixel milestones are managed by meta-pixel.js only.
    // Lesson views remain internal; ViewContent measures form interaction.
    if (!['time_on_page', 'scroll_depth', 'view_content'].includes(event)) window.__META_BROWSER_PIXEL?.track?.(names[event] || event, params, id, !names[event]);
    window.dataLayer = window.dataLayer || [];
    const utm = Object.fromEntries(attributionKeys.map(key => [key, get(key)]));
    window.dataLayer.push({ event: event === 'pageview' ? 'virtual_page_view' : event === 'conversion' ? 'generate_lead' : event, page_id: pageId, funnel_id: funnel, funnel_step: step, page_location: location.href, event_id: id, ...utm, ...details });
    if (googleConfig?.ga_measurement_id && !googleConfig.gtm_id && window.gtag) {
      window.gtag('event', event === 'pageview' ? 'page_view' : event === 'conversion' ? 'sign_up' : event, { page_location: location.href, page_title: document.title, ...details });
    }
  }
  let lastPath = '';
  const depths = new Set();
  let formOpened = false;
  let exitSent = false;
  let pageTimers = [];
  function startPageTimers() {
    pageTimers.forEach(clearTimeout);
    pageTimers = [30, 60, 120].map(seconds => setTimeout(() => {
      if (document.visibilityState === 'visible') track('time_on_page', { seconds });
    }, seconds * 1000));
  }
  function navigate() {
    const route = location.pathname; // Opening a modal/query string is not another page view.
    if (lastPath === route) return;
    lastPath = route;
    depths.clear();
    formOpened = false;
    exitSent = false;
    startPageTimers();
    step = /\/learn(?:\/|$)/.test(route) ? 'learn' : 'home';
    navigationId = uuid();
    window.__FUNNEL_NAVIGATION_ID__ = navigationId;
    window.__META_PAGEVIEW_EVENT_ID = uuid();
    window.__META_BROWSER_PIXEL?.navigate?.(pageId, step === 'learn' ? 'lesson' : 'landing_page');
    track('pageview', { title: document.title });
  }
  let googleConfig;
  async function loadGoogleTag() {
    try {
      googleConfig = await (await fetch(configUrl, { credentials: 'same-origin' })).json();
      window.dataLayer = window.dataLayer || [];
      if (/^GTM-[A-Z0-9]+$/.test(googleConfig.gtm_id || '') && !document.querySelector('script[src*="googletagmanager.com/gtm.js"]')) {
        window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
        const tag = document.createElement('script'); tag.async = true;
        tag.src = 'https://www.googletagmanager.com/gtm.js?id=' + googleConfig.gtm_id;
        document.head.appendChild(tag);
      } else if (!googleConfig.gtm_id && /^G-[A-Z0-9]+$/.test(googleConfig.ga_measurement_id || '')) {
        window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
        window.gtag('js', new Date());
        window.gtag('config', googleConfig.ga_measurement_id, { send_page_view: !spa });
        const tag = document.createElement('script'); tag.async = true;
        tag.src = 'https://www.googletagmanager.com/gtag/js?id=' + googleConfig.ga_measurement_id;
        document.head.appendChild(tag);
        if (spa && lastPath) window.gtag('event', 'page_view', { page_location: location.href, page_title: document.title });
      }
    } catch { /* Internal measurement continues when an external tag is unavailable. */ }
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
      if (!spa) track('pageview', { title: document.title });
      document.addEventListener('focusin', event => {
        const form = event.target.closest?.('form');
        if (form && !formOpened) { formOpened = true; track('form_open'); }
      });
      if (spa) document.addEventListener('submit', () => track('form_submit'));
      document.addEventListener('click', event => {
        const target = event.target.closest?.('a,button');
        if (!target) return;
        const position = target.closest('section')?.id || (target.closest('header') ? 'header' : 'page');
        const label = (target.textContent || '').trim().slice(0, 80);
        if (target.matches('[data-sale],[data-checkout]') || /mua|thanh toán|buy|checkout/i.test(label)) track('sale_click', { position, label });
        if (target.matches('[data-cta],[data-signup-open],[href^="#"],button[type="submit"]') || /đăng ký|tư vấn|liên hệ|tham gia|get started/i.test(label)) track('cta_click', { position, label });
      });
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
    if (!spa || !lastPath) startPageTimers();
    document.addEventListener('mouseout', event => {
      if (!exitSent && event.clientY <= 0 && !event.relatedTarget) { exitSent = true; track('exit_intent'); }
    });
    loadGoogleTag();
  }
  window.FunnelTracking = { funnel, get step() { return step; }, pageId, sessionId, context, track, navigate, browserEvent };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
