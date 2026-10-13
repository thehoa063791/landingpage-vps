'use strict';
// Shared by the /zoom pages: API calls with the funnel attribution, countdown, storage.
(() => {
  const store = {
    get(area, key) { try { return window[area].getItem(key) || ''; } catch { return ''; } },
    set(area, key, value) { try { window[area].setItem(key, value); } catch {} },
  };

  async function api(path, body) {
    let response;
    try {
      response = await fetch('/api/zoom-event' + path, body ? {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(window.FunnelTracking?.context() || {}), ...body, event_source_url: location.href }),
      } : { headers: { Accept: 'application/json' } });
    } catch {
      throw Object.assign(new Error('Không kết nối được tới hệ thống. Vui lòng kiểm tra mạng và thử lại.'), { code: 'network' });
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.success === false) throw Object.assign(new Error(result.message || 'Có lỗi xảy ra. Vui lòng thử lại.'), { code: result.code, status: response.status });
    return result;
  }

  // Before the start: days/hours/minutes/seconds; during: "đang diễn ra"; after: ended.
  function countdown(root) {
    if (!root) return;
    const start = Date.parse(root.dataset.startsAt), end = Date.parse(root.dataset.endsAt);
    if (!Number.isFinite(start)) return;
    const units = root.querySelector('[data-countdown-units]'), status = root.querySelector('[data-countdown-status]'), label = root.querySelector('[data-countdown-label]');
    const pad = n => String(n).padStart(2, '0');
    let timer;
    function tick() {
      const now = Date.now();
      if (now < start) {
        const left = Math.floor((start - now) / 1000);
        root.querySelector('[data-d]').textContent = pad(Math.floor(left / 86400));
        root.querySelector('[data-h]').textContent = pad(Math.floor(left % 86400 / 3600));
        root.querySelector('[data-m]').textContent = pad(Math.floor(left % 3600 / 60));
        root.querySelector('[data-s]').textContent = pad(left % 60);
        return;
      }
      units.hidden = true; status.hidden = false;
      if (label) label.hidden = true;
      if (Number.isFinite(end) && now >= end) { status.textContent = 'Sự kiện đã kết thúc.'; clearInterval(timer); }
      else { status.innerHTML = '<span class="live-dot" aria-hidden="true"></span>Sự kiện đang diễn ra'; }
      root.dispatchEvent(new CustomEvent('zoom:started'));
    }
    tick();
    timer = setInterval(tick, 1000);
  }

  function busy(button, on, text) {
    const label = button.querySelector('[data-label]') || button;
    if (on) { button.dataset.idle = label.textContent; label.textContent = text; button.disabled = true; }
    else { label.textContent = button.dataset.idle || label.textContent; button.disabled = false; }
  }

  window.ZoomEvent = { store, api, countdown, busy, validEmail: value => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value), joinPath: key => '/zoom/vao-hoc/' + encodeURIComponent(key) };
  document.querySelectorAll('[data-countdown]').forEach(countdown);
})();
