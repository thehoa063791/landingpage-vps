'use strict';
(() => {
  // Nút đăng ký cố định trên điện thoại: ẩn khi form đang hiện trên màn hình.
  const mobileCta = document.querySelector('#mobile-cta');
  const card = document.querySelector('#dang-ky');
  if (mobileCta && card && 'IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => mobileCta.classList.toggle('hidden', entry.isIntersecting)).observe(card);
  }

  // Khu vực tự đóng từ 00:00 (giờ Việt Nam) ngày học; server cũng chặn (src/bankTransfer.js).
  const regionInputs = Array.from(document.querySelectorAll('input[name="region"]'));
  regionInputs.forEach(input => {
    if (Date.now() < new Date(`${input.dataset.startsOn}T00:00:00+07:00`).getTime()) return;
    input.disabled = true;
    input.closest('.region').classList.add('closed');
    input.closest('.region').querySelector('span').textContent = 'Đã đóng đăng ký';
  });
  const allClosed = regionInputs.every(input => input.disabled);

  // Đăng ký → tạo đơn chờ chuyển khoản → trang thanh toán QR (src/bankTransfer.js).
  const form = document.querySelector('#registration-form');
  const error = document.querySelector('#form-error');
  const button = form.querySelector('button[type="submit"]');
  const buttonLabel = button.innerHTML;
  const info = document.querySelector('#form-info');
  if (allClosed) {
    button.disabled = true;
    button.hidden = true;
    document.querySelector('#form-closed').hidden = false;
  }
  function showError(message, field) {
    error.textContent = message;
    error.hidden = false;
    field?.focus();
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (button.disabled || form.elements.bt_hp.value) return;
    error.hidden = true;
    info.hidden = true;
    const name = form.elements.name.value.trim();
    const phone = form.elements.phone.value.trim();
    const email = form.elements.email.value.trim().toLowerCase();
    const region = form.elements.region.value;
    if (!name) return showError('Vui lòng nhập họ và tên.', form.elements.name);
    if (!/^[+\d\s().-]+$/.test(phone) || !/^\d{9,11}$/.test(phone.replace(/\D/g, ''))) {
      return showError('Vui lòng nhập số điện thoại hợp lệ (9–11 chữ số).', form.elements.phone);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email)) {
      return showError('Vui lòng nhập địa chỉ email hợp lệ (ví dụ: ban@email.com).', form.elements.email);
    }
    if (!region) return showError('Vui lòng chọn khu vực tham dự: Hà Nội hoặc TP. Hồ Chí Minh.', form.querySelector('input[name="region"]'));
    window.BreakoutTracking?.track('form_submit', { region });
    button.disabled = true;
    button.textContent = 'Đang gửi…';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch('/api/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ ...window.BreakoutTracking?.context(), name, phone, email, region, attendance: 'Breakout Trading',
          page_id: 'breakout', event_source_url: location.href, value: 0, currency: 'VND' })
      });
      const data = await response.json().catch(() => ({}));
      if (data.code === 'email_invalid') {
        const message = data.suggestion ? `${data.message} Có phải bạn muốn nhập ${data.suggestion}?` : data.message;
        throw Object.assign(new Error(message), { field: form.elements.email });
      }
      if (!response.ok || !data.success || !data.payment?.ref) throw Object.assign(new Error(data.message || ''), { server: true });
      // Đã thanh toán cho khu vực khác: giữ chỗ cũ, mời gọi hotline nếu muốn đổi.
      if (data.region_locked) {
        for (const store of [localStorage, sessionStorage]) { try { store.setItem('breakout:ref', data.payment.ref); } catch {} }
        info.replaceChildren(`Email này đã đăng ký và thanh toán cho khu vực ${data.region_locked}. Muốn đổi khu vực, vui lòng gọi hotline 086.242.1919. `,
          Object.assign(document.createElement('a'), { href: data.payment.thank_you_url, textContent: `Vào trang nhóm Zalo ${data.region_locked}` }));
        info.hidden = false;
        button.disabled = false;
        button.innerHTML = buttonLabel;
        return;
      }
      try { await window.BreakoutTracking?.registered(data); } catch {}
      for (const store of [localStorage, sessionStorage]) { try { store.setItem('breakout:ref', data.payment.ref); } catch {} }
      try { if (data.duplicate) sessionStorage.setItem('breakout:repeat', data.payment.ref); } catch {}
      location.assign('/breakout/thanh-toan');
    } catch (err) {
      showError(err.field ? err.message
        : err.name === 'AbortError'
          ? 'Chưa nhận được xác nhận từ máy chủ. Vui lòng liên hệ 086.242.1919 để kiểm tra đăng ký trước khi gửi lại.'
          : err.server && err.message ? err.message
            : 'Chưa hoàn tất đăng ký. Vui lòng kiểm tra kết nối và thử lại, hoặc liên hệ 086.242.1919.', err.field);
      button.disabled = false;
      button.innerHTML = buttonLabel;
    } finally { clearTimeout(timer); }
  });
})();
