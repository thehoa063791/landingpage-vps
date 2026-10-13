'use strict';
// /zoom: a CRM email goes straight to its personal Zoom page, a new email completes its info.
(() => {
  const { store, api, busy, validEmail, joinPath } = window.ZoomEvent;
  const form = document.getElementById('joinForm');
  const input = document.getElementById('email');
  const button = document.getElementById('joinButton');
  const errorBox = document.getElementById('formError');

  const saved = store.get('localStorage', 'zoom-event:access');
  if (saved) {
    document.getElementById('returningLink').href = joinPath(saved);
    document.getElementById('returning').hidden = false;
  }
  input.value = store.get('sessionStorage', 'zoom-event:email');
  // Back from the next page (bfcache) must not leave the button stuck on "Đang kiểm tra".
  window.addEventListener('pageshow', event => { if (event.persisted && button.disabled) busy(button, false); });
  input.addEventListener('input',() => { errorBox.textContent = ''; input.removeAttribute('aria-invalid'); });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (button.disabled) return;
    const email = input.value.trim().toLowerCase();
    if (!validEmail(email)) {
      errorBox.textContent = 'Vui lòng nhập email hợp lệ, ví dụ: ten@gmail.com';
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return;
    }
    errorBox.textContent = '';
    busy(button, true, 'Đang kiểm tra...');
    window.FunnelTracking?.track('form_submit', { position: 'hero' });
    try {
      const result = await api('/check', { email });
      store.set('sessionStorage', 'zoom-event:email', email);
      if (result.status === 'ready') {
        store.set('localStorage', 'zoom-event:access', result.access_key);
        location.assign(joinPath(result.access_key));
      } else {
        location.assign('/zoom/hoan-tat');
      }
    } catch (error) {
      errorBox.textContent = error.message;
      busy(button, false);
    }
  });
})();
