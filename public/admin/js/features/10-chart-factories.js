function makeBarChart(id, labels, values, color, label) {
  const ctx = document.getElementById(id);
  if (!ctx) return null;
  return new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label, data: values, backgroundColor: color+'33', borderColor: color, borderWidth: 2, borderRadius: 4, borderSkipped: false }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } },
      scales: { x:{ grid:{ color:'rgba(255,255,255,.04)' }, ticks:{ maxRotation:0 } }, y:{ grid:{ color:'rgba(255,255,255,.04)' }, beginAtZero:true, ticks:{ precision:0, stepSize:1 } } } }
  });
}

function makeDoughnut(id, dataObj, colorMap) {
  const ctx = document.getElementById(id);
  if (!ctx) return null;
  const entries = Object.entries(dataObj).sort((a,b)=>b[1]-a[1]);
  if (!entries.length) { ctx.parentElement.innerHTML = '<p style="color:var(--gray);font-size:.82rem;padding:20px">Chưa có dữ liệu</p>'; return null; }
  const labels = entries.map(([k])=>k);
  const values = entries.map(([,v])=>v);
  const bgs = colorMap ? labels.map(l => (colorMap[l]||'#8b949e')+'bb') : COLORS.slice(0,labels.length).map(c=>c+'bb');
  const borders = colorMap ? labels.map(l => colorMap[l]||'#8b949e') : COLORS.slice(0,labels.length);
  return new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data:values, backgroundColor:bgs, borderColor:borders, borderWidth:1.5, hoverOffset:6 }] },
    options: { responsive:true, maintainAspectRatio:false, cutout:'60%',
      plugins: { legend:{ position:'right', labels:{ boxWidth:10, padding:10 } } } }
  });
}

// ════════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════════
