'use strict';
(() => {
  const section = document.querySelector('#chia-se-hoc-vien');
  if (!section) return;
  const strip = section.querySelector('.testimonial-strip');
  const group = section.querySelector('.testimonial-group');
  const cards = Array.from(group.querySelectorAll('.testimonial-card'));
  const player = section.querySelector('#testimonial-player');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = matchMedia('(max-width: 760px)');
  let selected = 0;
  let paused = reduced.matches;
  let hovering = false;
  let focused = false;
  let visible = false;
  let frame = 0;
  let lastTime = 0;
  // A second, non-tabbed copy makes the right-to-left loop continuous.
  const copy = group.cloneNode(true);
  copy.setAttribute('aria-hidden', 'true');
  copy.querySelectorAll('button').forEach(button => button.tabIndex = -1);
  section.querySelector('.testimonial-track').append(copy);
  const allCards = Array.from(strip.querySelectorAll('.testimonial-card'));

  function updateMotion() {
    cancelAnimationFrame(frame);
    lastTime = 0;
    // Mobile uses a CSS marquee (more reliable than scrollLeft on touch browsers).
    if (!mobile.matches && !paused && !hovering && !focused && visible && !document.hidden) frame = requestAnimationFrame(tick);
  }
  function tick(time) {
    if (lastTime) {
      strip.scrollLeft += Math.min(time - lastTime, 50) * 0.035;
      const loopWidth = group.getBoundingClientRect().width;
      if (loopWidth && strip.scrollLeft >= loopWidth) strip.scrollLeft -= loopWidth;
    }
    lastTime = time;
    frame = requestAnimationFrame(tick);
  }
  function play(index) {
    selected = (index + cards.length) % cards.length;
    const { videoId, name } = cards[selected].dataset;
    const iframe = document.createElement('iframe');
    iframe.src = `https://player.vimeo.com/video/${videoId}`;
    iframe.title = `Video chia sẻ của ${name}`;
    iframe.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    // Replacing the iframe stops the previous video, including its audio.
    player.replaceChildren(iframe);
    section.querySelector('#testimonial-name').textContent = name;
    const externalLink = section.querySelector('#testimonial-vimeo-link');
    if (externalLink) externalLink.href = `https://vimeo.com/${videoId}`;
    allCards.forEach(card => card.setAttribute('aria-pressed', String(card.dataset.videoId === videoId)));
    updateMotion();
  }
  player.querySelector('button').addEventListener('click', () => play(selected));
  allCards.forEach(card => card.addEventListener('click', () => {
    play(cards.findIndex(original => original.dataset.videoId === card.dataset.videoId));
  }));
  section.querySelector('#testimonial-prev').addEventListener('click', () => play(selected - 1));
  section.querySelector('#testimonial-next').addEventListener('click', () => play(selected + 1));
  strip.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') { hovering = true; updateMotion(); } });
  strip.addEventListener('pointerleave', () => { hovering = false; updateMotion(); });
  strip.addEventListener('pointerdown', event => { if (event.pointerType !== 'mouse') { hovering = true; updateMotion(); } });
  strip.addEventListener('pointerup', () => { hovering = false; updateMotion(); });
  strip.addEventListener('pointercancel', () => { hovering = false; updateMotion(); });
  strip.addEventListener('focusin', () => { focused = true; updateMotion(); });
  strip.addEventListener('focusout', event => { focused = strip.contains(event.relatedTarget); updateMotion(); });
  strip.addEventListener('keydown', event => {
    if (event.target !== strip || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    strip.scrollLeft += (event.key === 'ArrowRight' ? 1 : -1) * 240;
  });
  document.addEventListener('visibilitychange', updateMotion);
  reduced.addEventListener('change', () => { paused = reduced.matches; updateMotion(); });
  mobile.addEventListener?.('change', updateMotion);
  new IntersectionObserver(entries => { visible = entries[0].isIntersecting; updateMotion(); }).observe(section);
  updateMotion();
})();

