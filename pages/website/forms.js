'use strict';
// Forms of the pages kept from the WordPress site (pages/website, added by
// scripts/mirror-wp-pages.cjs). They register through /api/register like every funnel:
// - /cashching: the LadiPage form (name, email, phone) — LadiPage's own submit is stopped;
// - /loinhuan: the "YES, ..." buttons open the Thrive Leads form, rebuilt here (its
//   WordPress popup cannot load without WordPress), then go to /thank-you-webinar.
(() => {
  const slug = location.pathname.replace(/\/+$/, '').split('/').pop();
  const PAGE_IDS = { cashching: 'cashching', loinhuan: 'loinhuan' };
  const pageId = PAGE_IDS[slug];
  if (!pageId) return;

  // Attribution as the other funnels send it: UTM and click IDs of this visit (or the
  // last campaign in this tab), Meta cookies, a session ID.
  const memory = {};
  const get = key => { try { return sessionStorage.getItem(key) || memory[key] || ''; } catch { return memory[key] || ''; } };
  const set = (key, value) => { memory[key] = value; try { sessionStorage.setItem(key, value); } catch {} };
  const uuid = () => window.crypto?.randomUUID?.() || 'evt_' + Date.now().toString(36) + Math.random().toString(36).slice(2);
  const cookie = name => { try { const e = document.cookie.split('; ').find(i => i.startsWith(name + '=')); return e ? decodeURIComponent(e.slice(name.length + 1)) : ''; } catch { return ''; } };
  const query = new URLSearchParams(location.search);
  const KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid', 'ttclid', 'msclkid', 'twclid'];
  const newCampaign = KEYS.some(k => query.has(k));
  const attribution = {};
  for (const k of KEYS) { attribution[k] = query.get(k) || (newCampaign ? '' : get('website_' + k)); set('website_' + k, attribution[k]); }
  attribution.referrer = (newCampaign ? document.referrer : get('website_referrer') || document.referrer) || '';
  set('website_referrer', attribution.referrer);
  const sessionId = get('website_session') || uuid();
  set('website_session', sessionId);
  const context = () => {
    let fbc = cookie('_fbc');
    if (!fbc && attribution.fbclid) fbc = `fb.1.${Date.now()}.${attribution.fbclid}`;
    return { ...attribution, session_id: sessionId, fbc, fbp: cookie('_fbp'), ga: cookie('_ga'), event_source_url: location.href };
  };

  async function register(fields) {
    const res = await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...context(), ...fields, page_id: pageId }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) throw new Error(data.suggestion ? `${data.message} Có phải ý bạn là ${data.suggestion}?` : data.message || 'Chưa gửi được đăng ký. Vui lòng thử lại.');
    // A repeat (same email, same page) is not a new lead: no conversion for GTM.
    if (!data.duplicate) {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: 'generate_lead', page_id: pageId, event_id: data.event_id || '' });
    }
    return data;
  }
  const phoneOk = value => /^\d{9,11}$/.test(String(value || '').replace(/\D/g, ''));
  const emailOk = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

  const style = document.createElement('style');
  style.textContent = `
.wf-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483000;max-width:min(420px,calc(100% - 32px));padding:12px 16px;border-radius:10px;background:#1f2937;color:#fff;font:15px/1.45 'Open Sans',Arial,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.3);text-align:center}
.wf-toast.wf-error{background:#b91c1c}
.wf-modal{position:fixed;inset:0;z-index:2147482000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.72);overflow-y:auto}
.wf-modal[hidden]{display:none}
.wf-card{position:relative;width:min(520px,100%);margin:auto;padding:28px 24px 22px;border-radius:14px;background:#fff;color:#1f2937;font:15px/1.5 'Open Sans',Arial,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.4)}
.wf-close{position:absolute;top:8px;right:10px;width:36px;height:36px;border:0;background:none;font-size:26px;line-height:1;color:#6b7280;cursor:pointer}
.wf-card h2{margin:0 24px 4px 0;font-size:19px;line-height:1.35;font-weight:800;color:#111827;text-transform:uppercase}
.wf-card .wf-sub{margin:0 0 14px;color:#4b5563;font-size:14px}
.wf-card input[type=text],.wf-card input[type=email],.wf-card input[type=tel]{display:block;width:100%;box-sizing:border-box;margin:0 0 10px;padding:11px 12px;border:1px solid #d1d5db;border-radius:8px;font:inherit;color:inherit;background:#fff}
.wf-card input:focus{outline:2px solid #f5a623;outline-offset:1px;border-color:#f5a623}
.wf-card fieldset{margin:4px 0 10px;padding:0;border:0}
.wf-card legend{margin-bottom:6px;font-weight:700;font-size:14px}
.wf-card label.wf-radio{display:flex;align-items:center;gap:8px;padding:5px 0;font-size:14px;cursor:pointer}
.wf-card label.wf-radio input{width:17px;height:17px;margin:0;accent-color:#f5a623}
.wf-card .wf-radios-2{display:grid;grid-template-columns:1fr 1fr;column-gap:12px}
.wf-card button[type=submit]{display:block;width:100%;margin-top:6px;padding:13px 16px;border:0;border-radius:8px;background:#ffad33;color:#111;font:800 16px/1.2 'Open Sans',Arial,sans-serif;letter-spacing:.06em;text-transform:uppercase;cursor:pointer}
.wf-card button[type=submit]:disabled{opacity:.6;cursor:wait}
.wf-card .wf-error-text{margin:2px 0 8px;color:#b91c1c;font-size:14px}
.wf-card .wf-note{margin:10px 0 0;color:#6b7280;font-size:12.5px;text-align:center}
@media (max-width:480px){.wf-card{padding:24px 16px 18px}.wf-card .wf-radios-2{grid-template-columns:1fr}}`;
  document.head.appendChild(style);

  function toast(message, error) {
    document.querySelector('.wf-toast')?.remove();
    const el = document.createElement('div');
    el.className = 'wf-toast' + (error ? ' wf-error' : '');
    el.setAttribute('role', error ? 'alert' : 'status');
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), error ? 6000 : 5000);
  }

  // ── /cashching: LadiPage form ──
  if (slug === 'cashching') {
    let busy = false;
    const handle = async event => {
      const form = event.target.closest?.('form.ladi-form') || (event.type === 'click' && event.target.closest?.('.ladi-form .ladi-button')?.closest('.ladi-form')?.querySelector('form'));
      if (!form) return;
      if (event.type === 'click' && !event.target.closest('.ladi-button')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (busy) return;
      const value = name => (form.querySelector(`[name="${name}"]`)?.value || '').trim();
      const fields = { name: value('name'), email: value('email'), phone: value('phone') };
      if (!fields.name) return toast('Vui lòng nhập họ và tên.', true);
      if (!emailOk(fields.email)) return toast('Vui lòng nhập email hợp lệ, ví dụ: ban@gmail.com', true);
      if (!phoneOk(fields.phone)) return toast('Vui lòng nhập số điện thoại hợp lệ.', true);
      busy = true;
      try {
        await register(fields);
        form.reset();
        toast('Câu trả lời của bạn đã được ghi nhận!');
      } catch (error) { toast(error.message, true); }
      finally { busy = false; }
    };
    // Capture phase: before LadiPage's own handlers.
    document.addEventListener('submit', handle, true);
    document.addEventListener('click', handle, true);
    return;
  }

  // ── /loinhuan: Thrive Leads two-step form ──
  const modal = document.createElement('div');
  modal.className = 'wf-modal';
  modal.hidden = true;
  modal.innerHTML = `
<div class="wf-card" role="dialog" aria-modal="true" aria-labelledby="wf-title">
  <button type="button" class="wf-close" aria-label="Đóng">×</button>
  <h2 id="wf-title">Đăng ký tham dự chương trình Phương pháp xây dựng gia sản triệu đô</h2>
  <p class="wf-sub">Điền thông tin của bạn bên dưới để đăng ký</p>
  <form novalidate>
    <input type="text" name="name" placeholder="Họ và tên" autocomplete="name" maxlength="120" required>
    <input type="email" name="email" placeholder="Địa chỉ email" autocomplete="email" required>
    <input type="tel" name="phone" placeholder="Số điện thoại" autocomplete="tel" required>
    <fieldset><legend>Lĩnh vực quan tâm?</legend>
      <label class="wf-radio"><input type="radio" name="interest" value="Bất động sản, vàng vật chất, bạc" required>Bất động sản, vàng vật chất, bạc</label>
      <label class="wf-radio"><input type="radio" name="interest" value="Chứng khoán, tài sản số, tiền tệ">Chứng khoán, tài sản số, tiền tệ</label>
    </fieldset>
    <fieldset><legend>Khu vực của bạn?</legend><div class="wf-radios-2">
      <label class="wf-radio"><input type="radio" name="region" value="Hà Nội" required>Hà Nội</label>
      <label class="wf-radio"><input type="radio" name="region" value="Hồ Chí Minh">Hồ Chí Minh</label>
      <label class="wf-radio"><input type="radio" name="region" value="Các tỉnh khác">Các tỉnh khác</label>
      <label class="wf-radio"><input type="radio" name="region" value="Nước ngoài">Nước ngoài</label>
    </div></fieldset>
    <p class="wf-error-text" role="alert" hidden></p>
    <button type="submit">Xác nhận</button>
    <p class="wf-note">* Mọi thông tin của bạn được bảo mật 100%<br>Hotline hỗ trợ: <a href="tel:0862421919">086 242 1919</a></p>
    <p class="wf-note"><b>LƯU Ý:</b> Vui lòng nhập Email chính xác, chúng tôi sẽ gửi thông tin lớp học qua địa chỉ Email của bạn.</p>
  </form>
</div>`;
  document.body.appendChild(modal);
  const form = modal.querySelector('form'), errorText = modal.querySelector('.wf-error-text'), submit = modal.querySelector('button[type=submit]');
  let lastFocus = null;
  const open = () => { lastFocus = document.activeElement; modal.hidden = false; document.documentElement.style.overflow = 'hidden'; form.elements.name.focus(); };
  const close = () => { modal.hidden = true; document.documentElement.style.overflow = ''; lastFocus?.focus?.(); };
  modal.addEventListener('click', event => { if (event.target === modal || event.target.closest('.wf-close')) close(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !modal.hidden) close(); });
  // Capture phase: before Thrive's handler tries to load its popup from WordPress.
  document.addEventListener('click', event => {
    const trigger = event.target.closest?.('[data-tcb-events*="thrive_leads_2_step"], .tve-leads-two-step-trigger');
    if (!trigger) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    open();
  }, true);
  const fail = message => { errorText.textContent = message; errorText.hidden = false; };
  form.addEventListener('submit', async event => {
    event.preventDefault();
    errorText.hidden = true;
    const data = new FormData(form);
    const fields = { name: String(data.get('name') || '').trim(), email: String(data.get('email') || '').trim(), phone: String(data.get('phone') || '').trim(), interest: data.get('interest') || '', region: data.get('region') || '' };
    if (!fields.name) return fail('Vui lòng nhập họ và tên.');
    if (!emailOk(fields.email)) return fail('Vui lòng nhập email hợp lệ, ví dụ: ban@gmail.com');
    if (!phoneOk(fields.phone)) return fail('Vui lòng nhập số điện thoại hợp lệ.');
    if (!fields.interest) return fail('Vui lòng chọn lĩnh vực quan tâm.');
    if (!fields.region) return fail('Vui lòng chọn khu vực của bạn.');
    submit.disabled = true;
    submit.textContent = 'Đang gửi...';
    try {
      await register(fields);
      location.href = '/thank-you-webinar';
    } catch (error) {
      fail(error.message);
      submit.disabled = false;
      submit.textContent = 'Xác nhận';
    }
  });
})();
