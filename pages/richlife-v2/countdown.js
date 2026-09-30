'use strict';
(() => {
  const root = document.querySelector('[data-countdown-target]');
  if (!root) return;
  const target = Date.parse(root.dataset.countdownTarget);
  if (!Number.isFinite(target)) return;
  const fields = ['days', 'hours', 'minutes', 'seconds'].map(unit => root.querySelector(`[data-countdown="${unit}"]`));
  let timer;
  function update() {
    const remaining = Math.max(0, Math.ceil((target - Date.now()) / 1000));
    const values = [Math.floor(remaining / 86400), Math.floor(remaining / 3600) % 24, Math.floor(remaining / 60) % 60, remaining % 60];
    fields.forEach((field, index) => { field.textContent = String(values[index]).padStart(2, '0'); });
    root.querySelector('.countdown-ended').hidden = remaining > 0;
    if (remaining === 0) clearInterval(timer);
  }
  timer = setInterval(update, 1000);
  update();
  document.addEventListener('visibilitychange', update);
})();
