'use strict';
// /zoom: a CRM email goes straight to its personal Zoom page, a new email completes its info.
(() => {
  const { store, api, busy, validEmail, joinPath } = window.ZoomEvent;
  const form = document.getElementById('joinForm');
  const input = document.getElementById('email');
  const button = document.getElementById('joinButton');
  const errorBox = document.getElementById('formError');

  // Returning visitor: this browser keeps the personal page key. Greet them by name with
  // "Vào học ngay": while the event runs it opens their Zoom link directly, otherwise
  // their personal page. An unknown or failed key falls back to the normal form.
  // A link with ?email= (e.g. sent from HubCRM) does the same for a known customer; the
  // head script already moved the email out of the URL before tracking ran.
  const welcome = document.getElementById('welcome');
  const signup = document.getElementById('signup');
  const done = () => document.documentElement.classList.remove('zoom-checking');
  function showForm() { welcome.hidden = true; signup.hidden = false; done(); }
  function showWelcome(saved) {
    return api('/session/' + encodeURIComponent(saved)).then(session => {
      const key = session.access_key || saved;
      store.set('localStorage', 'zoom-event:access', key);
      const start = Date.parse(session.starts_at), end = start + Number(session.duration_minutes || 0) * 60000;
      const live = () => Number.isFinite(start) && Date.now() >= start && Date.now() < end;
      const join = document.getElementById('welcomeJoin');
      const note = document.getElementById('welcomeNote');
      // Decided at click time, so a page left open until the start still opens Zoom.
      const target = () => live() && session.ready ? '/zoom/join/' + encodeURIComponent(key) : joinPath(key);
      const refresh = () => {
        join.href = target();
        note.textContent = live() ? 'Buổi học đang diễn ra, bấm để vào Zoom ngay.'
          : Number.isFinite(end) && Date.now() >= end ? 'Buổi học đã kết thúc.'
          : 'Bấm để vào học ngay!';
      };
      refresh();
      setInterval(refresh, 15000);
      join.addEventListener('click', () => { join.href = target(); });
      document.getElementById('welcomeTitle').textContent = `Chào ${session.name || 'bạn'}, bạn đã đăng ký thành công`;
      signup.hidden = true;
      welcome.hidden = false;
      done();
    }).catch(error => {
      if (error.code === 'not_found') try { localStorage.removeItem('zoom-event:access'); } catch {}
      showForm();
    });
  }
  const linkEmail = store.get('sessionStorage', 'zoom-event:link-email');
  try { sessionStorage.removeItem('zoom-event:link-email'); } catch {}
  const saved = store.get('localStorage', 'zoom-event:access');
  // Never leave the visitor without a form if the server is slow.
  const fallback = setTimeout(showForm, 8000);
  if (validEmail(linkEmail)) {
    store.set('sessionStorage', 'zoom-event:email', linkEmail);
    // Known customer: registered (personal Zoom link created) and greeted. New email: the
    // form is prefilled; the info step and Debounce check follow the normal submit.
    api('/check', { email: linkEmail }).then(result => {
      clearTimeout(fallback);
      if (result.status !== 'ready') return showForm();
      store.set('localStorage', 'zoom-event:access', result.access_key);
      return showWelcome(result.access_key);
    }).catch(error => {
      clearTimeout(fallback);
      showForm();
      errorBox.textContent = error.message;
      if (error.code === 'email_invalid') input.setAttribute('aria-invalid', 'true');
    });
  } else if (saved) {
    showWelcome(saved).finally(() => clearTimeout(fallback));
  } else {
    clearTimeout(fallback);
    done();
  }
  document.getElementById('otherEmail').addEventListener('click', () => {
    try { localStorage.removeItem('zoom-event:access'); } catch {}
    input.value = '';
    showForm();
    input.focus();
  });
  input.value = store.get('sessionStorage', 'zoom-event:email');
  // Back from the next page (bfcache) must not leave the button stuck on "Đang kiểm tra".
  window.addEventListener('pageshow', event => { if (event.persisted && button.disabled) busy(button, false); });
  input.addEventListener('input',() => { errorBox.textContent = ''; input.removeAttribute('aria-invalid'); });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (button.disabled) return;
    const email = input.value.trim().toLowerCase();
    if (!validEmail(email)) {
      errorBox.textContent = 'Vui lòng nhập email hợp lệ, ví dụ: ten@gmail.com';
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return;
    }
    errorBox.textContent = '';
    busy(button, true, 'Đang kiểm tra...');
    window.FunnelTracking?.track('form_submit', { position: 'hero' });
    try {
      const result = await api('/check', { email });
      store.set('sessionStorage', 'zoom-event:email', email);
      if (result.status === 'ready') {
        store.set('localStorage', 'zoom-event:access', result.access_key);
        location.assign(joinPath(result.access_key));
      } else {
        location.assign('/zoom/hoan-tat');
      }
    } catch (error) {
      errorBox.textContent = error.message;
      busy(button, false);
      if (error.code === 'email_invalid') { input.setAttribute('aria-invalid', 'true'); input.focus(); }
    }
  });
})();
