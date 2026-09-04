let zoomMeetingsCache = [];

function fmtZoomDuration(seconds) {
  const n = Math.max(0, Number(seconds || 0));
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = n % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

async function renderAdsReport() {
  const el = document.getElementById('mainAdsReport');
  if (!el) return;
  if (currentUser?.role !== 'admin') {
    el.innerHTML = '<div class="admin-report-fallback"><div class="card"><div class="card-title">Forbidden</div><p style="margin-top:10px;color:var(--gray)">Ban khong co quyen truy cap Ads Report.</p></div></div>';
    return;
  }
  el.innerHTML = '<div class="admin-report-fallback"><div class="loading"><div class="spin"></div> Dang tai Ads Report...</div></div>';
  try {
    const res = await fetch('/admin/ads-report/session', { method: 'POST' });
    if (!res.ok) throw new Error('Cannot create ads report session');
    const data = await res.json();
    const src = data.url || '/ads';
    el.innerHTML = `
      <div class="admin-report-fallback" style="width:100%;max-width:620px">
        <div class="card" style="padding:30px">
          <div class="card-title">Ads Report</div>
          <h2 style="font-size:1.35rem;margin:10px 0 8px">Mo AdsPulse Dashboard</h2>
          <p style="color:var(--gray);line-height:1.6;margin-bottom:18px">
            AdsPulse dang chay trong app Next.js o thu muc ads-report cua project nay. Hay mo dashboard o tab/cua so rieng de trinh duyet luu phien dang nhap dung cach.
          </p>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <button class="btn-primary" id="openAdsReportSameTab">Mo dashboard</button>
            <a class="btn-hdr" style="text-align:center;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;width:auto;color:var(--gray)" href="${escAttr(src)}" target="_blank" rel="noopener">Mo tab moi</a>
          </div>
        </div>
      </div>`;
    document.getElementById('openAdsReportSameTab')?.addEventListener('click', () => {
      window.location.href = src;
    });
    viewCache['ads-report'] = true;
  } catch (e) {
    el.innerHTML = '<div class="admin-report-fallback"><div class="card"><div class="card-title">Ads Report</div><p style="margin-top:10px;color:var(--gray)">Khong the mo Ads Report. Vui long dang nhap lai bang tai khoan admin.</p></div></div>';
  }
}

async function renderZoom() {
  const main = document.getElementById('mainZoom');
  if (!main) return;
  main.innerHTML = '<div class="loading"><div class="spin"></div> Dang tai danh sach Zoom...</div>';
  let data;
  try {
    const res = await fetch('/admin/zoom/meetings');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    data = await res.json();
  } catch (e) {
    main.innerHTML = '<div class="loading">Khong tai duoc danh sach Zoom.</div>';
    return;
  }
  zoomMeetingsCache = data.rows || [];
  const rows = zoomMeetingsCache.map(m => `
    <tr class="lead-row" onclick="openZoomMeeting('${encodeURIComponent(m.zoom_meeting_uuid)}')">
      <td style="font-weight:700;color:var(--white)">${escHtml(m.topic || '-')}</td>
      <td style="font-family:monospace;color:#94a3b8">${escHtml(m.zoom_meeting_id || '')}</td>
      <td>${m.start_time ? fmtDate(m.start_time) : '-'}</td>
      <td style="text-align:right;color:var(--green);font-weight:700">${fmt(m.unique_participants || 0)}</td>
      <td style="text-align:right;color:var(--blue);font-weight:700">${fmt(m.matched_leads || 0)}</td>
      <td style="text-align:right;color:var(--green);font-weight:700">${fmtZoomDuration(m.total_participant_duration || 0)}</td>
      <td style="text-align:right"><button class="btn-sm-action test" onclick="event.stopPropagation();openZoomMeeting('${encodeURIComponent(m.zoom_meeting_uuid)}')">Chi tiet</button></td>
    </tr>
  `).join('');
  main.innerHTML = `
    <div class="table-card" style="margin-bottom:14px">
      <div class="table-head-bar">
        <div>
          <span class="card-title">Zoom meetings</span>
          <div class="card-note" style="margin-top:4px">${fmt(zoomMeetingsCache.length)} buoi Zoom da sync va doi chieu voi lead theo email</div>
        </div>
      </div>
      <div class="table-wrap" style="max-height:680px">
        <table>
          <thead><tr><th>Ten / topic</th><th>Meeting ID</th><th>Ngay to chuc</th><th style="text-align:right">Nguoi tham gia</th><th style="text-align:right">Matched lead</th><th style="text-align:right">Tong thoi gian</th><th style="text-align:right">Chi tiet</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--gray)">Chua co du lieu Zoom. Hay dung nut Sync du lieu Zoom o tab Phan quyen.</td></tr>'}</tbody>
        </table>
      </div>
    </div>`;
  viewCache.zoom = true;
}

async function openZoomMeeting(encodedUuid) {
  const zoomUuid = decodeURIComponent(encodedUuid || '');
  if (!zoomUuid) return;
  document.getElementById('drawerOverlay').classList.add('open');
  document.getElementById('leadDrawer').classList.add('open');
  document.getElementById('leadDrawer').classList.add('zoom-detail-drawer');
  document.getElementById('drawerName').textContent = 'Chi tiet Zoom';
  document.getElementById('drawerPhone').textContent = '';
  const box = document.getElementById('drawerBody');
  box.innerHTML = '<div class="drawer-loading"><div class="spin"></div> Dang tai chi tiet Zoom...</div>';
  let detail;
  try {
    const res = await fetch('/admin/zoom/meeting-detail?uuid=' + encodeURIComponent(zoomUuid));
    if (!res.ok) throw new Error('HTTP ' + res.status);
    detail = await res.json();
  } catch (e) {
    box.innerHTML = '<div class="drawer-loading">Khong tai duoc chi tiet Zoom.</div>';
    return;
  }
  const m = detail.meeting || {};
  document.getElementById('drawerPhone').textContent = [m.topic || '', m.zoom_meeting_id || ''].filter(Boolean).join(' | ');
  const participants = detail.participants || [];
  const participantRows = participants.map(p => {
    const sale = p.lead?.assigned_profile || null;
    const saleHTML = p.lead
      ? (sale ? `<div class="zoom-sale-cell">${escHtml(sale.full_name || sale.email || '-')}</div>` : '<span class="empty">Chua phan</span>')
      : '<span class="empty">-</span>';
    return `
      <tr>
        <td style="font-weight:650">${escHtml(p.zoom_display_name || '-')}<div style="font-size:.68rem;color:var(--gray)">${escHtml(p.lead_email || '')}</div></td>
        <td>${escHtml(p.lead_phone || p.raw?.phone || p.raw?.phone_number || p.raw?.user_phone || p.raw?.registrant_phone || p.raw?.mobile || p.raw?.mobile_phone || p.raw?.registrant?.phone || p.raw?.registrant?.phone_number || '')}</td>
        <td>${p.join_time ? fmtDate(p.join_time) : '-'}</td>
        <td>${p.leave_time ? fmtDate(p.leave_time) : '-'}</td>
        <td style="text-align:right;color:var(--green);font-weight:700">${fmtZoomDuration(p.duration)}</td>
        <td>${saleHTML}</td>
        <td><div class="zoom-lead-actions">${p.lead ? `<button class="btn-sm-action test" onclick="openLeadDrawer('${p.lead.id}')">Xem lead</button>` : `<span class="empty">Chua co lead</span><button class="btn-sm-action toggle" onclick="createLeadFromZoomParticipant('${p.id}', '${encodeURIComponent(zoomUuid)}')">Them lead</button>`}</div></td>
      </tr>`;
  }).join('');
  box.innerHTML = `
    <div class="detail-section">
      <div class="detail-section-title">Chi tiet Zoom</div>
      <div style="font-size:1rem;font-weight:800;margin-bottom:6px">${escHtml(m.topic || '-')}</div>
      <div style="font-size:.78rem;color:var(--gray);line-height:1.7">
        Meeting ID: <span style="font-family:monospace;color:#94a3b8">${escHtml(m.zoom_meeting_id || '')}</span><br>
        Ngay to chuc: ${m.start_time ? fmtDate(m.start_time) : '-'}<br>
        Thoi luong meeting: ${fmt(m.duration || 0)} phut
      </div>
    </div>
    <div class="detail-grid" style="margin-bottom:14px">
      <div class="detail-item"><div class="di-label">Nguoi tham gia</div><div class="di-val">${fmt(detail.stats?.shown_participants || 0)}</div></div>
      <div class="detail-item"><div class="di-label">Matched lead</div><div class="di-val">${fmt(detail.stats?.matched_leads || 0)}</div></div>
      <div class="detail-item"><div class="di-label">Tong thoi gian</div><div class="di-val">${fmtZoomDuration(detail.stats?.total_participant_duration || 0)}</div></div>
    </div>
    <div class="table-wrap zoom-detail-table-wrap">
      <table class="zoom-detail-table">
        <thead><tr><th>Nguoi tham gia</th><th>So dien thoai</th><th>Vao</th><th>Roi</th><th style="text-align:right">Thoi luong</th><th>Sale</th><th>Lead</th></tr></thead>
        <tbody>${participantRows || '<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--gray)">Chua co participant.</td></tr>'}</tbody>
      </table>
    </div>`;
}

async function createLeadFromZoomParticipant(attendanceId, encodedUuid) {
  if (!attendanceId) return;
  const res = await fetch('/admin/zoom/participants/' + encodeURIComponent(attendanceId) + '/create-lead', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return toast(data.error || 'Khong tao duoc lead tu Zoom', 'error');
  toast(data.existing ? 'Da lien ket voi lead co san' : 'Da tao lead tu Zoom', 'success');
  invalidateViewCache('leads', 'zoom');
  if (encodedUuid) await openZoomMeeting(encodedUuid);
}
