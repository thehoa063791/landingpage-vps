'use strict';
// Thank-you page, same behaviour as pages/richlife/thank-you.js: a fresh
// registration (?registered=1) gets a congratulation line and short fireworks.
// Leads must confirm their email before the congratulation mail is sent, so
// the page points them at the inbox they typed on the form.
(() => {
  const params = new URLSearchParams(location.search);
  const successful = params.get('registered') === '1';

  let email = '';
  try { email = sessionStorage.getItem('richlife-live:email') || ''; } catch {}
  if (email) document.querySelector('#confirm-email').textContent = email;

  if (successful) {
    document.querySelector('#confirmation-note').textContent =
      'Chúng tôi đã nhận được thông tin của bạn. Bạn chỉ cần xác nhận email là hoàn tất đăng ký và giữ chỗ tham dự.';
    params.delete('registered');
    const query = params.toString();
    history.replaceState(null, '', location.pathname + (query ? '?' + query : ''));
  }
  if (!successful || matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // Short, silent fireworks. The overlay never intercepts clicks.
  const canvas = document.createElement('canvas');
  canvas.className = 'celebration-fireworks';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.append(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) { canvas.remove(); return; }
  let width, height;
  function resize() {
    width = innerWidth;
    height = innerHeight;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);
  const colors = ['#0B3D91', '#15803D', '#50b981', '#77b2ef', '#d8ad50'];
  const particles = [];
  const started = performance.now();
  let nextBurst = 0;
  let previous = started;
  function animate(now) {
    const age = now - started;
    const step = Math.min((now - previous) / 16.67, 2);
    previous = now;
    ctx.clearRect(0, 0, width, height);
    if (age >= nextBurst && age < 2600) {
      nextBurst = age + 430;
      const x = width * (0.12 + Math.random() * 0.76);
      const y = height * (0.12 + Math.random() * 0.34);
      for (let i = 0; i < 45; i++) {
        const angle = Math.PI * 2 * i / 45;
        const speed = 1.8 + Math.random() * 3.2;
        particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1, color: colors[i % colors.length] });
      }
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * step;
      p.y += p.vy * step;
      p.vy += 0.045 * step;
      p.life -= 0.013 * step;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    if (age < 4500) requestAnimationFrame(animate);
    else { window.removeEventListener('resize', resize); canvas.remove(); }
  }
  requestAnimationFrame(animate);
})();
