const ADVANCED_STANDARD_FIELDS = [
  { field:'name', label:'Họ tên', type:'text' },
  { field:'phone', label:'SĐT', type:'text' },
  { field:'email', label:'Email', type:'text' },
  { field:'region', label:'Khu vực', type:'text' },
  { field:'attendance', label:'Hình thức', type:'text' },
  { field:'source', label:'Source', type:'text' },
  { field:'medium', label:'Medium', type:'text' },
  { field:'channel', label:'Channel', type:'dropdown', options:['Paid Search','Organic Search','Social','Email','Referral','Display','Direct','SMS','Other Campaign'] },
  { field:'assigned_to', label:'Sale phụ trách', type:'dropdown', getOptions: () => crmUsers.map(u => ({ value:u.user_id, label:u.full_name || u.email })) },
  { field:'tags', label:'Tag', type:'tag', getOptions: () => crmTags.map(t => ({ value:t.id, label:`${t.category_name ? t.category_name + ' / ' : ''}${t.name}` })) },
  { field:'registered_at', label:'Thời gian đăng ký', type:'timestamp' },
  { field:'last_interaction_at', label:'Tương tác gần nhất', type:'timestamp' },
  { field:'city', label:'Thành phố', type:'text' },
  { field:'country', label:'Quốc gia', type:'text' },
  { field:'device_type', label:'Thiết bị', type:'dropdown', options:['Mobile','Desktop','Tablet','Unknown'] },
];

function getAdvancedFieldDefs() {
  const custom = (leadCustomFields || []).map(f => ({
    field: `custom:${f.id}`,
    label: `[Custom] ${f.group_name || 'Khác'} / ${f.label}`,
    type: f.type === 'currency' ? 'currency' : (f.type === 'multiselect' ? 'multiselect' : f.type),
    options: f.options || [],
  }));
  return [...ADVANCED_STANDARD_FIELDS, ...custom];
}

function operatorOptionsForType(type) {
  if (type === 'number' || type === 'currency') return [
    ['eq','='], ['ne','≠'], ['gt','>'], ['lt','<'], ['gte','≥'], ['lte','≤'], ['between','Trong khoảng'], ['empty','Trống'], ['not_empty','Không trống']
  ];
  if (type === 'date' || type === 'timestamp') return [
    ['on','Là ngày'], ['before','Trước'], ['after','Sau'], ['between','Trong khoảng'], ['last_days','Trong X ngày qua'], ['next_days','X ngày tới'], ['empty','Trống'], ['not_empty','Không trống']
  ];
  if (type === 'dropdown') return [['in','Là một trong'], ['not_in','Không phải'], ['empty','Trống'], ['not_empty','Không trống']];
  if (type === 'boolean') return [['true','Là true'], ['false','Là false']];
  if (type === 'multiselect' || type === 'tag') return [['all','Có tất cả'], ['any','Có bất kỳ'], ['none','Không có'], ['empty','Trống'], ['not_empty','Không trống']];
  return [['is','Là'], ['not','Không là'], ['contains','Chứa'], ['not_contains','Không chứa'], ['empty','Trống'], ['not_empty','Không trống']];
}

async function loadLeadCustomFields() {
  try {
    const res = await fetch('/admin/crm/custom-fields');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    leadCustomFields = data.rows || [];
  } catch {
    leadCustomFields = [];
  }
}

async function loadCrmTags({ counts = false } = {}) {
  try {
    const res = await fetch('/admin/crm/tags' + (counts ? '' : '?counts=0'));
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    crmTagCategories = data.categories || [];
    crmTags = data.tags || [];
    crmSettings = { ...crmSettings, tagCategories: crmTagCategories, tags: crmTags };
    syncTagFilterOptions(crmTags);
  } catch {
    crmTagCategories = [];
    crmTags = [];
    crmSettings = { ...crmSettings, tagCategories: [], tags: [] };
    syncTagFilterOptions([]);
  }
}

function normalizeAdvancedFiltersForRequest() {
  syncAdvancedFiltersFromDom();
  const defs = Object.fromEntries(getAdvancedFieldDefs().map(d => [d.field, d]));
  const filters = advancedLeadFilters
    .map(f => ({ ...f, type: defs[f.field]?.type || f.type || 'text' }))
    .filter(f => f.field && f.op);
  const tagFilter = document.getElementById('tagFilter')?.value || '';
  if (tagFilter) filters.push({ field: 'tags', op: 'any', value: [tagFilter], type: 'tag' });
  return filters;
}

function syncAdvancedFiltersFromDom() {
  document.querySelectorAll('[data-filter-value]').forEach(el => {
    const idx = Number(el.dataset.filterValue);
    if (!advancedLeadFilters[idx]) return;
    advancedLeadFilters[idx].value = el.multiple ? Array.from(el.selectedOptions || []).map(o => o.value) : el.value;
  });
  document.querySelectorAll('[data-filter-value2]').forEach(el => {
    const idx = Number(el.dataset.filterValue2);
    if (!advancedLeadFilters[idx]) return;
    advancedLeadFilters[idx].value2 = el.value;
  });
}

function filterValueControl(filter, idx, fieldDef) {
  const op = filter.op;
  if (op === 'empty' || op === 'not_empty' || op === 'true' || op === 'false') return '';
  const type = fieldDef?.type || 'text';
  const options = typeof fieldDef?.getOptions === 'function' ? fieldDef.getOptions() : (fieldDef?.options || []).map(o => typeof o === 'object' ? o : ({ value:o, label:o }));
  if (type === 'dropdown') {
    return `<select class="btn-hdr" data-filter-value="${idx}">
      ${options.map(o => `<option value="${escAttr(o.value)}" ${String(filter.value)===String(o.value)?'selected':''}>${escHtml(o.label)}</option>`).join('')}
    </select>`;
  }
  if (type === 'multiselect' || type === 'tag') {
    const selected = Array.isArray(filter.value) ? filter.value : String(filter.value || '').split(',').map(s => s.trim()).filter(Boolean);
    return `<select class="btn-hdr" data-filter-value="${idx}" multiple style="min-height:76px">
      ${options.map(o => `<option value="${escAttr(o.value)}" ${selected.includes(String(o.value))?'selected':''}>${escHtml(o.label)}</option>`).join('')}
    </select>`;
  }
  const inputType = type === 'date' || type === 'timestamp' ? (op === 'last_days' || op === 'next_days' ? 'number' : 'date') : (type === 'number' || type === 'currency' ? 'number' : 'text');
  const second = op === 'between'
    ? `<input class="btn-hdr" data-filter-value2="${idx}" type="${inputType}" value="${escAttr(filter.value2 || '')}" style="min-width:130px">`
    : '';
  return `<input class="btn-hdr" data-filter-value="${idx}" type="${inputType}" value="${escAttr(filter.value || '')}" placeholder="Giá trị" style="min-width:150px">${second}`;
}

function renderAdvancedFilters() {
  const wrap = document.getElementById('advancedFiltersBody');
  if (!wrap) return;
  const defs = getAdvancedFieldDefs();
  const defMap = Object.fromEntries(defs.map(d => [d.field, d]));
  wrap.innerHTML = advancedLeadFilters.length ? advancedLeadFilters.map((f, idx) => {
    const fieldDef = defMap[f.field] || defs[0];
    const ops = operatorOptionsForType(fieldDef.type);
    if (!ops.some(([op]) => op === f.op)) f.op = ops[0][0];
    return `<div style="display:flex;gap:8px;align-items:flex-start;flex-wrap:wrap;margin-bottom:8px">
      <select class="btn-hdr" data-filter-field="${idx}" style="min-width:230px">
        ${defs.map(d => `<option value="${escAttr(d.field)}" ${d.field===f.field?'selected':''}>${escHtml(d.label)}</option>`).join('')}
      </select>
      <select class="btn-hdr" data-filter-op="${idx}" style="min-width:150px">
        ${ops.map(([op,label]) => `<option value="${op}" ${op===f.op?'selected':''}>${label}</option>`).join('')}
      </select>
      ${filterValueControl(f, idx, fieldDef)}
      <button class="btn-sm-action del" data-filter-remove="${idx}">Xóa</button>
    </div>`;
  }).join('') : `<div style="color:var(--gray);font-size:.82rem">Chưa có điều kiện nâng cao. Bấm “+ Điều kiện” để lọc kết hợp nhiều thông tin.</div>`;

  wrap.querySelectorAll('[data-filter-field]').forEach(el => el.addEventListener('change', e => {
    const idx = Number(e.target.dataset.filterField);
    const def = defMap[e.target.value] || defs[0];
    advancedLeadFilters[idx] = { field:def.field, type:def.type, op:operatorOptionsForType(def.type)[0][0], value:'', value2:'' };
    renderAdvancedFilters();
  }));
  wrap.querySelectorAll('[data-filter-op]').forEach(el => el.addEventListener('change', e => {
    advancedLeadFilters[Number(e.target.dataset.filterOp)].op = e.target.value;
    renderAdvancedFilters();
  }));
  wrap.querySelectorAll('[data-filter-value]').forEach(el => el.addEventListener('change', e => {
    const idx = Number(e.target.dataset.filterValue);
    advancedLeadFilters[idx].value = el.multiple ? Array.from(el.selectedOptions).map(o => o.value) : e.target.value;
  }));
  wrap.querySelectorAll('[data-filter-value2]').forEach(el => el.addEventListener('change', e => {
    advancedLeadFilters[Number(e.target.dataset.filterValue2)].value2 = e.target.value;
  }));
  wrap.querySelectorAll('[data-filter-remove]').forEach(el => el.addEventListener('click', e => {
    advancedLeadFilters.splice(Number(e.target.dataset.filterRemove), 1);
    leadsPageNum = 1;
    renderAdvancedFilters();
    fetchLeadsPage();
  }));
}

async function renderLeads() {
  await Promise.all([loadLeadCustomFields(), loadCrmTags()]);
  document.getElementById('mainLeads').innerHTML = `
    <div class="table-card">
      <div class="table-head-bar">
        <span class="card-title" id="leadsCountLabel">👥 Đang tải...</span>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <input type="text" id="leadsSearchInput" class="btn-hdr" style="min-width:230px"
                 placeholder="🔍 Tìm theo email hoặc SĐT..." value="${leadsSearch.replace(/"/g,'&quot;')}">
          <button class="btn-hdr green" id="addManualLeadBtn" type="button" title="Them lead thu cong">+ Lead</button>
          <select id="leadAssigneeFilter" class="btn-hdr" style="cursor:pointer;padding-right:1.2rem">
            <option value="">Tất cả sale</option>
            ${crmUsers.map(u => `<option value="${u.user_id}" ${u.user_id===leadAssignee?'selected':''}>${u.full_name || u.email} (${u.role})</option>`).join('')}
          </select>
          <span style="font-size:.75rem;color:var(--gray)"></span>
        </div>
      </div>
      <div style="border-bottom:1px solid var(--border);padding:12px 18px;background:var(--dark2)">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px">
          <div>
            <div class="card-title">Lọc nâng cao</div>
            <div class="card-note" style="margin-top:4px">Các điều kiện được kết hợp theo AND. Custom field sẽ tự xuất hiện tại đây.</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn-hdr green" id="addAdvancedFilterBtn">+ Điều kiện</button>
            <button class="btn-hdr" id="applyAdvancedFilterBtn">Áp dụng</button>
            <button class="btn-hdr" id="clearAdvancedFilterBtn">Xóa lọc</button>
          </div>
        </div>
        <div id="advancedFiltersBody"></div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>#</th><th>Họ tên</th><th>SĐT</th><th>Email</th>
            <th>Khu vực</th><th>Hình thức</th><th>Source</th><th>Medium</th>
            <th>Sale phụ trách</th><th>Tương tác gần nhất</th><th>Vị trí</th><th>CAPI</th><th>Thời gian</th><th>Thao tác</th>
          </tr></thead>
          <tbody id="leadsTbody"><tr><td colspan="14" style="text-align:center;padding:40px;color:var(--gray)">Đang tải...</td></tr></tbody>
        </table>
      </div>
      <div id="leadsPagination" style="display:flex;justify-content:space-between;align-items:center;padding:12px 18px;gap:10px;flex-wrap:wrap"></div>
    </div>`;

  document.getElementById('leadsSearchInput').addEventListener('input', e => {
    clearTimeout(leadsSearchTimer);
    const val = e.target.value;
    leadsSearchTimer = setTimeout(() => {
      leadsSearch  = val.trim();
      leadsPageNum = 1;
      fetchLeadsPage();
    }, 350);
  });
  const assigneeFilter = document.getElementById('leadAssigneeFilter');
  if (assigneeFilter) assigneeFilter.addEventListener('change', e => {
    leadAssignee = e.target.value;
    leadsPageNum = 1;
    fetchLeadsPage();
  });
  document.getElementById('addManualLeadBtn')?.addEventListener('click', openManualLeadModal);

  document.getElementById('addAdvancedFilterBtn').addEventListener('click', () => {
    const first = getAdvancedFieldDefs()[0];
    advancedLeadFilters.push({ field:first.field, type:first.type, op:operatorOptionsForType(first.type)[0][0], value:'', value2:'' });
    renderAdvancedFilters();
  });
  document.getElementById('applyAdvancedFilterBtn').addEventListener('click', () => {
    leadsPageNum = 1;
    fetchLeadsPage();
  });
  document.getElementById('clearAdvancedFilterBtn').addEventListener('click', () => {
    advancedLeadFilters = [];
    leadsPageNum = 1;
    renderAdvancedFilters();
    fetchLeadsPage();
  });
  renderAdvancedFilters();

  fetchLeadsPage();
}

function openManualLeadModal() {
  const overlay = document.getElementById('manualLeadOverlay');
  const form = document.getElementById('manualLeadForm');
  if (!overlay || !form) return;
  form.reset();
  overlay.classList.remove('hidden');
  setTimeout(() => document.getElementById('manualLeadName')?.focus(), 30);
}

function closeManualLeadModal() {
  document.getElementById('manualLeadOverlay')?.classList.add('hidden');
}

async function submitManualLead(e) {
  e?.preventDefault?.();
  const btn = document.getElementById('manualLeadSave');
  const payload = {
    name: document.getElementById('manualLeadName')?.value.trim() || '',
    email: document.getElementById('manualLeadEmail')?.value.trim() || '',
    phone: document.getElementById('manualLeadPhone')?.value.trim() || '',
  };
  if (!payload.name || !payload.email || !payload.phone) return toast('Vui long nhap du ho ten, email va phone', 'error');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Dang luu...';
  }
  try {
    const res = await fetch('/admin/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast(data.error || 'Khong tao duoc lead', 'error');
    toast('Đã tạo Lead thủ công thành công', 'success');
    closeManualLeadModal();
    leadsSearch = '';
    leadAssignee = '';
    advancedLeadFilters = [];
    leadsPageNum = 1;
    invalidateViewCache('leads');
    await renderLeads();
    if (data.lead?.id) openLeadDrawer(data.lead.id);
  } catch {
    toast('Loi ket noi khi tao lead', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Luu lead';
    }
  }
}

async function fetchLeadsPage() {
  const tbody = document.getElementById('leadsTbody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="14" style="text-align:center;padding:40px;color:var(--gray)"><div class="spin" style="margin:0 auto"></div></td></tr>`;
  try {
    const dateParams = getDateRangeParams();
    const params = new URLSearchParams(Object.assign(
      { q: leadsSearch, pageNum: leadsPageNum, pageSize: leadsPageSize, assignee: leadAssignee, filters: JSON.stringify(normalizeAdvancedFiltersForRequest()) },
      dateParams
    ));
    const res = await fetch('/admin/leads?' + params.toString());
    if (!res.ok) { tbody.innerHTML = `<tr><td colspan="14" style="text-align:center;padding:40px;color:var(--red)">❌ Lỗi tải dữ liệu</td></tr>`; return; }
    const d = await res.json();
    leadsTotal = d.total || 0;
    renderLeadsRows(d.rows || []);
    renderLeadsPagination();
    viewCache.leads = true;
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="14" style="text-align:center;padding:40px;color:var(--red)">❌ Lỗi kết nối</td></tr>`;
  }
}

function renderLeadsRows(rows) {
  const offset = (leadsPageNum - 1) * leadsPageSize;
  const interactionCell = r => r.last_interaction_at
    ? `<span style="color:var(--green);font-weight:600">${fmtDate(r.last_interaction_at)}</span>`
    : `<span class="empty">Chưa chăm sóc</span>`;
  const actionCell = r => currentUser?.role === 'admin'
    ? `<button class="btn-sm-action del" onclick="deleteLead(event,'${r.id}',decodeURIComponent('${encAttr(r.name || r.phone || r.email || 'lead')}'))">Xóa</button>`
    : '<span class="empty">–</span>';

  const html = rows.length
    ? rows.map((r, i) => {
        const capiStatus = [
          r.has_fbc  ? '<span class="capi-ok"  title="fbc ✓">fb</span>'  : '<span class="capi-miss" title="fbc –">fb</span>',
          r.has_gclid? '<span class="capi-ok"  title="gclid ✓">gc</span>': '<span class="capi-miss" title="gclid –">gc</span>'
        ].join(' ');
        return `
        <tr class="lead-row" data-id="${r.id}" onclick="openLeadDrawer('${r.id}')">
          <td style="color:var(--gray)">${leadsTotal - offset - i}</td>
          <td style="font-weight:600">${r.name}</td>
          <td>${r.phone}</td>
          <td>${r.email || '<span class="empty">–</span>'}</td>
          <td style="font-size:.78rem;font-weight:600;color:var(--gold)">${r.region || '<span class="empty">–</span>'}</td>
          <td style="font-size:.78rem;color:#58a6ff">${r.attendance || '<span class="empty">–</span>'}</td>
          <td><span class="badge-src">${r.source || 'direct'}</span></td>
          <td><span class="badge-med">${r.medium || '(none)'}</span></td>
          <td style="font-size:.75rem;color:${r.assigned_name?'var(--green)':'var(--gray)'}">${r.assigned_name || 'Chưa phân'}</td>
          <td style="font-size:.75rem;white-space:nowrap">${interactionCell(r)}</td>
          <td style="color:var(--gray);font-size:.75rem">${r.city ? r.city + ', ' + r.country : r.country || '–'}</td>
          <td style="font-size:.72rem">${capiStatus}</td>
          <td style="color:var(--gray);font-size:.75rem;white-space:nowrap">${fmtDate(r.registered_at)}</td>
          <td>${actionCell(r)}</td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="14" style="text-align:center;padding:40px;color:var(--gray)">${leadsSearch ? 'Không tìm thấy kết quả phù hợp' : 'Chưa có đăng ký nào'}</td></tr>`;

  document.getElementById('leadsTbody').innerHTML = html;
  const label = document.getElementById('leadsCountLabel');
  if (label) label.textContent = `👥 ${fmt(leadsTotal)} người đã đăng ký` + (leadsSearch ? ` — lọc: "${leadsSearch}"` : '');
}

function renderLeadsPagination() {
  const el = document.getElementById('leadsPagination');
  if (!el) return;
  const totalPages = Math.max(1, Math.ceil(leadsTotal / leadsPageSize));
  if (leadsPageNum > totalPages) leadsPageNum = totalPages;

  el.innerHTML = `
    <div style="font-size:.78rem;color:var(--gray)">Trang ${leadsPageNum}/${totalPages}</div>
    <div style="display:flex;gap:6px;align-items:center">
      <button class="btn-hdr" id="leadsPrevBtn" ${leadsPageNum<=1?'disabled':''}>‹ Trước</button>
      <button class="btn-hdr" id="leadsNextBtn" ${leadsPageNum>=totalPages?'disabled':''}>Sau ›</button>
      <select id="leadsPageSizeSel" class="btn-hdr">
        ${[20,50,100,200].map(n=>`<option value="${n}" ${n===leadsPageSize?'selected':''}>${n}/trang</option>`).join('')}
      </select>
    </div>`;

  document.getElementById('leadsPrevBtn').addEventListener('click', () => { if (leadsPageNum > 1) { leadsPageNum--; fetchLeadsPage(); } });
  document.getElementById('leadsNextBtn').addEventListener('click', () => { if (leadsPageNum < totalPages) { leadsPageNum++; fetchLeadsPage(); } });
  document.getElementById('leadsPageSizeSel').addEventListener('change', e => {
    leadsPageSize = parseInt(e.target.value, 10) || 20;
    leadsPageNum  = 1;
    fetchLeadsPage();
  });
}

// ════════════════════════════════════════════════════════════════════════
// DUPLICATE LEADS REPORT
// ════════════════════════════════════════════════════════════════════════
async function renderDuplicateLeads() {
  const root = document.getElementById('mainDuplicates');
  root.innerHTML = `
    <div class="table-card">
      <div class="table-head-bar">
        <div>
          <div class="card-title" id="duplicateReportTitle">Dang quet lead trung...</div>
          <div class="card-note" style="margin-top:4px">Report chi doc du lieu. Chon mot nhom, tick 2 lead de preview merge.</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <input type="text" id="duplicateSearchInput" class="btn-hdr" style="min-width:230px" placeholder="Tim email, phone, ten, page...">
          <select id="duplicateTypeFilter" class="btn-hdr">
            <option value="all">Email va phone</option>
            <option value="email">Chi email</option>
            <option value="phone">Chi phone</option>
          </select>
          <button class="btn-hdr green" id="duplicateRefreshBtn">Quet lai</button>
        </div>
      </div>
      <div class="duplicate-layout" style="padding:16px 18px">
        <div>
          <div class="stats-grid" style="grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:12px">
            <div class="stat-card green" style="padding:14px"><div class="stat-label">Nhom trung</div><div class="stat-value" id="duplicateGroupCount">0</div></div>
            <div class="stat-card gold" style="padding:14px"><div class="stat-label">Lead trong nhom</div><div class="stat-value" id="duplicateLeadCount">0</div></div>
          </div>
          <div class="duplicate-groups" id="duplicateGroupsList"><div class="drawer-loading"><div class="spin"></div> Dang tai...</div></div>
        </div>
        <div id="duplicateGroupDetail">
          <div class="card" style="box-shadow:none"><div class="empty">Chon mot nhom trung de xem cac lead ben trong.</div></div>
        </div>
      </div>
    </div>`;

  let timer = null;
  document.getElementById('duplicateSearchInput').addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(fetchDuplicateGroups, 350);
  });
  document.getElementById('duplicateTypeFilter').addEventListener('change', fetchDuplicateGroups);
  document.getElementById('duplicateRefreshBtn').addEventListener('click', fetchDuplicateGroups);
  await fetchDuplicateGroups();
}

async function fetchDuplicateGroups() {
  const list = document.getElementById('duplicateGroupsList');
  if (!list) return;
  list.innerHTML = '<div class="drawer-loading"><div class="spin"></div> Dang quet duplicate...</div>';
  duplicateSelectedGroup = null;
  duplicateSelectedIds = new Set();
  document.getElementById('duplicateGroupDetail').innerHTML = '<div class="card" style="box-shadow:none"><div class="empty">Dang tai report...</div></div>';
  try {
    const params = new URLSearchParams({
      q: document.getElementById('duplicateSearchInput')?.value.trim() || '',
      type: document.getElementById('duplicateTypeFilter')?.value || 'all',
      limit: '200',
    });
    const res = await fetch('/admin/leads/duplicates?' + params.toString());
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    duplicateGroups = data.groups || [];
    document.getElementById('duplicateReportTitle').textContent = `Report lead trung - cap nhat ${fmtDate(data.generated_at)}`;
    document.getElementById('duplicateGroupCount').textContent = fmt(data.total_groups || 0);
    document.getElementById('duplicateLeadCount').textContent = fmt(data.total_duplicate_leads || 0);
    renderDuplicateGroupList();
    if (duplicateGroups[0]) selectDuplicateGroup(duplicateGroups[0].id);
    viewCache.duplicates = true;
  } catch (e) {
    list.innerHTML = '<div class="drawer-loading" style="color:var(--red)">Khong tai duoc report lead trung.</div>';
    document.getElementById('duplicateGroupDetail').innerHTML = '<div class="card" style="box-shadow:none"><div class="empty">Loi ket noi.</div></div>';
  }
}

function renderDuplicateGroupList() {
  const list = document.getElementById('duplicateGroupsList');
  if (!list) return;
  if (!duplicateGroups.length) {
    list.innerHTML = '<div class="card" style="box-shadow:none"><div class="empty">Chua tim thay nhom trung theo bo loc hien tai.</div></div>';
    return;
  }
  list.innerHTML = duplicateGroups.map(group => `
    <button type="button" class="duplicate-group ${duplicateSelectedGroup?.id===group.id?'active':''}" onclick="selectDuplicateGroup('${encAttr(group.id)}')">
      <div class="duplicate-group-key">${escHtml(group.key)}</div>
      <div class="duplicate-group-meta">
        <span class="duplicate-pill">${group.type === 'email' ? 'Email' : 'Phone'}</span>
        <span>${fmt(group.count)} lead</span>
        <span>${fmt(group.page_ids?.length || 0)} page</span>
        <span>${fmtDate(group.last_seen)}</span>
      </div>
    </button>
  `).join('');
}

function selectDuplicateGroup(encodedId) {
  let id = String(encodedId || '');
  try { id = decodeURIComponent(id); } catch {}
  duplicateSelectedGroup = duplicateGroups.find(g => g.id === id) || null;
  duplicateSelectedIds = new Set();
  renderDuplicateGroupList();
  renderDuplicateGroupDetail();
}

function duplicateLeadScore(lead) {
  const stats = lead.stats || {};
  return (lead.assigned_to ? 10 : 0) + Number(stats.notes || 0) + Number(stats.tags || 0) + Number(stats.custom_fields || 0) + Number(stats.zoom_attendances || 0);
}

function renderDuplicateGroupDetail() {
  const target = document.getElementById('duplicateGroupDetail');
  const group = duplicateSelectedGroup;
  if (!target || !group) return;
  const suggested = group.leads.slice().sort((a, b) =>
    duplicateLeadScore(b) - duplicateLeadScore(a) ||
    new Date(a.registered_at || 0) - new Date(b.registered_at || 0)
  )[0];
  const rows = group.leads.map(lead => {
    const stats = lead.stats || {};
    const checked = duplicateSelectedIds.has(lead.id);
    return `
      <tr class="${checked?'duplicate-selected-row':''}" onclick="toggleDuplicateLead('${lead.id}')">
        <td><input type="checkbox" ${checked?'checked':''} onclick="event.stopPropagation();toggleDuplicateLead('${lead.id}')"></td>
        <td style="font-weight:700">${escHtml(lead.name || '')}${suggested?.id===lead.id ? ' <span class="linked-pill">goi y giu</span>' : ''}</td>
        <td>${escHtml(lead.phone || '')}</td>
        <td>${escHtml(lead.email || '')}</td>
        <td>${escHtml(lead.page_id || 'default')}</td>
        <td>${escHtml(lead.assigned_name || 'Chua phan')}</td>
        <td>${fmt(stats.notes || 0)} notes / ${fmt(stats.tags || 0)} tags / ${fmt(stats.custom_fields || 0)} fields / ${fmt(stats.zoom_attendances || 0)} zoom</td>
        <td>${fmtDate(lead.registered_at)}</td>
        <td><button class="btn-sm-action" onclick="event.stopPropagation();openLeadDrawer('${lead.id}')">Xem</button></td>
      </tr>`;
  }).join('');
  target.innerHTML = `
    <div class="card" style="box-shadow:none;margin-bottom:12px">
      <div class="card-head">
        <div>
          <div class="card-title">Nhom ${group.type === 'email' ? 'email' : 'phone'}: ${escHtml(group.key)}</div>
          <div class="card-note" style="margin-top:4px">${fmt(group.count)} lead trung, xuat hien tren ${fmt(group.page_ids?.length || 0)} page.</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <button class="btn-sm-action del" id="deleteSelectedDuplicateLeadsBtn" disabled onclick="deleteSelectedDuplicateLeads()">Xoa lead da chon</button>
          <button class="btn-primary" id="openMergePreviewBtn" disabled onclick="openDuplicateMergePreview()">Merge 2 lead da chon</button>
        </div>
      </div>
      <div class="table-wrap" style="max-height:none">
        <table>
          <thead><tr><th></th><th>Ho ten</th><th>Phone</th><th>Email</th><th>Page</th><th>Sale</th><th>Du lieu CRM</th><th>Dang ky</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
    <div id="duplicateMergePreview"></div>`;
  updateDuplicateMergeButton();
}

function toggleDuplicateLead(id) {
  if (duplicateSelectedIds.has(id)) {
    duplicateSelectedIds.delete(id);
  } else {
    duplicateSelectedIds.add(id);
  }
  renderDuplicateGroupDetail();
}

function updateDuplicateMergeButton() {
  const mergeBtn = document.getElementById('openMergePreviewBtn');
  const deleteBtn = document.getElementById('deleteSelectedDuplicateLeadsBtn');
  if (mergeBtn) mergeBtn.disabled = duplicateSelectedIds.size !== 2;
  if (deleteBtn) deleteBtn.disabled = duplicateSelectedIds.size < 1;
}

function removeDeletedLeadsFromDuplicateReport(deletedIds) {
  const deleted = new Set(deletedIds || []);
  duplicateGroups = duplicateGroups
    .map(group => {
      const leads = (group.leads || []).filter(lead => !deleted.has(lead.id));
      return {
        ...group,
        leads,
        count: leads.length,
        page_ids: [...new Set(leads.map(lead => lead.page_id || 'default'))],
        last_seen: leads.reduce((latest, lead) => String(lead.registered_at || '').localeCompare(String(latest || '')) > 0 ? lead.registered_at : latest, ''),
        first_seen: leads.reduce((first, lead) => !first || String(lead.registered_at || '').localeCompare(String(first)) < 0 ? lead.registered_at : first, ''),
      };
    })
    .filter(group => group.count >= 2);
  duplicateSelectedGroup = duplicateSelectedGroup
    ? duplicateGroups.find(group => group.id === duplicateSelectedGroup.id) || null
    : null;
  duplicateSelectedIds = new Set();
  document.getElementById('duplicateGroupCount').textContent = fmt(duplicateGroups.length);
  document.getElementById('duplicateLeadCount').textContent = fmt(new Set(duplicateGroups.flatMap(group => group.leads.map(lead => lead.id))).size);
  renderDuplicateGroupList();
  if (duplicateSelectedGroup) {
    renderDuplicateGroupDetail();
  } else if (duplicateGroups[0]) {
    selectDuplicateGroup(duplicateGroups[0].id);
  } else {
    document.getElementById('duplicateGroupDetail').innerHTML = '<div class="card" style="box-shadow:none"><div class="empty">Khong con nhom trung trong report hien tai.</div></div>';
  }
}

async function deleteSelectedDuplicateLeads() {
  const group = duplicateSelectedGroup;
  const selected = [...duplicateSelectedIds].map(id => group?.leads?.find(l => l.id === id)).filter(Boolean);
  if (!selected.length) return toast('Chon it nhat 1 lead de xoa', 'error');
  const names = selected.map(l => l.name || l.email || l.phone || l.id).join(', ');
  const ok = confirm(`Xoa ${selected.length} lead da chon?\n\n${names}\n\nThao tac nay se xoa lead va cac notes/tags lien quan. Nen chi xoa lead chac chan khong can giu.`);
  if (!ok) return;
  const btn = document.getElementById('deleteSelectedDuplicateLeadsBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Dang xoa...'; }
  try {
    for (const lead of selected) {
      const res = await fetch('/admin/leads/' + encodeURIComponent(lead.id), { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Khong xoa duoc lead ${lead.id}`);
    }
    toast(`Da xoa ${selected.length} lead`, 'success');
    invalidateViewCache('leads', 'duplicates');
    removeDeletedLeadsFromDuplicateReport(selected.map(lead => lead.id));
  } catch (e) {
    toast(e.message || 'Loi khi xoa lead', 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Xoa lead da chon'; }
  }
}

function openDuplicateMergePreview() {
  const group = duplicateSelectedGroup;
  const target = document.getElementById('duplicateMergePreview');
  if (!group || !target) return;
  const selected = [...duplicateSelectedIds].map(id => group.leads.find(l => l.id === id)).filter(Boolean);
  if (selected.length !== 2) return toast('Chon dung 2 lead de preview merge', 'error');
  const [a, b] = selected;
  const fields = [
    ['id', 'Id'], ['name', 'Ho ten'], ['phone', 'Phone'], ['email', 'Email'], ['page_id', 'Page'],
    ['region', 'Khu vuc'], ['attendance', 'Hinh thuc'], ['assigned_name', 'Sale phu trach'],
    ['source', 'utm_source'], ['medium', 'utm_medium'], ['campaign', 'utm_campaign'],
    ['registered_at', 'Ngay dang ky'], ['last_interaction_at', 'Tuong tac gan nhat'],
  ];
  const valueOf = (lead, key) => key.endsWith('_at') || key === 'registered_at' ? fmtDate(lead[key]) : (lead[key] || '');
  const rows = fields.map(([key, label]) => {
    const av = valueOf(a, key);
    const bv = valueOf(b, key);
    const suggested = av || bv;
    return `
      <div class="merge-preview-cell">${escHtml(label)}</div>
      <div class="merge-preview-cell">${escHtml(av || '-')}</div>
      <div class="merge-preview-cell"><input class="merge-preview-input" data-merge-field="${escAttr(key)}" value="${escAttr(suggested)}"></div>
      <div class="merge-preview-cell">${escHtml(bv || '-')}</div>`;
  }).join('');
  target.innerHTML = `
    <div class="card" style="box-shadow:none">
      <div class="card-head">
        <div>
          <div class="card-title">Preview merge fields</div>
          <div class="card-note" style="margin-top:4px">Cot giua la du lieu cuoi cung. Sua truoc khi bam Merge Lead.</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn-sm-action" onclick="openLeadDrawer('${a.id}')">Xem lead A</button>
          <button class="btn-sm-action" onclick="openLeadDrawer('${b.id}')">Xem lead B</button>
          <button class="btn-primary" id="mergeLeadBtn" onclick="executeDuplicateMerge()">Merge Lead</button>
        </div>
      </div>
      <div class="merge-preview-grid">
        <div class="merge-preview-cell merge-preview-head">Field</div>
        <div class="merge-preview-cell merge-preview-head">Lead A</div>
        <div class="merge-preview-cell merge-preview-head">Merged contact</div>
        <div class="merge-preview-cell merge-preview-head">Lead B</div>
        ${rows}
      </div>
    </div>`;
}

function collectDuplicateMergeFields() {
  const fields = {};
  document.querySelectorAll('#duplicateMergePreview [data-merge-field]').forEach(input => {
    fields[input.dataset.mergeField] = input.value;
  });
  return fields;
}

async function executeDuplicateMerge() {
  const group = duplicateSelectedGroup;
  const selected = [...duplicateSelectedIds].map(id => group?.leads?.find(l => l.id === id)).filter(Boolean);
  if (selected.length !== 2) return toast('Chon dung 2 lead de merge', 'error');
  const fields = collectDuplicateMergeFields();
  const mergedId = String(fields.id || '').trim();
  const [a, b] = selected;
  let primaryId = '';
  let duplicateId = '';
  if (mergedId === a.id) {
    primaryId = a.id;
    duplicateId = b.id;
  } else if (mergedId === b.id) {
    primaryId = b.id;
    duplicateId = a.id;
  } else {
    return toast('Id trong cot Merged contact phai la Id cua Lead A hoac Lead B', 'error');
  }
  const primary = duplicateSelectedGroup?.leads?.find(l => l.id === primaryId);
  const duplicate = duplicateSelectedGroup?.leads?.find(l => l.id === duplicateId);
  const ok = confirm(`Merge lead "${duplicate?.name || duplicate?.email || duplicateId}" vao lead goc "${primary?.name || primary?.email || primaryId}"?\n\nThao tac nay se chuyen notes, tags, custom fields, Zoom, survey va xoa lead duplicate.`);
  if (!ok) return;
  const btn = document.getElementById('mergeLeadBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Dang merge...'; }
  try {
    const res = await fetch('/admin/leads/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        primary_id: primaryId,
        duplicate_id: duplicateId,
        merged_fields: fields,
        reason: duplicateSelectedGroup ? `${duplicateSelectedGroup.type}:${duplicateSelectedGroup.key}` : 'manual duplicate merge',
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast(data.error || 'Khong merge duoc lead', 'error');
    toast('Da merge lead thanh cong', 'success');
    invalidateViewCache('leads', 'duplicates');
    await fetchDuplicateGroups();
    if (data.primary_id) openLeadDrawer(data.primary_id);
  } catch {
    toast('Loi ket noi khi merge lead', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Merge Lead'; }
  }
}

// ════════════════════════════════════════════════════════════════════════
// LEAD DETAIL DRAWER
// ════════════════════════════════════════════════════════════════════════
