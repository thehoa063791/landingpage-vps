(function () {
  'use strict';

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
    let eventId = sessionStorage.getItem(key);
    if (!eventId) {
      eventId = uuid();
      sessionStorage.setItem(key, eventId);
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

  async function init() {
    const pid = pageId();
    const eventId = pageViewEventId(pid);
    try {
      const res = await fetch('/api/meta-config', { credentials: 'same-origin' });
      if (!res.ok) return;
      const cfg = await res.json();
      if (!cfg.enabled || !cfg.pixel_id || state.pageViewFired) return;
      loadPixel(cfg.pixel_id);
      fbq('track', 'PageView', {
        content_name: pid,
        content_category: 'landing_page'
      }, {
        eventID: eventId
      });
      state.pageViewFired = true;
      console.log('[Meta Pixel] PageView fired, eventID:', eventId);
    } catch (err) {
      console.warn('[Meta Pixel] init failed:', err.message);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
