// Email existence check through Debounce (debounce.io), server side only: the private API
// key (DEBOUNCE_API_KEY) must never reach the browser. A "public_" key only works in
// Debounce's browser widget, so it is ignored here. Results are cached for a day to save
// credits, and any failure lets the visitor through: an outage never blocks a sign-up.
const API_URL = 'https://api.debounce.io/v1/';
const CACHE_MS = 24 * 3600 * 1000;
// Debounce result codes: 1 syntax error, 2 spam trap, 3 disposable, 6 invalid → rejected.
// 4 accept-all, 5 deliverable, 7 unknown, 8 role (info@...) → accepted.
const REJECTED = { 1: 'syntax', 2: 'spam_trap', 3: 'disposable', 6: 'invalid' };

function createEmailValidator({ fetchImpl = fetch, apiKey = () => process.env.DEBOUNCE_API_KEY || '', timeoutMs = Number(process.env.DEBOUNCE_TIMEOUT_MS || 5000) } = {}) {
  const cache = new Map();
  const usable = key => !!key && !/^public_/i.test(key);
  async function verify(email) {
    const key = apiKey();
    if (!usable(key)) return { ok: true, skipped: true };
    // Reserved test domains (RFC 2606) are used by automated tests: no credit spent.
    if (/\.(?:invalid|test|example|localhost)$/i.test(email)) return { ok: true, skipped: true };
    const cached = cache.get(email);
    if (cached && cached.until > Date.now()) return cached.result;
    let result;
    try {
      const response = await fetchImpl(`${API_URL}?${new URLSearchParams({ api: key, email })}`, { signal: AbortSignal.timeout(timeoutMs) });
      const body = await response.json().catch(() => null);
      const data = body?.debounce;
      if (!response.ok || String(body?.success) !== '1' || !data?.code) throw new Error(data?.error || `HTTP ${response.status}`);
      const reason = REJECTED[Number(data.code)];
      const suggestion = String(data.did_you_mean || '').trim().toLowerCase();
      result = reason ? { ok: false, reason, suggestion: suggestion && suggestion !== email ? suggestion : '' } : { ok: true, result: data.result || '' };
    } catch (error) {
      console.warn('[email-validation] Debounce unavailable, accepting the email:', error.message);
      return { ok: true, skipped: true };
    }
    cache.set(email, { result, until: Date.now() + CACHE_MS });
    if (cache.size > 5000) cache.delete(cache.keys().next().value);
    return result;
  }
  return { verify };
}

const MESSAGES = {
  syntax: 'Email không đúng định dạng.',
  invalid: 'Email này không tồn tại hoặc không nhận được thư.',
  disposable: 'Vui lòng dùng email thật, không dùng email tạm thời.',
  spam_trap: 'Email này không dùng được. Vui lòng nhập email khác.',
};
// With a suggestion the address is most likely mistyped (Debounce flags gmial.com as disposable).
const message = check => check.suggestion
  ? `Email có vẻ bị gõ nhầm. Có phải ý bạn là ${check.suggestion}?`
  : `${MESSAGES[check.reason] || MESSAGES.invalid} Vui lòng kiểm tra lại.`;

let instance;
const getEmailValidator = () => instance || (instance = createEmailValidator());

// Sign-up forms: an email already in the CRM is known to exist, so only new emails are
// checked (one credit each). Returns null when the email is accepted.
async function rejection(email, { registrations = [], validator = getEmailValidator() } = {}) {
  const key = String(email || '').trim().toLowerCase();
  if (registrations.some(row => String(row.email || '').trim().toLowerCase() === key)) return null;
  const check = await validator.verify(key);
  return check.ok ? null : { message: message(check), suggestion: check.suggestion || '' };
}

module.exports = { createEmailValidator, getEmailValidator, message, rejection };
