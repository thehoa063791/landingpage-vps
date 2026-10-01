'use strict';
(() => {
  const sticky = document.querySelector('.mobile-cta');
  let heroVisible = true;
  let formVisible = false;
  let footerVisible = false;
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.target.id === 'hero') heroVisible = entry.isIntersecting;
      if (entry.target.id === 'dang-ky') formVisible = entry.isIntersecting;
      if (entry.target.tagName === 'FOOTER') footerVisible = entry.isIntersecting;
    });
    sticky.hidden = heroVisible || formVisible || footerVisible;
  });
  observer.observe(document.querySelector('#hero'));
  observer.observe(document.querySelector('#dang-ky'));
  observer.observe(document.querySelector('footer'));
  document.querySelectorAll('a[href="#bao-mat"]').forEach(link => link.addEventListener('click', () => {
    document.querySelector('#bao-mat').open = true;
  }));
  const form = document.querySelector('#registration-form');
  const error = document.querySelector('#form-error');
  const button = form.querySelector('button');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (button.disabled || form.elements.website.value) return;
    error.hidden = true;
    const name = form.elements.name.value.trim();
    const phone = form.elements.phone.value.trim();
    const email = form.elements.email.value.trim().toLowerCase();
    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email);
    if (!name || !/^[+\d\s().-]+$/.test(phone) || !/^\d{9,11}$/.test(phone.replace(/\D/g, ''))) {
      error.textContent = 'Vui lòng nhập họ tên và số điện thoại hợp lệ (9–11 chữ số).';
      error.hidden = false;
      return;
    }
    if (!emailValid) {
      error.textContent = 'Vui lòng nhập địa chỉ email hợp lệ (ví dụ: ban@email.com).';
      error.hidden = false;
      form.elements.email.focus();
      return;
    }
    if (!form.reportValidity()) return;
    const region = form.elements.region.value;
    if (region !== 'Online') return;
    window.RichlifeTracking?.track('form_submit');
    button.disabled = true;
    button.textContent = 'Đang gửi đăng ký…';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const query = new URLSearchParams(location.search);
      const attribution = {};
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid'].forEach(key => {
        if (query.has(key)) attribution[key] = query.get(key);
      });
      const response = await fetch('/api/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ ...attribution, ...window.RichlifeTracking?.context(), name, phone, email, region, attendance: 'RichLife',
          page_id: 'richlife-short', event_source_url: location.href, value: 0, currency: 'VND' })
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Chưa gửi được đăng ký. Vui lòng thử lại.');
      try { await window.RichlifeTracking?.registered(data); } catch {}
      try { sessionStorage.setItem('richlife:email', email); } catch {}
      location.assign('/richlife/thank-you?registered=1');
    } catch (err) {
      error.textContent = err.name === 'AbortError'
        ? 'Chưa nhận được xác nhận từ máy chủ. Vui lòng liên hệ 0862 421 919 để kiểm tra đăng ký trước khi gửi lại.'
        : 'Chưa hoàn tất đăng ký. Vui lòng kiểm tra kết nối và thử lại, hoặc liên hệ 0862 421 919.';
      error.hidden = false;
      button.disabled = false;
      button.textContent = 'Giữ chỗ miễn phí ↗';
    } finally { clearTimeout(timer); }
  });
})();
