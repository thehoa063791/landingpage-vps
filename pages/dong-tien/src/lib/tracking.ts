import type { TrackingData } from '../types';

// Shape adapter only: attribution/session/cookies come from the shared runtime.
export function getTrackingData(_forceRefresh = false): TrackingData {
  const data = typeof window !== 'undefined' ? window.FunnelTracking?.context() || {} : {};
  return {
    session_id: data.session_id || '',
    event_source_url: data.url || (typeof window !== 'undefined' ? window.location.href : ''),
    utm: { utm_source: data.utm_source || '', utm_medium: data.utm_medium || '', utm_campaign: data.utm_campaign || '', utm_content: data.utm_content || '', utm_term: data.utm_term || '', referrer: data.referrer || '' },
    click_ids: { fbclid: data.fbclid || '', gclid: data.gclid || '', ttclid: data.ttclid || '', msclkid: data.msclkid || '', twclid: data.twclid || '' },
    pixel: { fbc: data.fbc || '', fbp: data.fbp || '', ga: data.ga || '' },
  };
}
