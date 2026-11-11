'use strict';
(() => {
  // A person's own page: enter tonight's session, or see when the next one is.
  const { saveKey, moment, renderSchedule } = window.WebinarFunnel;
  const $ = id => document.getElementById(id);
  const key = location.pathname.split('/').pop();
  saveKey(key);
  const failed = () => { $('heading').textContent = 'Không tìm thấy thông tin đăng ký'; $('message').textContent = 'Bạn kiểm tra lại link, hoặc gọi hotline để được hỗ trợ.'; };

  function render(view) {
    renderSchedule($('schedule'), view.ended ? [] : view.sessions);
    $('go').hidden = true;
    $('rejoin').hidden = true;
    $('zalo').hidden = true;
    if (view.ended) {
      $('heading').textContent = `${view.label} đã kết thúc`;
      $('message').textContent = 'Bạn có thể đăng ký học cùng đợt mới nhất.';
      $('rejoin').hidden = false;
      return;
    }
    if (view.zalo.available) { $('zalo').href = view.zalo.href; $('zalo').hidden = false; }
    if (view.open_position) {
      $('heading').textContent = `Buổi ${view.open_position} đang mở`;
      $('message').textContent = `${view.label} · ${view.title}`;
      $('go').href = view.go_href;
      $('go').hidden = false;
      return;
    }
    $('heading').textContent = view.next_at ? `Buổi tiếp theo: ${moment(view.next_at)}` : 'Chưa đến giờ học';
    $('message').textContent = `${view.label} · ${view.title}. Phòng học mở trước giờ học 30 phút, bạn quay lại link này nhé.`;
  }

  const load = () => fetch(`/api/webinar-program/session/${encodeURIComponent(key)}`, { cache: 'no-store' })
    .then(response => response.ok ? response.json() : Promise.reject(new Error('not found'))).then(render);
  load().catch(failed);

  $('rejoin').addEventListener('click', async () => {
    $('rejoin').disabled = true;
    try {
      const response = await fetch(`/api/webinar-program/rejoin/${encodeURIComponent(key)}`, { method: 'POST' });
      if (!response.ok) throw new Error('failed');
      const view = await response.json();
      location.replace(view.page_href);
    } catch { failed(); }
  });
})();
