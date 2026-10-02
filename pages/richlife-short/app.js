'use strict';
(() => {
  // Một iframe Vimeo trong khung; thay iframe là dừng video cũ (kể cả tiếng).
  function playVimeo(frame, videoId, title) {
    const iframe = document.createElement('iframe');
    iframe.src = `https://player.vimeo.com/video/${videoId}?autoplay=1`;
    iframe.title = title;
    iframe.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.replaceChildren(iframe);
  }

  // Video giới thiệu lợi ích: chưa có ID thì giữ khung chờ, không bấm được.
  const intro = document.querySelector('#intro-video');
  const introCover = intro.querySelector('.video-cover');
  if (intro.dataset.videoId) {
    introCover.addEventListener('click', () => {
      window.RichlifeTracking?.track('video_play', { position: 'intro', video_id: intro.dataset.videoId });
      playVimeo(intro, intro.dataset.videoId, 'Video giới thiệu workshop Richlife');
    });
  } else {
    introCover.disabled = true;
    const caption = introCover.querySelector('.video-caption');
    if (caption) caption.textContent = 'Video giới thiệu sắp được cập nhật';
  }

  // Cảm nhận học viên: khung lớn hiện ảnh bìa video đầu tiên, bấm thẻ nào phát thẻ đó.
  const player = document.querySelector('#testimonial-player');
  const nameBox = document.querySelector('#testimonial-name');
  const cards = Array.from(document.querySelectorAll('.testimonial-card'));
  function select(card, play) {
    cards.forEach(item => item.setAttribute('aria-pressed', String(item === card)));
    nameBox.textContent = card.dataset.name;
    if (play) {
      window.RichlifeTracking?.track('video_play', { position: 'testimonial', video_id: card.dataset.videoId });
      playVimeo(player, card.dataset.videoId, `Video chia sẻ của ${card.dataset.name}`);
      return;
    }
    const cover = document.createElement('button');
    cover.type = 'button';
    cover.className = 'video-cover';
    cover.setAttribute('aria-label', `Phát video chia sẻ của ${card.dataset.name}`);
    cover.style.background = `center / cover no-repeat url("${card.querySelector('img').src}")`;
    cover.innerHTML = '<span class="video-play" aria-hidden="true">▶</span>';
    cover.addEventListener('click', () => select(card, true));
    player.replaceChildren(cover);
  }
  cards.forEach(card => card.addEventListener('click', () => {
    select(card, true);
    if (player.getBoundingClientRect().top < 56) player.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }));
  if (cards.length) select(cards[0], false);

  // Form đăng ký: cùng luồng với richlife-medium (cùng trang cảm ơn /richlife/thank-you).
  const form = document.querySelector('#registration-form');
  const error = document.querySelector('#form-error');
  const button = form.querySelector('button');
  const buttonLabel = button.textContent;
  function showError(message, field) {
    error.textContent = message;
    error.hidden = false;
    field?.focus();
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (button.disabled || form.elements.website.value) return;
    error.hidden = true;
    const name = form.elements.name.value.trim();
    const phone = form.elements.phone.value.trim();
    const email = form.elements.email.value.trim().toLowerCase();
    if (!name) return showError('Vui lòng nhập họ và tên.', form.elements.name);
    if (!/^[+\d\s().-]+$/.test(phone) || !/^\d{9,11}$/.test(phone.replace(/\D/g, ''))) {
      return showError('Vui lòng nhập số điện thoại hợp lệ (9–11 chữ số).', form.elements.phone);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email)) {
      return showError('Vui lòng nhập địa chỉ email hợp lệ (ví dụ: ban@email.com).', form.elements.email);
    }
    window.RichlifeTracking?.track('form_submit');
    button.disabled = true;
    button.textContent = 'Đang gửi…';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch('/api/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ ...window.RichlifeTracking?.context(), name, phone, email, region: 'Online', attendance: 'RichLife',
          page_id: 'richlife-short', event_source_url: location.href, value: 0, currency: 'VND' })
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Chưa gửi được đăng ký. Vui lòng thử lại.');
      try { await window.RichlifeTracking?.registered(data); } catch {}
      try { sessionStorage.setItem('richlife:email', email); } catch {}
      location.assign('/richlife/thank-you?registered=1');
    } catch (err) {
      showError(err.name === 'AbortError'
        ? 'Chưa nhận được xác nhận từ máy chủ. Vui lòng liên hệ 0862 421 919 để kiểm tra đăng ký trước khi gửi lại.'
        : 'Chưa hoàn tất đăng ký. Vui lòng kiểm tra kết nối và thử lại, hoặc liên hệ 0862 421 919.');
      button.disabled = false;
      button.textContent = buttonLabel;
    } finally { clearTimeout(timer); }
  });
})();
