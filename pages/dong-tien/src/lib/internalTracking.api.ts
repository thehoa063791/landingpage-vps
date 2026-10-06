import { tokenKey } from './brand';
import type { InternalTrackingPayload, InternalTrackingResponse } from '../types';

export async function trackEvent(
  payload: InternalTrackingPayload
): Promise<InternalTrackingResponse> {
  try {
    const res = await fetch('/dong-tien/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(typeof window !== 'undefined' && localStorage.getItem(tokenKey()) ? { Authorization: 'Bearer ' + localStorage.getItem(tokenKey()) } : {}) },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.warn('[InternalTracking] trackEvent HTTP error', res.status, errData);
      return { success: false, error: errData?.error || `HTTP ${res.status}` };
    }

    const data: InternalTrackingResponse = await res.json();
    if (data.success && payload.event !== 'conversion' && typeof window !== 'undefined') {
      window.FunnelTracking?.browserEvent(payload.event, payload.meta || {}, payload.event_id || data.event_id || '');
    }
    return data;
  } catch (err: any) {
    console.warn('[InternalTracking] trackEvent failed (network?):', err?.message);
    return { success: false, error: err?.message || 'network_error' };
  }
}
