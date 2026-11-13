'use strict';
// Shared by the funnel's pages: the person's key (kept in the browser), dates in Vietnam time,
// and the registration call every form uses.
window.WebinarFunnel = (() => {
  const STORE = 'webinar-dong-tien:key';
  const saveKey = value => { for (const store of [localStorage, sessionStorage]) { try { store.setItem(STORE, value); } catch {} } };
  function readKey() {
    for (const store of [localStorage, sessionStorage]) { try { const value = store.getItem(STORE); if (value) return value; } catch {} }
    return '';
  }
  const part = (iso, options) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hourCycle: 'h23', ...options }).format(new Date(iso));
  const dayMonth = iso => part(iso, { day: '2-digit', month: '2-digit' }).replace(/-/g, '/');
  const clock = iso => part(iso, { hour: '2-digit', minute: '2-digit' });
  const WEEKDAY = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
  const weekday = iso => WEEKDAY[new Date(new Date(iso).getTime() + 7 * 3600000).getUTCDay()];
  const moment = iso => `${clock(iso)} ${weekday(iso)}, ${dayMonth(iso)}`;

  function renderSchedule(list, sessions) {
    list.replaceChildren(...sessions.map(s => {
      const item = document.createElement('li');
      if (s.open) item.className = 'now';
      else if (s.past) item.className = 'past';
      item.textContent = `Buổi ${s.position}: ${moment(s.at)}`;
      return item;
    }));
  }

  const validPhone = phone => /^[+\d\s().-]+$/.test(phone) && /^\d{9,11}$/.test(phone.replace(/\D/g, ''));
  const validEmail = email => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email);

  // Registers on the shared lead pipeline; resolves with the server's answer.
  // week: the direct link's week (/w/dong-tien/20h-16-11-26), so its study days count.
  async function register({ name, phone, email, region = '', week = '' }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch('/api/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ ...window.WebinarTracking?.context(), name, phone, email, region, attendance: 'Webinar', page_id: 'webinar-dong-tien', webinar_week: week, event_source_url: location.href, value: 0, currency: 'VND' }),
      });
      const data = await response.json().catch(() => ({}));
      if (data.code === 'email_invalid') throw Object.assign(new Error(data.suggestion ? `${data.message} Có phải bạn muốn nhập ${data.suggestion}?` : data.message), { field: 'email' });
      if (!response.ok || !data.success) throw new Error(data.message || 'Chưa hoàn tất đăng ký. Vui lòng thử lại, hoặc liên hệ 086 242 1919.');
      if (data.cohort?.key) saveKey(data.cohort.key);
      await window.WebinarTracking?.registered(data).catch?.(() => {});
      return data;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('Chưa nhận được xác nhận từ máy chủ. Vui lòng liên hệ 086 242 1919 để kiểm tra đăng ký trước khi gửi lại.');
      throw error;
    } finally { clearTimeout(timer); }
  }

  return { saveKey, readKey, dayMonth, clock, moment, renderSchedule, register, validPhone, validEmail };
})();
