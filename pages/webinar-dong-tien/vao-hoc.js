'use strict';
(() => {
  // The week's link: someone already registered goes straight into tonight's session; a
  // registered email does too; anyone else fills in the form once. When no session of theirs
  // is open, they land on their own page with the schedule.
  const { register, validPhone, validEmail, saveKey, readKey } = window.WebinarFunnel;
  const emailForm = document.querySelector('#email-form');
  const form = document.querySelector('#registration-form');
  const card = document.querySelector('.card');
  const emailError = document.querySelector('#email-error');
  const error = document.querySelector('#form-error');
  const emailInput = document.querySelector('#email');
  const say = (target, message) => { target.textContent = message; target.hidden = false; };
  const slug = location.pathname.split('/').pop();
  const visitor = window._sessionId || '';

  function count(kind) {
    return fetch('/api/webinar-program/link-event', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, kind, visitor }) }).catch(() => {});
  }
  // Into the room when it is open, else to the person's own page.
  function enter(view) {
    saveKey(view.key);
    location.replace(view.open_position ? `${view.go_href}?via=${encodeURIComponent(slug)}` : view.page_href);
  }
  async function enterByKey(key) {
    const response = await fetch(`/api/webinar-program/session/${encodeURIComponent(key)}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('not found');
    enter(await response.json());
  }

  count('visit');
  const saved = readKey();
  if (saved) {
    card.hidden = true;
    enterByKey(saved).catch(() => { card.hidden = false; });
  }

  emailForm.addEventListener('submit', async event => {
    event.preventDefault();
    const button = emailForm.querySelector('button');
    if (button.disabled) return;
    emailError.hidden = true;
    const email = emailInput.value.trim().toLowerCase();
    if (!validEmail(email)) return say(emailError, 'Vui lòng nhập địa chỉ email hợp lệ (ví dụ: ban@gmail.com).');
    button.disabled = true;
    try {
      const response = await fetch('/api/webinar-program/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Hệ thống đang bận. Vui lòng thử lại.');
      if (data.found) return await enterByKey(data.key);
      emailForm.hidden = true;
      form.hidden = false;
      form.elements.name.focus();
    } catch (err) { say(emailError, err.message === 'not found' ? 'Chưa mở được thông tin đăng ký. Vui lòng thử lại.' : err.message); }
    button.disabled = false;
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('button');
    if (button.disabled) return;
    error.hidden = true;
    const name = form.elements.name.value.trim();
    const phone = form.elements.phone.value.trim();
    if (!name) return say(error, 'Vui lòng nhập họ và tên.');
    if (!validPhone(phone)) return say(error, 'Vui lòng nhập số điện thoại hợp lệ (9–11 chữ số).');
    button.disabled = true;
    try {
      const data = await register({ name, phone, email: emailInput.value.trim().toLowerCase() });
      if (!data.duplicate) await count('registered');
      if (data.cohort?.key) return enter(data.cohort);
      location.assign('/webinar-dong-tien/thank-you');
    } catch (err) {
      say(error, err.message);
      button.disabled = false;
    }
  });
})();
