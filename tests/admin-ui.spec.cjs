const { test, expect } = require('@playwright/test');
const lead = { id: 'lead-demo', name: 'Nguyễn Minh Anh', phone: '0901234567', email: 'minhanh@example.test', page_id: 'dongtien', channel: 'facebook', registered_at: '2026-10-05T01:00:00Z', assigned_name: 'Trần Linh', assigned_to: 'sale-1', notes: [], tags: [], custom_fields: [{ id: 'budget', label: 'Ngân sách', type: 'currency', value: 1000000 }, { id: 'topics', label: 'Chủ đề', type: 'multiselect', options: ['Đầu tư', 'Tài chính'], value: [] }], orders: [], zoom_attendances: [] };
const users = [{ user_id: 'sale-1', full_name: 'Trần Linh', email: 'linh@example.test', role: 'sale', active: true }];
async function fixtures(page, role = 'admin') {
  const writes = [];
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (/\.(js|css|woff2)$/.test(url.pathname)) return route.continue();
    if (!/\/admin\/(auth|api|leads|crm|zoom|survey|campaign|prosperity|cms|webhooks)|\/ads\/api/.test(url.pathname)) return route.continue();
    if (request.method() !== 'GET') writes.push({ path: url.pathname, method: request.method(), body: request.postDataJSON() });
    let body = {};
    if (url.pathname.endsWith('/auth/config')) body = { googleEnabled: true };
    else if (url.pathname.endsWith('/auth/me')) body = { user: { id: 'demo', full_name: 'Quản trị viên', email: 'admin@example.test', role } };
    else if (url.pathname === '/admin/leads') body = { rows: [lead], total: 1 };
    else if (url.pathname === '/admin/leads/lead-demo') body = lead;
    else if (url.pathname.endsWith('/summary')) body = { score: 15, score_matches: 2 };
    else if (url.pathname.endsWith('/crm/users')) body = { rows: users };
    else if (url.pathname.endsWith('/crm/tags')) body = { tags: [{ id: 'tag-1', name: 'Quan tâm', category_name: 'Chăm sóc' }], categories: [] };
    else if (url.pathname.endsWith('/custom-fields')) body = { rows: lead.custom_fields, customFields: lead.custom_fields };
    else if (url.pathname.endsWith('/accounts') || url.pathname.startsWith('/ads/api/') && /daily|campaigns|adsets|ads$|creatives|breakdown|demographics/.test(url.pathname)) body = [];
    else if (url.pathname.startsWith('/admin/api/')) body = { stats: { pageviews: 1200, conversions: 48, conversionRate: 4, ctaClicks: 180, formOpens: 90 }, regByDay: { '2026-10-03': 8, '2026-10-04': 12, '2026-10-05': 18 }, trafficChannel: { Facebook: 700, Direct: 300, Google: 200 }, scrollDepth: { 25: 900, 75: 500, 90: 200 }, timeOnPage: { 30: 800, 60: 500 } };
    else if (url.pathname.includes('/media')) body = { folders: [], files: [] };
    else if (url.pathname.endsWith('/scoring-rules')) body = { rules: [] };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  return writes;
}

test('lead flow, accessible select, local columns, detail, money and confirmation', async ({ page }) => {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  const writes = await fixtures(page);
  await page.goto('/admin/view/leads');
  await expect(page.getByRole('heading', { name: 'Danh sách lead', exact: true }).first()).toBeVisible();
  await expect(page.locator('.react-table')).toContainText(lead.name);
  await page.screenshot({ path: 'test-results/admin-leads-light.png', fullPage: true });
  const assignee = page.locator('.lead-assignee-select');
  await assignee.click();
  await page.getByRole('option', { name: 'Trần Linh' }).click();
  await expect(page.locator('.filter-pills')).toContainText('Trần Linh');
  await page.getByRole('button', { name: 'Xóa bộ lọc', exact: true }).click();
  await page.getByRole('button', { name: /Tùy chỉnh cột/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('.react-table tbody tr').first().click();
  await expect(page).toHaveURL(/lead=lead-demo/);
  await expect(page.locator('.lead-detail-page')).toBeVisible();
  await page.screenshot({ path: 'test-results/admin-lead-detail.png', fullPage: true });
  await page.getByRole('button', { name: 'Trường tùy chỉnh', exact: true }).click();
  await page.locator('.money-input input').fill('2.500.000,5');
  await expect(page.locator('.save-bar')).toBeVisible();
  await page.getByRole('button', { name: 'Quay lại danh sách', exact: true }).click();
  await page.getByRole('button', { name: 'Hủy', exact: true }).click();
  await expect(page.locator('.lead-detail-page')).toBeVisible();
  await page.locator('.save-bar').getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect.poll(() => writes.find(w => w.path.endsWith('/custom-fields'))?.body?.values?.budget).toBe('2500000.5');
  await expect(page.locator('.ui-toast')).toContainText('Đã lưu');
  await page.getByRole('button', { name: 'Xóa lead', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hủy', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Hủy', exact: true }).click();
  expect(writes.filter(w => w.method === 'DELETE')).toHaveLength(0);
  expect(errors).toEqual([]);
});

test('all admin modules render in both themes without runtime errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  await fixtures(page);
  const modules = ['view/overview', 'view/leads', 'view/duplicates', 'view/zoom', 'view/funnels', 'tools/ads', 'tools/cms', 'settings/connector', 'settings/users', 'settings/tags', 'settings/custom-fields', 'settings/scoring', 'settings/webinar-settings', 'settings/webhooks'];
  for (const theme of ['light', 'dark']) {
    await page.addInitScript(t => localStorage.setItem('crmTheme', t), theme);
    for (const module of modules) {
      await page.goto(`/admin/${module}`);
      await expect(page.locator('.shell-main')).toBeVisible();
      await expect(page.locator('.page-header-react h1')).toBeVisible();
      await page.waitForTimeout(200);
      expect(errors, `${theme}/${module}: runtime errors`).toEqual([]);
      expect(await page.locator('.react-content .ui-button-default:visible').count(), `${module}: multiple primary actions`).toBeLessThanOrEqual(1);
      expect(await page.locator('body').evaluate(el => el.scrollWidth <= innerWidth), `${module}: viewport overflow`).toBe(true);
    }
    await page.goto('/admin/view/overview');
    await expect(page.locator('.recharts-surface').first()).toBeVisible();
    await page.screenshot({ path: `test-results/admin-overview-${theme}.png`, fullPage: true });
  }
  expect(errors).toEqual([]);
});

test('server errors remain visible and destructive confirmation sends exactly one write', async ({ page }) => {
  const writes = await fixtures(page);
  await page.goto('/admin/view/leads');
  await page.locator('.react-table tbody tr').click();
  await page.getByRole('button', { name: 'Xóa lead', exact: true }).click();
  await page.getByRole('button', { name: 'Xóa', exact: true }).click();
  await expect.poll(() => writes.filter(w => w.method === 'DELETE').length).toBe(1);
  await expect(page.locator('.lead-detail-page')).toHaveCount(0);
  await expect(page.locator('.ui-toast')).toContainText('Đã xóa');
  await page.route('**/admin/leads?*', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Máy chủ tạm thời không khả dụng' }) }));
  await page.locator('.leads-header-actions').getByRole('button', { name: 'Làm mới', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Máy chủ tạm thời không khả dụng');
});

test('sale sees no destructive lead controls and admin-only pages stay protected', async ({ page }) => {
  await fixtures(page, 'sale');
  await page.goto('/admin/view/leads');
  await expect(page.getByRole('button', { name: 'Xóa lead', exact: true })).toHaveCount(0);
  await page.locator('.react-table tbody tr').click();
  await expect(page.getByRole('button', { name: 'Xóa lead', exact: true })).toHaveCount(0);
  await page.goto('/admin/settings/users');
  await expect(page.getByText('Bạn chưa có quyền admin')).toBeVisible();
});

test('browser-only demo has populated screens and a single sidebar scroll direction', async ({ page }) => {
  const errors = [], apiRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/\/admin\/(auth|api|leads|crm|zoom|survey|cms|webhooks|funnels)(\/|\?|$)|\/ads\/api/.test(new URL(request.url()).pathname)) apiRequests.push(request.url()); });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/admin/view/overview?demo=1');
  await expect(page.locator('.demo-banner')).toBeVisible();
  await expect(page.locator('.stat-value-react').first()).not.toHaveText('0');
  await expect(page.locator('.recharts-surface').first()).toBeVisible();
  expect(await page.locator('.sidebar-scroll').evaluate(el => ({ noHorizontal: el.scrollWidth <= el.clientWidth, overflowX: getComputedStyle(el).overflowX, overflowY: getComputedStyle(el).overflowY }))).toEqual({ noHorizontal: true, overflowX: 'hidden', overflowY: 'auto' });
  await page.screenshot({ path: 'test-results/admin-demo-overview.png', fullPage: true });
  await page.locator('.sidebar-scroll .nav-item').last().scrollIntoViewIfNeeded();
  await expect(page.locator('.sidebar-scroll .nav-item').last()).toBeVisible();
  await expect(page.locator('.account-card')).toBeInViewport();
  await page.getByRole('button', { name: 'Chuyển giao diện tối', exact: true }).click();
  await page.screenshot({ path: 'test-results/admin-demo-dark.png', fullPage: true });
  const modules = ['view/duplicates', 'view/zoom', 'view/funnels', 'tools/ads', 'tools/cms', 'settings/connector', 'settings/users', 'settings/tags', 'settings/custom-fields', 'settings/scoring', 'settings/webinar-settings', 'settings/webhooks'];
  for (const module of modules) {
    await page.goto(`/admin/${module}`);
    await expect(page.locator('.page-header-react h1')).toBeVisible();
    await expect(page.locator('.skeleton')).toHaveCount(0);
    expect(errors, module).toEqual([]);
  }
  await page.goto('/admin/view/leads');
  await expect(page.locator('.react-table tbody tr')).toHaveCount(24);
  await page.screenshot({ path: 'test-results/admin-demo-leads.png', fullPage: true });
  await page.locator('.react-table tbody tr').first().click();
  await expect(page.locator('.lead-detail-page')).toBeVisible();
  await page.getByRole('button', { name: 'Trường tùy chỉnh', exact: true }).click();
  await page.locator('.money-input input').fill('2.500.000');
  await page.locator('.save-bar').getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.locator('.ui-toast')).toContainText('demo');
  await expect(page.locator('.money-input input')).toHaveValue('2.500.000');
  await page.getByRole('button', { name: 'Khảo sát', exact: true }).click();
  await expect(page.locator('.lead-detail-page')).toContainText('Quản lý dòng tiền tốt hơn');
  expect(apiRequests).toEqual([]);
  expect(errors).toEqual([]);
  await page.getByRole('button', { name: 'Thoát demo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Xem dữ liệu demo', exact: true })).toBeVisible();
  await expect(page.locator('.demo-banner')).toHaveCount(0);
});

test('analytics and list pages share width; traffic demo responds to page and date filters', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const bounds = [];
  for (const route of ['view/overview', 'view/funnels', 'view/leads', 'settings/tags', 'settings/connector', 'settings/webinar-settings']) {
    await page.goto(`/admin/${route}?demo=1`);
    await expect(page.locator('.page-header-react h1')).toBeVisible();
    bounds.push(await page.locator('.react-content').boundingBox());
    const header = await page.locator('.page-header-react').boundingBox();
    expect(header.x).toBe(bounds.at(-1).x);
    expect(header.width).toBe(bounds.at(-1).width);
  }
  expect(new Set(bounds.map(b => `${b.x}:${b.width}`)).size).toBe(1);
  await page.goto('/admin/view/overview?demo=1');
  await expect(page.locator('.panel-title').getByText('Lượt xem trang theo ngày', { exact: true })).toBeVisible();
  await expect(page.locator('.panel-title').getByText('Lượt xem theo landing page', { exact: true })).toBeVisible();
  const allViews = await page.locator('.stat-value-react').first().textContent();
  await page.getByPlaceholder('Tất cả page').fill('trading');
  await expect(page.locator('.stat-value-react').first()).not.toHaveText(allViews);
  const pageViews = await page.locator('.stat-value-react').first().textContent();
  await page.locator('.analytics-toolbar-card').getByRole('combobox').click();
  await page.getByRole('option', { name: '7 ngày qua', exact: true }).click();
  await expect(page.locator('.stat-value-react').first()).not.toHaveText(pageViews);
  await page.screenshot({ path: 'test-results/admin-traffic-width.png', fullPage: true });
});

test('funnel detail separates scoped analytics without a survey tab', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/admin/view/funnels?demo=1');
  const dashboard = page.locator('.nav-section').first();
  await expect(dashboard.locator('.nav-item')).toHaveCount(2);
  await page.locator('.funnel-row').first().click();
  await expect(page).toHaveURL(/funnel=trading/);
  await expect(page.getByRole('tab', { name: 'Khảo sát', exact: true })).toHaveCount(0);
  for (const tab of ['Traffic', 'Hành vi', 'Thiết bị & địa lý']) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    await expect(page.getByRole('tab', { name: tab, exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.analytics-toolbar-card')).toHaveCount(0);
    await expect(page.locator('.react-content .panel-card').first()).toBeVisible();
    expect(errors).toEqual([]);
  }
  await page.getByRole('tab', { name: 'Traffic', exact: true }).click();
  const views = await page.locator('.stat-value-react').first().textContent();
  await page.locator('.funnel-date-range input').first().fill(new Date().toISOString().slice(0, 10));
  await expect(page.locator('.stat-value-react').first()).not.toHaveText(views);
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Traffic', exact: true })).toHaveAttribute('aria-selected', 'true');
  expect(errors).toEqual([]);
});

test('status colors and chart series retain semantic colors in both themes', async ({ page }) => {
  for (const theme of ['light', 'dark']) {
    await page.addInitScript(t => localStorage.setItem('crmTheme', t), theme);
    await page.goto('/admin/tools/ads?demo=1');
    await expect(page.locator('.chart-legend').first()).toContainText('Doanh thu');
    await page.screenshot({ path: `test-results/admin-colors-${theme}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Chiến dịch', exact: true }).click();
    await expect(page.locator('.ads-status-badge.active').first()).toBeVisible();
    for (const [status, tone] of [['active', 'success'], ['paused', 'warning']]) {
      const correct = await page.locator(`.ads-status-badge.${status}`).first().evaluate((el, tone) => {
        const probe = document.createElement('span'); probe.style.color = `var(--${tone}-text)`; probe.style.background = `var(--${tone}-surface)`; el.append(probe);
        const actual = getComputedStyle(el), expected = getComputedStyle(probe);
        const matches = actual.color === expected.color && actual.backgroundColor === expected.backgroundColor;
        probe.remove(); return matches;
      }, tone);
      expect(correct).toBe(true);
    }
  }
});
