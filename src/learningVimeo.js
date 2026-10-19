const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const { getCourse } = require('./learningCourses');

// Thumbnails of all courses share one folder; file names are content-hashed per video.
const thumbnailDirectory = () => path.join(path.resolve(process.env.STORAGE_ROOT || path.join(__dirname, '../storage')), 'dong-tien-thumbnails');
const thumbnailName = /^[1-9]\d*-[a-f0-9]{16}\.(?:jpg|png|webp)$/;
const videoPattern = /^[1-9]\d*(?:\/[a-zA-Z0-9]+)?$/;
const unavailable = message => Object.assign(new Error(message), { status: 502 });
const invalid = message => Object.assign(new Error(message), { status: 400 });
const baseId = video => String(video || '').split('/')[0];

// "123", "123/hash", vimeo.com/123/hash, player.vimeo.com/video/123?h=hash, vimeo.com/manage/videos/123
// or a pasted embed code → "123" or "123/hash". Anything else is null.
function parseVideo(input) {
  let text = String(input ?? '').trim();
  const src = text.match(/\bsrc=["']([^"']+)["']/i);
  if (src) text = src[1].replace(/&amp;/g, '&');
  if (videoPattern.test(text)) return text;
  let url;
  try { url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`); } catch { return null; }
  if (!/^(?:www\.|player\.)?vimeo\.com$/i.test(url.hostname)) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  // The video ID is the last number that is not a user, folder, channel or showcase ID.
  const index = parts.findLastIndex((part, i) => /^[1-9]\d{2,}$/.test(part) && !/^(?:users?|folders?|projects?|channels|groups|album|showcase)$/i.test(parts[i - 1] || ''));
  if (index < 0) return null;
  const hash = url.searchParams.get('h') || (/^[a-f0-9]{6,}$/i.test(parts[index + 1] || '') ? parts[index + 1] : '');
  const video = `${parts[index]}${hash ? `/${hash}` : ''}`;
  return videoPattern.test(video) ? video : null;
}

function createVimeoClient({ course = getCourse('dong-tien'), fetchImpl = fetch, directory = thumbnailDirectory(), token = process.env.VIMEO_ACCESS_TOKEN, referer = process.env.PUBLIC_BASE_URL } = {}) {
  const pending = new Map();
  // Videos limited to this website's domain answer oEmbed only with its Referer.
  const oembedHeaders = /^https?:\/\//.test(referer || '') ? { Referer: referer } : undefined;
  async function oembed(video, width) {
    const response = await fetchImpl(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(`https://vimeo.com/${video}`)}&width=${width}`, { headers: oembedHeaders, signal: AbortSignal.timeout(20000), redirect: 'error' });
    if (!response.ok) return { status: response.status };
    return { data: await response.json() };
  }
  // Title, duration and the full ID (with the privacy hash) of one video, for the lesson form.
  async function lookup(input) {
    let video = parseVideo(input);
    if (!video) throw invalid('Dán link video Vimeo (vimeo.com/… hoặc player.vimeo.com/video/…) hoặc Vimeo ID.');
    const { data, status } = await oembed(video, 640);
    if (data && Number(data.duration) > 0) {
      const hash = !video.includes('/') && String(data.html || '').match(/player\.vimeo\.com\/video\/\d+\?(?:[^"']*&)?h=([a-zA-Z0-9]+)/)?.[1];
      if (hash) video = `${video}/${hash}`;
      return { vimeo_video_id: video, title: String(data.title || '').trim().slice(0, 500), duration: Math.round(Number(data.duration)) };
    }
    // Private videos: the account token (when configured) still reads them.
    if (token) {
      const response = await fetchImpl(`https://api.vimeo.com/videos/${baseId(video)}?fields=name,duration,link`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000), redirect: 'error' });
      if (response.ok) {
        const row = await response.json();
        const linked = parseVideo(row.link);
        if (linked && !video.includes('/') && baseId(linked) === baseId(video)) video = linked;
        if (Number(row.duration) > 0) return { vimeo_video_id: video, title: String(row.name || '').trim().slice(0, 500), duration: Math.round(Number(row.duration)) };
      }
    }
    if (status === 404 || status === 403) throw unavailable('Vimeo không cho đọc video này (riêng tư hoặc sai link). Dùng link chia sẻ có mã riêng tư (vimeo.com/ID/mã), hoặc nhập tên và thời lượng thủ công.');
    throw unavailable(`Không đọc được thông tin video từ Vimeo${status ? ` (${status})` : ''}.`);
  }
  async function thumbnail(video, source) {
    if (!videoPattern.test(video)) throw unavailable('Vimeo ID không hợp lệ.');
    const key = `${video}:${source || ''}`;
    if (pending.has(key)) return pending.get(key);
    const work = (async () => {
      if (!source) {
        const { data, status } = await oembed(video, 640);
        if (!data) throw unavailable(`Vimeo trả về lỗi ${status}. Kiểm tra quyền truy cập video.`);
        source = data.thumbnail_url;
      }
      const url = new URL(source);
      if (url.origin !== 'https://i.vimeocdn.com' || !url.pathname.startsWith('/video/')) throw unavailable('URL thumbnail Vimeo không hợp lệ.');
      const response = await fetchImpl(url.href, { signal: AbortSignal.timeout(20000), redirect: 'error' });
      if (!response.ok) throw unavailable(`Không tải được thumbnail Vimeo (${response.status}).`);
      const mime = response.headers.get('content-type')?.split(';')[0], extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[mime];
      if (!extension || Number(response.headers.get('content-length')) > 3 * 1024 * 1024) throw unavailable('Thumbnail Vimeo không hợp lệ hoặc quá lớn.');
      const chunks = []; let length = 0;
      for await (const chunk of response.body) {
        length += chunk.length;
        if (length > 3 * 1024 * 1024) throw unavailable('Thumbnail Vimeo quá lớn.');
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks);
      if (!bytes.length) throw unavailable('Thumbnail Vimeo rỗng.');
      const filename = `${baseId(video)}-${crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 16)}.${extension}`;
      await fs.mkdir(directory, { recursive: true });
      const temp = path.join(directory, `${filename}.${crypto.randomUUID()}.tmp`);
      await fs.writeFile(temp, bytes);
      await fs.rename(temp, path.join(directory, filename));
      return `${course.base_path}/api/learning/thumbnails/${filename}`;
    })();
    pending.set(key, work);
    try { return await work; } finally { pending.delete(key); }
  }
  return { lookup, thumbnail };
}
module.exports = { createVimeoClient, parseVideo, thumbnailDirectory, thumbnailName };
