function renderOverview(d) {
  const { stats, regByDay, ctaByPos, scrollDepth, timeOnPage, trafficChannel } = d;
  const pv = stats.pageviews;

  const funnelSteps = [
    { label:'👁 Lượt xem trang',         val:pv,                color:'#3b82f6', note:'pageviews' },
    { label:'🖱 Nhấn nút CTA',            val:stats.ctaClicks,   color:'#f97316', note:'unique sessions' },
    { label:'📋 Tương tác form',          val:stats.formOpens,   color:'#a855f7', note:'unique sessions' },
    { label:'✅ Đăng ký thành công',      val:stats.conversions, color:'#22c55e', note:'leads' }
  ];
  const funnelHTML = funnelSteps.map((f, i) => {
    const pct  = pv > 0 ? Math.min(100, Math.round(f.val / pv * 100)) : 0;
    const prev = funnelSteps[i-1];
    const drop = prev && prev.val > 0 ? Math.round((1 - f.val/prev.val)*100) : null;
    return `<div class="funnel-item">
      <div class="funnel-meta">
        <span class="funnel-label">${f.label} <span style="font-size:.65rem;color:var(--gray)">(${f.note})</span></span>
        <div class="funnel-nums">
          <span class="funnel-count" style="color:${f.color}">${fmt(f.val)}</span>
          <span class="f-rate">${pct}%</span>
        </div>
      </div>
      <div class="funnel-bar-track">
        <div class="funnel-bar" style="width:0%;background:${f.color}" data-w="${pct}"></div>
      </div>
      ${drop!==null?`<div class="funnel-drop">▼ Mất ${drop}% so với bước trên</div>`:''}
    </div>`;
  }).join('');

  const ctaHTML = Object.entries(ctaByPos).sort((a,b)=>b[1]-a[1])
    .map(([pos,cnt]) => `<div class="cta-row"><span class="cta-pos">${pos}</span><span class="cta-val">${cnt}</span></div>`).join('') ||
    '<p style="color:var(--gray);font-size:.82rem">Chưa có dữ liệu</p>';

  const sdColors = ['#14b8a6','#22c55e','#f5a623','#ef4444'];
  const scrollHTML = [25,50,75,90].map((dep,i) => {
    const cnt = scrollDepth[dep]||0;
    const pct = pv>0?Math.round(cnt/pv*100):0;
    return `<div style="text-align:center;background:var(--dark3);border-radius:8px;padding:10px 6px">
      <div style="font-size:1.1rem;font-weight:800;color:${sdColors[i]}">${pct}%</div>
      <div style="font-size:.65rem;color:var(--gray);margin-top:3px">cuộn ${dep}%</div>
      <div style="font-size:.68rem;color:var(--gray)">${cnt} sessions</div>
    </div>`;
  }).join('');

  document.getElementById('mainOverview').innerHTML = `
    <div class="stats-grid">
      <div class="stat-card blue">  <div class="stat-label">Lượt xem</div><div class="stat-value">${fmt(pv)}</div><div class="stat-sub">Pageviews</div></div>
      <div class="stat-card">       <div class="stat-label">Nhấn CTA</div><div class="stat-value" style="color:#f97316">${fmt(stats.ctaClicks)}</div><div class="stat-sub">${pv>0?((stats.ctaClicks/pv)*100).toFixed(0):0}% views · unique session</div></div>
      <div class="stat-card">       <div class="stat-label">Mở form</div><div class="stat-value" style="color:#a855f7">${fmt(stats.formOpens)}</div><div class="stat-sub">${pv>0?((stats.formOpens/pv)*100).toFixed(0):0}% views · unique session</div></div>
      <div class="stat-card green">  <div class="stat-label">Đăng ký</div><div class="stat-value">${fmt(stats.conversions)}</div><div class="stat-sub">Leads</div></div>
      <div class="stat-card gold">   <div class="stat-label">Tỷ lệ chuyển đổi</div><div class="stat-value">${stats.conversionRate}%</div><div class="stat-sub">View → Register</div></div>
      <div class="stat-card red">    <div class="stat-label">Exit Intent</div><div class="stat-value">${fmt(stats.exitIntent)}</div><div class="stat-sub">Desktop, unique session</div></div>
    </div>

    <div class="card" style="margin-bottom:14px">
      <div class="card-head">
        <span class="card-title">📜 Scroll Depth – tỷ lệ cuộn trang</span>
        <span class="card-note">% sessions đạt mốc / tổng pageviews – chi tiết ở tab Hành vi</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">${scrollHTML}</div>
    </div>

    <div class="row row-31">
      <div class="card">
        <div class="card-head"><span class="card-title">📅 Đăng ký 14 ngày gần nhất</span></div>
        <div class="chart-wrap" style="height:170px"><canvas id="chartReg"></canvas></div>
      </div>
      <div class="card">
        <div class="card-head"><span class="card-title">🖱 CTA theo vị trí</span></div>
        ${ctaHTML}
      </div>
    </div>

    <div class="row row-2">
      <div class="card">
        <div class="card-head">
          <span class="card-title">🔽 Funnel chuyển đổi</span>
          <span class="card-note">CTA → form → đăng ký</span>
        </div>
        ${funnelHTML}
      </div>
      <div class="card">
        <div class="card-head"><span class="card-title">🌐 Kênh truy cập (tất cả visitor)</span></div>
        <div class="chart-wrap" style="height:200px"><canvas id="chartChan"></canvas></div>
      </div>
    </div>`;

  setTimeout(() => {
    document.querySelectorAll('[data-w]').forEach(el => el.style.width = el.dataset.w + '%');
    charts.reg  = makeBarChart('chartReg',  Object.keys(regByDay).map(d=>{const dt=new Date(d);return (dt.getMonth()+1)+'/'+dt.getDate();}), Object.values(regByDay), '#22c55e', 'Đăng ký');
    charts.chan = makeDoughnut('chartChan', trafficChannel);
  }, 80);
}

// ════════════════════════════════════════════════════════════════════════
// TRAFFIC
// ════════════════════════════════════════════════════════════════════════
function renderTraffic(d) {
  const { trafficSource, trafficMedium, trafficChannel, leadsBySource, leadsByMedium, leadsByChannel, stats } = d;
  const pv = stats.pageviews;

  // Build combined source table
  const allSrc = new Set([...Object.keys(trafficSource), ...Object.keys(leadsBySource)]);
  const srcRows = [...allSrc].sort((a,b)=>(trafficSource[b]||0)-(trafficSource[a]||0)).map(src => {
    const visits = trafficSource[src]||0;
    const leads  = leadsBySource[src]||0;
    const cr     = visits > 0 ? ((leads/visits)*100).toFixed(1) : '–';
    return `<tr>
      <td>${src}</td>
      <td>${fmt(visits)}</td>
      <td style="color:var(--green);font-weight:600">${leads}</td>
      <td style="color:var(--gold)">${cr}${cr!=='–'?'%':''}</td>
    </tr>`;
  }).join('');

  const allMed = new Set([...Object.keys(trafficMedium), ...Object.keys(leadsByMedium)]);
  const medRows = [...allMed].sort((a,b)=>(trafficMedium[b]||0)-(trafficMedium[a]||0)).map(med => {
    const visits = trafficMedium[med]||0;
    const leads  = leadsByMedium[med]||0;
    const cr     = visits > 0 ? ((leads/visits)*100).toFixed(1) : '–';
    return `<tr>
      <td>${med}</td>
      <td>${fmt(visits)}</td>
      <td style="color:var(--green);font-weight:600">${leads}</td>
      <td style="color:var(--gold)">${cr}${cr!=='–'?'%':''}</td>
    </tr>`;
  }).join('');

  const chanColors = { 'Paid Search':'#f5a623','Organic Search':'#22c55e','Social':'#3b82f6',
    'Email':'#a855f7','Referral':'#14b8a6','Display':'#f97316','Direct':'#8b949e',
    'SMS':'#ec4899','Other Campaign':'#6b7280' };

  const allChan = new Set([...Object.keys(trafficChannel), ...Object.keys(leadsByChannel)]);
  const chanRows = [...allChan].sort((a,b)=>(trafficChannel[b]||0)-(trafficChannel[a]||0)).map(chan => {
    const visits = trafficChannel[chan]||0;
    const leads  = leadsByChannel[chan]||0;
    const cr     = visits > 0 ? ((leads/visits)*100).toFixed(1) : '–';
    const col    = chanColors[chan] || '#8b949e';
    return `<tr>
      <td><span class="badge-chan" style="background:${col}22;color:${col}">${chan}</span></td>
      <td>${fmt(visits)}</td>
      <td style="color:var(--green);font-weight:600">${leads}</td>
      <td style="color:var(--gold)">${cr}${cr!=='–'?'%':''}</td>
    </tr>`;
  }).join('');

  const thdr = `<thead><tr><th>Tên</th><th>Visitors</th><th>Leads</th><th>Conv. Rate</th></tr></thead>`;

  document.getElementById('mainTraffic').innerHTML = `
    <div class="row row-2">
      <div class="card">
        <div class="card-head"><span class="card-title">📣 Nguồn truy cập (utm_source)</span></div>
        <div class="chart-wrap" style="height:210px"><canvas id="chartSrc"></canvas></div>
      </div>
      <div class="card">
        <div class="card-head"><span class="card-title">📡 Kênh (utm_medium)</span></div>
        <div class="chart-wrap" style="height:210px"><canvas id="chartMed"></canvas></div>
      </div>
    </div>

    <div class="row row-2">
      <div class="card">
        <div class="card-head"><span class="card-title">🌐 Kênh phân loại (Channel Grouping)</span></div>
        <div class="chart-wrap" style="height:210px"><canvas id="chartChanPage"></canvas></div>
      </div>
      <div class="card">
        <div class="card-head">
          <span class="card-title">🌐 Hiệu suất theo kênh</span>
          <span class="card-note">visitor → lead</span>
        </div>
        <div class="table-wrap"><table class="traffic-table">${thdr}<tbody>${chanRows||'<tr><td colspan="4" style="text-align:center;color:var(--gray);padding:24px">Chưa có dữ liệu</td></tr>'}</tbody></table></div>
      </div>
    </div>

    <div class="row row-2">
      <div class="card">
        <div class="card-head"><span class="card-title">📣 Hiệu suất theo nguồn (Source)</span></div>
        <div class="table-wrap"><table class="traffic-table">${thdr}<tbody>${srcRows||'<tr><td colspan="4" style="text-align:center;color:var(--gray);padding:24px">Chưa có dữ liệu</td></tr>'}</tbody></table></div>
      </div>
      <div class="card">
        <div class="card-head"><span class="card-title">📡 Hiệu suất theo medium</span></div>
        <div class="table-wrap"><table class="traffic-table">${thdr}<tbody>${medRows||'<tr><td colspan="4" style="text-align:center;color:var(--gray);padding:24px">Chưa có dữ liệu</td></tr>'}</tbody></table></div>
      </div>
    </div>`;

  setTimeout(() => {
    charts.src      = makeDoughnut('chartSrc',      trafficSource);
    charts.med      = makeDoughnut('chartMed',      trafficMedium);
    charts.chanPage = makeDoughnut('chartChanPage', trafficChannel, chanColors);
  }, 80);
}

// ════════════════════════════════════════════════════════════════════════
// BEHAVIOR
// ════════════════════════════════════════════════════════════════════════
function renderBehavior(d) {
  const { scrollDepth, timeOnPage, stats } = d;
  const pv = stats.pageviews;
  const maxSD   = Math.max(...Object.values(scrollDepth), 1);
  const maxTime = Math.max(...Object.values(timeOnPage), 1);
  const sdColors   = ['#14b8a6','#22c55e','#f5a623','#ef4444'];
  const timeColors = ['#3b82f6','#a855f7','#f5a623'];

  const sdHTML = [25,50,75,90].map((dep, i) => {
    const cnt = scrollDepth[dep]||0;
    const pct = pv>0?Math.round(cnt/pv*100):0;
    const bw  = maxSD>0?Math.round(cnt/maxSD*100):0;
    return `<div class="hbar-row">
      <span class="hbar-lbl">${dep}%</span>
      <div class="hbar-track"><div class="hbar" style="width:0%;background:${sdColors[i]}" data-w="${bw}">${bw>15?pct+'%':''}</div></div>
      <span class="hbar-count">${cnt} sessions</span>
    </div>`;
  }).join('');

  const timeHTML = [
    [30,'30 giây'],[60,'1 phút'],[120,'2 phút']
  ].map(([s,lbl], i) => {
    const cnt = timeOnPage[s]||0;
    const pct = pv>0?Math.round(cnt/pv*100):0;
    const bw  = maxTime>0?Math.round(cnt/maxTime*100):0;
    return `<div class="hbar-row">
      <span class="hbar-lbl2">${lbl}</span>
      <div class="hbar-track"><div class="hbar" style="width:0%;background:${timeColors[i]}" data-w="${bw}">${bw>15?pct+'%':''}</div></div>
      <span class="hbar-count">${cnt} sessions</span>
    </div>`;
  }).join('');

  // Engagement quality metrics
  const q30 = pv>0?Math.round((timeOnPage[30]||0)/pv*100):0;
  const q60 = pv>0?Math.round((timeOnPage[60]||0)/pv*100):0;
  const q120= pv>0?Math.round((timeOnPage[120]||0)/pv*100):0;
  const s25 = pv>0?Math.round((scrollDepth[25]||0)/pv*100):0;
  const s75 = pv>0?Math.round((scrollDepth[75]||0)/pv*100):0;
  const s90 = pv>0?Math.round((scrollDepth[90]||0)/pv*100):0;

  document.getElementById('mainBehavior').innerHTML = `
    <div class="row row-2">
      <div class="card">
        <div class="card-head">
          <span class="card-title">📜 Scroll Depth</span>
          <span class="card-note">% sessions cuộn đến mốc</span>
        </div>
        ${sdHTML}
        <div style="margin-top:14px;display:grid;grid-template-columns:repeat(4,1fr);gap:8px;text-align:center">
          ${[25,50,75,90].map((d,i)=>`<div style="background:var(--dark3);border-radius:7px;padding:10px">
            <div style="font-size:1.1rem;font-weight:800;color:${sdColors[i]}">${pv>0?Math.round((scrollDepth[d]||0)/pv*100):0}%</div>
            <div style="font-size:.65rem;color:var(--gray);margin-top:3px">cuộn ${d}%</div>
          </div>`).join('')}
        </div>
      </div>
      <div class="card">
        <div class="card-head">
          <span class="card-title">⏱ Thời gian trên trang</span>
          <span class="card-note">Sessions đạt mốc</span>
        </div>
        ${timeHTML}
        <div style="margin-top:14px;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;text-align:center">
          ${[[30,'≥30s','#3b82f6'],[60,'≥1p','#a855f7'],[120,'≥2p','#f5a623']].map(([s,lbl,c])=>`<div style="background:var(--dark3);border-radius:7px;padding:10px">
            <div style="font-size:1.1rem;font-weight:800;color:${c}">${pv>0?Math.round((timeOnPage[s]||0)/pv*100):0}%</div>
            <div style="font-size:.65rem;color:var(--gray);margin-top:3px">${lbl}</div>
          </div>`).join('')}
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><span class="card-title">💡 Đánh giá chất lượng traffic</span></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px">
        ${[
          ['Bounce thấp (cuộn ≥25%)', s25+'%', s25>=50?'#22c55e':s25>=30?'#f5a623':'#ef4444', s25>=50?'Tốt':s25>=30?'Trung bình':'Cần cải thiện'],
          ['Content đọc (cuộn ≥75%)', s75+'%', s75>=30?'#22c55e':s75>=15?'#f5a623':'#ef4444', s75>=30?'Tốt':s75>=15?'Trung bình':'Cần cải thiện'],
          ['Đọc sâu (cuộn ≥90%)',     s90+'%', s90>=20?'#22c55e':s90>=10?'#f5a623':'#ef4444', s90>=20?'Tốt':s90>=10?'Trung bình':'Cần cải thiện'],
          ['Dừng lại ≥30s',           q30+'%', q30>=40?'#22c55e':q30>=20?'#f5a623':'#ef4444', q30>=40?'Tốt':q30>=20?'Trung bình':'Cần cải thiện'],
          ['Dừng lại ≥1 phút',        q60+'%', q60>=25?'#22c55e':q60>=10?'#f5a623':'#ef4444', q60>=25?'Tốt':q60>=10?'Trung bình':'Cần cải thiện'],
          ['Đọc kỹ ≥2 phút',          q120+'%',q120>=15?'#22c55e':q120>=5?'#f5a623':'#ef4444', q120>=15?'Tốt':q120>=5?'Trung bình':'Cần cải thiện'],
        ].map(([lbl,val,c,grade])=>`<div style="background:var(--dark3);border-radius:8px;padding:14px">
          <div style="font-size:1.3rem;font-weight:800;color:${c}">${val}</div>
          <div style="font-size:.75rem;color:var(--white);margin:4px 0">${lbl}</div>
          <div style="font-size:.68rem;color:${c}">${grade}</div>
        </div>`).join('')}
      </div>
    </div>`;

  setTimeout(() => document.querySelectorAll('[data-w]').forEach(el => el.style.width = el.dataset.w+'%'), 80);
}

// ════════════════════════════════════════════════════════════════════════
// LEADS
// ════════════════════════════════════════════════════════════════════════
function fmtRate(v) {
  return ((Number(v) || 0) * 100).toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
}

function fmtEpochMs(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return '–';
  return new Date(n).toLocaleString('vi-VN', { hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit', year:'numeric' });
}

const campaignTrainingByKey = {};
const campaignStageByLeadId = {};
const campaignEmailHtmlByKey = {};
