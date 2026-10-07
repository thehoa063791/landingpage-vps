(() => {
  'use strict';
  const pageId = document.currentScript.dataset.page;
  const currency = document.currentScript.dataset.currency || 'VND';
  const pendingKey = pageId + ':pending-conversion';
  const get = key => { try { return sessionStorage.getItem(key); } catch { return null; } };
  const set = (key, value) => { try { sessionStorage.setItem(key, value); } catch {} };
  const params = { content_name: pageId, content_category: 'lead_generation', value: 0, currency };

  async function send(item) {
    if (!item?.id || Date.now() - item.at > 300000 || get(pageId + ':sent:' + item.id)) return;
    // Wait briefly for the shared, configuration-controlled Pixel loader.
    for (let attempt = 0; attempt < 15; attempt++) {
      if (window.__META_BROWSER_PIXEL?.initialized && typeof window.fbq === 'function') {
        window.fbq('track', 'CompleteRegistration', params, { eventID: item.id });
        set(pageId + ':sent:' + item.id, '1');
        try { sessionStorage.removeItem(pendingKey); } catch {}
        await new Promise(resolve => setTimeout(resolve, 350));
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  window.LandingConversion = {
    async registered(result) {
      if (result.duplicate || !result.event_id) return;
      const item = { id: result.event_id, at: Date.now() };
      set(pendingKey, JSON.stringify(item));
      window.dataLayer = window.dataLayer || [];
      const attribution = window.FunnelTracking?.context() || {};
      window.dataLayer.push({ ...attribution, event: 'generate_lead', event_id: item.id, page_id: pageId, value: 0, currency });
      await send(item);
    }
  };
  if (window.FunnelTracking?.step === 'thank-you') {
    try { void send(JSON.parse(get(pendingKey) || 'null')); } catch {}
  }
})();

