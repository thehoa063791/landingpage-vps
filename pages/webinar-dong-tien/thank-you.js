'use strict';
(() => {
  const { readKey, saveKey, moment, renderSchedule } = window.WebinarFunnel;
  const $ = id => document.getElementById(id);
  const query = new URLSearchParams(location.search);
  const fromLink = query.get('k') || '';
  if (fromLink) saveKey(fromLink);
  const key = fromLink || readKey();
  const missing = () => { $('missing').hidden = false; };
  if (!key) return missing();
  fetch(`/api/webinar-program/session/${encodeURIComponent(key)}`, { cache: 'no-store' })
    .then(response => response.ok ? response.json() : Promise.reject(new Error('not found')))
    .then(view => {
      $('title').textContent = view.title;
      $('first-at').textContent = view.first_at ? moment(view.first_at) : '';
      if (view.zalo.available) { $('zalo').href = view.zalo.href; $('zalo').hidden = false; }
      else $('zalo-wait').hidden = false;
      $('join').href = view.page_href;
      renderSchedule($('schedule'), view.sessions);
      $('ready').hidden = false;
      let repeat = '';
      try { repeat = sessionStorage.getItem('webinar-dong-tien:repeat') || ''; sessionStorage.removeItem('webinar-dong-tien:repeat'); } catch {}
      if (repeat) {
        $('repeat').textContent = repeat === 'new' ? 'Email này đã đăng ký trước đó. Bạn được xếp vào đợt học mới theo lịch bên dưới.' : 'Email này đã đăng ký trước đó. Lịch học của bạn vẫn giữ như cũ.';
        $('repeat').hidden = false;
      }
    })
    .catch(missing);
})();
