// Fills the pages/zoom-event templates with the admin settings: {{key}} is escaped
// text, {{{key}}} is markup built here. Rendering on the server keeps share previews
// (Zalo, Messenger) and the first paint correct without waiting for an API call.
const fs = require('fs');
const path = require('path');
const { PAGE_ID, REGIONS, SITE_URL, titleText } = require('./zoomEvent');
const { localPath } = require('./site');

const DEFAULT_BANNER = `/p/${PAGE_ID}/assets/hero-default.jpg`;
const DEFAULT_BANNER_MOBILE = `/p/${PAGE_ID}/assets/hero-default-mobile.jpg`;
const DEFAULT_SHARE =`/p/${PAGE_ID}/assets/share-default.jpg`;
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const absolute = url => /^https:\/\//.test(url) ? url : `${SITE_URL}${url}`;

const ICONS = {
  users: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0 2c-2.7 0-6 1.3-6 3.5V19h12v-2.5C14 14.3 10.7 13 8 13Zm8 0c-.4 0-.8 0-1.3.1 1.4.9 2.3 2.1 2.3 3.4V19h5v-2.5c0-2.2-3.3-3.5-6-3.5Z"/></svg>',
  bulb: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 21h6v-1.5H9V21Zm3-19a7 7 0 0 0-4 12.7V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.3A7 7 0 0 0 12 2Zm2.5 11.4-.5.3V16h-4v-2.3l-.5-.3a5 5 0 1 1 5 0Z"/></svg>',
  chart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h16v-2H4v2Zm1-4h3V9H5v7Zm5.5 0h3V5h-3v11Zm5.5 0h3v-5h-3v5Z"/></svg>',
  video: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h8A2.5 2.5 0 0 1 16 6.5v1.8l3.4-2.3A1 1 0 0 1 21 6.8v10.4a1 1 0 0 1-1.6.8L16 15.7v1.8a2.5 2.5 0 0 1-2.5 2.5h-8A2.5 2.5 0 0 1 3 17.5v-11Z"/></svg>',
  phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1L6.6 10.8Z"/></svg>',
  mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm0 2v.4l8 5 8-5V7H4Zm16 2.8-7.5 4.7a1 1 0 0 1-1 0L4 9.8V17h16V9.8Z"/></svg>',
  globe: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm6.9 6h-3a15.7 15.7 0 0 0-1.4-3.6A8 8 0 0 1 18.9 8ZM12 4c.8 1.2 1.5 2.5 1.9 4h-3.8c.4-1.5 1.1-2.8 1.9-4ZM4.3 14a8.2 8.2 0 0 1 0-4h3.4a16.5 16.5 0 0 0 0 4H4.3Zm.8 2h3a15.7 15.7 0 0 0 1.4 3.6A8 8 0 0 1 5.1 16Zm3-8h-3a8 8 0 0 1 4.4-3.6A15.7 15.7 0 0 0 8.1 8ZM12 20c-.8-1.2-1.5-2.5-1.9-4h3.8c-.4 1.5-1.1 2.8-1.9 4Zm2.3-6H9.7a14.7 14.7 0 0 1 0-4h4.6a14.7 14.7 0 0 1 0 4Zm.2 5.6c.6-1.1 1.1-2.3 1.4-3.6h3a8 8 0 0 1-4.4 3.6Zm1.8-5.6a16.5 16.5 0 0 0 0-4h3.4a8.2 8.2 0 0 1 0 4h-3.4Z"/></svg>',
  pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z"/></svg>',
};

// Event time in Vietnam, whatever the server's timezone.
function eventTime(settings) {
  if (!settings.starts_at) return null;
  const start = new Date(settings.starts_at);
  const part = (options) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', ...options }).format(start);
  return {
    time: part({ hour: '2-digit', minute: '2-digit', hour12: false }),
    date: part({ day: '2-digit', month: '2-digit', year: 'numeric' }),
    weekday: part({ weekday: 'long' }),
    starts_at: start.toISOString(),
    ends_at: new Date(start.getTime() + settings.duration_minutes * 60000).toISOString(),
  };
}

// Media Library banners are full-size JPG/PNG uploads. When WebP copies sit next to the
// upload (name.webp at up to 1920px, name-960.webp for phones), browsers get those
// instead; the settings, and so the share-image fingerprint, keep the original URL.
const STORAGE_PATH = (process.env.STORAGE_PUBLIC_PATH || '/storage').replace(/\/$/, '');
const STORAGE_ROOT = path.resolve(process.env.STORAGE_ROOT || path.join(__dirname, '..', 'storage'));
function webpSrcset(url) {
  // Media Library URLs are stored absolute (on any host of this site) or relative.
  const local = localPath(url);
  if (!local.startsWith(`${STORAGE_PATH}/`) || !/\.(jpe?g|png)$/i.test(local)) return '';
  const relative = decodeURIComponent(local.slice(STORAGE_PATH.length + 1)).replace(/\.(jpe?g|png)$/i, '');
  const file = path.resolve(STORAGE_ROOT, relative);
  if (!file.startsWith(STORAGE_ROOT + path.sep)) return '';
  const base = url.replace(/\.(jpe?g|png)$/i, '');
  return [['-960', '960w'], ['', '1920w']].filter(([suffix]) => fs.existsSync(`${file}${suffix}.webp`)).map(([suffix, width]) => `${base}${suffix}.webp ${width}`).join(', ');
}
const webpSource = (url, media = '') => {
  const srcset = webpSrcset(url);
  return srcset ? `<source type="image/webp"${media ? ` media="${media}"` : ''} srcset="${escape(srcset)}" sizes="100vw">` : '';
};

function picture(settings, className, alt) {
  const desktop = settings.banner_desktop || DEFAULT_BANNER;
  const mobile = settings.banner_mobile || (settings.banner_desktop ? desktop : DEFAULT_BANNER_MOBILE);
  const phone = '(max-width: 767px)';
  const mobileSources = mobile !== desktop ? `${webpSource(mobile, phone)}<source media="${phone}" srcset="${escape(mobile)}">` : '';
  return `<picture class="${className}">${mobileSources}${webpSource(desktop)}<img src="${escape(desktop)}" alt="${escape(alt)}" fetchpriority="high" decoding="async"></picture>`;
}

function footer(settings) {
  const items = [
    ['phone', 'Hotline', settings.footer_hotline, value => `tel:${value.replace(/[^\d+]/g, '')}`],
    ['mail', 'Email', settings.footer_email, value => `mailto:${value}`],
    ['globe', 'Website', settings.footer_website, value => /^https?:\/\//.test(value) ? value : `https://${value}`],
    ['pin', 'Địa chỉ', settings.footer_address, null],
  ].filter(([, , value]) => value).map(([icon, label, value, href]) => `<li class="footer-item">${ICONS[icon]}<div><small>${label}</small>${href ? `<a href="${escape(href(value))}"${icon === 'globe' ? ' target="_blank" rel="noopener"' : ''}>${escape(value)}</a>` : `<span>${escape(value)}</span>`}</div></li>`);
  const brand = settings.footer_company ? `<div class="footer-brand"><strong>${escape(settings.footer_company)}</strong>${settings.footer_tagline ? `<small>${escape(settings.footer_tagline)}</small>` : ''}</div>` : '';
  if (!brand && !items.length) return '';
  return `<footer class="site-footer"><div class="container footer-inner">${brand}${items.length ? `<ul class="footer-list">${items.join('')}</ul>` : ''}</div></footer>`;
}

// One headline line; *text* becomes the accent span (gold, or white on a gold line).
const titleLine = line => `<span class="title-line title-${line.style} title-${line.size}">${escape(line.text).replace(/\*([^*]+)\*/g, '<em class="title-mark">$1</em>').replace(/\*/g, '')}</span>`;

function viewModel(settings) {
  const time = eventTime(settings);
  const title = titleText(settings) || 'Sự kiện trực tuyến';
  const shareTitle = settings.share_title || `${title} | Phạm Thành Biên`;
  const shareDescription = settings.share_description || [settings.subtitle, time ? `${time.time} · ${time.date}` : ''].filter(Boolean).join(' — ');
  const shareImage = absolute(settings.share_image || (settings.hero_mode === 'image' && settings.banner_desktop) || DEFAULT_SHARE);
  const highlights = settings.highlights.map((text, i) => text ? `<li>${ICONS[['users', 'bulb', 'chart'][i]]}<span>${escape(text)}</span></li>` : '').join('');
  const composed = settings.hero_mode === 'composed';
  const hero = composed
    ? `<header class="hero hero--composed">${picture(settings, 'hero-bg', '')}<div class="hero-shade"></div><div class="container hero-copy">${settings.badge ? `<span class="badge">${ICONS.video}${escape(settings.badge)}</span>` : ''}<h1>${settings.title_lines.map(titleLine).join('')}</h1>${settings.subtitle ? `<p class="hero-sub">${escape(settings.subtitle)}</p>` : ''}${highlights ? `<ul class="highlights">${highlights}</ul>` : ''}</div></header>`
    : `<header class="hero hero--image"><h1 class="sr-only">${escape(title)}</h1>${picture(settings, 'hero-img', title)}</header>`;
  return {
    page_title: shareTitle, share_title: shareTitle, share_description: shareDescription, share_image: shareImage,
    canonical: `${SITE_URL}/zoom`, title, button_label: settings.button_label || 'Tham gia Zoom', privacy_note: settings.privacy_note,
    hero, footer: footer(settings),
    event_hidden: time ? '' : 'hidden', event_time: time?.time || '', event_date: time?.date || '', event_weekday: time?.weekday || '',
    starts_at: time?.starts_at || '', ends_at: time?.ends_at || '',
    region_options: REGIONS.map(region => `<option value="${escape(region)}">${escape(region)}</option>`).join(''),
  };
}

function render(html, settings) {
  const view = viewModel(settings);
  return html.replace(/\{\{\{\s*(\w+)\s*\}\}\}|\{\{\s*(\w+)\s*\}\}/g, (match, raw, text) => raw ? String(view[raw] ?? '') : escape(view[text] ?? ''));
}

module.exports = { render, viewModel, eventTime };
