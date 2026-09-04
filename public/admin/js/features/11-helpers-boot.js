function fmt(n)    { return (n||0).toLocaleString('vi-VN'); }
function fmtDate(dt) {
  if (!dt) return '–';
  const d = new Date(dt);
  return d.toLocaleDateString('vi-VN') + ' ' + d.toLocaleTimeString('vi-VN', { hour:'2-digit', minute:'2-digit' });
}
function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
}
function escAttr(s) { return escHtml(s); }
function encAttr(s) { return encodeURIComponent(String(s ?? '')).replace(/'/g, '%27'); }

let toastTimer;
function toast(msg, type='') {
  const el = document.getElementById('toast');
  clearTimeout(toastTimer);
  el.textContent = msg; el.className = 'toast show ' + type;
  toastTimer = setTimeout(() => el.classList.remove('show'), 3800);
}

function exportCsv(rows) {
  if (!rows) return;
  const h = ['STT','Ho ten','SDT','Email','Khu vuc','Hinh thuc tham du','Sale phu trach','Tuong tac gan nhat','Source','Medium','Channel','Campaign','Thoi gian'];
  const csv = [h, ...rows.map((r,i)=>[
    i+1, r.name, r.phone, r.email||'', r.region||'', r.attendance||'', r.assigned_name || '', r.last_interaction_at ? new Date(r.last_interaction_at).toLocaleString('vi-VN') : 'Chua cham soc', r.source||'direct', r.medium||'(none)',
    r.channel||'', r.campaign||'', new Date(r.registered_at).toLocaleString('vi-VN')
  ])].map(row=>row.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'})),
    download: `leads_${new Date().toISOString().slice(0,10)}.csv`
  });
  a.click(); URL.revokeObjectURL(a.href);
}

// ════════════════════════════════════════════════════════════════════════
// BOOT
// ════════════════════════════════════════════════════════════════════════
document.getElementById('refreshBtn').addEventListener('click', () => {
  invalidateRouteCache(activeTab);
  invalidateViewCache(activeTab);
  loadActiveTab(true);
});
document.getElementById('exportBtn').addEventListener('click', async () => {
  const btn = document.getElementById('exportBtn');
  const original = btn.textContent;
  btn.disabled = true; btn.textContent = '⏳ Đang xuất...';
  try {
    const dateParams = getDateRangeParams();
    const params = new URLSearchParams(Object.assign({ q: leadsSearch, assignee: leadAssignee, all: '1', filters: JSON.stringify(normalizeAdvancedFiltersForRequest()) }, dateParams));
    const res = await fetch('/admin/leads?' + params.toString());
    if (!res.ok) { toast('Lỗi xuất CSV', 'error'); return; }
    const d = await res.json();
    exportCsv(d.rows || []);
  } catch (e) {
    toast('Lỗi kết nối khi xuất CSV', 'error');
  } finally {
    btn.disabled = false; btn.textContent = original;
  }
});
document.getElementById('drawerClose').addEventListener('click', closeLeadDrawer);
document.getElementById('drawerOverlay').addEventListener('click', closeLeadDrawer);
document.getElementById('campaignLeadClose')?.addEventListener('click', closeCampaignLeadPopup);
document.getElementById('campaignLeadOverlay')?.addEventListener('click', e => {
  if (e.target.id === 'campaignLeadOverlay') closeCampaignLeadPopup();
});
document.getElementById('campaignEmailClose')?.addEventListener('click', closeCampaignEmailPopup);
document.getElementById('campaignEmailOverlay')?.addEventListener('click', e => {
  if (e.target.id === 'campaignEmailOverlay') closeCampaignEmailPopup();
});
document.getElementById('campaignEmailPreviewClose')?.addEventListener('click', closeCampaignEmailPreview);
document.getElementById('campaignEmailPreviewOverlay')?.addEventListener('click', e => {
  if (e.target.id === 'campaignEmailPreviewOverlay') closeCampaignEmailPreview();
});
document.getElementById('tagFilter')?.addEventListener('change', () => { leadsPageNum = 1; invalidateViewCache('leads'); loadActiveTab(true); });
document.getElementById('dateRangeFilter').addEventListener('change', (e) => {
  const customPicker = document.getElementById('customDatePicker');
  customPicker.style.display = e.target.value === 'custom' ? 'flex' : 'none';
  leadsPageNum = 1;
  invalidateViewCache('leads');
  loadActiveTab(true);
});
document.getElementById('dateFrom').addEventListener('change', () => { leadsPageNum = 1; invalidateViewCache('leads'); loadActiveTab(true); });
document.getElementById('dateTo').addEventListener('change', () => { leadsPageNum = 1; invalidateViewCache('leads'); loadActiveTab(true); });
document.getElementById('manualLeadForm')?.addEventListener('submit', submitManualLead);
document.getElementById('manualLeadClose')?.addEventListener('click', closeManualLeadModal);
document.getElementById('manualLeadCancel')?.addEventListener('click', closeManualLeadModal);
document.getElementById('manualLeadOverlay')?.addEventListener('click', e => {
  if (e.target.id === 'manualLeadOverlay') closeManualLeadModal();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeManualLeadModal();
    closeLeadDrawer();
  }
});
initAuth();
