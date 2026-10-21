'use strict';
(() => {
  // Trang nhóm Zalo theo khu vực: nhắc mã chuyển khoản để khách gửi kèm ảnh giao dịch,
  // và chuyển sang đúng nhóm nếu khách mở nhầm trang của khu vực kia.
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
  if (!/^[A-Z0-9]{6,12}$/.test(ref)) return;
  const refText = document.getElementById('ref-text');
  refText.append(' (nội dung ', Object.assign(document.createElement('strong'), { textContent: ref }), ')');
  fetch(`/api/checkout/${encodeURIComponent(ref)}`, { cache: 'no-store' })
    .then(response => response.ok ? response.json() : null)
    .then(data => {
      const target = data?.payment?.thank_you_url;
      if (target && target !== location.pathname) location.replace(target);
    })
    .catch(() => {});
})();
