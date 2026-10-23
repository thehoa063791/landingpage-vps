// Paid funnels paid by bank transfer (VietQR). Registering creates a pending CRM order
// (funnel_sales); its short code (payment_ref) identifies the order in the browser, while the
// transfer content the buyer sends is their name + phone. The order turns "won" when a sale
// confirms it in admin, or automatically when SePay (SEPAY_WEBHOOK_KEY) reports an incoming
// transfer whose content carries the buyer's phone (or the code) and the full amount.
const crypto = require('crypto');

// Receiving account for every paid funnel (Vietcombank BIN 970436 for VietQR).
const BANK = {
  bin: '970436',
  name: 'Vietcombank',
  account: '0451000368876',
  holder: 'CONG TY CO PHAN TAP DOAN VINMOC',
};

const PAID_FUNNELS = {
  breakout: {
    title: 'Breakout Trading - Giao dịch theo xu hướng',
    amount: 99000,
    prefix: 'BT',
    regions: {
      // Đăng ký khu vực tự đóng từ 00:00 (giờ Việt Nam) ngày học.
      'Hà Nội': { date: '08/11/2026', starts_on: '2026-11-08', thank_you: '/breakout/thank-you-hn' },
      'TP. Hồ Chí Minh': { date: '15/11/2026', starts_on: '2026-11-15', thank_you: '/breakout/thank-you-hcm' },
    },
  },
};

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ACTIVE = new Set(['pending', 'won']);

function paidFunnel(pageId) {
  return PAID_FUNNELS[String(pageId || '')] || null;
}

function regionOpen(funnel, region, at = new Date()) {
  const info = funnel?.regions[region];
  return !!info && at < new Date(`${info.starts_on}T00:00:00+07:00`);
}

function phoneKey(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('84') && digits.length >= 11) digits = `0${digits.slice(2)}`;
  return digits;
}

// VietQR carries the content in EMVCo field 62-08, at most 25 characters: ASCII "HO TEN SDT".
// Long names keep the given name and shorten the others to initials ("N V THANH 0901234567").
const CONTENT_MAX = 25;
function transferContent(name, phone) {
  const ascii = String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'D')
    .toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean);
  const digits = phoneKey(phone);
  const room = CONTENT_MAX - (digits ? digits.length + 1 : 0);
  const words = [...ascii];
  for (let i = 0; i < words.length - 1 && words.join(' ').length > room; i++) words[i] = words[i][0];
  let text = words.join(' ');
  if (text.length > room) text = text.slice(0, Math.max(0, room)).trim();
  return [text, digits].filter(Boolean).join(' ');
}

function newPaymentRef(prefix) {
  const bytes = crypto.randomBytes(6);
  return prefix + Array.from(bytes, byte => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
}

function qrUrl(amount, content) {
  const query = new URLSearchParams({ amount: String(amount), addInfo: content, accountName: BANK.holder });
  return `https://img.vietqr.io/image/${BANK.bin}-${BANK.account}-qr_only.png?${query}`;
}

function createBankTransferService({ storage, now = () => new Date() } = {}) {
  storage ||= require('./storage');

  // What the payment and thank-you pages show. Only the transfer content (ASCII name + phone)
  // carries personal data, never the email; it is reached only through the random order code.
  async function describe(order, knownLead = null) {
    const funnel = paidFunnel(order.page_id);
    const lead = knownLead || await storage.getRegistrationById(order.registration_id).catch(() => null);
    const content = transferContent(lead?.name, lead?.phone) || order.payment_ref;
    const region = lead?.region || '';
    const regionInfo = funnel?.regions[region] || null;
    return {
      ref: order.payment_ref,
      status: order.status === 'won' ? 'paid' : order.status === 'pending' ? 'pending' : 'cancelled',
      customer_confirmed: !!order.customer_confirmed_at,
      amount: Number(order.amount || 0),
      currency: order.currency || 'VND',
      title: funnel?.title || '',
      region,
      event_date: regionInfo?.date || '',
      thank_you_url: regionInfo?.thank_you || '',
      bank: { ...BANK },
      transfer_content: content,
      qr_url: qrUrl(Number(order.amount || 0), content),
    };
  }

  async function createOrder(lead, funnel) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const ref = newPaymentRef(funnel.prefix);
      if (await storage.getFunnelOrderByPaymentRef(ref)) continue;
      return storage.createFunnelOrder({
        registration_id: lead.id,
        funnel_id: lead.page_id,
        page_id: lead.page_id,
        status: 'pending',
        amount: funnel.amount,
        currency: 'VND',
        payment_method: 'Chuyển khoản QR',
        payment_ref: ref,
        note: `Chờ chuyển khoản ${funnel.amount.toLocaleString('vi-VN')}đ, nội dung "${transferContent(lead.name, lead.phone)}" (mã đơn ${ref})`,
        sold_at: null,
      });
    }
    throw new Error('Could not allocate a payment code');
  }

  // Same email registering the same paid funnel again gets its earlier order back, so
  // nobody pays twice and no second lead is created.
  async function findActiveOrder(pageId, email) {
    const key = String(email || '').trim().toLowerCase();
    if (!key) return null;
    const leads = (storage.findRegistrationsByEmail ? await storage.findRegistrationsByEmail(key) : await storage.getRegistrations())
      .filter(lead => lead.page_id === pageId && String(lead.email || '').trim().toLowerCase() === key)
      .sort((a, b) => String(a.registered_at || '').localeCompare(String(b.registered_at || '')));
    for (const lead of leads) {
      const orders = await storage.getFunnelOrders(lead.id);
      const order = orders.find(item => item.payment_ref && ACTIVE.has(item.status));
      if (order) return { lead, order };
    }
    return leads.length ? { lead: leads[0], order: null } : null;
  }

  // Đăng ký lại cùng email: đổi khu vực khi chưa thanh toán (ghi chú cho sale); đã thanh toán
  // thì giữ khu vực cũ và báo khách liên hệ hotline.
  async function reregister({ lead, order }, region, funnel) {
    if (lead.region !== region) {
      if (order?.status === 'won') {
        await storage.addLeadNote(lead.id, `Khách đã thanh toán cho ${lead.region}, đăng ký lại và chọn ${region}. Liên hệ nếu khách muốn đổi khu vực.`, null, 'note').catch(() => {});
        return { order, region_locked: lead.region };
      }
      const previous = lead.region || '(trống)';
      await storage.updateRegistration(lead.id, { region });
      await storage.addLeadNote(lead.id, `Khách đăng ký lại và đổi khu vực ${previous} → ${region}.`, null, 'note').catch(() => {});
    }
    return { order: order || await createOrder({ ...lead, region }, funnel) };
  }

  // Cùng SĐT nhưng khác email trong cùng phễu: có thể là một người hoặc người nhà, để sale xem.
  async function notePhoneMatches(lead) {
    const key = phoneKey(lead.phone);
    if (key.length < 9) return;
    const email = String(lead.email || '').trim().toLowerCase();
    const others = (storage.findRegistrationsByPhone ? await storage.findRegistrationsByPhone(lead.phone) : await storage.getRegistrations()).filter(item => item.id !== lead.id && item.page_id === lead.page_id
      && phoneKey(item.phone) === key && String(item.email || '').trim().toLowerCase() !== email);
    if (!others.length) return;
    await storage.addLeadNote(lead.id, `Trùng SĐT với ${others.length} đăng ký khác của phễu này: ${others.map(item => item.email || item.name).join(', ')}. Có thể là cùng một người hoặc người nhà.`, null, 'note').catch(() => {});
  }

  async function byRef(ref) {
    const order = await storage.getFunnelOrderByPaymentRef(String(ref || '').trim().toUpperCase());
    return order && paidFunnel(order.page_id) ? order : null;
  }

  // The buyer says they transferred: noted once on the lead for the sale to reconcile.
  async function confirmByCustomer(ref) {
    const order = await byRef(ref);
    if (!order) return null;
    if (order.status === 'pending' && !order.customer_confirmed_at) {
      await storage.updateFunnelOrder(order.id, { customer_confirmed_at: now().toISOString() });
      await storage.addLeadNote(order.registration_id,
        `Khách báo đã chuyển khoản ${Number(order.amount).toLocaleString('vi-VN')}đ (mã đơn ${order.payment_ref}). Đối soát sao kê theo họ tên + SĐT rồi chuyển đơn sang "won".`,
        null, 'note').catch(() => {});
    }
    return describe(await storage.getFunnelOrder(order.id) || order);
  }

  // SePay webhook body: { id, transferType: 'in'|'out', transferAmount, content, ... }.
  async function recordBankTransfer(body = {}) {
    if (body.transferType && body.transferType !== 'in') return { matched: false, reason: 'outgoing' };
    const text = `${body.code || ''} ${body.content || ''} ${body.description || ''}`.toUpperCase();
    const prefixes = Object.values(PAID_FUNNELS).map(funnel => funnel.prefix).join('|');
    const refs = text.match(new RegExp(`(?:${prefixes})[${CODE_ALPHABET}]{6}`, 'g')) || [];
    const candidates = [];
    for (const ref of refs) { const order = await byRef(ref); if (order) candidates.push(order); }
    if (!candidates.length) {
      const phones = new Set((text.match(/(?:\+?84|0)\d{9,10}/g) || []).map(phoneKey));
      if (phones.size) {
        const phoneLeads = storage.findRegistrationsByPhone ? (await Promise.all([...phones].map(phone => storage.findRegistrationsByPhone(phone)))).flat() : await storage.getRegistrations();
        const leads = new Map(phoneLeads.filter(lead => paidFunnel(lead.page_id) && phones.has(phoneKey(lead.phone))).map(lead => [lead.id, lead]));
        const open = [];
        for (const id of leads.keys()) open.push(...(await storage.getFunnelOrders(id)).filter(order => order.payment_ref && order.status === 'pending'));
        // Two people sharing a phone (family) both waiting: leave it to the sale.
        if (open.length > 1) {
          for (const order of open) await storage.addLeadNote(order.registration_id, `SePay #${body.id || '?'}: nhận ${Number(body.transferAmount || 0).toLocaleString('vi-VN')}đ có SĐT trùng ${open.length} đơn đang chờ. Cần đối soát thủ công.`, null, 'note').catch(() => {});
          return { matched: true, applied: false, reason: 'ambiguous' };
        }
        candidates.push(...open);
      }
    }
    for (const order of candidates) {
      const ref = order.payment_ref;
      const amount = Number(body.transferAmount || 0);
      const line = `SePay #${body.id || '?'}: nhận ${amount.toLocaleString('vi-VN')}đ lúc ${body.transactionDate || now().toISOString()}`;
      if (order.status === 'won') return { matched: true, ref, already_paid: true };
      if (order.status !== 'pending') {
        await storage.addLeadNote(order.registration_id, `${line} cho đơn ${ref} đang ở trạng thái "${order.status}". Cần kiểm tra thủ công.`, null, 'note').catch(() => {});
        return { matched: true, ref, applied: false, reason: 'order_closed' };
      }
      if (amount < Number(order.amount || 0)) {
        await storage.addLeadNote(order.registration_id, `${line} cho đơn ${ref}, thiếu so với ${Number(order.amount).toLocaleString('vi-VN')}đ. Cần kiểm tra thủ công.`, null, 'note').catch(() => {});
        return { matched: true, ref, applied: false, reason: 'amount_short' };
      }
      await storage.updateFunnelOrder(order.id, {
        status: 'won',
        sold_at: now().toISOString(),
        note: `${order.note ? `${order.note}\n` : ''}${line}`.slice(0, 2000),
      }, { email: 'sepay' });
      return { matched: true, ref, applied: true };
    }
    return { matched: false, reason: 'no_match' };
  }

  return { describe, createOrder, findActiveOrder, reregister, notePhoneMatches, byRef, confirmByCustomer, recordBankTransfer };
}

let service;
function getBankTransferService() {
  service ||= createBankTransferService();
  return service;
}

module.exports = { BANK, PAID_FUNNELS, paidFunnel, regionOpen, transferContent, newPaymentRef, qrUrl, createBankTransferService, getBankTransferService };
