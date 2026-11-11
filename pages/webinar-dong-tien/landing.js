'use strict';
(() => {
  const { register, validPhone, validEmail, dayMonth, clock } = window.WebinarFunnel;
  const form = document.querySelector('#registration-form');
  const error = document.querySelector('#form-error');
  const button = form.querySelector('button[type="submit"]');
  const label = button.textContent;

  // The evenings of the group now taking registrations, as set in admin.
  fetch('/api/webinar-program/config', { cache: 'no-store' }).then(response => response.ok ? response.json() : null).then(config => {
    if (!config?.sessions?.length) return;
    const days = config.sessions.map(s => dayMonth(s.at).slice(0, 2)).join(', ');
    document.querySelector('#schedule-summary').replaceChildren(
      `Thời gian: ${config.sessions.length} buổi liên tục`, document.createElement('br'),
      `Từ ${clock(config.sessions[0].at)} các ngày ${days}/${dayMonth(config.sessions[0].at).slice(3)}`, document.createElement('br'),
      'Hình thức: Online');
  }).catch(() => {});

  function show(message, field) {
    error.textContent = message;
    error.hidden = false;
    field?.focus();
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (button.disabled || form.elements.wd_hp.value) return;
    error.hidden = true;
    const name = form.elements.name.value.trim();
    const phone = form.elements.phone.value.trim();
    const email = form.elements.email.value.trim().toLowerCase();
    if (!name) return show('Vui lòng nhập họ và tên.', form.elements.name);
    if (!validPhone(phone)) return show('Vui lòng nhập số điện thoại hợp lệ (9–11 chữ số).', form.elements.phone);
    if (!validEmail(email)) return show('Vui lòng nhập địa chỉ email hợp lệ (ví dụ: ban@gmail.com).', form.elements.email);
    window.WebinarTracking?.track('form_submit');
    button.disabled = true;
    button.textContent = 'Đang gửi…';
    try {
      const data = await register({ name, phone, email });
      // The thank-you page says this email had registered before (same schedule, or a new one).
      try { sessionStorage.setItem('webinar-dong-tien:repeat', data.duplicate ? (data.cohort?.new_seat ? 'new' : 'same') : ''); } catch {}
      location.assign('/webinar-dong-tien/thank-you');
    } catch (err) {
      show(err.message, err.field === 'email' ? form.elements.email : null);
      button.disabled = false;
      button.textContent = label;
    }
  });
})();
