async function renderWebhooks() {
  try {
    const res  = await fetch('/admin/webhooks');
    const list = await res.json();
    drawWebhooks(list);
  } catch(e) {
    document.getElementById('mainWebhooks').innerHTML = '<div class="loading">❌ Lỗi tải webhook</div>';
  }
}

function drawWebhooks(list) {
  const samplePayload = {
    event: 'new_registration',
    timestamp: new Date().toISOString(),
    contact: { name: 'Nguyễn Văn A', phone: '0901234567', email: 'a@gmail.com' },
    utm: { source: 'facebook', medium: 'cpc', campaign: 'fb-zoom-q2', content: 'video_v1', term: '', channel: 'Paid Search', referrer: 'https://facebook.com' },
    click_ids: { fbclid: 'IwAR2_aBcDeFgHiJkLmN', gclid: '', ttclid: '', msclkid: '', twclid: '' },
    pixel: { fbc: 'fb.1.1713340200000.IwAR2_aBcDeFgHiJkLmN', fbp: 'fb.1.1713000000000.987654321', ga: 'GA1.1.123456789.1713000000' },
    server: { ip: '113.161.xx.xx', user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1' }
  };

  const cardsHTML = list.length ? list.map(wh => {
    const statusHTML = wh.last_status
      ? `<span class="wh-status-code ${wh.last_status < 300 ? 'status-ok':'status-err'}">${wh.last_status}</span>`
      : '';
    const lastT = wh.last_triggered ? `<span class="wh-last">🕐 ${fmtDate(wh.last_triggered)}</span>` : '<span class="wh-last">Chưa kích hoạt</span>';
    const dur   = wh.last_duration_ms ? `<span class="wh-last">${wh.last_duration_ms}ms</span>` : '';
    const errMsg= wh.last_error ? `<div style="margin-top:6px;font-size:.72rem;color:var(--red)">⚠ ${wh.last_error}</div>` : '';
    return `
    <div class="wh-card ${wh.active?'':'inactive'}" data-id="${wh.id}">
      <div>
        <div class="wh-name">${wh.name}</div>
        <div class="wh-url">${wh.url}</div>
        <div class="wh-meta">
          <div class="wh-status-dot ${wh.active?'dot-active':'dot-inactive'}"></div>
          <span class="wh-status-lbl">${wh.active?'Đang hoạt động':'Tắt'}</span>
          ${statusHTML} ${lastT} ${dur}
        </div>
        ${errMsg}
      </div>
      <div class="wh-actions">
        <button class="btn-sm-action test" onclick="testWebhook('${wh.id}',this)">🧪 Test</button>
        <button class="btn-sm-action toggle" onclick="toggleWebhook('${wh.id}',${!wh.active})">${wh.active?'⏸ Tắt':'▶ Bật'}</button>
        <button class="btn-sm-action" onclick="editWebhook('${wh.id}',decodeURIComponent('${encAttr(wh.name)}'),decodeURIComponent('${encAttr(wh.url)}'),${wh.active})">✏ Sửa</button>
        <button class="btn-sm-action del" onclick="deleteWebhook('${wh.id}',decodeURIComponent('${encAttr(wh.name)}'))">🗑 Xóa</button>
      </div>
    </div>`;
  }).join('') : `<div class="wh-empty">
    <p>Chưa có webhook nào. Thêm webhook để nhận dữ liệu real-time khi có đăng ký.</p>
    <button class="btn-primary" onclick="openAddModal()">+ Thêm Webhook đầu tiên</button>
  </div>`;

  document.getElementById('mainWebhooks').innerHTML = `
    <div class="wh-toolbar">
      <div>
        <h2>🔗 Quản lý Webhook</h2>
        <p style="font-size:.8rem;color:var(--gray);margin-top:4px">Hệ thống tự động gửi POST request đến URL khi có đăng ký mới</p>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn-hdr" onclick="showPayload(${JSON.stringify(JSON.stringify(samplePayload))})">📦 Xem Payload mẫu</button>
        <button class="btn-primary" onclick="openAddModal()">+ Thêm Webhook</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="card-head"><span class="card-title">ℹ️ Cách hoạt động</span></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px">
        ${[
          ['1️⃣ Người điền form đăng ký','Hệ thống lưu thông tin vào database'],
          ['2️⃣ Thu thập tracking data','Source, medium, scroll depth, time on page, CTA clicks...'],
          ['3️⃣ Gửi POST request','Đến tất cả webhook đang Active trong vòng <1 giây'],
          ['4️⃣ Tích hợp bất kỳ nơi nào','Make.com, Zapier, n8n, Google Sheets, CRM, Email...']
        ].map(([t,d])=>`<div style="background:var(--dark3);border-radius:8px;padding:14px">
          <div style="font-weight:700;margin-bottom:5px;font-size:.85rem">${t}</div>
          <div style="font-size:.78rem;color:var(--gray);line-height:1.5">${d}</div>
        </div>`).join('')}
      </div>
    </div>

    <div class="wh-list">${cardsHTML}</div>`;
}

// ── Webhook actions ──────────────────────────────────────────────────────
async function testWebhook(id, btn) {
  btn.disabled = true; btn.textContent = '⏳';
  try {
    const res  = await fetch(`/admin/webhooks/${id}/test`, { method: 'POST' });
    const data = await res.json();
    if (data.success) toast(`✅ Test thành công – HTTP ${data.status} (${data.duration_ms}ms)`, 'success');
    else toast(`❌ Lỗi: ${data.error || 'HTTP ' + data.status}`, 'error');
  } catch(e) { toast('❌ Lỗi kết nối', 'error'); }
  await renderWebhooks(); // refresh to update last_triggered
}

async function toggleWebhook(id, active) {
  await fetch(`/admin/webhooks/${id}`, {
    method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ active })
  });
  toast(active ? '▶ Đã bật webhook' : '⏸ Đã tắt webhook', 'success');
  renderWebhooks();
}

async function deleteWebhook(id, name) {
  if (!confirm(`Xóa webhook "${name}"?`)) return;
  await fetch(`/admin/webhooks/${id}`, { method: 'DELETE' });
  toast('🗑 Đã xóa webhook', 'success');
  renderWebhooks();
}

function editWebhook(id, name, url, active) {
  document.getElementById('modalTitle').textContent  = 'Sửa Webhook';
  document.getElementById('modalWhId').value  = id;
  document.getElementById('whName').value     = name;
  document.getElementById('whUrl').value      = url;
  document.getElementById('whActive').checked = active;
  document.getElementById('modalOverlay').classList.remove('hidden');
}

function openAddModal() {
  document.getElementById('modalTitle').textContent  = 'Thêm Webhook';
  document.getElementById('modalWhId').value  = '';
  document.getElementById('whName').value     = '';
  document.getElementById('whUrl').value      = '';
  document.getElementById('whActive').checked = true;
  document.getElementById('modalOverlay').classList.remove('hidden');
}

function showPayload(jsonStr) {
  const data = JSON.parse(jsonStr);
  document.getElementById('payloadContent').innerHTML = syntaxHighlight(JSON.stringify(data, null, 2));
  document.getElementById('payloadOverlay').classList.remove('hidden');
}

function syntaxHighlight(json) {
  return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, match => {
    if (/^"/.test(match)) return /:$/.test(match) ? `<span class="payload-key">${match}</span>` : `<span class="payload-str">${match}</span>`;
    if (/true|false/.test(match)) return `<span class="payload-bool">${match}</span>`;
    return `<span class="payload-num">${match}</span>`;
  });
}

// Modal events
document.getElementById('modalCancel').addEventListener('click', () => document.getElementById('modalOverlay').classList.add('hidden'));
document.getElementById('payloadClose').addEventListener('click', () => document.getElementById('payloadOverlay').classList.add('hidden'));
document.getElementById('modalOverlay').addEventListener('click', e => { if (e.target===e.currentTarget) e.currentTarget.classList.add('hidden'); });
document.getElementById('payloadOverlay').addEventListener('click', e => { if (e.target===e.currentTarget) e.currentTarget.classList.add('hidden'); });

document.getElementById('modalSave').addEventListener('click', async () => {
  const id     = document.getElementById('modalWhId').value;
  const name   = document.getElementById('whName').value.trim();
  const url    = document.getElementById('whUrl').value.trim();
  const active = document.getElementById('whActive').checked;
  if (!name || !url) return toast('Vui lòng điền đủ thông tin', 'error');
  try { new URL(url); } catch { return toast('URL không hợp lệ', 'error'); }

  const method  = id ? 'PUT' : 'POST';
  const endpoint = id ? `/admin/webhooks/${id}` : '/admin/webhooks';
  const res  = await fetch(endpoint, { method, headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name, url, active }) });
  const data = await res.json();
  if (data.error) return toast('❌ ' + data.error, 'error');
  document.getElementById('modalOverlay').classList.add('hidden');
  toast(id ? '✅ Đã cập nhật webhook' : '✅ Đã thêm webhook', 'success');
  renderWebhooks();
});

// ════════════════════════════════════════════════════════════════════════
// SURVEY
// ════════════════════════════════════════════════════════════════════════
async function connectZoom() {
  const res = await fetch('/admin/zoom/auth-url');
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.url) return toast(data.error || 'Khong tao duoc link ket noi Zoom', 'error');
  window.open(data.url, '_blank', 'noopener,noreferrer');
}

async function syncZoom() {
  if (!confirm('Dong bo Zoom trong 30 ngay gan nhat? Qua trinh nay co the mat vai phut neu co nhieu meeting.')) return;
  toast('Dang dong bo Zoom...', 'success');
  const res = await fetch('/admin/zoom/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return toast(data.error || 'Dong bo Zoom that bai', 'error');
  zoomSyncState = data.job || null;
  invalidateViewCache('zoom', 'leads', 'connector');
  if (zoomSyncState?.status === 'completed') {
    const r = zoomSyncState.result || zoomSyncState || {};
    toast(`Zoom sync xong: ${fmt(r.participants_scanned || 0)} participants, ${fmt(r.participants_matched || 0)} matched`, 'success');
  } else if (zoomSyncState?.status === 'failed') {
    toast(zoomSyncState.error || 'Zoom sync bi loi', 'error');
  } else {
    toast('Da bat dau Zoom sync. Dang theo doi tien trinh...', 'success');
  }
  renderConnector();
  pollZoomSyncStatus(true);
}

async function pollZoomSyncStatus(forceRender = false) {
  clearTimeout(zoomSyncPollTimer);
  const res = await fetch('/admin/zoom/sync-status').catch(() => null);
  if (res?.ok) zoomSyncState = await res.json().catch(() => zoomSyncState);
  if (forceRender || zoomSyncState?.running || zoomSyncState?.status === 'completed' || zoomSyncState?.status === 'failed') {
    renderConnector();
  }
  if (zoomSyncState?.running) {
    zoomSyncPollTimer = setTimeout(() => pollZoomSyncStatus(true), 1500);
  } else if (zoomSyncState?.status === 'completed') {
    invalidateViewCache('zoom', 'leads', 'connector');
    const r = zoomSyncState.result || zoomSyncState || {};
    toast(`Zoom sync xong: ${fmt(r.participants_matched || 0)} matched, ${fmt(r.leads_updated || 0)} lead updated`, 'success');
  } else if (zoomSyncState?.status === 'failed') {
    toast(zoomSyncState.error || 'Zoom sync bi loi', 'error');
  }
}

let zoomSyncHistoryCache = [];

async function renderConnector() {
  if (currentUser?.role !== 'admin') {
    document.getElementById('mainConnector').innerHTML = '<div class="loading">Ban khong co quyen xem muc nay.</div>';
    return;
  }
  const zoomStatus = await fetch('/admin/zoom/status').then(r => r.ok ? r.json() : null).catch(() => null);
  zoomSyncState = zoomStatus?.sync_job || zoomSyncState;
  zoomSyncHistoryCache = zoomStatus?.sync_history || [];
  const syncJob = zoomSyncState || {};
  const syncRunning = !!syncJob.running;
  if (syncRunning && !zoomSyncPollTimer) {
    zoomSyncPollTimer = setTimeout(() => pollZoomSyncStatus(true), 1500);
  }
  const syncResult = syncJob.result || {};
  const syncProgressHTML = syncJob.status && syncJob.status !== 'idle'
    ? `<div class="card-note" style="margin-top:6px">
        <span style="color:${syncJob.status === 'completed' ? 'var(--green)' : syncJob.status === 'failed' ? 'var(--red)' : 'var(--gold)'};font-weight:700">${syncRunning ? 'Dang sync' : syncJob.status}</span>
        - ${escHtml(syncJob.stage || '')}
        <br>Users: ${fmt(syncJob.users_scanned || 0)}/${fmt(syncJob.users_total || 0)}
        - Meetings: ${fmt(syncJob.meetings_scanned || syncResult.meetings_scanned || 0)}
        - Skipped: ${fmt(syncJob.meetings_skipped || syncResult.meetings_skipped || 0)}
        - Participants: ${fmt(syncJob.participants_scanned || syncResult.participants_scanned || 0)}
        - Matched: ${fmt(syncJob.participants_matched || syncResult.participants_matched || 0)}
        - Leads updated: ${fmt(syncJob.leads_updated || syncResult.leads_updated || 0)}
      </div>${syncJob.status === 'failed' ? `<div class="card-note" style="margin-top:6px;color:var(--red);font-weight:700">Loi: ${escHtml(syncJob.error || 'Khong ro loi')}</div>` : ''}`
    : '';
  const historyRows = zoomSyncHistoryCache.map((h, i) => {
    const r = h.result || {};
    const statusColor = h.status === 'failed' ? 'var(--red)' : 'var(--green)';
    return `<tr class="lead-row" onclick="openZoomSyncLog(${i})">
      <td>${h.finished_at ? fmtDate(h.finished_at) : '-'}</td>
      <td><span style="color:${statusColor};font-weight:800">${escHtml(h.status || '-')}</span></td>
      <td style="text-align:right">${fmt(r.meetings_scanned || 0)}</td>
      <td style="text-align:right">${fmt(r.meetings_skipped || 0)}</td>
      <td style="text-align:right">${fmt(r.participants_scanned || 0)}</td>
      <td style="text-align:right">${fmt(r.participants_matched || 0)}</td>
      <td style="text-align:right">${fmt(r.leads_updated || 0)}</td>
      <td style="text-align:right"><button class="btn-sm-action test" onclick="event.stopPropagation();openZoomSyncLog(${i})">Xem log</button></td>
    </tr>`;
  }).join('');
  document.getElementById('mainConnector').innerHTML = `
    <div class="section-sep">Connector</div>
    <div class="table-card" style="margin-bottom:14px">
      <div class="table-head-bar">
        <div>
          <span class="card-title">Zoom Integration</span>
          <div class="card-note" style="margin-top:4px">
            Kieu ket noi: <span style="color:var(--blue);font-weight:700">${zoomStatus?.auth_type === 'server_to_server' ? 'Server-to-Server OAuth' : 'General OAuth'}</span>
            · ${zoomStatus?.configured ? '<span style="color:var(--green);font-weight:700">Da cau hinh env</span>' : '<span style="color:var(--red);font-weight:700">Thieu env Zoom</span>'}
            ${zoomStatus?.connected ? ' · <span style="color:var(--green);font-weight:700">San sang sync</span>' : ' · <span style="color:var(--gold);font-weight:700">Chua ket noi OAuth</span>'}
          </div>
          ${zoomStatus?.last_sync ? `<div class="card-note" style="margin-top:4px">Lan sync gan nhat: ${fmtDate(zoomStatus.last_sync.synced_at)} · ${fmt(zoomStatus.last_sync.participants_matched || 0)} participants matched · ${fmt(zoomStatus.last_sync.leads_updated || 0)} leads updated · ${fmt(zoomStatus.last_sync.meetings_skipped || 0)} meetings skipped</div>` : ''}
          ${syncProgressHTML}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
          ${zoomStatus?.auth_type === 'server_to_server' ? '' : '<button class="btn-hdr" onclick="connectZoom()">Ket noi Zoom</button>'}
          <button class="btn-primary" onclick="syncZoom()" ${syncRunning ? 'disabled' : ''}>${syncRunning ? 'Dang sync...' : 'Sync 30 ngay'}</button>
        </div>
      </div>
    </div>
    <div class="table-card">
      <div class="table-head-bar">
        <div>
          <span class="card-title">Lich su sync Zoom</span>
          <div class="card-note" style="margin-top:4px">Click mot lan sync de xem log chi tiet.</div>
        </div>
        <span class="card-note">${fmt(zoomSyncHistoryCache.length)} lan sync</span>
      </div>
      <div class="table-wrap" style="max-height:480px">
        <table>
          <thead><tr><th>Thoi gian</th><th>Status</th><th style="text-align:right">Meetings</th><th style="text-align:right">Skipped</th><th style="text-align:right">Participants</th><th style="text-align:right">Matched</th><th style="text-align:right">Leads</th><th style="text-align:right">Log</th></tr></thead>
          <tbody>${historyRows || '<tr><td colspan="8" style="text-align:center;padding:34px;color:var(--gray)">Chua co lich su sync.</td></tr>'}</tbody>
        </table>
      </div>
    </div>`;
  viewCache.connector = true;
}

function openZoomSyncLog(index) {
  const item = zoomSyncHistoryCache[index];
  if (!item) return toast('Khong tim thay log sync', 'error');
  document.getElementById('drawerOverlay').classList.add('open');
  document.getElementById('leadDrawer').classList.add('open');
  document.getElementById('leadDrawer').classList.remove('zoom-detail-drawer');
  document.getElementById('drawerName').textContent = 'Log sync Zoom';
  document.getElementById('drawerPhone').textContent = item.finished_at ? fmtDate(item.finished_at) : '';
  const rows = (item.logs || []).slice().reverse().map(row => {
    const levelColor = row.level === 'error' ? 'var(--red)' : row.level === 'success' ? 'var(--green)' : 'var(--gold)';
    return `<div style="display:grid;grid-template-columns:112px 76px 1fr;gap:8px;padding:9px 0;border-top:1px solid rgba(113,113,122,.18);font-size:.76rem;line-height:1.45">
      <div style="color:var(--gray);font-family:monospace">${row.at ? new Date(row.at).toLocaleTimeString('vi-VN', { hour:'2-digit', minute:'2-digit', second:'2-digit' }) : '-'}</div>
      <div style="color:${levelColor};font-weight:800;text-transform:uppercase">${escHtml(row.level || 'info')}</div>
      <div>
        <div style="color:var(--white);word-break:break-word">${escHtml(row.message || '')}</div>
        <div style="color:var(--gray);margin-top:2px">U ${fmt(row.users_scanned || 0)}/${fmt(row.users_total || 0)} - M ${fmt(row.meetings_scanned || 0)} - Skip ${fmt(row.meetings_skipped || 0)} - P ${fmt(row.participants_scanned || 0)} - Match ${fmt(row.participants_matched || 0)} - Lead ${fmt(row.leads_updated || 0)}</div>
      </div>
    </div>`;
  }).join('');
  document.getElementById('drawerBody').innerHTML = `
    <div class="detail-grid" style="margin-bottom:14px">
      <div class="detail-item"><div class="di-label">Status</div><div class="di-val">${escHtml(item.status || '-')}</div></div>
      <div class="detail-item"><div class="di-label">Bat dau</div><div class="di-val">${item.started_at ? fmtDate(item.started_at) : '-'}</div></div>
      <div class="detail-item"><div class="di-label">Ket thuc</div><div class="di-val">${item.finished_at ? fmtDate(item.finished_at) : '-'}</div></div>
    </div>
    ${item.error ? `<div style="color:var(--red);font-weight:700;margin-bottom:12px">${escHtml(item.error)}</div>` : ''}
    <div style="background:var(--dark3);border:1px solid var(--border);border-radius:8px;padding:10px 12px">
      ${rows || '<div style="color:var(--gray);padding:18px;text-align:center">Khong co log.</div>'}
    </div>`;
}

async function renderUsers() {
  if (currentUser?.role !== 'admin') {
    document.getElementById('mainUsers').innerHTML = '<div class="loading">Bạn không có quyền xem mục này.</div>';
    return;
  }
  await Promise.all([loadCrmUsers(), loadCrmSettings()]);
  const zoomStatus = null;
  zoomSyncState = zoomStatus?.sync_job || zoomSyncState;
  const syncJob = zoomSyncState || {};
  const syncRunning = !!syncJob.running;
  if (syncRunning && !zoomSyncPollTimer) {
    zoomSyncPollTimer = setTimeout(() => pollZoomSyncStatus(true), 1500);
  }
  const syncResult = syncJob.result || {};
  const syncErrorHTML = syncJob.status === 'failed'
    ? `<div class="card-note" style="margin-top:6px;color:var(--red);font-weight:700">Loi: ${escHtml(syncJob.error || 'Khong ro loi')}</div>`
    : '';
  const syncProgressHTML = syncJob.status && syncJob.status !== 'idle'
    ? `<div class="card-note" style="margin-top:6px">
        <span style="color:${syncJob.status === 'completed' ? 'var(--green)' : syncJob.status === 'failed' ? 'var(--red)' : 'var(--gold)'};font-weight:700">${syncRunning ? 'Dang sync' : syncJob.status}</span>
        - ${escHtml(syncJob.stage || '')}
        <br>Users: ${fmt(syncJob.users_scanned || 0)}/${fmt(syncJob.users_total || 0)}
        - Meetings: ${fmt(syncJob.meetings_scanned || syncResult.meetings_scanned || 0)}
        - Participants: ${fmt(syncJob.participants_scanned || syncResult.participants_scanned || 0)}
        - Matched: ${fmt(syncJob.participants_matched || syncResult.participants_matched || 0)}
        - Leads updated: ${fmt(syncJob.leads_updated || syncResult.leads_updated || 0)}
      </div>${syncErrorHTML}`
    : '';
  const syncLogs = (syncJob.logs || []).slice(-18).reverse();
  const syncLogsHTML = syncLogs.length
    ? `<div style="margin-top:10px;background:var(--dark3);border:1px solid var(--border);border-radius:8px;padding:10px 12px;max-height:260px;overflow:auto">
        <div style="display:flex;justify-content:space-between;gap:10px;margin-bottom:8px;align-items:center">
          <span class="card-title">Zoom sync log</span>
          <span class="card-note">${fmt((syncJob.logs || []).length)} dong</span>
        </div>
        ${syncLogs.map(row => {
          const levelColor = row.level === 'error' ? 'var(--red)' : row.level === 'success' ? 'var(--green)' : 'var(--gold)';
          return `<div style="display:grid;grid-template-columns:112px 70px 1fr;gap:8px;padding:7px 0;border-top:1px solid rgba(113,113,122,.18);font-size:.74rem;line-height:1.45">
            <div style="color:var(--gray);font-family:monospace">${row.at ? new Date(row.at).toLocaleTimeString('vi-VN', { hour:'2-digit', minute:'2-digit', second:'2-digit' }) : '-'}</div>
            <div style="color:${levelColor};font-weight:800;text-transform:uppercase">${escHtml(row.level || 'info')}</div>
            <div>
              <div style="color:var(--white);word-break:break-word">${escHtml(row.message || '')}</div>
              <div style="color:var(--gray);margin-top:2px">U ${fmt(row.users_scanned || 0)}/${fmt(row.users_total || 0)} - M ${fmt(row.meetings_scanned || 0)} - P ${fmt(row.participants_scanned || 0)} - Match ${fmt(row.participants_matched || 0)} - Lead ${fmt(row.leads_updated || 0)}</div>
            </div>
          </div>`;
        }).join('')}
      </div>`
    : '';
  const zoomCard = `
    <div class="table-card" style="margin-bottom:14px">
      <div class="table-head-bar">
        <div>
          <span class="card-title">Zoom Integration</span>
          <div class="card-note" style="margin-top:4px">
            Kieu ket noi: <span style="color:var(--blue);font-weight:700">${zoomStatus?.auth_type === 'server_to_server' ? 'Server-to-Server OAuth' : 'General OAuth'}</span>
            · ${zoomStatus?.configured ? '<span style="color:var(--green);font-weight:700">Da cau hinh env</span>' : '<span style="color:var(--red);font-weight:700">Thieu env Zoom</span>'}
            ${zoomStatus?.connected ? ' · <span style="color:var(--green);font-weight:700">San sang sync</span>' : ' · <span style="color:var(--gold);font-weight:700">Chua ket noi OAuth</span>'}
          </div>
          ${zoomStatus?.last_sync ? `<div class="card-note" style="margin-top:4px">Lan sync gan nhat: ${fmtDate(zoomStatus.last_sync.synced_at)} · ${fmt(zoomStatus.last_sync.participants_matched || 0)} participants matched · ${fmt(zoomStatus.last_sync.leads_updated || 0)} leads updated</div>` : ''}
          ${syncProgressHTML}
          ${syncLogsHTML}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
          ${zoomStatus?.auth_type === 'server_to_server' ? '' : '<button class="btn-hdr" onclick="connectZoom()">Ket noi Zoom</button>'}
          <button class="btn-primary" onclick="syncZoom()" ${syncRunning ? 'disabled' : ''}>${syncRunning ? 'Dang sync...' : 'Sync 30 ngay'}</button>
        </div>
      </div>
    </div>`;
  const rows = crmUsers.map(u => `
    <tr>
      <td style="font-family:monospace;font-size:.72rem;color:var(--gray)">${u.user_id}</td>
      <td><input class="crm-input" id="name-${u.user_id}" value="${escAttr(u.full_name || '')}"></td>
      <td>${escHtml(u.email || '')}</td>
      <td><select class="crm-select" id="role-${u.user_id}">
        <option value="sale" ${u.role==='sale'?'selected':''}>sale</option>
        <option value="admin" ${u.role==='admin'?'selected':''}>admin</option>
      </select></td>
      <td><label class="toggle"><input type="checkbox" id="active-${u.user_id}" ${u.active!==false?'checked':''}><span class="toggle-slider"></span></label></td>
      <td><button class="btn-sm-action toggle" onclick="saveCrmUser('${u.user_id}')">Lưu</button></td>
    </tr>`).join('');
  const assignmentRows = (crmSettings.assignment || []).map(a => `
    <tr>
      <td style="font-weight:650">${escHtml(a.full_name || a.email || '')}<div style="font-size:.68rem;color:var(--gray)">${escHtml(a.email || '')}</div></td>
      <td><input class="crm-input" type="number" min="0" max="100" step="1" id="leadWeight-${a.user_id}" value="${a.weight}" style="max-width:110px"></td>
      <td style="color:var(--gray);font-size:.78rem">${a.target_share}%</td>
      <td style="color:${Math.abs((a.actual_share || 0) - (a.target_share || 0)) > 10 ? 'var(--gold)' : 'var(--green)'};font-weight:700">${a.actual_share}%</td>
      <td style="color:var(--gray)">${fmt(a.assigned_count || 0)}</td>
    </tr>`).join('');
  const fieldTypes = [
    ['text','Text'], ['number','Number'], ['date','Date'], ['boolean','True/False'],
    ['dropdown','Dropdown'], ['multiselect','Multi-select'], ['url','URL'], ['currency','Currency']
  ];
  const fieldRows = (crmSettings.customFields || []).map(f => {
    return `<tr>
      <td style="font-weight:650">${escHtml(f.label)}<div style="font-size:.68rem;color:var(--gray);font-family:monospace">${escHtml(f.key)}</div></td>
      <td><span class="role-pill sale">${escHtml(f.type)}</span></td>
      <td>${escHtml(f.group_name || '')}</td>
      <td>${f.required ? '<span style="color:var(--gold);font-weight:700">Bắt buộc</span>' : '<span class="empty">Không</span>'}</td>
      <td><button class="btn-sm-action" onclick="editCustomField('${f.id}')">Sửa</button> <button class="btn-sm-action del" onclick="deleteCustomField('${f.id}',decodeURIComponent('${encAttr(f.key)}'))">Xóa</button></td>
    </tr>`;
  }).join('');
  const scoringRules = crmSettings.scoringRules || [];
  const scoringRows = scoringRules.map((rule, i) => scoringRuleRowHTML(rule, i)).join('');

  document.getElementById('mainUsers').innerHTML = `
    <div class="table-card" style="margin-bottom:14px">
      <div class="table-head-bar">
        <div>
          <span class="card-title">Nhân sự CRM</span>
          <div class="card-note" style="margin-top:4px">Tạo tài khoản trong Supabase Auth, sau đó thêm dòng trong bảng crm_profiles.</div>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>User ID</th><th>Tên hiển thị</th><th>Email</th><th>Role</th><th>Active</th><th></th></tr></thead>
          <tbody>${rows || '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--gray)">Chưa có nhân viên CRM.</td></tr>'}</tbody>
        </table>
      </div>
    </div>

    <div class="table-card" style="margin-bottom:14px">
      <div class="table-head-bar">
        <div>
          <span class="card-title">Tỷ lệ chia lead tự động</span>
          <div class="card-note" style="margin-top:4px">Weight 0 = không nhận lead mới. Thuật toán chọn sale có tải thực tế thấp nhất so với weight.</div>
        </div>
        <button class="btn-primary" onclick="saveLeadWeights()">Lưu tỷ lệ</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Sale</th><th>Weight</th><th>Tỷ lệ mục tiêu</th><th>Tỷ lệ thực tế</th><th>Lead đã nhận</th></tr></thead>
          <tbody>${assignmentRows || '<tr><td colspan="5" style="text-align:center;padding:30px;color:var(--gray)">Chưa có sale active.</td></tr>'}</tbody>
        </table>
      </div>
    </div>

    <div class="table-card" style="margin-bottom:14px">
      <div class="table-head-bar">
        <div>
          <span class="card-title">Lead Scoring Rules</span>
          <div class="card-note" style="margin-top:4px">Tu dong cong/tru diem lead theo thong tin co san, tags, activity va custom fields.</div>
        </div>
        <button class="btn-primary" onclick="saveScoringRules()">Luu rules</button>
      </div>
      <div style="padding:14px 18px">
        <div style="display:grid;grid-template-columns:1fr 96px;gap:8px;color:var(--gray);font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">
          <div>Rules</div><div>Points</div>
        </div>
        <div id="scoringRulesList">${scoringRows || '<div style="padding:22px 0;color:var(--gray);font-style:italic">Chua co rule cham diem.</div>'}</div>
        <button class="btn-sm-action test" type="button" style="margin-top:12px" onclick="addScoringRule()">+ Add a rule</button>
      </div>
    </div>

    <div class="table-card">
      <div class="table-head-bar">
        <div>
          <span class="card-title">Custom Fields Engine</span>
          <div class="card-note" style="margin-top:4px">Admin tạo trường tuỳ chỉnh, chọn kiểu dữ liệu và gom field theo danh mục.</div>
        </div>
        <button class="btn-primary" onclick="openCustomFieldForm()">+ Thêm field</button>
      </div>
      <div class="card" id="customFieldForm" style="display:none;margin:14px 18px">
        <input type="hidden" id="customFieldId">
        <div class="row row-3" style="margin-bottom:10px">
          <div class="form-group"><label>Tên field</label><input class="crm-input" id="cfLabel" placeholder="VD: Vốn đầu tư"></div>
          <div class="form-group"><label>Field key</label><input class="crm-input" id="cfKey" placeholder="von_dau_tu"></div>
          <div class="form-group"><label>Kiểu dữ liệu</label><select class="crm-select" id="cfType">${fieldTypes.map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></div>
        </div>
        <div class="row row-2" style="margin-bottom:10px">
          <div class="form-group"><label>Danh mục</label><input class="crm-input" id="cfGroup" placeholder="VD: Tài chính" value="Khác"></div>
          <div class="form-group"><label>Giá trị mặc định</label><input class="crm-input" id="cfDefault"></div>
        </div>
        <div class="row row-2" style="margin-bottom:10px">
          <div class="form-group"><label>Options cho dropdown / multi-select</label><textarea class="note-box" id="cfOptions" style="min-height:88px" placeholder="Mỗi dòng một lựa chọn"></textarea></div>
          <div class="form-group">
            <label>Quy tắc</label>
            <div style="display:flex;gap:14px;align-items:center;min-height:42px;flex-wrap:wrap">
              <label style="font-size:.82rem;color:var(--gray)"><input type="checkbox" id="cfRequired"> Bắt buộc</label>
            </div>
          </div>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px">
          <button class="btn-cancel" onclick="closeCustomFieldForm()">Hủy</button>
          <button class="btn-primary" onclick="saveCustomField()">Lưu field</button>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Field</th><th>Type</th><th>Danh mục</th><th>Required</th><th></th></tr></thead>
          <tbody>${fieldRows || '<tr><td colspan="5" style="text-align:center;padding:30px;color:var(--gray)">Chưa có custom field.</td></tr>'}</tbody>
        </table>
      </div>
    </div>`;
  viewCache.users = true;
}

async function renderTags() {
  if (currentUser?.role !== 'admin') {
    document.getElementById('mainTags').innerHTML = '<div class="loading">Bạn không có quyền xem mục này.</div>';
    return;
  }
  await loadCrmTags({ counts: false });
  const categoryOptions = (crmSettings.tagCategories || []).map(c => `<option value="${escAttr(c.id)}">${escHtml(c.name)}</option>`).join('');
  const tagCategoryRows = (crmSettings.tagCategories || []).map(c => `
    <tr>
      <td><span class="tag-chip"><span class="tag-dot" style="background:${escAttr(c.color)}"></span>${escHtml(c.name)}</span></td>
      <td style="font-family:monospace;color:var(--gray);font-size:.72rem">${escHtml(c.id)}</td>
      <td><button class="btn-sm-action" onclick="editTagCategory('${c.id}')">Sửa</button> <button class="btn-sm-action del" onclick="deleteTagCategory('${c.id}',decodeURIComponent('${encAttr(c.name)}'))">Xóa</button></td>
    </tr>`).join('');
  const tagRows = (crmSettings.tags || []).map(t => `
    <tr>
      <td><span class="tag-chip"><span class="tag-dot" style="background:${escAttr(t.color)}"></span>${escHtml(t.name)}</span><div style="font-size:.68rem;color:var(--gray);font-family:monospace">${escHtml(t.slug || '')}</div></td>
      <td>${escHtml(t.category_name || 'Khác')}</td>
      <td>${escHtml(t.description || '')}</td>
      <td>${t.active !== false ? '<span style="color:var(--green);font-weight:700">Active</span>' : '<span class="empty">Inactive</span>'}</td>
      <td><button class="btn-sm-action" onclick="editCrmTag('${t.id}')">Sửa</button> <button class="btn-sm-action del" onclick="deleteCrmTag('${t.id}',decodeURIComponent('${encAttr(t.name)}'))">Xóa</button></td>
    </tr>`).join('');

  document.getElementById('mainTags').innerHTML = `
    <div class="table-card" style="margin-bottom:14px">
      <div class="table-head-bar">
        <div>
          <span class="card-title">Danh mục tag</span>
          <div class="card-note" style="margin-top:4px">Gom tag theo chủ đề như Hành vi, Nguồn, Sản phẩm, Trạng thái hoặc Chiến dịch.</div>
        </div>
      </div>
      <div class="card" style="margin:14px 18px">
        <div class="row row-3" style="margin-bottom:10px">
          <input type="hidden" id="tagCategoryId">
          <div class="form-group"><label>Danh mục tag</label><input class="crm-input" id="tagCategoryName" placeholder="VD: Hành vi, Nguồn, Trạng thái"></div>
          <div class="form-group"><label>Màu</label><input class="crm-input" id="tagCategoryColor" type="color" value="#5c6ac4" style="height:42px;padding:5px"></div>
          <div class="form-group" style="display:flex;align-items:flex-end;gap:8px"><button class="btn-primary" onclick="saveTagCategory()">Lưu danh mục</button><button class="btn-cancel" onclick="resetTagCategoryForm()">Hủy</button></div>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Danh mục</th><th>ID</th><th></th></tr></thead>
          <tbody>${tagCategoryRows || '<tr><td colspan="3" style="text-align:center;padding:30px;color:var(--gray)">Chưa có danh mục tag.</td></tr>'}</tbody>
        </table>
      </div>
    </div>

    <div class="table-card">
      <div class="table-head-bar">
        <div>
          <span class="card-title">Tag System</span>
          <div class="card-note" style="margin-top:4px">Admin tạo/sửa/xóa tag. Sale/Admin gắn tag thủ công trong popup chi tiết lead.</div>
        </div>
      </div>
      <div class="card" style="margin:14px 18px">
        <div class="row row-3" style="margin-bottom:10px">
          <input type="hidden" id="crmTagId">
          <div class="form-group"><label>Tên tag</label><input class="crm-input" id="crmTagName" placeholder="VD: Lead nóng"></div>
          <div class="form-group"><label>Danh mục</label><select class="crm-select" id="crmTagCategory"><option value="">Khác</option>${categoryOptions}</select></div>
          <div class="form-group"><label>Màu</label><input class="crm-input" id="crmTagColor" type="color" value="#5c6ac4" style="height:42px;padding:5px"></div>
        </div>
        <div class="row row-2" style="margin-bottom:10px">
          <div class="form-group"><label>Mô tả</label><input class="crm-input" id="crmTagDescription" placeholder="Ghi chú nội bộ cho tag này"></div>
          <div class="form-group" style="display:flex;align-items:flex-end;gap:8px"><button class="btn-primary" onclick="saveCrmTag()">Lưu tag</button><button class="btn-cancel" onclick="resetCrmTagForm()">Hủy</button></div>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Tag</th><th>Danh mục</th><th>Mô tả</th><th>Trạng thái</th><th></th></tr></thead>
          <tbody>${tagRows || '<tr><td colspan="5" style="text-align:center;padding:30px;color:var(--gray)">Chưa có tag.</td></tr>'}</tbody>
        </table>
      </div>
    </div>`;
  viewCache.tags = true;
}

function openCrmTagForm() {
  tagFormOpen = true;
  renderTags();
}

async function renderTags() {
  if (currentUser?.role !== 'admin') {
    document.getElementById('mainTags').innerHTML = '<div class="loading">Bạn không có quyền xem mục này.</div>';
    return;
  }
  await loadCrmTags({ counts: false });
  const categories = crmSettings.tagCategories || [];
  const allTags = crmSettings.tags || [];
  const normalizedSearch = tagSearch.trim().toLowerCase();
  const visibleTags = allTags.filter(t => {
    const matchName = !normalizedSearch || String(t.name || '').toLowerCase().includes(normalizedSearch) || String(t.slug || '').toLowerCase().includes(normalizedSearch);
    const matchCategory = !tagCategoryFilter || (t.category_id || '') === tagCategoryFilter;
    return matchName && matchCategory;
  });
  const categoryOptions = categories.map(c => `<option value="${escAttr(c.id)}">${escHtml(c.name)}</option>`).join('');
  const categoryFilterOptions = categories.map(c => `<option value="${escAttr(c.id)}" ${tagCategoryFilter === c.id ? 'selected' : ''}>${escHtml(c.name)}</option>`).join('');
  const categoryRows = categories.map(c => `
    <tr>
      <td style="font-family:monospace;color:var(--gray);font-size:.72rem">${escHtml(String(c.id || '').slice(0, 8))}</td>
      <td style="font-weight:650">${escHtml(c.name || '')}</td>
      <td style="text-align:right">
        <button class="btn-sm-action" onclick="editTagCategory('${c.id}')">Sua</button>
        <button class="btn-sm-action del" onclick="deleteTagCategory('${c.id}',decodeURIComponent('${encAttr(c.name)}'))">Xoa</button>
      </td>
    </tr>`).join('');
  const tagRows = visibleTags.map(t => `
    <tr>
      <td style="width:44px"><input type="checkbox" aria-label="Chọn tag"></td>
      <td style="font-family:monospace;color:var(--gray);font-size:.72rem">${escHtml(String(t.id || '').slice(0, 8))}</td>
      <td style="font-weight:650;color:var(--blue)">${escHtml(t.name || '')}<div style="font-size:.68rem;color:var(--gray);font-family:monospace">${escHtml(t.slug || '')}</div></td>
      <td>${escHtml(t.category_name || 'Khác')}</td>
      <td><button class="btn-sm-action test" type="button" id="tagCount-${escAttr(t.id)}" onclick="showTagPeopleCount('${escAttr(t.id)}')">Show number</button></td>
      <td style="text-align:right">
        <button class="btn-sm-action" onclick="editCrmTag('${t.id}')">Sửa</button>
        <button class="btn-sm-action del" onclick="deleteCrmTag('${t.id}',decodeURIComponent('${encAttr(t.name)}'))">Xóa</button>
      </td>
    </tr>`).join('');

  document.getElementById('mainTags').innerHTML = `
    <div class="table-card">
      <div class="table-head-bar">
        <div>
          <div style="font-size:1.8rem;font-weight:750;margin-bottom:4px">Tags</div>
          <div class="card-note">${fmt(visibleTags.length)} results${visibleTags.length !== allTags.length ? ` / ${fmt(allTags.length)} total` : ''}</div>
        </div>
        <button class="btn-primary" onclick="openCrmTagForm()">Add Tag</button>
      </div>
      <div style="padding:14px 18px;border-bottom:1px solid var(--border)">
        <div class="card-title" style="margin-bottom:10px">Danh muc tag</div>
        <div style="display:grid;grid-template-columns:minmax(240px,1fr) auto auto;gap:8px;align-items:end;margin-bottom:12px">
          <input type="hidden" id="tagCategoryId">
          <input type="hidden" id="tagCategoryColor" value="#5c6ac4">
          <div class="form-group" style="margin:0"><label>Name</label><input class="crm-input" id="tagCategoryName" placeholder="VD: Nguon lead"></div>
          <button class="btn-primary" onclick="saveTagCategory()">Luu danh muc</button>
          <button class="btn-cancel" onclick="resetTagCategoryForm()">Huy</button>
        </div>
        <div class="table-wrap" style="max-height:220px">
          <table>
            <thead><tr><th>Id</th><th>Name</th><th style="text-align:right">Actions</th></tr></thead>
            <tbody>${categoryRows || '<tr><td colspan="3" style="text-align:center;padding:24px;color:var(--gray)">Chua co danh muc tag.</td></tr>'}</tbody>
          </table>
        </div>
      </div>
      <div style="padding:14px 18px;border-bottom:1px solid var(--border);display:flex;align-items:end;justify-content:space-between;gap:14px;flex-wrap:wrap">
        <div style="display:flex;align-items:end;gap:10px;flex-wrap:wrap">
          <div class="form-group" style="margin:0;min-width:260px"><label>Name</label><input class="crm-input" id="tagSearchInput" value="${escAttr(tagSearch)}" placeholder="Search tag name"></div>
          <button class="btn-hdr" id="tagSearchBtn">Search</button>
        </div>
        <div class="form-group" style="margin:0;min-width:260px"><label>Category</label><select class="crm-select" id="tagCategoryFilter"><option value="">Show all categories</option>${categoryFilterOptions}</select></div>
      </div>
      <div class="card" id="crmTagForm" style="display:${tagFormOpen ? 'block' : 'none'};margin:14px 18px">
        <div class="row row-3" style="margin-bottom:0">
          <input type="hidden" id="crmTagId">
          <div class="form-group"><label>Name</label><input class="crm-input" id="crmTagName" placeholder="VD: Lead nóng"></div>
          <div class="form-group"><label>Category</label><select class="crm-select" id="crmTagCategory"><option value="">Khác</option>${categoryOptions}</select></div>
          <div class="form-group" style="display:flex;align-items:flex-end;gap:8px"><button class="btn-primary" onclick="saveCrmTag()">Lưu tag</button><button class="btn-cancel" onclick="resetCrmTagForm()">Hủy</button></div>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th></th><th>Id</th><th>Name</th><th>Category</th><th>Number of people</th><th style="text-align:right">Actions</th></tr></thead>
          <tbody>${tagRows || '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--gray)">Chưa có tag phù hợp.</td></tr>'}</tbody>
        </table>
      </div>
    </div>`;
  document.getElementById('tagSearchInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      tagSearch = e.target.value.trim();
      viewCache.tags = false;
      renderTags();
    }
  });
  document.getElementById('tagSearchBtn')?.addEventListener('click', () => {
    tagSearch = document.getElementById('tagSearchInput')?.value.trim() || '';
    viewCache.tags = false;
    renderTags();
  });
  document.getElementById('tagCategoryFilter')?.addEventListener('change', e => {
    tagCategoryFilter = e.target.value;
    viewCache.tags = false;
    renderTags();
  });
  viewCache.tags = true;
}

function getScoringFieldOptions() {
  const base = [
    ['tags', 'Tags'],
    ['email_open', 'Email Open'],
    ['email_click', 'Email Click'],
    ['name', 'Name'],
    ['email', 'Email'],
    ['phone', 'Phone'],
    ['page_id', 'Page'],
    ['region', 'Khu vuc'],
    ['attendance', 'Hinh thuc'],
    ['utm_source', 'UTM source'],
    ['utm_medium', 'UTM medium'],
    ['utm_campaign', 'UTM campaign'],
    ['utm_content', 'UTM content'],
    ['utm_term', 'UTM term'],
    ['country', 'Country'],
    ['city', 'City'],
  ];
  const custom = (crmSettings.customFields || []).map(f => [`custom:${f.id}`, `Custom: ${f.label}`]);
  return base.concat(custom);
}

function getScoringFieldMeta(field) {
  if (field === 'email_open' || field === 'email_click') return { type: 'number' };
  if (field === 'tags') {
    return {
      type: 'select',
      multi: true,
      options: (crmTags || []).map(t => t.name || t.slug).filter(Boolean),
    };
  }
  if (field.startsWith('custom:')) {
    const id = field.slice('custom:'.length);
    const f = (crmSettings.customFields || []).find(x => x.id === id);
    if (!f) return { type: 'text' };
    if (f.type === 'number' || f.type === 'currency') return { type: 'number' };
    if (f.type === 'date') return { type: 'date' };
    if (f.type === 'boolean') return { type: 'boolean' };
    if (f.type === 'dropdown' || f.type === 'multiselect') return { type: 'select', multi: f.type === 'multiselect', options: f.options || [] };
    return { type: 'text' };
  }
  const selectOptions = {
    attendance: ['Online', 'Offline', 'Manual lead'],
    utm_medium: ['cpc', 'paid', 'social', 'email', 'referral', 'organic', '(none)'],
  };
  if (selectOptions[field]) return { type: 'select', options: selectOptions[field] };
  return { type: 'text' };
}

function getScoringOperatorOptions(meta) {
  const commonEmpty = [['exists', 'has any value'], ['empty', 'is empty']];
  if (meta.type === 'number') return [['gt', '>'], ['gte', '>='], ['equals', '='], ['lt', '<'], ['lte', '<='], ...commonEmpty];
  if (meta.type === 'date') return [['gt', 'after'], ['gte', 'on/after'], ['equals', 'on'], ['lt', 'before'], ['lte', 'on/before'], ...commonEmpty];
  if (meta.type === 'boolean') return [['equals', 'is'], ['not_equals', 'is not'], ...commonEmpty];
  if (meta.type === 'select') return [['contains', 'contains'], ['not_contains', 'does not contain'], ['equals', 'equals'], ['not_equals', 'does not equal'], ...commonEmpty];
  return [['contains', 'contains'], ['not_contains', 'does not contain'], ['equals', 'equals'], ['not_equals', 'does not equal'], ...commonEmpty];
}

function normalizeScoringOperatorForField(operator, meta) {
  const ops = getScoringOperatorOptions(meta).map(([v]) => v);
  return ops.includes(operator) ? operator : ops[0];
}

function scoringValueControlHTML(rule, meta, operator) {
  const disabled = operator === 'exists' || operator === 'empty';
  const value = rule.value || '';
  if (disabled) return `<input class="crm-input score-value" value="" disabled placeholder="-">`;
  if (meta.type === 'boolean') {
    return `<select class="crm-select score-value">
      <option value="true" ${String(value) === 'true' ? 'selected' : ''}>Yes</option>
      <option value="false" ${String(value) === 'false' ? 'selected' : ''}>No</option>
    </select>`;
  }
  if (meta.type === 'select' && (meta.options || []).length) {
    return `<select class="crm-select score-value">
      <option value="">Select...</option>
      ${(meta.options || []).map(opt => `<option value="${escAttr(opt)}" ${String(value) === String(opt) ? 'selected' : ''}>${escHtml(opt)}</option>`).join('')}
    </select>`;
  }
  const inputType = meta.type === 'number' ? 'number' : (meta.type === 'date' ? 'date' : 'text');
  const placeholder = meta.type === 'number' ? 'Number' : (meta.type === 'date' ? 'Date' : 'Value');
  return `<input class="crm-input score-value" type="${inputType}" value="${escAttr(value)}" placeholder="${placeholder}">`;
}

function collectScoringRulesFromDom() {
  return Array.from(document.querySelectorAll('.scoring-rule-row')).map((row, i) => ({
    id: (crmSettings.scoringRules || [])[i]?.id || '',
    field: row.querySelector('.score-field')?.value || '',
    operator: row.querySelector('.score-op')?.value || 'contains',
    value: row.querySelector('.score-value')?.value || '',
    points: Number(row.querySelector('.score-points')?.value || 0),
    active: true,
  })).filter(r => r.field && Number.isFinite(r.points) && r.points !== 0);
}

function scoringRuleRowHTML(rule = {}, index = 0) {
  const scoringFieldOptions = getScoringFieldOptions();
  const meta = getScoringFieldMeta(rule.field || 'tags');
  const operator = normalizeScoringOperatorForField(rule.operator || 'contains', meta);
  const scoringOperatorOptions = getScoringOperatorOptions(meta);
  return `
    <div class="scoring-rule-row" data-score-rule-index="${index}">
      <div class="rule-prefix">If the</div>
      <select class="crm-select score-field" onchange="refreshScoringRuleRow(this)">${scoringFieldOptions.map(([v, l]) => `<option value="${escAttr(v)}" ${rule.field === v ? 'selected' : ''}>${escHtml(l)}</option>`).join('')}</select>
      <select class="crm-select score-op" onchange="refreshScoringRuleRow(this)">${scoringOperatorOptions.map(([v, l]) => `<option value="${escAttr(v)}" ${operator === v ? 'selected' : ''}>${escHtml(l)}</option>`).join('')}</select>
      ${scoringValueControlHTML({ ...rule, operator }, meta, operator)}
      <input class="crm-input score-points" type="number" step="1" value="${escAttr(rule.points ?? 1)}">
      <button class="btn-sm-action del" type="button" onclick="removeScoringRule(${index})">Xoa</button>
    </div>`;
}

function refreshScoringRuleRow(el) {
  const row = el?.closest('.scoring-rule-row');
  if (!row) return;
  const index = Number(row.dataset.scoreRuleIndex || 0);
  crmSettings.scoringRules = collectScoringRulesFromDom();
  row.outerHTML = scoringRuleRowHTML(crmSettings.scoringRules[index] || { field: 'tags', operator: 'contains', value: '', points: 1 }, index);
}

function renderScoringRulesEditor() {
  const target = document.getElementById('scoringRulesList');
  if (!target) return;
  const rules = crmSettings.scoringRules || [];
  target.innerHTML = rules.length
    ? rules.map((rule, i) => scoringRuleRowHTML(rule, i)).join('')
    : '<div style="padding:22px 0;color:var(--gray);font-style:italic">Chua co rule cham diem.</div>';
}

function addScoringRule() {
  crmSettings.scoringRules = collectScoringRulesFromDom();
  crmSettings.scoringRules.push({ id: '', field: 'tags', operator: 'contains', value: '', points: 1, active: true });
  renderScoringRulesEditor();
}

function removeScoringRule(index) {
  crmSettings.scoringRules = collectScoringRulesFromDom().filter((_, i) => i !== index);
  renderScoringRulesEditor();
}

async function saveScoringRules() {
  const rules = collectScoringRulesFromDom();
  const res = await fetch('/admin/crm/scoring-rules', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rules })
  });
  if (!res.ok) return toast('Khong luu duoc scoring rules', 'error');
  const data = await res.json().catch(() => ({}));
  crmSettings.scoringRules = data.rules || rules;
  toast('Da luu scoring rules', 'success');
  invalidateViewCache('users', 'leads');
  await loadCrmSettings();
  renderUsers();
}

async function saveCrmUser(userId) {
  const current = crmUsers.find(u => u.user_id === userId) || {};
  const payload = {
    email: current.email || '',
    full_name: document.getElementById(`name-${userId}`)?.value.trim() || current.email || '',
    role: document.getElementById(`role-${userId}`)?.value || 'sale',
    active: !!document.getElementById(`active-${userId}`)?.checked,
  };
  const res = await fetch(`/admin/crm/users/${userId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) return toast('Không lưu được nhân viên', 'error');
  toast('Đã cập nhật nhân viên', 'success');
  invalidateViewCache('users', 'leads');
  await loadCrmUsers();
  renderUsers();
}

async function loadCrmSettings() {
  try {
    const res = await fetch('/admin/crm/settings');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    crmSettings = await res.json();
    crmTagCategories = crmSettings.tagCategories || [];
    crmTags = crmSettings.tags || [];
    syncTagFilterOptions(crmTags);
  } catch (e) {
    crmSettings = { assignment: [], customFields: [], tagCategories: [], tags: [], scoringRules: [] };
    crmTagCategories = [];
    crmTags = [];
    syncTagFilterOptions([]);
  }
}

async function showTagPeopleCount(tagId) {
  const btn = document.getElementById(`tagCount-${tagId}`);
  if (!btn) return;
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Loading...';
  try {
    const res = await fetch(`/admin/crm/tags/${encodeURIComponent(tagId)}/people-count`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    btn.textContent = `${fmt(data.people_count || 0)} nguoi`;
    btn.classList.add('toggle');
  } catch (e) {
    btn.disabled = false;
    btn.textContent = original || 'Show number';
    toast('Khong lay duoc so nguoi cua tag', 'error');
    return;
  }
  btn.disabled = true;
}

async function saveLeadWeights() {
  const weights = {};
  (crmSettings.assignment || []).forEach(a => {
    weights[a.user_id] = Math.max(0, parseInt(document.getElementById(`leadWeight-${a.user_id}`)?.value || '0', 10) || 0);
  });
  const res = await fetch('/admin/crm/lead-assignment', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ weights })
  });
  if (!res.ok) return toast('Không lưu được tỷ lệ chia lead', 'error');
  toast('Đã cập nhật tỷ lệ chia lead', 'success');
  invalidateViewCache('users');
  await loadCrmSettings();
  renderUsers();
}

function slugifyCustomFieldKey(v) {
  return String(v || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

function openCustomFieldForm(field = null) {
  const box = document.getElementById('customFieldForm');
  if (!box) return;
  box.style.display = 'block';
  document.getElementById('customFieldId').value = field?.id || '';
  document.getElementById('cfLabel').value = field?.label || '';
  document.getElementById('cfKey').value = field?.key || '';
  document.getElementById('cfType').value = field?.type || 'text';
  document.getElementById('cfGroup').value = field?.group_name || 'Khác';
  document.getElementById('cfDefault').value = field?.default_value || '';
  document.getElementById('cfOptions').value = (field?.options || []).join('\n');
  document.getElementById('cfRequired').checked = !!field?.required;
}

function closeCustomFieldForm() {
  const box = document.getElementById('customFieldForm');
  if (box) box.style.display = 'none';
}

function editCustomField(id) {
  const field = (crmSettings.customFields || []).find(f => f.id === id);
  if (!field) return toast('Không tìm thấy custom field', 'error');
  openCustomFieldForm(field);
}

async function saveCustomField() {
  const label = document.getElementById('cfLabel')?.value.trim() || '';
  const key = document.getElementById('cfKey')?.value.trim() || slugifyCustomFieldKey(label);
  if (!label) return toast('Nhập tên field trước khi lưu', 'error');
  const id = document.getElementById('customFieldId')?.value || '';
  const type = document.getElementById('cfType')?.value || 'text';
  const options = (document.getElementById('cfOptions')?.value || '').split('\n').map(s => s.trim()).filter(Boolean);
  if ((type === 'dropdown' || type === 'multiselect') && !options.length) {
    return toast('Dropdown/Multi-select cần nhập ít nhất một option', 'error');
  }
  const payload = {
    label,
    key,
    type,
    group_name: document.getElementById('cfGroup')?.value.trim() || 'Khác',
    default_value: document.getElementById('cfDefault')?.value || '',
    options,
    required: !!document.getElementById('cfRequired')?.checked,
  };
  const res = await fetch(id ? `/admin/crm/custom-fields/${id}` : '/admin/crm/custom-fields', {
    method: id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) return toast('Không lưu được custom field', 'error');
  toast(id ? 'Đã cập nhật custom field' : 'Đã tạo custom field', 'success');
  invalidateViewCache('users', 'leads');
  await loadCrmSettings();
  renderUsers();
}

async function deleteCustomField(id, key) {
  const confirmKey = prompt(`Xóa custom field "${key}"? Gõ đúng field key để xác nhận. Dữ liệu trường này trên contact có thể bị xoá vĩnh viễn.`);
  if (confirmKey !== key) return;
  const res = await fetch(`/admin/crm/custom-fields/${id}?confirm=${encodeURIComponent(key)}`, { method: 'DELETE' });
  if (!res.ok) return toast('Không xoá được custom field', 'error');
  toast('Đã xoá custom field', 'success');
  invalidateViewCache('users', 'leads');
  await loadCrmSettings();
  renderUsers();
}

function resetTagCategoryForm() {
  const id = document.getElementById('tagCategoryId');
  if (!id) return;
  id.value = '';
  document.getElementById('tagCategoryName').value = '';
  document.getElementById('tagCategoryColor').value = '#5c6ac4';
}

function editTagCategory(id) {
  const c = (crmSettings.tagCategories || []).find(x => x.id === id);
  if (!c) return toast('Không tìm thấy danh mục tag', 'error');
  document.getElementById('tagCategoryId').value = c.id;
  document.getElementById('tagCategoryName').value = c.name || '';
  document.getElementById('tagCategoryColor').value = c.color || '#5c6ac4';
}

async function saveTagCategory() {
  const id = document.getElementById('tagCategoryId')?.value || '';
  const name = document.getElementById('tagCategoryName')?.value.trim() || '';
  const color = document.getElementById('tagCategoryColor')?.value || '#5c6ac4';
  if (!name) return toast('Nhập tên danh mục tag trước khi lưu', 'error');
  const res = await fetch(id ? `/admin/crm/tag-categories/${id}` : '/admin/crm/tag-categories', {
    method: id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, color })
  });
  if (!res.ok) return toast('Không lưu được danh mục tag', 'error');
  toast(id ? 'Đã cập nhật danh mục tag' : 'Đã tạo danh mục tag', 'success');
  invalidateViewCache('tags', 'users', 'leads');
  await loadCrmSettings();
  renderTags();
}

async function deleteTagCategory(id, name) {
  if (!confirm(`Xóa danh mục tag "${name}"? Các tag trong danh mục này sẽ chuyển về nhóm Khác.`)) return;
  const res = await fetch(`/admin/crm/tag-categories/${id}`, { method: 'DELETE' });
  if (!res.ok) return toast('Không xoá được danh mục tag', 'error');
  toast('Đã xoá danh mục tag', 'success');
  invalidateViewCache('tags', 'users', 'leads');
  await loadCrmSettings();
  renderTags();
}

function resetCrmTagForm() {
  const id = document.getElementById('crmTagId');
  if (!id) return;
  id.value = '';
  if (document.getElementById('crmTagName')) document.getElementById('crmTagName').value = '';
  if (document.getElementById('crmTagCategory')) document.getElementById('crmTagCategory').value = '';
  if (document.getElementById('crmTagColor')) document.getElementById('crmTagColor').value = '#5c6ac4';
  if (document.getElementById('crmTagDescription')) document.getElementById('crmTagDescription').value = '';
  tagFormOpen = false;
  viewCache.tags = false;
  renderTags();
}

function editCrmTag(id) {
  const t = (crmSettings.tags || []).find(x => x.id === id);
  if (!t) return toast('Không tìm thấy tag', 'error');
  tagFormOpen = true;
  renderTags();
  setTimeout(() => {
    if (document.getElementById('crmTagId')) document.getElementById('crmTagId').value = t.id;
    if (document.getElementById('crmTagName')) document.getElementById('crmTagName').value = t.name || '';
    if (document.getElementById('crmTagCategory')) document.getElementById('crmTagCategory').value = t.category_id || '';
    if (document.getElementById('crmTagColor')) document.getElementById('crmTagColor').value = t.color || '#5c6ac4';
    if (document.getElementById('crmTagDescription')) document.getElementById('crmTagDescription').value = t.description || '';
  }, 0);
  return;
  document.getElementById('crmTagId').value = t.id;
  document.getElementById('crmTagName').value = t.name || '';
  document.getElementById('crmTagCategory').value = t.category_id || '';
  document.getElementById('crmTagColor').value = t.color || '#5c6ac4';
  document.getElementById('crmTagDescription').value = t.description || '';
}

async function saveCrmTag() {
  const id = document.getElementById('crmTagId')?.value || '';
  const name = document.getElementById('crmTagName')?.value.trim() || '';
  if (!name) return toast('Nhập tên tag trước khi lưu', 'error');
  const normalizeTagName = s => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const nextSlug = normalizeTagName(name);
  const duplicated = (crmSettings.tags || []).some(t => t.id !== id && normalizeTagName(t.name || t.slug) === nextSlug);
  if (duplicated) return toast('Ten tag da ton tai, vui long dat ten khac', 'error');
  const payload = {
    name,
    category_id: document.getElementById('crmTagCategory')?.value || null,
    color: document.getElementById('crmTagColor')?.value || '#5c6ac4',
    description: document.getElementById('crmTagDescription')?.value || '',
    active: true,
  };
  const res = await fetch(id ? `/admin/crm/tags/${id}` : '/admin/crm/tags', {
    method: id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) return toast('Không lưu được tag', 'error');
  toast(id ? 'Đã cập nhật tag' : 'Đã tạo tag', 'success');
  invalidateViewCache('tags', 'users', 'leads');
  tagFormOpen = false;
  await loadCrmSettings();
  renderTags();
}

async function deleteCrmTag(id, name) {
  if (!confirm(`Xóa tag "${name}"? Tag này sẽ được gỡ khỏi toàn bộ lead.`)) return;
  const res = await fetch(`/admin/crm/tags/${id}`, { method: 'DELETE' });
  if (!res.ok) return toast('Không xoá được tag', 'error');
  toast('Đã xoá tag', 'success');
  invalidateViewCache('tags', 'users', 'leads');
  await loadCrmSettings();
  renderTags();
}
