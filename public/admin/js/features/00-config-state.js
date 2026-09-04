// ════════════════════════════════════════════════════════════════════════
// CONFIG & STATE
// ════════════════════════════════════════════════════════════════════════
Chart.defaults.color = '#8b949e';
Chart.defaults.font.family = "'Inter', 'Be Vietnam Pro', sans-serif";
Chart.defaults.font.size = 11;

const COLORS = ['#f5a623','#22c55e','#3b82f6','#a855f7','#f97316','#14b8a6','#ef4444','#ec4899','#84cc16'];
const CHAN_COLORS = {
  'Paid Search':   '#f5a623', 'Organic Search': '#22c55e', 'Social':  '#3b82f6',
  'Email':         '#a855f7', 'Referral':       '#14b8a6', 'Display': '#f97316',
  'Direct':        '#8b949e', 'SMS':            '#ec4899',  'Other Campaign': '#6b7280'
};

let charts = {};
let activeTab  = 'overview';
let supabaseClient = null;
let currentSession = null;
let currentUser = null;
let crmUsers = [];
let crmSettings = { assignment: [], customFields: [], tagCategories: [], tags: [], scoringRules: [] };
let leadAssignee = '';
let leadCustomFields = [];
let crmTagCategories = [];
let crmTags = [];
let tagSearch = '';
let tagCategoryFilter = '';
let tagFormOpen = false;
let advancedLeadFilters = [];
let zoomSyncPollTimer = null;
let zoomSyncState = null;
const viewCache = { leads:false, duplicates:false, zoom:false, 'ads-report':false, campaign14:false, connector:false, users:false, tags:false };
const aggregateTabs = new Set(['overview', 'traffic', 'behavior', 'devices']);
const adminRouteMap = {
  overview:'/admin/view/overview', traffic:'/admin/view/traffic', behavior:'/admin/view/behavior',
  devices:'/admin/view/devices', survey:'/admin/view/survey', campaign14:'/admin/view/campaign14',
  leads:'/admin/view/leads', duplicates:'/admin/view/duplicates', zoom:'/admin/view/zoom', 'ads-report':'/admin/view/ads-report', connector:'/admin/settings/connector',
  users:'/admin/settings/users', tags:'/admin/settings/tags', webhooks:'/admin/settings/webhooks',
};
const routeCache = new Map();
const ROUTE_CACHE_TTL_MS = {
  overview:30000, traffic:30000, behavior:45000, devices:30000,
  leads:15000, duplicates:15000, zoom:30000, campaign14:30000, survey:60000,
  connector:60000, users:60000, tags:60000, webhooks:60000,
};

function invalidateViewCache(...names) {
  const keys = names.length ? names : Object.keys(viewCache);
  keys.forEach(k => { if (k in viewCache) viewCache[k] = false; });
}

function getTabFromPath() {
  const queryView = new URLSearchParams(location.search).get('view');
  if (queryView && adminRouteMap[queryView]) return queryView;
  const path = location.pathname.replace(/\/+$/, '');
  if (path === '/admin' || path === '') return 'overview';
  if (path.startsWith('/admin/settings/')) {
    const view = path.split('/').pop();
    return adminRouteMap[view] ? view : 'overview';
  }
  if (path.startsWith('/admin/view/')) {
    const view = path.split('/').pop();
    return adminRouteMap[view] ? view : 'overview';
  }
  const view = path.split('/').pop();
  return adminRouteMap[view] ? view : 'overview';
}

function setActiveTabUi(tab) {
  activeTab = adminRouteMap[tab] ? tab : 'overview';
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === activeTab));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-' + activeTab)?.classList.add('active');
}

function routeCacheKey(tab) {
  return tab + '?' + new URLSearchParams(getDateRangeParams()).toString();
}

function getCachedRouteData(tab, key) {
  const hit = routeCache.get(key);
  const ttl = ROUTE_CACHE_TTL_MS[tab] || 30000;
  if (!hit || Date.now() - hit.ts > ttl) return null;
  return hit.data;
}

function setCachedRouteData(key, data) {
  routeCache.set(key, { data, ts: Date.now() });
  while (routeCache.size > 5) routeCache.delete(routeCache.keys().next().value);
}

function invalidateRouteCache(...tabs) {
  if (!tabs.length) {
    routeCache.clear();
    return;
  }
  [...routeCache.keys()].forEach(key => {
    if (tabs.some(tab => key.startsWith(tab + '?'))) routeCache.delete(key);
  });
}

function syncTagFilterOptions(tags = crmTags) {
  const sel = document.getElementById('tagFilter');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">All tags</option>' +
    (tags || []).map(t => {
      const label = t.category_name ? `${t.category_name} / ${t.name}` : t.name;
      return `<option value="${escAttr(t.id)}"${t.id===current?' selected':''}>${escHtml(label)}</option>`;
    }).join('');
  if (current && !(tags || []).some(t => t.id === current)) sel.value = '';
}

function setSidebarCollapsed(collapsed) {
  document.body.classList.toggle('nav-collapsed', !!collapsed);
  localStorage.setItem('crmNavCollapsed', collapsed ? '1' : '0');
  const btn = document.getElementById('navToggle');
  if (btn) {
    btn.innerHTML = collapsed ? '&rsaquo;' : '&lsaquo;';
    btn.title = collapsed ? 'Mo menu' : 'Dong menu';
    btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  }
}

// Leads tab — server-side pagination + search state
let leadsPageNum   = 1;
let leadsPageSize  = 20;
let leadsSearch    = '';
let leadsTotal     = 0;
let leadsSearchTimer;
let duplicateGroups = [];
let duplicateSelectedGroup = null;
let duplicateSelectedIds = new Set();

function applyTheme(theme) {
  const selected = theme === 'dark' ? 'dark' : 'light';
  document.body.dataset.theme = selected;
  localStorage.setItem('crmTheme', selected);
  document.querySelectorAll('[data-theme-choice]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.themeChoice === selected);
  });
}

applyTheme(localStorage.getItem('crmTheme') || 'light');
setSidebarCollapsed(localStorage.getItem('crmNavCollapsed') === '1');
document.querySelectorAll('[data-theme-choice]').forEach(btn => {
  btn.addEventListener('click', () => applyTheme(btn.dataset.themeChoice));
});
document.getElementById('navToggle')?.addEventListener('click', () => {
  setSidebarCollapsed(!document.body.classList.contains('nav-collapsed'));
});

const rawFetch = window.fetch.bind(window);
window.fetch = (input, init = {}) => {
  const url = typeof input === 'string' ? input : input?.url || '';
  const headers = new Headers(init.headers || {});
  if (currentSession?.access_token && url.startsWith('/admin/') && url !== '/admin/auth/config') {
    headers.set('Authorization', 'Bearer ' + currentSession.access_token);
  }
  return rawFetch(input, { ...init, headers });
};
