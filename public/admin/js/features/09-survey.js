async function renderSurvey() {
  document.getElementById('mainSurvey').innerHTML = '<div class="loading"><div class="spin"></div> Đang tải khảo sát...</div>';
  let d;
  try {
    const res = await fetch('/admin/survey');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    d = await res.json();
  } catch(e) {
    document.getElementById('mainSurvey').innerHTML = '<div class="loading">❌ Lỗi tải dữ liệu khảo sát</div>';
    return;
  }

  const { total, q1, q2, q3, q4, q5, q6, q7, q8, q9, interest, totalWithInterest } = d;

  const noData = () => `<div style="color:var(--gray);font-size:.82rem;padding:16px 0;text-align:center">Chưa có dữ liệu</div>`;

  // Build horizontal bar rows from a counts object
  // pctBase: denominator for %; defaults to survey `total` (respondents)
  function surveyBars(counts, colors, pctBase) {
    const entries = Object.entries(counts).sort((a,b) => b[1]-a[1]);
    if (!entries.length) return noData();
    const max = entries[0][1];
    const base = (pctBase != null ? pctBase : total) || 1;
    return entries.map(([label, cnt], i) => {
      const bw  = max > 0 ? Math.round(cnt/max*100) : 0;
      const pct = Math.round(cnt/base*100);
      const col = (
        Array.isArray(colors)
          ? colors[i % colors.length]
          : (colors && typeof colors === 'object' ? colors[label] : colors)
      ) || COLORS[i % COLORS.length];
      return `<div style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
          <span style="font-size:.8rem;color:var(--white);line-height:1.4;flex:1;padding-right:12px">${label}</span>
          <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
            <span style="font-size:.85rem;font-weight:700;color:${col}">${cnt}</span>
            <span style="font-size:.7rem;padding:2px 7px;border-radius:4px;background:${col}22;color:${col}">${pct}%</span>
          </div>
        </div>
        <div class="hbar-track" style="background:${col}18"><div class="hbar" style="width:0%;background:linear-gradient(90deg, ${col}, ${col}cc);box-shadow:0 0 14px ${col}55" data-w="${bw}"></div></div>
      </div>`;
    }).join('');
  }

  // Text response list
  function textList(arr) {
    if (!arr.length) return noData();
    return arr.slice(0, 30).map(t =>
      `<div style="padding:10px 14px;background:var(--dark3);border-radius:8px;font-size:.82rem;line-height:1.6;color:var(--white);margin-bottom:8px">"${t}"</div>`
    ).join('') + (arr.length > 30 ? `<div style="font-size:.75rem;color:var(--gray);text-align:center;padding:8px">+ ${arr.length-30} phản hồi khác</div>` : '');
  }

  const Q_COLORS = {
    q1: ['#3b82f6','#a855f7','#22c55e'],
    q2: ['#ef4444','#f97316','#f5a623','#14b8a6','#8b949e'],
    q3: ['#f97316','#ec4899','#f5a623','#ef4444','#8b949e'],
    q4: ['#22c55e','#3b82f6','#a855f7','#14b8a6','#f5a623'],
    q5: ['#8b949e','#f5a623','#22c55e'],
    q6: ['#3b82f6','#f5a623','#22c55e'],
    q7: ['#ef4444','#f97316','#a855f7','#14b8a6'],
  };

  const topQ1 = Object.entries(q1).sort((a,b)=>b[1]-a[1])[0];
  const topQ2 = Object.entries(q2).sort((a,b)=>b[1]-a[1])[0];
  const topQ7 = Object.entries(q7).sort((a,b)=>b[1]-a[1])[0];

  document.getElementById('mainSurvey').innerHTML = `

    <!-- ── Tổng quan ── -->
    <div class="stats-grid" style="margin-bottom:16px">
      <div class="stat-card blue">
        <div class="stat-label">Tổng phản hồi</div>
        <div class="stat-value">${fmt(total)}</div>
        <div class="stat-sub">khảo sát đã gửi</div>
      </div>
      <div class="stat-card gold">
        <div class="stat-label">Kỳ vọng tự do</div>
        <div class="stat-value">${fmt(q8.length)}</div>
        <div class="stat-sub">người điền Q8</div>
      </div>
      <div class="stat-card purple">
        <div class="stat-label">Ưu tiên tự do</div>
        <div class="stat-value">${fmt(q9.length)}</div>
        <div class="stat-sub">người điền Q9</div>
      </div>
      ${topQ1 ? `<div class="stat-card green">
        <div class="stat-label">Giai đoạn phổ biến nhất</div>
        <div class="stat-value" style="font-size:.95rem;line-height:1.3">${topQ1[0].split(' ').slice(0,4).join(' ')}…</div>
        <div class="stat-sub">${topQ1[1]} người (${total>0?Math.round(topQ1[1]/total*100):0}%)</div>
      </div>` : ''}
      ${topQ7 ? `<div class="stat-card red">
        <div class="stat-label">Lo ngại hàng đầu</div>
        <div class="stat-value" style="font-size:.95rem;line-height:1.3">${topQ7[0].split(' ').slice(0,3).join(' ')}…</div>
        <div class="stat-sub">${topQ7[1]} người (${total>0?Math.round(topQ7[1]/total*100):0}%)</div>
      </div>` : ''}
    </div>

    <!-- ── Lĩnh vực quan tâm ── -->
    <div class="section-sep">📈 Lĩnh vực quan tâm (từ đăng ký)</div>
    <div class="row row-2" style="margin-bottom:14px">
      <div class="card">
        <div class="card-head">
          <span class="card-title">Phân bổ thị trường quan tâm</span>
          <span class="card-note">${fmt(totalWithInterest || 0)} leads</span>
        </div>
        ${surveyBars(interest || {}, { 'Forex':'#f5a623', 'Vàng':'#f59e0b', 'Chứng khoán':'#22c55e', 'Crypto':'#3b82f6' }, totalWithInterest)}
      </div>
      <div class="card">
        <div class="card-head">
          <span class="card-title">Biểu đồ lĩnh vực</span>
        </div>
        <div class="chart-wrap" style="height:220px"><canvas id="chartInterest"></canvas></div>
      </div>
    </div>

    <!-- ── Q1 + Q2 ── -->
    <div class="row row-2">
      <div class="card">
        <div class="card-head">
          <span class="card-title">1. Hiện tại bạn đang ở giai đoạn nào?</span>
          <span class="card-note">${Object.values(q1).reduce((s,v)=>s+v,0)} lựa chọn</span>
        </div>
        ${surveyBars(q1, Q_COLORS.q1)}
      </div>
      <div class="card">
        <div class="card-head">
          <span class="card-title">2. Vấn đề lớn nhất hiện tại là gì?</span>
          <span class="card-note">${Object.values(q2).reduce((s,v)=>s+v,0)} lựa chọn</span>
        </div>
        ${surveyBars(q2, Q_COLORS.q2)}
      </div>
    </div>

    <!-- ── Q3 + Q4 ── -->
    <div class="row row-2">
      <div class="card">
        <div class="card-head">
          <span class="card-title">3. Khi giao dịch, lỗi thường gặp là gì?</span>
          <span class="card-note">${Object.values(q3).reduce((s,v)=>s+v,0)} lựa chọn</span>
        </div>
        ${surveyBars(q3, Q_COLORS.q3)}
      </div>
      <div class="card">
        <div class="card-head">
          <span class="card-title">4. Mục tiêu khi tham gia chương trình 14 ngày?</span>
          <span class="card-note">${Object.values(q4).reduce((s,v)=>s+v,0)} lựa chọn</span>
        </div>
        ${surveyBars(q4, Q_COLORS.q4)}
      </div>
    </div>

    <!-- ── Q5 + Q6 + Q7 (biểu đồ donut) ── -->
    <div class="row row-3">
      <div class="card">
        <div class="card-head">
          <span class="card-title">5. Đã từng học ở đâu chưa?</span>
          <span class="card-note">${Object.values(q5).reduce((s,v)=>s+v,0)} lựa chọn</span>
        </div>
        <div class="chart-wrap" style="height:180px"><canvas id="chartSurveyQ5"></canvas></div>
      </div>
      <div class="card">
        <div class="card-head">
          <span class="card-title">6. Thời gian học/tuần</span>
          <span class="card-note">${Object.values(q6).reduce((s,v)=>s+v,0)} lựa chọn</span>
        </div>
        <div class="chart-wrap" style="height:180px"><canvas id="chartSurveyQ6"></canvas></div>
      </div>
      <div class="card">
        <div class="card-head">
          <span class="card-title">7. Lo ngại lớn nhất?</span>
          <span class="card-note">${Object.values(q7).reduce((s,v)=>s+v,0)} lựa chọn</span>
        </div>
        <div class="chart-wrap" style="height:180px"><canvas id="chartSurveyQ7"></canvas></div>
      </div>
    </div>

    <!-- ── Q7 detail bars ── -->
    <div class="card" style="margin-bottom:14px">
      <div class="card-head">
        <span class="card-title">7. Chi tiết lo ngại</span>
        <span class="card-note">Phân tích rào cản tâm lý khách hàng</span>
      </div>
      ${surveyBars(q7, Q_COLORS.q7)}
    </div>

    <!-- ── Q8 text responses ── -->
    <div class="row row-2">
      <div class="card">
        <div class="card-head">
          <span class="card-title">8. Kỳ vọng khi tham gia (tự do)</span>
          <span class="card-note">${q8.length} phản hồi</span>
        </div>
        <div style="max-height:320px;overflow-y:auto">${textList(q8)}</div>
      </div>
      <div class="card">
        <div class="card-head">
          <span class="card-title">9. Điều ưu tiên muốn đạt được (tự do)</span>
          <span class="card-note">${q9.length} phản hồi</span>
        </div>
        <div style="max-height:320px;overflow-y:auto">${textList(q9)}</div>
      </div>
    </div>
  `;

  setTimeout(() => {
    document.querySelectorAll('[data-w]').forEach(el => el.style.width = el.dataset.w + '%');

    const INT_COL = { 'Forex':'#f5a623', 'Vàng':'#f59e0b', 'Chứng khoán':'#22c55e', 'Crypto':'#3b82f6' };
    const Q5_COL = { 'Chưa từng học': '#8b949e', 'Tự học qua Sách/YouTube/Facebook/TikTok': '#f5a623', 'Đã từng tham gia lớp học/workshop': '#22c55e' };
    const Q6_COL = { 'Dưới 1 giờ': '#3b82f6', '1–5 giờ': '#f5a623', 'Trên 5 giờ': '#22c55e' };
    const Q7_COL = { 'Sợ mất tiền': '#ef4444', 'Sợ không hiểu kiến thức kỹ thuật': '#f97316', 'Sợ lại học xong nhưng không áp dụng được': '#a855f7', 'Sợ thị trường quá khó với người mới': '#14b8a6' };

    if (interest && Object.keys(interest).length) charts.interest = makeDoughnut('chartInterest', interest, INT_COL);
    if (Object.keys(q5).length) charts.surveyQ5 = makeDoughnut('chartSurveyQ5', q5, Q5_COL);
    if (Object.keys(q6).length) charts.surveyQ6 = makeDoughnut('chartSurveyQ6', q6, Q6_COL);
    if (Object.keys(q7).length) charts.surveyQ7 = makeDoughnut('chartSurveyQ7', q7, Q7_COL);
  }, 80);
}

// ════════════════════════════════════════════════════════════════════════
// CHART FACTORIES
// ════════════════════════════════════════════════════════════════════════
