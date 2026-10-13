'use strict';
// /zoom/hoan-tat: new emails add name, phone and region; the CRM lead and the personal
// Zoom link are then created together.
(() => {
  const { store, api, busy, validEmail, joinPath } = window.ZoomEvent;
  const form = document.getElementById('completeForm');
  const button = document.getElementById('submitButton');
  const errorBox = document.getElementById('formError');
  const fields = Object.fromEntries(['email', 'name', 'phone', 'region'].map(id => [id, document.getElementById(id)]));

  const email = store.get('sessionStorage', 'zoom-event:email');
  if (validEmail(email)) {
    fields.email.value = email;
    document.getElementById('emailText').textContent = email;
    document.getElementById('emailChip').hidden = false;
    document.getElementById('emailField').hidden = true;
  }
  document.getElementById('changeEmail').addEventListener('click', () => {
    document.getElementById('emailChip').hidden = true;
    document.getElementById('emailField').hidden = false;
    fields.email.focus();
  });
  window.addEventListener('pageshow', event => { if (event.persisted && button.disabled) busy(button, false); });
  form.addEventListener('input', event => { event.target.removeAttribute('aria-invalid'); errorBox.textContent = ''; });

  function invalid(field, message) {
    if (field === fields.email) { document.getElementById('emailChip').hidden = true; document.getElementById('emailField').hidden = false; }
    field.setAttribute('aria-invalid', 'true');
    field.focus();
    errorBox.textContent = message;
  }

  // Pixel CompleteRegistration for a new lead, deduplicated with CAPI by the lead ID.
  async function pixel(eventId) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ ...(window.FunnelTracking?.context() || {}), event: 'generate_lead', event_id: eventId, page_id: 'zoom-event' });
    for (let attempt = 0; attempt < 15; attempt++) {
      if (window.__META_BROWSER_PIXEL?.initialized && typeof window.fbq === 'function') {
        window.fbq('track', 'CompleteRegistration', { content_name: 'zoom-event', content_category: 'lead_generation', value: 0, currency: 'VND' }, { eventID: eventId });
        await new Promise(resolve => setTimeout(resolve, 350));
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (button.disabled) return;
    const values = { email: fields.email.value.trim().toLowerCase(), name: fields.name.value.trim(), phone: fields.phone.value.trim(), region: fields.region.value };
    if (!validEmail(values.email)) return invalid(fields.email, 'Vui lòng nhập email hợp lệ.');
    if (!values.name) return invalid(fields.name, 'Vui lòng nhập họ và tên.');
    const digits = values.phone.replace(/\D/g, '');
    if (digits.length < 9 || digits.length > 11) return invalid(fields.phone, 'Vui lòng nhập số điện thoại hợp lệ (9–11 số).');
    if (!values.region) return invalid(fields.region, 'Vui lòng chọn khu vực.');
    busy(button, true, 'Đang tạo link Zoom...');
    window.FunnelTracking?.track('form_submit', { position: 'complete' });
    try {
      const result = await api('/complete', values);
      store.set('sessionStorage', 'zoom-event:email', values.email);
      store.set('localStorage', 'zoom-event:access', result.access_key);
      if (result.event_id) await pixel(result.event_id);
      location.assign(joinPath(result.access_key));
    } catch (error) {
      errorBox.textContent = error.message;
      busy(button, false);
    }
  });
})();
