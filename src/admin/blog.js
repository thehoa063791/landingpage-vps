import React from 'react';
import { Select, Skeleton, notify, confirmAction, requestText, Overlay } from './ui.js';
import { MediaPicker } from './zoomEvent.js';
import { analyze, textWidth, fullTitle, TITLE_PX, DESC_PX } from '../blog/seoRules.js';
import { slugify } from '../blog/slug.js';
import './blog.css';

// Growth > Blog (docs/blog-seo-plan.md §6): posts, categories, tags, authors. The editor is
// TipTap from public/admin/blog-editor.js (loaded on first use); SEO checks run as the writer
// types (src/blog/seoRules.js, the same rules the server applies when publishing). Unsaved
// edits autosave as a draft every 10 s; the live post changes only on Lưu / Đăng / Cập nhật.
const h = React.createElement;
const fmt = n => new Intl.NumberFormat('vi-VN').format(Number(n || 0));
const when = value => (value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const STATUS = { draft: ['Nháp', 'neutral'], scheduled: ['Hẹn giờ', 'info'], published: ['Đã đăng', 'success'], archived: ['Đã gỡ', 'warning'] };
const Badge = ({ tone = 'neutral', children }) => h('span', { className: `ui-badge ui-badge-${tone}` }, children);
const scoreTone = (score, errors) => (errors ? 'critical' : score >= 80 ? 'success' : score >= 50 ? 'warning' : 'critical');
const AUTOSAVE_MS = 10000;
const FIELDS = ['title', 'slug', 'html', 'content_json', 'excerpt', 'cover_image', 'cover_alt', 'cover_width', 'cover_height', 'seo_title', 'meta_description', 'focus_keyword', 'canonical_url', 'robots', 'og_image', 'category_id', 'author_id', 'tags', 'scheduled_at'];

function useLoad(path, apiFetch, key) {
  const [state, setState] = React.useState({ loading: true, error: '', data: null });
  React.useEffect(() => {
    let live = true;
    setState(s => ({ ...s, loading: true, error: '' }));
    apiFetch(path).then(data => { if (live) setState({ loading: false, error: '', data }); }).catch(e => { if (live) setState(s => ({ loading: false, error: e.message, data: s.data })); });
    return () => { live = false; };
  }, [path, apiFetch, key]);
  return state;
}

// ?post=<id> in the address opens the editor, so a post can be linked and reloaded.
const readPostParam = () => new URLSearchParams(location.search).get('post') || '';
function setPostParam(id) {
  const url = new URL(location.href);
  if (id) url.searchParams.set('post', id); else url.searchParams.delete('post');
  history.pushState(null, '', url);
}

export default function BlogPage({ apiFetch, ui }) {
  const [postId, setPostId] = React.useState(readPostParam);
  const [tab, setTab] = React.useState('posts');
  React.useEffect(() => { const sync = () => setPostId(readPostParam()); window.addEventListener('popstate', sync); return () => window.removeEventListener('popstate', sync); }, []);
  const open = id => { setPostParam(id); setPostId(id); };
  if (postId) return h(PostEditor, { key: postId, id: postId, apiFetch, ui, onClose: () => open('') });
  const tabs = [['posts', 'Bài viết'], ['categories', 'Chuyên mục'], ['tags', 'Tag'], ['authors', 'Tác giả']];
  return h('div', { className: 'bl-page' },
    h('div', { className: 'bl-title-row' }, h('div', { className: 'bl-grow' }, h('h1', null, 'Blog'), h('p', { className: 'bl-muted bl-small' }, 'Bài viết chuẩn SEO trên /blog. Trước khi đổi tên miền, blog để noindex.')),
      tab === 'posts' ? h(ui.Button, { onClick: async () => { try { const post = await apiFetch('/admin/blog/posts', { method: 'POST', quiet: true, body: JSON.stringify({ title: 'Bài viết mới' }) }); open(post.id); } catch { /* shown */ } } }, 'Viết bài mới') : null),
    h('div', { className: 'bl-tabs', role: 'tablist' }, tabs.map(([id, label]) => h('button', { key: id, type: 'button', role: 'tab', className: 'bl-tab', 'aria-selected': tab === id, onClick: () => setTab(id) }, label))),
    tab === 'posts' ? h(PostList, { apiFetch, ui, onOpen: open })
      : tab === 'categories' ? h(Categories, { apiFetch, ui })
      : tab === 'tags' ? h(Tags, { apiFetch, ui })
      : h(Authors, { apiFetch, ui }));
}

function PostList({ apiFetch, ui, onOpen }) {
  const [status, setStatus] = React.useState('');
  const [category, setCategory] = React.useState('');
  const [q, setQ] = React.useState('');
  const [term, setTerm] = React.useState('');
  React.useEffect(() => { const t = setTimeout(() => setTerm(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const list = useLoad(`/admin/blog/posts?${new URLSearchParams({ status, category, q: term })}`, apiFetch);
  const categories = useLoad('/admin/blog/categories', apiFetch);
  const rows = list.data?.rows || [];
  return h(React.Fragment, null,
    h('div', { className: 'bl-bar' },
      h(ui.Input, { type: 'search', value: q, placeholder: 'Tìm theo tiêu đề hoặc đường dẫn', 'aria-label': 'Tìm bài viết', onChange: e => setQ(e.target.value) }),
      h(Select, { className: 'ui-input bl-filter', value: status, 'aria-label': 'Trạng thái', onChange: e => setStatus(e.target.value) }, h('option', { value: '' }, 'Mọi trạng thái'), ...Object.entries(STATUS).map(([id, [label]]) => h('option', { key: id, value: id }, label))),
      h(Select, { className: 'ui-input bl-filter', value: category, 'aria-label': 'Chuyên mục', onChange: e => setCategory(e.target.value) }, h('option', { value: '' }, 'Mọi chuyên mục'), ...(categories.data || []).map(c => h('option', { key: c.id, value: c.id }, c.name)))),
    list.error ? h('div', { className: 'bl-empty', role: 'alert' }, list.error) : list.loading && !list.data ? h(Skeleton) :
      h('div', { className: 'bl-table-wrap' }, h('table', { className: 'bl-table' },
        h('thead', null, h('tr', null, ['Bài viết', 'Trạng thái', 'Chuyên mục', 'Ngày đăng', 'SEO', 'Xem 30 ngày'].map(label => h('th', { key: label, scope: 'col', className: label === 'Xem 30 ngày' ? 'bl-num' : '' }, label)))),
        h('tbody', null, rows.length ? rows.map(row => h('tr', { key: row.id },
          h('td', null, h('button', { type: 'button', className: 'bl-post-link', onClick: () => onOpen(row.id) }, row.title || 'Chưa có tiêu đề'), h('div', { className: 'bl-slug' }, `/blog/${row.slug}`, row.draft_saved_at ? ' · có bản tự lưu chưa lưu' : '')),
          h('td', null, h(Badge, { tone: STATUS[row.status]?.[1] }, STATUS[row.status]?.[0] || row.status)),
          h('td', null, row.category_name || '—'),
          h('td', null, row.status === 'scheduled' ? `Hẹn ${when(row.scheduled_at)}` : when(row.published_at)),
          h('td', null, h(Badge, { tone: scoreTone(row.seo_score, row.seo_errors) }, row.seo_errors ? `${row.seo_score} · ${row.seo_errors} lỗi` : row.seo_score)),
          h('td', { className: 'bl-num' }, fmt(row.views_30d))))
          : h('tr', null, h('td', { colSpan: 6, className: 'bl-empty' }, term || status || category ? 'Không có bài khớp bộ lọc.' : 'Chưa có bài viết. Bấm "Viết bài mới" để bắt đầu.'))))));
}

// ── Editor ──
let editorScript;
function loadEditorScript() {
  if (window.BlogEditor) return Promise.resolve();
  if (!editorScript) {
    const shell = document.querySelector('script[src*="react-shell.js"]')?.src || '';
    const version = new URL(shell || location.href, location.href).searchParams.get('v') || '';
    editorScript = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `/admin/blog-editor.js${version ? `?v=${encodeURIComponent(version)}` : ''}`;
      script.onload = () => resolve(); script.onerror = () => { editorScript = null; reject(new Error('Không tải được trình soạn bài.')); };
      document.head.appendChild(script);
    });
  }
  return editorScript;
}

// The uploaded original plus WebP copies 640/1280 px wide made here, so the server needs no image tools.
async function uploadBlogImage(apiFetch, file) {
  if (!file) return null;
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) { notify('Chỉ nhận ảnh JPG, PNG, WebP hoặc GIF.', true); return null; }
  if (file.size > 8 * 1024 * 1024) { notify('Ảnh lớn hơn 8 MB. Hãy nén ảnh rồi tải lại.', true); return null; }
  const bitmap = await createImageBitmap(file).catch(() => null);
  const form = new FormData();
  form.append('file', file);
  if (bitmap) {
    form.append('width', String(bitmap.width)); form.append('height', String(bitmap.height));
    for (const size of [640, 1280]) {
      if (bitmap.width < size || file.type === 'image/gif') continue;
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = Math.round(bitmap.height * size / bitmap.width);
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.82));
      if (blob && blob.type === 'image/webp') form.append(`w${size}`, blob, `${size}.webp`);
    }
  }
  return apiFetch('/admin/blog/images', { method: 'POST', quiet: true, body: form });
}

// Share image 1200 × 630 drawn here: the cover (or a plain brand background), darkened, with the title.
async function drawShareImage({ title, cover }) {
  const canvas = document.createElement('canvas');
  canvas.width = 1200; canvas.height = 630;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1c2128'; ctx.fillRect(0, 0, 1200, 630);
  if (cover) {
    const image = await new Promise(resolve => { const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = cover; });
    if (image) {
      const scale = Math.max(1200 / image.naturalWidth, 630 / image.naturalHeight);
      const w = image.naturalWidth * scale, hgt = image.naturalHeight * scale;
      ctx.drawImage(image, (1200 - w) / 2, (630 - hgt) / 2, w, hgt);
      const shade = ctx.createLinearGradient(0, 0, 0, 630); shade.addColorStop(0, 'rgba(0,0,0,.25)'); shade.addColorStop(1, 'rgba(0,0,0,.82)');
      ctx.fillStyle = shade; ctx.fillRect(0, 0, 1200, 630);
    }
  }
  await document.fonts?.load?.('700 60px "Inter Variable"').catch(() => {});
  ctx.fillStyle = '#e0a64a'; ctx.font = '600 28px "Inter Variable", Arial, sans-serif'; ctx.fillText('Blog Phạm Thành Biên', 72, 96);
  ctx.fillStyle = '#ffffff'; ctx.font = '700 60px "Inter Variable", Arial, sans-serif';
  const lines = [];
  for (const word of String(title || '').split(/\s+/)) {
    const line = lines.length ? `${lines.at(-1)} ${word}` : word;
    if (lines.length && ctx.measureText(line).width <= 1056) lines[lines.length - 1] = line; else lines.push(word);
  }
  const shown = lines.slice(0, 4);
  if (lines.length > 4) shown[3] = `${shown[3].replace(/\s+\S*$/, '')}…`;
  shown.forEach((line, i) => ctx.fillText(line, 72, 630 - 72 - (shown.length - 1 - i) * 74));
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.88));
  return new File([blob], `${slugify(title).slice(0, 50) || 'anh-chia-se'}-og.jpg`, { type: 'image/jpeg' });
}

// Cut text at a pixel width like Google does, with an ellipsis.
function cutAt(text, px, size) {
  let out = String(text || '');
  if (textWidth(out, size) <= px) return out;
  while (out && textWidth(`${out}…`, size) > px) out = out.slice(0, -1);
  return `${out.trimEnd()}…`;
}
const autoDescription = (excerpt, html) => {
  const text = (excerpt || String(html || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  if (text.length <= 155) return text;
  const cut = text.slice(0, 154);
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[,.;:–-]+$/, '')}…`;
};

function PostEditor({ id, apiFetch, ui, onClose }) {
  const { Button, Input, Field, Card } = ui;
  const [post, setPost] = React.useState(null);
  const [form, setForm] = React.useState(null);
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState('');
  const [savedAt, setSavedAt] = React.useState(null);
  const [error, setError] = React.useState('');
  const [side, setSide] = React.useState('publish');
  const [meta, setMeta] = React.useState({ categories: [], authors: [] });
  const [usedBy, setUsedBy] = React.useState([]);
  const [slugTouched, setSlugTouched] = React.useState(false);
  const [restore, setRestore] = React.useState(null);
  const [, redraw] = React.useState(0);
  const editorRef = React.useRef(null);
  const mountRef = React.useRef(null);
  const formRef = React.useRef(null);
  const titleRef = React.useRef(null);
  formRef.current = form;
  // The title box grows with the title (also when a post opens with a long one).
  React.useLayoutEffect(() => { const el = titleRef.current; if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; } }, [form?.title, post]);

  const fromPost = p => ({ ...Object.fromEntries(FIELDS.map(k => [k, p[k] ?? ''])), html: p.html || '', tags: (p.tags || []).map(t => t.name), robots: p.robots || 'index', scheduled_at: p.scheduled_at || '' });
  React.useEffect(() => {
    let live = true;
    Promise.all([apiFetch(`/admin/blog/posts/${id}`), apiFetch('/admin/blog/categories'), apiFetch('/admin/blog/authors'), loadEditorScript()])
      .then(([p, categories, authors]) => {
        if (!live) return;
        setPost(p); setForm(fromPost(p)); setMeta({ categories, authors });
        setSlugTouched(p.status !== 'draft' || !!p.published_at);
        // A draft is cleared by every real save, so one still there holds unsaved edits.
        if (p.draft && p.draft_saved_at) setRestore(p.draft);
      }).catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [id, apiFetch]);

  const change = patch => { setForm(f => ({ ...f, ...patch })); setDirty(true); };
  // Mount TipTap once the post is loaded; its HTML flows back into the form.
  React.useEffect(() => {
    if (!post || !mountRef.current || editorRef.current) return undefined;
    const editor = window.BlogEditor.create(mountRef.current, {
      content: formRef.current.html,
      onUpdate: e => { setForm(f => ({ ...f, html: e.getHTML(), content_json: e.getJSON() })); setDirty(true); },
      onSelection: () => redraw(n => n + 1),
    });
    editorRef.current = editor;
    return () => { editor.destroy(); editorRef.current = null; };
  }, [post]);

  // Autosave the unsaved edits as a draft (never the live post).
  React.useEffect(() => {
    if (!dirty || !form) return undefined;
    const t = setTimeout(async () => {
      try { await apiFetch(`/admin/blog/posts/${id}/draft`, { method: 'PUT', quiet: true, body: JSON.stringify({ draft: formRef.current }) }); setSavedAt(new Date()); } catch { /* shown */ }
    }, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [form, dirty, id, apiFetch]);
  React.useEffect(() => {
    const warn = e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // Other posts with the same focus keyword (two posts competing for one search).
  React.useEffect(() => {
    if (!form?.focus_keyword?.trim()) { setUsedBy([]); return undefined; }
    const t = setTimeout(() => apiFetch(`/admin/blog/keyword-usage?${new URLSearchParams({ keyword: form.focus_keyword, exclude: id })}`).then(r => setUsedBy(r.used_by || [])).catch(() => {}), 400);
    return () => clearTimeout(t);
  }, [form?.focus_keyword, id, apiFetch]);

  if (error) return h('div', { className: 'bl-page' }, h(Button, { variant: 'ghost', onClick: onClose }, '← Bài viết'), h('div', { className: 'bl-empty', role: 'alert' }, error));
  if (!post || !form) return h('div', { className: 'bl-page' }, h(Skeleton));

  const report = analyze(form, { keywordUsedBy: usedBy, siteHosts: [location.host, 'phamthanhbien.com', 'www.phamthanhbien.com', 'event.phamthanhbien.com'] });
  const editor = editorRef.current;
  const published = post.status === 'published';

  async function save(action) {
    setSaving(action);
    try {
      const result = await apiFetch(`/admin/blog/posts/${id}`, { method: 'PUT', quiet: true, body: JSON.stringify({ post: form, action, expected_version: post.version }) });
      setPost(result.post); setDirty(false); setRestore(null); setSavedAt(null);
      notify(action === 'publish' ? 'Đã đăng bài.' : action === 'schedule' ? 'Đã hẹn giờ đăng.' : action === 'unpublish' ? 'Đã chuyển về nháp.' : 'Đã lưu.');
    } catch {
      // The server's message lists what blocks publishing; the SEO tab shows the same checks.
      if (action === 'publish' || action === 'schedule') setSide('seo');
    } finally { setSaving(''); }
  }
  async function remove() {
    if (!await confirmAction(published || post.published_at ? 'Gỡ bài này? Đường dẫn sẽ trả "đã gỡ" (410) cho Google và người đọc.' : 'Xóa hẳn bản nháp này?')) return;
    try { await apiFetch(`/admin/blog/posts/${id}`, { method: 'DELETE' }); setDirty(false); onClose(); } catch { /* shown */ }
  }
  async function preview() {
    try {
      if (dirty) await apiFetch(`/admin/blog/posts/${id}/draft`, { method: 'PUT', quiet: true, body: JSON.stringify({ draft: form }) });
      const { url } = await apiFetch(`/admin/blog/posts/${id}/preview`, { method: 'POST', quiet: true });
      window.open(url, '_blank', 'noopener');
    } catch { /* shown */ }
  }
  function applyRestore(data) {
    const next = { ...form, ...Object.fromEntries(FIELDS.filter(k => data[k] !== undefined).map(k => [k, data[k]])) };
    setForm(next); setDirty(true); setRestore(null);
    editor?.commands.setContent(next.html || '', { emitUpdate: false });
  }
  async function discardRestore() { setRestore(null); try { await apiFetch(`/admin/blog/posts/${id}/draft`, { method: 'DELETE', quiet: true }); } catch { /* shown */ } }
  const setTitle = title => change({ title, ...(slugTouched ? {} : { slug: slugify(title) }) });

  const scheduled = form.scheduled_at && new Date(form.scheduled_at) > new Date();
  const primary = published ? ['save', 'Cập nhật'] : scheduled ? ['schedule', 'Hẹn giờ đăng'] : ['publish', 'Đăng bài'];
  return h('div', { className: 'bl-page' },
    h('div', { className: 'bl-editor-head' },
      h(Button, { variant: 'ghost', size: 'sm', onClick: async () => { if (!dirty || await confirmAction('Có thay đổi chưa lưu (bản tự lưu vẫn giữ). Rời trình soạn?', false)) onClose(); } }, '← Bài viết'),
      h(Badge, { tone: STATUS[post.status]?.[1] }, STATUS[post.status]?.[0]),
      h('span', { className: 'bl-saved bl-grow' }, dirty ? (savedAt ? `Tự lưu nháp lúc ${savedAt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : 'Có thay đổi chưa lưu') : `Đã lưu ${when(post.updated_at)}`),
      h(Button, { variant: 'outline', size: 'sm', onClick: preview }, 'Xem trước'),
      published ? null : h(Button, { variant: 'outline', size: 'sm', disabled: !!saving, onClick: () => save('save') }, saving === 'save' ? 'Đang lưu…' : 'Lưu nháp'),
      h(Button, { size: 'sm', disabled: !!saving, onClick: () => save(primary[0]) }, saving === primary[0] ? 'Đang lưu…' : primary[1])),
    restore ? h('div', { className: 'bl-banner', role: 'status' }, `Có bản tự lưu lúc ${when(post.draft_saved_at)} chưa được lưu.`, h(Button, { size: 'sm', variant: 'outline', onClick: () => applyRestore(restore) }, 'Khôi phục'), h(Button, { size: 'sm', variant: 'ghost', onClick: discardRestore }, 'Bỏ')) : null,
    h('div', { className: 'bl-editor' },
      h('div', { className: 'bl-main' },
        h('textarea', { ref: titleRef, className: 'bl-title-input', rows: 1, value: form.title, placeholder: 'Tiêu đề bài viết', 'aria-label': 'Tiêu đề', maxLength: 300, onChange: e => setTitle(e.target.value) }),
        h('div', { className: 'bl-slug-row' }, h('span', null, `${location.host}/blog/`),
          h(Input, { value: form.slug, 'aria-label': 'Đường dẫn', onChange: e => { setSlugTouched(true); change({ slug: slugify(e.target.value) }); } }),
          published && form.slug !== post.slug ? h('span', null, 'Đường dẫn cũ sẽ tự chuyển (301) sang đường dẫn mới.') : null),
        h(Toolbar, { editor, apiFetch, ui }),
        h('div', { className: 'bl-surface' }, h('div', { ref: mountRef })),
        h('div', { className: 'bl-foot' }, h('span', null, `${fmt(report.words)} chữ`), h('span', null, `~${Math.max(1, Math.round(report.words / 220))} phút đọc`), h('span', null, `Điểm SEO ${report.score}/100`))),
      h('aside', { className: 'bl-side', 'aria-label': 'Thiết lập bài viết' },
        h('div', { className: 'bl-tabs', role: 'tablist' }, [['publish', 'Đăng bài'], ['seo', `SEO ${report.score}`], ['social', 'Chia sẻ'], ['history', 'Lịch sử']].map(([key, label]) =>
          h('button', { key, type: 'button', role: 'tab', className: 'bl-tab', 'aria-selected': side === key, onClick: () => setSide(key) }, label))),
        side === 'publish' ? h(PublishPanel, { form, post, meta, change, apiFetch, ui, onRemove: remove, onUnpublish: () => save('unpublish') })
          : side === 'seo' ? h(SeoPanel, { form, change, report, ui })
          : side === 'social' ? h(SocialPanel, { form, change, apiFetch, ui })
          : h(HistoryPanel, { id, apiFetch, ui, onLoad: applyRestore, revisions: post.revisions }))));
}

function Toolbar({ editor, apiFetch, ui }) {
  const [picking, setPicking] = React.useState(false);
  const [linking, setLinking] = React.useState(false);
  if (!editor) return h('div', { className: 'bl-toolbar' }, h('span', { className: 'bl-muted bl-small' }, 'Đang tải trình soạn…'));
  const run = fn => () => fn(editor.chain().focus()).run();
  const tool = (label, title, active, onClick, disabled = false) => h('button', { type: 'button', className: 'bl-tool', title, 'aria-label': title, 'aria-pressed': active ? 'true' : 'false', disabled, onClick }, label);
  const block = editor.isActive('heading', { level: 2 }) ? 'h2' : editor.isActive('heading', { level: 3 }) ? 'h3' : editor.isActive('heading', { level: 4 }) ? 'h4' : 'p';
  async function insertImage(url, info = {}) {
    setPicking(false);
    const alt = await requestText('Mô tả ảnh (alt) — giúp Google và người dùng trình đọc màn hình hiểu ảnh:', '');
    if (alt === null) return;
    editor.chain().focus().setImage({ src: url, alt: alt.trim(), ...(info.width ? { width: info.width, height: info.height } : {}) }).run();
  }
  async function youtube() {
    const url = await requestText('Dán link video YouTube:', '');
    if (url && !editor.chain().focus().setYoutubeVideo({ src: url.trim() }).run()) notify('Link YouTube không hợp lệ.', true);
  }
  return h(React.Fragment, null,
    h('div', { className: 'bl-toolbar', role: 'toolbar', 'aria-label': 'Định dạng' },
      h(Select, { className: 'ui-input bl-block-select', value: block, 'aria-label': 'Kiểu đoạn', onChange: e => { const v = e.target.value; const chain = editor.chain().focus(); (v === 'p' ? chain.setParagraph() : chain.setHeading({ level: Number(v[1]) })).run(); } },
        h('option', { value: 'p' }, 'Đoạn văn'), h('option', { value: 'h2' }, 'Tiêu đề H2'), h('option', { value: 'h3' }, 'Tiêu đề H3'), h('option', { value: 'h4' }, 'Tiêu đề H4')),
      h('span', { className: 'bl-sep' }),
      tool(h('b', null, 'B'), 'Đậm', editor.isActive('bold'), run(c => c.toggleBold())),
      tool(h('i', null, 'I'), 'Nghiêng', editor.isActive('italic'), run(c => c.toggleItalic())),
      tool(h('u', null, 'U'), 'Gạch chân', editor.isActive('underline'), run(c => c.toggleUnderline())),
      tool(h('s', null, 'S'), 'Gạch ngang', editor.isActive('strike'), run(c => c.toggleStrike())),
      tool('🔗', 'Chèn link', editor.isActive('link'), () => setLinking(true)),
      h('span', { className: 'bl-sep' }),
      tool('•', 'Danh sách', editor.isActive('bulletList'), run(c => c.toggleBulletList())),
      tool('1.', 'Danh sách số', editor.isActive('orderedList'), run(c => c.toggleOrderedList())),
      tool('❝', 'Trích dẫn', editor.isActive('blockquote'), run(c => c.toggleBlockquote())),
      tool('ⓘ', 'Khối ghi chú', editor.isActive('box', { kind: 'callout' }), run(c => c.toggleBox('callout'))),
      tool('★', 'Khối kêu gọi (CTA)', editor.isActive('box', { kind: 'cta' }), run(c => c.toggleBox('cta'))),
      h('span', { className: 'bl-sep' }),
      tool('🖼', 'Chèn ảnh', false, () => setPicking(true)),
      tool('▶', 'Chèn video YouTube', false, youtube),
      tool('▦', 'Chèn bảng', false, run(c => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }))),
      editor.isActive('table') ? tool('+cột', 'Thêm cột', false, run(c => c.addColumnAfter())) : null,
      editor.isActive('table') ? tool('+dòng', 'Thêm dòng', false, run(c => c.addRowAfter())) : null,
      editor.isActive('table') ? tool('×bảng', 'Xóa bảng', false, run(c => c.deleteTable())) : null,
      tool('―', 'Đường kẻ', false, run(c => c.setHorizontalRule())),
      h('span', { className: 'bl-sep' }),
      tool('↶', 'Hoàn tác', false, run(c => c.undo()), !editor.can().undo()),
      tool('↷', 'Làm lại', false, run(c => c.redo()), !editor.can().redo())),
    picking ? h(ImageDialog, { apiFetch, ui, onClose: () => setPicking(false), onPick: insertImage }) : null,
    linking ? h(LinkDialog, { apiFetch, ui, editor, onClose: () => setLinking(false) }) : null);
}

// Upload (with WebP copies) or pick an image already in the Media Library.
function ImageDialog({ apiFetch, ui, onClose, onPick, title = 'Ảnh trong bài' }) {
  const [library, setLibrary] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  if (library) return h(MediaPicker, { apiFetch, ui, folder: 'blog', title, onClose, onPick: url => onPick(url) });
  async function upload(file) {
    setBusy(true);
    try { const result = await uploadBlogImage(apiFetch, file); if (result) onPick(result.url, result); }
    catch { /* shown */ } finally { setBusy(false); }
  }
  return h(Dialog, { title, onClose, ui },
    h('p', { className: 'bl-muted bl-small' }, 'Ảnh tải lên ở đây có thêm bản WebP 640 và 1280 px, để điện thoại tải nhanh.'),
    h('div', { className: 'bl-row' },
      h('label', { className: 'ui-button ui-button-default ui-button-sm' }, busy ? 'Đang tải…' : 'Tải ảnh lên', h('input', { type: 'file', hidden: true, accept: 'image/jpeg,image/png,image/webp,image/gif', disabled: busy, onChange: e => { upload(e.target.files[0]); e.target.value = ''; } })),
      h(ui.Button, { variant: 'outline', size: 'sm', onClick: () => setLibrary(true) }, 'Chọn từ thư viện')));
}

function LinkDialog({ apiFetch, ui, editor, onClose }) {
  const current = editor.getAttributes('link');
  const [href, setHref] = React.useState(current.href || '');
  const [sponsored, setSponsored] = React.useState(/sponsored/.test(current.rel || ''));
  const [results, setResults] = React.useState([]);
  React.useEffect(() => {
    if (/^https?:\/\//.test(href)) { setResults([]); return undefined; }
    const t = setTimeout(() => apiFetch(`/admin/blog/links?q=${encodeURIComponent(href)}`).then(setResults).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [href, apiFetch]);
  function apply(value = href) {
    const url = value.trim();
    const chain = editor.chain().focus().extendMarkRange('link');
    (url ? chain.setLink({ href: url, rel: sponsored ? 'sponsored nofollow' : null }) : chain.unsetLink()).run();
    onClose();
  }
  return h(Dialog, { title: 'Chèn link', onClose, ui },
    h(ui.Field, { label: 'Địa chỉ, hoặc gõ để tìm bài/trang trong site' }, h(ui.Input, { value: href, autoFocus: true, placeholder: 'https://... hoặc tên bài', onChange: e => setHref(e.target.value), onKeyDown: e => { if (e.key === 'Enter') { e.preventDefault(); apply(); } } })),
    results.length ? h('ul', { className: 'bl-revisions' }, results.map(r => h('li', { key: r.href }, h('span', null, r.title, h('div', { className: 'bl-slug' }, r.href)), h(ui.Button, { size: 'sm', variant: 'outline', onClick: () => apply(r.href) }, 'Chọn')))) : null,
    h('label', { className: 'bl-row bl-small' }, h('input', { type: 'checkbox', checked: sponsored, onChange: e => setSponsored(e.target.checked) }), 'Link quảng cáo / tài trợ (rel="sponsored nofollow")'),
    h('div', { className: 'bl-row' }, h(ui.Button, { size: 'sm', onClick: () => apply() }, 'Áp dụng'), current.href ? h(ui.Button, { size: 'sm', variant: 'ghost', onClick: () => apply('') }, 'Bỏ link') : null));
}

function Dialog({ title, onClose, children, ui }) {
  React.useEffect(() => { const esc = e => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc); }, [onClose]);
  return h(Overlay, { className: 'drawer-layer' },
    h('button', { className: 'drawer-backdrop', onClick: onClose, 'aria-label': 'Đóng' }),
    h('div', { className: 'lead-drawer-react', role: 'dialog', 'aria-label': title },
      h('div', { className: 'drawer-head-react' }, h('div', null, h('h2', null, title)), h(ui.Button, { variant: 'ghost', onClick: onClose }, 'Đóng')),
      h('div', { className: 'drawer-body-react bl-form' }, children)));
}

function PublishPanel({ form, post, meta, change, apiFetch, ui, onRemove, onUnpublish }) {
  const { Card, Field, Input, Button } = ui;
  const [tagText, setTagText] = React.useState('');
  const [picking, setPicking] = React.useState(false);
  const addTags = text => { const names = text.split(',').map(t => t.trim()).filter(Boolean); if (names.length) change({ tags: [...new Set([...(form.tags || []), ...names])] }); setTagText(''); };
  const local = value => (value ? new Date(new Date(value).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
  return h(React.Fragment, null,
    h(Card, null,
      h('div', { className: 'bl-row bl-small' }, h('span', { className: 'bl-muted' }, 'Ngày đăng:'), post.published_at ? when(post.published_at) : 'chưa đăng'),
      post.status !== 'published' ? h(Field, { label: 'Hẹn giờ đăng (để trống: đăng ngay khi bấm Đăng bài)' }, h(Input, { type: 'datetime-local', value: local(form.scheduled_at), onChange: e => change({ scheduled_at: e.target.value ? new Date(e.target.value).toISOString() : '' }) })) : null,
      h(Field, { label: 'Chuyên mục' }, h(Select, { value: form.category_id || '', onChange: e => change({ category_id: e.target.value }) }, h('option', { value: '' }, 'Không chọn'), ...meta.categories.map(c => h('option', { key: c.id, value: c.id }, c.name)))),
      h(Field, { label: 'Tác giả' }, h(Select, { value: form.author_id || '', onChange: e => change({ author_id: e.target.value }) }, h('option', { value: '' }, 'Không chọn'), ...meta.authors.map(a => h('option', { key: a.id, value: a.id }, a.name)))),
      h(Field, { label: 'Tag (cách nhau bằng dấu phẩy, Enter để thêm)' }, h(Input, { value: tagText, onChange: e => setTagText(e.target.value), onBlur: () => addTags(tagText), onKeyDown: e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTags(tagText); } } })),
      form.tags?.length ? h('div', { className: 'bl-chips' }, form.tags.map(t => h('span', { key: t, className: 'bl-chip' }, t, h('button', { type: 'button', 'aria-label': `Bỏ tag ${t}`, onClick: () => change({ tags: form.tags.filter(x => x !== t) }) }, '×')))) : null),
    h(Card, null,
      h('strong', null, 'Ảnh bìa'),
      h('div', { className: 'bl-cover' }, form.cover_image ? h('img', { src: form.cover_image, alt: '' }) : 'Chưa có ảnh bìa'),
      h('div', { className: 'bl-row' }, h(Button, { size: 'sm', variant: 'outline', onClick: () => setPicking(true) }, form.cover_image ? 'Đổi ảnh' : 'Chọn ảnh'), form.cover_image ? h(Button, { size: 'sm', variant: 'ghost', onClick: () => change({ cover_image: '', cover_alt: '', cover_width: '', cover_height: '' }) }, 'Bỏ ảnh') : null),
      form.cover_image ? h(Field, { label: 'Mô tả ảnh bìa (alt) — bắt buộc khi đăng' }, h(Input, { value: form.cover_alt, maxLength: 300, onChange: e => change({ cover_alt: e.target.value }) })) : null,
      h(Field, { label: 'Tóm tắt (hiện ở danh sách bài)' }, h('textarea', { className: 'ui-input', value: form.excerpt, maxLength: 500, onChange: e => change({ excerpt: e.target.value }) }))),
    h(Card, null,
      h('strong', null, 'Khác'),
      post.status === 'published' || post.status === 'scheduled' ? h(Button, { size: 'sm', variant: 'outline', onClick: onUnpublish }, 'Chuyển về nháp') : null,
      h(Button, { size: 'sm', variant: 'destructive', onClick: onRemove }, post.published_at ? 'Gỡ bài' : 'Xóa bản nháp')),
    picking ? h(ImageDialog, { apiFetch, ui, title: 'Ảnh bìa (nên 1200 × 630)', onClose: () => setPicking(false),
      onPick: (url, info = {}) => { change({ cover_image: url, cover_width: info.width || '', cover_height: info.height || '' }); setPicking(false); } }) : null);
}

function SeoPanel({ form, change, report, ui }) {
  const { Card, Field, Input, Button } = ui;
  const [device, setDevice] = React.useState('desktop');
  const title = fullTitle((form.seo_title || form.title || '').trim());
  const description = form.meta_description || autoDescription(form.excerpt, form.html);
  const order = { error: 0, warn: 1, ok: 2 };
  const checks = [...report.checks].sort((a, b) => order[a.level] - order[b.level]);
  return h(React.Fragment, null,
    h(Card, null,
      h('div', { className: 'bl-score' }, h('strong', null, report.score), h('div', null, h(Badge, { tone: scoreTone(report.score, report.errors) }, report.errors ? `${report.errors} lỗi cần sửa trước khi đăng` : report.score >= 80 ? 'Tốt' : 'Nên cải thiện'), h('div', { className: 'bl-muted bl-small' }, 'Điểm theo các quy tắc bên dưới'))),
      h('div', { className: 'bl-row' }, ['desktop', 'phone'].map(d => h(Button, { key: d, size: 'sm', variant: device === d ? 'secondary' : 'ghost', onClick: () => setDevice(d) }, d === 'desktop' ? 'Máy tính' : 'Điện thoại'))),
      h('div', { className: `bl-serp ${device}`, 'aria-label': 'Xem trước kết quả Google' },
        h('div', { className: 'bl-serp-url' }, `${location.host} › blog › ${form.slug}`),
        h('div', { className: 'bl-serp-title' }, cutAt(title, device === 'phone' ? 500 : TITLE_PX, 20)),
        h('div', { className: 'bl-serp-desc' }, cutAt(description, device === 'phone' ? 680 : DESC_PX, 14)))),
    h(Card, null,
      h(Field, { label: 'Từ khóa chính' }, h(Input, { value: form.focus_keyword, maxLength: 120, placeholder: 'vd: quản trị rủi ro', onChange: e => change({ focus_keyword: e.target.value }) })),
      h(Field, { label: 'Tiêu đề SEO (để trống: dùng tiêu đề bài)' }, h(Input, { value: form.seo_title, maxLength: 200, onChange: e => change({ seo_title: e.target.value }) })),
      h('div', { className: `bl-counter${report.titlePx > TITLE_PX ? ' over' : ''}` }, `${title.length} ký tự · ${report.titlePx}/${TITLE_PX}px`),
      h(Field, { label: 'Mô tả (120–160 ký tự)' }, h('textarea', { className: 'ui-input', value: form.meta_description, maxLength: 400, onChange: e => change({ meta_description: e.target.value }) })),
      h('div', { className: `bl-counter${report.descPx > DESC_PX ? ' over' : ''}` }, `${(form.meta_description || '').length} ký tự · ${report.descPx}/${DESC_PX}px`),
      h('div', { className: 'bl-row' },
        h(Button, { size: 'sm', variant: 'outline', onClick: () => change({ seo_title: form.title }) }, 'Tạo tiêu đề'),
        h(Button, { size: 'sm', variant: 'outline', onClick: () => change({ meta_description: autoDescription(form.excerpt, form.html) }) }, 'Tạo mô tả'),
        h(Button, { size: 'sm', variant: 'outline', onClick: () => change({ slug: slugify(form.focus_keyword || form.title, 75) }) }, 'Tạo đường dẫn')),
      h('label', { className: 'bl-row bl-small' }, h('input', { type: 'checkbox', checked: form.robots === 'noindex', onChange: e => change({ robots: e.target.checked ? 'noindex' : 'index' }) }), 'Không cho Google lập chỉ mục bài này (noindex)'),
      h(Field, { label: 'Canonical (chỉ khi bài gốc ở địa chỉ khác)' }, h(Input, { value: form.canonical_url, placeholder: 'https://...', onChange: e => change({ canonical_url: e.target.value }) }))),
    h(Card, null, h('strong', null, 'Kiểm tra SEO'),
      h('ul', { className: 'bl-checks' }, checks.map(c => h('li', { key: c.id }, h('span', { className: `bl-dot ${c.level}`, 'aria-label': c.level === 'ok' ? 'Đạt' : c.level === 'warn' ? 'Nên sửa' : 'Lỗi' }), h('span', null, h('strong', null, c.label), ': ', c.message))))));
}

function SocialPanel({ form, change, apiFetch, ui }) {
  const { Card, Button } = ui;
  const [busy, setBusy] = React.useState(false);
  const [picking, setPicking] = React.useState(false);
  const image = form.og_image || form.cover_image;
  async function generate() {
    setBusy(true);
    try { const file = await drawShareImage({ title: form.title, cover: form.cover_image }); const result = await uploadBlogImage(apiFetch, file); if (result) change({ og_image: result.url }); }
    catch (e) { notify(e.message || 'Không tạo được ảnh.', true); } finally { setBusy(false); }
  }
  return h(Card, null,
    h('strong', null, 'Khi chia sẻ lên Facebook, Zalo'),
    h('div', { className: 'bl-og' }, image ? h('img', { src: image, alt: '' }) : h('img', { alt: '' }),
      h('div', null, h('small', null, location.host), h('strong', null, form.seo_title || form.title), h('span', { className: 'bl-muted bl-small' }, cutAt(form.meta_description || autoDescription(form.excerpt, form.html), 600, 14)))),
    h('p', { className: 'bl-muted bl-small' }, form.og_image ? 'Đang dùng ảnh chia sẻ riêng.' : form.cover_image ? 'Đang dùng ảnh bìa. Nên tạo ảnh có tiêu đề để nổi bật hơn.' : 'Chưa có ảnh: bấm Tạo ảnh chia sẻ.'),
    h('div', { className: 'bl-row' },
      h(Button, { size: 'sm', disabled: busy || !form.title, onClick: generate }, busy ? 'Đang tạo…' : 'Tạo ảnh chia sẻ'),
      h(Button, { size: 'sm', variant: 'outline', onClick: () => setPicking(true) }, 'Chọn ảnh khác'),
      form.og_image ? h(Button, { size: 'sm', variant: 'ghost', onClick: () => change({ og_image: '' }) }, 'Dùng ảnh bìa') : null),
    picking ? h(ImageDialog, { apiFetch, ui, title: 'Ảnh chia sẻ (1200 × 630)', onClose: () => setPicking(false), onPick: url => { change({ og_image: url }); setPicking(false); } }) : null);
}

function HistoryPanel({ id, apiFetch, ui, onLoad, revisions: count }) {
  const list = useLoad(`/admin/blog/posts/${id}/revisions`, apiFetch, count);
  async function load(revisionId) {
    if (!await confirmAction('Nạp bản này vào trình soạn? Bài chỉ thay đổi khi bạn bấm Lưu / Cập nhật.', false)) return;
    try { onLoad(await apiFetch(`/admin/blog/posts/${id}/revisions/${revisionId}`)); } catch { /* shown */ }
  }
  return h(ui.Card, null, h('strong', null, 'Các lần lưu'),
    list.loading && !list.data ? h(Skeleton) : (list.data || []).length ? h('ul', { className: 'bl-revisions' }, list.data.map(r => h('li', { key: r.id },
      h('span', null, when(r.created_at), h('div', { className: 'bl-slug' }, `${STATUS[r.status]?.[0] || r.status} · ${fmt(r.word_count)} chữ${r.by_email ? ` · ${r.by_email}` : ''}`)),
      h(ui.Button, { size: 'sm', variant: 'outline', onClick: () => load(r.id) }, 'Nạp')))) : h('p', { className: 'bl-muted bl-small' }, 'Chưa có lần lưu nào.'));
}

// ── Categories, tags, authors ──
function Manager({ rows, columns, form, empty }) {
  return h('div', { className: 'bl-manager' },
    h('div', { className: 'bl-table-wrap' }, h('table', { className: 'bl-table' },
      h('thead', null, h('tr', null, columns.map(c => h('th', { key: c.label, scope: 'col', className: c.num ? 'bl-num' : '' }, c.label)))),
      h('tbody', null, rows.length ? rows.map(row => h('tr', { key: row.id }, columns.map(c => h('td', { key: c.label, className: c.num ? 'bl-num' : '' }, c.cell(row)))))
        : h('tr', null, h('td', { colSpan: columns.length, className: 'bl-empty' }, empty))))),
    form);
}

function Categories({ apiFetch, ui }) {
  const { Card, Field, Input, Button } = ui;
  const [key, setKey] = React.useState(0);
  const list = useLoad('/admin/blog/categories', apiFetch, key);
  const blank = { name: '', slug: '', description: '', seo_title: '', meta_description: '', position: 0 };
  const [edit, setEdit] = React.useState(null);
  const [form, setForm] = React.useState(blank);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const start = row => { setEdit(row?.id || null); setForm(row ? { ...blank, ...row } : blank); };
  async function save(e) {
    e.preventDefault();
    try { await apiFetch(edit ? `/admin/blog/categories/${edit}` : '/admin/blog/categories', { method: edit ? 'PUT' : 'POST', body: JSON.stringify(form) }); notify('Đã lưu chuyên mục.'); start(null); setKey(k => k + 1); } catch { /* shown */ }
  }
  async function remove(row) {
    if (!await confirmAction(`Xóa chuyên mục "${row.name}"? ${row.posts} bài sẽ không còn chuyên mục.`)) return;
    try { await apiFetch(`/admin/blog/categories/${row.id}`, { method: 'DELETE' }); setKey(k => k + 1); } catch { /* shown */ }
  }
  if (list.loading && !list.data) return h(Skeleton);
  return h(Manager, {
    rows: list.data || [], empty: 'Chưa có chuyên mục.',
    columns: [{ label: 'Chuyên mục', cell: r => h('span', null, h('strong', null, r.name), h('div', { className: 'bl-slug' }, `/blog/chu-de/${r.slug}`)) }, { label: 'Bài', num: true, cell: r => fmt(r.posts) },
      { label: '', cell: r => h('div', { className: 'bl-row' }, h(Button, { size: 'sm', variant: 'outline', onClick: () => start(r) }, 'Sửa'), h(Button, { size: 'sm', variant: 'ghost', onClick: () => remove(r) }, 'Xóa')) }],
    form: h(Card, null, h('form', { className: 'bl-form', onSubmit: save },
      h('strong', null, edit ? 'Sửa chuyên mục' : 'Thêm chuyên mục'),
      h(Field, { label: 'Tên' }, h(Input, { value: form.name, required: true, onChange: e => setForm(f => ({ ...f, name: e.target.value, slug: edit ? f.slug : slugify(e.target.value) })) })),
      h(Field, { label: 'Đường dẫn' }, h(Input, { value: form.slug, onChange: e => setForm(f => ({ ...f, slug: slugify(e.target.value) })) })),
      h(Field, { label: 'Mô tả' }, h('textarea', { className: 'ui-input', value: form.description, onChange: set('description') })),
      h(Field, { label: 'Tiêu đề SEO' }, h(Input, { value: form.seo_title, onChange: set('seo_title') })),
      h(Field, { label: 'Mô tả SEO' }, h('textarea', { className: 'ui-input', value: form.meta_description, onChange: set('meta_description') })),
      h(Field, { label: 'Thứ tự' }, h(Input, { type: 'number', value: form.position, onChange: set('position') })),
      h('div', { className: 'bl-row' }, h(Button, { type: 'submit', size: 'sm' }, 'Lưu'), edit ? h(Button, { type: 'button', size: 'sm', variant: 'ghost', onClick: () => start(null) }, 'Hủy') : null))),
  });
}

function Tags({ apiFetch, ui }) {
  const { Button } = ui;
  const [key, setKey] = React.useState(0);
  const list = useLoad('/admin/blog/tags', apiFetch, key);
  const rows = list.data || [];
  async function rename(row) {
    const name = await requestText('Tên mới của tag:', row.name);
    if (!name || name === row.name) return;
    try { await apiFetch(`/admin/blog/tags/${row.id}`, { method: 'PUT', body: JSON.stringify({ name }) }); setKey(k => k + 1); } catch { /* shown */ }
  }
  async function merge(row, into) {
    const target = rows.find(r => r.id === into);
    if (!target || !await confirmAction(`Gộp "${row.name}" vào "${target.name}"? Các bài của "${row.name}" sẽ mang tag "${target.name}".`)) return;
    try { await apiFetch(`/admin/blog/tags/${row.id}/merge`, { method: 'POST', body: JSON.stringify({ into }) }); setKey(k => k + 1); } catch { /* shown */ }
  }
  async function remove(row) {
    if (!await confirmAction(`Xóa tag "${row.name}" khỏi ${row.posts} bài?`)) return;
    try { await apiFetch(`/admin/blog/tags/${row.id}`, { method: 'DELETE' }); setKey(k => k + 1); } catch { /* shown */ }
  }
  if (list.loading && !list.data) return h(Skeleton);
  return h(Manager, {
    rows, empty: 'Chưa có tag. Tag được tạo khi gắn vào bài.',
    columns: [{ label: 'Tag', cell: r => h('span', null, h('strong', null, r.name), h('div', { className: 'bl-slug' }, `/blog/tag/${r.slug} · không index`)) }, { label: 'Bài', num: true, cell: r => fmt(r.posts) },
      { label: '', cell: r => h('div', { className: 'bl-row' }, h(Button, { size: 'sm', variant: 'outline', onClick: () => rename(r) }, 'Đổi tên'),
        rows.length > 1 ? h(Select, { value: '', 'aria-label': `Gộp ${r.name} vào`, onChange: e => merge(r, e.target.value) }, h('option', { value: '' }, 'Gộp vào…'), ...rows.filter(x => x.id !== r.id).map(x => h('option', { key: x.id, value: x.id }, x.name))) : null,
        h(Button, { size: 'sm', variant: 'ghost', onClick: () => remove(r) }, 'Xóa')) }],
    form: h(ui.Card, null, h('div', { className: 'bl-form' }, h('strong', null, 'Về tag'), h('p', { className: 'bl-muted bl-small' }, 'Trang tag giúp người đọc tìm bài cùng chủ đề nhưng không cho Google index (tránh trang mỏng, trùng nội dung). Gộp các tag gần nghĩa để danh sách gọn.'))),
  });
}

function Authors({ apiFetch, ui }) {
  const { Card, Field, Input, Button } = ui;
  const [key, setKey] = React.useState(0);
  const list = useLoad('/admin/blog/authors', apiFetch, key);
  const blank = { name: '', slug: '', job_title: '', bio: '', avatar: '', same_as: '' };
  const [edit, setEdit] = React.useState(null);
  const [form, setForm] = React.useState(blank);
  const [picking, setPicking] = React.useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const start = row => { setEdit(row?.id || null); setForm(row ? { ...blank, ...row, same_as: (row.same_as || []).join('\n') } : blank); };
  async function save(e) {
    e.preventDefault();
    try { await apiFetch(edit ? `/admin/blog/authors/${edit}` : '/admin/blog/authors', { method: edit ? 'PUT' : 'POST', body: JSON.stringify(form) }); notify('Đã lưu tác giả.'); start(null); setKey(k => k + 1); } catch { /* shown */ }
  }
  async function remove(row) {
    if (!await confirmAction(`Xóa tác giả "${row.name}"?`)) return;
    try { await apiFetch(`/admin/blog/authors/${row.id}`, { method: 'DELETE' }); setKey(k => k + 1); } catch { /* shown */ }
  }
  if (list.loading && !list.data) return h(Skeleton);
  return h(Manager, {
    rows: list.data || [], empty: 'Chưa có tác giả.',
    columns: [{ label: 'Tác giả', cell: r => h('span', null, h('strong', null, r.name), h('div', { className: 'bl-slug' }, `${r.job_title || ''} · /blog/tac-gia/${r.slug}`)) }, { label: 'Bài', num: true, cell: r => fmt(r.posts) },
      { label: '', cell: r => h('div', { className: 'bl-row' }, h(Button, { size: 'sm', variant: 'outline', onClick: () => start(r) }, 'Sửa'), h(Button, { size: 'sm', variant: 'ghost', onClick: () => remove(r) }, 'Xóa')) }],
    form: h(Card, null, h('form', { className: 'bl-form', onSubmit: save },
      h('strong', null, edit ? 'Sửa tác giả' : 'Thêm tác giả'),
      h('p', { className: 'bl-muted bl-small' }, 'Tên, chức danh, tiểu sử và link mạng xã hội hiện trên bài và trang tác giả: Google dùng để đánh giá chuyên môn (E-E-A-T).'),
      h(Field, { label: 'Tên' }, h(Input, { value: form.name, required: true, onChange: e => setForm(f => ({ ...f, name: e.target.value, slug: edit ? f.slug : slugify(e.target.value) })) })),
      h(Field, { label: 'Đường dẫn' }, h(Input, { value: form.slug, onChange: e => setForm(f => ({ ...f, slug: slugify(e.target.value) })) })),
      h(Field, { label: 'Chức danh' }, h(Input, { value: form.job_title, onChange: set('job_title') })),
      h(Field, { label: 'Tiểu sử' }, h('textarea', { className: 'ui-input', value: form.bio, onChange: set('bio') })),
      h('div', { className: 'bl-row' }, form.avatar ? h('img', { className: 'bl-avatar', src: form.avatar, alt: '', width: 48, height: 48 }) : null, h(Button, { type: 'button', size: 'sm', variant: 'outline', onClick: () => setPicking(true) }, form.avatar ? 'Đổi ảnh' : 'Chọn ảnh')),
      h(Field, { label: 'Link mạng xã hội (mỗi dòng một link)' }, h('textarea', { className: 'ui-input', value: form.same_as, placeholder: 'https://www.facebook.com/...', onChange: set('same_as') })),
      h('div', { className: 'bl-row' }, h(Button, { type: 'submit', size: 'sm' }, 'Lưu'), edit ? h(Button, { type: 'button', size: 'sm', variant: 'ghost', onClick: () => start(null) }, 'Hủy') : null),
      picking ? h(ImageDialog, { apiFetch, ui, title: 'Ảnh tác giả (vuông)', onClose: () => setPicking(false), onPick: url => { setForm(f => ({ ...f, avatar: url })); setPicking(false); } }) : null)),
  });
}
