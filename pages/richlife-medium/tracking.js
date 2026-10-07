'use strict';
(() => {
  if (window.RichlifeTracking) return;
  const thankYou = location.pathname.includes('thank-you');
  const pageId = thankYou ? 'richlife-medium-thank-you' : 'richlife-medium';
  window.PAGE_CONFIG = { pageId, socialProof: false };
  const memory = {};
  const get = key => { try { return sessionStorage.getItem(key) || memory[key] || ''; } catch { return memory[key] || ''; } };
  const set = (key, value) => { memory[key] = value; try { sessionStorage.setItem(key, value); } catch {} };
  const uuid = () => window.crypto?.randomUUID?.() || 'evt_' + Date.now().toString(36) + Math.random().toString(36).slice(2);
  const navigationId = window.__FUNNEL_NAVIGATION_ID__ || uuid();
  window.__FUNNEL_NAVIGATION_ID__ = navigationId;
  const sessionKey = '_sid_' + pageId;
  const sessionId = get(sessionKey) || uuid();
  set(sessionKey, sessionId);
  window._sessionId = sessionId;
  const query = new URLSearchParams(location.search);
  const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid', 'ttclid', 'msclkid', 'twclid'];
  const attribution = {};
  const newCampaign = keys.some(key => query.has(key));
  keys.forEach(key => {
    const storageKey = 'richlife_medium_' + key;
    attribution[key] = query.get(key) || (newCampaign ? '' : get(storageKey));
    set(storageKey, attribution[key]);
  });
  const referrerKey = 'richlife_medium_referrer';
  attribution.referrer = (newCampaign ? document.referrer : get(referrerKey) || document.referrer) || '';
  set(referrerKey, attribution.referrer);
  function cookie(name) {
    try {
      const entry = document.cookie.split('; ').find(item => item.startsWith(name + '='));
      return entry ? decodeURIComponent(entry.slice(name.length + 1)) : '';
    } catch { return ''; }
  }
  function saveCookie(name, value) {
    try { document.cookie = `${name}=${encodeURIComponent(value)}; max-age=7776000; path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`; } catch {}
  }
  let fbc = cookie('_fbc') || get('richlife_medium_fbc');
  const clickId = attribution.fbclid;
  if (clickId && (!fbc || fbc.split('.').slice(3).join('.') !== clickId)) {
    fbc = `fb.1.${Date.now()}.${clickId}`;
    saveCookie('_fbc', fbc);
  }
  let fbp = cookie('_fbp') || get('richlife_medium_fbp');
  if (!fbp) { fbp = `fb.1.${Date.now()}.${Math.floor(Math.random() * 2147483647)}`; saveCookie('_fbp', fbp); }
  set('richlife_medium_fbc', fbc);
  set('richlife_medium_fbp', fbp);
  const context = () => ({ ...attribution, session_id: sessionId, fbc: cookie('_fbc') || fbc, fbp: cookie('_fbp') || fbp, ga: cookie('_ga') });
  window.dataLayer = window.dataLayer || [];
  const queue = [];
  let pumpTimer;
  const pendingKey = 'richlife_medium_pending_conversion';
  function pump() {
    clearTimeout(pumpTimer);
    if (window.__META_BROWSER_PIXEL?.initialized && typeof window.fbq === 'function') {
      while (queue.length) {
        const item = queue.shift();
        if (item.event === 'CompleteRegistration' && get('richlife_medium_sent_' + item.id)) continue;
        window.fbq(item.custom ? 'trackCustom' : 'track', item.event, item.params, { eventID: item.id });
        if (item.event === 'CompleteRegistration') { set('richlife_medium_sent_' + item.id, '1'); set(pendingKey, ''); }
      }
    } else {
      while (queue.length && queue[0].expires < Date.now()) queue.shift();
      if (queue.length) pumpTimer = setTimeout(pump, 100);
    }
  }
  function pixel(event, id, params = {}, custom = false) {
    queue.push({ event, id, params: { content_name: pageId, ...params }, custom, expires: Date.now() + 6000 });
    pump();
  }
  const map = { pageview: 'PageView', form_open: 'ViewContent', form_submit: 'SubmitApplication', cta_click: 'Contact' };
  function track(event, details = {}, eventId = uuid()) {
    const data = { ...context(), navigation_id: navigationId, page_id: pageId, event_id: eventId, url: location.href, ...details };
    const body = JSON.stringify({ event, session_id: sessionId, data });
    let sent = false;
    try { sent = !!navigator.sendBeacon?.('/api/track', new Blob([body], { type: 'application/json' })); } catch {}
    if (!sent) fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
    window.dataLayer.push({ event, event_id: eventId, page_id: pageId, ...details });
    // The shared meta-pixel loader owns browser PageView; it reads this same ID.
    if (event !== 'pageview') pixel(map[event] || event, eventId, {
      content_category: 'landing_page', ...(details.depth !== undefined ? { scroll_depth: details.depth } : {}),
      ...(details.position ? { button_position: details.position } : {})
    }, !map[event]);
    return eventId;
  }
  async function registered(data) {
    if (data.duplicate || !data.event_id) return;
    const item = { id: data.event_id, at: Date.now() };
    set(pendingKey, JSON.stringify(item));
    window.dataLayer.push({ event: 'generate_lead', event_id: item.id, page_id: 'richlife-medium', value: 0, currency: 'VND', ...attribution });
    pixel('CompleteRegistration', item.id, { content_name: 'richlife-medium', content_category: 'lead_generation', value: 0, currency: 'VND' });
    // Give the Pixel queue a chance to flush; the thank-you page retries if needed.
    await new Promise(resolve => setTimeout(resolve, 350));
  }
  window.RichlifeTracking = { context, track, registered };
  const pageViewId = uuid();
  window.__META_PAGEVIEW_EVENT_ID = pageViewId;
  window.dataLayer.push({ event: 'meta_page_view_id_ready', page_id: pageId, event_id: pageViewId });
  if (!window.__FUNNEL_PAGEVIEW_SENT__) {
    window.__FUNNEL_PAGEVIEW_SENT__ = true;
    track('pageview', { title: document.title }, pageViewId);
  }
  if (thankYou) {
    try {
      const pending = JSON.parse(get(pendingKey) || 'null');
      if (pending && Date.now() - pending.at < 300000 && !get('richlife_medium_sent_' + pending.id)) {
        pixel('CompleteRegistration', pending.id, { content_name: 'richlife-medium', content_category: 'lead_generation', value: 0, currency: 'VND' });
      }
    } catch {}
  }
  const form = document.querySelector('#registration-form');
  form?.addEventListener('focusin', () => track('form_open'), { once: true });
  document.addEventListener('click', event => {
    const link = event.target.closest?.('a');
    if (!link) return;
    if (link.getAttribute('href') === '#dang-ky' || link.href.startsWith('https://zalo.me/g/')) {
      const position = link.closest('section')?.id || (link.closest('header') ? 'header' : link.closest('.mobile-cta') ? 'mobile_sticky' : 'thank_you');
      track('cta_click', { position, method: link.href.includes('zalo.me') ? 'zalo' : 'registration' });
    }
  });
  const depths = new Set();
  window.addEventListener('scroll', () => {
    const range = document.documentElement.scrollHeight - innerHeight;
    if (range <= 0) return;
    const depth = Math.round(scrollY / range * 100);
    [25, 50, 75, 100].forEach(value => {
      if (depth >= value && !depths.has(value)) { depths.add(value); track(`Scroll_${value}_Percent`, { depth: value }); }
    });
  }, { passive: true });
})();
