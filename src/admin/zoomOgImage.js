import React from 'react';
import { notify, Overlay } from './ui.js';

// Share image (Open Graph, 1200 × 630) drawn in the browser from the /zoom settings being
// edited: the desktop banner as background and, in composed mode, the badge, headline and
// event time styled like the landing hero. In image mode the banner already carries the
// text, so it is fitted whole over a blurred copy of itself.
const h = React.createElement;
export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;
const DEFAULT_BANNER = '/p/zoom-event/assets/hero-default.jpg';
const FONT = 'Be Vietnam Pro';
const FILLS = { white: ['#ffffff', '#ffffff'], blue: ['#8fd0ff', '#2f86ff'], gold: ['#ffe58a', '#f5a524'] };
const SIZES = { lg: 76, md: 70, sm: 44 };
const PAD = 72;
const MAX_TEXT = 760;

// Changes whenever something drawn on the image changes; stored with the generated image.
export function ogFingerprint(s) {
  const source = JSON.stringify([s.hero_mode, s.banner_desktop, s.badge, s.starts_at, (s.title_lines || []).map(l => [l.text, l.style, l.size])]);
  let hash = 5381;
  for (let i = 0; i < source.length; i++) hash = (hash * 33 + source.charCodeAt(i)) >>> 0;
  return `og1-${hash.toString(36)}`;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Không tải được ảnh banner. Nếu ảnh nằm ngoài Media Library, hãy tải ảnh lên thư viện rồi chọn lại.'));
    image.src = url;
  });
}

let fontReady = null;
function loadFont(text) {
  if (!fontReady) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@600;700;800&display=swap';
    fontReady = new Promise(resolve => { link.onload = resolve; link.onerror = resolve; document.head.appendChild(link); });
  }
  // Loads only the unicode ranges (Vietnamese marks) the text needs; never blocks for long.
  return fontReady.then(() => Promise.race([
    Promise.all(['600', '700', '800'].map(weight => document.fonts.load(`${weight} 40px "${FONT}"`, text || 'Ậ'))),
    new Promise(resolve => setTimeout(resolve, 4000)),
  ]));
}

function eventLabel(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  const part = options => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', ...options }).format(date);
  const weekday = part({ weekday: 'long' });
  return `${part({ hour: '2-digit', minute: '2-digit', hour12: false })} · ${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${part({ day: '2-digit', month: '2-digit', year: 'numeric' })}`;
}

function cover(ctx, image, focusX = 0.5) {
  const scale = Math.max(OG_WIDTH / image.naturalWidth, OG_HEIGHT / image.naturalHeight);
  const w = image.naturalWidth * scale, hgt = image.naturalHeight * scale;
  ctx.drawImage(image, (OG_WIDTH - w) * focusX, (OG_HEIGHT - hgt) / 2, w, hgt);
}

function roundRect(ctx, x, y, w, hgt, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + hgt, r); ctx.arcTo(x + w, y + hgt, x, y + hgt, r);
  ctx.arcTo(x, y + hgt, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// Headline lines → wrapped rows of words; *text* words carry the accent colour.
function layoutTitle(ctx, lines, scale) {
  const rows = [];
  for (const line of lines) {
    const size = Math.round(SIZES[line.size] * scale);
    ctx.font = `800 ${size}px "${FONT}"`;
    const accent = line.style === 'gold' ? 'white' : 'gold';
    const words = line.text.split(/(\*[^*]+\*)/).flatMap(part => {
      const marked = /^\*[^*]+\*$/.test(part);
      return part.replace(/\*/g, '').split(/\s+/).filter(Boolean).map(text => ({ text, style: marked ? accent : line.style }));
    });
    const space = ctx.measureText(' ').width;
    let row = { size, words: [], width: 0 };
    for (const word of words) {
      const width = ctx.measureText(word.text).width;
      if (row.words.length && row.width + space + width > MAX_TEXT) { rows.push(row); row = { size, words: [], width: 0 }; }
      row.words.push({ ...word, width });
      row.width += (row.words.length > 1 ? space : 0) + width;
    }
    if (row.words.length) rows.push(row);
  }
  return rows;
}

export async function drawOgImage(canvas, settings) {
  const lines = (settings.title_lines || []).filter(line => line.text.trim());
  const time = eventLabel(settings.starts_at);
  await loadFont(lines.map(l => l.text).join(' ') + (settings.badge || '') + time);
  const image = await loadImage(settings.banner_desktop || DEFAULT_BANNER);
  canvas.width = OG_WIDTH; canvas.height = OG_HEIGHT;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#040d22'; ctx.fillRect(0, 0, OG_WIDTH, OG_HEIGHT);

  if (settings.hero_mode === 'image') {
    ctx.save(); ctx.filter = 'blur(28px) brightness(.55)'; cover(ctx, image); ctx.restore();
    const scale = Math.min(OG_WIDTH / image.naturalWidth, OG_HEIGHT / image.naturalHeight);
    const w = image.naturalWidth * scale, hgt = image.naturalHeight * scale;
    ctx.drawImage(image, (OG_WIDTH - w) / 2, (OG_HEIGHT - hgt) / 2, w, hgt);
    return;
  }

  // Banner placed like the landing (subject on the right) under the same left-to-right shade.
  cover(ctx, image, 0.7);
  const shade = ctx.createLinearGradient(0, 0, OG_WIDTH, 0);
  shade.addColorStop(0, 'rgba(4, 13, 34, .96)'); shade.addColorStop(0.4, 'rgba(7, 26, 61, .88)');
  shade.addColorStop(0.68, 'rgba(11, 37, 87, .45)'); shade.addColorStop(1, 'rgba(4, 13, 34, .12)');
  ctx.fillStyle = shade; ctx.fillRect(0, 0, OG_WIDTH, OG_HEIGHT);
  const bottom = ctx.createLinearGradient(0, OG_HEIGHT, 0, OG_HEIGHT * 0.55);
  bottom.addColorStop(0, 'rgba(4, 13, 34, .7)'); bottom.addColorStop(1, 'rgba(4, 13, 34, 0)');
  ctx.fillStyle = bottom; ctx.fillRect(0, 0, OG_WIDTH, OG_HEIGHT);

  // Shrink so each headline line stays on one row (down to 70%), wrap only beyond that, then
  // shrink further until badge + headline + time fit inside the card with margins.
  const BADGE = settings.badge ? 46 + 26 : 0, TIME = time ? 30 + 54 : 0;
  let scale = 1, rows = layoutTitle(ctx, lines, scale);
  while (scale > 0.7 && rows.length > lines.length) { scale -= 0.05; rows = layoutTitle(ctx, lines, scale); }
  const titleHeight = list => list.reduce((sum, row) => sum + row.size * 1.14, 0);
  while (scale > 0.5 && BADGE + titleHeight(rows) + TIME > OG_HEIGHT - 2 * 64) { scale -= 0.05; rows = layoutTitle(ctx, lines, scale); }
  let y = (OG_HEIGHT - (BADGE + titleHeight(rows) + TIME)) / 2;

  ctx.textBaseline = 'alphabetic';
  if (settings.badge) {
    ctx.font = `700 19px "${FONT}"`;
    const text = settings.badge.toUpperCase(), width = ctx.measureText(text).width + 44;
    roundRect(ctx, PAD, y, width, 46, 23);
    ctx.fillStyle = 'rgba(47, 123, 255, .28)'; ctx.fill();
    ctx.strokeStyle = 'rgba(124, 192, 255, .6)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.fillText(text, PAD + 22, y + 30);
    y += BADGE;
  }
  for (const row of rows) {
    const lineHeight = row.size * 1.14, baseline = y + row.size * 0.98;
    ctx.font = `800 ${row.size}px "${FONT}"`;
    const space = ctx.measureText(' ').width;
    let x = PAD;
    for (const word of row.words) {
      const [top, end] = FILLS[word.style] || FILLS.white;
      const fill = ctx.createLinearGradient(0, baseline - row.size * 0.85, 0, baseline + row.size * 0.15);
      fill.addColorStop(0, top); fill.addColorStop(1, end);
      ctx.fillStyle = fill; ctx.fillText(word.text, x, baseline);
      x += word.width + space;
    }
    y += lineHeight;
  }
  if (time) {
    y += 30;
    ctx.font = `600 24px "${FONT}"`;
    const width = ctx.measureText(time).width + 48;
    roundRect(ctx, PAD, y, width, 54, 14);
    ctx.fillStyle = 'rgba(255, 255, 255, .12)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, .28)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.fillText(time, PAD + 24, y + 35);
  }
}

// Preview dialog: the generated image plus how the link looks when shared; nothing is used
// until "Dùng ảnh này".
export function OgImageDialog({ settings, shareTitle, shareDescription, ui, onUse, onClose }) {
  const { Button } = ui;
  // The dialog renders in a portal, so the canvas appears after the first effect; draw once it exists.
  const canvas = React.useRef(null);
  const [mounted, setMounted] = React.useState(false);
  const attach = React.useCallback(node => { canvas.current = node; setMounted(!!node); }, []);
  const [state, setState] = React.useState({ status: 'drawing', error: '', preview: '' });
  const [using, setUsing] = React.useState(false);
  const draw = React.useCallback(() => {
    setState({ status: 'drawing', error: '', preview: '' });
    drawOgImage(canvas.current, settings)
      .then(() => {
        try { setState({ status: 'ready', error: '', preview: canvas.current.toDataURL('image/jpeg', 0.7) }); }
        catch { throw new Error('Trình duyệt chặn đọc ảnh banner (CORS). Hãy tải banner lên Media Library rồi chọn lại.'); }
      })
      .catch(e => setState({ status: 'error', error: e.message, preview: '' }));
  }, [settings]);
  React.useEffect(() => { if (mounted) draw(); }, [draw, mounted]);
  async function use() {
    setUsing(true);
    try {
      const blob = await new Promise((resolve, reject) => canvas.current.toBlob(b => b ? resolve(b) : reject(new Error('Không xuất được ảnh.')), 'image/jpeg', 0.88));
      await onUse(new File([blob], `og-zoom-${Date.now()}.jpg`, { type: 'image/jpeg' }));
    } catch (e) { notify(e.message, true); }
    finally { setUsing(false); }
  }
  const host = location.host;
  return h(Overlay, { className: 'drawer-layer' },
    h('button', { className: 'drawer-backdrop', onClick: onClose, 'aria-label': 'Đóng' }),
    h('div', { className: 'lead-drawer-react wide ze-og', role: 'dialog', 'aria-labelledby': 'ze-og-title' },
      h('div', { className: 'drawer-head-react' }, h('div', null, h('h2', { id: 'ze-og-title' }, 'Tạo ảnh chia sẻ tự động'), h('p', null, `${OG_WIDTH} × ${OG_HEIGHT} px · từ tiêu đề, banner máy tính và giờ sự kiện đang nhập`)), h(Button, { variant: 'ghost', onClick: onClose }, 'Đóng')),
      h('div', { className: 'drawer-body-react' },
        settings.hero_mode === 'image' ? h('p', { className: 'ze-muted' }, 'Kiểu "Ảnh có sẵn chữ": banner đã có tiêu đề nên ảnh chia sẻ dùng nguyên banner, không chèn thêm chữ.') : null,
        h('div', { className: 'ze-og-stage' },
          h('canvas', { ref: attach, width: OG_WIDTH, height: OG_HEIGHT, 'aria-label': 'Ảnh chia sẻ', hidden: state.status === 'error' }),
          state.status === 'drawing' ? h('div', { className: 'ze-og-busy' }, 'Đang tạo ảnh…') : null,
          state.status === 'error' ? h('div', { role: 'alert', className: 'ze-alert' }, state.error) : null),
        state.status === 'ready' ? h('div', { className: 'ze-og-card', 'aria-label': 'Xem trước khi chia sẻ link' },
          h('small', null, 'Khi gửi link trên Zalo / Messenger / Facebook'),
          h('div', { className: 'ze-og-share' },
            h('img', { src: state.preview, alt: '' }),
            h('div', null, h('span', null, host.toUpperCase()), h('strong', null, shareTitle), h('p', null, shareDescription)))) : null,
        h('div', { className: 'modal-actions' },
          h(Button, { variant: 'outline', disabled: state.status === 'drawing' || using, onClick: draw }, 'Tạo lại'),
          h(Button, { disabled: state.status !== 'ready' || using, onClick: use }, using ? 'Đang lưu ảnh…' : 'Dùng ảnh này')))));
}
