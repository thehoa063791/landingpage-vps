'use strict';
// /zoom/vao-hoc/<key>: the person's own page. "Vào học ngay" goes through /zoom/join/<key>,
// which counts the click and opens their personal Zoom link. While Zoom has not issued the
// link yet the button stays disabled and the page checks again until it lights up.
(() => {
  const { store, api } = window.ZoomEvent;
  const link = document.getElementById('joinLink');
  const label = link.querySelector('[data-label]');
  const notice = document.getElementById('notice');
  let key = decodeURIComponent(location.pathname.split('/').pop() || '');
  let waitingSince = 0, timer;
  const params = new URLSearchParams(location.search);

  // Google Calendar reminder with the person's own link (/zoom/join/<key> opens their Zoom).
  const calendar = document.getElementById('calendarLink');
  function updateCalendar() {
    const { title, startsAt, endsAt, when } = calendar.dataset;
    if (!startsAt) return;
    const stamp = iso => new Date(iso).toISOString().replace(/[-:]|\.\d{3}/g, '');
    const joinUrl = location.origin + '/zoom/join/' + encodeURIComponent(key);
    calendar.href = 'https://calendar.google.com/calendar/render?' + new URLSearchParams({
      action: 'TEMPLATE',
      text: 'Vào học: ' + title,
      dates: stamp(startsAt) + '/' + stamp(endsAt || startsAt),
      location: joinUrl,
      details: [
        `Nhắc lịch: ${title} bắt đầu lúc ${when} (giờ Việt Nam).`,
        '',
        'Bấm vào link sau để vào phòng Zoom (link dành riêng cho bạn, vui lòng không chia sẻ):',
        joinUrl,
        '',
        'Nên cài sẵn ứng dụng Zoom và vào sớm 5–10 phút.',
      ].join('\n'),
    });
  }

  function say(message, tone = '') { notice.textContent = message; notice.className = 'notice' + (tone ? ' ' + tone : ''); notice.hidden = !message; }
  function setReady(ready, wasWaiting) {
    link.setAttribute('aria-disabled', ready ? 'false' : 'true');
    link.classList.toggle('is-waiting', !ready);
    link.href = ready ? '/zoom/join/' + encodeURIComponent(key) : '#';
    label.textContent = ready ? 'VÀO HỌC NGAY' : 'ĐANG TẠO LINK ZOOM…';
    if (ready && wasWaiting) {
      link.classList.add('just-ready');
      say('Link Zoom riêng của bạn đã sẵn sàng. Bấm "Vào học ngay" để tham gia.', 'success');
    }
  }
  link.addEventListener('click', event => { if (link.getAttribute('aria-disabled') === 'true') event.preventDefault(); });

  document.getElementById('copyLink').addEventListener('click', async event => {
    const url = location.origin + '/zoom/vao-hoc/' + encodeURIComponent(key);
    try { await navigator.clipboard.writeText(url); event.target.textContent = 'Đã sao chép ✓'; }
    catch { window.prompt('Sao chép link trang vào học của bạn:', url); }
  });

  if (params.get('error')) {
    say(params.get('error') === 'link_pending' ? 'Link Zoom của bạn chưa sẵn sàng. Trang sẽ tự cập nhật khi có link.' : 'Chưa mở được Zoom. Vui lòng thử lại.', 'error');
    params.delete('error');
    history.replaceState(null, '', location.pathname + (params.toString() ? '?' + params : ''));
  }

  // Waiting: check every 5 s for 2 minutes, then every 30 s (the server only calls Zoom
  // when its retry time has come, so polling never uses up Zoom's daily limit).
  function schedule(retryAt) {
    clearTimeout(timer);
    if (!waitingSince) waitingSince = Date.now();
    const later = Date.parse(retryAt || '') - Date.now();
    if (later > 10 * 60000) {
      const at = new Date(Date.parse(retryAt)).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
      say(`Zoom đang tạm giới hạn việc tạo link cho email này. Link sẽ được tạo lại sau ${at} (giờ Việt Nam). Trang tự cập nhật, bạn có thể quay lại sau.`, 'error');
    } else {
      say('Đang tạo link Zoom riêng cho bạn. Nút sẽ tự sáng lên khi link sẵn sàng.');
    }
    timer = setTimeout(load, Date.now() - waitingSince < 120000 ? 5000 : 30000);
  }

  function load() {
    return api('/session/' + encodeURIComponent(key)).then(session => {
      // A link from an earlier event now points at the current one.
      if (session.access_key && session.access_key !== key) {
        key = session.access_key;
        history.replaceState(null, '', '/zoom/vao-hoc/' + encodeURIComponent(key));
      }
      updateCalendar();
      store.set('localStorage', 'zoom-event:access', key);
      document.getElementById('greeting').textContent = (session.name ? 'Chào ' + session.name + ', ' : '') + (session.ready ? 'bạn đã sẵn sàng!' : 'bạn đã đăng ký thành công!');
      const wasWaiting = link.classList.contains('is-waiting') && waitingSince > 0;
      setReady(session.ready, wasWaiting);
      if (!session.ready) schedule(session.retry_at);
      else if (!wasWaiting && notice.classList.contains('error') === false) say('');
    }).catch(error => {
      if (error.code === 'not_found') {
        setReady(false);
        link.hidden = true;
        document.getElementById('greeting').textContent = 'Không tìm thấy đăng ký';
        document.getElementById('joinLead').innerHTML = 'Link không hợp lệ hoặc đã cũ. <a href="/zoom">Nhập lại email</a> để nhận link mới.';
        document.getElementById('joinLead').hidden = false;
        calendar.hidden = true;
        say('');
        try { if (localStorage.getItem('zoom-event:access') === key) localStorage.removeItem('zoom-event:access'); } catch {}
      } else {
        say(error.message, 'error');
        schedule(null);
      }
    });
  }
  updateCalendar();
  load();
})();
