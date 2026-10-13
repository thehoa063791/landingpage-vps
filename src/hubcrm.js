// HubCRM (hubcrm.vn), the main CRM that n8n writes leads into. Read-only customer lookup.
// GET /user/customer?name=<text> is a substring search over customer fields (an `email`
// parameter is ignored), so results are filtered to an exact, case-insensitive email.
const PAGE_SIZE = 50;
const MAX_PAGES = 3;

function config() {
  return {
    url: String(process.env.HUBCRM_API_URL || 'https://hubcrm.vn/sys/v1').replace(/\/$/, ''),
    appId: process.env.HUBCRM_APP_ID || '',
    xAppId: process.env.HUBCRM_X_APP_ID || '',
    timeoutMs: Number(process.env.HUBCRM_TIMEOUT_MS || 4000),
  };
}
const configured = () => { const cfg = config(); return !!(cfg.appId && cfg.xAppId); };

async function findCustomerByEmail(email, { fetchImpl = fetch } = {}) {
  const cfg = config();
  const wanted = String(email || '').trim().toLowerCase();
  if (!cfg.appId || !cfg.xAppId || !wanted) return null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await fetchImpl(`${cfg.url}/user/customer?${new URLSearchParams({ name: wanted, size: String(PAGE_SIZE), page: String(page) })}`, {
      headers: { 'APP-ID': cfg.appId, 'X-App-Id': cfg.xAppId, Accept: 'application/json' },
      signal: AbortSignal.timeout(cfg.timeoutMs),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.success) throw new Error(`HubCRM lookup failed: HTTP ${response.status} ${body?.errorCode || ''}`.trim());
    const rows = body.data?.content || [];
    const match = rows.find(row => String(row.email || '').trim().toLowerCase() === wanted);
    if (match) return { id: String(match.id), name: String(match.username || '').trim(), email: wanted, phone: String(match.phone || '').trim(), status: match.status || '' };
    if (body.data?.last !== false || !rows.length) return null;
  }
  return null;
}

module.exports = { configured, findCustomerByEmail };
