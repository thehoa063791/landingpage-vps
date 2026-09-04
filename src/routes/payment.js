const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');

const { wrap, extractClientIp } = require('../utils');
const { getPayment, insertPayment, updatePayment } = require('../storage');

// ── OnePay config (override via .env) ─────────────────────────────────────────
const ONEPAY = {
  merchantId:  process.env.ONEPAY_MERCHANT     || 'TESTTOKEN',
  accessCode:  process.env.ONEPAY_ACCESS_CODE  || '6BEB0511',
  hashKey:     process.env.ONEPAY_HASH_KEY     || '6D0870CDE5F24F34F3915FB0045120D2',
  payUrl:      process.env.ONEPAY_PAY_URL      || 'https://mtf.onepay.vn/paygate/vpcpay.op',
  returnUrl:   process.env.ONEPAY_RETURN_URL   || '',  // populated at request-time if blank
  amount:      parseInt(process.env.ONEPAY_AMOUNT || '500000', 10), // VND
};

// ── HMAC-SHA256 helper ────────────────────────────────────────────────────────
// Rules (doc §III.1):
//   • include all keys with prefix vpc_ or user_
//   • exclude empty values
//   • sort keys alphabetically
//   • build key=value&key=value string (raw values, no URL-encode)
//   • HMAC-SHA256 with SECURE_SECRET, output uppercase hex
function buildHash(params) {
  const str = Object.keys(params)
    .filter(k => (k.startsWith('vpc_') || k.startsWith('user_')) && params[k] != null && params[k] !== '')
    .sort()
    .map(k => `${k}=${params[k]}`)
    .join('&');
  return crypto.createHmac('sha256', ONEPAY.hashKey).update(str).digest('hex').toUpperCase();
}

function verifyHash(params) {
  const received = (params.vpc_SecureHash || '').toLowerCase();
  if (!received) return false;
  const { vpc_SecureHash, ...rest } = params;
  return buildHash(rest).toLowerCase() === received;
}

// ── Shared helper: build OnePay redirect URL ──────────────────────────────────
function buildPaymentUrl({ txnRef, amount, registration_id, email, phone, ip, baseUrl }) {
  const returnUrl = ONEPAY.returnUrl || `${baseUrl}/api/payment/return`;
  // vpc_OrderInfo: alphanumeric only, max 34 chars
  const orderInfo = `DT${txnRef.slice(-12)}`;
  const params = {
    vpc_Version:     '2',
    vpc_Currency:    'VND',
    vpc_Command:     'pay',
    vpc_AccessCode:  ONEPAY.accessCode,
    vpc_Merchant:    ONEPAY.merchantId,
    vpc_Locale:      'vn',
    vpc_ReturnURL:   returnUrl,
    vpc_MerchTxnRef: txnRef,
    vpc_OrderInfo:   orderInfo,
    vpc_Amount:      String(amount * 100),
    vpc_TicketNo:    ip,
  };
  // Optional customer fields — digits-only phone to avoid encoding issues
  if (email) params.vpc_Customer_Email = email.slice(0, 24);
  if (phone) params.vpc_Customer_Phone = phone.replace(/\D/g, '').slice(0, 16);
  params.vpc_SecureHash = buildHash(params);

  const hashInput = Object.keys(params)
    .filter(k => (k.startsWith('vpc_') || k.startsWith('user_')) && params[k] != null && params[k] !== '' && k !== 'vpc_SecureHash')
    .sort()
    .map(k => `${k}=${params[k]}`)
    .join('&');
  console.log(`[payment] hashInput: ${hashInput}`);
  console.log(`[payment] SecureHash: ${params.vpc_SecureHash}`);

  const urlParams = new URLSearchParams({ ...params, AgainLink: baseUrl + '/', Title: 'Thanh toan khoa hoc' });
  return `${ONEPAY.payUrl}?${urlParams.toString()}`;
}

function getClientIp(req) {
  // OnePay yêu cầu IPv4 → extractClientIp đã normalize ::ffff: → IPv4
  // Nếu client dùng IPv6 thuần, fallback về 127.0.0.1 để tránh lỗi OnePay
  const ip = extractClientIp(req);
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) ? ip : '127.0.0.1';
}

// ── POST /api/payment/create ─────────────────────────────────────────────────
// Called by frontend after successful registration.
// Returns { success, payment_url, txn_ref, amount }
router.post('/create', wrap(async (req, res) => {
  const { registration_id, name, phone, email } = req.body;
  if (!registration_id) {
    return res.status(400).json({ success: false, message: 'Missing registration_id' });
  }

  const txnRef  = `${Date.now()}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const reqAmt  = req.body.amount ? parseInt(req.body.amount, 10) : 0;
  const amount  = (reqAmt > 0 && reqAmt <= 50000000) ? reqAmt : ONEPAY.amount;
  const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
  const ip      = getClientIp(req);

  const paymentUrl = buildPaymentUrl({ txnRef, amount, registration_id, email, phone, ip, baseUrl });

  await insertPayment({
    txn_ref:         txnRef,
    registration_id: registration_id,
    name:            (name  || '').slice(0, 100),
    phone:           (phone || '').slice(0, 20),
    email:           (email || '').slice(0, 100),
    amount,
    payment_url:     paymentUrl,
    status:          'pending',
    created_at:      new Date().toISOString(),
  });

  console.log(`[payment] Created txnRef=${txnRef} amount=${amount} regId=${registration_id}`);
  res.json({ success: true, payment_url: paymentUrl, txn_ref: txnRef, amount });
}));

// ── GET /api/payment/return ───────────────────────────────────────────────────
// OnePay redirects the browser here after payment.
// Verifies signature, updates status, then redirects to /thank-you.
router.get('/return', wrap(async (req, res) => {
  const params       = req.query;
  const txnRef       = params.vpc_MerchTxnRef || '';
  const responseCode = params.vpc_TxnResponseCode || '';
  const hashOk       = verifyHash(params);

  let status = 'failed';
  let message = params.vpc_Message || '';

  if (!hashOk) {
    console.warn(`[payment/return] Hash mismatch txnRef=${txnRef}`);
  } else if (responseCode === '0') {
    status = 'paid';
  } else if (responseCode === '99') {
    status = 'cancelled';
  }

  if (txnRef) {
    await updatePayment(txnRef, {
      status,
      response_code: responseCode,
      message,
      vpc_data:  params,
      ...(status === 'paid' ? { paid_at: new Date().toISOString() } : {}),
    }).catch(e => console.error('[payment/return] updatePayment error:', e));
  }

  const payment = txnRef ? await getPayment(txnRef).catch(() => null) : null;
  const name    = payment?.name || '';
  res.redirect(
    `/thank-you?txnRef=${encodeURIComponent(txnRef)}&status=${status}&name=${encodeURIComponent(name)}`
  );
}));

// ── IPN handler (shared by GET and POST) ─────────────────────────────────────
// OnePay calls this server-to-server after processing payment.
// Must return: responsecode=1&desc=confirm-success
async function handleIpn(params, req, res) {
  const txnRef       = params.vpc_MerchTxnRef || '';
  const responseCode = params.vpc_TxnResponseCode || '';
  const hashOk       = verifyHash(params);

  console.log(`[payment/ipn] txnRef=${txnRef} code=${responseCode} hashOk=${hashOk}`);

  if (!hashOk) {
    console.warn(`[payment/ipn] Hash mismatch txnRef=${txnRef}`);
    return res.send('responsecode=0&desc=invalid-signature');
  }

  let status = 'failed';
  if (responseCode === '0')  status = 'paid';
  else if (responseCode === '99') status = 'cancelled';

  if (txnRef) {
    await updatePayment(txnRef, {
      status,
      response_code: responseCode,
      message: params.vpc_Message || '',
      vpc_data: params,
      ...(status === 'paid' ? { paid_at: new Date().toISOString() } : {}),
    }).catch(e => console.error('[payment/ipn] updatePayment error:', e));

  }

  res.send('responsecode=1&desc=confirm-success');
}

router.get('/ipn',  wrap(async (req, res) => handleIpn(req.query, req, res)));
router.post('/ipn', wrap(async (req, res) => handleIpn({ ...req.body, ...req.query }, req, res)));

// ── GET /api/payment/url?txnRef=... ──────────────────────────────────────────
// Returns stored payment URL; rebuilds it on the fly if not stored (old records).
router.get('/url', wrap(async (req, res) => {
  const { txnRef } = req.query;
  if (!txnRef) return res.status(400).json({ success: false });

  const payment = await getPayment(txnRef);
  if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });

  let payUrl = payment.payment_url;

  if (!payUrl) {
    // Rebuild URL for records created before payment_url was stored
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const ip      = getClientIp(req);
    payUrl = buildPaymentUrl({
      txnRef:          payment.txn_ref,
      amount:          payment.amount,
      registration_id: payment.registration_id,
      email:           payment.email,
      phone:           payment.phone,
      ip,
      baseUrl,
    });
    // Persist so subsequent calls skip rebuild
    await updatePayment(txnRef, { payment_url: payUrl }).catch(() => {});
  }

  res.json({ success: true, payment_url: payUrl, amount: payment.amount || 0 });
}));

// ── GET /api/payment/status?txnRef=... ────────────────────────────────────────
// Frontend polls this every few seconds to get real-time payment status.
router.get('/status', wrap(async (req, res) => {
  const { txnRef } = req.query;
  if (!txnRef) return res.status(400).json({ success: false, message: 'Missing txnRef' });

  const payment = await getPayment(txnRef);
  if (!payment) return res.json({ success: true, status: 'pending' });

  res.json({ success: true, status: payment.status, name: payment.name || '', amount: payment.amount || 0 });
}));

module.exports = router;
