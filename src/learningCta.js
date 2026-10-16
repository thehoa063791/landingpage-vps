const crypto = require('crypto');
const { courseIds } = require('./learningCourses');

// Call-to-action cards on lesson pages. One library is shared by every course, stored in
// crm_settings; each CTA says per course which lessons show it (all, chapters or lessons).
const KEY = 'learning_ctas';
const TYPES = ['zalo', 'link', 'zoom', 'message'];
const TRIGGERS = ['time', 'percent', 'end'];
const DISPLAYS = ['card', 'overlay', 'popup'];
const REPEATS = ['every_view', 'once_per_lesson', 'once'];
// Card templates after daisyUI's card examples (daisyui.com/components/card), sizes and colours.
const VARIANTS = ['basic', 'badges', 'bottom', 'centered', 'plain', 'bordered', 'dash', 'color', 'neutral', 'close', 'side', 'imagefull', 'pricing'];
const SIZES = ['sm', 'md', 'lg'];
const COLORS = ['auto', 'zalo', 'indigo', 'amber', 'green', 'pink', 'red', 'neutral'];
const SCOPES = ['none', 'all', 'stages', 'lessons'];
const MAX_CTAS = 50;
const LIMITS = { name: 80, title: 120, body: 600, button_label: 40, url: 2048, image: 2048 };
const fail = message => Object.assign(new Error(message), { status: 400 });
const text = (value, max) => String(value ?? '').trim().slice(0, max);
// https links and paths of this website only; no javascript:, data: or protocol-relative URLs.
const safeUrl = value => /^https:\/\/[^\s<>"']+$/i.test(value) || /^\/(?![/\\])[^\s<>"']*$/.test(value);
// Lesson pages only load images from their own site (CSP img-src 'self'): Media Library files.
function mediaImage(value) {
  if (/^\/(?![/\\])[^\s<>"']*$/.test(value)) return true;
  // Media Library URLs start with PUBLIC_BASE_URL (src/db.js), which is http://localhost locally.
  const base = (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  return !!base && value.startsWith(`${base}/`) && /^[^\s<>"']+$/.test(value);
}
const newId = () => `cta_${crypto.randomBytes(6).toString('hex')}`;

function normalizeCta(raw = {}) {
  raw = raw && typeof raw === 'object' ? raw : {};
  const type = TYPES.includes(raw.type) ? raw.type : 'message';
  const trigger = TRIGGERS.includes(raw.trigger) ? raw.trigger : 'end';
  const targets = {};
  for (const course of courseIds()) {
    const target = raw.targets?.[course] || {};
    const scope = SCOPES.includes(target.scope) ? target.scope : 'none';
    const ids = scope === 'stages' || scope === 'lessons' ? (Array.isArray(target.ids) ? target.ids : []).map(Number).filter(id => Number.isSafeInteger(id) && id > 0) : [];
    targets[course] = { scope, ids: [...new Set(ids)].slice(0, 1000) };
  }
  const link = type !== 'message';
  return {
    id: /^cta_[a-z0-9]{6,32}$/.test(raw.id || '') ? raw.id : '',
    name: text(raw.name, LIMITS.name),
    enabled: raw.enabled !== false,
    type,
    title: text(raw.title, LIMITS.title),
    body: text(raw.body, LIMITS.body),
    button_label: link ? text(raw.button_label, LIMITS.button_label) : '',
    url: link ? text(raw.url, LIMITS.url) || (type === 'zoom' ? '/zoom' : '') : '',
    image: text(raw.image, LIMITS.image),
    trigger,
    trigger_value: trigger === 'end' ? 0 : Math.max(0, Math.round(Number(raw.trigger_value) || 0)),
    display: DISPLAYS.includes(raw.display) ? raw.display : 'card',
    variant: VARIANTS.includes(raw.variant) ? raw.variant : 'basic',
    size: SIZES.includes(raw.size) ? raw.size : 'md',
    color: COLORS.includes(raw.color) ? raw.color : 'auto',
    repeat: REPEATS.includes(raw.repeat) ? raw.repeat : 'once_per_lesson',
    hide_after_click: raw.hide_after_click !== false,
    targets,
    updated_at: text(raw.updated_at, 40),
  };
}

function validateCta(cta) {
  if (!cta.name) throw fail('Nhập tên CTA.');
  if (!cta.title) throw fail('Nhập tiêu đề hiển thị cho học viên.');
  if (cta.type !== 'message' && !cta.button_label) throw fail('Nhập chữ trên nút.');
  if (cta.type !== 'message' && !safeUrl(cta.url)) throw fail('Link phải bắt đầu bằng https:// hoặc / (trang trong website).');
  if (cta.image && !mediaImage(cta.image)) throw fail('Ảnh CTA phải chọn từ Media Library.');
  if (cta.trigger === 'percent' && (cta.trigger_value < 1 || cta.trigger_value > 100)) throw fail('Phần trăm đã xem phải từ 1 đến 100.');
  if (cta.trigger === 'time' && cta.trigger_value > 172800) throw fail('Thời điểm hiện CTA không hợp lệ.');
  for (const [course, target] of Object.entries(cta.targets)) {
    if (['stages', 'lessons'].includes(target.scope) && !target.ids.length) throw fail(`Chọn ít nhất một ${target.scope === 'stages' ? 'chương' : 'bài'} cho khóa ${course}, hoặc chọn "Không áp dụng".`);
  }
}

// Short-lived per-process cache: lesson lists are polled every 30 seconds by each learner.
const cache = new WeakMap();
const TTL = 15000;
async function listCtas(crm, { fresh = false } = {}) {
  if (typeof crm?.getCrmSetting !== 'function') return [];
  const hit = cache.get(crm);
  if (!fresh && hit && Date.now() - hit.at < TTL) return hit.value;
  const stored = await crm.getCrmSetting(KEY, {});
  const value = (Array.isArray(stored?.ctas) ? stored.ctas : []).map(normalizeCta).filter(cta => cta.id);
  cache.set(crm, { at: Date.now(), value });
  return value;
}
let writing = Promise.resolve();
// Read, change and write the library one change at a time.
function updateCtas(crm, mutate) {
  const run = writing.catch(() => {}).then(async () => {
    const next = await mutate(await listCtas(crm, { fresh: true }));
    await crm.setCrmSetting(KEY, { ctas: next });
    cache.set(crm, { at: Date.now(), value: next });
    return next;
  });
  writing = run;
  return run;
}

function appliesTo(cta, course, lesson) {
  const target = cta.targets[course];
  if (!cta.enabled || !target) return false;
  if (target.scope === 'all') return true;
  if (target.scope === 'lessons') return target.ids.includes(Number(lesson.id));
  if (target.scope === 'stages') return !!lesson.stage_id && target.ids.includes(Number(lesson.stage_id));
  return false;
}
// What a learner page needs; names, targets and timestamps stay in the admin.
const publicCta = cta => ({ id: cta.id, type: cta.type, title: cta.title, body: cta.body, button_label: cta.button_label, url: cta.url, image: cta.image, trigger: cta.trigger, trigger_value: cta.trigger_value, display: cta.display, variant: cta.variant, size: cta.size, color: cta.color, repeat: cta.repeat, hide_after_click: cta.hide_after_click });
const ctasForLesson = (ctas, course, lesson) => ctas.filter(cta => appliesTo(cta, course, lesson)).map(publicCta);

module.exports = { KEY, TYPES, TRIGGERS, DISPLAYS, REPEATS, VARIANTS, SIZES, COLORS, SCOPES, MAX_CTAS, normalizeCta, validateCta, listCtas, updateCtas, ctasForLesson, newId, fail };
