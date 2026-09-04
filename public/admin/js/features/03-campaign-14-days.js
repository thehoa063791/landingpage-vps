let campaignPopupRows = [];
let campaignPopupStage = 0;

async function renderCampaign14() {
  const root = document.getElementById('mainCampaign14');
  root.innerHTML = '<div class="loading"><div class="spin"></div> Đang tải Campaign 14 days...</div>';

  let d;
  try {
    const res = await fetch('/admin/campaign/14-days');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    d = await res.json();
  } catch(e) {
    root.innerHTML = `
      <div class="card">
        <div class="card-head">
          <span class="card-title">Campaign / 14 days</span>
          <button class="btn-sm-action" onclick="renderCampaign14()">Thử lại</button>
        </div>
        <div class="loading">Lỗi tải dữ liệu Campaign.</div>
      </div>`;
    return;
  }

  const rows = d.rows || [];
  const total = d.total || { delivery:0, userCount:0, open:0, openRate:0, click:0, clickRate:0, bounce:0 };
  const hasErrors = rows.some(r => r.error);
  const tableRows = rows.map(r => `
    <tr data-stage="${r.stage}">
      <td>${escHtml(r.label || ('Ngày ' + r.stage))}${r.error ? ' <span style="color:var(--red)">!</span>' : ''}</td>
      <td class="col-delivery">${fmt(r.delivery)}</td>
      <td class="col-user"><button class="campaign-user-link" type="button" data-stage="${r.stage}">${fmt(r.userCount)}</button></td>
      <td class="col-open">${fmt(r.open)}</td>
      <td class="col-open-rate">${fmtRate(r.openRate)}</td>
      <td class="col-click">${fmt(r.click)}</td>
      <td class="col-click-rate">${fmtRate(r.clickRate)}</td>
      <td class="col-bounce">${fmt(r.bounce)}</td>
    </tr>`).join('');

  root.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card blue"><div class="stat-label">Delivery</div><div class="stat-value">${fmt(total.delivery)}</div><div class="stat-sub">Tổng 14 ngày</div></div>
      <div class="stat-card"><div class="stat-label">User</div><div class="stat-value" style="color:var(--teal)">${fmt(total.userCount)}</div><div class="stat-sub">Tổng lead đăng ký</div></div>
      <div class="stat-card green"><div class="stat-label">Open</div><div class="stat-value">${fmt(total.open)}</div><div class="stat-sub">${fmtRate(total.openRate)}</div></div>
      <div class="stat-card purple"><div class="stat-label">Click</div><div class="stat-value">${fmt(total.click)}</div><div class="stat-sub">${fmtRate(total.clickRate)} trên open</div></div>
      <div class="stat-card red"><div class="stat-label">Bounce</div><div class="stat-value">${fmt(total.bounce)}</div><div class="stat-sub">Tổng bounce</div></div>
    </div>

    <div class="table-card">
      <div class="table-head-bar">
        <div>
          <div class="card-title">Campaign / 14 days</div>
          <div class="card-note">Cột User lấy từ get-training-process · bấm số User để xem popup lead${hasErrors ? ' · có stage lỗi, xem dấu !' : ''}</div>
        </div>
        <button class="btn-sm-action" onclick="viewCache.campaign14=false;renderCampaign14()">Làm mới</button>
      </div>
      <div class="table-wrap" style="max-height:calc(100vh - 260px)">
        <table class="campaign-table">
          <thead>
            <tr>
              <th>Ngày</th>
              <th class="col-delivery">Delivery</th>
              <th class="col-user">User</th>
              <th class="col-open">Open</th>
              <th class="col-open-rate">Open rate</th>
              <th class="col-click">Click</th>
              <th class="col-click-rate">Click rate</th>
              <th class="col-bounce">Bounce</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows || '<tr><td colspan="8" style="text-align:center;color:var(--gray);padding:32px">Chưa có dữ liệu</td></tr>'}
            <tr class="total-row">
              <td>Total 14 days</td>
              <td class="col-delivery">${fmt(total.delivery)}</td>
              <td class="col-user">${fmt(total.userCount)}</td>
              <td class="col-open">${fmt(total.open)}</td>
              <td class="col-open-rate">${fmtRate(total.openRate)}</td>
              <td class="col-click">${fmt(total.click)}</td>
              <td class="col-click-rate">${fmtRate(total.clickRate)}</td>
              <td class="col-bounce">${fmt(total.bounce)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>`;

  root.querySelectorAll('.campaign-user-link').forEach(btn => {
    btn.addEventListener('click', () => openCampaignLeadPopup(Number(btn.dataset.stage)));
  });

  viewCache.campaign14 = true;
}

function closeCampaignLeadPopup() {
  document.getElementById('campaignLeadOverlay')?.classList.add('hidden');
}

function closeCampaignEmailPopup() {
  document.getElementById('campaignEmailOverlay')?.classList.add('hidden');
}

function closeCampaignEmailPreview() {
  document.getElementById('campaignEmailPreviewOverlay')?.classList.add('hidden');
  const frame = document.getElementById('campaignEmailPreviewFrame');
  if (frame) frame.srcdoc = '';
}

function openCampaignEmailPreview(key) {
  const item = campaignEmailHtmlByKey[String(key)];
  if (!item) return;
  document.getElementById('campaignEmailPreviewTitle').textContent = item.subject || 'Nội dung email';
  document.getElementById('campaignEmailPreviewNote').textContent = [item.templateUsed, fmtEpochMs(item.createAt)].filter(Boolean).join(' · ');
  document.getElementById('campaignEmailPreviewFrame').srcdoc = item.html || '<p>Không có nội dung email.</p>';
  document.getElementById('campaignEmailPreviewOverlay').classList.remove('hidden');
}

async function openCampaignEmailDetail(email) {
  email = String(email || '').trim();
  if (!email) return toast('Lead chưa có email để xem Campaign', 'error');
  const overlay = document.getElementById('campaignEmailOverlay');
  const title = document.getElementById('campaignEmailTitle');
  const note = document.getElementById('campaignEmailNote');
  const bodyEl = document.getElementById('campaignEmailBody');
  if (!overlay || !title || !note || !bodyEl) return;

  title.textContent = 'Chi tiết Campaign';
  note.textContent = email;
  bodyEl.innerHTML = '<div class="loading"><div class="spin"></div> Đang tải lịch sử email...</div>';
  overlay.classList.remove('hidden');

  let d;
  try {
    const res = await fetch('/admin/campaign/email-detail?email=' + encodeURIComponent(email));
    if (!res.ok) throw new Error('HTTP ' + res.status);
    d = await res.json();
  } catch(e) {
    bodyEl.innerHTML = '<div class="loading">Lỗi tải chi tiết Campaign.</div>';
    return;
  }

  const rows = d.rows || [];
  Object.keys(campaignEmailHtmlByKey).forEach(k => delete campaignEmailHtmlByKey[k]);
  rows.forEach((r, i) => {
    const key = String(r.id || i);
    campaignEmailHtmlByKey[key] = {
      subject: r.subject || '',
      templateUsed: r.templateUsed || '',
      createAt: r.createAt || null,
      html: r.sentBodyHtml || '',
    };
  });
  note.textContent = `${email} · gửi ${fmt(rows.length)} email · mở ${fmt(d.opened)} · click ${fmt(d.clicked)} · bounce ${fmt(d.bounced)}`;
  const body = rows.map((r, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${escHtml(r.templateUsed || '')}</td>
      <td style="white-space:normal;min-width:320px"><button class="email-subject-btn" type="button" onclick="openCampaignEmailPreview('${escAttr(r.id || i)}')">${escHtml(r.subject || '')}</button></td>
      <td>${fmtEpochMs(r.createAt)}</td>
      <td>${r.openedAt ? `<span class="linked-pill">${fmtEpochMs(r.openedAt)}</span>` : '<span class="unlinked-pill">Chưa mở</span>'}</td>
      <td>${r.clickedAt ? `<span class="linked-pill">${fmtEpochMs(r.clickedAt)}</span>` : '<span class="unlinked-pill">Chưa click</span>'}</td>
      <td>${r.bouncedAt ? `<span class="unlinked-pill" style="color:var(--red)">${fmtEpochMs(r.bouncedAt)}</span>` : '–'}</td>
    </tr>`).join('');

  bodyEl.innerHTML = `
    <div class="stats-grid" style="margin-bottom:12px">
      <div class="stat-card blue"><div class="stat-label">Email gửi</div><div class="stat-value">${fmt(rows.length)}</div></div>
      <div class="stat-card green"><div class="stat-label">Opened</div><div class="stat-value">${fmt(d.opened)}</div></div>
      <div class="stat-card purple"><div class="stat-label">Clicked</div><div class="stat-value">${fmt(d.clicked)}</div></div>
      <div class="stat-card red"><div class="stat-label">Bounced</div><div class="stat-value">${fmt(d.bounced)}</div></div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>#</th><th>Template</th><th>Subject</th><th>Gửi lúc</th><th>Mở lúc</th><th>Click lúc</th><th>Bounce lúc</th></tr></thead>
        <tbody>${body || '<tr><td colspan="7" style="text-align:center;color:var(--gray);padding:32px">Chưa có lịch sử Campaign cho email này</td></tr>'}</tbody>
      </table>
    </div>`;
}

async function openCampaignLeadPopup(stage) {
  const overlay = document.getElementById('campaignLeadOverlay');
  const title = document.getElementById('campaignLeadTitle');
  const note = document.getElementById('campaignLeadNote');
  const bodyEl = document.getElementById('campaignLeadBody');
  if (!overlay || !title || !note || !bodyEl) return;

  title.textContent = `Ngày ${stage} / Danh sách lead`;
  note.textContent = 'Đang tải toàn bộ page từ get-training-process...';
  bodyEl.innerHTML = '<div class="loading"><div class="spin"></div> Đang tải lead...</div>';
  overlay.classList.remove('hidden');

  let d;
  try {
    const res = await fetch('/admin/campaign/14-days/stage/' + encodeURIComponent(stage));
    if (!res.ok) throw new Error('HTTP ' + res.status);
    d = await res.json();
  } catch(e) {
    note.textContent = '';
    bodyEl.innerHTML = `
      <div class="loading" style="padding:28px">
        Lỗi tải danh sách lead ngày ${stage}.
        <div style="margin-top:12px"><button class="btn-sm-action" onclick="openCampaignLeadPopup(${stage})">Thử lại</button></div>
      </div>`;
    return;
  }

  const rows = d.rows || [];
  campaignPopupRows = rows;
  campaignPopupStage = stage;
  const linkedCount = rows.filter(r => r.linkedLead).length;
  note.textContent = `${fmt(d.totalElements || rows.length)} user · ${fmt(d.totalPages || 1)} page API · ${fmt(linkedCount)} lead đã liên kết email`;
  const body = rows.map((r, i) => `
    <tr class="campaign-lead-row" data-training-key="${escAttr(r.id || r.email || i)}" title="Bấm để xem chi tiết lead">
      <td>${i + 1}</td>
      <td>${escHtml(r.name || '')}</td>
      <td>${escHtml(r.phone || '')}</td>
      <td>${escHtml(r.email || '')}</td>
      <td>${r.linkedLead ? '<span class="linked-pill">Linked</span>' : '<span class="unlinked-pill">Chưa khớp</span>'}</td>
      <td>${escHtml(r.linkedLead?.assigned_name || '')}</td>
      <td>${escHtml(r.linkedLead?.source || '')}</td>
      <td>${escHtml(r.linkedLead?.campaign || '')}</td>
      <td>${fmt(r.stage)}</td>
      <td>${r.stockInvestment == null ? '–' : escHtml(r.stockInvestment)}</td>
      <td>${fmtEpochMs(r.createdAt)}</td>
      <td>${fmtEpochMs(r.lastSentAt)}</td>
    </tr>`).join('');

  Object.keys(campaignTrainingByKey).forEach(k => delete campaignTrainingByKey[k]);
  rows.forEach((r, i) => {
    const key = String(r.id || r.email || i);
    campaignTrainingByKey[key] = r;
    if (r.linkedLead?.id) campaignStageByLeadId[r.linkedLead.id] = Number(r.stage || stage);
  });

  bodyEl.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px">
      <div class="card-title">Danh sách user</div>
      <select class="btn-hdr" id="campaignSaleFilter" style="max-width:240px">
        <option value="">Tất cả sale</option>
        <option value="__unassigned">Chưa phân</option>
        ${crmUsers.map(u => `<option value="${escAttr(u.user_id)}">${escHtml(u.full_name || u.email)} (${escHtml(u.role || '')})</option>`).join('')}
      </select>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Họ tên</th>
            <th>SĐT</th>
            <th>Email</th>
            <th>CRM</th>
            <th>Sale</th>
            <th>Source</th>
            <th>Campaign</th>
            <th>Stage</th>
            <th>Stock</th>
            <th>Ngày tạo</th>
            <th>Lần gửi gần nhất</th>
          </tr>
        </thead>
        <tbody>${body || '<tr><td colspan="12" style="text-align:center;color:var(--gray);padding:32px">Chưa có lead ở ngày này</td></tr>'}</tbody>
      </table>
    </div>`;

  document.getElementById('campaignSaleFilter')?.addEventListener('change', renderCampaignStageRows);
  renderCampaignStageRows();
}

function renderCampaignStageRows() {
  const bodyEl = document.getElementById('campaignLeadBody');
  const tbody = bodyEl?.querySelector('tbody');
  if (!tbody) return;
  const saleId = document.getElementById('campaignSaleFilter')?.value || '';
  const rows = (campaignPopupRows || []).filter(r => {
    if (!saleId) return true;
    if (saleId === '__unassigned') return !r.linkedLead?.assigned_to;
    return r.linkedLead?.assigned_to === saleId;
  });
  tbody.innerHTML = rows.map((r, i) => `
    <tr class="campaign-lead-row" data-training-key="${escAttr(r.id || r.email || i)}" title="Bấm để xem chi tiết lead">
      <td>${i + 1}</td>
      <td>${escHtml(r.name || '')}</td>
      <td>${escHtml(r.phone || '')}</td>
      <td>${escHtml(r.email || '')}</td>
      <td>${r.linkedLead ? '<span class="linked-pill">Linked</span>' : '<span class="unlinked-pill">Chưa khớp</span>'}</td>
      <td>${escHtml(r.linkedLead?.assigned_name || '')}</td>
      <td>${escHtml(r.linkedLead?.source || '')}</td>
      <td>${escHtml(r.linkedLead?.campaign || '')}</td>
      <td>${fmt(r.stage || campaignPopupStage)}</td>
      <td>${r.stockInvestment == null ? '–' : escHtml(r.stockInvestment)}</td>
      <td>${fmtEpochMs(r.createdAt)}</td>
      <td>${fmtEpochMs(r.lastSentAt)}</td>
    </tr>`).join('') || '<tr><td colspan="12" style="text-align:center;color:var(--gray);padding:32px">Không có user phù hợp bộ lọc.</td></tr>';
  tbody.querySelectorAll('.campaign-lead-row').forEach(tr => {
    tr.addEventListener('click', () => openCampaignTrainingLeadDetail(tr.dataset.trainingKey));
  });
}

function openCampaignTrainingLeadDetail(key) {
  const r = campaignTrainingByKey[String(key)];
  if (!r) return;
  closeCampaignLeadPopup();
  if (r.linkedLead?.id) {
    campaignStageByLeadId[r.linkedLead.id] = Number(r.stage || 0);
    openLeadDrawer(r.linkedLead.id);
    return;
  }
  document.getElementById('drawerOverlay').classList.add('open');
  document.getElementById('leadDrawer').classList.add('open');
  document.getElementById('leadDrawer').classList.remove('zoom-detail-drawer');
  document.getElementById('drawerName').textContent = r.name || 'Training lead';
  document.getElementById('drawerPhone').textContent = [r.phone, r.email].filter(Boolean).join(' · ');
  document.getElementById('drawerBody').innerHTML = `
    <div class="detail-section">
      <div class="detail-section-title">Campaign 14 days</div>
      <div class="detail-grid">
        <div class="detail-item"><div class="di-label">Giai đoạn hiện tại</div><div class="di-val">Ngày ${fmt(r.stage)} / 14</div></div>
        <div class="detail-item"><div class="di-label">Trạng thái CRM</div><div class="di-val empty">Chưa khớp email trong Supabase</div></div>
        <div class="detail-item"><div class="di-label">Training ID</div><div class="di-val mono">${escHtml(r.id || '')}</div></div>
        <div class="detail-item"><div class="di-label">Stock Investment</div><div class="di-val">${r.stockInvestment == null ? '–' : escHtml(r.stockInvestment)}</div></div>
        <div class="detail-item"><div class="di-label">Ngày tạo</div><div class="di-val">${fmtEpochMs(r.createdAt)}</div></div>
        <div class="detail-item"><div class="di-label">Lần gửi gần nhất</div><div class="di-val">${fmtEpochMs(r.lastSentAt)}</div></div>
      </div>
      <div style="margin-top:12px"><button class="btn-primary" onclick="openCampaignEmailDetail('${escAttr(r.email || '')}')">Xem chi tiết Campaign</button></div>
    </div>
    <div class="detail-section">
      <div class="detail-section-title">Thông tin liên hệ</div>
      <div class="detail-grid">
        <div class="detail-item"><div class="di-label">Họ và tên</div><div class="di-val">${escHtml(r.name || '')}</div></div>
        <div class="detail-item"><div class="di-label">Số điện thoại</div><div class="di-val">${escHtml(r.phone || '')}</div></div>
        <div class="detail-item"><div class="di-label">Email</div><div class="di-val">${escHtml(r.email || '')}</div></div>
      </div>
    </div>`;
}
