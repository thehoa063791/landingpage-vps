(function () {
  'use strict';

  const h = React.createElement;

  const ICONS = {
    home: ['M3 10.5 12 3l9 7.5', 'M5 10v10h14V10', 'M9 20v-6h6v6'],
    traffic: ['M4 17l6-6 4 4 6-8', 'M15 7h5v5'],
    behavior: ['M4 12h4l2 7 4-14 2 7h4'],
    devices: ['M4 6h16v11H4z', 'M8 21h8', 'M12 17v4'],
    survey: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'],
    leads: ['M4 6h16', 'M4 12h16', 'M4 18h10'],
    duplicates: ['M8 7h10v10H8z', 'M5 4h10v3', 'M5 4v10h3'],
    zoom: ['M4 8h10v8H4z', 'M14 11l6-3v8l-6-3z'],
    campaign: ['M7 20V4', 'M7 4h11l-2 5 2 5H7'],
    ads: ['M4 19V5', 'M4 19h16', 'M8 15v-4', 'M12 15V8', 'M16 15v-7'],
    report: ['M5 4h14v16H5z', 'M8 8h8', 'M8 12h8', 'M8 16h5'],
    funnels: ['M4 5h16l-6 7v5l-4 2v-7z'],
    cms: ['M4 20h16', 'M5 19l10-10 4 4-10 6H5z'],
    connector: ['M8 12h8', 'M6 8a4 4 0 0 0 0 8', 'M18 8a4 4 0 0 1 0 8'],
    users: ['M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2', 'M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
    tags: ['M20 13l-7 7-9-9V4h7l9 9z', 'M7.5 7.5h.01'],
    webhooks: ['M7 7h.01', 'M17 17h.01', 'M7 7a5 5 0 0 1 5-5h1', 'M17 17a5 5 0 0 1-5 5h-1', 'M8 16l8-8'],
    refresh: ['M21 12a9 9 0 0 1-15.5 6.2', 'M3 12A9 9 0 0 1 18.5 5.8', 'M21 4v6h-6', 'M3 20v-6h6'],
    external: ['M14 3h7v7', 'M10 14L21 3', 'M21 14v6H4V4h6'],
    moon: ['M21 12.8A8.5 8.5 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z'],
    sun: ['M12 4V2', 'M12 22v-2', 'M4.93 4.93 3.52 3.52', 'M20.49 20.49l-1.41-1.41', 'M4 12H2', 'M22 12h-2', 'M4.93 19.07l-1.41 1.41', 'M20.49 3.51l-1.41 1.41', 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8'],
    logout: ['M10 17l5-5-5-5', 'M15 12H3', 'M21 19V5a2 2 0 0 0-2-2h-6'],
  };

  const ADMIN_MODULES = [
    { group: 'Dashboard', items: [
      { id: 'overview', label: 'Tổng quan', icon: 'home', subtitle: 'Chỉ số hoạt động 14 ngày gần nhất trên toàn bộ landing page.' },
      { id: 'funnels', label: 'Funnels', icon: 'funnels', subtitle: 'Lượt truy cập, pageviews, opt-in và doanh số theo từng landing page.' },
      { id: 'traffic', label: 'Traffic', icon: 'traffic', subtitle: 'Nguồn truy cập, medium, channel và hiệu suất chuyển đổi.' },
      { id: 'behavior', label: 'Hành vi', icon: 'behavior', subtitle: 'Scroll depth, time on page và CTA engagement.' },
      { id: 'devices', label: 'Thiết bị & địa lý', icon: 'devices', subtitle: 'Phân bổ thiết bị, trình duyệt, hệ điều hành và địa lý.' },
      { id: 'survey', label: 'Khảo sát', icon: 'survey', subtitle: 'Kết quả survey người đăng ký.' },
    ] },
    { group: 'CRM', items: [
      { id: 'leads', label: 'Danh sách lead', icon: 'leads', subtitle: 'Quản lý, lọc, chăm sóc và phân quyền lead.' },
      { id: 'duplicates', label: 'Lead trùng', icon: 'duplicates', adminOnly: true },
      { id: 'zoom', label: 'Zoom', icon: 'zoom', subtitle: 'Danh sách webinar và participant match với lead.' },
    ] },
    { group: 'Growth', items: [
      { id: 'ads', label: 'Ads Performance', icon: 'ads', adminOnly: true, subtitle: 'Tổng hợp hiệu suất quảng cáo theo ngày, campaign và demographic.' },
      { id: 'cms', label: 'Media Library', icon: 'cms', adminOnly: true, subtitle: 'Quản lý thư mục, hình ảnh và video.' },
    ] },
    { group: 'Settings', items: [
      { id: 'connector', label: 'Connector', icon: 'connector', adminOnly: true, subtitle: 'Kết nối Zoom và trạng thái đồng bộ.' },
      { id: 'users', label: 'Phân quyền', icon: 'users', adminOnly: true, subtitle: 'Quản lý tài khoản, role và trọng số phân lead.' },
      { id: 'tags', label: 'Quản lý tag', icon: 'tags', adminOnly: true, subtitle: 'Tag, category và page tag mapping.' },
      { id: 'custom-fields', label: 'Custom fields', icon: 'report', adminOnly: true, subtitle: 'Cấu hình trường CRM tùy biến.' },
      { id: 'scoring', label: 'Scoring', icon: 'behavior', adminOnly: true, subtitle: 'Lead scoring rules.' },
      { id: 'webinar-settings', label: 'Webinar', icon: 'zoom', adminOnly: true, subtitle: 'Cấu hình EverWebinar để tạo link vào học sau đăng ký.' },
      { id: 'webhooks', label: 'Webhook', icon: 'webhooks', adminOnly: true, subtitle: 'Webhook nhận lead và trạng thái lần gửi gần nhất.' },
    ] },
  ];

  const FLAT_MODULES = ADMIN_MODULES.flatMap(group => group.items);
  const MODULE_BY_ID = Object.fromEntries(FLAT_MODULES.map(item => [item.id, item]));
  const DEFAULT_MODULE = 'overview';
  const ANALYTICS_VIEWS = new Set(['overview', 'traffic', 'behavior', 'devices']);
  const CHART_COLORS = ['#008060', '#005bd3', '#b98900', '#9333ea', '#d72c0d', '#0891b2', '#6d7175', '#f97316', '#ec4899'];
  const TONE_COLORS = {
    blue: '#3b82f6',
    orange: '#f97316',
    purple: '#a855f7',
    green: '#22c55e',
    gold: '#f59e0b',
    red: '#ef4444',
    teal: '#14b8a6',
  };

  function cn() { return Array.from(arguments).filter(Boolean).join(' '); }
  function fmt(n) { return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Number(n || 0)); }
  function fmtVnd(n) { return n == null ? '-' : fmt(n) + 'đ'; }
  function fmtPct(n) { return `${Number(n || 0).toFixed(1)}%`; }
  function fmtDate(value) {
    if (!value) return '-';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  function buildQuery(params) {
    const search = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      search.set(key, value);
    });
    return search.toString();
  }
  function csvCell(value) {
    const raw = value === undefined || value === null ? '' : String(value);
    return `"${raw.replace(/"/g, '""')}"`;
  }
  function downloadCsv(filename, headers, rows) {
    const lines = [headers.map(hd => csvCell(hd.label)).join(',')].concat((rows || []).map(row => headers.map(hd => csvCell(hd.value(row))).join(',')));
    const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }
  function entries(obj) {
    return Object.entries(obj || {}).sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0));
  }
  function chartRows(obj, limit) {
    const rows = entries(obj);
    return Number(limit || 0) > 0 ? rows.slice(0, limit) : rows;
  }

  function Icon({ name, className }) {
    const paths = ICONS[name] || ICONS.home;
    return h('svg', { className: cn('ui-icon', className), viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
      paths.map((d, index) => h('path', { key: index, d })));
  }
  function Button({ children, variant = 'default', size = 'default', className, ...props }) {
    return h('button', { ...props, className: cn('ui-button', `ui-button-${variant}`, `ui-button-${size}`, className) }, children);
  }
  function Card({ children, className }) { return h('div', { className: cn('ui-card', className) }, children); }
  function Badge({ children, variant = 'secondary', className }) { return h('span', { className: cn('ui-badge', `ui-badge-${variant}`, className) }, children); }
  function Field({ label, children }) { return h('label', { className: 'ui-field' }, h('span', null, label), children); }
  function Input(props) { return h('input', { ...props, className: cn('ui-input', props.className) }); }

  function getModuleFromPath() {
    const path = location.pathname.replace(/\/+$/, '');
    if (path.startsWith('/admin/tools/')) return path.split('/').pop();
    if (path.startsWith('/admin/settings/')) return path.split('/').pop();
    if (path.startsWith('/admin/view/')) return path.split('/').pop();
    const tail = path.split('/').pop();
    if (tail && tail !== 'admin' && MODULE_BY_ID[tail]) return tail;
    return DEFAULT_MODULE;
  }
  function pathForModule(moduleId) {
    if (moduleId === 'cms' || moduleId === 'ads') return `/admin/tools/${moduleId}`;
    if (['connector', 'users', 'tags', 'custom-fields', 'scoring', 'webhooks', 'webinar-settings'].includes(moduleId)) return `/admin/settings/${moduleId}`;
    return `/admin/view/${moduleId}`;
  }
  function applyTheme(theme) {
    const selected = theme === 'dark' ? 'dark' : 'light';
    document.body.dataset.theme = selected;
    localStorage.setItem('crmTheme', selected);
  }

  function useApi(path, apiFetch, deps) {
    const [state, setState] = React.useState({ loading: true, error: '', data: null });
    const reload = React.useCallback(() => {
      let cancelled = false;
      setState(s => ({ ...s, loading: true, error: '' }));
      apiFetch(path)
        .then(data => { if (!cancelled) setState({ loading: false, error: '', data }); })
        .catch(err => { if (!cancelled) setState({ loading: false, error: err.message || 'Lỗi tải dữ liệu', data: null }); });
      return () => { cancelled = true; };
    }, [path, apiFetch]);
    React.useEffect(() => reload(), deps || [reload]);
    return { ...state, reload };
  }

  function SectionState({ loading, error, children }) {
    if (loading) return h(Card, { className: 'state-card' }, 'Đang tải dữ liệu...');
    if (error) return h(Card, { className: 'state-card state-error' }, error);
    return children;
  }

  function StatGrid({ items }) {
    return h('div', { className: 'stat-grid' }, items.map(item =>
      h(Card, { key: item.label, className: cn('stat-card-react', item.tone && `tone-${item.tone}`) },
        h('div', { className: 'stat-label-react' }, item.label),
        h('div', { className: 'stat-value-react' }, item.value),
        item.sub ? h('div', { className: 'stat-sub-react' }, item.sub) : null
      )
    ));
  }

  function ChartPanel({ title, type = 'bar', data, limit = 10, height = 240 }) {
    const canvasRef = React.useRef(null);
    const chartRef = React.useRef(null);
    const rows = type === 'line'
      ? Object.entries(data || {}).slice(Number(limit || 0) > 0 ? -Number(limit) : 0)
      : chartRows(data, limit);
    React.useEffect(() => {
      if (!canvasRef.current || !window.Chart || !rows.length) return undefined;
      if (chartRef.current) chartRef.current.destroy();
      const labels = rows.map(([label]) => label);
      const values = rows.map(([, value]) => Number(value || 0));
      const colors = labels.map((_, index) => CHART_COLORS[index % CHART_COLORS.length]);
      const isDonut = type === 'doughnut' || type === 'pie';
      const isLine = type === 'line';
      const gridColor = getComputedStyle(document.body).getPropertyValue('--border').trim() || '#273234';
      const textColor = getComputedStyle(document.body).getPropertyValue('--muted-foreground').trim() || '#a1a1aa';
      chartRef.current = new window.Chart(canvasRef.current, {
        type,
        data: {
          labels,
          datasets: [{
            data: values,
            label: title,
            backgroundColor: isLine ? 'rgba(34,197,94,.18)' : (isDonut ? colors.map(color => `${color}cc`) : colors.map(color => `${color}44`)),
            borderColor: isLine ? '#22c55e' : colors,
            borderWidth: isDonut ? 1.5 : 2,
            borderRadius: isDonut ? 0 : 6,
            tension: .36,
            fill: isLine,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: isDonut, position: 'right', labels: { color: textColor, boxWidth: 10, usePointStyle: true } },
            tooltip: { callbacks: { label: ctx => `${ctx.label}: ${fmt(ctx.raw)}` } },
          },
          scales: isDonut ? {} : {
            x: { grid: { color: 'transparent' }, ticks: { color: textColor, maxRotation: 0, autoSkip: true } },
            y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: textColor, precision: 0 } },
          },
        },
      });
      return () => {
        if (chartRef.current) chartRef.current.destroy();
        chartRef.current = null;
      };
    }, [type, title, JSON.stringify(rows)]);
    return h(Card, { className: 'panel-card chart-card' },
      h('div', { className: 'panel-title' }, title),
      rows.length
        ? h('div', { className: 'chart-wrap-react', style: { height } }, h('canvas', { ref: canvasRef }))
        : h('div', { className: 'empty-note' }, 'Chua co du lieu')
    );
  }

  function Bars({ title, data, limit = 8 }) {
    const rows = entries(data).slice(0, limit);
    const max = Math.max(1, ...rows.map(([, v]) => Number(v || 0)));
    return h(Card, { className: 'panel-card' },
      h('div', { className: 'panel-title' }, title),
      rows.length ? h('div', { className: 'bar-list' }, rows.map(([label, value], index) =>
        h('div', { className: 'bar-row', key: label },
          h('div', { className: 'bar-meta' }, h('span', null, label), h('b', null, fmt(value))),
          h('div', { className: 'bar-track' }, h('div', { className: 'bar-fill', style: { width: `${Math.max(4, Number(value || 0) / max * 100)}%`, background: CHART_COLORS[index % CHART_COLORS.length] } }))
        )
      )) : h('div', { className: 'empty-note' }, 'Chưa có dữ liệu')
    );
  }

  function DataTable({ columns, rows, empty = 'Chưa có dữ liệu', onRowClick }) {
    return h('div', { className: 'table-shell' },
      h('table', { className: 'react-table' },
        h('thead', null, h('tr', null, columns.map(col => h('th', { key: col.key, className: col.numeric ? 'num' : '' }, col.label)))),
        h('tbody', null,
          rows && rows.length
            ? rows.map((row, index) => h('tr', { key: row.id || row.session_id || row.user_id || row.path || index, className: onRowClick ? 'clickable-row' : '', onClick: onRowClick ? () => onRowClick(row, index) : undefined },
              columns.map(col => h('td', { key: col.key, className: col.numeric ? 'num' : '' }, col.render ? col.render(row, index) : (row[col.key] ?? '-')))
            ))
            : h('tr', null, h('td', { colSpan: columns.length, className: 'empty-cell' }, empty))
        )
      )
    );
  }

  function pct(part, total, digits = 0) {
    const p = Number(part || 0);
    const t = Number(total || 0);
    return t > 0 ? (p / t * 100).toFixed(digits) : (0).toFixed(digits);
  }

  function statItems(stats) {
    const pageviews = Number(stats.pageviews || 0);
    const ctaClicks = Number(stats.ctaClicks || 0);
    const formOpens = Number(stats.formOpens || 0);
    const conversions = Number(stats.conversions || 0);
    return [
      { label: 'Pageviews', value: fmt(pageviews), sub: 'Tong luot xem trang', tone: 'blue' },
      { label: 'CTA clicks', value: fmt(ctaClicks), sub: `${pct(ctaClicks, pageviews, 0)}% views - unique sessions`, tone: 'orange' },
      { label: 'Form opens', value: fmt(formOpens), sub: `${pct(formOpens, pageviews, 0)}% views - unique sessions`, tone: 'purple' },
      { label: 'Conversions', value: fmt(conversions), sub: 'Leads dang ky thanh cong', tone: 'green' },
      { label: 'Conversion rate', value: `${Number(stats.conversionRate || 0).toFixed(1)}%`, sub: 'View -> Register', tone: 'gold' },
      { label: 'Form conv. rate', value: `${Number(stats.formConvRate || 0).toFixed(0)}%`, sub: 'Form open -> Register', tone: 'teal' },
      { label: 'Exit intent', value: fmt(stats.exitIntent), sub: 'Desktop unique sessions', tone: 'red' },
    ];
  }

  function Funnel({ stats }) {
    const pageviews = Number(stats.pageviews || 0);
    const steps = [
      { label: 'Pageviews', value: pageviews, note: 'total views' },
      { label: 'CTA clicks', value: Number(stats.ctaClicks || 0), note: 'unique sessions' },
      { label: 'Form opens', value: Number(stats.formOpens || 0), note: 'unique sessions' },
      { label: 'Conversions', value: Number(stats.conversions || 0), note: 'leads' },
    ];
    return h(Card, { className: 'panel-card' },
      h('div', { className: 'panel-title' }, 'Conversion funnel'),
      h('div', { className: 'funnel-list' }, steps.map((step, index) => {
        const prev = steps[index - 1];
        const width = Math.max(4, Number(pct(step.value, pageviews, 0)));
        const drop = prev && prev.value > 0 ? Math.max(0, Math.round((1 - step.value / prev.value) * 100)) : null;
        return h('div', { className: 'funnel-step', key: step.label },
          h('div', { className: 'funnel-meta-react' },
            h('div', null, h('b', null, step.label), h('span', null, step.note)),
            h('div', null, h('strong', null, fmt(step.value)), h('span', null, `${pct(step.value, pageviews, 0)}%`))
          ),
          h('div', { className: 'bar-track' }, h('div', { className: 'bar-fill', style: { width: `${width}%` } })),
          drop == null ? null : h('div', { className: 'funnel-drop-react' }, `Mat ${drop}% so voi buoc truoc`)
        );
      }))
    );
  }

  function ScrollSummary({ scrollDepth, pageviews }) {
    return h(Card, { className: 'panel-card' },
      h('div', { className: 'panel-title' }, 'Scroll depth'),
      h('div', { className: 'mini-metric-grid' }, [25, 50, 75, 90].map(depth => {
        const count = Number((scrollDepth || {})[depth] || 0);
        return h('div', { className: 'mini-metric', key: depth },
          h('strong', null, `${pct(count, pageviews, 0)}%`),
          h('span', null, `Cuon ${depth}%`),
          h('small', null, `${fmt(count)} sessions`)
        );
      }))
    );
  }

  function QualitySummary({ scrollDepth, timeOnPage, pageviews }) {
    const rows = [
      ['Bounce thap', pct((scrollDepth || {})[25], pageviews, 0), 'scroll >=25%'],
      ['Doc content', pct((scrollDepth || {})[75], pageviews, 0), 'scroll >=75%'],
      ['Doc sau', pct((scrollDepth || {})[90], pageviews, 0), 'scroll >=90%'],
      ['O lai >=30s', pct((timeOnPage || {})[30], pageviews, 0), 'time on page'],
      ['O lai >=1p', pct((timeOnPage || {})[60], pageviews, 0), 'time on page'],
      ['O lai >=2p', pct((timeOnPage || {})[120], pageviews, 0), 'time on page'],
    ];
    return h(Card, { className: 'panel-card panel-wide' },
      h('div', { className: 'panel-title' }, 'Chat luong traffic'),
      h('div', { className: 'mini-metric-grid quality-grid' }, rows.map(([label, value, note]) =>
        h('div', { className: 'mini-metric', key: label },
          h('strong', null, `${value}%`),
          h('span', null, label),
          h('small', null, note)
        )
      ))
    );
  }

  function performanceRows(visitsMap, leadsMap) {
    const keys = Array.from(new Set([...Object.keys(visitsMap || {}), ...Object.keys(leadsMap || {})]));
    return keys.sort((a, b) => Number((visitsMap || {})[b] || 0) - Number((visitsMap || {})[a] || 0)).map(key => {
      const visits = Number((visitsMap || {})[key] || 0);
      const leads = Number((leadsMap || {})[key] || 0);
      return { key, visits, leads, rate: visits > 0 ? `${pct(leads, visits, 1)}%` : '-' };
    });
  }

  function PerformanceTable({ title, visits, leads }) {
    return h(Card, { className: 'panel-card' },
      h('div', { className: 'panel-title' }, title),
      h(DataTable, {
        columns: [
          { key: 'key', label: 'Ten' },
          { key: 'visits', label: 'Visitors', numeric: true, render: r => fmt(r.visits) },
          { key: 'leads', label: 'Leads', numeric: true, render: r => fmt(r.leads) },
          { key: 'rate', label: 'Conv. rate', numeric: true },
        ],
        rows: performanceRows(visits, leads),
      })
    );
  }

  function AnalyticsPage({ view, apiFetch }) {
    const [dateFrom, setDateFrom] = React.useState('');
    const [dateTo, setDateTo] = React.useState('');
    const [pageFilter, setPageFilter] = React.useState('');
    const [rangePreset, setRangePreset] = React.useState('14d');
    const query = buildQuery({ dateFrom, dateTo, page: pageFilter });
    const { loading, error, data, reload } = useApi(`/admin/api/${view}${query ? `?${query}` : ''}`, apiFetch, [view, query, apiFetch]);
    const stats = data?.stats || {};
    const pageviews = Number(stats.pageviews || 0);
    function setPreset(value) {
      setRangePreset(value);
      if (value === 'custom') return;
      const days = Number(value.replace('d', '')) || 14;
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - days + 1);
      setDateFrom(start.toISOString().slice(0, 10));
      setDateTo(end.toISOString().slice(0, 10));
    }
    function exportReport() {
      downloadCsv(`vinmoc-${view}-report-${new Date().toISOString().slice(0, 10)}.csv`, [
        { label: 'Metric', value: r => r.label },
        { label: 'Value', value: r => r.value },
      ], statItems(stats).map(item => ({ label: item.label, value: item.value })));
    }
    return h(SectionState, { loading, error },
      h('div', { className: 'page-stack' },
        h(Card, { className: 'analytics-toolbar-card' },
          h('select', { className: 'ui-input', value: rangePreset, onChange: e => setPreset(e.target.value) },
            h('option', { value: '7d' }, '7 ngày qua'),
            h('option', { value: '14d' }, '14 ngày qua'),
            h('option', { value: '30d' }, '30 ngày qua'),
            h('option', { value: 'custom' }, 'Tùy chỉnh')
          ),
          rangePreset === 'custom' ? h(Input, { type: 'date', value: dateFrom, onChange: e => setDateFrom(e.target.value), title: 'Từ ngày' }) : null,
          rangePreset === 'custom' ? h(Input, { type: 'date', value: dateTo, onChange: e => setDateTo(e.target.value), title: 'Đến ngày' }) : null,
          h(Input, { value: pageFilter, onChange: e => setPageFilter(e.target.value), placeholder: 'Tất cả page' }),
          h(Button, { variant: 'outline', onClick: reload }, h(Icon, { name: 'refresh' }), 'Làm mới'),
          h(Button, { onClick: exportReport }, 'Xuất báo cáo')
        ),
        h(StatGrid, { items: statItems(stats) }),
        view === 'overview' ? h('div', { className: 'grid-2-react overview-chart-grid' },
          h(ChartPanel, { title: 'Leads 14 ngày gần nhất', type: 'line', data: data?.regByDay, limit: 14, height: 320 }),
          h(ChartPanel, { title: 'Kênh truy cập', type: 'doughnut', data: data?.trafficChannel, limit: 8, height: 320 }),
          h(Bars, { title: 'Leads 14 ngày', data: data?.regByDay }),
          h(Bars, { title: 'Traffic channel', data: data?.trafficChannel }),
          h(Bars, { title: 'CTA by position', data: data?.ctaByPos }),
          h(ScrollSummary, { scrollDepth: data?.scrollDepth, pageviews }),
          h(Funnel, { stats }),
          h(Bars, { title: 'Time on page', data: data?.timeOnPage })
        ) : null,
        view === 'traffic' ? h('div', { className: 'page-stack' },
          h('div', { className: 'grid-2-react' },
            h(ChartPanel, { title: 'Traffic source', type: 'doughnut', data: data?.trafficSource, limit: 8, height: 240 }),
            h(ChartPanel, { title: 'Traffic medium', type: 'bar', data: data?.trafficMedium, limit: 8, height: 240 }),
            h(ChartPanel, { title: 'Traffic channel', type: 'doughnut', data: data?.trafficChannel, limit: 8, height: 240 }),
            h(ChartPanel, { title: 'Leads by region', type: 'bar', data: data?.leadsByRegion, limit: 8, height: 240 }),
            h(Bars, { title: 'Traffic source', data: data?.trafficSource }),
            h(Bars, { title: 'Traffic medium', data: data?.trafficMedium }),
            h(Bars, { title: 'Traffic channel', data: data?.trafficChannel }),
            h(Bars, { title: 'Leads by region', data: data?.leadsByRegion })
          ),
          h('div', { className: 'grid-2-react' },
            h(PerformanceTable, { title: 'Hieu suat theo channel', visits: data?.trafficChannel, leads: data?.leadsByChannel }),
            h(PerformanceTable, { title: 'Hieu suat theo source', visits: data?.trafficSource, leads: data?.leadsBySource }),
            h(PerformanceTable, { title: 'Hieu suat theo medium', visits: data?.trafficMedium, leads: data?.leadsByMedium })
          )
        ) : null,
        view === 'behavior' ? h('div', { className: 'page-stack' },
          h('div', { className: 'grid-2-react' },
            h(ChartPanel, { title: 'Scroll depth chart', type: 'bar', data: data?.scrollDepth, height: 220 }),
            h(ChartPanel, { title: 'Time on page chart', type: 'bar', data: data?.timeOnPage, height: 220 }),
            h(ScrollSummary, { scrollDepth: data?.scrollDepth, pageviews }),
            h(Bars, { title: 'Scroll depth sessions', data: data?.scrollDepth }),
            h(Bars, { title: 'Time on page', data: data?.timeOnPage }),
            h(Bars, { title: 'CTA by position', data: data?.ctaByPos })
          ),
          h(QualitySummary, { scrollDepth: data?.scrollDepth, timeOnPage: data?.timeOnPage, pageviews })
        ) : null,
        view === 'devices' ? h('div', { className: 'grid-2-react' },
          h(ChartPanel, { title: 'Device type', type: 'doughnut', data: data?.deviceType, height: 240 }),
          h(ChartPanel, { title: 'Browser', type: 'bar', data: data?.browser, limit: 8, height: 240 }),
          h(Bars, { title: 'Device type', data: data?.deviceType }),
          h(Bars, { title: 'Browser', data: data?.browser }),
          h(Bars, { title: 'Operating system', data: data?.os }),
          h(Bars, { title: 'Country', data: data?.country }),
          h(Bars, { title: 'City', data: data?.city }),
          h(Bars, { title: 'ISP', data: data?.isp }),
          h(Bars, { title: 'Leads by region', data: data?.leadsByRegion }),
          h(Bars, { title: 'Attendance', data: data?.leadsByAttendance })
        ) : null
      )
    );
  }

  function FunnelDashboard({ apiFetch }) {
    const query = new URLSearchParams(location.search);
    const [selected, setSelected] = React.useState(query.get('funnel') || '');
    const today = new Date();
    const monthAgo = new Date(today.getTime() - 29 * 86400000);
    const isoDay = date => date.toISOString().slice(0, 10);
    const [dateFrom, setDateFrom] = React.useState(query.get('dateFrom')?.slice(0, 10) || isoDay(monthAgo));
    const [dateTo, setDateTo] = React.useState(query.get('dateTo')?.slice(0, 10) || isoDay(today));
    const rangeQuery = buildQuery({ dateFrom: dateFrom ? `${dateFrom}T00:00:00+07:00` : '', dateTo: dateTo ? `${dateTo}T23:59:59.999+07:00` : '' });
    const path = selected ? `/admin/funnels/${encodeURIComponent(selected)}?${rangeQuery}` : `/admin/funnels?${rangeQuery}`;
    const state = useApi(path, apiFetch, [path, apiFetch]);
    function openFunnel(slug) {
      setSelected(slug);
      const params = new URLSearchParams(location.search);
      params.set('funnel', slug);
      history.replaceState({}, '', `${location.pathname}?${params}`);
    }
    function closeFunnel() {
      setSelected('');
      const params = new URLSearchParams(location.search);
      params.delete('funnel');
      history.replaceState({}, '', `${location.pathname}${params.toString() ? `?${params}` : ''}`);
    }
    const toolbar = h('div', { className: 'funnel-toolbar' },
      h('div', { className: 'funnel-date-range' },
        h(Field, { label: 'Từ ngày' }, h(Input, { type: 'date', value: dateFrom, onChange: e => setDateFrom(e.target.value) })),
        h(Field, { label: 'Đến ngày' }, h(Input, { type: 'date', value: dateTo, onChange: e => setDateTo(e.target.value) }))
      ),
      h(Button, { variant: 'outline', onClick: state.reload }, h(Icon, { name: 'refresh' }), 'Làm mới')
    );
    if (!selected) {
      const rows = state.data?.rows || [];
      return h('div', { className: 'page-stack funnel-page' }, toolbar,
        h(SectionState, { loading: state.loading, error: state.error },
          h(Card, { className: 'funnel-list-card' },
            h('div', { className: 'funnel-list-head' }, h('div', null, h('h2', null, 'Funnels'), h('p', null, 'Mỗi thư mục trong pages được tự động nhận diện là một funnel.'))),
            h('div', { className: 'table-shell' }, h('table', { className: 'react-table funnel-table' },
              h('thead', null, h('tr', null, h('th', null, 'Tên funnel'), h('th', null, 'Steps'), h('th', null, 'Người truy cập'), h('th', null, 'Pageviews'), h('th', null, 'Opt-ins'), h('th', null, 'Tỉ lệ'), h('th', null, 'Sales'), h('th', null, 'Orders'))),
              h('tbody', null, rows.length ? rows.map(row => h('tr', { key: row.id, className: 'funnel-row', onClick: () => openFunnel(row.slug) },
                h('td', null, h('div', { className: 'funnel-name-cell' }, h('span', { className: 'funnel-thumb' }, h(Icon, { name: 'funnels' })), h('div', null, h('strong', null, row.name), h('small', null, row.url)))),
                h('td', null, fmt(row.steps?.length || 0)), h('td', null, fmt(row.unique_visitors)), h('td', null, fmt(row.pageviews)), h('td', null, fmt(row.optins)), h('td', null, fmtPct(row.optin_rate)), h('td', null, h('strong', { className: 'funnel-money' }, fmtVnd(row.revenue))), h('td', null, fmt(row.orders))
              )) : h('tr', null, h('td', { colSpan: 8, className: 'empty-cell' }, 'Chưa tìm thấy funnel trong thư mục pages.')))
            ))
          )
        )
      );
    }
    const funnel = state.data;
    const statCards = funnel ? [
      ['Doanh thu / lượt truy cập', fmtVnd(funnel.earnings_per_visit)],
      ['Doanh thu', fmtVnd(funnel.revenue)],
      ['Đơn hàng', fmt(funnel.orders)],
      ['Giá trị đơn trung bình', fmtVnd(funnel.average_order_value)],
    ] : [];
    return h('div', { className: 'page-stack funnel-page' },
      h('div', { className: 'funnel-detail-title' }, h(Button, { variant: 'ghost', onClick: closeFunnel }, '← Tất cả funnels'), funnel ? h('div', null, h('h2', null, `Funnel Analytics · ${funnel.name}`), h(Badge, { variant: 'secondary' }, `${fmtVnd(funnel.revenue)} doanh thu`)) : null),
      toolbar,
      h(SectionState, { loading: state.loading, error: state.error }, funnel ? h(React.Fragment, null,
        h('div', { className: 'funnel-stat-grid' }, statCards.map(([label, value]) => h(Card, { className: 'funnel-stat', key: label }, h('span', { className: 'funnel-stat-icon' }, h(Icon, { name: 'funnels' })), h('div', null, h('small', null, label), h('strong', null, value))))),
        h(Card, { className: 'funnel-steps-card' }, h('div', { className: 'table-shell' }, h('table', { className: 'react-table funnel-steps-table' },
          h('thead', null, h('tr', null, h('th', null, 'Funnel steps'), h('th', null, 'Views'), h('th', null, 'Unique'), h('th', null, 'Opt-ins'), h('th', null, 'Opt-in rate'), h('th', null, 'Sales'), h('th', null, 'Revenue'))),
          h('tbody', null, (funnel.steps || []).map(step => h('tr', { key: step.id }, h('td', null, h('strong', null, step.name)), h('td', null, fmt(step.pageviews)), h('td', null, fmt(step.unique_visitors)), h('td', null, fmt(step.optins)), h('td', null, fmtPct(step.optin_rate)), h('td', null, fmt(step.sales)), h('td', null, fmtVnd(step.revenue)))))
        ))),
        h('div', { className: 'grid-2-react' }, h(Bars, { title: 'Opt-in theo nguồn', data: funnel.sources }), h(Card, { className: 'panel-card funnel-summary-card' }, h('div', { className: 'panel-title' }, 'Tổng kết funnel'), h('p', null, `${fmt(funnel.unique_visitors)} người truy cập tạo ${fmt(funnel.optins)} opt-in và ${fmt(funnel.sales)} sale.`), h('strong', null, `Tỉ lệ opt-in: ${fmtPct(funnel.optin_rate)}`)))
      ) : null)
    );
  }

  function LeadsPageBasic({ apiFetch }) {
    const [q, setQ] = React.useState('');
    const [pageNum, setPageNum] = React.useState(1);
    const path = `/admin/leads?pageNum=${pageNum}&pageSize=20&q=${encodeURIComponent(q)}`;
    const { loading, error, data, reload } = useApi(path, apiFetch, [path, apiFetch]);
    const rows = data?.rows || [];
    return h('div', { className: 'page-stack' },
      h(Card, { className: 'toolbar-card' },
        h(Input, { value: q, onChange: e => { setPageNum(1); setQ(e.target.value); }, placeholder: 'Tìm theo email hoặc số điện thoại...' }),
        h(Button, { variant: 'outline', onClick: reload }, h(Icon, { name: 'refresh' }), 'Tải lại')
      ),
      h(SectionState, { loading, error },
        h(DataTable, {
          columns: [
            { key: 'name', label: 'Họ tên' },
            { key: 'phone', label: 'SĐT' },
            { key: 'email', label: 'Email' },
            { key: 'page_id', label: 'Page' },
            { key: 'channel', label: 'Channel' },
            { key: 'assigned_name', label: 'Sale' },
            { key: 'registered_at', label: 'Thời gian', render: r => fmtDate(r.registered_at) },
          ],
          rows,
        })
      ),
      h('div', { className: 'pager' },
        h(Button, { variant: 'outline', disabled: pageNum <= 1, onClick: () => setPageNum(p => Math.max(1, p - 1)) }, 'Trước'),
        h('span', null, `Trang ${pageNum} · ${fmt(data?.total || 0)} lead`),
        h(Button, { variant: 'outline', disabled: rows.length < 20, onClick: () => setPageNum(p => p + 1) }, 'Sau')
      )
    );
  }

  function leadFilterDefs(meta) {
    const users = meta?.users || [];
    const tags = meta?.tags || [];
    const customFields = meta?.customFields || [];
    return [
      { field: 'name', label: 'Ho ten', type: 'text' },
      { field: 'phone', label: 'SDT', type: 'text' },
      { field: 'email', label: 'Email', type: 'text' },
      { field: 'region', label: 'Khu vuc', type: 'text' },
      { field: 'attendance', label: 'Hinh thuc', type: 'text' },
      { field: 'source', label: 'Source', type: 'text' },
      { field: 'medium', label: 'Medium', type: 'text' },
      { field: 'channel', label: 'Channel', type: 'dropdown', options: ['Paid Search', 'Organic Search', 'Social', 'Email', 'Referral', 'Display', 'Direct', 'SMS', 'Other Campaign'] },
      { field: 'assigned_to', label: 'Sale phu trach', type: 'dropdown', options: users.map(u => ({ value: u.user_id, label: u.full_name || u.email })) },
      { field: 'tags', label: 'Tag', type: 'tag', options: tags.map(t => ({ value: t.id, label: `${t.category_name ? `${t.category_name} / ` : ''}${t.name}` })) },
      { field: 'registered_at', label: 'Ngay dang ky', type: 'timestamp' },
      { field: 'last_interaction_at', label: 'Tuong tac gan nhat', type: 'timestamp' },
      { field: 'city', label: 'Thanh pho', type: 'text' },
      { field: 'country', label: 'Quoc gia', type: 'text' },
      { field: 'device_type', label: 'Thiet bi', type: 'dropdown', options: ['Mobile', 'Desktop', 'Tablet', 'Unknown'] },
      ...customFields.map(f => ({ field: `custom:${f.id}`, label: `[Custom] ${f.group_name || 'Khac'} / ${f.label}`, type: f.type === 'currency' ? 'currency' : (f.type === 'multiselect' ? 'multiselect' : f.type), options: f.options || [] })),
    ];
  }

  function leadOps(type) {
    if (type === 'number' || type === 'currency') return [['eq', '='], ['ne', '!='], ['gt', '>'], ['lt', '<'], ['gte', '>='], ['lte', '<='], ['between', 'Trong khoang'], ['empty', 'Trong'], ['not_empty', 'Khong trong']];
    if (type === 'date' || type === 'timestamp') return [['on', 'La ngay'], ['before', 'Truoc'], ['after', 'Sau'], ['between', 'Trong khoang'], ['last_days', 'X ngay qua'], ['empty', 'Trong'], ['not_empty', 'Khong trong']];
    if (type === 'dropdown') return [['in', 'La mot trong'], ['not_in', 'Khong phai'], ['empty', 'Trong'], ['not_empty', 'Khong trong']];
    if (type === 'boolean') return [['true', 'True'], ['false', 'False']];
    if (type === 'multiselect' || type === 'tag') return [['any', 'Co bat ky'], ['all', 'Co tat ca'], ['none', 'Khong co'], ['empty', 'Trong'], ['not_empty', 'Khong trong']];
    return [['contains', 'Chua'], ['is', 'La'], ['not', 'Khong la'], ['not_contains', 'Khong chua'], ['empty', 'Trong'], ['not_empty', 'Khong trong']];
  }

  function normalizeLeadFilters(filters, defs) {
    const defMap = Object.fromEntries(defs.map(d => [d.field, d]));
    return filters.map(f => ({ ...f, type: defMap[f.field]?.type || f.type || 'text' })).filter(f => f.field && f.op);
  }

  function LeadFilterValue({ filter, def, onChange }) {
    if (['empty', 'not_empty', 'true', 'false'].includes(filter.op)) return null;
    const type = def?.type || 'text';
    const options = (def?.options || []).map(o => typeof o === 'object' ? o : ({ value: o, label: o }));
    if (type === 'dropdown') return h('select', { className: 'ui-input filter-input', value: filter.value || '', onChange: e => onChange({ value: e.target.value }) },
      h('option', { value: '' }, '-'), options.map(o => h('option', { key: o.value, value: o.value }, o.label)));
    if (type === 'multiselect' || type === 'tag') {
      const selected = Array.isArray(filter.value) ? filter.value : String(filter.value || '').split(',').filter(Boolean);
      return h('select', { className: 'ui-input filter-input multi', multiple: true, value: selected, onChange: e => onChange({ value: Array.from(e.target.selectedOptions).map(o => o.value) }) },
        options.map(o => h('option', { key: o.value, value: o.value }, o.label)));
    }
    const inputType = type === 'date' || type === 'timestamp' ? (filter.op === 'last_days' ? 'number' : 'date') : (type === 'number' || type === 'currency' ? 'number' : 'text');
    return h(React.Fragment, null,
      h(Input, { className: 'filter-input', type: inputType, value: filter.value || '', placeholder: 'Gia tri', onChange: e => onChange({ value: e.target.value }) }),
      filter.op === 'between' ? h(Input, { className: 'filter-input', type: inputType, value: filter.value2 || '', placeholder: 'Den', onChange: e => onChange({ value2: e.target.value }) }) : null
    );
  }

  function LeadAdvancedFilters({ filters, setFilters, meta, onApply, onClear }) {
    const defs = leadFilterDefs(meta);
    const defMap = Object.fromEntries(defs.map(d => [d.field, d]));
    function update(index, patch) {
      setFilters(current => current.map((f, i) => i === index ? { ...f, ...patch } : f));
    }
    function add() {
      const first = defs[0];
      setFilters(current => [...current, { field: first.field, type: first.type, op: leadOps(first.type)[0][0], value: '', value2: '' }]);
    }
    return h(Card, { className: 'advanced-card' },
      h('div', { className: 'advanced-head' },
        h('div', null, h('div', { className: 'panel-title' }, 'Bo loc nang cao'), h('p', null, 'Loc ket hop AND, ho tro tag va custom fields.')),
        h('div', { className: 'advanced-actions' },
          h(Button, { variant: 'outline', onClick: add }, '+ Dieu kien'),
          h(Button, { onClick: onApply }, 'Ap dung'),
          h(Button, { variant: 'ghost', onClick: onClear }, 'Xoa loc')
        )
      ),
      h('div', { className: 'filter-list' }, filters.length ? filters.map((filter, index) => {
        const def = defMap[filter.field] || defs[0];
        const ops = leadOps(def.type);
        const op = ops.some(([x]) => x === filter.op) ? filter.op : ops[0][0];
        return h('div', { className: 'filter-row', key: index },
          h('select', { className: 'ui-input filter-field', value: filter.field, onChange: e => { const next = defMap[e.target.value] || defs[0]; update(index, { field: next.field, type: next.type, op: leadOps(next.type)[0][0], value: '', value2: '' }); } },
            defs.map(d => h('option', { key: d.field, value: d.field }, d.label))),
          h('select', { className: 'ui-input filter-op', value: op, onChange: e => update(index, { op: e.target.value, value: '', value2: '' }) },
            ops.map(([value, label]) => h('option', { key: value, value }, label))),
          h(LeadFilterValue, { filter: { ...filter, op }, def, onChange: patch => update(index, patch) }),
          h(Button, { variant: 'ghost', onClick: () => setFilters(current => current.filter((_, i) => i !== index)) }, 'Xoa')
        );
      }) : h('div', { className: 'empty-note' }, 'Chua co dieu kien nang cao.'))
    );
  }

  function DetailItem({ label, value, mono }) {
    return h('div', { className: 'detail-item-react' }, h('span', null, label), h('strong', { className: mono ? 'mono' : '' }, value || '-'));
  }

  function CustomFieldInput({ field, value, onChange }) {
    const options = Array.isArray(field.options) ? field.options : String(field.options || '').split(',').map(x => x.trim()).filter(Boolean);
    if (field.type === 'dropdown') {
      return h('select', { className: 'ui-input', value: value ?? '', onChange: e => onChange(e.target.value) },
        h('option', { value: '' }, 'Chua chon'),
        options.map(option => h('option', { key: option, value: option }, option))
      );
    }
    if (field.type === 'multiselect') {
      const selected = Array.isArray(value) ? value : String(value || '').split(',').map(x => x.trim()).filter(Boolean);
      return h('select', { className: 'ui-input tag-select-react compact', multiple: true, value: selected, onChange: e => onChange(Array.from(e.target.selectedOptions).map(o => o.value)) },
        options.map(option => h('option', { key: option, value: option }, option))
      );
    }
    if (field.type === 'boolean') {
      return h('label', { className: 'inline-check' }, h('input', { type: 'checkbox', checked: value === true || value === 'true' || value === '1', onChange: e => onChange(e.target.checked) }), 'Co');
    }
    if (field.type === 'date') return h(Input, { type: 'date', value: value ?? '', onChange: e => onChange(e.target.value) });
    if (field.type === 'number' || field.type === 'currency') return h(Input, { type: 'number', value: value ?? '', onChange: e => onChange(e.target.value) });
    return h(Input, { value: value ?? '', onChange: e => onChange(e.target.value) });
  }

  function LeadCampaignTab({ lead, apiFetch }) {
    const email = lead?.email || '';
    const summaryPath = email ? `/admin/campaign/lead-summary?email=${encodeURIComponent(email)}` : '';
    const detailPath = email ? `/admin/campaign/email-detail?email=${encodeURIComponent(email)}` : '';
    const summaryState = useApi(summaryPath || '/admin/campaign/lead-summary?email=', apiFetch, [summaryPath, apiFetch]);
    const detailState = useApi(detailPath || '/admin/campaign/email-detail?email=', apiFetch, [detailPath, apiFetch]);
    if (!email) return h('div', { className: 'empty-note' }, 'Lead chua co email de doi chieu campaign.');
    const summary = summaryState.data || {};
    const detail = detailState.data || {};
    const leadSummary = summary.summary || {};
    const stats = summary.email_stats || {};
    const rows = detail.rows || detail.events || detail.activities || [];
    const sourceMedium = [lead?.utm_source || leadSummary.source || 'direct', lead?.utm_medium || leadSummary.medium || '(none)'].filter(Boolean).join(' / ');
    const epochDate = value => value ? fmtDate(value) : '-';
    function emailStatus(row) {
      if (row.bouncedAt || row.status === 'bounced') return h('span', { className: 'campaign-status bounced' }, 'Bounced');
      if (row.clickedAt || row.status === 'clicked') return h('span', { className: 'campaign-status clicked' }, 'Clicked');
      if (row.openedAt || row.status === 'opened') return h('span', { className: 'campaign-status opened' }, 'Opened');
      return h('span', { className: 'campaign-status sent' }, 'Sent');
    }
    const metrics = [
      ['Email campaign', summary.email || email],
      ['Ads campaign', lead?.utm_campaign || leadSummary.campaign || '-'],
      ['Source / Medium', sourceMedium],
      ['Chuỗi 14 ngày', leadSummary.stage ? `Ngày ${fmt(leadSummary.stage)} / 14` : '-'],
      ['Stock investment', leadSummary.stockInvestment == null ? '-' : leadSummary.stockInvestment],
      ['Lần gửi gần nhất', leadSummary.lastSentAt ? epochDate(leadSummary.lastSentAt) : '-'],
      ['Email đã gửi', fmt(stats.sent || rows.length || 0)],
      ['Opened', fmt(stats.opened || 0)],
      ['Clicked', fmt(stats.clicked || 0)],
      ['Bounced', fmt(stats.bounced || 0)],
      ['Tổng lịch sử', fmt(summary.total_rows || detail.total_rows || rows.length || 0)],
    ];
    return h('div', { className: 'campaign-14-card' },
      h('div', { className: 'campaign-14-title' }, 'Campaign'),
      h(SectionState, { loading: summaryState.loading, error: summaryState.error },
        h('div', { className: 'campaign-14-grid' }, metrics.map(([label, value]) => h('div', { className: 'campaign-14-metric', key: label }, h('span', null, label), h('strong', null, value || '-'))))
      ),
      h(SectionState, { loading: detailState.loading, error: detailState.error },
        h(React.Fragment, null,
          h('div', { className: 'campaign-14-actions' }, h(Button, { variant: 'outline', size: 'sm', onClick: () => window.open(`/admin/campaign/email-detail?email=${encodeURIComponent(email)}`, '_blank', 'noopener') }, 'Xem chi tiết email')),
          h('div', { className: 'campaign-14-table-wrap' }, h('table', { className: 'campaign-14-table' },
            h('thead', null, h('tr', null, ['#', 'Template', 'Subject', 'Gửi lúc', 'Status', 'Mở lúc', 'Click lúc'].map(label => h('th', { key: label }, label)))),
            h('tbody', null, rows.length ? rows.map((row, index) => h('tr', { key: row.id || row.templateUsed || index },
              h('td', null, index + 1),
              h('td', null, row.templateUsed || row.template || '-'),
              h('td', { className: 'campaign-subject-cell' }, row.subject || row.campaign_name || '-'),
              h('td', null, epochDate(row.createAt || row.createdAt || row.created_at || row.time || row.timestamp)),
              h('td', null, emailStatus(row)),
              h('td', null, row.openedAt ? epochDate(row.openedAt) : '-'),
              h('td', null, row.clickedAt ? epochDate(row.clickedAt) : '-')
            )) : h('tr', null, h('td', { colSpan: 7, className: 'empty-cell' }, 'Chưa có dữ liệu Campaign/chuỗi email 14 ngày cho lead này.')))
          ))
        )
      )
    );
  }

  function LeadProsperityTab({ lead, apiFetch }) {
    const email = lead?.email || '';
    const phone = lead?.phone || '';
    const query = buildQuery({ email, phone });
    const state = useApi(query ? `/admin/prosperity-journey/lead-summary?${query}` : '/admin/prosperity-journey/lead-summary?email=', apiFetch, [query, apiFetch]);
    if (!email && !phone) return h('div', { className: 'empty-note' }, 'Lead chua co email hoac so dien thoai de doi chieu Hanh trinh thinh vuong.');
    const data = state.data || {};
    const sessions = data.sessions || [];
    const answers = data.answers || [];
    const progress = data.progress || {};
    return h('div', { className: 'campaign-14-card' },
      h('div', { className: 'campaign-14-title' }, 'Hành trình thịnh vượng'),
      h(SectionState, { loading: state.loading, error: state.error },
        h(React.Fragment, null,
          h('div', { className: 'campaign-14-grid' },
            [
              ['Bài đã mở', fmt(progress.started || 0)],
              ['Bài hoàn thành', fmt(progress.completed || 0)],
              ['Phiên xem', fmt(sessions.length)],
              ['Câu trả lời khảo sát', fmt(answers.length)],
            ].map(([label, value]) => h('div', { className: 'campaign-14-metric', key: label }, h('span', null, label), h('strong', null, value)))
          ),
          h('div', { className: 'campaign-14-table-wrap' }, h('table', { className: 'campaign-14-table' },
            h('thead', null, h('tr', null, ['Bài học', 'Tiến độ', 'Trạng thái', 'Thời gian xem', 'Lần xem'].map(label => h('th', { key: label }, label)))),
            h('tbody', null, sessions.length ? sessions.map((row, index) => h('tr', { key: row.session_id || index },
              h('td', null, row.lesson?.title || row.lesson?.id || '-'),
              h('td', null, h('div', { className: 'mini-progress-cell' }, h('span', { className: 'mini-progress-track' }, h('span', { style: { width: `${Math.max(1, Number(row.pct || 0))}%` } })), h('b', null, fmtPct(row.pct || 0)))),
              h('td', null, row.completed || Number(row.pct || 0) >= 95 ? h(Badge, { variant: 'secondary' }, 'Hoàn thành') : h(Badge, { variant: 'outline' }, 'Đang xem')),
              h('td', null, `${fmt(Math.round(Number(row.watch_time || 0) / 60))} phút`),
              h('td', null, fmtDate(row.createdAt))
            )) : h('tr', null, h('td', { colSpan: 5, className: 'empty-cell' }, 'Chưa có dữ liệu xem video cho lead này.')))
          ))
        )
      )
    );
  }

  function LeadDrawer({ leadId, apiFetch, meta, onClose, onRefresh }) {
    const [lead, setLead] = React.useState(null);
    const [summary, setSummary] = React.useState(null);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState('');
    const [tab, setTab] = React.useState('overview');
    const [note, setNote] = React.useState('');
    const [interactionType, setInteractionType] = React.useState('note');
    const [tagIds, setTagIds] = React.useState([]);
    const [customValues, setCustomValues] = React.useState({});
    const [orderForm, setOrderForm] = React.useState({ status: 'pending', amount: 0, currency: 'VND', payment_method: '', note: '' });
    const [showOrderForm, setShowOrderForm] = React.useState(false);
    const [orders, setOrders] = React.useState([]);
    const [orderDrafts, setOrderDrafts] = React.useState({});
    const [saving, setSaving] = React.useState('');
    const [fallbackUsers, setFallbackUsers] = React.useState([]);
    const users = (meta?.users || []).length ? meta.users : fallbackUsers;
    const tags = meta?.tags || [];
    React.useEffect(() => {
      if ((meta?.users || []).length) return;
      let cancelled = false;
      apiFetch('/admin/crm/users')
        .then(data => { if (!cancelled) setFallbackUsers(data.rows || []); })
        .catch(() => { if (!cancelled) setFallbackUsers([]); });
      return () => { cancelled = true; };
    }, [apiFetch, JSON.stringify(meta?.users || [])]);
    const loadLead = React.useCallback(() => {
      if (!leadId) return;
      setLoading(true); setError('');
      Promise.all([
        apiFetch(`/admin/leads/${leadId}`),
        apiFetch(`/admin/leads/${leadId}/summary`).catch(() => null),
      ]).then(([data, summaryData]) => {
        setLead(data);
        setSummary(summaryData);
        setTagIds((data.tags || []).map(t => t.id || t.tag_id).filter(Boolean));
        setCustomValues(Object.fromEntries((data.custom_fields || []).map(f => [f.id, f.value ?? ''])));
        const nextOrders = data.orders || [];
        setOrders(nextOrders);
        setOrderDrafts(Object.fromEntries(nextOrders.map(order => [order.id, { status: order.status || 'pending', amount: Number(order.amount || 0), currency: order.currency || 'VND', payment_method: order.payment_method || '', note: order.note || '' }])));
      }).catch(err => setError(err.message || 'Khong tai duoc chi tiet lead')).finally(() => setLoading(false));
    }, [leadId, apiFetch]);
    React.useEffect(() => loadLead(), [loadLead]);
    if (!leadId) return null;
    async function saveAssignee(userId) {
      setSaving('assignee');
      try { await apiFetch(`/admin/leads/${leadId}/assignee`, { method: 'PUT', body: JSON.stringify({ user_id: userId || null }) }); loadLead(); onRefresh?.(); } finally { setSaving(''); }
    }
    async function addNote() {
      if (!note.trim()) return;
      setSaving('note');
      try { await apiFetch(`/admin/leads/${leadId}/notes`, { method: 'POST', body: JSON.stringify({ body: note.trim(), interaction_type: interactionType }) }); setNote(''); setInteractionType('note'); loadLead(); onRefresh?.(); } finally { setSaving(''); }
    }
    async function deleteNote(item) {
      if (!window.confirm(`Xóa ghi chú của ${item.author?.full_name || item.author?.email || 'user'}? Thao tác này không thể hoàn tác.`)) return;
      setSaving(`delete-note:${item.id}`);
      setError('');
      try {
        await apiFetch(`/admin/leads/${leadId}/notes/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
        loadLead();
        onRefresh?.();
      } catch (err) {
        setError(err.message || 'Không xóa được ghi chú');
      } finally {
        setSaving('');
      }
    }
    async function saveTags() {
      setSaving('tags');
      try { await apiFetch(`/admin/leads/${leadId}/tags`, { method: 'PUT', body: JSON.stringify({ tag_ids: tagIds }) }); loadLead(); onRefresh?.(); } finally { setSaving(''); }
    }
    function addTagSelection(tagId) {
      if (!tagId) return;
      setTagIds(current => current.includes(tagId) ? current : [...current, tagId]);
    }
    function removeTagSelection(tagId) {
      setTagIds(current => current.filter(id => id !== tagId));
    }
    async function saveCustomFields() {
      setSaving('custom');
      try { await apiFetch(`/admin/leads/${leadId}/custom-fields`, { method: 'PUT', body: JSON.stringify({ values: customValues }) }); loadLead(); } finally { setSaving(''); }
    }
    async function createOrder() {
      setSaving('order-create'); setError('');
      try {
        await apiFetch(`/admin/leads/${leadId}/orders`, { method: 'POST', body: JSON.stringify(orderForm) });
        setOrderForm({ status: 'pending', amount: 0, currency: 'VND', payment_method: '', note: '' });
        setShowOrderForm(false);
        await loadLead();
        onRefresh?.();
      } catch (err) {
        setError(err.message || 'Không tạo được đơn hàng');
      } finally { setSaving(''); }
    }
    async function saveOrder(orderId) {
      setSaving(`order-save:${orderId}`); setError('');
      try {
        await apiFetch(`/admin/leads/${leadId}/orders/${orderId}`, { method: 'PUT', body: JSON.stringify(orderDrafts[orderId] || {}) });
        await loadLead(); onRefresh?.();
      } catch (err) { setError(err.message || 'Không cập nhật được đơn hàng'); }
      finally { setSaving(''); }
    }
    async function removeOrder(orderId) {
      if (!window.confirm('Xóa đơn hàng này? Lịch sử trạng thái của đơn cũng sẽ bị xóa.')) return;
      setSaving(`order-delete:${orderId}`); setError('');
      try {
        await apiFetch(`/admin/leads/${leadId}/orders/${orderId}`, { method: 'DELETE' });
        await loadLead(); onRefresh?.();
      } catch (err) { setError(err.message || 'Không xóa được đơn hàng'); }
      finally { setSaving(''); }
    }
    async function deleteLead() {
      if (!window.confirm('Xoa lead nay? Thao tac nay khong the hoan tac.')) return;
      setSaving('delete');
      try {
        await apiFetch(`/admin/leads/${leadId}`, { method: 'DELETE' });
        onClose?.();
        onRefresh?.();
      } catch (err) {
        setError(err.message || 'Khong xoa duoc lead');
      } finally {
        setSaving('');
      }
    }
    const interactionLabels = { note: 'Ghi chú', message: 'Nhắn tin', call: 'Call', email: 'Email', other: 'Other', meeting: 'Gặp trực tiếp' };
    const tabs = [['overview', 'Tong quan'], ['orders', 'Đơn hàng'], ['activity', 'Activity'], ['forms', 'Forms'], ['tags', 'Tags'], ['survey', 'Survey'], ['zoom', 'Zoom'], ['tracking', 'Tracking']];
    const orderStatuses = [['pending', 'Chưa chốt'], ['won', 'Đã chốt / thanh toán'], ['lost', 'Không chốt'], ['refunded', 'Đã hoàn tiền']];
    const orderStatusLabel = Object.fromEntries(orderStatuses);
    const leadTagMap = new Map((lead?.tags || []).map(item => [item.id || item.tag_id, item]));
    const metaTagMap = new Map(tags.map(item => [item.id, item]));
    const selectedTagRows = tagIds.map(id => ({ ...(metaTagMap.get(id) || {}), ...(leadTagMap.get(id) || {}), id })).filter(item => item.id);
    const availableTagOptions = tags.filter(item => !tagIds.includes(item.id));
    const scoreValue = summary ? Number(summary.score || 0) : 0;
    const scoreMatches = summary ? Number(summary.score_matches || 0) : 0;
    return h('div', { className: 'drawer-layer lead-detail-layer' },
      h('button', { className: 'drawer-backdrop', onClick: onClose, 'aria-label': 'Dong' }),
      h('aside', { className: 'lead-drawer-react lead-detail-modal' },
        h('div', { className: 'drawer-head-react lead-detail-head' },
          h('div', { className: 'lead-head-identity' }, h('h2', null, lead?.name || 'Lead detail'), h('p', null, [lead?.phone, lead?.email].filter(Boolean).join(' - ') || leadId)),
          h('div', { className: 'lead-score-hero' }, h('span', null, 'Lead score'), h('strong', null, `${fmt(scoreValue)} điểm`), h('small', null, `${fmt(scoreMatches)} rule khớp`)),
          h('div', { className: 'drawer-head-actions' }, h(Button, { variant: 'critical', onClick: deleteLead, disabled: saving === 'delete' }, saving === 'delete' ? 'Dang xoa...' : 'Xoa lead'), h(Button, { variant: 'ghost', onClick: onClose }, 'Dong'))
        ),
        loading ? h('div', { className: 'drawer-state' }, 'Dang tai chi tiet...') : null,
        error ? h('div', { className: 'drawer-state state-error' }, error) : null,
        lead && !loading ? h(React.Fragment, null,
          h('div', { className: 'lead-profile-summary' },
            h('div', { className: 'lead-profile-name' }, h('h3', null, lead.name || 'Lead detail'), h('span', null, lead.id || leadId)),
            h('div', { className: 'lead-profile-grid' },
              h(DetailItem, { label: 'Phone 1', value: lead.phone }),
              h(DetailItem, { label: 'Email', value: lead.email }),
              h(DetailItem, { label: 'Leadsource', value: lead.channel || summary?.channel }),
              h('label', { className: 'lead-owner-inline' }, h('span', null, 'Owner'), h('select', { className: 'ui-input', value: lead.assigned_to || '', onChange: e => saveAssignee(e.target.value), disabled: saving === 'assignee' }, h('option', { value: '' }, 'Chưa phân'), users.filter(u => u.role === 'sale').map(u => h('option', { key: u.user_id, value: u.user_id }, u.full_name || u.email)))),
              h(DetailItem, { label: 'Utm_source', value: lead.utm_source || summary?.source || lead.source }),
              h(DetailItem, { label: 'Country / Region', value: lead.region || lead.geo?.country || summary?.country }),
              h(DetailItem, { label: 'Page', value: lead.page_id || 'default' }),
              h(DetailItem, { label: 'Đăng ký lúc', value: fmtDate(lead.registered_at) }),
              h(DetailItem, { label: 'Thiết bị', value: [lead.device?.device_type, lead.device?.os, lead.device?.browser].filter(Boolean).join(' / ') })
            )
          ),
          h('div', { className: 'drawer-tabs-react' }, tabs.map(([key, label]) => h('button', { key, className: cn(tab === key && 'active'), onClick: () => setTab(key) }, label))),
          h('div', { className: 'drawer-body-react' },
            tab === 'overview' ? h('div', { className: 'detail-grid-react' },
              h(DetailItem, { label: 'Lead ID', value: lead.id, mono: true }), h(DetailItem, { label: 'Page', value: lead.page_id || 'default' }), h(DetailItem, { label: 'Khu vuc', value: lead.region }), h(DetailItem, { label: 'Hinh thuc', value: lead.attendance }), h(DetailItem, { label: 'Dang ky luc', value: fmtDate(lead.registered_at) }), h(DetailItem, { label: 'Channel', value: lead.channel || summary?.channel }), h(DetailItem, { label: 'Source / Medium', value: `${lead.utm_source || summary?.source || 'direct'} / ${lead.utm_medium || summary?.medium || '(none)'}` }), h(DetailItem, { label: 'Thanh pho', value: lead.geo?.city || lead.city || summary?.city }), h(DetailItem, { label: 'Thiet bi', value: [lead.device?.device_type, lead.device?.os, lead.device?.browser].filter(Boolean).join(' / ') })
            ) : null,
            tab === 'orders' ? h('div', { className: 'drawer-section-stack order-manager' },
              h('div', { className: 'order-toolbar' },
                h('div', null, h('h3', null, 'Đơn hàng'), h('p', null, `${fmt(orders.length)} đơn hàng của lead này`)),
                h(Button, { onClick: () => setShowOrderForm(value => !value) }, showOrderForm ? 'Đóng' : '+ Tạo đơn hàng')
              ),
              showOrderForm ? h(Card, { className: 'drawer-panel lead-sale-panel' },
                h('div', { className: 'panel-title' }, 'Tạo đơn hàng mới'),
                h('div', { className: 'lead-sale-grid order-create-grid' },
                  h(Field, { label: 'Tổng tiền' }, h(Input, { type: 'number', min: 0, step: 1000, value: orderForm.amount, onChange: e => setOrderForm(value => ({ ...value, amount: Number(e.target.value || 0) })) })),
                  h(Field, { label: 'Tiền tệ' }, h(Input, { value: orderForm.currency, maxLength: 8, onChange: e => setOrderForm(value => ({ ...value, currency: e.target.value.toUpperCase() })) })),
                  h(Field, { label: 'Trạng thái' }, h('select', { className: 'ui-input', value: orderForm.status, onChange: e => setOrderForm(value => ({ ...value, status: e.target.value })) }, orderStatuses.map(([value, label]) => h('option', { key: value, value }, label)))),
                  h(Field, { label: 'Phương thức' }, h(Input, { value: orderForm.payment_method, onChange: e => setOrderForm(value => ({ ...value, payment_method: e.target.value })), placeholder: 'Chuyển khoản, tiền mặt...' }))
                ),
                h('div', { className: 'order-form-actions' }, h(Button, { variant: 'outline', onClick: () => setShowOrderForm(false) }, 'Hủy'), h(Button, { onClick: createOrder, disabled: saving === 'order-create' }, saving === 'order-create' ? 'Đang tạo...' : 'Tạo đơn hàng'))
              ) : null,
              h('div', { className: 'order-list' }, orders.length ? orders.map(order => {
                const draft = orderDrafts[order.id] || order;
                return h(Card, { className: 'drawer-panel order-card', key: order.id },
                  h('div', { className: 'order-summary-grid' },
                    h('div', null, h('span', null, 'Ngày tạo'), h('strong', null, fmtDate(order.created_at))),
                    h('div', null, h('span', null, 'Tổng tiền'), h('strong', null, `${fmt(order.amount)} ${order.currency || 'VND'}`)),
                    h('div', null, h('span', null, 'Trạng thái'), h(Badge, { variant: order.status === 'won' ? 'secondary' : 'outline' }, orderStatusLabel[order.status] || order.status)),
                    h('div', null, h('span', null, 'Phương thức'), h('strong', null, order.payment_method || 'Chưa cập nhật')),
                    h('div', null, h('span', null, 'Người tạo'), h('strong', null, order.created_by_email || order.updated_by_email || 'Hệ thống'))
                  ),
                  h('details', { className: 'order-edit' }, h('summary', null, 'Chỉnh sửa đơn hàng'),
                  h('div', { className: 'lead-sale-grid order-create-grid' },
                    h(Field, { label: 'Trạng thái' }, h('select', { className: 'ui-input', value: draft.status, onChange: e => setOrderDrafts(values => ({ ...values, [order.id]: { ...draft, status: e.target.value } })) }, orderStatuses.map(([value, label]) => h('option', { key: value, value }, label)))),
                    h(Field, { label: 'Tổng tiền' }, h(Input, { type: 'number', min: 0, step: 1000, value: draft.amount, onChange: e => setOrderDrafts(values => ({ ...values, [order.id]: { ...draft, amount: Number(e.target.value || 0) } })) })),
                    h(Field, { label: 'Tiền tệ' }, h(Input, { value: draft.currency, maxLength: 8, onChange: e => setOrderDrafts(values => ({ ...values, [order.id]: { ...draft, currency: e.target.value.toUpperCase() } })) })),
                    h(Field, { label: 'Phương thức' }, h(Input, { value: draft.payment_method || '', onChange: e => setOrderDrafts(values => ({ ...values, [order.id]: { ...draft, payment_method: e.target.value } })) }))
                  ),
                  h('div', { className: 'order-actions' },
                    h(Button, { onClick: () => saveOrder(order.id), disabled: saving === `order-save:${order.id}` }, saving === `order-save:${order.id}` ? 'Đang lưu...' : 'Lưu thay đổi'),
                    h(Button, { variant: 'critical', onClick: () => removeOrder(order.id), disabled: saving === `order-delete:${order.id}` }, saving === `order-delete:${order.id}` ? 'Đang xóa...' : 'Xóa đơn')
                  ))
                );
              }) : h(Card, { className: 'drawer-panel order-empty' }, h('strong', null, 'Chưa có đơn hàng'), h('p', null, 'Lead này chưa phát sinh đơn hàng nào.'), h(Button, { onClick: () => setShowOrderForm(true) }, '+ Tạo đơn hàng')) )
            ) : null,
            tab === 'activity' ? h('div', { className: 'drawer-section-stack' },
              h(Card, { className: 'drawer-panel' },
                h('div', { className: 'panel-title' }, 'Contact Activity'),
                h('div', { className: 'interaction-compose' },
                  h('select', { className: 'ui-input', value: interactionType, onChange: e => setInteractionType(e.target.value) },
                    [['note', 'Ghi chú'], ['message', 'Nhắn tin'], ['call', 'Call'], ['email', 'Email'], ['other', 'Other']].map(([value, label]) => h('option', { key: value, value }, label))
                  ),
                  h('textarea', { className: 'note-input-react', value: note, onChange: e => setNote(e.target.value), placeholder: 'Nhập nội dung tương tác...' }),
                  h(Button, { onClick: addNote, disabled: saving === 'note' || !note.trim() }, saving === 'note' ? 'Đang lưu...' : 'Lưu tương tác')
                ),
                h('div', { className: 'activity-timeline' }, [...(lead.notes || []).map(item => ({ ...item, activityKind: 'note', occurred_at: item.created_at })), ...(lead.activity_events || []).map(item => ({ ...item, activityKind: 'event' })), { id: `registered-${lead.id}`, activityKind: 'registered', occurred_at: lead.registered_at, page_id: lead.page_id }].sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at)).map(item => item.activityKind === 'note' ? h('div', { className: 'activity-item activity-note', key: `note-${item.id || item.created_at}` },
                  h('div', { className: 'note-item-head' },
                    h('div', { className: 'note-item-body' }, item.body),
                    lead.permissions?.can_delete_notes ? h(Button, { variant: 'critical', size: 'sm', className: 'note-delete-button', onClick: () => deleteNote(item), disabled: saving === `delete-note:${item.id}` }, saving === `delete-note:${item.id}` ? 'Đang xóa...' : 'Xóa') : null
                  ),
                  h('small', null, `${interactionLabels[item.interaction_type] || 'Ghi chú'} - ${item.author?.full_name || item.author?.email || 'Nhân viên'} - ${fmtDate(item.created_at)}`)
                ) : h('div', { className: 'activity-item activity-system', key: `${item.activityKind}-${item.id || item.occurred_at}` },
                  h('span', { className: 'activity-dot' }),
                  h('div', null,
                    h('strong', null, item.activityKind === 'registered' ? 'Đăng ký thành công' : ({ pageview: 'Pageview', form_open: 'Mở form', cta_click: 'Click CTA', scroll_depth: 'Cuộn trang', time_on_page: 'Thời gian trên trang', exit_intent: 'Exit intent', conversion: 'Conversion' }[item.type] || item.type)),
                    h('small', null, [item.page_id, item.position].filter(Boolean).join(' · ')),
                    item.url ? h('a', { href: item.url, target: '_blank', rel: 'noreferrer' }, item.url.replace(/^https?:\/\/[^/]+/, '') || '/') : null
                  ),
                  h('time', null, fmtDate(item.occurred_at))
                )))
              )
            ) : null,
            tab === 'forms' ? h(Card, { className: 'drawer-panel' }, h('div', { className: 'panel-title' }, 'Custom fields'), (lead.custom_fields || []).length ? h('div', { className: 'detail-grid-react' }, lead.custom_fields.map(field => h('label', { className: 'ui-field', key: field.id }, h('span', null, field.label), h(CustomFieldInput, { field, value: customValues[field.id], onChange: value => setCustomValues(v => ({ ...v, [field.id]: value })) })))) : h('div', { className: 'empty-note' }, 'Chua co custom field.'), h(Button, { onClick: saveCustomFields, disabled: saving === 'custom' }, saving === 'custom' ? 'Dang luu...' : 'Luu custom fields')) : null,
            tab === 'tags' ? h(Card, { className: 'drawer-panel lead-tags-panel' },
              h('div', { className: 'lead-tags-head' },
                h('h3', null, 'Tags'),
                h('div', { className: 'lead-tags-actions' },
                  h('select', { className: 'ui-input', value: '', onChange: e => { addTagSelection(e.target.value); e.target.value = ''; } },
                    h('option', { value: '' }, 'Thêm tag...'),
                    availableTagOptions.map(tag => h('option', { key: tag.id, value: tag.id }, `${tag.name}${tag.category_name ? ` - ${tag.category_name}` : ''}`))
                  ),
                  h(Button, { onClick: saveTags, disabled: saving === 'tags' }, saving === 'tags' ? 'Đang lưu...' : 'Apply Tags')
                )
              ),
              h('div', { className: 'lead-tags-table-wrap' }, h('table', { className: 'lead-tags-table' },
                h('thead', null, h('tr', null, h('th', null, 'Applied'), h('th', null, 'Tag'), h('th', null, 'Category'), h('th', null, 'Remove'))),
                h('tbody', null, selectedTagRows.length ? selectedTagRows.map(tag => h('tr', { key: tag.id },
                  h('td', null, tag.assigned_at ? fmtDate(tag.assigned_at) : '-'),
                  h('td', null, tag.name || tag.id),
                  h('td', null, tag.category_name || 'No Category'),
                  h('td', null, h('button', { className: 'tag-remove-button', onClick: () => removeTagSelection(tag.id), title: 'Remove tag' }, '×'))
                )) : h('tr', null, h('td', { colSpan: 4, className: 'empty-cell' }, 'Chưa có tag.')))
              ))
            ) : null,
            tab === 'survey' ? h('div', { className: 'detail-grid-react' }, h(DetailItem, { label: 'Interest', value: lead.interest }), ...Object.entries(lead.survey || {}).map(([key, value]) => h(DetailItem, { key, label: key, value: String(value || '') }))) : null,
            tab === 'zoom' ? h(DataTable, { columns: [{ key: 'join_time', label: 'Join', render: r => fmtDate(r.join_time) }, { key: 'meeting', label: 'Tên Zoom', render: r => r.meeting?.topic || '-' }, { key: 'zoom_meeting_id', label: 'Meeting ID' }, { key: 'duration', label: 'Duration', numeric: true, render: r => `${Math.round(Number(r.duration || 0) / 60)}m` }], rows: lead.zoom_attendances || [] }) : null,
            tab === 'tracking' ? h('div', { className: 'drawer-section-stack' },
              h(Card, { className: 'drawer-panel' }, h('div', { className: 'panel-title' }, 'CAPI readiness'), h('div', { className: 'mini-metric-grid quality-grid' }, [
                ['Event ID', !!lead.id],
                ['_fbc or fbclid', !!(lead.fbc || lead.fbclid)],
                ['_fbp', !!lead.fbp],
                ['IP address', !!lead.ip],
                ['User agent', !!lead.user_agent],
                ['Source URL', !!lead.referrer],
              ].map(([label, ok]) => h('div', { className: cn('mini-metric', ok ? 'ready-ok' : 'ready-missing'), key: label }, h('strong', null, ok ? 'OK' : 'MISS'), h('span', null, label))))),
              h('div', { className: 'detail-grid-react' }, h(DetailItem, { label: 'Referrer', value: lead.referrer, mono: true }), h(DetailItem, { label: 'fbclid', value: lead.fbclid, mono: true }), h(DetailItem, { label: 'gclid', value: lead.gclid, mono: true }), h(DetailItem, { label: '_fbc', value: lead.fbc, mono: true }), h(DetailItem, { label: '_fbp', value: lead.fbp, mono: true }), h(DetailItem, { label: 'IP', value: lead.ip }), h(DetailItem, { label: 'User Agent', value: lead.user_agent, mono: true }))
            ) : null
          )
        ) : null
      )
    );
  }

  function ManualLeadModal({ apiFetch, onClose, onCreated }) {
    const [form, setForm] = React.useState({ name: '', phone: '', email: '', page_id: 'manual', attendance: '', interest: '' });
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState('');
    function setField(key, value) { setForm(current => ({ ...current, [key]: value })); }
    async function submit(event) {
      event.preventDefault();
      setSaving(true); setError('');
      try {
        const data = await apiFetch('/admin/leads', { method: 'POST', body: JSON.stringify(form) });
        onCreated?.(data?.lead);
      } catch (err) {
        setError(err.message || 'Khong tao duoc lead');
      } finally {
        setSaving(false);
      }
    }
    return h('div', { className: 'drawer-layer' },
      h('button', { className: 'drawer-backdrop', onClick: onClose, 'aria-label': 'Dong' }),
      h('form', { className: 'lead-drawer-react manual-lead-modal', onSubmit: submit },
        h('div', { className: 'drawer-head-react' }, h('div', null, h('h2', null, 'Them lead thu cong'), h('p', null, 'Tao lead CRM tu thong tin sale nhap tay.')), h(Button, { type: 'button', variant: 'ghost', onClick: onClose }, 'Dong')),
        h('div', { className: 'drawer-body-react' },
          error ? h('div', { className: 'drawer-state state-error' }, error) : null,
          h('div', { className: 'detail-grid-react' },
            h(Field, { label: 'Ho ten' }, h(Input, { value: form.name, onChange: e => setField('name', e.target.value), required: true })),
            h(Field, { label: 'So dien thoai' }, h(Input, { value: form.phone, onChange: e => setField('phone', e.target.value) })),
            h(Field, { label: 'Email' }, h(Input, { type: 'email', value: form.email, onChange: e => setField('email', e.target.value) })),
            h(Field, { label: 'Page ID' }, h(Input, { value: form.page_id, onChange: e => setField('page_id', e.target.value), placeholder: 'manual' })),
            h(Field, { label: 'Hinh thuc' }, h(Input, { value: form.attendance, onChange: e => setField('attendance', e.target.value) })),
            h(Field, { label: 'Quan tam' }, h(Input, { value: form.interest, onChange: e => setField('interest', e.target.value) }))
          ),
          h('div', { className: 'modal-actions' }, h(Button, { type: 'button', variant: 'outline', onClick: onClose }, 'Huy'), h(Button, { type: 'submit', disabled: saving }, saving ? 'Dang tao...' : 'Tao lead'))
        )
      )
    );
  }

  function localDateValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function nextDateValue(value) {
    if (!value) return '';
    const [year, month, day] = value.split('-').map(Number);
    return localDateValue(new Date(year, month - 1, day + 1));
  }

  function leadPresetRange(preset) {
    const today = new Date();
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const start = new Date(end);
    if (preset === 'yesterday') {
      start.setDate(start.getDate() - 1);
      end.setDate(end.getDate() - 1);
    } else if (/^(7|14|30)$/.test(preset)) {
      start.setDate(start.getDate() - (Number(preset) - 1));
    }
    return { from: localDateValue(start), to: localDateValue(end) };
  }

  const DEFAULT_LEAD_COLUMNS = ['name', 'phone', 'email', 'page', 'channel', 'source', 'sale', 'note', 'interaction', 'registered'];

  function formatLeadCustomValue(value, field) {
    if (value === undefined || value === null || value === '') return '-';
    if (Array.isArray(value)) return value.join(', ') || '-';
    if (field?.type === 'boolean') return value === true || value === 'true' || value === '1' ? 'Có' : 'Không';
    if (field?.type === 'currency') return `${new Intl.NumberFormat('vi-VN').format(Number(value) || 0)}đ`;
    if (field?.type === 'number') return new Intl.NumberFormat('vi-VN').format(Number(value) || 0);
    if (field?.type === 'date') {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('vi-VN');
    }
    return String(value);
  }

  function LeadsPage({ apiFetch, currentUser }) {
    const leadColumnsStorageKey = `vinmocLeadColumns:${currentUser?.id || currentUser?.email || 'anonymous'}`;
    const [q, setQ] = React.useState('');
    const [pageNum, setPageNum] = React.useState(1);
    const [pageSize, setPageSize] = React.useState(100);
    const [assignee, setAssignee] = React.useState('');
    const [tagFilter, setTagFilter] = React.useState('');
    const [datePreset, setDatePreset] = React.useState('');
    const [dateFrom, setDateFrom] = React.useState('');
    const [dateTo, setDateTo] = React.useState('');
    const [filters, setFilters] = React.useState([]);
    const [appliedFilters, setAppliedFilters] = React.useState([]);
    const [advancedOpen, setAdvancedOpen] = React.useState(false);
    const [selectedLeadId, setSelectedLeadId] = React.useState('');
    const [manualOpen, setManualOpen] = React.useState(false);
    const [exporting, setExporting] = React.useState(false);
    const [actionError, setActionError] = React.useState('');
    const [showBackToTop, setShowBackToTop] = React.useState(false);
    const [columnsOpen, setColumnsOpen] = React.useState(false);
    const [selectedColumns, setSelectedColumns] = React.useState(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(leadColumnsStorageKey) || 'null');
        return Array.isArray(saved) && saved.length ? saved : DEFAULT_LEAD_COLUMNS;
      } catch (_) {
        return DEFAULT_LEAD_COLUMNS;
      }
    });
    const [meta, setMeta] = React.useState({ users: [], tags: [], customFields: [] });
    const defs = leadFilterDefs(meta);
    const normalizedFilters = normalizeLeadFilters(appliedFilters, defs);
    const requestFilters = tagFilter ? [...normalizedFilters, { field: 'tags', type: 'tag', op: 'has', value: tagFilter }] : normalizedFilters;
    const baseParams = {
      pageSize,
      q,
      assignee,
      dateFrom,
      dateTo: nextDateValue(dateTo),
      filters: JSON.stringify(requestFilters),
      includeCustomFields: 1,
    };
    const path = `/admin/leads?${buildQuery({ ...baseParams, pageNum })}`;
    const { loading, error, data, reload } = useApi(path, apiFetch, [path, apiFetch]);
    const rows = data?.rows || [];
    React.useEffect(() => {
      let cancelled = false;
      Promise.all([apiFetch('/admin/crm/users').catch(() => ({ rows: [] })), apiFetch('/admin/crm/tags?counts=0').catch(() => ({ tags: [] })), apiFetch('/admin/crm/custom-fields').catch(() => ({ rows: [] }))]).then(([usersData, tagsData, fieldsData]) => {
        if (!cancelled) setMeta({ users: usersData.rows || [], tags: tagsData.tags || [], customFields: fieldsData.rows || [] });
      });
      return () => { cancelled = true; };
    }, [apiFetch]);
    React.useEffect(() => {
      const updateBackToTop = () => setShowBackToTop(window.scrollY > 480);
      updateBackToTop();
      window.addEventListener('scroll', updateBackToTop, { passive: true });
      return () => window.removeEventListener('scroll', updateBackToTop);
    }, []);
    React.useEffect(() => {
      localStorage.setItem(leadColumnsStorageKey, JSON.stringify(selectedColumns));
    }, [leadColumnsStorageKey, selectedColumns]);
    const standardColumns = [
      { id: 'name', label: 'Họ tên', width: 270, render: row => h('div', { className: 'lead-name-cell' }, h('strong', null, row.name || '-')) },
      { id: 'phone', label: 'SĐT', width: 150, render: row => h('span', { className: 'tabular-cell' }, row.phone || '-') },
      { id: 'email', label: 'Email', width: 240, render: row => h('span', { className: 'muted-cell' }, row.email || '-') },
      { id: 'page', label: 'Page', width: 190, render: row => h('span', { className: 'polaris-badge neutral' }, row.page_id || '-') },
      { id: 'channel', label: 'Channel', width: 130, render: row => h('span', { className: 'polaris-badge info' }, row.channel || '-') },
      { id: 'source', label: 'Source / Medium', width: 190, render: row => h('span', { className: 'muted-cell small' }, `${row.source || 'direct'} / ${row.medium || '(none)'}`) },
      { id: 'campaign', label: 'Campaign', width: 190, render: row => h('span', { className: 'muted-cell small' }, row.campaign || '-') },
      { id: 'sale', label: 'Sale', width: 170, render: row => row.assigned_name ? h('span', { className: 'sale-cell' }, row.assigned_name) : h('span', { className: 'muted-cell' }, 'chưa gán') },
      { id: 'note', label: 'Ghi chú', width: 380, wrap: true, render: row => row.latest_sale_note ? h('span', { className: 'lead-latest-note', title: row.latest_sale_note }, row.latest_sale_note) : '-' },
      { id: 'interaction', label: 'Tương tác gần nhất', width: 190, render: row => h('span', { className: 'muted-cell small' }, row.last_interaction_at ? fmtDate(row.last_interaction_at) : 'Chưa chăm sóc') },
      { id: 'registered', label: 'Thời gian đăng ký', width: 180, render: row => h('span', { className: 'muted-cell small' }, fmtDate(row.registered_at)) },
      { id: 'region', label: 'Khu vực', width: 150, render: row => row.region || '-' },
      { id: 'country', label: 'Quốc gia', width: 150, render: row => row.country || '-' },
      { id: 'city', label: 'Thành phố', width: 150, render: row => row.city || '-' },
      { id: 'attendance', label: 'Tham dự', width: 150, render: row => row.attendance || '-' },
      { id: 'device', label: 'Thiết bị', width: 140, render: row => row.device_type || '-' },
      { id: 'browser', label: 'Trình duyệt', width: 140, render: row => row.browser || '-' },
      { id: 'os', label: 'Hệ điều hành', width: 140, render: row => row.os || '-' },
    ];
    const customColumns = (meta.customFields || []).filter(field => field.active !== false).map(field => ({
      id: `custom:${field.id}`,
      label: field.label,
      group: field.group_name || 'Thông tin khác',
      width: 190,
      render: row => formatLeadCustomValue(row.custom_values?.[field.id] ?? field.default_value ?? '', field),
    }));
    const availableColumns = [...standardColumns, ...customColumns];
    const availableById = Object.fromEntries(availableColumns.map(column => [column.id, column]));
    const visibleColumns = selectedColumns.map(id => availableById[id]).filter(Boolean);
    function toggleLeadColumn(id) {
      setSelectedColumns(current => current.includes(id)
        ? (current.length > 1 ? current.filter(columnId => columnId !== id) : current)
        : [...current, id]);
    }
    function moveLeadColumn(id, direction) {
      setSelectedColumns(current => {
        const index = current.indexOf(id);
        const nextIndex = index + direction;
        if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
        const next = current.slice();
        [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
        return next;
      });
    }
    async function deleteLeadFromList(event, leadId) {
      event.stopPropagation();
      if (!window.confirm('Xoa lead nay? Thao tac nay khong the hoan tac.')) return;
      setActionError('');
      try {
        await apiFetch(`/admin/leads/${leadId}`, { method: 'DELETE' });
        if (selectedLeadId === leadId) setSelectedLeadId('');
        reload();
      } catch (err) {
        setActionError(err.message || 'Khong xoa duoc lead');
      }
    }
    async function exportCsv() {
      setExporting(true); setActionError('');
      try {
        const data = await apiFetch(`/admin/leads?${buildQuery({ ...baseParams, pageNum: 1, all: 1 })}`);
        const exportRows = data?.rows || [];
        downloadCsv(`vinmoc-leads-${new Date().toISOString().slice(0, 10)}.csv`, [
          { label: 'Name', value: r => r.name || '' },
          { label: 'Phone', value: r => r.phone || '' },
          { label: 'Email', value: r => r.email || '' },
          { label: 'Page', value: r => r.page_id || '' },
          { label: 'Channel', value: r => r.channel || '' },
          { label: 'Source', value: r => r.source || '' },
          { label: 'Medium', value: r => r.medium || '' },
          { label: 'Sale', value: r => r.assigned_name || '' },
          { label: 'Latest sale note', value: r => r.latest_sale_note || '' },
          { label: 'Registered at', value: r => fmtDate(r.registered_at) },
          { label: 'Last interaction', value: r => r.last_interaction_at ? fmtDate(r.last_interaction_at) : '' },
        ], exportRows);
      } catch (err) {
        setActionError(err.message || 'Khong export duoc CSV');
      } finally {
        setExporting(false);
      }
    }
    return h('div', { className: 'page-stack leads-page-stack' },
      h('div', { className: 'leads-header-actions' },
        h(Button, { variant: 'outline', onClick: reload }, h(Icon, { name: 'refresh' }), 'Làm mới'),
        h(Button, { variant: 'outline', onClick: exportCsv, disabled: exporting }, exporting ? 'Đang xuất...' : 'Xuất CSV'),
        h(Button, { onClick: () => setManualOpen(true) }, '+ Thêm lead')
      ),
      h(Card, { className: 'leads-board-card polaris-data-card' },
        h('div', { className: 'leads-board-toolbar' },
        h(Input, { value: q, onChange: e => { setPageNum(1); setQ(e.target.value); }, placeholder: 'Tim theo email, SDT...' }),
        h('select', { className: 'ui-input lead-assignee-select', value: assignee, onChange: e => { setPageNum(1); setAssignee(e.target.value); } }, h('option', { value: '' }, 'Tat ca sale'), meta.users.map(u => h('option', { key: u.user_id, value: u.user_id }, u.full_name || u.email))),
        h('select', { className: 'ui-input', value: tagFilter, onChange: e => { setPageNum(1); setTagFilter(e.target.value); } }, h('option', { value: '' }, 'Tat ca tag'), meta.tags.map(tag => h('option', { key: tag.id, value: tag.id }, `${tag.category_name ? `${tag.category_name} / ` : ''}${tag.name}`))),
        h('select', { className: 'ui-input lead-date-preset', value: datePreset, onChange: e => {
          const value = e.target.value;
          setPageNum(1);
          setDatePreset(value);
          if (!value) { setDateFrom(''); setDateTo(''); }
          else if (value !== 'custom') {
            const range = leadPresetRange(value);
            setDateFrom(range.from);
            setDateTo(range.to);
          }
        } },
          h('option', { value: '' }, 'Tất cả ngày đăng ký'),
          h('option', { value: 'yesterday' }, 'Hôm qua'),
          h('option', { value: 'today' }, 'Hôm nay'),
          h('option', { value: '7' }, '7 ngày qua'),
          h('option', { value: '14' }, '14 ngày qua'),
          h('option', { value: '30' }, '30 ngày qua'),
          h('option', { value: 'custom' }, 'Tùy chỉnh')
        ),
        datePreset === 'custom' ? h(React.Fragment, null,
          h(Input, { type: 'date', value: dateFrom, onChange: e => { setPageNum(1); setDateFrom(e.target.value); }, title: 'Từ ngày đăng ký' }),
          h('span', { className: 'date-arrow' }, '→'),
          h(Input, { type: 'date', value: dateTo, onChange: e => { setPageNum(1); setDateTo(e.target.value); }, title: 'Đến ngày đăng ký' })
        ) : null,
        h(Button, { variant: advancedOpen ? 'default' : 'outline', className: 'advanced-toggle', onClick: () => setAdvancedOpen(open => !open) }, 'Bộ lọc nâng cao')
        ),
        advancedOpen ? h('div', { className: 'leads-advanced-inline' },
          h(LeadAdvancedFilters, { filters, setFilters, meta, onApply: () => { setPageNum(1); setAppliedFilters(filters); }, onClear: () => { setFilters([]); setAppliedFilters([]); setPageNum(1); } })
        ) : null,
        actionError ? h('div', { className: 'leads-inline-error' }, actionError) : null,
        h('div', { className: 'polaris-card-head leads-list-head' },
          h('div', null, h('h3', null, 'Danh sách lead'), h('p', null, `${fmt(data?.total || 0)} lead phù hợp bộ lọc hiện tại`)),
          h(Button, { variant: 'outline', className: 'customize-columns-button', onClick: () => setColumnsOpen(true) }, '☷ Tùy chỉnh cột')
        ),
        h(SectionState, { loading, error },
        h('div', { className: 'table-shell' }, h('table', { className: 'react-table leads-table-react leads-table-customizable', style: { width: `${visibleColumns.reduce((sum, column) => sum + column.width, 48)}px`, minWidth: '100%' } },
          h('thead', null, h('tr', null, visibleColumns.map(column => h('th', { key: column.id, style: { width: `${column.width}px` } }, column.label)), h('th', { className: 'lead-actions-column' }, ''))),
          h('tbody', null, rows.length ? rows.map(row => h('tr', { key: row.id, className: 'clickable-row', onClick: () => setSelectedLeadId(row.id) },
            visibleColumns.map(column => h('td', { key: column.id, className: column.wrap ? 'lead-column-wrap' : '', style: { width: `${column.width}px` } }, column.render(row))),
            h('td', { className: 'lead-actions-column' }, h('button', { className: 'icon-action danger', onClick: event => deleteLeadFromList(event, row.id), title: 'Xóa lead' }, '×'))
          )) : h('tr', null, h('td', { colSpan: visibleColumns.length + 1, className: 'empty-cell' }, 'Chưa có lead phù hợp.')))
        ))
        ),
        h('div', { className: 'leads-board-pager' },
          h('label', { className: 'leads-page-size' }, 'Hiển thị', h('select', { className: 'ui-input', value: pageSize, onChange: e => { setPageNum(1); setPageSize(Number(e.target.value)); } }, [10, 20, 50, 100, 200].map(size => h('option', { key: size, value: size }, `${size} lead`)))),
          h(Button, { variant: 'outline', disabled: pageNum <= 1, onClick: () => setPageNum(p => Math.max(1, p - 1)) }, 'Trước'),
          h('span', null, `Trang ${pageNum}/${Math.max(1, Math.ceil((data?.total || 0) / pageSize))} - ${fmt(data?.total || 0)} lead`),
          h(Button, { variant: 'outline', disabled: pageNum * pageSize >= (data?.total || 0), onClick: () => setPageNum(p => p + 1) }, 'Sau')
        )
      ),
      columnsOpen ? h('div', { className: 'drawer-layer lead-columns-layer' },
        h('button', { className: 'drawer-backdrop', onClick: () => setColumnsOpen(false), 'aria-label': 'Đóng' }),
        h('section', { className: 'lead-columns-modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'lead-columns-title' },
          h('div', { className: 'lead-columns-head' },
            h('div', null, h('h2', { id: 'lead-columns-title' }, 'Tùy chỉnh cột'), h('p', null, 'Chọn thông tin muốn quan sát và sắp xếp thứ tự hiển thị trên bảng lead.')),
            h('button', { className: 'drawer-close', onClick: () => setColumnsOpen(false), 'aria-label': 'Đóng' }, '×')
          ),
          h('div', { className: 'lead-columns-body' },
            h('div', { className: 'lead-columns-selected' },
              h('h3', null, `Đang hiển thị (${visibleColumns.length})`),
              selectedColumns.map((id, index) => availableById[id] ? h('div', { className: 'lead-column-row', key: id },
                h('span', { className: 'lead-column-grip', 'aria-hidden': 'true' }, '⋮⋮'),
                h('span', { className: 'lead-column-label' }, availableById[id].label, availableById[id].group ? h('small', null, availableById[id].group) : null),
                h('button', { disabled: index === 0, onClick: () => moveLeadColumn(id, -1), 'aria-label': `Đưa ${availableById[id].label} lên` }, '↑'),
                h('button', { disabled: index === selectedColumns.length - 1, onClick: () => moveLeadColumn(id, 1), 'aria-label': `Đưa ${availableById[id].label} xuống` }, '↓'),
                h('button', { className: 'remove', disabled: selectedColumns.length === 1, onClick: () => toggleLeadColumn(id), 'aria-label': `Ẩn ${availableById[id].label}` }, '−')
              ) : null)
            ),
            h('div', { className: 'lead-columns-available' },
              h('h3', null, 'Thêm trường thông tin'),
              availableColumns.filter(column => !selectedColumns.includes(column.id)).map(column => h('button', { className: 'lead-column-add', key: column.id, onClick: () => toggleLeadColumn(column.id) },
                h('span', null, '+'), h('span', null, column.label, column.group ? h('small', null, column.group) : null)
              )),
              availableColumns.every(column => selectedColumns.includes(column.id)) ? h('p', { className: 'empty-note' }, 'Tất cả trường đã được hiển thị.') : null
            )
          ),
          h('div', { className: 'lead-columns-footer' },
            h(Button, { variant: 'outline', onClick: () => setSelectedColumns(DEFAULT_LEAD_COLUMNS) }, 'Khôi phục mặc định'),
            h(Button, { onClick: () => setColumnsOpen(false) }, 'Xong')
          )
        )
      ) : null,
      manualOpen ? h(ManualLeadModal, { apiFetch, onClose: () => setManualOpen(false), onCreated: lead => { setManualOpen(false); reload(); if (lead?.id) setSelectedLeadId(lead.id); } }) : null,
      h(LeadDrawer, { leadId: selectedLeadId, apiFetch, meta, onClose: () => setSelectedLeadId(''), onRefresh: reload }),
      showBackToTop ? h('button', {
        type: 'button',
        className: 'leads-back-to-top',
        onClick: () => window.scrollTo({ top: 0, behavior: 'smooth' }),
        'aria-label': 'Quay lại đầu trang',
        title: 'Quay lại đầu trang'
      }, h('span', { 'aria-hidden': 'true' }, '↑'), h('span', null, 'Đầu trang')) : null
    );
  }

  function SurveyPage({ apiFetch }) {
    const { loading, error, data } = useApi('/admin/survey', apiFetch);
    const TextList = ({ title, rows }) => h(Card, { className: 'panel-card' }, h('div', { className: 'panel-title' }, title), (rows || []).length ? h('div', { className: 'text-response-list' }, rows.slice(0, 60).map((text, index) => h('div', { className: 'text-response-item', key: index }, text))) : h('div', { className: 'empty-note' }, 'Chua co phan hoi.'));
    return h(SectionState, { loading, error },
      h('div', { className: 'page-stack' },
        h(StatGrid, { items: [
          { label: 'Tổng phản hồi', value: fmt(data?.total) },
          { label: 'Đã trả lời', value: fmt(data?.answered) },
          { label: 'Q8 tự do', value: fmt((data?.q8 || []).length) },
          { label: 'Q9 tự do', value: fmt((data?.q9 || []).length) },
        ] }),
        h('div', { className: 'grid-2-react' },
          h(Bars, { title: 'Q1 - Giai đoạn', data: data?.q1 }),
          h(Bars, { title: 'Q2 - Vấn đề', data: data?.q2 }),
          h(Bars, { title: 'Q3 - Loi thuong gap', data: data?.q3 }),
          h(Bars, { title: 'Q4 - Muc tieu', data: data?.q4 }),
          h(ChartPanel, { title: 'Q5 - Da tung hoc', type: 'doughnut', data: data?.q5, height: 220 }),
          h(ChartPanel, { title: 'Q6 - Thoi gian hoc', type: 'doughnut', data: data?.q6, height: 220 }),
          h(ChartPanel, { title: 'Q7 - Lo ngai', type: 'doughnut', data: data?.q7, height: 220 }),
          h(Bars, { title: 'Q7 - Chi tiet lo ngai', data: data?.q7 }),
          h(Bars, { title: 'Linh vuc quan tam', data: data?.interest }),
          h(ChartPanel, { title: 'Interest chart', type: 'doughnut', data: data?.interest, height: 220 })
        ),
        h('div', { className: 'grid-2-react' },
          h(TextList, { title: 'Q8 - Ky vong tu do', rows: data?.q8 || [] }),
          h(TextList, { title: 'Q9 - Uu tien tu do', rows: data?.q9 || [] })
        )
      )
    );
  }

  function CampaignPageBasic({ apiFetch }) {
    const { loading, error, data } = useApi('/admin/campaign/14-days', apiFetch);
    const rows = data?.rows || [];
    return h(SectionState, { loading, error },
      h('div', { className: 'page-stack' },
        h(StatGrid, { items: [
          { label: 'Delivery', value: fmt(data?.total?.delivery) },
          { label: 'Open', value: fmt(data?.total?.open), sub: fmtPct((data?.total?.openRate || 0) * 100) },
          { label: 'Click', value: fmt(data?.total?.click), sub: fmtPct((data?.total?.clickRate || 0) * 100) },
          { label: 'Users', value: fmt(data?.total?.userCount) },
        ] }),
        h(DataTable, {
          columns: [
            { key: 'label', label: 'Stage' },
            { key: 'delivery', label: 'Delivery', numeric: true, render: r => fmt(r.delivery) },
            { key: 'open', label: 'Open', numeric: true, render: r => fmt(r.open) },
            { key: 'click', label: 'Click', numeric: true, render: r => fmt(r.click) },
            { key: 'bounce', label: 'Bounce', numeric: true, render: r => fmt(r.bounce) },
            { key: 'userCount', label: 'Users', numeric: true, render: r => fmt(r.userCount) },
          ],
          rows,
        })
      )
    );
  }

  function DuplicatesPageBasic({ apiFetch }) {
    const { loading, error, data } = useApi('/admin/leads/duplicates', apiFetch);
    return h(SectionState, { loading, error },
      h('div', { className: 'page-stack' },
        h(StatGrid, { items: [
          { label: 'Nhóm trùng', value: fmt((data?.groups || []).length) },
          { label: 'Lead trùng', value: fmt(data?.total_duplicate_leads) },
          { label: 'Đã quét', value: fmt(data?.scanned_leads) },
        ] }),
        h(DataTable, {
          columns: [
            { key: 'key', label: 'Khóa trùng' },
            { key: 'type', label: 'Loại' },
            { key: 'count', label: 'Số lead', numeric: true },
            { key: 'latest_registered_at', label: 'Mới nhất', render: r => fmtDate(r.latest_registered_at) },
          ],
          rows: data?.groups || [],
        })
      )
    );
  }

  function ZoomPageBasic({ apiFetch }) {
    const { loading, error, data } = useApi('/admin/zoom/meetings', apiFetch);
    return h(SectionState, { loading, error },
      h(DataTable, {
        columns: [
          { key: 'topic', label: 'Meeting' },
          { key: 'start_time', label: 'Bắt đầu', render: r => fmtDate(r.start_time) },
          { key: 'participants', label: 'Participants', numeric: true, render: r => fmt(r.participants || r.total_participants) },
          { key: 'linked_leads', label: 'Linked leads', numeric: true, render: r => fmt(r.linked_leads) },
        ],
        rows: data?.rows || [],
      })
    );
  }

  function CampaignPage({ apiFetch }) {
    const { loading, error, data } = useApi('/admin/campaign/14-days', apiFetch);
    const [stage, setStage] = React.useState(null);
    const [saleFilter, setSaleFilter] = React.useState('');
    const [selectedLeadId, setSelectedLeadId] = React.useState('');
    const [selectedCampaignUser, setSelectedCampaignUser] = React.useState(null);
    const stageState = useApi(stage ? `/admin/campaign/14-days/stage/${stage}` : '/admin/campaign/14-days/stage/1', apiFetch, [stage, apiFetch]);
    const rows = data?.rows || [];
    const deliveryByStage = Object.fromEntries(rows.map(row => [row.label || `Ngày ${row.stage}`, row.delivery || 0]));
    const stageRows = (stage ? (stageState.data?.rows || []) : []).filter(row => !saleFilter || String(row.linkedLead?.assigned_name || '').toLowerCase().includes(saleFilter.toLowerCase()));
    return h(SectionState, { loading, error },
      h('div', { className: 'page-stack' },
        h(StatGrid, { items: [
          { label: 'Delivery', value: fmt(data?.total?.delivery), tone: 'blue' },
          { label: 'Users', value: fmt(data?.total?.userCount), tone: 'teal' },
          { label: 'Open', value: fmt(data?.total?.open), sub: fmtPct((data?.total?.openRate || 0) * 100), tone: 'green' },
          { label: 'Click', value: fmt(data?.total?.click), sub: fmtPct((data?.total?.clickRate || 0) * 100), tone: 'purple' },
          { label: 'Bounce', value: fmt(data?.total?.bounce), tone: 'red' },
        ] }),
        h(ChartPanel, { title: 'Funnel theo stage', type: 'bar', data: deliveryByStage, limit: 14, height: 320 }),
        h(Card, { className: 'lead-table-card polaris-data-card' },
          h('div', { className: 'polaris-card-head' }, h('div', null, h('h3', null, 'Bảng stage'), h('p', null, 'Click số users để xem danh sách người trong stage.'))),
          h('div', { className: 'table-shell' },
            h('table', { className: 'react-table' },
              h('thead', null, h('tr', null, ['Stage', 'Delivery', 'Open', 'Click', 'Bounce', 'Users'].map(label => h('th', { key: label, className: label === 'Stage' ? '' : 'num' }, label)))),
              h('tbody', null, rows.length ? rows.map(row => h('tr', { key: row.stage },
                h('td', null, row.label || `Ngay ${row.stage}`),
                h('td', { className: 'num' }, fmt(row.delivery)),
                h('td', { className: 'num' }, fmt(row.open)),
                h('td', { className: 'num' }, fmt(row.click)),
                h('td', { className: 'num' }, fmt(row.bounce)),
                h('td', { className: 'num' }, h('button', { className: 'link-button', onClick: () => setStage(row.stage) }, fmt(row.userCount)))
              )) : h('tr', null, h('td', { colSpan: 6, className: 'empty-cell' }, 'Chua co du lieu.')))
            )
          )
        ),
        stage ? h('div', { className: 'drawer-layer' },
          h('button', { className: 'drawer-backdrop', onClick: () => setStage(null), 'aria-label': 'Dong' }),
          h('aside', { className: 'lead-drawer-react wide' },
            h('div', { className: 'drawer-head-react' }, h('div', null, h('h2', null, `Campaign stage ${stage}`), h('p', null, `${fmt(stageState.data?.totalElements || stageRows.length)} user`)), h(Button, { variant: 'ghost', onClick: () => setStage(null) }, 'Dong')),
            h('div', { className: 'drawer-body-react' },
              h(Card, { className: 'lead-toolbar-card' }, h(Input, { value: saleFilter, onChange: e => setSaleFilter(e.target.value), placeholder: 'Loc theo sale...' }), h(Button, { variant: 'outline', onClick: () => setSaleFilter('') }, 'Xoa loc')),
              h(SectionState, { loading: stageState.loading, error: stageState.error },
                h(DataTable, { columns: [
                  { key: 'name', label: 'Ho ten' },
                  { key: 'phone', label: 'SDT' },
                  { key: 'email', label: 'Email' },
                  { key: 'linkedLead', label: 'CRM', render: r => r.linkedLead ? h(Button, { variant: 'ghost', size: 'sm', onClick: () => setSelectedLeadId(r.linkedLead.id) }, 'Linked') : h(Button, { variant: 'outline', size: 'sm', onClick: () => setSelectedCampaignUser(r) }, 'Chua khop') },
                  { key: 'assigned', label: 'Sale', render: r => r.linkedLead?.assigned_name || '-' },
                  { key: 'stage', label: 'Stage', numeric: true, render: r => fmt(r.stage || stage) },
                  { key: 'createdAt', label: 'Ngay tao', render: r => r.createdAt ? new Date(Number(r.createdAt)).toLocaleString('vi-VN') : '-' },
                ], rows: stageRows })
              )
            )
          )
        ) : null,
        selectedCampaignUser ? h('div', { className: 'drawer-layer' },
          h('button', { className: 'drawer-backdrop', onClick: () => setSelectedCampaignUser(null), 'aria-label': 'Dong' }),
          h('aside', { className: 'lead-drawer-react' },
            h('div', { className: 'drawer-head-react' }, h('div', null, h('h2', null, selectedCampaignUser.name || selectedCampaignUser.email || 'Campaign user'), h('p', null, selectedCampaignUser.email || '')), h(Button, { variant: 'ghost', onClick: () => setSelectedCampaignUser(null) }, 'Dong')),
            h('div', { className: 'drawer-body-react' }, h('pre', { className: 'json-preview' }, JSON.stringify(selectedCampaignUser, null, 2)))
          )
        ) : null,
        h(LeadDrawer, { leadId: selectedLeadId, apiFetch, meta: { users: [], tags: [], customFields: [] }, onClose: () => setSelectedLeadId(''), onRefresh: stageState.reload })
      )
    );
  }

  function ProsperityJourneyPage({ apiFetch }) {
    const overview = useApi('/admin/prosperity-journey', apiFetch);
    const [selectedLesson, setSelectedLesson] = React.useState(null);
    const [lessonState, setLessonState] = React.useState({ loading: false, error: '', data: null });
    const [search, setSearch] = React.useState('');
    const [region, setRegion] = React.useState('');
    const [selectedLeadId, setSelectedLeadId] = React.useState('');
    const [selectedUser, setSelectedUser] = React.useState(null);
    const rows = overview.data?.rows || [];

    React.useEffect(() => {
      if (!selectedLesson?.lesson?.id) return;
      let cancelled = false;
      const query = buildQuery({ search, region, size: 300 });
      setLessonState(s => ({ ...s, loading: true, error: '' }));
      apiFetch(`/admin/prosperity-journey/lesson/${encodeURIComponent(selectedLesson.lesson.id)}${query ? `?${query}` : ''}`)
        .then(data => { if (!cancelled) setLessonState({ loading: false, error: '', data }); })
        .catch(err => { if (!cancelled) setLessonState({ loading: false, error: err.message || 'Khong tai duoc danh sach hoc vien', data: null }); });
      return () => { cancelled = true; };
    }, [selectedLesson?.lesson?.id, search, region, apiFetch]);

    const selectedRows = (lessonState.data?.rows || []).slice().sort((a, b) => {
      const pctDiff = Number(b.pct || 0) - Number(a.pct || 0);
      if (pctDiff) return pctDiff;
      return String(a.fullName || a.email || '').localeCompare(String(b.fullName || b.email || ''), 'vi');
    });
    const filteredRegions = [...new Set(selectedRows.map(row => row.region).filter(Boolean))];
    const progressTone = rate => rate >= .85 ? 'green' : rate >= .7 ? 'gold' : 'red';
    function openProsperityUser(row) {
      if (row.linkedLead?.id) setSelectedLeadId(row.linkedLead.id);
      else setSelectedUser(row);
    }

    return h(SectionState, { loading: overview.loading, error: overview.error },
      h('div', { className: 'page-stack' },
        h(StatGrid, { items: [
          { label: 'Học viên', value: fmt(overview.data?.total?.users), tone: 'teal' },
          { label: 'Phiên xem', value: fmt(overview.data?.total?.sessions), tone: 'blue' },
          { label: 'Bài học', value: fmt(overview.data?.total?.lessons), tone: 'purple' },
          { label: 'Hoàn thành đủ chuỗi', value: fmt(overview.data?.total?.completedAll), sub: fmtPct((overview.data?.total?.completionRate || 0) * 100), tone: 'green' },
          { label: 'Câu trả lời khảo sát', value: fmt(overview.data?.total?.answers), tone: 'gold' },
        ] }),
        h(Card, { className: 'lead-table-card polaris-data-card' },
          h('div', { className: 'polaris-card-head' },
            h('div', null, h('h3', null, 'Dữ liệu xem và hoàn thành bài giảng'), h('p', null, 'Nhấp vào một hàng để xem danh sách người dùng đã xem video đó.')),
            h(Button, { variant: 'outline', size: 'sm', onClick: overview.reload }, h(Icon, { name: 'refresh' }), 'Làm mới')
          ),
          h('div', { className: 'table-shell' },
            h('table', { className: 'react-table' },
              h('thead', null, h('tr', null, ['#', 'Tên bài học', 'Số người xem', 'Số hoàn thành', 'Tỷ lệ hoàn thành'].map(label => h('th', { key: label, className: ['Số người xem', 'Số hoàn thành', 'Tỷ lệ hoàn thành'].includes(label) ? 'num' : '' }, label)))),
              h('tbody', null, rows.length ? rows.map(row => h('tr', { key: row.lesson?.id || row.index, onClick: () => setSelectedLesson(row), className: 'clickable-row' },
                h('td', null, fmt(row.index)),
                h('td', null, h('strong', null, row.lesson?.title || '-')),
                h('td', { className: 'num' }, h('button', { className: 'link-button', onClick: event => { event.stopPropagation(); setSelectedLesson(row); } }, fmt(row.viewerCount))),
                h('td', { className: 'num' }, fmt(row.completedCount)),
                h('td', { className: 'num' }, h('div', { className: 'mini-progress-cell right' }, h('span', { className: `mini-progress-track tone-${progressTone(row.completionRate || 0)}` }, h('span', { style: { width: `${Math.max(1, (row.completionRate || 0) * 100)}%` } })), h('b', null, fmtPct((row.completionRate || 0) * 100))))
              )) : h('tr', null, h('td', { colSpan: 5, className: 'empty-cell' }, 'Chưa có dữ liệu Hành trình thịnh vượng.')))
            )
          )
        ),
        selectedLesson ? h('div', { className: 'drawer-layer prosperity-lesson-layer' },
          h('button', { className: 'drawer-backdrop', onClick: () => setSelectedLesson(null), 'aria-label': 'Dong' }),
          h('aside', { className: 'lead-drawer-react prosperity-lesson-modal' },
            h('div', { className: 'drawer-head-react' },
              h('div', null, h('h2', null, selectedLesson.lesson?.title || 'Bài học'), h('p', null, `${fmt(lessonState.data?.total || selectedRows.length)} phiên xem - ${fmt(selectedRows.filter(row => row.linkedLead).length)} linked CRM`)),
              h(Button, { variant: 'ghost', onClick: () => setSelectedLesson(null) }, 'Đóng')
            ),
            h('div', { className: 'drawer-body-react' },
              h(Card, { className: 'lead-toolbar-card' },
                h(Input, { value: search, onChange: e => setSearch(e.target.value), placeholder: 'Tìm tên, email, SĐT...' }),
                h('select', { className: 'ui-input', value: region, onChange: e => setRegion(e.target.value) },
                  h('option', { value: '' }, 'Tất cả khu vực'),
                  filteredRegions.map(value => h('option', { key: value, value }, value))
                ),
                h(Button, { variant: 'outline', onClick: () => { setSearch(''); setRegion(''); } }, 'Xóa lọc')
              ),
              h(SectionState, { loading: lessonState.loading, error: lessonState.error },
                h(DataTable, { columns: [
                  { key: 'fullName', label: 'Học viên', render: r => r.fullName || r.email || '-' },
                  { key: 'email', label: 'Email' },
                  { key: 'phone', label: 'SĐT' },
                  { key: 'region', label: 'Khu vực' },
                  { key: 'sale', label: 'Sale hỗ trợ', render: r => r.linkedLead?.assigned_name || h('span', { className: 'muted-cell' }, 'Chưa gán') },
                  { key: 'pct', label: 'Tiến độ xem', render: r => h('div', { className: 'mini-progress-cell' }, h('span', { className: 'mini-progress-track' }, h('span', { style: { width: `${Math.max(1, Number(r.pct || 0))}%` } })), h('b', null, fmtPct(r.pct || 0))) },
                  { key: 'completed', label: 'Trạng thái', render: r => Number(r.pct || 0) >= 100 ? h(Badge, { variant: 'secondary', className: 'status-badge-complete' }, 'Hoàn thành') : h(Badge, { variant: 'outline', className: 'status-badge-learning' }, 'Đang học') },
                  { key: 'detail', label: 'Chi tiết', render: r => r.linkedLead ? h(Button, { variant: 'ghost', size: 'sm', onClick: event => { event.stopPropagation(); setSelectedLeadId(r.linkedLead.id); } }, 'Lead CRM') : h(Button, { variant: 'outline', size: 'sm', onClick: event => { event.stopPropagation(); setSelectedUser(r); } }, 'Học viên') },
                ], rows: selectedRows, onRowClick: openProsperityUser })
              )
            )
          )
        ) : null,
        selectedUser ? h('div', { className: 'drawer-layer' },
          h('button', { className: 'drawer-backdrop', onClick: () => setSelectedUser(null), 'aria-label': 'Dong' }),
          h('aside', { className: 'lead-drawer-react' },
            h('div', { className: 'drawer-head-react' }, h('div', null, h('h2', null, selectedUser.fullName || selectedUser.email || 'Học viên'), h('p', null, [selectedUser.phone, selectedUser.email].filter(Boolean).join(' - '))), h(Button, { variant: 'ghost', onClick: () => setSelectedUser(null) }, 'Đóng')),
            h('div', { className: 'drawer-body-react' }, h('div', { className: 'detail-grid-react' },
              h(DetailItem, { label: 'Tên', value: selectedUser.fullName }),
              h(DetailItem, { label: 'Email', value: selectedUser.email }),
              h(DetailItem, { label: 'SĐT', value: selectedUser.phone }),
              h(DetailItem, { label: 'Khu vực', value: selectedUser.region }),
              h(DetailItem, { label: 'Tiến độ', value: fmtPct(selectedUser.pct || 0) }),
              h(DetailItem, { label: 'Trạng thái CRM', value: 'Chưa khớp email/SĐT trong lead hiện có' })
            ))
          )
        ) : null,
        h(LeadDrawer, { leadId: selectedLeadId, apiFetch, meta: { users: [], tags: [], customFields: [] }, onClose: () => setSelectedLeadId(''), onRefresh: overview.reload })
      )
    );
  }

  function DuplicatesPage({ apiFetch }) {
    const duplicateState = useApi('/admin/leads/duplicates', apiFetch);
    const [selectedGroupId, setSelectedGroupId] = React.useState('');
    const [selectedIds, setSelectedIds] = React.useState([]);
    const [search, setSearch] = React.useState('');
    const [typeFilter, setTypeFilter] = React.useState('');
    const [selectedLeadId, setSelectedLeadId] = React.useState('');
    const [mergePreview, setMergePreview] = React.useState(null);
    const [busy, setBusy] = React.useState('');
    const data = duplicateState.data;
    const groups = (data?.groups || []).filter(g => (!typeFilter || g.type === typeFilter) && (!search || String(g.key || '').toLowerCase().includes(search.toLowerCase())));
    const group = groups.find(g => g.id === selectedGroupId) || groups[0] || null;
    React.useEffect(() => { if (!selectedGroupId && groups[0]) setSelectedGroupId(groups[0].id); }, [groups.length, selectedGroupId]);
    function toggleLead(id) {
      setSelectedIds(current => current.includes(id) ? current.filter(x => x !== id) : (current.length >= 2 ? [current[1], id] : [...current, id]));
    }
    const mergeFieldDefs = [
      ['name', 'Họ tên'],
      ['phone', 'SĐT'],
      ['email', 'Email'],
      ['page_id', 'Page'],
      ['assigned_name', 'Sale'],
      ['channel', 'Channel'],
      ['source', 'Source'],
      ['medium', 'Medium'],
      ['registered_at', 'Đăng ký lúc'],
    ];
    const mergeEditableKeys = new Set(['name', 'phone', 'email', 'page_id', 'source', 'medium']);
    const score = lead => (lead.assigned_to ? 10 : 0) + Number(lead.stats?.notes || 0) + Number(lead.stats?.tags || 0) + Number(lead.stats?.custom_fields || 0) + Number(lead.stats?.zoom_attendances || 0);
    function displayMergeValue(lead, key) {
      if (!lead) return '';
      if (key === 'registered_at') return fmtDate(lead[key]);
      if (key === 'source') return lead.source || lead.utm_source || '';
      if (key === 'medium') return lead.medium || lead.utm_medium || '';
      return lead[key] || '';
    }
    function mergedValue(primary, duplicate, key) {
      if (key === 'source') return primary.source || primary.utm_source || duplicate.source || duplicate.utm_source || '';
      if (key === 'medium') return primary.medium || primary.utm_medium || duplicate.medium || duplicate.utm_medium || '';
      if (key === 'assigned_name') return primary.assigned_name || duplicate.assigned_name || '';
      return primary[key] || duplicate[key] || '';
    }
    function buildMergePreview(primary, duplicate) {
      return {
        primary,
        duplicate,
        mergedFields: Object.fromEntries(mergeFieldDefs.map(([key]) => [key, mergedValue(primary, duplicate, key)])),
      };
    }
    function openMergePreview() {
      if (!group || selectedIds.length !== 2) return;
      const [a, b] = selectedIds.map(id => group.leads.find(l => l.id === id)).filter(Boolean);
      if (!a || !b) return;
      const primary = score(a) >= score(b) ? a : b;
      const duplicate = primary.id === a.id ? b : a;
      setMergePreview(buildMergePreview(primary, duplicate));
    }
    function swapMergePreview() {
      setMergePreview(current => current ? buildMergePreview(current.duplicate, current.primary) : current);
    }
    function updateMergeField(key, value) {
      setMergePreview(current => current ? ({ ...current, mergedFields: { ...current.mergedFields, [key]: value } }) : current);
    }
    function useMergeSourceValue(key, value) {
      if (!mergeEditableKeys.has(key)) return;
      updateMergeField(key, value || '');
    }
    async function confirmMergePreview() {
      if (!mergePreview || !group) return;
      setBusy('merge');
      try {
        const fields = mergePreview.mergedFields || {};
        await apiFetch('/admin/leads/merge', { method: 'POST', body: JSON.stringify({ primary_id: mergePreview.primary.id, duplicate_id: mergePreview.duplicate.id, merged_fields: { id: mergePreview.primary.id, name: fields.name || '', phone: fields.phone || '', email: fields.email || '', page_id: fields.page_id || '', source: fields.source || '', medium: fields.medium || '' }, reason: `${group.type}:${group.key}` }) });
        setSelectedIds([]);
        setMergePreview(null);
        duplicateState.reload();
      } finally { setBusy(''); }
    }
    async function deleteSelected() {
      if (!selectedIds.length || !confirm(`Xoa ${selectedIds.length} lead da chon?`)) return;
      setBusy('delete');
      try {
        for (const id of selectedIds) await apiFetch(`/admin/leads/${encodeURIComponent(id)}`, { method: 'DELETE' });
        setSelectedIds([]);
        duplicateState.reload();
      } finally { setBusy(''); }
    }
    return h(SectionState, { loading: duplicateState.loading, error: duplicateState.error },
      h('div', { className: 'page-stack' },
        h(StatGrid, { items: [{ label: 'Nhom trung', value: fmt(groups.length), tone: 'gold' }, { label: 'Lead trung', value: fmt(data?.total_duplicate_leads), tone: 'red' }, { label: 'Da quet', value: fmt(data?.scanned_leads), tone: 'blue' }] }),
        h(Card, { className: 'lead-toolbar-card' },
          h(Input, { value: search, onChange: e => { setSearch(e.target.value); setSelectedGroupId(''); setSelectedIds([]); }, placeholder: 'Tim key trung...' }),
          h('select', { className: 'ui-input', value: typeFilter, onChange: e => { setTypeFilter(e.target.value); setSelectedGroupId(''); setSelectedIds([]); } }, h('option', { value: '' }, 'Tat ca loai'), h('option', { value: 'email' }, 'Email'), h('option', { value: 'phone' }, 'Phone')),
          h(Button, { variant: 'outline', onClick: duplicateState.reload }, h(Icon, { name: 'refresh' }), 'Quet lai'),
          h(Button, { variant: 'critical', disabled: !selectedIds.length || busy === 'delete', onClick: deleteSelected }, busy === 'delete' ? 'Dang xoa...' : 'Xoa da chon')
        ),
        h('div', { className: 'duplicate-react-layout' },
          h(Card, { className: 'panel-card' }, h('div', { className: 'panel-title' }, 'Nhom trung'), h('div', { className: 'duplicate-group-list-react' }, groups.length ? groups.map(g => h('button', { key: g.id, className: cn('duplicate-group-react', group?.id === g.id && 'active'), onClick: () => { setSelectedGroupId(g.id); setSelectedIds([]); } }, h('b', null, g.key), h('span', null, `${g.type} - ${fmt(g.count)} lead`))) : h('div', { className: 'empty-note' }, 'Khong co nhom trung.'))),
          h(Card, { className: 'panel-card' },
            h('div', { className: 'advanced-head' }, h('div', null, h('div', { className: 'panel-title' }, group ? `Chi tiet: ${group.key}` : 'Chi tiet'), h('p', null, 'Chon dung 2 lead de merge.')), h(Button, { disabled: selectedIds.length !== 2 || busy === 'merge', onClick: openMergePreview }, 'Xem trước merge')),
            h(DataTable, { columns: [
              { key: 'select', label: '', render: r => h('input', { type: 'checkbox', checked: selectedIds.includes(r.id), onChange: () => toggleLead(r.id) }) },
              { key: 'name', label: 'Ho ten' }, { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' }, { key: 'page_id', label: 'Page' }, { key: 'assigned_name', label: 'Sale' },
              { key: 'stats', label: 'Du lieu CRM', render: r => `${fmt(r.stats?.notes || 0)} notes / ${fmt(r.stats?.tags || 0)} tags / ${fmt(r.stats?.custom_fields || 0)} fields / ${fmt(r.stats?.zoom_attendances || 0)} zoom` },
              { key: 'registered_at', label: 'Dang ky', render: r => fmtDate(r.registered_at) },
              { key: 'detail', label: '', render: r => h(Button, { variant: 'outline', size: 'sm', onClick: () => setSelectedLeadId(r.id) }, 'Chi tiet') },
            ], rows: group?.leads || [] })
          )
        ),
        mergePreview ? h('div', { className: 'drawer-layer merge-preview-layer' },
          h('button', { className: 'drawer-backdrop', onClick: () => setMergePreview(null), 'aria-label': 'Dong' }),
          h('aside', { className: 'lead-drawer-react lead-detail-modal merge-preview-modal' },
            h('div', { className: 'drawer-head-react' },
              h('div', null, h('h2', null, 'Xem trước merge lead'), h('p', null, `Lead giữ lại: ${mergePreview.primary.name || mergePreview.primary.email || mergePreview.primary.id} • Lead bị merge: ${mergePreview.duplicate.name || mergePreview.duplicate.email || mergePreview.duplicate.id}`)),
              h('div', { className: 'drawer-head-actions' },
                h(Button, { variant: 'outline', onClick: swapMergePreview, disabled: busy === 'merge' }, 'Đổi lead giữ lại'),
                h(Button, { variant: 'ghost', onClick: () => setMergePreview(null), disabled: busy === 'merge' }, 'Đóng')
              )
            ),
            h('div', { className: 'drawer-body-react' },
              h('div', { className: 'merge-summary-grid' },
                h('div', { className: 'merge-summary-card keep' }, h('span', null, 'Giữ lại'), h('strong', null, mergePreview.primary.name || '-'), h('small', null, mergePreview.primary.id)),
                h('div', { className: 'merge-summary-card remove' }, h('span', null, 'Merge vào lead giữ lại'), h('strong', null, mergePreview.duplicate.name || '-'), h('small', null, mergePreview.duplicate.id)),
                h('div', { className: 'merge-summary-card' }, h('span', null, 'Dữ liệu CRM sẽ chuyển'), h('strong', null, `${fmt(mergePreview.duplicate.stats?.notes || 0)} notes / ${fmt(mergePreview.duplicate.stats?.tags || 0)} tags`), h('small', null, `${fmt(mergePreview.duplicate.stats?.custom_fields || 0)} fields / ${fmt(mergePreview.duplicate.stats?.zoom_attendances || 0)} zoom`))
              ),
              h('div', { className: 'merge-preview-table-wrap' }, h('table', { className: 'merge-preview-table' },
                h('thead', null, h('tr', null, h('th', null, 'Field'), h('th', null, 'Lead giữ lại'), h('th', null, 'Sau khi merge'), h('th', null, 'Lead bị merge'))),
                h('tbody', null, mergeFieldDefs.map(([key, label]) => h('tr', { key },
                  h('th', null, label),
                  h('td', null, h('div', { className: 'merge-source-cell' }, h('span', null, displayMergeValue(mergePreview.primary, key) || '-'), mergeEditableKeys.has(key) ? h(Button, { variant: 'outline', size: 'sm', onClick: () => useMergeSourceValue(key, displayMergeValue(mergePreview.primary, key)) }, 'Dùng') : null)),
                  h('td', null, mergeEditableKeys.has(key) ? h(Input, { value: mergePreview.mergedFields[key] || '', onChange: e => updateMergeField(key, e.target.value) }) : h('span', { className: 'muted-cell' }, displayMergeValue(mergePreview.primary, key) || displayMergeValue(mergePreview.duplicate, key) || '-')),
                  h('td', null, h('div', { className: 'merge-source-cell' }, h('span', null, displayMergeValue(mergePreview.duplicate, key) || '-'), mergeEditableKeys.has(key) ? h(Button, { variant: 'outline', size: 'sm', onClick: () => useMergeSourceValue(key, displayMergeValue(mergePreview.duplicate, key)) }, 'Dùng') : null))
                )))
              )),
              h('div', { className: 'merge-preview-actions' },
                h(Button, { variant: 'outline', onClick: () => setMergePreview(null), disabled: busy === 'merge' }, 'Hủy'),
                h(Button, { onClick: confirmMergePreview, disabled: busy === 'merge' }, busy === 'merge' ? 'Đang merge...' : 'Merge lead')
              )
            )
          )
        ) : null,
        h(LeadDrawer, { leadId: selectedLeadId, apiFetch, meta: { users: [], tags: [], customFields: [] }, onClose: () => setSelectedLeadId(''), onRefresh: duplicateState.reload })
      )
    );
  }

  function ZoomPage({ apiFetch }) {
    const { loading, error, data } = useApi('/admin/zoom/meetings', apiFetch);
    const [uuid, setUuid] = React.useState('');
    const [search, setSearch] = React.useState('');
    const [matchedOnly, setMatchedOnly] = React.useState(false);
    const [selectedLeadId, setSelectedLeadId] = React.useState('');
    const [creating, setCreating] = React.useState('');
    const [zoomSaleFilter, setZoomSaleFilter] = React.useState('');
    const [zoomSort, setZoomSort] = React.useState({ key: 'duration', dir: 'desc' });
    const detail = useApi(uuid ? `/admin/zoom/meeting-detail?uuid=${encodeURIComponent(uuid)}` : '/admin/zoom/meeting-detail?uuid=', apiFetch, [uuid, apiFetch]);
    const meetingRows = (data?.rows || []).filter(row => {
      const text = [row.topic, row.zoom_meeting_id, row.zoom_meeting_uuid].filter(Boolean).join(' ').toLowerCase();
      if (search && !text.includes(search.toLowerCase())) return false;
      if (matchedOnly && Number(row.matched_leads || row.linked_leads || 0) <= 0) return false;
      return true;
    });
    const saleName = row => row.lead?.assigned_profile?.full_name || row.lead?.assigned_profile?.email || '';
    const saleOptions = [...new Set((detail.data?.participants || []).map(saleName).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'));
    const filteredParticipants = (detail.data?.participants || []).filter(row => !zoomSaleFilter || saleName(row) === zoomSaleFilter).sort((a, b) => {
      const dir = zoomSort.dir === 'asc' ? 1 : -1;
      if (zoomSort.key === 'join_time') {
        return (new Date(a.join_time || 0).getTime() - new Date(b.join_time || 0).getTime()) * dir;
      }
      return (Number(a.duration || 0) - Number(b.duration || 0)) * dir;
    });
    function toggleZoomSort(key) {
      setZoomSort(current => current.key === key ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
    }
    const sortLabel = key => zoomSort.key === key ? (zoomSort.dir === 'asc' ? 'A-Z' : 'Z-A') : 'Sort';
    async function createLead(attendanceId) {
      setCreating(attendanceId);
      try { await apiFetch(`/admin/zoom/participants/${encodeURIComponent(attendanceId)}/create-lead`, { method: 'POST', body: JSON.stringify({}) }); detail.reload(); } finally { setCreating(''); }
    }
    return h(SectionState, { loading, error },
      h('div', { className: 'page-stack' },
        h(Card, { className: 'lead-toolbar-card' }, h(Input, { value: search, onChange: e => setSearch(e.target.value), placeholder: 'Tim meeting...' }), h('label', { className: 'inline-check' }, h('input', { type: 'checkbox', checked: matchedOnly, onChange: e => setMatchedOnly(e.target.checked) }), 'Chi meeting co lead'), h(Button, { variant: 'outline', onClick: () => { setSearch(''); setMatchedOnly(false); } }, 'Xoa loc')),
        h(DataTable, { columns: [
          { key: 'topic', label: 'Meeting' }, { key: 'zoom_meeting_id', label: 'Meeting ID' }, { key: 'start_time', label: 'Bat dau', render: r => fmtDate(r.start_time) },
          { key: 'unique_participants', label: 'Participants', numeric: true, render: r => fmt(r.unique_participants || r.participants || r.total_participants) },
          { key: 'matched_leads', label: 'Matched leads', numeric: true, render: r => fmt(r.matched_leads || r.linked_leads) },
          { key: 'detail', label: '', render: r => h(Button, { variant: 'outline', size: 'sm', onClick: () => setUuid(r.zoom_meeting_uuid) }, 'Chi tiet') },
        ], rows: meetingRows }),
        uuid ? h('div', { className: 'drawer-layer zoom-detail-layer' }, h('button', { className: 'drawer-backdrop', onClick: () => setUuid(''), 'aria-label': 'Dong' }), h('aside', { className: 'lead-drawer-react wide zoom-detail-modal' },
          h('div', { className: 'drawer-head-react' }, h('div', null, h('h2', null, detail.data?.meeting?.topic || 'Zoom detail'), h('p', null, detail.data?.meeting?.zoom_meeting_id || '')), h(Button, { variant: 'ghost', onClick: () => setUuid('') }, 'Dong')),
          h('div', { className: 'drawer-body-react' }, h(SectionState, { loading: detail.loading, error: detail.error }, h('div', { className: 'page-stack' },
            h(StatGrid, { items: [{ label: 'Participants', value: fmt(detail.data?.stats?.shown_participants), tone: 'blue' }, { label: 'Matched leads', value: fmt(detail.data?.stats?.matched_leads), tone: 'green' }, { label: 'Total duration', value: `${Math.round(Number(detail.data?.stats?.total_participant_duration || 0) / 60)}m`, tone: 'gold' }] }),
            h('div', { className: 'zoom-report-toolbar' },
              h('label', { className: 'ui-field zoom-report-filter' }, h('span', null, 'Sale'), h('select', { className: 'ui-input', value: zoomSaleFilter, onChange: e => setZoomSaleFilter(e.target.value) }, h('option', { value: '' }, 'Tat ca sale'), saleOptions.map(name => h('option', { key: name, value: name }, name)))),
              h('div', { className: 'zoom-report-sort-actions' },
                h(Button, { variant: zoomSort.key === 'join_time' ? 'default' : 'outline', size: 'sm', onClick: () => toggleZoomSort('join_time') }, `Join ${sortLabel('join_time')}`),
                h(Button, { variant: zoomSort.key === 'duration' ? 'default' : 'outline', size: 'sm', onClick: () => toggleZoomSort('duration') }, `Duration ${sortLabel('duration')}`)
              ),
              h('span', { className: 'drawer-muted zoom-report-count' }, `${fmt(filteredParticipants.length)} / ${fmt(detail.data?.participants?.length || 0)} participants`)
            ),
            h(DataTable, { columns: [
              { key: 'zoom_display_name', label: 'Participant', render: r => h('div', null, h('b', null, r.zoom_display_name || '-'), h('div', { className: 'drawer-muted' }, r.lead_email || '')) },
              { key: 'phone', label: 'Phone', render: r => r.lead_phone || r.raw?.phone || r.raw?.phone_number || '-' },
              { key: 'join_time', label: 'Join', render: r => fmtDate(r.join_time) }, { key: 'leave_time', label: 'Leave', render: r => fmtDate(r.leave_time) },
              { key: 'duration', label: 'Duration', numeric: true, render: r => `${Math.round(Number(r.duration || 0) / 60)}m` },
              { key: 'lead', label: 'Lead', render: r => r.lead ? h(Button, { variant: 'ghost', size: 'sm', onClick: () => setSelectedLeadId(r.lead.id) }, r.lead.name || r.lead.email || 'Linked') : h(Button, { variant: 'outline', size: 'sm', disabled: creating === r.id, onClick: () => createLead(r.id) }, creating === r.id ? 'Dang tao...' : 'Them lead') },
              { key: 'sale', label: 'Sale', render: r => r.lead?.assigned_profile?.full_name || r.lead?.assigned_profile?.email || '-' },
            ], rows: filteredParticipants })
          )))
        )) : null,
        h(LeadDrawer, { leadId: selectedLeadId, apiFetch, meta: { users: [], tags: [], customFields: [] }, onClose: () => setSelectedLeadId(''), onRefresh: detail.reload })
      )
    );
  }

  const ADS_VIEWS = [
    ['overview', 'Tổng quan'], ['campaigns', 'Chiến dịch'], ['adsets', 'Nhóm quảng cáo'],
    ['ads-list', 'Quảng cáo'], ['audience', 'Đối tượng'], ['creatives', 'Creative']
  ];
  const AUDIENCE_VIEWS = [
    ['age', 'Độ tuổi'], ['gender', 'Giới tính'], ['region', 'Khu vực'],
    ['device', 'Thiết bị'], ['publisher', 'Nền tảng'], ['placement_detail', 'Vị trí đặt quảng cáo']
  ];

  function AdsSubnav({ items, value, onChange }) {
    return h('div', { className: 'ads-subnav' }, items.map(([id, label]) =>
      h('button', { key: id, className: cn('ads-subnav-item', value === id && 'active'), onClick: () => onChange(id) }, label)
    ));
  }

  function AdsEntityFilters({ kind, value, onChange, count }) {
    const labels = { campaigns: 'chiến dịch', adsets: 'nhóm quảng cáo', ads: 'quảng cáo' };
    const label = labels[kind] || 'dữ liệu';
    return h(Card, { className: 'ads-entity-filters' },
      h('div', { className: 'ads-search-box' },
        h(Icon, { name: 'leads' }),
        h(Input, { type: 'search', value: value.search, placeholder: `Tìm theo tên ${label}, ID...`, onChange: e => onChange({ ...value, search: e.target.value }) })
      ),
      h('select', { className: 'ui-input ads-status-filter', value: value.status, onChange: e => onChange({ ...value, status: e.target.value }) },
        h('option', { value: '' }, 'Tất cả trạng thái'),
        h('option', { value: 'ACTIVE' }, 'Đang hoạt động'),
        h('option', { value: 'PAUSED' }, 'Tạm dừng'),
        h('option', { value: 'ARCHIVED' }, 'Đã lưu trữ')
      ),
      (value.search || value.status) ? h(Button, { variant: 'ghost', onClick: () => onChange({ search: '', status: '' }) }, 'Xóa bộ lọc') : null,
      h('span', { className: 'ads-filter-count' }, `${fmt(count)} ${label}`)
    );
  }

  function filterAdsEntities(rows, filter) {
    const query = String(filter.search || '').trim().toLowerCase();
    return (rows || []).filter(row => {
      if (filter.status && String(row.status || '').toUpperCase() !== filter.status) return false;
      if (!query) return true;
      return [row.name, row.platform_id, row.campaign_name, row.adset_name, row.objective, row.optimization_goal]
        .some(value => String(value || '').toLowerCase().includes(query));
    });
  }

  function AdsTrendChart({ rows }) {
    const canvasRef = React.useRef(null);
    React.useEffect(() => {
      if (!canvasRef.current || !window.Chart) return undefined;
      const chart = new Chart(canvasRef.current, {
        type: 'line',
        data: { labels: (rows || []).map(r => r.d), datasets: [
          { label: 'Chi tiêu', data: (rows || []).map(r => r.spend), borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,.08)', fill: true, tension: .35, yAxisID: 'money' },
          { label: 'Doanh thu', data: (rows || []).map(r => r.revenue), borderColor: '#059669', backgroundColor: 'transparent', tension: .35, yAxisID: 'money' },
          { label: 'Đăng ký', data: (rows || []).map(r => r.registrations), borderColor: '#7c3aed', borderDash: [5,4], backgroundColor: 'transparent', tension: .35, yAxisID: 'count' },
        ] },
        options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'top', align: 'end' } }, scales: {
          money: { position: 'left', ticks: { callback: value => fmtVnd(value) } },
          count: { position: 'right', grid: { drawOnChartArea: false }, ticks: { callback: value => `${value} reg` } },
          x: { grid: { display: false }, ticks: { maxTicksLimit: 12 } },
        } }
      });
      return () => chart.destroy();
    }, [rows]);
    return h(Card, { className: 'panel-card ads-trend-card' }, h('div', { className: 'panel-title' }, 'Chi tiêu & Doanh thu theo ngày'), h('div', { className: 'ads-trend-canvas' }, h('canvas', { ref: canvasRef })));
  }

  function adsPresetDates(preset) {
    const end = new Date();
    const offset = preset === 'today' ? 0 : preset === 'yesterday' ? 1 : 0;
    if (offset) end.setDate(end.getDate() - offset);
    const days = preset === '7d' ? 7 : preset === '14d' ? 14 : preset === '30d' ? 30 : 1;
    const start = new Date(end); start.setDate(end.getDate() - days + 1);
    const compareEnd = new Date(start); compareEnd.setDate(start.getDate() - 1);
    const compareStart = new Date(compareEnd); compareStart.setDate(compareEnd.getDate() - days + 1);
    const iso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    return { start: iso(start), end: iso(end), compareStart: iso(compareStart), compareEnd: iso(compareEnd) };
  }

  function metricDelta(current, previous, invert) {
    if (previous === undefined || previous === null || !Number(previous)) return null;
    const change = (Number(current || 0) - Number(previous)) * 100 / Number(previous);
    const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'neutral';
    const good = direction === 'neutral' ? null : invert ? change < 0 : change > 0;
    return h('span', { className: cn('metric-delta', good === true && 'positive', good === false && 'negative', direction === 'neutral' && 'neutral') },
      h('span', { className: 'metric-delta-arrow', 'aria-hidden': 'true' }, direction === 'up' ? '↑' : direction === 'down' ? '↓' : '→'),
      `${change > 0 ? '+' : ''}${change.toFixed(1)}%`
    );
  }

  function metricSub(detail, delta) {
    return h('span', { className: 'metric-subline' }, detail ? h('span', { className: 'metric-sub-detail' }, detail) : null, delta);
  }

  function AdsStatus({ value }) {
    const status = String(value || '').toUpperCase();
    const label = status === 'ACTIVE' ? 'Đang hoạt động' : status === 'PAUSED' ? 'Tạm dừng' : status === 'ARCHIVED' ? 'Đã lưu trữ' : status || '—';
    return h('span', { className: cn('ads-status-badge', status.toLowerCase()) }, h('span', { 'aria-hidden': 'true' }), label);
  }

  function AdsEntityTable({ kind, rows, onOpen }) {
    const common = [
      { key: 'spend', label: 'Chi tiêu', numeric: true, render: r => fmtVnd(r.spend) },
      { key: 'impressions', label: 'Hiển thị', numeric: true, render: r => fmt(r.impressions) },
      { key: 'reach', label: 'Tiếp cận', numeric: true, render: r => fmt(r.reach) },
      { key: 'frequency', label: 'Tần suất', numeric: true, render: r => Number(r.frequency || 0).toFixed(2) },
      { key: 'cpm', label: 'CPM', numeric: true, render: r => fmtVnd(r.cpm) },
      { key: 'ctr', label: 'CTR', numeric: true, render: r => Number(r.ctr || 0).toFixed(2) + '%' },
      { key: 'landing_page_views', label: 'Xem trang đích', numeric: true, render: r => fmt(r.landing_page_views) },
      { key: 'registrations', label: 'Chuyển đổi', numeric: true, render: r => fmt(r.registrations || r.purchases) },
      { key: 'cpl', label: 'CPA/CPL', numeric: true, render: r => fmtVnd(r.cpl || r.cpa) },
      { key: 'roas', label: 'ROAS', numeric: true, render: r => Number(r.roas || 0).toFixed(2) + '×' },
    ];
    const first = kind === 'campaigns'
      ? [{ key: 'name', label: 'Tên chiến dịch', render: r => h('button', { className: 'ads-drill-link', onClick: () => onOpen?.(r) }, h('b', null, r.name), h('span', null, `ID: ${r.platform_id || '-'}`)) }, { key: 'objective', label: 'Mục tiêu' }, { key: 'conversion_goal', label: 'Loại CĐ' }, { key: 'status', label: 'Trạng thái', render: r => h(AdsStatus, { value: r.status }) }]
      : kind === 'adsets'
        ? [{ key: 'name', label: 'Tên nhóm quảng cáo', render: r => h('button', { className: 'ads-drill-link', onClick: () => onOpen?.(r) }, h('b', null, r.name), h('span', null, r.platform_id || '-')) }, { key: 'campaign_name', label: 'Chiến dịch' }, { key: 'optimization_goal', label: 'Tối ưu' }, { key: 'status', label: 'Trạng thái', render: r => h(AdsStatus, { value: r.status }) }]
        : [{ key: 'name', label: 'Tên quảng cáo', render: r => h('div', { className: 'ads-name-cell' }, (r.thumbnail_url || r.image_url) ? h('img', { src: r.thumbnail_url || r.image_url, alt: '', onError: e => { if (r.image_url && e.currentTarget.src !== r.image_url) e.currentTarget.src = r.image_url; else e.currentTarget.style.display = 'none'; } }) : h('span', { className: 'ads-image-placeholder' }, 'AD'), h('div', null, h('b', null, r.name), h('div', { className: 'drawer-muted' }, r.platform_id || '-'))) }, { key: 'creative_type', label: 'Loại' }, { key: 'status', label: 'Trạng thái', render: r => h(AdsStatus, { value: r.status }) }, { key: 'quality_ranking', label: 'Quality' }];
    const action = onOpen ? [{ key: 'open', label: '', render: r => h(Button, { variant: 'outline', size: 'sm', onClick: () => onOpen(r) }, kind === 'campaigns' ? 'Xem nhóm QC' : 'Xem quảng cáo') }] : [];
    return h(DataTable, { columns: first.concat(common, action), rows });
  }

  function AdsPage({ apiFetch }) {
    const initialDates = React.useMemo(() => adsPresetDates('30d'), []);
    const [range, setRange] = React.useState({ start: initialDates.start, end: initialDates.end });
    const [compareRange, setCompareRange] = React.useState({ start: initialDates.compareStart, end: initialDates.compareEnd });
    const [preset, setPreset] = React.useState('30d');
    const [syncing, setSyncing] = React.useState('');
    const [syncMessage, setSyncMessage] = React.useState('');
    const [showCompare, setShowCompare] = React.useState(true);
    const [syncVersion, setSyncVersion] = React.useState(0);
    const [campaignFilters, setCampaignFilters] = React.useState({ search: '', status: '' });
    const [adsetFilters, setAdsetFilters] = React.useState({ search: '', status: '' });
    const [adFilters, setAdFilters] = React.useState({ search: '', status: '' });
    const autoSyncedAccounts = React.useRef(new Set());
    const [accountId, setAccountId] = React.useState('');
    const [view, setView] = React.useState('overview');
    const [audienceView, setAudienceView] = React.useState('age');
    const [campaignFilter, setCampaignFilter] = React.useState(null);
    const [adsetFilter, setAdsetFilter] = React.useState(null);
    const accounts = useApi('/ads/api/accounts', apiFetch, ['/ads/api/accounts', apiFetch]);
    React.useEffect(() => {
      if (!accountId && accounts.data?.length) setAccountId(accounts.data[0].id);
    }, [accountId, accounts.data]);
    React.useEffect(() => {
      if (!accountId || autoSyncedAccounts.current.has(accountId)) return;
      const account = (accounts.data || []).find(item => item.id === accountId);
      if (!account) return;
      autoSyncedAccounts.current.add(accountId);
      const today = new Date().toISOString().slice(0, 10);
      const lastSyncDay = account.last_synced_at ? new Date(account.last_synced_at).toISOString().slice(0, 10) : '';
      if (lastSyncDay < today) runSync('today');
    }, [accountId, accounts.data]);
    React.useEffect(() => {
      if (preset !== 'custom' || !range.start || !range.end) return;
      const start = new Date(`${range.start}T00:00:00`), end = new Date(`${range.end}T00:00:00`);
      const duration = Math.max(1, Math.round((end - start) / 86400000) + 1);
      const previousEnd = new Date(start); previousEnd.setDate(start.getDate() - 1);
      const previousStart = new Date(previousEnd); previousStart.setDate(previousEnd.getDate() - duration + 1);
      const iso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
      setCompareRange({ start: iso(previousStart), end: iso(previousEnd) });
    }, [preset, range.start, range.end]);
    const qs = buildQuery({ start: range.start, end: range.end, accountId, v: syncVersion });
    const compareQs = buildQuery({ start: compareRange.start, end: compareRange.end, accountId, v: syncVersion });
    const { loading, error, data } = useApi(`/ads/api/kpis?${qs}`, apiFetch, [`/ads/api/kpis?${qs}`, apiFetch]);
    const compare = useApi(`/ads/api/kpis?${compareQs}`, apiFetch, [`/ads/api/kpis?${compareQs}`, apiFetch]);
    const top5 = useApi(`/ads/api/top5?${qs}`, apiFetch, [`/ads/api/top5?${qs}`, apiFetch]);
    const campaigns = useApi(`/ads/api/campaigns?${qs}`, apiFetch, [`/ads/api/campaigns?${qs}`, apiFetch]);
    const daily = useApi(`/ads/api/daily?${qs}`, apiFetch, [`/ads/api/daily?${qs}`, apiFetch]);
    const age = useApi(`/ads/api/demographics?type=age&${qs}`, apiFetch, [`/ads/api/demographics?type=age&${qs}`, apiFetch]);
    const gender = useApi(`/ads/api/demographics?type=gender&${qs}`, apiFetch, [`/ads/api/demographics?type=gender&${qs}`, apiFetch]);
    const campaignRows = useApi(`/ads/api/entities/campaigns?${qs}`, apiFetch, [`/ads/api/entities/campaigns?${qs}`, apiFetch]);
    const adsetQs = buildQuery({ start: range.start, end: range.end, accountId, campaignId: campaignFilter?.id });
    const adsetRows = useApi(`/ads/api/entities/adsets?${adsetQs}`, apiFetch, [`/ads/api/entities/adsets?${adsetQs}`, apiFetch]);
    const adsQs = buildQuery({ start: range.start, end: range.end, accountId, campaignId: campaignFilter?.id, adSetId: adsetFilter?.id });
    const adRows = useApi(`/ads/api/entities/ads?${adsQs}`, apiFetch, [`/ads/api/entities/ads?${adsQs}`, apiFetch]);
    const creativeRows = useApi(`/ads/api/entities/creatives?${qs}`, apiFetch, [`/ads/api/entities/creatives?${qs}`, apiFetch]);
    const breakdown = useApi(`/ads/api/breakdowns?${buildQuery({ start: range.start, end: range.end, accountId, type: audienceView })}`, apiFetch, [range.start, range.end, accountId, audienceView, apiFetch]);
    const dailyResults = Object.fromEntries((daily.data || []).map(row => [row.d, row.results]));
    const dailySpend = Object.fromEntries((daily.data || []).map(row => [row.d, row.spend]));
    const ageResults = Object.fromEntries((age.data || []).map(row => [row.k, row.results]));
    const genderResults = Object.fromEntries((gender.data || []).map(row => [row.k, row.results]));
    const openCampaign = row => { setCampaignFilter(row); setAdsetFilter(null); setView('adsets'); };
    const openAdset = row => { setAdsetFilter(row); setView('ads-list'); };
    const entityState = (state, kind, open) => h(SectionState, { loading: state.loading, error: state.error }, h(AdsEntityTable, { kind, rows: state.data || [], onOpen: open }));
    const breakdownData = Object.fromEntries((breakdown.data || []).map(row => [row.breakdown_value, row.spend]));
    function selectPreset(value) {
      setPreset(value);
      setShowCompare(true);
      if (value === 'custom') return;
      const dates = adsPresetDates(value);
      setRange({ start: dates.start, end: dates.end });
      setCompareRange({ start: dates.compareStart, end: dates.compareEnd });
    }
    async function runSync(type) {
      if (!accountId || syncing) return;
      setSyncing(type); setSyncMessage('');
      try {
        const result = await apiFetch('/ads/api/sync', { method: 'POST', body: JSON.stringify({ accountId, type }) });
        setSyncMessage(`Sync hoàn tất ${result.rowsUpserted || 0} bản ghi · ${result.dateFrom} → ${result.dateTo}`);
        setSyncVersion(v => v + 1);
        accounts.reload();
      } catch (err) { setSyncMessage(`Sync lỗi: ${err.message || err}`); }
      finally { setSyncing(''); }
    }
    return h('div', { className: 'page-stack ads-performance-page' },
      h(Card, { className: 'toolbar-card' },
        h(Field, { label: 'Tài khoản quảng cáo' },
          h('select', { className: 'ui-input', value: accountId, onChange: e => { setAccountId(e.target.value); setCampaignFilter(null); setAdsetFilter(null); } },
            !accounts.data?.length ? h('option', { value: '' }, accounts.loading ? 'Đang tải...' : 'Tất cả tài khoản') : null,
            (accounts.data || []).map(account => h('option', { key: account.id, value: account.id }, `${account.name} · ${(account.platform || 'meta').toUpperCase()}`))
          )
        ),
        h(Field, { label: 'Khoảng thời gian' }, h('select', { className: 'ui-input', value: preset, onChange: e => selectPreset(e.target.value) },
          h('option', { value: 'today' }, 'Hôm nay'), h('option', { value: 'yesterday' }, 'Hôm qua'),
          h('option', { value: '7d' }, '7 ngày'), h('option', { value: '14d' }, '14 ngày'),
          h('option', { value: '30d' }, '30 ngày'), h('option', { value: 'custom' }, 'Tùy chỉnh'))),
        h(Field, { label: 'Từ' }, h(Input, { type: 'date', value: range.start, onChange: e => { setPreset('custom'); setRange(r => ({ ...r, start: e.target.value })); } })),
        h(Field, { label: 'Đến' }, h(Input, { type: 'date', value: range.end, onChange: e => { setPreset('custom'); setRange(r => ({ ...r, end: e.target.value })); } })),
        h('div', { className: 'ads-sync-actions' },
          h(Button, { variant: 'outline', disabled: !!syncing || !accountId, onClick: () => runSync('today') }, syncing === 'today' ? 'Đang sync...' : 'Sync hôm nay'),
          h(Button, { variant: 'outline', disabled: !!syncing || !accountId, onClick: () => runSync('incremental') }, syncing === 'incremental' ? 'Đang sync...' : 'Sync 7 ngày'),
          h(Button, { variant: 'default', disabled: !!syncing || !accountId, onClick: () => runSync('backfill') }, syncing === 'backfill' ? 'Đang sync 90 ngày...' : 'Sync 90 ngày')
        )
      ),
      syncMessage ? h('div', { className: cn('ads-sync-message', syncMessage.includes('lỗi') && 'error') }, h('span', null, syncMessage), h('button', { className: 'ads-notice-close', onClick: () => setSyncMessage(''), 'aria-label': 'Ẩn thông báo' }, '×')) : null,
      h(AdsSubnav, { items: ADS_VIEWS, value: view, onChange: next => { setView(next); if (next === 'campaigns') { setCampaignFilter(null); setAdsetFilter(null); } } }),
      view === 'overview' ? h(React.Fragment, null,
      showCompare ? h('div', { className: 'ads-compare-banner' }, h('span', null, `So sánh với kỳ trước: ${compareRange.start} → ${compareRange.end}`), h('button', { className: 'ads-notice-close', onClick: () => setShowCompare(false), 'aria-label': 'Ẩn thông báo' }, '×')) : null,
      h(SectionState, { loading, error },
        h(StatGrid, { items: [
          { label: 'Chi tiêu', value: fmtVnd(data?.spend), tone: 'orange', sub: metricSub(`CPM ${fmtVnd(data?.cpm)}`, metricDelta(data?.spend, compare.data?.spend, true)) },
          { label: 'Lượt xem trang đích', value: fmt(data?.landing_page_views), tone: 'blue', sub: metricSub(`Tần suất ${Number(data?.frequency || 0).toFixed(2)}`, metricDelta(data?.landing_page_views, compare.data?.landing_page_views)) },
          { label: 'Registration', value: fmt(data?.registrations), tone: 'green', sub: metricSub(`CPL ${fmtVnd(data?.cpl)}`, metricDelta(data?.registrations, compare.data?.registrations)) },
          { label: 'Chi phí / Lead', value: fmtVnd(data?.cpl), tone: 'gold', sub: metricSub(`Leads ${fmt(data?.registrations)}`, metricDelta(data?.cpl, compare.data?.cpl, true)) },
          { label: 'Tỷ lệ chuyển đổi', value: Number(data?.conversion_rate || 0).toFixed(2) + '%', tone: 'purple', sub: metricSub(`${fmt(data?.registrations)} reg / ${fmt(data?.landing_page_views)} views`, metricDelta(data?.conversion_rate, compare.data?.conversion_rate)) },
          { label: 'Hiển thị', value: fmt(data?.impressions), tone: 'blue', sub: metricSub(`Tiếp cận ${fmt(data?.reach)}`, metricDelta(data?.impressions, compare.data?.impressions)) },
          { label: 'CTR', value: Number(data?.ctr || 0).toFixed(2) + '%', tone: 'teal', sub: metricSub(`Clicks ${fmt(data?.link_clicks || data?.clicks)}`, metricDelta(data?.ctr, compare.data?.ctr)) },
          { label: 'CPC', value: fmtVnd(data?.cpc), tone: 'gold', sub: metricSub('', metricDelta(data?.cpc, compare.data?.cpc, true)) },
          { label: 'ROAS', value: data?.roas ? Number(data.roas).toFixed(2) + '×' : '—', tone: 'purple', sub: metricSub(`Doanh thu ${fmtVnd(data?.revenue)}`, metricDelta(data?.roas, compare.data?.roas)) },
          { label: 'Doanh thu', value: fmtVnd(data?.revenue), tone: 'green', sub: metricSub(`Purchase ${fmt(data?.purchases)}`, metricDelta(data?.revenue, compare.data?.revenue)) },
          { label: 'Lượt Purchase', value: data?.purchases ? fmt(data.purchases) : '—', tone: 'green', sub: metricSub(`CPA ${data?.purchases ? fmtVnd(data?.cpa) : '—'}`, metricDelta(data?.purchases, compare.data?.purchases)) },
        ] })
      ),
      h(AdsTrendChart, { rows: daily.data || [] }),
      h('div', { className: 'grid-2-react' },
        h(ChartPanel, { title: 'Age results', type: 'bar', data: ageResults, height: 240 }),
        h(ChartPanel, { title: 'Gender results', type: 'doughnut', data: genderResults, height: 240 }),
        h(Card, { className: 'panel-card' }, h('div', { className: 'panel-title' }, 'Top 5 CPR thấp nhất'),
          h(DataTable, { columns: [
            { key: 'ad_name', label: 'Ad' },
            { key: 'results', label: 'Results', numeric: true, render: r => fmt(r.results) },
            { key: 'cpr', label: 'CPR', numeric: true, render: r => fmtVnd(r.cpr) },
          ], rows: top5.data || [] })
        ),
        h(Card, { className: 'panel-card' }, h('div', { className: 'panel-title' }, 'Chiến dịch'),
          h(DataTable, { columns: [
            { key: 'campaign_name', label: 'Campaign' },
            { key: 'results', label: 'Results', numeric: true, render: r => fmt(r.results) },
            { key: 'cpr', label: 'CPR', numeric: true, render: r => fmtVnd(r.cpr) },
            { key: 'detail', label: '', render: r => h(Button, { variant: 'outline', size: 'sm', onClick: () => openCampaign({ id: r.campaign_id, name: r.campaign_name }) }, 'Chi tiết') },
          ], rows: campaigns.data || [] })
        )
      )) : null,
      view === 'campaigns' ? h(React.Fragment, null,
        h(AdsEntityFilters, { kind: 'campaigns', value: campaignFilters, onChange: setCampaignFilters, count: filterAdsEntities(campaignRows.data, campaignFilters).length }),
        h(SectionState, { loading: campaignRows.loading, error: campaignRows.error }, h(AdsEntityTable, { kind: 'campaigns', rows: filterAdsEntities(campaignRows.data, campaignFilters), onOpen: openCampaign }))) : null,
      view === 'adsets' ? h(React.Fragment, null,
        campaignFilter ? h('div', { className: 'ads-filter-banner' }, `Đang lọc theo chiến dịch: ${campaignFilter.name}`, h(Button, { variant: 'ghost', size: 'sm', onClick: () => setCampaignFilter(null) }, 'Xóa lọc')) : null,
        h(AdsEntityFilters, { kind: 'adsets', value: adsetFilters, onChange: setAdsetFilters, count: filterAdsEntities(adsetRows.data, adsetFilters).length }),
        h(SectionState, { loading: adsetRows.loading, error: adsetRows.error }, h(AdsEntityTable, { kind: 'adsets', rows: filterAdsEntities(adsetRows.data, adsetFilters), onOpen: openAdset }))) : null,
      view === 'ads-list' ? h(React.Fragment, null,
        (campaignFilter || adsetFilter) ? h('div', { className: 'ads-filter-banner' }, `Bộ lọc: ${adsetFilter?.name || campaignFilter?.name}`, h(Button, { variant: 'ghost', size: 'sm', onClick: () => { setCampaignFilter(null); setAdsetFilter(null); } }, 'Xóa lọc')) : null,
        h(AdsEntityFilters, { kind: 'ads', value: adFilters, onChange: setAdFilters, count: filterAdsEntities(adRows.data, adFilters).length }),
        h(SectionState, { loading: adRows.loading, error: adRows.error }, h(AdsEntityTable, { kind: 'ads', rows: filterAdsEntities(adRows.data, adFilters), onOpen: null }))) : null,
      view === 'audience' ? h(React.Fragment, null,
        h(AdsSubnav, { items: AUDIENCE_VIEWS, value: audienceView, onChange: setAudienceView }),
        h(SectionState, { loading: breakdown.loading, error: breakdown.error },
          h('div', { className: 'grid-2-react' },
            h(ChartPanel, { title: `Chi tiêu theo ${AUDIENCE_VIEWS.find(x => x[0] === audienceView)?.[1] || audienceView}`, type: ['gender','device','publisher'].includes(audienceView) ? 'doughnut' : 'bar', data: breakdownData, height: 300 }),
            h(DataTable, { columns: [
              { key: 'breakdown_value', label: AUDIENCE_VIEWS.find(x => x[0] === audienceView)?.[1] || 'Phân loại' },
              { key: 'spend', label: 'Chi tiêu', numeric: true, render: r => fmtVnd(r.spend) },
              { key: 'spend_pct', label: '% tổng', numeric: true, render: r => Number(r.spend_pct || 0).toFixed(1) + '%' },
              { key: 'impressions', label: 'Hiển thị', numeric: true, render: r => fmt(r.impressions) },
              { key: 'cpm', label: 'CPM', numeric: true, render: r => fmtVnd(r.cpm) },
              { key: 'ctr', label: 'CTR', numeric: true, render: r => Number(r.ctr || 0).toFixed(2) + '%' },
              { key: 'registrations', label: 'Chuyển đổi', numeric: true, render: r => fmt(r.registrations) },
              { key: 'cpl', label: 'CPL', numeric: true, render: r => fmtVnd(r.cpl) },
              { key: 'roas', label: 'ROAS', numeric: true, render: r => Number(r.roas || 0).toFixed(2) + '×' },
            ], rows: breakdown.data || [] })
          ))
      ) : null,
      view === 'creatives' ? h(SectionState, { loading: creativeRows.loading, error: creativeRows.error },
        h(DataTable, { columns: [
          { key: 'name', label: 'Creative', render: r => h('div', { className: 'ads-name-cell' }, (r.thumbnail_url || r.image_url) ? h('img', { src: r.thumbnail_url || r.image_url, alt: '', onError: e => { if (r.image_url && e.currentTarget.src !== r.image_url) e.currentTarget.src = r.image_url; else e.currentTarget.style.display = 'none'; } }) : h('span', { className: 'ads-image-placeholder' }, 'CR'), h('div', null, h('b', null, r.name || r.headline || 'Creative'), h('div', { className: 'drawer-muted' }, r.headline || r.platform_id || '-'))) },
          { key: 'creative_type', label: 'Loại' }, { key: 'ads_count', label: 'Số quảng cáo', numeric: true },
          { key: 'spend', label: 'Chi tiêu', numeric: true, render: r => fmtVnd(r.spend) },
          { key: 'impressions', label: 'Hiển thị', numeric: true, render: r => fmt(r.impressions) },
          { key: 'ctr', label: 'CTR', numeric: true, render: r => Number(r.ctr || 0).toFixed(2) + '%' },
          { key: 'cpm', label: 'CPM', numeric: true, render: r => fmtVnd(r.cpm) },
          { key: 'registrations', label: 'Chuyển đổi', numeric: true, render: r => fmt(r.registrations || r.purchases) },
          { key: 'cpl', label: 'CPA/CPL', numeric: true, render: r => fmtVnd(r.cpl || r.cpa) },
          { key: 'roas', label: 'ROAS', numeric: true, render: r => Number(r.roas || 0).toFixed(2) + '×' },
        ], rows: creativeRows.data || [] })) : null
    );
  }

  function CmsPage({ apiFetch }) {
    const [folder, setFolder] = React.useState('');
    const [mediaSearch, setMediaSearch] = React.useState('');
    const [typeFilter, setTypeFilter] = React.useState('');
    const [folderName, setFolderName] = React.useState('');
    const [busy, setBusy] = React.useState('');
    const [selected, setSelected] = React.useState(null);
    const [editForm, setEditForm] = React.useState(null);
    const [notice, setNotice] = React.useState('');
    const media = useApi(`/admin/cms/media${folder ? `?folder=${encodeURIComponent(folder)}` : ''}`, apiFetch, [folder, apiFetch]);
    const folders = media.data?.folders || [];
    const allMediaFiles = (media.data?.files || []).filter(file => /^(image|video)\//.test(String(file.mimetype || '')));
    const files = allMediaFiles.filter(file => {
      const matchesSearch = !mediaSearch || [file.name, file.path, file.mimetype].join(' ').toLowerCase().includes(mediaSearch.toLowerCase());
      const matchesType = !typeFilter || String(file.mimetype || '').startsWith(typeFilter + '/');
      return matchesSearch && matchesType;
    });
    const imageCount = allMediaFiles.filter(file => String(file.mimetype || '').startsWith('image/')).length;
    const videoCount = allMediaFiles.filter(file => String(file.mimetype || '').startsWith('video/')).length;
    const totalSize = allMediaFiles.reduce((sum, file) => sum + Number(file.size || 0), 0);
    const breadcrumbs = folder ? folder.split('/').map((name, index, all) => ({ name, path: all.slice(0, index + 1).join('/') })) : [];
    const formatBytes = bytes => {
      const value = Number(bytes || 0); if (!value) return '0 B';
      const units = ['B','KB','MB','GB']; const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
      return `${(value / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`;
    };
    async function uploadFile(event) {
      const selectedFiles = Array.from(event.target.files || []);
      if (!selectedFiles.length) return;
      setBusy('upload');
      try {
        for (const file of selectedFiles) {
          const form = new FormData(); form.append('file', file); form.append('folder', folder || '');
          await apiFetch('/admin/cms/media/upload', { method: 'POST', body: form });
        }
        setNotice(`Đã tải lên ${selectedFiles.length} tài nguyên`); media.reload(); event.target.value = '';
      } finally { setBusy(''); }
    }
    async function addFolder(event) {
      event.preventDefault();
      if (!folderName.trim()) return;
      setBusy('folder');
      try { await apiFetch('/admin/cms/media/folder', { method: 'POST', body: JSON.stringify({ name: folderName.trim(), parent: folder }) }); setFolderName(''); setNotice('Đã tạo thư mục'); media.reload(); } finally { setBusy(''); }
    }
    async function deleteFile(row) {
      if (!confirm(`Xoa file "${row.name}"?`)) return;
      await apiFetch('/admin/cms/media', { method: 'DELETE', body: JSON.stringify({ path: row.path }) });
      if (selected?.path === row.path) setSelected(null); setNotice('Đã xóa tài nguyên'); media.reload();
    }
    async function deleteFolder(row) {
      if (!confirm(`Xoa folder "${row.path}" va tat ca file ben trong?`)) return;
      await apiFetch('/admin/cms/media/folder', { method: 'DELETE', body: JSON.stringify({ path: row.path }) });
      setNotice('Đã xóa thư mục'); media.reload();
    }
    async function renameFolder(row) {
      const name = prompt('Tên thư mục mới', row.name); if (!name || name === row.name) return;
      setBusy(row.path);
      try { await apiFetch('/admin/cms/media/folder', { method: 'PUT', body: JSON.stringify({ path: row.path, name }) }); setNotice('Đã đổi tên thư mục'); media.reload(); } finally { setBusy(''); }
    }
    async function saveMedia(event) {
      event.preventDefault();
      setBusy('edit');
      try {
        const updated = await apiFetch('/admin/cms/media', { method: 'PUT', body: JSON.stringify({ path: editForm.path, name: editForm.name, folder: editForm.folder }) });
        setEditForm(null); setSelected(current => current?.path === editForm.path ? { ...current, ...updated } : current); setNotice('Đã cập nhật tài nguyên');
        if (editForm.folder !== folder) setSelected(null); media.reload();
      } finally { setBusy(''); }
    }
    return h('div', { className: 'page-stack cms-library-page' },
      h(StatGrid, { items: [
        { label: 'Tài nguyên', value: fmt(allMediaFiles.length), sub: folder || 'Thư mục gốc' },
        { label: 'Hình ảnh', value: fmt(imageCount) },
        { label: 'Video', value: fmt(videoCount) },
        { label: 'Dung lượng', value: formatBytes(totalSize) },
      ] }),
      notice ? h('div', { className: 'cms-notice' }, notice, h('button', { onClick: () => setNotice('') }, '×')) : null,
      h(Card, { className: 'cms-library-shell' },
        h('aside', { className: 'cms-folder-pane' },
          h('div', { className: 'cms-pane-title' }, 'Thư mục'),
          h('button', { className: cn('cms-folder-row', !folder && 'active'), onClick: () => { setFolder(''); setSelected(null); } }, h('span', null, '▣'), 'Tất cả tài nguyên'),
          folder ? h('button', { className: 'cms-folder-row', onClick: () => { setFolder(folder.includes('/') ? folder.slice(0, folder.lastIndexOf('/')) : ''); setSelected(null); } }, h('span', null, '←'), 'Thư mục cha') : null,
          folders.map(item => h('div', { className: 'cms-folder-item', key: item.path },
            h('button', { className: 'cms-folder-row', onClick: () => { setFolder(item.path); setSelected(null); } }, h('span', null, '▰'), item.name),
            h('div', { className: 'cms-folder-actions' }, h('button', { onClick: () => renameFolder(item), title: 'Đổi tên' }, '✎'), h('button', { onClick: () => deleteFolder(item), title: 'Xóa' }, '×'))
          )),
          h('form', { className: 'cms-new-folder', onSubmit: addFolder }, h(Input, { value: folderName, onChange: e => setFolderName(e.target.value), placeholder: 'Tên thư mục mới' }), h(Button, { size: 'sm', disabled: busy === 'folder' }, '+ Thêm'))
        ),
        h('main', { className: 'cms-assets-pane' },
          h('div', { className: 'cms-assets-head' },
            h('div', { className: 'cms-breadcrumbs' }, h('button', { onClick: () => setFolder('') }, 'Tài nguyên'), breadcrumbs.map(part => h(React.Fragment, { key: part.path }, h('span', null, '/'), h('button', { onClick: () => setFolder(part.path) }, part.name)))),
            h('label', { className: 'ui-button ui-button-default ui-button-default' }, busy === 'upload' ? 'Đang tải lên...' : '+ Tải tài nguyên', h('input', { type: 'file', accept: 'image/*,video/*', multiple: true, hidden: true, onChange: uploadFile }))
          ),
          h('div', { className: 'cms-toolbar' }, h(Input, { type: 'search', value: mediaSearch, onChange: e => setMediaSearch(e.target.value), placeholder: 'Tìm kiếm tên file...' }), h('select', { className: 'ui-input', value: typeFilter, onChange: e => setTypeFilter(e.target.value) }, h('option', { value: '' }, 'Tất cả định dạng'), h('option', { value: 'image' }, 'Hình ảnh'), h('option', { value: 'video' }, 'Video'))),
          h(SectionState, { loading: media.loading, error: media.error }, files.length ? h('div', { className: 'cms-assets-grid' }, files.map(file => {
            const isImage = String(file.mimetype).startsWith('image/'), isVideo = String(file.mimetype).startsWith('video/');
            return h('article', { key: file.path, className: cn('cms-asset-card', selected?.path === file.path && 'selected'), onClick: () => setSelected(file) },
              h('div', { className: 'cms-asset-thumb' }, isImage ? h('img', { src: file.url, alt: file.name, loading: 'lazy' }) : isVideo ? h('video', { src: file.url, muted: true, preload: 'metadata' }) : h('span', null, 'FILE')),
              h('div', { className: 'cms-asset-info' }, h('strong', { title: file.name }, file.name), h('span', null, `${isImage ? 'Hình ảnh' : isVideo ? 'Video' : file.mimetype} · ${formatBytes(file.size)}`)),
              h('button', { className: 'cms-asset-menu', title: 'Chỉnh sửa', onClick: event => { event.stopPropagation(); setEditForm({ ...file, folder: file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '' }); } }, '⋯')
            );
          })) : h('div', { className: 'cms-empty' }, h('strong', null, 'Chưa có tài nguyên'), h('span', null, 'Tải hình ảnh hoặc video vào thư mục này.')))
        ),
        selected ? h('aside', { className: 'cms-preview-pane' },
          h('div', { className: 'cms-pane-title' }, 'Xem trước', h('button', { onClick: () => setSelected(null) }, '×')),
          h('div', { className: 'cms-preview-stage' }, String(selected.mimetype).startsWith('image/') ? h('img', { src: selected.url, alt: selected.name }) : String(selected.mimetype).startsWith('video/') ? h('video', { src: selected.url, controls: true, preload: 'metadata' }) : null),
          h('div', { className: 'cms-preview-meta' }, h('strong', null, selected.name), h('span', null, selected.mimetype), h('span', null, formatBytes(selected.size)), h('span', null, selected.path)),
          h('div', { className: 'cms-preview-actions' }, h(Button, { variant: 'outline', onClick: () => navigator.clipboard?.writeText(selected.url) }, 'Sao chép URL'), h(Button, { variant: 'outline', onClick: () => setEditForm({ ...selected, folder: selected.path.includes('/') ? selected.path.slice(0, selected.path.lastIndexOf('/')) : '' }) }, 'Chỉnh sửa'), h(Button, { variant: 'critical', onClick: () => deleteFile(selected) }, 'Xóa'))
        ) : null
      ),
      editForm ? h('div', { className: 'drawer-layer' }, h('button', { className: 'drawer-backdrop', onClick: () => setEditForm(null), 'aria-label': 'Đóng' }),
        h('form', { className: 'lead-drawer-react cms-edit-drawer', onSubmit: saveMedia },
          h('div', { className: 'drawer-head-react' }, h('div', null, h('h2', null, 'Chỉnh sửa tài nguyên'), h('p', null, editForm.path)), h(Button, { type: 'button', variant: 'ghost', onClick: () => setEditForm(null) }, 'Đóng')),
          h('div', { className: 'drawer-body-react' },
            h('div', { className: 'cms-edit-preview' }, String(editForm.mimetype).startsWith('image/') ? h('img', { src: editForm.url, alt: '' }) : h('video', { src: editForm.url, controls: true })),
            h(Field, { label: 'Tên file' }, h(Input, { value: editForm.name, onChange: e => setEditForm(form => ({ ...form, name: e.target.value })), required: true })),
            h(Field, { label: 'Thư mục đích' }, h(Input, { value: editForm.folder, onChange: e => setEditForm(form => ({ ...form, folder: e.target.value })), placeholder: 'Để trống nếu ở thư mục gốc' })),
            h('div', { className: 'modal-actions' }, h(Button, { type: 'button', variant: 'outline', onClick: () => setEditForm(null) }, 'Hủy'), h(Button, { type: 'submit', disabled: busy === 'edit' }, busy === 'edit' ? 'Đang lưu...' : 'Lưu thay đổi'))
          )
        )
      ) : null
    );
  }

  function SettingsFormCard({ title, children }) {
    return h(Card, { className: 'panel-card' }, h('div', { className: 'panel-title' }, title), children);
  }

  function UsersSettingsPage({ apiFetch }) {
    const users = useApi('/admin/crm/users', apiFetch);
    const settings = useApi('/admin/crm/settings', apiFetch);
    const [weights, setWeights] = React.useState({});
    const [busy, setBusy] = React.useState('');
    const [adminForm, setAdminForm] = React.useState({ full_name: '', email: '', password: '', role: 'sale' });
    const [adminNotice, setAdminNotice] = React.useState('');
    React.useEffect(() => {
      const next = Object.fromEntries((settings.data?.assignment || []).map(row => [row.user_id, row.weight || 0]));
      if (Object.keys(next).length) setWeights(next);
    }, [JSON.stringify(settings.data?.assignment || [])]);
    async function saveUser(row, patch) {
      setBusy(row.user_id);
      try { await apiFetch(`/admin/crm/users/${encodeURIComponent(row.user_id)}`, { method: 'PUT', body: JSON.stringify({ ...row, ...patch }) }); users.reload(); settings.reload(); } finally { setBusy(''); }
    }
    async function saveWeights() {
      setBusy('weights');
      try { await apiFetch('/admin/crm/lead-assignment', { method: 'PUT', body: JSON.stringify({ weights }) }); settings.reload(); } finally { setBusy(''); }
    }
    async function createAdmin(event) {
      event.preventDefault(); setBusy('create-admin'); setAdminNotice('');
      try {
        await apiFetch('/admin/crm/users', { method: 'POST', body: JSON.stringify(adminForm) });
        setAdminForm({ full_name: '', email: '', password: '', role: 'sale' }); setAdminNotice(`Đã tạo nhân viên ${adminForm.role === 'admin' ? 'admin' : 'sale'}`); users.reload(); settings.reload();
      } catch (error) { setAdminNotice(error.message || 'Không tạo được nhân viên'); }
      finally { setBusy(''); }
    }
    async function deleteAdmin(row) {
      if (!confirm(`Xóa vĩnh viễn nhân viên "${row.full_name || row.email}" (${row.role})?\n\nTài khoản này sẽ bị thu hồi toàn bộ quyền truy cập admin/CRM và không thể đăng nhập lại.`)) return;
      setBusy(`delete-${row.user_id}`); setAdminNotice('');
      try {
        await apiFetch(`/admin/crm/users/${encodeURIComponent(row.user_id)}`, { method: 'DELETE' });
        setAdminNotice('Đã xóa nhân viên và thu hồi quyền truy cập'); users.reload(); settings.reload();
      } catch (error) { setAdminNotice(error.message || 'Không xóa được nhân viên'); }
      finally { setBusy(''); }
    }
    return h('div', { className: 'page-stack' },
      h(SettingsFormCard, { title: 'Thêm nhân viên' },
        h('form', { className: 'admin-create-form', onSubmit: createAdmin },
          h(Field, { label: 'Họ và tên' }, h(Input, { value: adminForm.full_name, onChange: e => setAdminForm(form => ({ ...form, full_name: e.target.value })), placeholder: 'Nguyễn Văn A', required: true })),
          h(Field, { label: 'Email đăng nhập' }, h(Input, { type: 'email', value: adminForm.email, onChange: e => setAdminForm(form => ({ ...form, email: e.target.value })), placeholder: 'admin@example.com', required: true })),
          h(Field, { label: 'Mật khẩu ban đầu' }, h(Input, { type: 'password', value: adminForm.password, onChange: e => setAdminForm(form => ({ ...form, password: e.target.value })), placeholder: 'Tối thiểu 8 ký tự', minLength: 8, required: true })),
          h(Field, { label: 'Vai trò' }, h('select', { className: 'ui-input', value: adminForm.role, onChange: e => setAdminForm(form => ({ ...form, role: e.target.value })) }, h('option', { value: 'sale' }, 'Sale'), h('option', { value: 'admin' }, 'Admin'))),
          h(Button, { disabled: busy === 'create-admin' }, busy === 'create-admin' ? 'Đang tạo...' : '+ Thêm nhân viên')
        ),
        adminNotice ? h('div', { className: 'admin-user-notice' }, h('span', null, adminNotice), h('button', { onClick: () => setAdminNotice(''), type: 'button' }, '×')) : null
      ),
      h(SectionState, { loading: users.loading, error: users.error }, h(Card, { className: 'lead-table-card' }, h(DataTable, { columns: [
        { key: 'full_name', label: 'Ten', render: r => h(Input, { defaultValue: r.full_name || '', onBlur: e => saveUser(r, { full_name: e.target.value }) }) },
        { key: 'email', label: 'Email' },
        { key: 'role', label: 'Role', render: r => h('select', { className: 'ui-input', value: r.role || 'sale', disabled: busy === r.user_id, onChange: e => saveUser(r, { role: e.target.value }) }, h('option', { value: 'sale' }, 'sale'), h('option', { value: 'admin' }, 'admin')) },
        { key: 'active', label: 'Active', render: r => h('label', { className: 'inline-check' }, h('input', { type: 'checkbox', checked: r.active !== false, disabled: busy === r.user_id, onChange: e => saveUser(r, { active: e.target.checked }) }), r.active === false ? 'Off' : 'On') },
        { key: 'actions', label: '', render: r => h(Button, { variant: 'critical', size: 'sm', disabled: busy === `delete-${r.user_id}`, onClick: () => deleteAdmin(r) }, busy === `delete-${r.user_id}` ? 'Đang xóa...' : 'Xóa nhân viên') },
      ], rows: users.data?.rows || [] }))),
      h(SectionState, { loading: settings.loading, error: settings.error }, h(SettingsFormCard, { title: 'Lead assignment weights' },
        h('div', { className: 'advanced-actions' }, h(Button, { onClick: saveWeights, disabled: busy === 'weights' }, busy === 'weights' ? 'Dang luu...' : 'Luu weights')),
        h(DataTable, { columns: [
          { key: 'full_name', label: 'Sale', render: r => r.full_name || r.email },
          { key: 'weight', label: 'Weight', render: r => h(Input, { type: 'number', value: weights[r.user_id] ?? r.weight ?? 0, onChange: e => setWeights(v => ({ ...v, [r.user_id]: Number(e.target.value || 0) })) }) },
          { key: 'assigned_count', label: 'Assigned', numeric: true, render: r => fmt(r.assigned_count) },
          { key: 'target_share', label: 'Target %', numeric: true, render: r => fmtPct(r.target_share) },
          { key: 'actual_share', label: 'Actual %', numeric: true, render: r => fmtPct(r.actual_share) },
        ], rows: settings.data?.assignment || [] })
      ))
    );
  }

  function TagsSettingsPage({ apiFetch }) {
    const state = useApi('/admin/crm/tags', apiFetch);
    const [cat, setCat] = React.useState({ name: '' });
    const [tag, setTag] = React.useState({ name: '', category_id: '' });
    const [busy, setBusy] = React.useState('');
    const categories = state.data?.categories || [];
    const tags = state.data?.tags || [];
    function reloadAll() { state.reload(); }
    function countTagsInCategory(category) {
      return tags.filter(item => item.category_id === category.id || item.category_name === category.name).length;
    }
    async function addCategory(event) {
      event.preventDefault(); setBusy('cat');
      try { await apiFetch('/admin/crm/tag-categories', { method: 'POST', body: JSON.stringify({ ...cat, color: '#008060' }) }); setCat({ name: '' }); reloadAll(); } finally { setBusy(''); }
    }
    async function addTag(event) {
      event.preventDefault(); setBusy('tag');
      try { await apiFetch('/admin/crm/tags', { method: 'POST', body: JSON.stringify({ ...tag, color: '#008060', description: '', active: true }) }); setTag({ name: '', category_id: '' }); reloadAll(); } finally { setBusy(''); }
    }
    async function removeTag(row) {
      if (!confirm(`Xoa tag "${row.name}"?`)) return;
      await apiFetch(`/admin/crm/tags/${encodeURIComponent(row.id)}`, { method: 'DELETE' });
      reloadAll();
    }
    async function removeCategory(row) {
      if (!confirm(`Xoa category "${row.name}"?`)) return;
      await apiFetch(`/admin/crm/tag-categories/${encodeURIComponent(row.id)}`, { method: 'DELETE' });
      reloadAll();
    }
    return h('div', { className: 'page-stack' },
      h(SectionState, { loading: state.loading, error: state.error }, h(Card, { className: 'tags-simple-card polaris-data-card' },
        h('div', { className: 'polaris-card-head tags-simple-head' }, h('div', null, h('h3', null, 'Danh mục tag'), h('p', null, `${fmt(categories.length)} danh mục`))),
        h('form', { className: 'tags-simple-form', onSubmit: addCategory },
          h(Input, { value: cat.name, onChange: e => setCat({ name: e.target.value }), placeholder: 'Tên danh mục tag', required: true }),
          h(Button, { disabled: busy === 'cat' }, busy === 'cat' ? 'Đang lưu...' : 'Thêm danh mục')
        ),
        h(DataTable, { columns: [
          { key: 'id', label: 'ID', render: r => h('span', { className: 'muted-cell mono' }, r.id) },
          { key: 'name', label: 'Danh mục' },
          { key: 'tag_count', label: 'Số lượng tag', numeric: true, render: r => fmt(countTagsInCategory(r)) },
          { key: 'actions', label: '', render: r => h(Button, { variant: 'critical', size: 'sm', onClick: () => removeCategory(r) }, 'Xóa') },
        ], rows: categories, empty: 'Chưa có danh mục tag.' })
      )),
      h(SectionState, { loading: state.loading, error: state.error }, h(Card, { className: 'tags-simple-card polaris-data-card' },
        h('div', { className: 'polaris-card-head tags-simple-head' }, h('div', null, h('h3', null, 'Tag'), h('p', null, `${fmt(tags.length)} tag`))),
        h('form', { className: 'tags-simple-form tags-simple-form-3', onSubmit: addTag },
          h(Input, { value: tag.name, onChange: e => setTag(f => ({ ...f, name: e.target.value })), placeholder: 'Tên tag', required: true }),
          h('select', { className: 'ui-input', value: tag.category_id, onChange: e => setTag(f => ({ ...f, category_id: e.target.value })) }, h('option', { value: '' }, 'Không có danh mục'), categories.map(c => h('option', { key: c.id, value: c.id }, c.name))),
          h(Button, { disabled: busy === 'tag' }, busy === 'tag' ? 'Đang lưu...' : 'Thêm tag')
        ),
        h(DataTable, { columns: [
          { key: 'id', label: 'ID', render: r => h('span', { className: 'muted-cell mono' }, r.id) },
          { key: 'name', label: 'Tag' },
          { key: 'category_name', label: 'Danh mục', render: r => r.category_name || 'Không có danh mục' },
          { key: 'people_count', label: 'Số lượng lead', numeric: true, render: r => fmt(r.people_count) },
          { key: 'actions', label: '', render: r => h(Button, { variant: 'critical', size: 'sm', onClick: () => removeTag(r) }, 'Xóa') },
        ], rows: tags, empty: 'Chưa có tag phù hợp.' })
      ))
    );
  }

  function CustomFieldsSettingsPage({ apiFetch }) {
    const state = useApi('/admin/crm/settings', apiFetch);
    const [form, setForm] = React.useState({ label: '', key: '', type: 'text', group_name: 'Khac', options: '', required: false, default_value: '' });
    const [busy, setBusy] = React.useState('');
    async function add(event) {
      event.preventDefault(); setBusy('field');
      const payload = { ...form, options: String(form.options || '').split(',').map(x => x.trim()).filter(Boolean) };
      try { await apiFetch('/admin/crm/custom-fields', { method: 'POST', body: JSON.stringify(payload) }); setForm({ label: '', key: '', type: 'text', group_name: 'Khac', options: '', required: false, default_value: '' }); state.reload(); } finally { setBusy(''); }
    }
    async function remove(row) {
      const key = prompt(`Nhap key "${row.key}" de xoa`);
      if (key !== row.key) return;
      await apiFetch(`/admin/crm/custom-fields/${encodeURIComponent(row.id)}?confirm=${encodeURIComponent(key)}`, { method: 'DELETE' });
      state.reload();
    }
    const rows = state.data?.customFields || [];
    return h(SectionState, { loading: state.loading, error: state.error }, h('div', { className: 'settings-custom-layout' },
      h(Card, { className: 'lead-table-card custom-field-table polaris-data-card settings-custom-list' },
        h('div', { className: 'polaris-card-head custom-field-head' }, h('div', null, h('h3', null, 'Custom fields'), h('p', null, `${fmt(rows.filter(r => r.active !== false).length)} field đang hoạt động`))),
        h(DataTable, { columns: [
          { key: 'label', label: 'Label' },
          { key: 'key', label: 'Key', render: r => h('span', { className: 'polaris-badge neutral mono' }, r.key) },
          { key: 'type', label: 'Type', render: r => h('span', { className: 'polaris-badge info' }, r.type) },
          { key: 'group_name', label: 'Group' },
          { key: 'required', label: 'Required', render: r => r.required ? h('span', { className: 'polaris-badge critical' }, 'Required') : '—' },
          { key: 'options', label: 'Options', render: r => (r.options || []).join(', ') || '—' },
          { key: 'actions', label: '', render: r => h(Button, { variant: 'critical', size: 'sm', onClick: () => remove(r) }, 'Xoa') },
        ], rows })
      ),
      h(Card, { className: 'custom-field-card polaris-data-card settings-custom-form-card' },
        h('div', { className: 'polaris-card-head custom-field-head' }, h('div', null, h('h3', null, 'Tạo custom field'))),
        h('form', { className: 'settings-side-form', onSubmit: add },
          h(Input, { value: form.label, onChange: e => setForm(f => ({ ...f, label: e.target.value })), placeholder: 'Label', required: true }),
          h(Input, { value: form.key, onChange: e => setForm(f => ({ ...f, key: e.target.value })), placeholder: 'Key (unique)', required: true }),
          h('select', { className: 'ui-input', value: form.type, onChange: e => setForm(f => ({ ...f, type: e.target.value })) }, ['text', 'textarea', 'number', 'currency', 'date', 'boolean', 'dropdown', 'multiselect'].map(type => h('option', { key: type, value: type }, type))),
          h(Input, { value: form.group_name, onChange: e => setForm(f => ({ ...f, group_name: e.target.value })), placeholder: 'Group name' }),
          h(Input, { value: form.default_value, onChange: e => setForm(f => ({ ...f, default_value: e.target.value })), placeholder: 'Default value' }),
          h(Input, { value: form.options, onChange: e => setForm(f => ({ ...f, options: e.target.value })), placeholder: 'Options (a, b, c)' }),
          h('label', { className: 'inline-check' }, h('input', { type: 'checkbox', checked: form.required, onChange: e => setForm(f => ({ ...f, required: e.target.checked })) }), 'Required'),
          h(Button, { disabled: busy === 'field' }, busy === 'field' ? 'Đang tạo...' : '+ Tạo field')
        )
      )
    ));
  }

  function ConnectorSettingsPage({ apiFetch }) {
    const status = useApi('/admin/zoom/status', apiFetch);
    const sync = useApi('/admin/zoom/sync-status', apiFetch);
    const [busy, setBusy] = React.useState('');
    const [actionError, setActionError] = React.useState('');
    const statusData = status.data || {};
    const syncData = sync.data || statusData.sync_job || {};
    const lastSync = statusData.last_sync || {};
    const logs = (syncData.logs || statusData.sync_job?.logs || []).slice(-8).reverse();
    const isServerToServer = statusData.auth_type === 'server_to_server';
    const isConnected = !!statusData.connected;
    async function connect() {
      setActionError('');
      if (isServerToServer) return;
      try {
        const data = await apiFetch('/admin/zoom/auth-url');
        if (data?.url) window.open(data.url, '_blank', 'noopener');
      } catch (err) {
        setActionError(err.message || 'Không mở được Zoom OAuth.');
      }
    }
    async function startSync() {
      setBusy('sync'); setActionError('');
      try { await apiFetch('/admin/zoom/sync', { method: 'POST', body: JSON.stringify({}) }); sync.reload(); status.reload(); } catch (err) { setActionError(err.message || 'Không start sync được.'); } finally { setBusy(''); }
    }
    return h('div', { className: 'page-stack' },
      actionError ? h(Card, { className: 'state-card state-error' }, actionError) : null,
      h(SectionState, { loading: status.loading, error: status.error }, h(Card, { className: 'connector-card polaris-data-card' },
        h('div', { className: 'polaris-card-head' }, h('div', null, h('h3', null, 'Zoom connector'), h('p', null, isServerToServer ? 'Server-to-Server OAuth đã cấu hình qua biến môi trường, không cần OAuth popup.' : 'Kết nối Zoom OAuth để lấy dữ liệu meeting và participant.')),
          h('div', { className: 'advanced-actions' },
            h(Button, { onClick: connect, disabled: isServerToServer || isConnected }, isServerToServer || isConnected ? 'Connected' : 'Connect Zoom'),
            h(Button, { variant: 'outline', onClick: startSync, disabled: busy === 'sync' || syncData.running }, busy === 'sync' || syncData.running ? 'Đang sync...' : 'Start sync')
          )
        ),
        h('div', { className: 'connector-status-grid' },
          h('div', { className: 'connector-status-item' }, h('span', null, 'Connection'), h('strong', { className: isConnected ? 'ok' : 'bad' }, isConnected ? 'Connected' : 'Disconnected')),
          h('div', { className: 'connector-status-item' }, h('span', null, 'Auth type'), h('strong', null, statusData.auth_type || '-')),
          h('div', { className: 'connector-status-item' }, h('span', null, 'Configured'), h('strong', { className: statusData.configured ? 'ok' : 'bad' }, statusData.configured ? 'Yes' : 'No')),
          h('div', { className: 'connector-status-item' }, h('span', null, 'Last sync'), h('strong', null, lastSync.synced_at ? fmtDate(lastSync.synced_at) : '-'))
        )
      )),
      h(SectionState, { loading: sync.loading, error: sync.error }, h(Card, { className: 'connector-card polaris-data-card' },
        h('div', { className: 'polaris-card-head' }, h('div', null, h('h3', null, 'Sync status'), h('p', null, syncData.stage || 'Chưa chạy sync.'))),
        h('div', { className: 'connector-status-grid' },
          h('div', { className: 'connector-status-item' }, h('span', null, 'Status'), h('strong', { className: syncData.status === 'completed' ? 'ok' : syncData.status === 'failed' ? 'bad' : '' }, syncData.status || 'idle')),
          h('div', { className: 'connector-status-item' }, h('span', null, 'Meetings'), h('strong', null, fmt(syncData.meetings_scanned || lastSync.meetings_scanned))),
          h('div', { className: 'connector-status-item' }, h('span', null, 'Participants'), h('strong', null, fmt(syncData.participants_scanned || lastSync.participants_scanned))),
          h('div', { className: 'connector-status-item' }, h('span', null, 'Matched'), h('strong', null, fmt(syncData.participants_matched || lastSync.participants_matched))),
          h('div', { className: 'connector-status-item' }, h('span', null, 'Leads updated'), h('strong', null, fmt(syncData.leads_updated || lastSync.leads_updated))),
          h('div', { className: 'connector-status-item' }, h('span', null, 'Finished'), h('strong', null, syncData.finished_at ? fmtDate(syncData.finished_at) : '-'))
        ),
        logs.length ? h('div', { className: 'connector-log-list' }, logs.map((log, index) => h('div', { key: `${log.at || index}-${index}`, className: 'connector-log-row' }, h('span', null, fmtDate(log.at)), h('strong', { className: log.level === 'success' ? 'ok' : log.level === 'error' ? 'bad' : '' }, log.level || 'info'), h('p', null, log.message || '-')))) : h('div', { className: 'empty-note' }, 'Chưa có log sync.')
      ))
    );
  }

  function WebinarSettingsPage({ apiFetch }) {
    const state = useApi('/admin/crm/webinar-settings', apiFetch);
    const empty = {
      enabled: false,
      api_key: '',
      webinar_id: '',
      schedule: '',
      timezone: 'GMT+7',
      timezone_id: '',
      date: '',
      phone_country_code: '+84',
      twilio_consent: false,
      require_phone: false,
      join_url_type: 'live_room_url',
    };
    const [form, setForm] = React.useState(empty);
    const [busy, setBusy] = React.useState(false);
    const [saved, setSaved] = React.useState('');
    const [error, setError] = React.useState('');
    React.useEffect(() => {
      if (state.data?.settings) setForm(current => ({ ...current, ...state.data.settings }));
    }, [JSON.stringify(state.data?.settings || {})]);
    function update(patch) {
      setSaved('');
      setError('');
      setForm(current => ({ ...current, ...patch }));
    }
    async function save(event) {
      event.preventDefault();
      setBusy(true);
      setSaved('');
      setError('');
      try {
        const data = await apiFetch('/admin/crm/webinar-settings', { method: 'PUT', body: JSON.stringify(form) });
        setForm(current => ({ ...current, ...(data.settings || {}) }));
        setSaved('Đã lưu cấu hình EverWebinar.');
        state.reload();
      } catch (err) {
        setError(err.message || 'Không lưu được cấu hình EverWebinar.');
      } finally {
        setBusy(false);
      }
    }
    return h(SectionState, { loading: state.loading, error: state.error },
      h('div', { className: 'page-stack' },
        h(Card, { className: 'custom-field-card polaris-data-card settings-webinar-card' },
          h('div', { className: 'polaris-card-head custom-field-head' }, h('div', null,
            h('h3', null, 'EverWebinar registration'),
            h('p', null, form.configured ? 'Đã đủ cấu hình tối thiểu để tạo link vào học.' : 'Cần API key, Webinar ID và Schedule ID trước khi bật form webinar.')
          )),
          h('form', { className: 'settings-side-form webinar-settings-form', onSubmit: save },
            h('label', { className: 'inline-check' }, h('input', { type: 'checkbox', checked: !!form.enabled, onChange: e => update({ enabled: e.target.checked }) }), 'Bật tạo link EverWebinar sau khi đăng ký'),
            h('div', { className: 'detail-grid-react' },
              h(Field, { label: 'API key' }, h(Input, { value: form.api_key || '', onChange: e => update({ api_key: e.target.value }), placeholder: 'Dán API key hoặc giữ ******** để không đổi', autoComplete: 'off' })),
              h(Field, { label: 'Webinar ID' }, h(Input, { value: form.webinar_id || '', onChange: e => update({ webinar_id: e.target.value }), placeholder: 'Ví dụ: 8', required: !!form.enabled })),
              h(Field, { label: 'Schedule ID' }, h(Input, { value: form.schedule || '', onChange: e => update({ schedule: e.target.value }), placeholder: 'Ví dụ: 27', required: !!form.enabled })),
              h(Field, { label: 'Timezone' }, h(Input, { value: form.timezone || '', onChange: e => update({ timezone: e.target.value }), placeholder: 'GMT+7' })),
              h(Field, { label: 'Timezone ID' }, h(Input, { value: form.timezone_id || '', onChange: e => update({ timezone_id: e.target.value }), placeholder: 'Chỉ cần nếu EverWebinar yêu cầu' })),
              h(Field, { label: 'Date' }, h(Input, { value: form.date || '', onChange: e => update({ date: e.target.value }), placeholder: '2026-07-22 20:00, bỏ trống nếu dùng schedule evergreen' })),
              h(Field, { label: 'Phone country code' }, h(Input, { value: form.phone_country_code || '', onChange: e => update({ phone_country_code: e.target.value }), placeholder: '+84' })),
              h(Field, { label: 'Link trả về' }, h('select', { className: 'ui-input', value: form.join_url_type || 'live_room_url', onChange: e => update({ join_url_type: e.target.value }) },
                h('option', { value: 'live_room_url' }, 'Live room URL'),
                h('option', { value: 'thank_you_url' }, 'Thank you URL'),
                h('option', { value: 'replay_room_url' }, 'Replay room URL')
              ))
            ),
            h('div', { className: 'advanced-actions' },
              h('label', { className: 'inline-check' }, h('input', { type: 'checkbox', checked: !!form.require_phone, onChange: e => update({ require_phone: e.target.checked }) }), 'Webinar yêu cầu số điện thoại'),
              h('label', { className: 'inline-check' }, h('input', { type: 'checkbox', checked: !!form.twilio_consent, onChange: e => update({ twilio_consent: e.target.checked }) }), 'Twilio consent')
            ),
            saved ? h('div', { className: 'form-hint' }, saved) : null,
            error ? h('div', { className: 'error-text' }, error) : null,
            h(Button, { disabled: busy }, busy ? 'Đang lưu...' : 'Lưu cấu hình Webinar')
          )
        ),
        h(Card, { className: 'panel-card' },
          h('div', { className: 'panel-title' }, 'Các khâu thiết lập cần làm'),
          h('div', { className: 'settings-guide-list' },
            h('p', null, '1. Trong WebinarJam/EverWebinar, vào Profile > API, xin duyệt API key cho tài khoản trả phí.'),
            h('p', null, '2. Trong EverWebinar, lấy Webinar ID từ webinar đã publish. Có thể dùng API /everwebinar/webinars để kiểm tra danh sách webinar.'),
            h('p', null, '3. Vào Schedules > Webinar schedule, lấy Session number và nhập vào Schedule ID. Nếu chọn một session cụ thể trong chuỗi, nhập thêm Date đúng định dạng yyyy-mm-dd hh:mm.'),
            h('p', null, '4. Nếu webinar dùng múi giờ người học, nhập timezone dạng GMT+7. Nếu hệ thống yêu cầu timezone_id cho bang Texas, nhập 2 hoặc 3 theo tài liệu EverWebinar.'),
            h('p', null, '5. Trên form landing page, hệ thống gửi name, email, phone sang EverWebinar. API trả về link riêng, trang cảm ơn sẽ hiển thị và nút vào học mở link đó.')
          )
        )
      )
    );
  }

  function WebhooksSettingsPage({ apiFetch }) {
    const state = useApi('/admin/webhooks', apiFetch);
    const [form, setForm] = React.useState({ name: '', url: '', active: true });
    const [busy, setBusy] = React.useState('');
    const rows = Array.isArray(state.data) ? state.data : (state.data?.rows || state.data?.webhooks || []);
    async function add(event) {
      event.preventDefault(); setBusy('create');
      try { await apiFetch('/admin/webhooks', { method: 'POST', body: JSON.stringify(form) }); setForm({ name: '', url: '', active: true }); state.reload(); } finally { setBusy(''); }
    }
    async function update(row, patch) {
      setBusy(row.id);
      try { await apiFetch(`/admin/webhooks/${encodeURIComponent(row.id)}`, { method: 'PUT', body: JSON.stringify({ ...row, ...patch }) }); state.reload(); } finally { setBusy(''); }
    }
    async function test(row) {
      setBusy(`test-${row.id}`);
      try { await apiFetch(`/admin/webhooks/${encodeURIComponent(row.id)}/test`, { method: 'POST', body: JSON.stringify({}) }); state.reload(); } finally { setBusy(''); }
    }
    async function remove(row) {
      if (!confirm(`Xoa webhook "${row.name}"?`)) return;
      await apiFetch(`/admin/webhooks/${encodeURIComponent(row.id)}`, { method: 'DELETE' });
      state.reload();
    }
    return h('div', { className: 'page-stack' },
      h(SettingsFormCard, { title: 'Add webhook' }, h('form', { className: 'settings-form', onSubmit: add }, h(Input, { value: form.name, onChange: e => setForm(f => ({ ...f, name: e.target.value })), placeholder: 'Name', required: true }), h(Input, { value: form.url, onChange: e => setForm(f => ({ ...f, url: e.target.value })), placeholder: 'https://...', required: true }), h('label', { className: 'inline-check' }, h('input', { type: 'checkbox', checked: form.active, onChange: e => setForm(f => ({ ...f, active: e.target.checked })) }), 'Active'), h(Button, { disabled: busy === 'create' }, 'Them'))),
      h(SectionState, { loading: state.loading, error: state.error }, h(Card, { className: 'lead-table-card' }, h(DataTable, { columns: [
        { key: 'name', label: 'Webhook' }, { key: 'url', label: 'URL' }, { key: 'active', label: 'Active', render: r => h('label', { className: 'inline-check' }, h('input', { type: 'checkbox', checked: r.active !== false, disabled: busy === r.id, onChange: e => update(r, { active: e.target.checked }) }), r.active === false ? 'Off' : 'On') }, { key: 'last_status', label: 'Last status' }, { key: 'last_error', label: 'Last error' }, { key: 'actions', label: '', render: r => h('div', { className: 'row-actions' }, h(Button, { variant: 'outline', size: 'sm', disabled: busy === `test-${r.id}`, onClick: () => test(r) }, 'Test'), h(Button, { variant: 'critical', size: 'sm', onClick: () => remove(r) }, 'Xoa')) },
      ], rows })))
    );
  }

  function ScoringSettingsPage({ apiFetch }) {
    const state = useApi('/admin/crm/scoring-rules', apiFetch);
    const [rules, setRules] = React.useState([]);
    const [saving, setSaving] = React.useState(false);
    React.useEffect(() => setRules(state.data?.rules || []), [JSON.stringify(state.data?.rules || [])]);
    function update(index, patch) { setRules(current => current.map((rule, i) => i === index ? { ...rule, ...patch } : rule)); }
    async function save() {
      setSaving(true);
      try { await apiFetch('/admin/crm/scoring-rules', { method: 'PUT', body: JSON.stringify({ rules }) }); state.reload(); } finally { setSaving(false); }
    }
    return h(SectionState, { loading: state.loading, error: state.error }, h(SettingsFormCard, { title: 'Lead scoring rules' },
      h('div', { className: 'advanced-actions' }, h(Button, { variant: 'outline', onClick: () => setRules(r => [...r, { field: 'channel', operator: 'contains', value: '', points: 1, active: true }]) }, '+ Rule'), h(Button, { onClick: save, disabled: saving }, saving ? 'Dang luu...' : 'Luu rules')),
      h('div', { className: 'filter-list' }, rules.map((rule, index) => h('div', { className: 'filter-row scoring-row', key: rule.id || index }, h(Input, { value: rule.field || '', onChange: e => update(index, { field: e.target.value }), placeholder: 'field' }), h('select', { className: 'ui-input', value: rule.operator || 'contains', onChange: e => update(index, { operator: e.target.value }) }, ['contains', 'not_contains', 'equals', 'not_equals', 'exists', 'empty', 'gt', 'gte', 'lt', 'lte'].map(op => h('option', { key: op, value: op }, op))), h(Input, { value: rule.value || '', onChange: e => update(index, { value: e.target.value }), placeholder: 'value' }), h(Input, { type: 'number', value: rule.points || 0, onChange: e => update(index, { points: Number(e.target.value || 0) }) }), h(Button, { variant: 'critical', onClick: () => setRules(current => current.filter((_, i) => i !== index)) }, 'Xoa'))))
    ));
  }

  function SettingsPage({ id, apiFetch }) {
    const settingTabs = [
      ['connector', 'Connector'],
      ['users', 'Phân quyền'],
      ['tags', 'Quản lý tag'],
      ['custom-fields', 'Custom fields'],
      ['scoring', 'Scoring'],
      ['webinar-settings', 'Webinar'],
      ['webhooks', 'Webhook'],
    ];
    function openSetting(nextId) {
      const path = pathForModule(nextId);
      if (location.pathname !== path) history.pushState({ module: nextId }, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
    let content = null;
    if (id === 'users') content = h(UsersSettingsPage, { apiFetch });
    else if (id === 'tags') content = h(TagsSettingsPage, { apiFetch });
    else if (id === 'custom-fields') content = h(CustomFieldsSettingsPage, { apiFetch });
    else if (id === 'scoring') content = h(ScoringSettingsPage, { apiFetch });
    else if (id === 'connector') content = h(ConnectorSettingsPage, { apiFetch });
    else if (id === 'webinar-settings') content = h(WebinarSettingsPage, { apiFetch });
    else if (id === 'webhooks') content = h(WebhooksSettingsPage, { apiFetch });
    if (content) return h('div', { className: 'settings-hub' },
      h('div', { className: 'settings-tabs' }, settingTabs.map(([key, label]) => h('button', { key, className: cn(id === key && 'active'), onClick: () => openSetting(key) }, label))),
      content
    );
    const path = id === 'users' ? '/admin/crm/users' : id === 'webhooks' ? '/admin/webhooks' : id === 'connector' ? '/admin/zoom/status' : '/admin/crm/settings';
    const { loading, error, data } = useApi(path, apiFetch, [path, apiFetch]);
    if (id === 'users') {
      return h(SectionState, { loading, error }, h(DataTable, { columns: [
        { key: 'full_name', label: 'Tên' },
        { key: 'email', label: 'Email' },
        { key: 'role', label: 'Role' },
        { key: 'active', label: 'Active', render: r => r.active === false ? 'No' : 'Yes' },
      ], rows: data?.rows || [] }));
    }
    if (id === 'webhooks') {
      const rows = data?.rows || data?.webhooks || [];
      return h(SectionState, { loading, error }, h(DataTable, { columns: [
        { key: 'name', label: 'Webhook' },
        { key: 'url', label: 'URL' },
        { key: 'active', label: 'Active', render: r => r.active === false ? 'No' : 'Yes' },
        { key: 'last_status', label: 'Last status' },
      ], rows }));
    }
    if (id === 'connector') {
      return h(SectionState, { loading, error }, h(Card, { className: 'panel-card' },
        h('div', { className: 'panel-title' }, 'Zoom connector'),
        h('pre', { className: 'json-pre' }, JSON.stringify(data || {}, null, 2))
      ));
    }
    return h(SectionState, { loading, error },
      h('div', { className: 'grid-2-react' },
        h(Bars, { title: 'Tags', data: Object.fromEntries((data?.tags || []).map(t => [t.name, t.people_count || 0])) }),
        h(DataTable, { columns: [
          { key: 'name', label: 'Tag' },
          { key: 'category_name', label: 'Category' },
          { key: 'people_count', label: 'People', numeric: true, render: r => fmt(r.people_count) },
        ], rows: data?.tags || [] })
      )
    );
  }

  function AdsReportPage() {
    return h('div', { className: 'mini-panel' }, h(Card, { className: 'mini-card' },
      h('h2', null, 'Ads Report App'),
      h('p', null, 'Module này đã được thay bằng màn Ads Performance React. Nếu cần dashboard chuyên sâu Next.js, mở app ads-report riêng.'),
      h('div', { style: { marginTop: '14px' } }, h(Button, { variant: 'outline', onClick: () => window.open('/ads', '_blank', 'noopener') }, h(Icon, { name: 'external' }), 'Mở dashboard ads cũ'))
    ));
  }

  function RenderModule({ id, apiFetch, currentUser }) {
    if (ANALYTICS_VIEWS.has(id)) return h(AnalyticsPage, { view: id, apiFetch });
    if (id === 'funnels') return h(FunnelDashboard, { apiFetch });
    if (id === 'leads') return h(LeadsPage, { apiFetch, currentUser });
    if (id === 'survey') return h(SurveyPage, { apiFetch });
    if (id === 'duplicates') return h(DuplicatesPage, { apiFetch });
    if (id === 'zoom') return h(ZoomPage, { apiFetch });
    if (id === 'ads') return h(AdsPage, { apiFetch });
    if (id === 'ads-report') return h(AdsReportPage);
    if (id === 'cms') return h(CmsPage, { apiFetch });
    if (['connector', 'users', 'tags', 'custom-fields', 'scoring', 'webhooks', 'webinar-settings'].includes(id)) return h(SettingsPage, { id, apiFetch });
    return h(AnalyticsPage, { view: 'overview', apiFetch });
  }

  function App() {
    const savedTheme = localStorage.getItem('crmTheme') || 'dark';
    const [theme, setTheme] = React.useState(savedTheme);
    const [loading, setLoading] = React.useState(true);
    const [session, setSession] = React.useState(null);
    const [user, setUser] = React.useState(null);
    const [error, setError] = React.useState('');
    const [activeModule, setActiveModule] = React.useState(getModuleFromPath());
    const [sidebarCollapsed, setSidebarCollapsed] = React.useState(() => localStorage.getItem('adminSidebarCollapsed') === '1');
    const [email, setEmail] = React.useState('');
    const [password, setPassword] = React.useState('');
    const [googleEnabled, setGoogleEnabled] = React.useState(false);

    React.useEffect(() => { applyTheme(theme); }, [theme]);

    const apiFetch = React.useCallback(async (path, options = {}) => {
      const headers = new Headers(options.headers || {});
      if (session?.access_token && path.startsWith('/admin/')) headers.set('Authorization', `Bearer ${session.access_token}`);
      if (options.body && !headers.has('Content-Type') && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
      const res = await fetch(path, { ...options, headers, credentials: 'include', cache: 'no-store' });
      const text = await res.text();
      const payload = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : {};
      if (!res.ok) throw new Error(payload?.detail || payload?.error || `HTTP ${res.status}`);
      return payload;
    }, [session?.access_token]);

    React.useEffect(() => {
      let mounted = true;
      async function boot() {
        try {
          const cfgRes = await fetch('/admin/auth/config', { cache: 'no-store' });
          const cfg = await cfgRes.json();
          if (!mounted) return;
          setGoogleEnabled(!!cfg.googleEnabled);

          const params = new URLSearchParams(location.search);
          const googleError = params.get('google_error');
          if (googleError) {
            setError(googleError);
            params.delete('google_error');
            const qs = params.toString();
            history.replaceState(null, '', location.pathname + (qs ? `?${qs}` : ''));
          }

          const hashMatch = /(?:^|#)access_token=([^&]+)/.exec(location.hash);
          if (hashMatch) {
            history.replaceState(null, '', location.pathname + location.search);
            const accessToken = decodeURIComponent(hashMatch[1]);
            try {
              await finishLogin({ access_token: accessToken, refresh_token: '' }, null);
              return;
            } catch (err) {
              if (mounted) setError(err.message || 'Đăng nhập Google thất bại.');
              return;
            }
          }

          if (!mounted) return;
          const cookieMe = await fetch('/admin/auth/me', { cache: 'no-store', credentials: 'include' }).catch(() => null);
          if (cookieMe?.ok) {
            const me = await cookieMe.json();
            setUser(me.user);
            setSession({ access_token: '', refresh_token: '', from_cookie: true });
          }
        } catch (err) {
          if (mounted) setError(err.message || 'Không khởi động được admin.');
        } finally {
          if (mounted) setLoading(false);
        }
      }
      boot();
      return () => { mounted = false; };
    }, []);

    React.useEffect(() => {
      const onPop = () => setActiveModule(getModuleFromPath());
      window.addEventListener('popstate', onPop);
      return () => window.removeEventListener('popstate', onPop);
    }, []);

    async function finishLogin(nextSession) {
      setError('');
      const meRes = await fetch('/admin/auth/me', { cache: 'no-store', headers: { Authorization: `Bearer ${nextSession.access_token}` } });
      if (!meRes.ok) {
        setSession(null);
        setUser(null);
        throw new Error('Tài khoản chưa được cấp quyền CRM.');
      }
      const me = await meRes.json();
      setSession(nextSession);
      setUser(me.user);
    }

    async function login(event) {
      event.preventDefault();
      setError('');
      try {
        const res = await fetch('/admin/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim(), password }) });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) return setError(payload.detail || payload.error || 'Đăng nhập thất bại.');
        setSession(payload.session);
        setUser(payload.user);
      } catch (err) {
        setError(err.message || 'Đăng nhập thất bại.');
      }
    }

    async function logout() {
      setSession(null);
      setUser(null);
      location.href = '/admin';
    }

    function toggleSidebar() {
      setSidebarCollapsed(current => {
        const next = !current;
        localStorage.setItem('adminSidebarCollapsed', next ? '1' : '0');
        return next;
      });
    }

    function openModule(moduleId) {
      const moduleItem = MODULE_BY_ID[moduleId] || MODULE_BY_ID[DEFAULT_MODULE];
      if (moduleItem.adminOnly && user?.role !== 'admin') return;
      setActiveModule(moduleItem.id);
      const path = pathForModule(moduleItem.id);
      if (location.pathname !== path) history.pushState({ module: moduleItem.id }, '', path);
    }

    if (loading) {
      return h('div', { className: 'loading-screen' }, h(Card, { className: 'loading-card' }, h('div', { className: 'loading-dot' }), h('div', null, 'Đang khởi động Vinmoc Admin...')));
    }

    if (!session || !user) {
      return h('div', { className: 'auth-screen' },
        h(Card, { className: 'auth-card' },
          h('div', { className: 'auth-mark' }, h(Icon, { name: 'home' })),
          h('div', { className: 'auth-header' }, h('h1', null, 'Vinmoc Admin'), h('p', null, 'Đăng nhập một lần để quản lý CRM, Ads và CMS trong cùng admin.')),
          h('form', { onSubmit: login, className: 'auth-form' },
            h(Field, { label: 'Email' }, h(Input, { type: 'email', autoComplete: 'email', value: email, onChange: e => setEmail(e.target.value), required: true, placeholder: 'you@company.com' })),
            h(Field, { label: 'Mật khẩu' }, h(Input, { type: 'password', autoComplete: 'current-password', value: password, onChange: e => setPassword(e.target.value), required: true, placeholder: 'Nhập mật khẩu' })),
            error ? h('div', { className: 'error-text' }, error) : h('div', { className: 'form-hint' }, 'Dùng tài khoản đã được cấp quyền trong CRM.'),
            h(Button, { variant: 'default', type: 'submit', className: 'auth-submit' }, 'Đăng nhập')
          ),
          googleEnabled ? h(React.Fragment, null,
            h('div', { className: 'auth-divider' }, h('span', null, 'hoặc')),
            h(Button, {
              type: 'button',
              variant: 'outline',
              className: 'auth-submit auth-google-btn',
              onClick: () => { location.href = '/admin/auth/google'; },
            },
              h('svg', { width: 18, height: 18, viewBox: '0 0 18 18', 'aria-hidden': 'true' },
                h('path', { fill: '#4285F4', d: 'M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.13-.84 2.09-1.8 2.73v2.27h2.91c1.7-1.57 2.69-3.88 2.69-6.64z' }),
                h('path', { fill: '#34A853', d: 'M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.27c-.8.54-1.84.86-3.05.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.34C2.44 15.98 5.48 18 9 18z' }),
                h('path', { fill: '#FBBC05', d: 'M3.95 10.69A5.4 5.4 0 013.68 9c0-.59.1-1.16.27-1.69V4.97H.96A9 9 0 000 9c0 1.45.35 2.83.96 4.03l2.99-2.34z' }),
                h('path', { fill: '#EA4335', d: 'M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0 5.48 0 2.44 2.02.96 4.97l2.99 2.34C4.66 5.17 6.65 3.58 9 3.58z' })
              ),
              'Đăng nhập bằng Google'
            )
          ) : null
        )
      );
    }

    const activeItem = MODULE_BY_ID[activeModule] || MODULE_BY_ID[DEFAULT_MODULE];
    const isAdmin = user.role === 'admin';
    const activeGroup = ADMIN_MODULES.find(group => group.items.some(item => item.id === activeItem.id))?.group || 'Admin';
    const isSettingsView = activeGroup === 'Settings';
    const pageTitle = isSettingsView ? 'Cài đặt' : activeItem.label;
    const pageSubtitle = isSettingsView ? 'Cấu hình hệ thống, quyền và tích hợp.' : activeItem.subtitle;

    return h('div', { className: cn('admin-shell', sidebarCollapsed && 'sidebar-collapsed') },
      h('aside', { className: 'shell-sidebar' },
        h('div', { className: 'brand' },
          h('div', { className: 'brand-logo' }, 'V'),
          h('div', { className: 'brand-copy' }, h('div', { className: 'brand-title' }, 'Vinmoc Admin'), h('div', { className: 'brand-sub' })),
          h('button', { className: 'sidebar-toggle', onClick: toggleSidebar, title: sidebarCollapsed ? 'Mở menu' : 'Thu gọn menu', 'aria-label': sidebarCollapsed ? 'Mở menu' : 'Thu gọn menu' }, h(Icon, { name: 'leads' }))
        ),
        h('nav', { className: 'sidebar-scroll' }, ADMIN_MODULES.map(group => h('section', { key: group.group, className: 'nav-section' },
          h('div', { className: 'nav-group-label' }, group.group),
          h('div', { className: 'nav-list' }, group.items.map(item => h('button', { key: item.id, className: cn('nav-item', activeItem.id === item.id && 'active'), disabled: item.adminOnly && !isAdmin, onClick: () => openModule(item.id), title: item.subtitle },
            h('span', { className: 'nav-icon' }, h(Icon, { name: item.icon })),
            h('span', { className: 'nav-label' }, item.label),
            item.adminOnly ? h(Badge, { variant: isAdmin ? 'outline' : 'muted' }, 'admin') : null
          ))
          )
        ))),
        h(Card, { className: 'account-card', title: 'Click để đăng xuất', onClick: logout },
          h('div', { className: 'account-row' },
            h('div', { className: 'avatar' }, (user.full_name || user.email || 'A').slice(0, 1).toUpperCase()),
            h('div', { className: 'account-meta' }, h('strong', null, user.full_name || 'Admin'), h('span', null, user.email)),
            h('span', { className: 'account-chevron' }, '⌄')
          )
        )
      ),
      h('main', { className: 'shell-main' },
        h('header', { className: 'topbar' },
          h('div', { className: 'topbar-left' },
            h('button', { className: 'topbar-sidebar-toggle', onClick: toggleSidebar, title: sidebarCollapsed ? 'Mở menu' : 'Thu gọn menu', 'aria-label': sidebarCollapsed ? 'Mở menu' : 'Thu gọn menu' }, h(Icon, { name: 'leads' }))
          ),
          h('div', { className: 'topbar-actions' },
            h('div', { className: 'role-pill' }, h('span', null, 'Vai trò:'), h('strong', null, isAdmin ? 'Admin' : 'Sale')),
            h(Button, { variant: 'outline', type: 'button', onClick: () => location.reload() }, h(Icon, { name: 'refresh' }), 'Làm mới')
          )
        ),
        h('div', { className: cn('page-header-react', activeItem.id === 'leads' && 'leads-page-header-compact') },
          h('div', { className: 'title-block' },
            h('div', { className: 'breadcrumb' }, h('span', null, activeGroup), h('span', null, '/'), h('span', null, activeItem.label)),
            activeItem.id === 'leads' ? null : h(React.Fragment, null, h('div', { className: 'title-row' }, h('h1', null, pageTitle)), h('p', null, pageSubtitle))
          )
        ),
        h('section', { className: 'content-frame react-content' },
          activeItem.adminOnly && !isAdmin
            ? h('div', { className: 'mini-panel' }, h(Card, { className: 'mini-card' }, h('h2', null, 'Bạn chưa có quyền admin'), h('p', null, 'Mục này chỉ dành cho tài khoản admin.')))
            : h(RenderModule, { id: activeItem.id, apiFetch, currentUser: user })
        )
      )
    );
  }

  ReactDOM.createRoot(document.getElementById('root')).render(h(App));
})();
