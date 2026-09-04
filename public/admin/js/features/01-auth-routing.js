async function initAuth() {
  const cfgRes = await rawFetch('/admin/auth/config');
  const cfg = await cfgRes.json();
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    document.getElementById('loginError').style.display = 'block';
    document.getElementById('loginError').textContent = 'Thieu SUPABASE_URL hoac SUPABASE_ANON_KEY tren server.';
    return;
  }
  supabaseClient = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  const { data } = await supabaseClient.auth.getSession();
  if (data.session) await finishLogin(data.session);
}

async function finishLogin(session) {
  currentSession = session;
  const meRes = await fetch('/admin/auth/me');
  if (!meRes.ok) {
    await supabaseClient.auth.signOut();
    currentSession = null;
    document.getElementById('authScreen').classList.remove('hidden');
    document.getElementById('loginError').style.display = 'block';
    document.getElementById('loginError').textContent = 'Tai khoan chua duoc cap quyen CRM.';
    return;
  }
  const me = await meRes.json();
  currentUser = me.user;
  document.getElementById('authScreen').classList.add('hidden');
  document.getElementById('currentUserLabel').textContent = `${currentUser.full_name || currentUser.email} (${currentUser.role})`;
  document.querySelectorAll('[data-admin-only="1"]').forEach(el => el.style.display = currentUser.role === 'admin' ? '' : 'none');
  await Promise.all([loadCrmUsers(), loadCrmTags()]);
  setActiveTabUi(getTabFromPath());
  loadActiveTab();
}

async function loadCrmUsers() {
  const res = await fetch('/admin/crm/users');
  if (res.ok) {
    const d = await res.json();
    crmUsers = d.rows || [];
  }
}

document.getElementById('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const err = document.getElementById('loginError');
  err.style.display = 'none';
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    err.style.display = 'block';
    err.textContent = error?.message || 'Dang nhap that bai.';
    return;
  }
  await finishLogin(data.session);
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await supabaseClient?.auth.signOut();
  currentSession = null;
  currentUser = null;
  location.reload();
});

// ════════════════════════════════════════════════════════════════════════
// TAB NAVIGATION
// ════════════════════════════════════════════════════════════════════════
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab || 'overview';
    setActiveTabUi(tab);
    const path = adminRouteMap[tab] || '/admin/overview';
    if (location.pathname !== path) history.pushState({ tab }, '', path + location.search);
    loadActiveTab();
  });
});

window.addEventListener('popstate', () => {
  setActiveTabUi(getTabFromPath());
  loadActiveTab();
});

// ════════════════════════════════════════════════════════════════════════
// DATA FETCH
// ════════════════════════════════════════════════════════════════════════
function getDateRangeParams() {
  const range = document.getElementById('dateRangeFilter')?.value || '';
  const now = new Date();
  // Dùng new Date(y, m, d) để lấy local midnight (không phải UTC midnight)
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let dateFrom = null, dateTo = null;

  if (range === 'today') {
    dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    dateTo   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  } else if (range === 'yesterday') {
    dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    dateTo   = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (range === '7days') {
    dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
    dateTo   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  } else if (range === '14days') {
    dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13);
    dateTo   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  } else if (range === '30days') {
    dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
    dateTo   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  } else if (range === 'custom') {
    const fromStr = document.getElementById('dateFrom')?.value;
    const toStr   = document.getElementById('dateTo')?.value;
    // Parse "YYYY-MM-DD" thành local midnight, tránh lệch múi giờ
    if (fromStr) { const [y,m,d] = fromStr.split('-').map(Number); dateFrom = new Date(y, m-1, d); }
    if (toStr)   { const [y,m,d] = toStr.split('-').map(Number);   dateTo   = new Date(y, m-1, d+1); }
  }

  const params = {};
  // Gửi full ISO string để server lọc chính xác theo múi giờ local
  if (dateFrom) params.dateFrom = dateFrom.toISOString();
  if (dateTo)   params.dateTo   = dateTo.toISOString();
  return params;
}

async function loadAggregateTab(tab, force = false) {
  try {
    const dateParams = getDateRangeParams();
    const params = new URLSearchParams(dateParams);
    const key = routeCacheKey(tab);
    const cached = !force ? getCachedRouteData(tab, key) : null;
    if (cached) {
      renderTab(tab, cached);
      return;
    }
    const res = await fetch('/admin/api/' + encodeURIComponent(tab) + '?' + params.toString());
    if (!res.ok) return;
    const data = await res.json();
    setCachedRouteData(key, data);
    renderTab(tab, data);
    document.getElementById('lastUpdated').textContent = 'Cập nhật ' + new Date().toLocaleTimeString('vi-VN');
  } catch(e) {}
}

function loadActiveTab(force = false) {
  if (force) {
    invalidateRouteCache(activeTab);
    invalidateViewCache(activeTab);
  }
  if (aggregateTabs.has(activeTab)) {
    loadAggregateTab(activeTab, force);
    return;
  }
  renderTab(activeTab, null);
  document.getElementById('lastUpdated').textContent = 'Cập nhật ' + new Date().toLocaleTimeString('vi-VN');
}

function renderTab(tab, d) {
  // Destroy charts belonging to old tab
  Object.keys(charts).forEach(k => { charts[k]?.destroy(); delete charts[k]; });
  switch (tab) {
    case 'overview':  renderOverview(d);  break;
    case 'traffic':   renderTraffic(d);   break;
    case 'behavior':  renderBehavior(d);  break;
    case 'leads':     if (!viewCache.leads) renderLeads(); break;
    case 'duplicates': if (!viewCache.duplicates) renderDuplicateLeads(); break;
    case 'zoom':      if (!viewCache.zoom) renderZoom(); break;
    case 'ads-report': if (!viewCache['ads-report']) renderAdsReport(); break;
    case 'campaign14': if (!viewCache.campaign14) renderCampaign14(); break;
    case 'devices':   renderDevices(d);   break;
    case 'survey':    renderSurvey();     break;
    case 'webhooks':  renderWebhooks();   break;
    case 'connector': if (!viewCache.connector) renderConnector(); break;
    case 'users':     if (!viewCache.users) renderUsers(); break;
    case 'tags':      if (!viewCache.tags) renderTags(); break;
  }
}

// ════════════════════════════════════════════════════════════════════════
// OVERVIEW
// ════════════════════════════════════════════════════════════════════════
