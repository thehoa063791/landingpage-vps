function renderDevices(d) {
  const { deviceType, os, browser, country, city, isp, leadsByRegion, leadsByAttendance, stats } = d;
  const total = stats.conversions;

  // Kiểm tra có data không
  const hasDeviceData = total > 0 && Object.keys(deviceType).length > 0;
  const hasGeoData    = total > 0 && Object.keys(country).length > 0;

  const noData = (label) =>
    `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:140px;gap:8px">
       <div style="font-size:2rem">📭</div>
       <div style="font-size:.82rem;color:var(--gray)">${label}</div>
     </div>`;

  // ── Hbar builder (sorted horizontal bars) ────────────────────────────
  function hbars(obj, colors, pctOf) {
    if (!obj || !Object.keys(obj).length) return noData('Chưa có dữ liệu');
    const entries = Object.entries(obj).sort((a,b) => b[1]-a[1]);
    const max = entries[0][1];
    return entries.map(([k, v], i) => {
      const pct = pctOf > 0 ? ((v / pctOf)*100).toFixed(0) : 0;
      const bw  = max  > 0 ? Math.round(v/max*100) : 0;
      const col = Array.isArray(colors) ? colors[i % colors.length] : (colors[k] || '#8b949e');
      return `<div class="hbar-row" style="margin-bottom:9px">
        <div class="hbar-lbl2" style="width:90px;font-size:.75rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${k}">${k}</div>
        <div class="hbar-track"><div class="hbar" style="width:0%;background:${col}" data-w="${bw}">${bw>14?pct+'%':''}</div></div>
        <span class="hbar-count" style="min-width:40px">${v}</span>
      </div>`;
    }).join('');
  }

  // ── Device type icon & color ─────────────────────────────────────────
  const DT_COL  = { Mobile:'#3b82f6', Desktop:'#22c55e', Tablet:'#a855f7', Unknown:'#8b949e' };
  const OS_COL  = ['#f5a623','#3b82f6','#22c55e','#a855f7','#14b8a6','#f97316','#ef4444','#ec4899'];
  const BR_COL  = { Chrome:'#f5a623', Safari:'#3b82f6', Firefox:'#f97316', Edge:'#14b8a6', Samsung:'#22c55e', Opera:'#ef4444', Unknown:'#8b949e' };
  const GEO_COL = ['#f5a623','#22c55e','#3b82f6','#a855f7','#14b8a6','#f97316','#ef4444','#ec4899'];

  // ── Device type summary cards ────────────────────────────────────────
  const dtCards = ['Mobile','Desktop','Tablet'].map(t => {
    const n   = deviceType[t] || 0;
    const pct = total > 0 ? Math.round(n/total*100) : 0;
    const ico = { Mobile:'📱', Desktop:'💻', Tablet:'🖥' }[t];
    return `<div class="stat-card" style="border-top:2px solid ${DT_COL[t]}">
      <div class="stat-label">${ico} ${t}</div>
      <div class="stat-value" style="color:${DT_COL[t]}">${pct}%</div>
      <div class="stat-sub">${n} leads</div>
    </div>`;
  }).join('');

  document.getElementById('mainDevices').innerHTML = `

    <!-- ── Device summary strip ── -->
    <div class="section-sep">📱 Thiết bị người dùng</div>
    ${hasDeviceData ? `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:14px">${dtCards}</div>

    <div class="row row-3">
      <div class="card">
        <div class="card-head"><span class="card-title">📱 Loại thiết bị</span></div>
        <div class="chart-wrap" style="height:200px"><canvas id="chartDevType"></canvas></div>
      </div>
      <div class="card">
        <div class="card-head"><span class="card-title">🖥 Hệ điều hành</span></div>
        <div class="chart-wrap" style="height:200px"><canvas id="chartOS"></canvas></div>
      </div>
      <div class="card">
        <div class="card-head"><span class="card-title">🌐 Trình duyệt</span></div>
        <div class="chart-wrap" style="height:200px"><canvas id="chartBrowser"></canvas></div>
      </div>
    </div>

    <div class="row row-2">
      <div class="card">
        <div class="card-head"><span class="card-title">📱 Phân bổ thiết bị</span><span class="card-note">${total} leads</span></div>
        ${hbars(deviceType, DT_COL, total)}
      </div>
      <div class="card">
        <div class="card-head"><span class="card-title">🖥 Hệ điều hành chi tiết</span></div>
        ${hbars(os, OS_COL, total)}
      </div>
    </div>`
    : `<div class="card" style="margin-bottom:14px">${noData('Chưa có dữ liệu thiết bị. Dữ liệu sẽ xuất hiện khi có lead mới đăng ký.')}</div>`}

    <!-- ── Khu vực đăng ký ── -->
    <div class="section-sep">📍 Khu vực đăng ký</div>
    <div class="row row-2">
      <div class="card">
        <div class="card-head"><span class="card-title">Phân bổ theo khu vực</span><span class="card-note">${total} leads</span></div>
        ${leadsByRegion && Object.keys(leadsByRegion).length ? hbars(leadsByRegion, ['#f5a623','#22c55e','#8b949e'], total) : noData('Chưa có dữ liệu khu vực')}
      </div>
      <div class="card">
        <div class="card-head"><span class="card-title">Biểu đồ khu vực</span></div>
        <div class="chart-wrap" style="height:200px"><canvas id="chartRegion"></canvas></div>
      </div>
    </div>

    <!-- ── Hình thức tham dự ── -->
    <div class="section-sep">🎯 Hình thức tham dự</div>
    <div class="row row-2">
      <div class="card">
        <div class="card-head"><span class="card-title">Phân bổ hình thức tham dự</span><span class="card-note">${total} leads</span></div>
        ${leadsByAttendance && Object.keys(leadsByAttendance).length ? hbars(leadsByAttendance, ['#58a6ff','#f5a623','#22c55e','#8b949e'], total) : noData('Chưa có dữ liệu hình thức tham dự')}
      </div>
      <div class="card">
        <div class="card-head"><span class="card-title">Biểu đồ hình thức tham dự</span></div>
        <div class="chart-wrap" style="height:200px"><canvas id="chartAttendance"></canvas></div>
      </div>
    </div>

    <!-- ── Geo ── -->
    <div class="section-sep">🌏 Vị trí địa lý</div>
    ${hasGeoData ? `
    <div class="row row-2">
      <div class="card">
        <div class="card-head"><span class="card-title">🌏 Quốc gia</span></div>
        <div class="chart-wrap" style="height:210px"><canvas id="chartCountry"></canvas></div>
      </div>
      <div class="card">
        <div class="card-head"><span class="card-title">🏙 Thành phố (top 8)</span></div>
        <div class="chart-wrap" style="height:210px"><canvas id="chartCity"></canvas></div>
      </div>
    </div>

    <div class="row row-2">
      <div class="card">
        <div class="card-head"><span class="card-title">🗺 Phân bổ theo quốc gia</span></div>
        ${hbars(country, GEO_COL, total)}
      </div>
      <div class="card">
        <div class="card-head"><span class="card-title">📡 Nhà mạng / ISP (top 8)</span></div>
        ${hbars(isp, GEO_COL, total)}
      </div>
    </div>

    <div class="card">
      <div class="card-head"><span class="card-title">🏙 Top thành phố</span></div>
      ${hbars(city, GEO_COL, total)}
    </div>`
    : `<div class="card">${noData('Chưa có dữ liệu vị trí địa lý. Geo sẽ tự động cập nhật sau khi lead đăng ký.')}</div>`}
  `;

  // ── Animate bars ──────────────────────────────────────────────────────
  setTimeout(() => {
    document.querySelectorAll('[data-w]').forEach(el => el.style.width = el.dataset.w + '%');

    if (hasDeviceData) {
      // Device type donut
      charts.devType = makeDoughnut('chartDevType', deviceType,
        Object.fromEntries(Object.keys(deviceType).map(k => [k, DT_COL[k]||'#8b949e'])));

      // OS donut
      charts.os = makeDoughnut('chartOS', os);

      // Browser donut
      charts.browser = makeDoughnut('chartBrowser', browser,
        Object.fromEntries(Object.keys(browser).map(k => [k, BR_COL[k]||'#8b949e'])));
    }

    if (leadsByRegion && Object.keys(leadsByRegion).length) {
      const REGION_COL = { 'Hà Nội': '#f5a623', 'Hồ Chí Minh': '#22c55e', 'Các tỉnh khác': '#8b949e', 'Không xác định': '#30363d' };
      charts.region = makeDoughnut('chartRegion', leadsByRegion, REGION_COL);
    }

    if (leadsByAttendance && Object.keys(leadsByAttendance).length) {
      const ATT_COL = { 'Online qua Zoom': '#58a6ff', 'Offline tại Hà Nội': '#f5a623', 'Offline tại Hồ Chí Minh': '#22c55e', 'Không xác định': '#30363d' };
      charts.attendance = makeDoughnut('chartAttendance', leadsByAttendance, ATT_COL);
    }

    if (hasGeoData) {
      // Country bar chart
      charts.country = makeHBarChart('chartCountry', country, GEO_COL);
      // City bar chart
      charts.city    = makeHBarChart('chartCity',    city,    GEO_COL);
    }
  }, 80);
}

// Horizontal bar chart (Chart.js indexAxis:'y')
function makeHBarChart(id, dataObj, colors) {
  const ctx = document.getElementById(id);
  if (!ctx) return null;
  const entries = Object.entries(dataObj).sort((a,b) => b[1]-a[1]).slice(0, 8);
  if (!entries.length) return null;
  const labels = entries.map(([k]) => k);
  const values = entries.map(([,v]) => v);
  const bgs    = labels.map((_, i) => (Array.isArray(colors) ? colors[i % colors.length] : '#f5a623') + '99');
  const borders= labels.map((_, i) =>  Array.isArray(colors) ? colors[i % colors.length] : '#f5a623');
  return new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ data: values, backgroundColor: bgs, borderColor: borders, borderWidth: 1.5, borderRadius: 4 }] },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,.04)' }, ticks: { precision: 0 } },
        y: { grid: { display: false }, ticks: { font: { size: 11 } } }
      }
    }
  });
}

// ════════════════════════════════════════════════════════════════════════
// WEBHOOKS
// ════════════════════════════════════════════════════════════════════════
