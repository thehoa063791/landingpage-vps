'use strict';
(() => {
  const { register, validPhone, validEmail, dayMonth, clock, moment } = window.WebinarFunnel;
  const form = document.querySelector('#registration-form');
  const error = document.querySelector('#form-error');
  const button = form.querySelector('button[type="submit"]');
  const label = button.textContent;

  // The evenings of the group now taking registrations, as set in admin.
  fetch('/api/webinar-program/config', { cache: 'no-store' }).then(response => response.ok ? response.json() : null).then(config => {
    if (!config?.sessions?.length) return;
    // Each session keeps its own hour (they come from EverWebinar), so the summary names the evenings.
    const days = `${config.sessions.map(s => dayMonth(s.at).slice(0, 2)).join(', ')}/${dayMonth(config.sessions[0].at).slice(3)}`;
    const hours = [...new Set(config.sessions.map(s => clock(s.at)))];
    // Two phrases that never split inside: "4 buổi tối 16, 17, 18, 19/11," and "từ 20:00, online".
    const keep = text => Object.assign(document.createElement('span'), { className: 'nb', textContent: text.replace(/ /g, ' ') });
    document.querySelector('#schedule-summary').replaceChildren(
      keep(`${config.sessions.length} buổi tối ${days},`), ' ',
      keep(hours.length === 1 ? `từ ${hours[0]}, online` : 'online'));
    const info = document.querySelector('#info-schedule');
    if (info) info.textContent = hours.length === 1 ? `Các tối ${days}, từ ${hours[0]}` : `Các tối ${days}`;
    for (const s of config.sessions) {
      const slot = document.querySelector(`[data-session="${s.position}"]`);
      if (slot) slot.textContent = moment(s.at).replace(/ /g, ' ');
    }
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
    const region = form.elements.region.value;
    if (!name) return show('Vui lòng nhập họ và tên.', form.elements.name);
    if (!validPhone(phone)) return show('Vui lòng nhập số điện thoại hợp lệ (9–11 chữ số).', form.elements.phone);
    if (!validEmail(email)) return show('Vui lòng nhập địa chỉ email hợp lệ (ví dụ: ban@gmail.com).', form.elements.email);
    if (!region) return show('Vui lòng chọn khu vực.', form.elements.region);
    window.WebinarTracking?.track('form_submit');
    button.disabled = true;
    button.textContent = 'Đang gửi…';
    try {
      const data = await register({ name, phone, email, region });
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

// Testimonials: the large frame shows the first video's cover; a name (or an arrow) plays that
// person's video. Replacing the iframe stops the one before (sound included).
(() => {
  const player = document.querySelector('#testimonial-player');
  const cards = Array.from(document.querySelectorAll('.testimonial-card'));
  if (!player || !cards.length) return;
  let current = 0;
  function play(card) {
    const iframe = document.createElement('iframe');
    iframe.src = `https://player.vimeo.com/video/${card.dataset.videoId}?autoplay=1`;
    iframe.title = `Video chia sẻ của ${card.dataset.name}`;
    iframe.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    player.replaceChildren(iframe);
    window.WebinarTracking?.track('video_play', { position: 'testimonial', video_id: card.dataset.videoId });
  }
  function select(index, start) {
    current = (index + cards.length) % cards.length;
    const card = cards[current];
    cards.forEach(item => item.setAttribute('aria-selected', String(item === card)));
    if (start) return play(card);
    const cover = document.createElement('button');
    cover.type = 'button';
    cover.className = 'testimonial-cover';
    cover.setAttribute('aria-label', `Phát video chia sẻ của ${card.dataset.name}`);
    cover.style.backgroundImage = `url("${card.dataset.thumb}")`;
    cover.innerHTML = '<span class="play" aria-hidden="true"></span>';
    cover.addEventListener('click', () => select(current, true));
    player.replaceChildren(cover);
  }
  cards.forEach((card, i) => card.addEventListener('click', () => select(i, true)));
  document.querySelectorAll('.switch-arrow').forEach(arrow => arrow.addEventListener('click', () => select(current + Number(arrow.dataset.step), true)));
  select(0, false);
})();

// "Đăng ký" links: on a phone the form sits below the benefits, so go straight to the form
// card; on wider screens the section's top already shows both side by side.
document.querySelectorAll('a[href="#dang-ky"]').forEach(link => link.addEventListener('click', event => {
  if (!window.matchMedia('(max-width: 833px)').matches) return;
  const card = document.querySelector('#dang-ky .signup');
  if (!card) return;
  event.preventDefault();
  card.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  history.replaceState(null, '', '#dang-ky');
}));

// Motion (html.motion is set in <head> only when reduced motion is not asked for): the hero
// plays its entrance once the page is painted; each evening's photo opens when it scrolls in.
(() => {
  if (!document.documentElement.classList.contains('motion')) return;
  const hero = document.querySelector('.hero');
  requestAnimationFrame(() => requestAnimationFrame(() => hero?.classList.add('in')));
  const days = document.querySelectorAll('.day');
  if (!('IntersectionObserver' in window)) { days.forEach(day => day.classList.add('in')); return; }
  const watch = new IntersectionObserver(entries => entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add('in');
    watch.unobserve(entry.target);
  }), { rootMargin: '0px 0px -12% 0px', threshold: 0.2 });
  days.forEach(day => watch.observe(day));
})();
