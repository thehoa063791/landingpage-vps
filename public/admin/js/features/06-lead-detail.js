function openLeadDrawer(id) {
  document.getElementById('drawerOverlay').classList.add('open');
  document.getElementById('leadDrawer').classList.add('open');
  document.getElementById('leadDrawer').classList.remove('zoom-detail-drawer');
  document.getElementById('drawerName').textContent  = '…';
  document.getElementById('drawerPhone').textContent = '';
  document.getElementById('drawerBody').innerHTML = '<div class="drawer-loading"><div class="spin"></div> Đang tải...</div>';
  fetchLeadDetail(id);
}

function closeLeadDrawer() {
  document.getElementById('drawerOverlay').classList.remove('open');
  document.getElementById('leadDrawer').classList.remove('open');
  document.getElementById('leadDrawer').classList.remove('zoom-detail-drawer');
}

async function fetchLeadDetail(id) {
  try {
    const res = await fetch(`/admin/leads/${id}/summary`);
    if (!res.ok) { document.getElementById('drawerBody').innerHTML = '<div class="drawer-loading">❌ Không tìm thấy lead</div>'; return; }
    const r = await res.json();
    drawLeadSummary(r);
  } catch(e) {
    document.getElementById('drawerBody').innerHTML = '<div class="drawer-loading">❌ Lỗi kết nối</div>';
  }
}

const LEAD_DETAIL_TABS = [
  ['campaign', 'Campaign'],
  ['notes', 'Notes'],
  ['tags', 'Tags'],
  ['custom-fields', 'Forms'],
  ['survey', 'Survey'],
  ['zoom', 'Zoom'],
  ['geo-device', 'Device'],
  ['tracking', 'Tracking'],
];

let activeLeadSummary = null;
const loadedLeadSections = {};

function detailValue(v) {
  return v ? `<div class="di-val">${v}</div>` : `<div class="di-val empty">-</div>`;
}

function detailItem(label, value) {
  return `<div class="detail-item"><div class="di-label">${label}</div>${typeof value === 'string' ? detailValue(value) : value}</div>`;
}

function drawLeadSummary(r) {
  activeLeadSummary = r;
  loadedLeadSections[r.id] = loadedLeadSections[r.id] || {};
  const users = crmUsers || [];
  const assigneeOptions = users.map(u => `<option value="${u.user_id}" ${u.user_id===r.assigned_to?'selected':''}>${escHtml(u.full_name || u.email)} (${u.role})</option>`).join('');
  document.getElementById('drawerName').textContent = r.name || '';
  document.getElementById('drawerPhone').textContent = (r.phone || '') + (r.email ? ' · ' + r.email : '');
  document.getElementById('drawerBody').innerHTML = `
    <div class="detail-section">
      <div class="lead-summary-grid">
        <div>
          <div style="font-size:1.05rem;font-weight:800;color:var(--blue);margin-bottom:14px">${escHtml(r.name || '')}</div>
          <div class="detail-grid cols1">
            ${detailItem('Id', `<div class="di-val mono">${escHtml(r.id || '')}</div>`)}
            ${detailItem('Phone', escHtml(r.phone || ''))}
            ${detailItem('Email', r.email ? `<a style="color:var(--blue)" href="mailto:${escAttr(r.email)}">${escHtml(r.email)}</a>` : '')}
            ${detailItem('Sale phu trach', `<div class="di-val">${escHtml(r.assigned_profile?.full_name || r.assigned_profile?.email || 'Chua phan')}</div>`)}
            ${detailItem('Score', `<div class="di-val" style="color:${Number(r.score || 0) < 0 ? 'var(--red)' : 'var(--gold)'};font-weight:900">${fmt(r.score || 0)} diem</div>`)}
          </div>
          <div class="lead-summary-assignee">
            <select class="crm-select" id="drawerAssignee"><option value="">Chua phan</option>${assigneeOptions}</select>
            <button class="btn-primary" onclick="saveLeadAssignee('${r.id}')">Luu</button>
          </div>
        </div>
        <div class="detail-grid cols1">
          ${detailItem('Page', escHtml(r.page_id || 'default'))}
          ${detailItem('Khu vuc', escHtml(r.region || ''))}
          ${detailItem('Hinh thuc', escHtml(r.attendance || ''))}
        </div>
        <div class="detail-grid cols1">
          ${detailItem('Channel', escHtml(r.channel || ''))}
          ${detailItem('Source / Medium', escHtml(`${r.source || 'direct'} / ${r.medium || '(none)'}`))}
          ${detailItem('Dang ky luc', fmtDate(r.registered_at))}
        </div>
      </div>
      <div id="leadDetailTabs" class="lead-detail-tabs">
        ${LEAD_DETAIL_TABS.map(([key, label]) => `<button type="button" class="btn-sm-action" data-lead-section="${key}" onclick="switchLeadSection('${r.id}','${key}')">${label}</button>`).join('')}
      </div>
    </div>
    <div id="leadSectionContent"></div>
  `;
}

function setLeadTabActive(section) {
  document.querySelectorAll('[data-lead-section]').forEach(btn => {
    btn.classList.toggle('toggle', btn.dataset.leadSection === section);
  });
}

function renderLeadSectionShell(title, html) {
  const target = document.getElementById('leadSectionContent');
  if (!target) return;
  target.innerHTML = `<div class="detail-section"><div class="detail-section-title">${title}</div>${html}</div>`;
}

function renderLeadOverview(r) {
  setLeadTabActive('overview');
  renderLeadSectionShell('Thong tin co ban', `
    <div class="detail-grid">
      ${detailItem('Ten khach hang', escHtml(r.name || ''))}
      ${detailItem('Phone', escHtml(r.phone || ''))}
      ${detailItem('Email', escHtml(r.email || ''))}
      ${detailItem('Page ID', escHtml(r.page_id || 'default'))}
      ${detailItem('Sale phu trach', escHtml(r.assigned_profile?.full_name || r.assigned_profile?.email || 'Chua phan'))}
      ${detailItem('Tuong tac gan nhat', r.last_interaction_at ? fmtDate(r.last_interaction_at) : '')}
      ${detailItem('Quoc gia / thanh pho', escHtml([r.country, r.city].filter(Boolean).join(' / ')))}
      ${detailItem('Campaign', escHtml(r.campaign || ''))}
    </div>
  `);
}

async function switchLeadSection(leadId, section) {
  setLeadTabActive(section);
  const target = document.getElementById('leadSectionContent');
  if (!target) return;
  target.innerHTML = '<div class="drawer-loading" style="min-height:160px"><div class="spin"></div> Dang tai...</div>';
  try {
    const res = await fetch(`/admin/leads/${leadId}/sections/${section}`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    loadedLeadSections[leadId] ||= {};
    loadedLeadSections[leadId][section] = data;
    renderLeadSection(leadId, section, data);
  } catch (e) {
    target.innerHTML = '<div class="drawer-loading" style="min-height:160px">Khong tai duoc du lieu.</div>';
  }
}

function renderLeadSection(leadId, section, data) {
  if (section === 'campaign') return renderLeadCampaignSection(data);
  if (section === 'notes') return renderLeadNotesSection(leadId, data);
  if (section === 'tags') return renderLeadTagsSection(leadId, data);
  if (section === 'custom-fields') return renderLeadCustomFieldsSection(leadId, data);
  if (section === 'survey') return renderLeadSurveySection(data);
  if (section === 'zoom') return renderLeadZoomSection(data);
  if (section === 'geo-device') return renderLeadGeoDeviceSection(data);
  if (section === 'tracking') return renderLeadTrackingSection(data);
}

function renderLeadCrmSection(leadId, data) {
  const users = data.users || crmUsers || [];
  const assigneeOptions = users.map(u => `<option value="${u.user_id}" ${u.user_id===data.assigned_to?'selected':''}>${escHtml(u.full_name || u.email)} (${u.role})</option>`).join('');
  renderLeadSectionShell('CRM', `
    <div class="detail-grid cols2">
      ${detailItem('Sale phu trach', `<div class="di-val">${escHtml(data.assigned_profile?.full_name || data.assigned_profile?.email || 'Chua phan')}</div>`)}
      ${detailItem('Tuong tac gan nhat', data.last_interaction_at ? fmtDate(data.last_interaction_at) : '')}
    </div>
    <div style="display:flex;gap:8px;align-items:center;margin-top:12px">
      <select class="crm-select" id="drawerAssignee"><option value="">Chua phan</option>${assigneeOptions}</select>
      <button class="btn-primary" onclick="saveLeadAssignee('${leadId}')">Luu</button>
    </div>
  `);
}

function renderLeadNotesSection(leadId, data) {
  const notesHTML = (data.notes || []).length
    ? data.notes.map(n => `<div class="note-item"><div class="note-meta"><span>${interactionTypeBadge(n.interaction_type)} ${escHtml(n.author?.full_name || n.author?.email || 'Nhan vien')}</span><span>${fmtDate(n.created_at)}</span></div><div class="note-body">${escHtml(n.body || '')}</div></div>`).join('')
    : `<div style="color:var(--gray);font-size:.82rem;padding:8px 0">Chua co note nao.</div>`;
  renderLeadSectionShell('Notes', `
    <div class="form-group" style="margin-bottom:8px">
      <label>Loai tuong tac</label>
      <select class="crm-select" id="leadInteractionType">
        <option value="call">Goi dien</option><option value="message">Nhan tin</option><option value="meeting">Gap truc tiep</option><option value="email">Email</option><option value="note" selected>Ghi chu</option>
      </select>
    </div>
    <textarea class="note-box" id="leadNoteBody" placeholder="Them note..."></textarea>
    <div style="display:flex;justify-content:flex-end;margin:8px 0 12px"><button class="btn-primary" onclick="addLeadNote('${leadId}')">Luu note</button></div>
    <div id="leadNotesList">${notesHTML}</div>
  `);
}

function renderLeadTagsSection(leadId, data) {
  const tags = data.tags || [];
  const available = data.available_tags || crmTags || [];
  const leadTagIds = new Set(tags.map(t => t.id || t.tag_id));
  const suggestions = available
    .filter(t => !leadTagIds.has(t.id))
    .map(t => {
      const label = t.category_name ? `${t.name} - ${t.category_name}` : t.name;
      return `<option value="${escAttr(label)}" data-tag-id="${escAttr(t.id)}"></option>`;
    }).join('');
  const rows = tags.map(t => {
    const id = t.id || t.tag_id;
    const applied = t.assigned_at ? fmtDate(t.assigned_at) : '-';
    return `<tr>
      <td>${applied}</td>
      <td><span class="tag-chip"><span class="tag-dot" style="background:${escAttr(t.color || '#5c6ac4')}"></span>${escHtml(t.name || t.tag_id || '')}</span></td>
      <td>${escHtml(t.category_name || 'No Category')}</td>
      <td style="text-align:center"><button class="btn-sm-action del remove-tag-btn" type="button" onclick="removeLeadTag('${leadId}','${escAttr(id)}')">x</button></td>
    </tr>`;
  }).join('');
  renderLeadSectionShell('Tags', `
    <div class="detail-section-title" style="border:none;margin-bottom:12px;padding-bottom:0">Apply a tag</div>
    <div class="lead-tag-apply">
      <input class="crm-input" id="leadTagSearch" list="leadTagSuggestions" placeholder="Search tag name...">
      <datalist id="leadTagSuggestions">${suggestions}</datalist>
      <button class="btn-primary" type="button" onclick="applyLeadTag('${leadId}')">Apply</button>
    </div>
    <div class="detail-section-title" style="border:none;margin-bottom:10px;padding-bottom:0">Tags</div>
    <div class="table-wrap">
      <table class="lead-tag-table">
        <thead><tr><th>Applied</th><th>Tag</th><th>Category</th><th style="text-align:center">Remove</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4" style="text-align:center;color:var(--gray);padding:28px">Chua co tag.</td></tr>'}</tbody>
      </table>
    </div>
  `);
}

function renderLeadCustomFieldsSection(leadId, data) {
  const fields = data.custom_fields || [];
  const forms = data.registration_forms || [];
  const renderInput = f => {
    const v = f.value ?? '';
    const common = `class="crm-input lead-custom-field" data-field-id="${f.id}" data-field-type="${f.type}"`;
    if (f.type === 'boolean') return `<input type="checkbox" class="lead-custom-field" data-field-id="${f.id}" data-field-type="boolean" ${v===true || v==='true' ? 'checked' : ''}>`;
    if (f.type === 'dropdown') return `<select ${common}><option value="">-</option>${(f.options || []).map(o => `<option value="${escAttr(o)}" ${String(v)===String(o)?'selected':''}>${escHtml(o)}</option>`).join('')}</select>`;
    if (f.type === 'multiselect') {
      const selected = Array.isArray(v) ? v : String(v || '').split(',').map(s => s.trim()).filter(Boolean);
      return `<select ${common} multiple style="min-height:90px">${(f.options || []).map(o => `<option value="${escAttr(o)}" ${selected.includes(o)?'selected':''}>${escHtml(o)}</option>`).join('')}</select>`;
    }
    const type = f.type === 'date' ? 'date' : (f.type === 'number' || f.type === 'currency' ? 'number' : (f.type === 'url' ? 'url' : 'text'));
    return `<input ${common} type="${type}" value="${escAttr(v)}">`;
  };
  const formsHtml = forms.length ? `
    <div style="margin-bottom:18px">
      <div class="detail-section-title">Lich su form dang ky</div>
      <div class="table-wrap" style="max-height:280px">
        <table>
          <thead><tr><th>Thoi gian</th><th>Page</th><th>Ho ten</th><th>Phone</th><th>Email</th><th>UTM</th><th>Nguon</th></tr></thead>
          <tbody>${forms.map(f => `<tr>
            <td>${fmtDate(f.submitted_at || f.captured_at)}</td>
            <td>${escHtml(f.page_id || '-')}</td>
            <td>${escHtml(f.name || '-')}</td>
            <td>${escHtml(f.phone || '-')}</td>
            <td>${escHtml(f.email || '-')}</td>
            <td>${escHtml([f.utm_source, f.utm_medium, f.utm_campaign].filter(Boolean).join(' / ') || '-')}</td>
            <td>${escHtml(f.source || '-')}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
    </div>` : '<div class="empty" style="margin-bottom:14px">Chua co lich su form dang ky.</div>';
  const fieldsHtml = fields.length ? `
    <div class="detail-grid cols2">${fields.map(f => `<div class="detail-item"><div class="di-label">${escHtml(f.label)}${f.required ? ' *' : ''}</div>${renderInput(f)}</div>`).join('')}</div>
    <div style="display:flex;justify-content:flex-end;margin-top:10px"><button class="btn-primary" onclick="saveLeadCustomFields('${leadId}')">Luu custom fields</button></div>
  ` : '<div class="empty">Chua co custom field.</div>';
  renderLeadSectionShell('Forms / Custom fields', formsHtml + fieldsHtml);
}

function renderLeadSurveySection(data) {
  const survey = data.survey || {};
  const rows = [
    ['So thich', data.interest],
    ['Giai doan hien tai', survey.q1_stage],
    ['Van de chinh', survey.q2_problem],
    ['Sai lam thuong gap', survey.q3_error],
    ['Muc tieu', survey.q4_goal],
    ['Muon hoc gi', survey.q5_learning],
    ['Thoi gian hoc', survey.q6_time],
    ['Moi quan tam', survey.q7_concern],
    ['Ky vong', survey.q8_expectation],
    ['Uu tien', survey.q9_priority],
  ].filter(([, v]) => v);
  renderLeadSectionShell('Survey', rows.length ? `<div class="detail-grid cols2">${rows.map(([k, v]) => detailItem(k, escHtml(v))).join('')}</div>` : '<div class="empty">Chua co du lieu khao sat.</div>');
}

function renderLeadZoomSection(data) {
  const rows = data.zoom_attendances || [];
  const fmtDuration = s => {
    const n = Math.max(0, Number(s || 0));
    const m = Math.floor(n / 60);
    return m ? `${m}m ${n % 60}s` : `${n}s`;
  };
  renderLeadSectionShell('Zoom', rows.length ? `
    <div class="table-wrap" style="max-height:360px">
      <table><thead><tr><th>Ngay</th><th>Topic</th><th>Meeting ID</th><th>Ten Zoom</th><th>Thoi luong</th></tr></thead>
      <tbody>${rows.map(z => `<tr><td>${z.join_time ? fmtDate(z.join_time) : '-'}</td><td>${escHtml(z.meeting?.topic || '-')}</td><td>${escHtml(z.zoom_meeting_id || '-')}</td><td>${escHtml(z.zoom_display_name || '-')}</td><td>${fmtDuration(z.duration)}</td></tr>`).join('')}</tbody></table>
    </div>
  ` : '<div class="empty">Chua co du lieu Zoom.</div>');
}

function renderLeadGeoDeviceSection(data) {
  const geo = data.geo || {};
  const dev = data.device || {};
  const map = geo.lat ? `<a class="map-link" href="https://www.google.com/maps?q=${geo.lat},${geo.lon}" target="_blank">Xem ban do</a>` : '';
  renderLeadSectionShell('Thiet bi & dia ly', `
    <div class="detail-grid">
      ${detailItem('Quoc gia', geo.country ? `${escHtml(geo.country)} (${escHtml(geo.country_code || '')})` : '')}
      ${detailItem('Tinh / vung', escHtml(geo.region || ''))}
      ${detailItem('Thanh pho', escHtml(geo.city || ''))}
      ${detailItem('ISP', escHtml(geo.isp || ''))}
      ${detailItem('Toa do', geo.lat ? `${geo.lat}, ${geo.lon}<br>${map}` : '')}
      ${detailItem('Loai thiet bi', escHtml(dev.device_type || ''))}
      ${detailItem('He dieu hanh', escHtml(dev.os || ''))}
      ${detailItem('Trinh duyet', escHtml([dev.browser, dev.browser_version].filter(Boolean).join(' ')))}
      ${detailItem('IP', escHtml(data.ip || ''))}
    </div>
    <div style="margin-top:10px"><div class="di-label">User Agent</div><div class="ua-box">${escHtml(data.user_agent || '-')}</div></div>
  `);
}

function renderLeadTrackingSection(data) {
  const chanColors = { 'Paid Search':'#f5a623','Organic Search':'#22c55e','Social':'#3b82f6','Email':'#a855f7','Referral':'#14b8a6','Direct':'#8b949e','Other Campaign':'#6b7280' };
  const chanCol = chanColors[data.channel] || '#8b949e';
  const capi = [['fbc', data.fbc], ['fbp', data.fbp], ['IP', data.ip], ['UA', data.user_agent], ['fbclid', data.fbclid], ['gclid', data.gclid]];
  renderLeadSectionShell('Tracking', `
    <div class="detail-grid">
      ${detailItem('Channel', `<div class="di-val"><span class="di-badge" style="background:${chanCol}22;color:${chanCol}">${escHtml(data.channel || '-')}</span></div>`)}
      ${detailItem('Source', escHtml(data.utm_source || 'direct'))}
      ${detailItem('Medium', escHtml(data.utm_medium || '(none)'))}
      ${detailItem('Campaign', escHtml(data.utm_campaign || ''))}
      ${detailItem('Content', escHtml(data.utm_content || ''))}
      ${detailItem('Term', escHtml(data.utm_term || ''))}
      ${detailItem('Referrer', `<div class="di-val mono">${escHtml(data.referrer || '-')}</div>`)}
      ${detailItem('fbclid', `<div class="di-val mono">${escHtml(data.fbclid || '-')}</div>`)}
      ${detailItem('gclid', `<div class="di-val mono">${escHtml(data.gclid || '-')}</div>`)}
      ${detailItem('_fbc', `<div class="di-val mono">${escHtml(data.fbc || '-')}</div>`)}
      ${detailItem('_fbp', `<div class="di-val mono">${escHtml(data.fbp || '-')}</div>`)}
      ${detailItem('_ga', `<div class="di-val mono">${escHtml(data.ga || '-')}</div>`)}
    </div>
    <div style="margin-top:14px;background:var(--dark3);border-radius:8px;padding:12px 14px">
      ${capi.map(([k, v]) => `<div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--border);padding:6px 0"><span>${v ? 'OK' : 'Missing'} ${k}</span><span class="mono" style="color:var(--gray);max-width:300px;overflow:hidden;text-overflow:ellipsis">${escHtml(v || '-')}</span></div>`).join('')}
    </div>
  `);
}

function campaignEmailStatus(row) {
  if (row.bouncedAt) return `<span class="unlinked-pill" style="color:var(--red)">Bounced</span>`;
  if (row.clickedAt) return `<span class="linked-pill">Clicked</span>`;
  if (row.openedAt) return `<span class="linked-pill">Opened</span>`;
  return `<span class="unlinked-pill">Sent</span>`;
}

function renderLeadCampaignSection(data) {
  const rows = data.rows || [];
  const stats = data.email_stats || {};
  const summary = data.summary || {};
  const email = data.email || activeLeadSummary?.email || '';
  const leadCampaign = activeLeadSummary?.campaign || '';
  const leadSource = [activeLeadSummary?.source || 'direct', activeLeadSummary?.medium || '(none)'].filter(Boolean).join(' / ');
  const previewPrefix = `lead-campaign-${Date.now()}-`;
  rows.forEach((row, i) => {
    const key = previewPrefix + i;
    row.__previewKey = key;
    campaignEmailHtmlByKey[key] = {
      subject: row.subject || '',
      templateUsed: row.templateUsed || '',
      createAt: row.createAt || null,
      html: row.sentBodyHtml || '',
    };
  });
  const body = rows.map((row, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${escHtml(row.templateUsed || '')}</td>
      <td style="white-space:normal;min-width:260px">
        ${row.sentBodyHtml ? `<button class="email-subject-btn" type="button" onclick="openCampaignEmailPreview('${escAttr(row.__previewKey)}')">${escHtml(row.subject || '-')}</button>` : escHtml(row.subject || '-')}
      </td>
      <td>${fmtEpochMs(row.createAt)}</td>
      <td>${campaignEmailStatus(row)}</td>
      <td>${row.openedAt ? fmtEpochMs(row.openedAt) : '-'}</td>
      <td>${row.clickedAt ? fmtEpochMs(row.clickedAt) : '-'}</td>
    </tr>`).join('');
  renderLeadSectionShell('Campaign', `
    <div class="detail-grid">
      ${detailItem('Email campaign', escHtml(email || ''))}
      ${detailItem('Ads campaign', escHtml(leadCampaign || ''))}
      ${detailItem('Source / Medium', escHtml(leadSource || ''))}
      ${detailItem('Chuoi 14 ngay', summary.stage ? `Ngay ${fmt(summary.stage)} / 14` : '')}
      ${detailItem('Stock investment', summary.stockInvestment == null ? '' : escHtml(summary.stockInvestment))}
      ${detailItem('Lan gui gan nhat', summary.lastSentAt ? fmtEpochMs(summary.lastSentAt) : '')}
      ${detailItem('Email da gui', fmt(stats.sent || rows.length || 0))}
      ${detailItem('Opened', fmt(stats.opened || 0))}
      ${detailItem('Clicked', fmt(stats.clicked || 0))}
      ${detailItem('Bounced', fmt(stats.bounced || 0))}
      ${detailItem('Tong lich su', fmt(data.total_rows || rows.length || 0))}
    </div>
    <div style="display:flex;justify-content:flex-end;margin:12px 0">
      <button class="btn-sm-action" type="button" onclick="openCampaignEmailDetail('${escAttr(email)}')">Xem chi tiet email</button>
    </div>
    <div class="table-wrap" style="max-height:360px">
      <table>
        <thead><tr><th>#</th><th>Template</th><th>Subject</th><th>Gui luc</th><th>Status</th><th>Mo luc</th><th>Click luc</th></tr></thead>
        <tbody>${body || '<tr><td colspan="7" style="text-align:center;color:var(--gray);padding:28px">Chua co du lieu Campaign/chuoi email 14 ngay cho lead nay.</td></tr>'}</tbody>
      </table>
    </div>
  `);
}

async function saveLeadAssignee(id) {
  const select = document.getElementById('drawerAssignee');
  const user_id = select ? select.value : (currentUser?.id || '');
  const res = await fetch(`/admin/leads/${id}/assignee`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id })
  });
  if (!res.ok) return toast('Không cập nhật được người phụ trách', 'error');
  toast(currentUser?.role === 'admin' ? 'Đã cập nhật người phụ trách' : 'Đã nhận phụ trách lead', 'success');
  invalidateViewCache('leads', 'users');
  fetchLeadDetail(id);
  fetchLeadsPage();
}

function interactionTypeBadge(type) {
  const map = {
    call: ['Gọi điện', 'var(--green)', 'var(--green2)'],
    message: ['Nhắn tin', 'var(--blue)', 'var(--blue2)'],
    meeting: ['Gặp trực tiếp', 'var(--purple)', 'var(--purple2)'],
    email: ['Email', 'var(--gold)', 'var(--gold2)'],
    note: ['Ghi chú', 'var(--gray)', 'var(--dark3)'],
  };
  const [label, color, bg] = map[type] || map.note;
  return `<span class="tag-chip" style="font-size:.66rem;padding:2px 7px;color:${color};background:${bg};border-color:transparent">${label}</span>`;
}

async function addLeadNote(id) {
  const box = document.getElementById('leadNoteBody');
  const body = box?.value.trim();
  const interaction_type = document.getElementById('leadInteractionType')?.value || 'note';
  if (!body) return toast('Nhập nội dung note trước khi lưu', 'error');
  const res = await fetch(`/admin/leads/${id}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body, interaction_type })
  });
  if (res.status === 403) return toast('Chỉ sale đang phụ trách lead này mới được thêm note', 'error');
  if (!res.ok) return toast('Không lưu được note', 'error');
  toast('Đã lưu note', 'success');
  invalidateViewCache('leads');
  switchLeadSection(id, 'notes');
  fetchLeadsPage();
}

async function saveLeadCustomFields(id) {
  const values = {};
  document.querySelectorAll('.lead-custom-field[data-field-id]').forEach(el => {
    const fieldId = el.dataset.fieldId;
    const type = el.dataset.fieldType;
    if (type === 'boolean') values[fieldId] = !!el.checked;
    else if (type === 'multiselect') values[fieldId] = Array.from(el.selectedOptions || []).map(o => o.value);
    else values[fieldId] = el.value;
  });
  const res = await fetch(`/admin/leads/${id}/custom-fields`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ values })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return toast(data.error || 'Không lưu được custom fields', 'error');
  }
  toast('Đã lưu custom fields', 'success');
  invalidateViewCache('leads');
  switchLeadSection(id, 'custom-fields');
}

async function saveLeadTags(id) {
  const select = document.getElementById('leadTagSelect');
  const tag_ids = Array.from(select?.selectedOptions || []).map(o => o.value);
  if (!tag_ids.length && !select) return toast('Chon tag truoc khi luu', 'error');
  return updateLeadTags(id, tag_ids);
}

function getLoadedLeadTagIds(id) {
  const data = loadedLeadSections[id]?.tags || {};
  return (data.tags || []).map(t => t.id || t.tag_id).filter(Boolean);
}

function findLeadTagFromSearch(value, available, currentIds) {
  const q = String(value || '').trim().toLowerCase();
  if (!q) return null;
  const rows = (available || []).filter(t => !currentIds.includes(t.id));
  return rows.find(t => {
    const labels = [
      t.name,
      t.slug,
      t.category_name ? `${t.name} - ${t.category_name}` : '',
      t.category_name ? `${t.category_name} / ${t.name}` : '',
    ].map(v => String(v || '').trim().toLowerCase());
    return labels.includes(q);
  }) || rows.find(t => String(t.name || '').toLowerCase().includes(q));
}

async function applyLeadTag(id) {
  const data = loadedLeadSections[id]?.tags || {};
  const currentIds = getLoadedLeadTagIds(id);
  const tag = findLeadTagFromSearch(document.getElementById('leadTagSearch')?.value, data.available_tags || crmTags || [], currentIds);
  if (!tag?.id) return toast('Khong tim thay tag phu hop', 'error');
  await updateLeadTags(id, [...currentIds, tag.id]);
}

async function removeLeadTag(id, tagId) {
  const tag_ids = getLoadedLeadTagIds(id).filter(x => x !== tagId);
  await updateLeadTags(id, tag_ids);
}

async function updateLeadTags(id, tag_ids) {
  const res = await fetch(`/admin/leads/${id}/tags`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag_ids })
  });
  if (!res.ok) return toast('Không lưu được tag cho lead', 'error');
  toast('Đã cập nhật tag', 'success');
  invalidateViewCache('leads');
  await loadCrmTags();
  switchLeadSection(id, 'tags');
  fetchLeadsPage();
}

async function deleteLead(event, id, name) {
  if (event) event.stopPropagation();
  if (currentUser?.role !== 'admin') return toast('Bạn không có quyền xoá lead', 'error');
  if (!confirm(`Xoá lead "${name}"? Hành động này sẽ xoá cả note liên quan.`)) return;
  const res = await fetch(`/admin/leads/${id}`, { method: 'DELETE' });
  if (!res.ok) return toast('Không xoá được lead', 'error');
  toast('Đã xoá lead', 'success');
  invalidateViewCache('leads');
  invalidateRouteCache();
  closeLeadDrawer();
  fetchLeadsPage();
  loadActiveTab(true);
}

function drawLeadDetail(r) {
  document.getElementById('drawerName').textContent  = r.name;
  document.getElementById('drawerPhone').textContent = r.phone + (r.email ? ' · ' + r.email : '');

  const val    = (v, cls='') => v ? `<div class="di-val ${cls}">${v}</div>` : `<div class="di-val empty">–</div>`;
  const mono   = v => val(v, 'mono');
  const item   = (label, v, cls='') => `<div class="detail-item"><div class="di-label">${label}</div>${typeof v === 'string' ? val(v, cls) : v}</div>`;
  const empty  = v => !v || v === '' || v === '(none)';

  // Device type icon + label
  const dtIcon = { Mobile:'📱', Tablet:'🖥', Desktop:'💻' }[r.device?.device_type] || '❓';
  const dev    = r.device || {};

  // Geo map link
  const geoMapLink = r.geo?.lat
    ? `<a class="map-link" href="https://www.google.com/maps?q=${r.geo.lat},${r.geo.lon}" target="_blank">📍 Xem trên bản đồ</a>`
    : '';

  // Channel color
  const chanColors = { 'Paid Search':'#f5a623','Organic Search':'#22c55e','Social':'#3b82f6',
    'Email':'#a855f7','Referral':'#14b8a6','Direct':'#8b949e','Other Campaign':'#6b7280' };
  const chanCol = chanColors[r.channel] || '#8b949e';

  // CAPI completeness check
  const capiFields = [
    ['fbc',  r.fbc,         'Facebook Click Cookie (_fbc)'],
    ['fbp',  r.fbp,         'Facebook Browser ID (_fbp)'],
    ['IP',   r.ip,          'Client IP Address'],
    ['UA',   r.user_agent,  'User Agent'],
    ['fbclid',r.fbclid,    'Facebook Click ID'],
    ['gclid', r.gclid,     'Google Click ID'],
  ];
  const capiHTML = capiFields.map(([k, v, desc]) =>
    `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
      <span style="font-size:.8rem;${v?'color:var(--green)':'color:var(--gray)'}">${v ? '✅' : '○'}</span>
      <div style="flex:1">
        <div style="font-size:.75rem;font-weight:600">${k}</div>
        <div style="font-size:.68rem;color:var(--gray)">${desc}</div>
      </div>
      <div style="font-size:.7rem;font-family:monospace;color:#64748b;max-width:140px;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${v || '–'}</div>
    </div>`
  ).join('');

  const assigneeOptions = crmUsers.map(u =>
    `<option value="${u.user_id}" ${u.user_id===r.assigned_to?'selected':''}>${escAttr(u.full_name || u.email)} (${u.role})</option>`
  ).join('');
  const assigneeHTML = currentUser?.role === 'admin' || currentUser?.role === 'sale'
    ? `<div style="display:flex;gap:8px;align-items:center">
        <select class="crm-select" id="drawerAssignee">${currentUser?.role === 'admin' ? '<option value="">Chưa phân</option>' : ''}${assigneeOptions}</select>
        <button class="btn-primary" onclick="saveLeadAssignee('${r.id}')">Lưu</button>
      </div>`
    : `<div class="detail-item"><div class="di-label">Sale phụ trách</div><div class="di-val">${escHtml(r.assigned_profile?.full_name || r.assigned_profile?.email || 'Chưa phân')}</div></div>`;
  const lastInteractionHTML = r.last_interaction_at
    ? `<span style="color:var(--green);font-weight:700">${fmtDate(r.last_interaction_at)}</span>`
    : `<span class="empty">Chưa chăm sóc</span>`;
  const canAddNote = currentUser?.role === 'admin' || (!!r.assigned_to && r.assigned_to === currentUser?.id);
  const noteBlockedMessage = !r.assigned_to
    ? 'Lead này chưa có sale phụ trách. Bạn cần nhận lead trước khi thêm note.'
    : `Chỉ sale đang phụ trách (${escHtml(r.assigned_profile?.full_name || r.assigned_profile?.email || 'sale khác')}) mới được thêm note cho lead này.`;
  const noteEditorHTML = canAddNote
    ? `<div class="form-group" style="margin-bottom:8px">
        <label>Loại tương tác</label>
        <select class="crm-select" id="leadInteractionType">
          <option value="call">Gọi điện</option>
          <option value="message">Nhắn tin</option>
          <option value="meeting">Gặp trực tiếp</option>
          <option value="email">Email</option>
          <option value="note" selected>Ghi chú</option>
        </select>
      </div>
      <textarea class="note-box" id="leadNoteBody" placeholder="Thêm note: tóm tắt cuộc gọi, nhu cầu, phản hồi, bước tiếp theo..."></textarea>
      <div style="display:flex;justify-content:flex-end;margin:8px 0 12px">
        <button class="btn-primary" onclick="addLeadNote('${r.id}')">Lưu note</button>
      </div>`
    : `<div style="background:var(--dark3);border:1px solid var(--border);border-radius:8px;padding:12px 14px;margin-bottom:12px;color:var(--gray);font-size:.82rem;line-height:1.55">
        ${noteBlockedMessage}
      </div>`;
  const deleteLeadHTML = currentUser?.role === 'admin'
    ? `<button class="btn-sm-action del" onclick="deleteLead(event,'${r.id}',decodeURIComponent('${encAttr(r.name || r.phone || r.email || 'lead')}'))">Xóa lead</button>`
    : '';
  const notesHTML = (r.notes || []).length
    ? r.notes.map(n => `<div class="note-item">
        <div class="note-meta"><span>${interactionTypeBadge(n.interaction_type)} ${escHtml(n.author?.full_name || n.author?.email || 'Nhân viên')}</span><span>${fmtDate(n.created_at)}</span></div>
        <div class="note-body">${escHtml(n.body || '')}</div>
      </div>`).join('')
    : `<div style="color:var(--gray);font-size:.82rem;padding:8px 0">Chưa có note nào.</div>`;
  const leadTagIds = new Set((r.tags || []).map(t => t.id || t.tag_id));
  const tagChipsHTML = (r.tags || []).length
    ? `<div class="tag-list">${(r.tags || []).map(t => `<span class="tag-chip"><span class="tag-dot" style="background:${escAttr(t.color || '#5c6ac4')}"></span>${escHtml(t.category_name ? t.category_name + ' / ' + t.name : t.name || t.tag_id)}</span>`).join('')}</div>`
    : `<span class="empty">Chưa có tag</span>`;
  const tagsByCategory = (crmTags || []).reduce((acc, t) => {
    const key = t.category_name || 'Khác';
    (acc[key] ||= []).push(t);
    return acc;
  }, {});
  const tagOptionsHTML = Object.entries(tagsByCategory).map(([category, tags]) =>
    `<optgroup label="${escAttr(category)}">${tags.map(t => `<option value="${escAttr(t.id)}" ${leadTagIds.has(t.id)?'selected':''}>${escHtml(t.name)}</option>`).join('')}</optgroup>`
  ).join('');
  const tagsHTML = crmTags.length ? `
    <details class="lead-tag-editor" ${leadTagIds.size ? 'open' : ''}>
      <summary style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:10px;list-style:none">
        <span>
          <span class="di-label">Tag phân loại</span>
          <span style="display:block;margin-top:5px">${tagChipsHTML}</span>
        </span>
        <span class="btn-sm-action toggle" style="pointer-events:none">${leadTagIds.size ? 'Sửa tag' : 'Gắn tag'}</span>
      </summary>
      <div style="margin-top:10px">
        <select id="leadTagSelect" class="crm-select tag-select compact" multiple>
          ${tagOptionsHTML}
        </select>
        <div style="display:flex;justify-content:flex-end;margin-top:8px">
          <button class="btn-primary" onclick="saveLeadTags('${r.id}')">Lưu tag</button>
        </div>
      </div>
    </details>`
    : `<div class="lead-tag-editor empty-tags">
        <div>
          <div class="di-label">Tag phân loại</div>
          <div style="margin-top:5px"><span class="empty">Chưa có tag nào được tạo trong hệ thống.</span></div>
        </div>
      </div>`;
  const survey = r.survey || {};
  const surveyFields = [
    ['Giai đoạn hiện tại', survey.q1_stage],
    ['Vấn đề chính', survey.q2_problem],
    ['Sai lầm thường gặp', survey.q3_error],
    ['Mục tiêu', survey.q4_goal],
    ['Muốn học gì', survey.q5_learning],
    ['Thời gian học', survey.q6_time],
    ['Mối quan tâm', survey.q7_concern],
    ['Kỳ vọng', survey.q8_expectation],
    ['Ưu tiên', survey.q9_priority],
  ].filter(([, v]) => v);
  const surveyHTML = (r.interest || surveyFields.length)
    ? `<div class="detail-section">
        <div class="detail-section-title">Khảo sát & sở thích</div>
        <div class="detail-grid cols2">
          ${r.interest ? item('Sở thích', escHtml(r.interest)) : ''}
          ${survey.submitted_at ? item('Thời gian khảo sát', fmtDate(survey.submitted_at)) : ''}
          ${surveyFields.map(([label, value]) => item(label, escHtml(value))).join('')}
        </div>
      </div>`
    : '';
  const renderCustomFieldInput = f => {
    const val0 = f.value ?? '';
    const req = f.required ? 'required' : '';
    const common = `class="crm-input lead-custom-field" data-field-id="${f.id}" data-field-type="${f.type}" ${req}`;
    if (f.type === 'boolean') {
      return `<label style="display:flex;align-items:center;gap:8px;font-size:.86rem;color:var(--white)">
        <input type="checkbox" class="lead-custom-field" data-field-id="${f.id}" data-field-type="boolean" ${val0===true || val0==='true' ? 'checked' : ''}> Có
      </label>`;
    }
    if (f.type === 'dropdown') {
      return `<select ${common}><option value="">–</option>${(f.options || []).map(o => `<option value="${escAttr(o)}" ${String(val0)===String(o)?'selected':''}>${escHtml(o)}</option>`).join('')}</select>`;
    }
    if (f.type === 'multiselect') {
      const selected = Array.isArray(val0) ? val0 : String(val0 || '').split(',').map(s => s.trim()).filter(Boolean);
      return `<select ${common} multiple style="min-height:90px">${(f.options || []).map(o => `<option value="${escAttr(o)}" ${selected.includes(o)?'selected':''}>${escHtml(o)}</option>`).join('')}</select>`;
    }
    const inputType = f.type === 'date' ? 'date' : (f.type === 'number' || f.type === 'currency' ? 'number' : (f.type === 'url' ? 'url' : 'text'));
    return `<input ${common} type="${inputType}" value="${escAttr(val0)}">`;
  };
  const fieldsByCategory = (r.custom_fields || []).reduce((acc, f) => {
    const key = f.group_name || 'Khác';
    (acc[key] ||= []).push(f);
    return acc;
  }, {});
  const customFieldsHTML = (r.custom_fields || []).length
    ? `<div class="detail-section">
        <div class="detail-section-title">Custom fields</div>
        ${Object.entries(fieldsByCategory).map(([category, fields]) => `
          <div style="margin-bottom:14px">
            <div style="font-size:.72rem;color:var(--gray);text-transform:uppercase;letter-spacing:.08em;font-weight:700;margin-bottom:8px">${escHtml(category)}</div>
            <div class="detail-grid cols2">
              ${fields.map(f => `<div class="detail-item">
                <div class="di-label">${escHtml(f.label)}${f.required ? ' *' : ''}</div>
                ${renderCustomFieldInput(f)}
              </div>`).join('')}
            </div>
          </div>`).join('')}
        <div style="display:flex;justify-content:flex-end;margin-top:10px">
          <button class="btn-primary" onclick="saveLeadCustomFields('${r.id}')">Lưu custom fields</button>
        </div>
      </div>`
    : '';
  const fmtDuration = seconds => {
    const n = Math.max(0, Number(seconds || 0));
    const h = Math.floor(n / 3600);
    const m = Math.floor((n % 3600) / 60);
    const s = n % 60;
    if (h) return `${h}h ${m}m`;
    if (m) return `${m}m ${s}s`;
    return `${s}s`;
  };
  const zoomRows = r.zoom_attendances || [];
  const zoomTotal = zoomRows.reduce((sum, z) => sum + Number(z.duration || 0), 0);
  const zoomHTML = `
    <div class="detail-section">
      <div class="detail-section-title">Zoom da tham gia</div>
      ${zoomRows.length ? `
        <div style="color:var(--gray);font-size:.74rem;margin-bottom:8px"></div>
        <div style="background:var(--dark3);border-radius:8px;overflow:hidden;border:1px solid var(--border)">
          <table style="width:100%;border-collapse:collapse;font-size:.78rem">
            <thead>
              <tr style="color:var(--gray);text-align:left;background:rgba(255,255,255,.03)">
                <th style="padding:9px 10px">Ngay to chuc</th>
                <th style="padding:9px 10px">Ten / topic</th>
                <th style="padding:9px 10px">Meeting ID</th>
                <th style="padding:9px 10px">Ten Zoom</th>
                <th style="padding:9px 10px">Vao</th>
                <th style="padding:9px 10px">Roi</th>
                <th style="padding:9px 10px;text-align:right">Thoi luong</th>
              </tr>
            </thead>
            <tbody>
              ${zoomRows.map(z => {
                const meeting = z.meeting || {};
                return `<tr style="border-top:1px solid var(--border)">
                  <td style="padding:9px 10px;color:var(--white)">${meeting.start_time ? fmtDate(meeting.start_time) : '-'}</td>
                  <td style="padding:9px 10px;color:var(--white)">${escHtml(meeting.topic || '-')}</td>
                  <td style="padding:9px 10px;color:#94a3b8;font-family:monospace">${escHtml(z.zoom_meeting_id || meeting.zoom_meeting_id || '-')}</td>
                  <td style="padding:9px 10px;color:var(--white)">${escHtml(z.zoom_display_name || '-')}</td>
                  <td style="padding:9px 10px;color:var(--gray)">${z.join_time ? fmtDate(z.join_time) : '-'}</td>
                  <td style="padding:9px 10px;color:var(--gray)">${z.leave_time ? fmtDate(z.leave_time) : '-'}</td>
                  <td style="padding:9px 10px;color:var(--green);font-weight:700;text-align:right">${fmtDuration(z.duration)}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div style="margin-top:8px;font-size:.78rem;color:var(--gray)">Tong thoi gian tham gia: <span style="color:var(--green);font-weight:700">${fmtDuration(zoomTotal)}</span></div>
      ` : `<div style="color:var(--gray);font-size:.82rem;padding:10px 0">Chua co du lieu tham gia Zoom cho email nay.</div>`}
    </div>`;
  const trainingStageHTML = r.trainingStage ? `
    <div class="detail-section">
      <div class="detail-section-title">Campaign 14 days</div>
      <div class="detail-grid">
        <div class="detail-item"><div class="di-label">Giai đoạn hiện tại</div><div class="di-val">Ngày ${fmt(r.trainingStage)} / 14</div></div>
        <div class="detail-item"><div class="di-label">Trạng thái liên kết</div><div class="di-val">Đã liên kết email</div></div>
      </div>
      <div style="margin-top:12px"><button class="btn-primary" onclick="openCampaignEmailDetail('${escAttr(r.email || '')}')">Xem chi tiết Campaign</button></div>
    </div>` : '';

  document.getElementById('drawerBody').innerHTML = `

    ${trainingStageHTML}

    <!-- ① Thông tin liên hệ -->
    <div class="detail-section">
      <div class="detail-section-title">📋 Thông tin liên hệ</div>
      <div class="detail-grid">
        ${item('Họ và tên', r.name)}
        ${item('Số điện thoại', r.phone)}
        ${item('Email', r.email || '')}
        ${item('Khu vực', r.region || '')}
        ${item('Hình thức tham dự', r.attendance || '')}
        ${item('Thời gian đăng ký', fmtDate(r.registered_at))}
        ${item('ID đăng ký', `<div class="di-val mono">${r.id}</div>`)}
        ${item('Session ID', `<div class="di-val mono">${r.session_id || '–'}</div>`)}
      </div>
    </div>

    ${surveyHTML}
    ${customFieldsHTML}
    ${zoomHTML}

    <div class="detail-section">
      <div class="detail-section-title">CRM</div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px">
        <div style="font-size:.8rem;color:var(--gray)">Tương tác gần nhất: ${lastInteractionHTML}</div>
        ${deleteLeadHTML}
      </div>
      <div style="margin-bottom:12px">${assigneeHTML}</div>
      ${noteEditorHTML}
      <div id="leadNotesList">${notesHTML}</div>
      ${tagsHTML}
    </div>

    <!-- ② Vị trí địa lý -->
    <div class="detail-section">
      <div class="detail-section-title">📍 Vị trí địa lý ${!r.geo ? '<span style="font-size:.65rem;color:var(--gray)">(đang xử lý hoặc không xác định)</span>' : ''}</div>
      <div class="detail-grid">
        ${item('Quốc gia', r.geo ? `${r.geo.country} (${r.geo.country_code})` : '')}
        ${item('Tỉnh / Vùng', r.geo?.region || '')}
        ${item('Thành phố', r.geo?.city || '')}
        ${item('ISP / Nhà mạng', r.geo?.isp || '')}
        ${item('Tổ chức', r.geo?.org || '')}
        ${r.geo?.lat ? item('Tọa độ', `${r.geo.lat}, ${r.geo.lon}<br>${geoMapLink}`) : item('Tọa độ', '')}
      </div>
    </div>

    <!-- ③ Thiết bị -->
    <div class="detail-section">
      <div class="detail-section-title">📱 Thiết bị & Trình duyệt</div>
      <div class="detail-grid">
        ${item('Loại thiết bị', `<div class="di-val">${dtIcon} ${dev.device_type || '–'}</div>`)}
        ${item('Hệ điều hành', dev.os || '')}
        ${item('Trình duyệt', dev.browser ? `${dev.browser} ${dev.browser_version || ''}`.trim() : '')}
        ${item('IP Address', r.ip || '')}
      </div>
      <div style="margin-top:8px">
        <div class="di-label" style="margin-bottom:6px">User Agent (raw)</div>
        <div class="ua-box">${r.user_agent || '–'}</div>
      </div>
    </div>

    <!-- ④ UTM Tracking -->
    <div class="detail-section">
      <div class="detail-section-title">📣 UTM & Nguồn truy cập</div>
      <div class="detail-grid">
        ${item('Channel', `<div class="di-val"><span class="di-badge" style="background:${chanCol}22;color:${chanCol}">${r.channel || '–'}</span></div>`)}
        ${item('Source', r.utm_source || 'direct')}
        ${item('Medium', r.utm_medium || '(none)')}
        ${item('Campaign', r.utm_campaign || '')}
        ${item('Content', r.utm_content || '')}
        ${item('Term', r.utm_term || '')}
        ${item('Referrer', `<div class="di-val mono">${r.referrer || '–'}</div>`)}
      </div>
    </div>

    <!-- ⑤ Click IDs -->
    <div class="detail-section">
      <div class="detail-section-title">🔗 Click IDs</div>
      <div class="detail-grid cols1">
        ${item('fbclid (Facebook Click ID)', `<div class="di-val mono">${r.fbclid || '–'}</div>`)}
        ${item('gclid (Google Click ID)',    `<div class="di-val mono">${r.gclid  || '–'}</div>`)}
        ${item('ttclid (TikTok Click ID)',   `<div class="di-val mono">${r.ttclid || '–'}</div>`)}
        ${item('msclkid (Microsoft Ads)',    `<div class="di-val mono">${r.msclkid|| '–'}</div>`)}
        ${item('twclid (X/Twitter)',         `<div class="di-val mono">${r.twclid || '–'}</div>`)}
      </div>
    </div>

    <!-- ⑥ Pixel Cookies -->
    <div class="detail-section">
      <div class="detail-section-title">🍪 Pixel Cookies</div>
      <div class="detail-grid cols1">
        ${item('_fbc (Facebook Click Cookie)', `<div class="di-val mono">${r.fbc || '–'}</div>`)}
        ${item('_fbp (Facebook Browser ID)',   `<div class="di-val mono">${r.fbp || '–'}</div>`)}
        ${item('_ga (Google Analytics CID)',   `<div class="di-val mono">${r.ga  || '–'}</div>`)}
      </div>
    </div>

    <!-- ⑦ CAPI Readiness -->
    <div class="detail-section">
      <div class="detail-section-title">⚡ CAPI Data Checklist</div>
      <div style="background:var(--dark3);border-radius:8px;padding:12px 14px">
        ${capiHTML}
      </div>
    </div>
  `;
}

// ════════════════════════════════════════════════════════════════════════
// DEVICES & GEO
// ════════════════════════════════════════════════════════════════════════
