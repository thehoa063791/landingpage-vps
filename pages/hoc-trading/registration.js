'use strict';
(() => {
  const key = 'hoc_trading_receipt';
  let busy = false;
  function receipt() {
    try {
      const data = JSON.parse(sessionStorage.getItem(key) || 'null');
      return data && Date.now() - data.at < 86400000 ? data : null;
    } catch { return null; }
  }
  async function submit(fields) {
    if (busy) return;
    const name = fields.name.trim();
    const phone = fields.phone.trim();
    const email = fields.email.trim().toLowerCase();
    if (!name) throw new Error('Vui lòng nhập họ và tên.');
    if (!/^[+\d\s().-]+$/.test(phone) || !/^\d{9,11}$/.test(phone.replace(/\D/g, ''))) throw new Error('Vui lòng nhập số điện thoại hợp lệ (9–11 chữ số).');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error('Vui lòng nhập email hợp lệ.');
    if (window.HOC_TRADING_PREVIEW) throw new Error('Đây là bản xem trước. Vui lòng mở trang /hoc-trading trên máy chủ để gửi đăng ký.');
    busy = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      try { window.HocTradingTracking?.track('form_submit'); } catch {}
      const response = await fetch('/api/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ ...window.HocTradingTracking?.context(), name, phone, email,
          page_id: 'hoc-trading', attendance: 'Học nghề Trading',
          event_source_url: location.href, value: 0, currency: 'VND' })
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Chưa lưu được đăng ký. Vui lòng thử lại.');
      try { sessionStorage.setItem(key, JSON.stringify({ id: data.event_id, name, phone, email, at: Date.now() })); } catch {}
      try { await window.HocTradingTracking?.registered(data); } catch {}
      location.assign('/thank-you-hoc-trading');
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('Chưa nhận được xác nhận từ máy chủ. Vui lòng liên hệ hỗ trợ để kiểm tra trước khi gửi lại.');
      throw error;
    } finally { clearTimeout(timer); busy = false; }
  }
  window.HocTradingRegistration = { submit, receipt };
})();
