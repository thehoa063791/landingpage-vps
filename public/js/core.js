/* ═══════════════════════════════════════════════════════════════
   CORE.JS – Shared engine cho mọi landing page
   Mỗi page tự định nghĩa window.PAGE_CONFIG trước khi load file này.

   window.PAGE_CONFIG = {
     pageId:          'ten-page',      // bắt buộc – dùng để phân biệt page trong analytics
     countdownHours:  23,              // tuỳ chọn – số giờ đếm ngược (default 23)
     successMessage:  '...',          // tuỳ chọn – override thông báo sau đăng ký
     onSuccess:       function(data){} // tuỳ chọn – callback sau khi đăng ký thành công
   }
═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ── PAGE CONFIG ─────────────────────────────────────────────
  const CFG = window.PAGE_CONFIG || {};
  const PAGE_ID         = CFG.pageId         || 'default';
  const COUNTDOWN_HOURS = CFG.countdownHours || 23;
  const SOCIAL_PROOF    = CFG.socialProof !== false;

  // ── Session ID (per tab, isolated per page) ─────────────────
  const SESSION_KEY = '_sid_' + PAGE_ID;
  let sessionId = sessionStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = 'sid_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem(SESSION_KEY, sessionId);
  }
  window._sessionId = sessionId;

  // ── Pixel ID (cho manual advanced matching) ──────────────────
  let _metaPixelId = '';
  fetch('/api/meta-config').then(function(r) { return r.json(); }).then(function(c) {
    if (c && c.enabled && c.pixel_id) _metaPixelId = c.pixel_id;
  }).catch(function() {});

  // Strip dấu tiếng Việt → ASCII lowercase (dùng cho ct, fn, ln gửi fbq init)
  function _normForPixel(str) {
    return String(str || '')
      .replace(/đ/g, 'd').replace(/Đ/g, 'd')
      .toLowerCase()
      .normalize('NFD')
      .split('').filter(function(c) { var cp = c.charCodeAt(0); return cp < 0x0300 || cp > 0x036f; }).join('')
      .replace(/[^a-z0-9 ]/g, '')
      .trim();
  }

  // ── UTM & Click IDs từ URL ──────────────────────────────────
  const urlParams = new URLSearchParams(window.location.search);

  function getCookie(name) {
    const m = document.cookie.match('(?:^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
    return m ? decodeURIComponent(m[1]) : '';
  }

  function generateEventId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'evt_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
  }

  function getOrCreateEventId(name) {
    const key = `_fb_${PAGE_ID}_${name}_event_id`;
    let eventId = sessionStorage.getItem(key);
    if (!eventId) {
      eventId = generateEventId();
      sessionStorage.setItem(key, eventId);
    }
    return eventId;
  }

  function getFbc() {
    const existing = getCookie('_fbc') || sessionStorage.getItem('fbc') || '';
    if (existing) return existing;
    if (!fbclid) return '';
    const fbc = `fb.1.${Date.now()}.${fbclid}`;
    document.cookie = `_fbc=${encodeURIComponent(fbc)}; max-age=${90 * 24 * 60 * 60}; path=/; SameSite=Lax`;
    return fbc;
  }

  function getFbp() {
    const existing = getCookie('_fbp') || sessionStorage.getItem('fbp') || '';
    if (existing) return existing;
    const randomValue = Math.floor(Math.random() * 2147483647);
    const fbp = `fb.1.${Date.now()}.${randomValue}`;
    document.cookie = `_fbp=${encodeURIComponent(fbp)}; max-age=${90 * 24 * 60 * 60}; path=/; SameSite=Lax`;
    return fbp;
  }

  const fbclid = urlParams.get('fbclid') || '';

  const utmData = {
    utm_source:   urlParams.get('utm_source')   || sessionStorage.getItem('utm_source')   || '',
    utm_medium:   urlParams.get('utm_medium')   || sessionStorage.getItem('utm_medium')   || '',
    utm_campaign: urlParams.get('utm_campaign') || sessionStorage.getItem('utm_campaign') || '',
    utm_content:  urlParams.get('utm_content')  || sessionStorage.getItem('utm_content')  || '',
    utm_term:     urlParams.get('utm_term')     || sessionStorage.getItem('utm_term')     || '',
    referrer:     document.referrer || ''
  };

  const clickIds = {
    fbclid:  fbclid  || sessionStorage.getItem('fbclid')  || '',
    gclid:   urlParams.get('gclid')   || sessionStorage.getItem('gclid')   || '',
    ttclid:  urlParams.get('ttclid')  || sessionStorage.getItem('ttclid')  || '',
    msclkid: urlParams.get('msclkid') || sessionStorage.getItem('msclkid') || '',
    twclid:  urlParams.get('twclid')  || sessionStorage.getItem('twclid')  || ''
  };

  const pixelCookies = {
    fbc: getFbc(),
    fbp: getFbp(),
    ga:  getCookie('_ga')  || ''
  };

  Object.entries(utmData).forEach(([k, v])      => v && sessionStorage.setItem(k, v));
  Object.entries(clickIds).forEach(([k, v])     => v && sessionStorage.setItem(k, v));
  Object.entries(pixelCookies).forEach(([k, v]) => v && sessionStorage.setItem(k, v));

  // ── fbq helper (retry tối đa retries × 500ms để chờ GTM load) ──
  const META_STANDARD_EVENTS = new Set(['PageView', 'ViewContent', 'CompleteRegistration']);
  function fireFbq(eventName, params, options, retries) {
    if (typeof fbq !== 'undefined') {
      fbq(META_STANDARD_EVENTS.has(eventName) ? 'track' : 'trackCustom', eventName, params, options);
      console.log('[Pixel]', eventName, 'fired, eventID:', options.eventID);
    } else if (retries > 0) {
      setTimeout(function () { fireFbq(eventName, params, options, retries - 1); }, 500);
    } else {
      console.warn('[Pixel]', eventName, '– fbq not available after retry');
    }
  }
  window._fireFbq = fireFbq;

  // ── Track helper ─────────────────────────────────────────────
  window._track = function (event, data) {
    const payload = JSON.stringify({
      event,
      session_id: sessionId,
      data: { page_id: PAGE_ID, ...(data || {}) }
    });
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/track', new Blob([payload], { type: 'application/json' }));
    } else {
      fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => {});
    }
  };

  // Pageview
  const pageViewEventId = getOrCreateEventId('pageview');
  window.__META_PAGEVIEW_EVENT_ID = pageViewEventId;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event: 'meta_page_view_id_ready',
    event_id: pageViewEventId,
    page_id: PAGE_ID
  });
  window._track('pageview', {
    url: location.href,
    title: document.title,
    event_id: pageViewEventId,
    ...utmData,
    ...clickIds,
    fbc: pixelCookies.fbc,
    fbp: pixelCookies.fbp
  });

  // ── Seats counter ─────────────────────────────────────────────
  async function loadSeats() {
    try {
      const res = await fetch(`/api/seats?page=${PAGE_ID}`);
      const d   = await res.json();

      const msg = '🔥 Số lượng có giới hạn – đăng ký sớm!';

      _q('seatsText',        el => el.textContent = msg);
      _q('registerSeatsText',el => el.textContent = msg);
      _q('seatsProgress',    el => el.style.width = '60%');
    } catch {
      _q('seatsText', el => el.textContent = '🔥 Số lượng có giới hạn – đăng ký sớm!');
    }
  }
  loadSeats();

  // ── Countdown timer ───────────────────────────────────────────
  function startCountdown() {
    const KEY = `_cd_end_${PAGE_ID}`;
    let end = parseInt(sessionStorage.getItem(KEY) || '0');
    if (!end || end < Date.now()) {
      end = Date.now() + COUNTDOWN_HOURS * 3600000;
      sessionStorage.setItem(KEY, end.toString());
    }
    const cdH = document.getElementById('cd-h');
    const cdM = document.getElementById('cd-m');
    const cdS = document.getElementById('cd-s');
    if (!cdH) return;
    const tick = () => {
      const diff = Math.max(0, end - Date.now());
      cdH.textContent = String(Math.floor(diff / 3600000)).padStart(2, '0');
      cdM.textContent = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
      cdS.textContent = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
      if (diff === 0) sessionStorage.removeItem(KEY);
    };
    tick();
    setInterval(tick, 1000);
  }
  startCountdown();

  // ── Toast ─────────────────────────────────────────────────────
  let toastTimer;
  function showToast(msg, duration = 3500) {
    const el = document.getElementById('toast');
    if (!el) return;
    clearTimeout(toastTimer);
    el.textContent = msg;
    el.classList.add('show');
    toastTimer = setTimeout(() => el.classList.remove('show'), duration);
  }

  // ── Email validation ──────────────────────────────────────────
  const STRICT_EMAIL_RE = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
  let emailCheckState = null; // null | 'checking' | 'valid' | 'invalid'

  function setEmailErr(el, errEl, msg, isChecking) {
    if (!errEl) return;
    errEl.textContent = msg;
    errEl.style.color = isChecking ? '#888' : '';
    if (msg && !isChecking) el.classList.add('error');
    else el.classList.remove('error');
  }

  // ── Registration form ─────────────────────────────────────────
  const form = document.getElementById('registerForm');
  if (form) {
    // Blur-based real-time email validation
    const emailInput = document.getElementById('email');
    const emailErrEl = document.getElementById('emailErr');
    if (emailInput) {
      emailInput.addEventListener('input', () => { emailCheckState = null; });
      emailInput.addEventListener('blur', async () => {
        const val = emailInput.value.trim();
        if (!val) return;
        if (!STRICT_EMAIL_RE.test(val)) {
          emailCheckState = 'invalid';
          setEmailErr(emailInput, emailErrEl, 'Email không đúng định dạng. Ví dụ: ban@gmail.com', false);
          return;
        }
        emailCheckState = 'valid';
        setEmailErr(emailInput, emailErrEl, '', false);
      });
    }

    form.addEventListener('focusin', function onFirst() {
      const viewContentId = getOrCreateEventId('form_open');
      window._track('form_open', { ...utmData, event_id: viewContentId });
      fireFbq('ViewContent', { content_name: PAGE_ID, content_category: 'landing_page' }, { eventID: viewContentId }, 5);
      form.removeEventListener('focusin', onFirst);
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!validateForm()) return;

      const btn        = document.getElementById('submitBtn');
      const submitText = document.getElementById('submitText');
      const spinner    = document.getElementById('submitSpinner');

      btn.disabled = true;
      submitText?.classList.add('hidden');
      spinner?.classList.remove('hidden');

      const payload = {
        name:       form.name.value.trim(),
        phone:      form.phone.value.trim(),
        email:      form.email?.value.trim() || '',
        region:     form.region?.value || '',
        attendance: form.attendance?.value || '',
        value:      form.value?.value || CFG.value || undefined,
        currency:   form.currency?.value || CFG.currency || undefined,
        session_id: sessionId,
        page_id:    PAGE_ID,
        event_source_url: location.href,
        ...utmData,
        ...clickIds,
        fbc: getCookie('_fbc') || pixelCookies.fbc || '',
        fbp: getCookie('_fbp') || pixelCookies.fbp || '',
        ga:  getCookie('_ga')  || pixelCookies.ga  || ''
      };

      try {
        const res  = await fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (data.success) {
          window._track('conversion', { ...utmData, event_id: data.event_id || '', duplicate: data.duplicate || false });

          if (!data.duplicate) {
            const eventId = data.event_id || '';

            // Chuẩn bị user data cho advanced matching
            const _nameParts = (form.name.value.trim()).split(/\s+/).filter(Boolean);
            const _ct = _normForPixel(form.region?.value || '');
            const _fn = _normForPixel(_nameParts[0] || '');
            const _ln = _normForPixel(_nameParts.slice(1).join(' '));
            const _ph = (form.phone?.value || '').replace(/\D/g, '');
            const _em = form.email?.value.trim() || '';
            const _value = Number(form.value?.value || CFG.value || 20000);
            const _currency = form.currency?.value || CFG.currency || 'VND';

            // GTM dataLayer trigger – GTM sẽ bắt event này để fire tag/conversion
            window.dataLayer = window.dataLayer || [];
            window.dataLayer.push({ event: 'generate_lead', event_id: eventId, page_id: PAGE_ID, city: _ct, value: _value, currency: _currency, ...utmData });

            // Facebook Pixel – CompleteRegistration với eventID để Meta dedup với CAPI
            // Re-init trước để cập nhật advanced matching (email, phone, city, name)
            // Retry tối đa 5 lần (2.5s) để chờ GTM/Pixel load xong
            (function fireFbq(attempts) {
              if (typeof fbq !== 'undefined') {
                if (_metaPixelId) {
                  fbq('init', _metaPixelId, { em: _em, ph: _ph, fn: _fn, ln: _ln, ct: _ct, country: 'vn' });
                }
                fbq('track', 'CompleteRegistration', { value: _value, currency: _currency, content_name: PAGE_ID }, { eventID: eventId });
                console.log('[Pixel] CompleteRegistration fired, eventID:', eventId, 'ct:', _ct);
              } else if (attempts > 0) {
                setTimeout(function() { fireFbq(attempts - 1); }, 500);
              } else {
                console.warn('[Pixel] fbq không khả dụng sau 2.5s – kiểm tra GTM/Pixel setup');
              }
            })(5);
          } else {
            console.log('[Pixel] Bỏ qua CompleteRegistration – SĐT đã đăng ký trước đó (duplicate)');
          }

          // Gọi callback page-specific nếu có
          if (typeof CFG.onSuccess === 'function') {
            CFG.onSuccess(data);
          } else {
            // Default: show success state
            document.getElementById('formStep1')?.classList.add('hidden');
            const successEl = document.getElementById('formSuccess');
            if (successEl) {
              successEl.classList.remove('hidden');
              const msgEl = document.getElementById('successMessage');
              if (msgEl) msgEl.textContent = CFG.successMessage || data.message;
            }
          }
          loadSeats();
        } else {
          showToast('❌ ' + data.message);
          btn.disabled = false;
          submitText?.classList.remove('hidden');
          spinner?.classList.add('hidden');
        }
      } catch {
        showToast('❌ Lỗi kết nối. Vui lòng thử lại.');
        btn.disabled = false;
        submitText?.classList.remove('hidden');
        spinner?.classList.add('hidden');
      }
    });
  }

  function validateForm() {
    let ok = true;
    const fields = [
      { id: 'name',       errId: 'nameErr',       check: v => v.trim() !== '',                             msg: 'Vui lòng nhập họ tên.' },
      { id: 'phone',      errId: 'phoneErr',       check: v => /^\d{9,11}$/.test(v.replace(/\D/g,'')),     msg: 'Số điện thoại không hợp lệ (9-11 chữ số).' },
      { id: 'region',     errId: 'regionErr',      check: v => v !== '',                                   msg: 'Vui lòng chọn khu vực.' },
      { id: 'attendance', errId: 'attendanceErr',  check: v => v !== '',                                   msg: 'Vui lòng chọn hình thức tham dự.' }
    ];
    fields.forEach(({ id, errId, check, msg }) => {
      const el  = document.getElementById(id);
      const err = document.getElementById(errId);
      if (!el) return;
      el.classList.remove('error');
      if (err) err.textContent = '';
      if (!check(el.value)) {
        if (err) err.textContent = msg;
        el.classList.add('error');
        ok = false;
      }
    });

    // Email: xử lý riêng để dùng emailCheckState
    const emailEl  = document.getElementById('email');
    const emailErr = document.getElementById('emailErr');
    if (emailEl) {
      emailEl.classList.remove('error');
      if (emailErr && emailErr.style.color === '#888') { emailErr.textContent = ''; emailErr.style.color = ''; }
      const val = emailEl.value.trim();
      if (!STRICT_EMAIL_RE.test(val)) {
        if (emailErr) { emailErr.textContent = 'Email không đúng định dạng. Ví dụ: ban@gmail.com'; emailErr.style.color = ''; }
        emailEl.classList.add('error');
        ok = false;
      } else if (emailCheckState === 'invalid') {
        if (emailErr && !emailErr.textContent) emailErr.textContent = 'Email không hợp lệ. Vui lòng kiểm tra lại.';
        emailEl.classList.add('error');
        ok = false;
      } else if (emailCheckState === 'checking') {
        if (emailErr) { emailErr.textContent = 'Đang kiểm tra email, vui lòng đợi giây lát...'; emailErr.style.color = '#888'; }
        emailEl.classList.add('error');
        ok = false;
      }
    }

    if (!ok) document.querySelector('.error')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return ok;
  }

  // ── Share button ──────────────────────────────────────────────
  document.getElementById('shareBtn')?.addEventListener('click', (e) => {
    const btn = e.currentTarget;
    const href = btn.dataset.href;
    if (href) {
      window.open(href, '_blank', 'noopener');
      return;
    }
    const shareData = { title: document.title, text: document.querySelector('meta[name=description]')?.content || '', url: location.href };
    if (navigator.share) {
      navigator.share(shareData).catch(() => {});
    } else {
      navigator.clipboard.writeText(location.href).then(() => {
        showToast('✅ Đã sao chép link! Hãy chia sẻ với bạn bè.');
      });
    }
  });

  // ── CTA click tracking ────────────────────────────────────────
  // ── FAQ accordion ─────────────────────────────────────────────
  document.querySelectorAll('.faq-q').forEach(btn => {
    btn.addEventListener('click', () => {
      const isOpen = btn.getAttribute('aria-expanded') === 'true';
      document.querySelectorAll('.faq-q').forEach(b => {
        b.setAttribute('aria-expanded', 'false');
        b.nextElementSibling.style.maxHeight = '0';
      });
      if (!isOpen) {
        btn.setAttribute('aria-expanded', 'true');
        btn.nextElementSibling.style.maxHeight = btn.nextElementSibling.scrollHeight + 'px';
      }
    });
  });

  // ── Scroll reveal ─────────────────────────────────────────────
  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('revealed'); revealObserver.unobserve(e.target); } });
  }, { threshold: 0.12 });
  document.querySelectorAll('.pain-card,.econ-item,.program-item,.outcome-item,.faq-item,.credibility-box,.truth-box')
    .forEach((el, i) => { el.setAttribute('data-reveal',''); el.style.transitionDelay = (i%4)*80+'ms'; revealObserver.observe(el); });

  // ── Sticky nav ────────────────────────────────────────────────
  window.addEventListener('scroll', () => {
    document.getElementById('navbar')?.classList.toggle('scrolled', window.scrollY > 10);
    const heroH = document.querySelector('.hero')?.offsetHeight || 600;
    const sticky = document.getElementById('stickyCta');
    if (sticky) sticky.style.display = window.scrollY > heroH ? 'block' : 'none';
  }, { passive: true });

  // ── Scroll depth tracking ─────────────────────────────────────
  let scroll50Tracked = false;
  window.addEventListener('scroll', () => {
    if (scroll50Tracked) return;
    const pct = Math.round(window.scrollY / (document.body.scrollHeight - window.innerHeight) * 100);
    if (pct >= 50) {
      scroll50Tracked = true;
      const scrollEventId = getOrCreateEventId('scroll_50_percent');
      window._track('Scroll_50_Percent', { depth: 50, event_id: scrollEventId, ...utmData });
      fireFbq('Scroll_50_Percent', { content_name: PAGE_ID, content_category: 'landing_page', scroll_depth: 50 }, { eventID: scrollEventId }, 5);
    }
  }, { passive: true });

  // ── Social proof popup ────────────────────────────────────────
  if (SOCIAL_PROOF) (function () {
    const NAMES = [
      'Minh', 'Hương', 'Tuấn', 'Linh', 'Nam',
      'Thảo', 'Hùng', 'Mai', 'Đức', 'Lan',
      'Phong', 'Ngọc', 'Trung', 'Yến', 'Khoa',
      'Trang', 'Bảo', 'Thu', 'Việt', 'Dung'
    ];

    function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
    function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

    const el = document.createElement('div');
    el.className = 'sp-popup';
    el.innerHTML =
      '<div class="sp-popup__icon">👤</div>' +
      '<div class="sp-popup__body">' +
        '<div class="sp-popup__name"></div>' +
        '<div class="sp-popup__time"></div>' +
      '</div>' +
      '<button class="sp-popup__close" aria-label="Đóng">✕</button>';
    document.body.appendChild(el);

    const nameEl = el.querySelector('.sp-popup__name');
    const timeEl = el.querySelector('.sp-popup__time');
    let hideTimer, loopTimer;

    el.querySelector('.sp-popup__close').addEventListener('click', () => {
      clearTimeout(hideTimer);
      clearTimeout(loopTimer);
      hide();
    });

    function show() {
      nameEl.textContent = rand(NAMES) + ' đã đăng ký thành công';
      timeEl.textContent = randInt(1, 28) + ' phút trước ✅';

      el.classList.add('sp-show');

      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        hide();
        loopTimer = setTimeout(show, randInt(5, 10) * 1000);
      }, 4000);
    }

    function hide() {
      el.classList.remove('sp-show');
    }

    setTimeout(show, randInt(8, 15) * 1000);
  })();

  // ── Smooth scroll ─────────────────────────────────────────────
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const target = document.querySelector(a.getAttribute('href'));
      if (target) { e.preventDefault(); window.scrollTo({ top: target.offsetTop - 64, behavior: 'smooth' }); }
    });
  });

  // ── Utility ───────────────────────────────────────────────────
  function _q(id, fn) { const el = document.getElementById(id); if (el) fn(el); }

})();
