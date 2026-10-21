'use strict';
(() => {
  // Trang thanh toán: hiện QR + thông tin chuyển khoản của đơn. Khách chuyển xong bấm nút để
  // sang trang nhóm Zalo của khu vực, rồi gửi ảnh giao dịch cho admin trong Zalo.
  const $ = id => document.getElementById(id);
  // Mã đơn lưu trong trình duyệt (localStorage, dự phòng sessionStorage), không hiện trên URL.
  // Link có ?ma= (ví dụ link gửi qua n8n) vẫn dùng được: lưu lại rồi xóa khỏi thanh địa chỉ.
  const saveRef = value => { for (const store of [localStorage, sessionStorage]) { try { store.setItem('breakout:ref', value); } catch {} } };
  const query = new URLSearchParams(location.search);
  let ref = (query.get('ma') || '').trim().toUpperCase();
  if (ref) {
    saveRef(ref);
    query.delete('ma');
    try { history.replaceState(null, '', location.pathname + (query.size ? `?${query}` : '') + location.hash); } catch {}
  }
  for (const store of [localStorage, sessionStorage]) { try { ref ||= store.getItem('breakout:ref') || ''; } catch {} }
  const vnd = value => `${Number(value || 0).toLocaleString('vi-VN')}đ`;
  let payment = null;

  function missing(text) {
    $('pay-card').hidden = true;
    $('pay-missing').hidden = false;
    if (text) $('pay-missing-text').textContent = text;
  }

  function thankYou() {
    return payment.thank_you_url || '/breakout/thank-you-hn';
  }

  function render(data) {
    payment = data;
    if (data.status === 'cancelled') return missing(`Đăng ký ${data.ref} đã được hủy. Vui lòng liên hệ hotline 086.242.1919 nếu bạn đã chuyển khoản.`);
    // Đã được xác nhận thanh toán thì không cần quét lại.
    if (data.status === 'paid') return location.replace(thankYou());
    $('pay-card').hidden = false;
    let repeat = false;
    try { repeat = sessionStorage.getItem('breakout:repeat') === data.ref; sessionStorage.removeItem('breakout:repeat'); } catch {}
    $('repeat-note').hidden = !repeat;
    $('qr').src = data.qr_url;
    $('qr-save').href = data.qr_url;
    $('bank-name').textContent = data.bank.name;
    $('bank-account').textContent = data.bank.account;
    $('bank-holder').textContent = data.bank.holder;
    $('amount').textContent = vnd(data.amount);
    document.querySelector('[data-copy="amount"]').dataset.value = String(data.amount);
    $('transfer-content').textContent = data.transfer_content;
    if (data.region) {
      $('pay-lead').replaceChildren('Breakout Trading · ', Object.assign(document.createElement('strong'), { textContent: `${data.region}${data.event_date ? ` · ${data.event_date}` : ''}` }),
        '. Mở app ngân hàng, chọn Quét QR: số tiền và nội dung đã được điền sẵn.');
    }
    window.BreakoutTracking?.track('checkout_view', { payment_ref: data.ref, region: data.region, value: data.amount });
  }

  if (!/^[A-Z0-9]{6,12}$/.test(ref)) return missing();
  saveRef(ref);
  fetch(`/api/checkout/${encodeURIComponent(ref)}`, { cache: 'no-store' })
    .then(async response => {
      if (response.status === 404) return missing();
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'load failed');
      render(data.payment);
    })
    .catch(() => missing('Chưa tải được thông tin thanh toán. Vui lòng tải lại trang hoặc gọi 086.242.1919.'));

  $('qr').addEventListener('error', () => {
    $('qr').closest('.qr-box').querySelector('.qr-hint').textContent = 'Chưa tải được mã QR. Bạn vẫn có thể chuyển khoản theo thông tin bên cạnh.';
  });

  document.querySelectorAll('button.copy').forEach(button => button.addEventListener('click', async () => {
    const value = button.dataset.value || $(button.dataset.copy).textContent.trim();
    try { await navigator.clipboard.writeText(value); } catch {
      const area = Object.assign(document.createElement('textarea'), { value });
      document.body.append(area); area.select();
      try { document.execCommand('copy'); } catch {}
      area.remove();
    }
    button.classList.add('copied');
    button.textContent = 'Đã chép';
    setTimeout(() => { button.classList.remove('copied'); button.textContent = 'Sao chép'; }, 1600);
  }));

  // Ghi chú cho sale đối soát (không chặn khách nếu lỗi), rồi sang trang nhóm Zalo.
  const confirmButton = $('confirm');
  confirmButton.addEventListener('click', async () => {
    if (!payment || confirmButton.disabled) return;
    confirmButton.disabled = true;
    window.BreakoutTracking?.track('payment_confirm', { payment_ref: payment.ref, region: payment.region, value: payment.amount });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    await fetch(`/api/checkout/${encodeURIComponent(payment.ref)}/confirm`, { method: 'POST', signal: controller.signal }).catch(() => {});
    clearTimeout(timer);
    location.assign(thankYou());
  });
})();
