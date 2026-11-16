'use strict';
(() => {
  const motion = document.documentElement.classList.contains('motion');

  // Intro, the page's one authored moment (after capheroasters.com): on every load at the top of
  // the page, RICHLIFE is drawn large (at most 70% of the screen wide) over a
  // veil the page shows through; it warms from pale to bright gold, holds a beat, then snaps down
  // into the logo in the top bar, and the menu comes in after it. The <head> script set
  // html.intro so the first paint already has the veil and no logo (no flash).
  const root = document.documentElement;
  const logo = document.querySelector('.topbar .logo-mark');
  function finishIntro() { root.classList.remove('intro', 'intro-lift'); root.classList.add('intro-done'); }
  if (root.classList.contains('intro') && logo && 'animate' in logo) {
    const run = () => {
      const box = logo.getBoundingClientRect();
      const word = logo.cloneNode(true);
      word.classList.add('intro-word');
      word.setAttribute('aria-hidden', 'true');
      document.body.append(word);
      // Drawn large (crisp); at most 70% of the screen wide and 16% tall, and its centre sits on the logo's centre.
      const base = parseFloat(getComputedStyle(logo).fontSize);
      const scale = Math.max(1, Math.min(innerWidth * 0.7 / box.width, innerHeight * 0.16 / box.height));
      word.style.fontSize = `${base * scale}px`;
      const big = word.getBoundingClientRect();
      word.style.left = `${box.left + box.width / 2 - big.width / 2}px`;
      word.style.top = `${box.top + box.height / 2 - big.height / 2}px`;
      // Big: centred across, a little above the middle of the screen.
      const dx = innerWidth / 2 - (box.left + box.width / 2);
      const dy = innerHeight * 0.4 - (box.top + box.height / 2);
      const at = `translate(${dx}px, ${dy}px) scale(1)`;
      const timing = { duration: 1500, fill: 'forwards' };
      word.animate([
        { transform: at, color: '#ecd9a4', opacity: 0, easing: 'ease-out' },
        { transform: at, color: '#ecd9a4', opacity: 1, offset: 0.12 },
        { transform: at, color: '#d4ae5c', offset: 0.42, easing: 'cubic-bezier(.76, 0, .24, 1)' },
        { transform: at, color: '#d4ae5c', offset: 0.6, easing: 'cubic-bezier(.76, 0, .24, 1)' },
        { transform: `translate(0, 0) scale(${1 / scale})`, color: '#d4ae5c' },
      ], timing).finished.catch(() => {}).then(() => { word.remove(); finishIntro(); });
      // The veil lifts while the word shrinks.
      setTimeout(() => root.classList.add('intro-lift'), 900);
    };
    // Measure with the real font; never wait more than 1.2 s for it.
    Promise.race([document.fonts?.ready, new Promise(r => setTimeout(r, 1200))]).then(() => requestAnimationFrame(run));
  } else finishIntro();

  // The four questions: tick the ones you can already answer.
  const checks = [...document.querySelectorAll('.questions input')];
  const score = document.getElementById('score');
  const scoreText = document.getElementById('score-text');
  const SCORE_TEXT = [
    'Phần lớn chúng ta đều chưa có câu trả lời rõ ràng. Richlife bắt đầu từ chính những câu hỏi này.',
    'Phần lớn chúng ta đều chưa có câu trả lời rõ ràng. Richlife bắt đầu từ chính những câu hỏi này.',
    'Bạn đã có một phần nền tảng. Hãy biến những câu còn lại thành kế hoạch.',
    'Bạn đã có một phần nền tảng. Hãy biến những câu còn lại thành kế hoạch.',
    'Rất tốt. Richlife giúp bạn kiểm tra lại và phát triển kế hoạch đó.',
  ];
  checks.forEach(box => box.addEventListener('change', () => {
    const n = checks.filter(item => item.checked).length;
    score.textContent = n;
    scoreText.textContent = SCORE_TEXT[n];
  }));

  // A floating sign-up button once the hero is past, hidden again at the form.
  const floatCta = document.querySelector('.float-cta');
  const hero = document.querySelector('.hero');
  const finalSection = document.getElementById('dang-ky');
  if (floatCta && hero && finalSection && 'IntersectionObserver' in window) {
    const seen = { hero: true, final: false };
    const update = () => floatCta.classList.toggle('on', !seen.hero && !seen.final);
    new IntersectionObserver(([entry]) => { seen.hero = entry.isIntersecting; update(); }).observe(hero);
    new IntersectionObserver(([entry]) => { seen.final = entry.isIntersecting; update(); }).observe(finalSection);
  }

  // Voices. The large frame shows the first video's cover; a card plays its video.
  function playVimeo(frame, videoId, title) {
    const iframe = document.createElement('iframe');
    iframe.src = `https://player.vimeo.com/video/${videoId}?autoplay=1`;
    iframe.title = title;
    iframe.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.replaceChildren(iframe);
  }
  const player = document.getElementById('testimonial-player');
  const nameBox = document.getElementById('testimonial-name');
  const cards = [...document.querySelectorAll('.voice')];
  function select(card, play) {
    cards.forEach(item => item.setAttribute('aria-pressed', String(item === card)));
    nameBox.textContent = card.dataset.name;
    if (play) {
      window.RichlifeTracking?.track('video_play', { position: 'testimonial', video_id: card.dataset.videoId });
      return playVimeo(player, card.dataset.videoId, `Video chia sẻ của ${card.dataset.name}`);
    }
    const cover = document.createElement('button');
    cover.type = 'button';
    cover.className = 'video-cover';
    cover.setAttribute('aria-label', `Phát video chia sẻ của ${card.dataset.name}`);
    cover.style.backgroundImage = `url("${card.querySelector('img').src}")`;
    cover.innerHTML = '<span class="video-play" aria-hidden="true"></span>';
    cover.addEventListener('click', () => select(card, true));
    player.replaceChildren(cover);
  }
  cards.forEach(card => card.addEventListener('click', () => select(card, true)));
  if (cards.length) select(cards[0], false);

  // Registration: the shared lead pipeline, then the Richlife thank-you page.
  const form = document.getElementById('registration-form');
  const error = document.getElementById('form-error');
  const button = form.querySelector('button');
  const label = button.textContent;
  const fields = [form.elements.name, form.elements.phone, form.elements.email];
  fields.forEach(field => {
    field.setAttribute('aria-describedby', 'form-error');
    field.addEventListener('input', () => field.removeAttribute('aria-invalid'));
  });
  function show(message, field) {
    error.textContent = message;
    error.hidden = false;
    field?.setAttribute('aria-invalid', 'true');
    field?.focus();
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (button.disabled || form.elements.website.value) return;
    error.hidden = true;
    fields.forEach(field => field.removeAttribute('aria-invalid'));
    const name = form.elements.name.value.trim();
    const phone = form.elements.phone.value.trim();
    const email = form.elements.email.value.trim().toLowerCase();
    if (!name) return show('Vui lòng nhập họ và tên.', form.elements.name);
    if (!/^[+\d\s().-]+$/.test(phone) || !/^\d{9,11}$/.test(phone.replace(/\D/g, ''))) return show('Vui lòng nhập số điện thoại hợp lệ (9–11 chữ số).', form.elements.phone);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email)) return show('Vui lòng nhập địa chỉ email hợp lệ (ví dụ: ban@gmail.com).', form.elements.email);
    window.RichlifeTracking?.track('form_submit');
    button.disabled = true;
    button.textContent = 'Đang gửi…';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch('/api/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ ...window.RichlifeTracking?.context(), name, phone, email, region: 'Online', attendance: 'RichLife',
          page_id: 'richlife-plan', event_source_url: location.href, value: 0, currency: 'VND' }),
      });
      const data = await response.json().catch(() => ({}));
      if (data.code === 'email_invalid') throw Object.assign(new Error(data.suggestion ? `${data.message} Có phải bạn muốn nhập ${data.suggestion}?` : data.message), { field: 'email' });
      if (!response.ok || !data.success) throw new Error('Chưa hoàn tất đăng ký. Vui lòng kiểm tra kết nối và thử lại, hoặc liên hệ 086 242 1919.');
      try { await window.RichlifeTracking?.registered(data); } catch {}
      try { sessionStorage.setItem('richlife:email', email); } catch {}
      location.assign('/richlife/thank-you?registered=1');
    } catch (err) {
      show(err.name === 'AbortError'
        ? 'Chưa nhận được xác nhận từ máy chủ. Vui lòng liên hệ 086 242 1919 để kiểm tra đăng ký trước khi gửi lại.'
        : err.message, err.field === 'email' ? form.elements.email : null);
      button.disabled = false;
      button.textContent = label;
    } finally { clearTimeout(timer); }
  });
})();
