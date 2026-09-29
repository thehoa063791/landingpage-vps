(() => {
  'use strict';
  const form = document.getElementById('registrationForm');
  const errorBox = document.getElementById('formError');
  const submitButton = form.querySelector('[type="submit"]');
  const defaultSubmitLabel = submitButton.textContent;
  let busy = false;

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    const values = Object.fromEntries(new FormData(form));
    const phoneDigits = String(values.phone || '').replace(/\D/g, '');
    errorBox.classList.remove('show');
    if (values.website) return; // honeypot: bots fill hidden fields
    if (!String(values.name || '').trim()) return showError('Vui lòng nhập họ và tên.');
    if (phoneDigits.length < 9 || phoneDigits.length > 11) return showError('Vui lòng nhập số điện thoại hợp lệ.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(values.email || '').trim())) return showError('Vui lòng nhập địa chỉ email hợp lệ.');
    busy = true; submitButton.disabled = true; submitButton.textContent = 'Đang gửi...';
    try {
      window.FunnelTracking?.track('form_submit', { position: 'inline' });
      const response = await fetch('/api/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...window.FunnelTracking?.context(), name: String(values.name).trim(),
          email: String(values.email).trim().toLowerCase(), phone: String(values.phone).trim(),
          region: 'Hà Nội',
          page_id: 'richlife-live', attendance: 'RichLife Live 17/10/2026', event_source_url: location.href,
          value: 0, currency: 'VND'
        })
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Không lưu được đăng ký. Vui lòng thử lại.');
      location.assign('/richlife-live/thank-you');
    } catch (error) {
      showError(error.message || 'Có lỗi xảy ra. Vui lòng thử lại.');
      busy = false; submitButton.disabled = false; submitButton.textContent = defaultSubmitLabel;
    }
  });

  function showError(message) { errorBox.textContent = message; errorBox.classList.add('show'); }
})();
