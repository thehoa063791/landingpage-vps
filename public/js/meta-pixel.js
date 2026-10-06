(function () {
  'use strict';
  const script = document.currentScript;
  const spa = script?.dataset.spa === 'true';
  const configUrl = script?.dataset.config || '/api/meta-config';

  const state = window.__META_BROWSER_PIXEL = window.__META_BROWSER_PIXEL || {
    initialized: false,
    pageViewFired: false
  };

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'evt_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
  }

  function pageId() {
    if (window.PAGE_CONFIG && window.PAGE_CONFIG.pageId) return window.PAGE_CONFIG.pageId;
    if (window.PAGE_ID) return window.PAGE_ID;
    return location.pathname.replace(/^\/+|\/+$/g, '').replace(/\//g, '-') || 'home';
  }

  function pageViewEventId(id) {
    if (window.__META_PAGEVIEW_EVENT_ID) return window.__META_PAGEVIEW_EVENT_ID;
    const pid = id || pageId();
    const key = '_fb_' + pid + '_pageview_event_id';
    let eventId;
    try { eventId = sessionStorage.getItem(key); } catch (_) { /* Storage may be blocked. */ }
    if (!eventId) {
      eventId = uuid();
      try { sessionStorage.setItem(key, eventId); } catch (_) { /* Keep the in-memory ID. */ }
    }
    window.__META_PAGEVIEW_EVENT_ID = eventId;
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: 'meta_page_view_id_ready', event_id: eventId, page_id: pid });
    return eventId;
  }

  function loadPixel(pixelId) {
    if (!window.fbq) {
      !function(f,b,e,v,n,t,s) {
        if (f.fbq) return;
        n = f.fbq = function() {
          n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
        };
        if (!f._fbq) f._fbq = n;
        n.push = n;
        n.loaded = true;
        n.version = '2.0';
        n.queue = [];
        t = b.createElement(e);
        t.async = true;
        t.src = v;
        s = b.getElementsByTagName(e)[0];
        s.parentNode.insertBefore(t, s);
      }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    }
    if (!state.initialized) {
      fbq('init', pixelId);
      state.initialized = true;
    }
  }

  function startEngagementTracking(pid, category = 'landing_page', startedAt = 0) {
    if (!spa && state.engagementStarted) return;
    state.stopEngagement?.();
    state.engagementStarted = true;
    let active = true;
    const timers = [];
    const fired = new Set();
    function fire(name, params) {
      if (!active || fired.has(name)) return;
      fbq('trackCustom', name, {
        content_name: pid,
        content_category: category,
        ...params
      }, { eventID: uuid() });
      fired.add(name);
    }
    // Measure elapsed time from navigation, including time spent loading the Pixel.
    const elapsed = window.performance && typeof window.performance.now === 'function'
      ? Math.max(0, window.performance.now() - startedAt) : 0;
    [10, 30, 60, 90, 120, 180, 300].forEach(seconds => {
      timers.push(setTimeout(() => fire('TimeOnPage_' + seconds + '_seconds', { seconds }),
        Math.max(0, seconds * 1000 - elapsed)));
    });
    function checkScroll(event) {
      const container = spa && event?.target && event.target !== document && event.target !== document.documentElement && event.target.scrollHeight > event.target.clientHeight ? event.target : null;
      const root = document.documentElement;
      const height = container ? container.scrollHeight : Math.max(root.scrollHeight, document.body ? document.body.scrollHeight : 0);
      const viewport = container ? container.clientHeight : window.innerHeight || root.clientHeight;
      const range = height - viewport;
      // A page that cannot scroll has no scroll-depth engagement.
      if (range <= 0) return;
      const top = container ? container.scrollTop : window.scrollY || root.scrollTop || 0;
      const percent = Math.min(100, Math.max(0, (top / range) * 100));
      [25, 50, 75, 100].forEach(depth => {
        // Allow one pixel of rounding at the bottom of the page.
        if (percent >= depth || (depth === 100 && top >= range - 1)) {
          fire('ScrollDepth_' + depth + '_percent', { percent: depth });
        }
      });
    }
    window.addEventListener('scroll', checkScroll, { passive: true });
    window.addEventListener('resize', checkScroll, { passive: true });
    window.addEventListener('load', checkScroll, { once: true });
    if (spa) document.addEventListener('scroll', checkScroll, { capture: true, passive: true });
    state.stopEngagement = () => {
      active = false;
      timers.forEach(clearTimeout);
      window.removeEventListener?.('scroll', checkScroll);
      window.removeEventListener?.('resize', checkScroll);
      window.removeEventListener?.('load', checkScroll);
      if (spa) document.removeEventListener('scroll', checkScroll, true);
    };
    checkScroll();
  }

  async function init() {
    const pid = pageId();
    const eventId = pageViewEventId(pid);
    try {
      const res = await fetch(configUrl, { credentials: 'same-origin' });
      if (!res.ok) return;
      const cfg = await res.json();
      if (!cfg.enabled || !cfg.pixel_id || state.pageViewFired) return;
      loadPixel(cfg.pixel_id);
      if (spa) {
        state.ready = true;
        pendingEvents.splice(0).forEach(item => state.track(...item));
        if (state.navigation) startEngagementTracking(state.navigation.pid, state.navigation.category, state.navigation.startedAt);
        return;
      }
      fbq('track', 'PageView', {
        content_name: pid,
        content_category: 'landing_page'
      }, {
        eventID: eventId
      });
      state.pageViewFired = true;
      const pending = window.__META_PENDING_VIEWCONTENT;
      if (pending) {
        fbq('track', 'ViewContent', pending.params, { eventID: pending.eventID });
        delete window.__META_PENDING_VIEWCONTENT;
      }
      startEngagementTracking(pid);
      console.log('[Meta Pixel] PageView fired, eventID:', eventId);
    } catch (err) {
      console.warn('[Meta Pixel] init failed:', err.message);
    }
  }

  const pendingEvents = [];
  state.navigate = function (pid, category = 'landing_page') {
    state.navigation = { pid, category, startedAt: window.performance?.now?.() || 0 };
    if (state.ready) startEngagementTracking(pid, category, state.navigation.startedAt);
  };
  state.track = function (name, params, eventId, custom = false) {
    if (!state.ready) { if (pendingEvents.length < 100) pendingEvents.push([name, params, eventId, custom]); return; }
    fbq(custom ? 'trackCustom' : 'track', name, params, { eventID: eventId });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
