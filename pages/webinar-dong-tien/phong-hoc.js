'use strict';
(() => {
  // The study page, laid out like the EverWebinar room: the stage with a play ring and the next
  // session in its middle, a countdown to the moment the room opens (30 minutes before), then
  // straight into the room. The side panel holds the schedule and the topic.
  //  - Week link /w/dong-tien/20h-16-11-26: a browser that registered before goes straight on,
  //    anyone else fills in name, email and phone once; the room then shows on the same address.
  //    During the study days the link's week counts, so a newcomer studies tonight.
  //  - Personal link /w/dong-tien/vao/<key> (thank-you page, messages): the room directly.
  const { register, validPhone, validEmail, saveKey, readKey, moment, clock } = window.WebinarFunnel;
  const $ = id => document.getElementById(id);
  const last = location.pathname.split('/').pop();
  const weekLink = /^\d{1,2}h\d{0,2}-\d{2}-\d{2}-\d{2}$/.test(last);
  const via = weekLink ? last : new URLSearchParams(location.search).get('via') || '';
  const OPENS_BEFORE = 30 * 60000;
  let key = weekLink ? readKey() : last;
  let timer = null, view = null;
  const pad = n => String(n).padStart(2, '0');
  const goHref = () => `${view.go_href}${via ? `?via=${encodeURIComponent(via)}` : ''}`;

  // Side panel tabs.
  document.querySelectorAll('.panel-tabs button').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('.panel-tabs button').forEach(b => { b.classList.toggle('on', b === button); b.setAttribute('aria-selected', b === button); });
    document.querySelectorAll('[data-pane]').forEach(pane => { pane.hidden = pane.dataset.pane !== button.dataset.tab; });
  }));

  function showRoom() {
    $('join-view').hidden = true;
    $('room-view').hidden = false;
    document.body.classList.add('room');
  }
  function showJoin() {
    $('loading').hidden = true;
    $('join-form').hidden = false;
  }
  function failed() {
    showRoom();
    $('kicker').textContent = '';
    $('heading').textContent = 'Không tìm thấy thông tin đăng ký';
    $('message').textContent = 'Bạn kiểm tra lại link, hoặc gọi hotline để được hỗ trợ.';
  }
  function calendarLink(session) {
    const start = new Date(session.at), end = new Date(start.getTime() + 2 * 3600000);
    const stamp = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const query = new URLSearchParams({ action: 'TEMPLATE', text: `${view.title} · Buổi ${session.position}`, dates: `${stamp(start)}/${stamp(end)}`, details: `Vào học tại: ${location.origin}${view.page_href}` });
    return `https://calendar.google.com/calendar/render?${query}`;
  }
  function renderSchedule(current) {
    $('schedule').replaceChildren(...view.sessions.map(s => {
      const item = document.createElement('li');
      item.className = s.past ? 'past' : s.position === current ? 'now' : '';
      const n = Object.assign(document.createElement('span'), { className: 'n', textContent: s.position });
      const text = document.createElement('div');
      text.append(s.title || `Buổi ${s.position}`, Object.assign(document.createElement('span'), { className: 't', textContent: moment(s.at) }));
      item.append(n, text);
      return item;
    }));
  }
  function showTopic(session) {
    $('topic-kicker').textContent = session ? `Buổi ${session.position} · ${moment(session.at)}` : '';
    $('topic').textContent = session?.title || 'Nội dung sẽ được cập nhật.';
  }
  function tick(target) {
    const left = Math.max(0, target - Date.now());
    const days = Math.floor(left / 86400000);
    $('cd-days').hidden = days === 0;
    $('cd-d').textContent = days;
    $('cd-h').textContent = pad(Math.floor(left % 86400000 / 3600000));
    $('cd-m').textContent = pad(Math.floor(left % 3600000 / 60000));
    $('cd-s').textContent = pad(Math.floor(left % 60000 / 1000));
    $('side-timer').textContent = `Mở phòng sau ${days ? `${days} ngày ` : ''}${pad(Math.floor(left % 86400000 / 3600000))}:${pad(Math.floor(left % 3600000 / 60000))}:${pad(Math.floor(left % 60000 / 1000))}`;
    // When the room opens, ask the server again: it decides, the browser clock may be off.
    if (left === 0) { clearInterval(timer); timer = null; setTimeout(load, 1500); }
  }

  function render(next) {
    view = next;
    key = view.key;
    saveKey(key);
    showRoom();
    $('rejoin').hidden = $('zalo').hidden = $('calendar').hidden = $('countdown').hidden = true;
    $('go').classList.remove('live');
    $('go').removeAttribute('href');
    $('go').tabIndex = -1;
    if (view.zalo.available && !view.ended) { $('zalo').href = view.zalo.href; $('zalo').hidden = false; }
    if (view.ended) {
      $('stage-tag').textContent = 'ĐÃ KẾT THÚC';
      $('heading').textContent = 'Đợt học của bạn đã kết thúc';
      $('kicker').textContent = view.title;
      $('message').textContent = 'Bạn có thể đăng ký học cùng đợt mới nhất.';
      $('side-timer').textContent = '00:00:00';
      $('rejoin').hidden = false;
      renderSchedule(null);
      showTopic(null);
      return;
    }
    if (view.open_position) {
      const session = view.sessions.find(s => s.position === view.open_position);
      $('stage-tag').textContent = 'ĐANG MỞ';
      $('room-title').textContent = `${view.title} · Buổi ${session.position}`;
      $('heading').textContent = 'Bấm vào đây để vào phòng';
      $('kicker').textContent = `Buổi ${session.position} đang mở · ${moment(session.at)}`;
      $('message').textContent = 'Đang đưa bạn vào phòng học…';
      $('side-timer').textContent = 'ĐANG MỞ';
      $('go').href = goHref();
      $('go').tabIndex = 0;
      $('go').classList.add('live');
      renderSchedule(session.position);
      showTopic(session);
      setTimeout(() => location.replace(goHref()), weekLink ? 300 : 1500);
      return;
    }
    const session = view.sessions.find(s => !s.past);
    renderSchedule(session?.position);
    showTopic(session);
    if (!session) { $('heading').textContent = 'Chưa có buổi học tiếp theo'; $('kicker').textContent = view.title; return; }
    $('stage-tag').textContent = 'PHÒNG CHỜ';
    $('room-title').textContent = `${view.title} · Buổi ${session.position}`;
    $('heading').textContent = `Buổi ${session.position} bắt đầu lúc ${moment(session.at)}`;
    $('kicker').textContent = 'Phòng sẽ mở sau';
    $('message').textContent = `Phòng mở lúc ${clock(new Date(Date.parse(session.at) - OPENS_BEFORE).toISOString())}. Bạn cứ để trang này mở, đến giờ hệ thống tự đưa bạn vào phòng.`;
    $('calendar').href = calendarLink(session);
    $('calendar').hidden = false;
    $('countdown').hidden = false;
    const target = Date.parse(session.at) - OPENS_BEFORE;
    clearInterval(timer);
    tick(target);
    timer = setInterval(() => tick(target), 1000);
  }

  function load() {
    return fetch(`/api/webinar-program/session/${encodeURIComponent(key)}`, { cache: 'no-store' })
      .then(response => response.ok ? response.json() : Promise.reject(new Error('not found')))
      .then(render).catch(failed);
  }

  // Week link: measured per link (opened, registered; entering is counted by the server).
  function count(kind) {
    return fetch('/api/webinar-program/link-event', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: last, kind, visitor: window._sessionId || '' }) }).catch(() => {});
  }
  async function enterWeek(savedKey) {
    const response = await fetch('/api/webinar-program/enter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: savedKey, slug: last }) });
    if (!response.ok) throw new Error('not found');
    render(await response.json());
  }

  if (!weekLink) load();
  else {
    count('visit');
    if (key) enterWeek(key).catch(showJoin);
    else showJoin();
  }

  $('join-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget, button = form.querySelector('button');
    if (button.disabled) return;
    const say = message => { $('form-error').textContent = message; $('form-error').hidden = false; };
    $('form-error').hidden = true;
    const name = form.elements.name.value.trim();
    const email = form.elements.email.value.trim().toLowerCase();
    const phone = form.elements.phone.value.trim();
    if (!name) return say('Vui lòng nhập họ và tên.');
    if (!validEmail(email)) return say('Vui lòng nhập địa chỉ email hợp lệ (ví dụ: ban@gmail.com).');
    if (!validPhone(phone)) return say('Vui lòng nhập số điện thoại hợp lệ (9–11 chữ số).');
    button.disabled = true;
    try {
      const data = await register({ name, phone, email, week: last });
      if (!data.duplicate) await count('registered');
      if (data.cohort?.key) return render(data.cohort);
      location.assign('/webinar-dong-tien/thank-you');
    } catch (err) {
      say(err.message);
      button.disabled = false;
    }
  });

  $('rejoin').addEventListener('click', async () => {
    $('rejoin').disabled = true;
    try {
      const response = await fetch(`/api/webinar-program/rejoin/${encodeURIComponent(key)}`, { method: 'POST' });
      if (!response.ok) throw new Error('failed');
      const next = await response.json();
      if (weekLink) { $('rejoin').disabled = false; render(next); } else location.replace(next.page_href);
    } catch { failed(); }
  });
})();
