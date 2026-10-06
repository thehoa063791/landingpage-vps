const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const DEFAULT_REVIEW = 'https://vimeo.com/reviews/27825fe4-1d85-4f05-8fb4-13ba87f1008a/users/208230075/folders/29758694';
const thumbnailDirectory = () => path.join(path.resolve(process.env.STORAGE_ROOT || path.join(__dirname, '../storage')), 'dong-tien-thumbnails');
const thumbnailName = /^[1-9]\d*-[a-f0-9]{16}\.(?:jpg|png|webp)$/;
const unavailable = message => Object.assign(new Error(message), { status: 502 });

function createVimeoClient({ fetchImpl = fetch, directory = thumbnailDirectory(), reviewURL = process.env.DONG_TIEN_VIMEO_REVIEW_URL || DEFAULT_REVIEW, token = process.env.VIMEO_ACCESS_TOKEN, folder = process.env.DONG_TIEN_VIMEO_FOLDER_ID || '29758694' } = {}) {
  const pending = new Map();
  async function json(url, headers) {
    const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(20000), redirect: 'error' });
    if (!response.ok) throw unavailable(`Vimeo trả về lỗi ${response.status}. Kiểm tra quyền truy cập folder/video.`);
    return response.json();
  }
  function reviewAddress() {
    const url = new URL(reviewURL);
    const match = url.pathname.match(/^\/reviews\/([a-f0-9-]{36})\/users\/(\d+)\/folders\/(\d+)\/?$/);
    if (url.origin !== 'https://vimeo.com' || !match) throw unavailable('Link review folder Vimeo không hợp lệ.');
    return { url, review: match[1], user: match[2], folder: match[3] };
  }
  async function reviewProps(url) {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(20000), redirect: 'error' });
    if (!response.ok) throw unavailable(`Không đọc được folder Vimeo (${response.status}).`);
    const html = await response.text(), script = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
    if (!script) throw unavailable('Vimeo chưa trả về danh mục chia sẻ.');
    const props = JSON.parse(script[1]).props.pageProps;
    if (props.showPasswordPage) throw unavailable('Link Vimeo đang yêu cầu mật khẩu.');
    return props;
  }
  async function pages(first, headers, select) {
    let next = first;
    const rows = [], visited = new Set();
    while (next) {
      const url = new URL(next, 'https://api.vimeo.com');
      if (url.origin !== 'https://api.vimeo.com' || visited.has(url.href) || visited.size >= 100) throw unavailable('Phân trang Vimeo không hợp lệ.');
      visited.add(url.href);
      const data = await json(url.href, headers);
      if (!Array.isArray(data.data)) throw unavailable('Danh sách Vimeo không hợp lệ.');
      rows.push(...data.data.map(select).filter(Boolean));
      next = data.paging?.next;
    }
    return rows;
  }
  async function catalog() {
    let videos, review;
    if (token) {
      if (!/^\d+$/.test(folder)) throw unavailable('Vimeo folder ID không hợp lệ.');
      videos = await pages(`https://api.vimeo.com/me/projects/${folder}/videos?per_page=100&fields=total,paging,uri,name,duration,link,pictures.sizes`, { Authorization: `Bearer ${token}` }, v => v);
    } else {
      review = reviewAddress();
      const props = await reviewProps(review.url.href);
      if (!props.viewerBootstrap?.jwt) throw unavailable('Không đọc được phiên chia sẻ Vimeo.');
      videos = await pages(`https://api.vimeo.com/users/${review.user}/projects/${review.folder}/items?review_id=${review.review}&per_page=100&page=1&fields=total,paging,video.uri,video.name,video.duration,video.link,video.pictures.sizes`, { Authorization: `jwt ${props.viewerBootstrap.jwt}` }, row => row.video);
    }
    const saved = JSON.parse(await fs.readFile(path.join(__dirname, '../pages/dong-tien/vimeo-catalog.json'), 'utf8'));
    const rows = await mapLimit(videos, 4, async v => {
      const id = Number(v.uri?.match(/\/videos\/(\d+)/)?.[1]);
      if (!Number.isSafeInteger(id) || id < 1 || !Number(v.duration)) throw unavailable('Metadata video Vimeo không hợp lệ.');
      const known = saved.find(row => row.id === id);
      let video = new URL(v.link).pathname.slice(1);
      if (!video.includes('/') && known) video = known.vimeo_video_id;
      if (review) {
        const props = await reviewProps(`https://vimeo.com/reviews/${review.review}/videos/${id}`);
        const hash = new URL(props.embedPlayerConfigUrl).searchParams.get('h');
        video = `${id}${hash ? `/${hash}` : ''}`;
      }
      const sizes = [...(v.pictures?.sizes || [])].sort((a, b) => Math.abs(a.width - 640) - Math.abs(b.width - 640));
      const thumbnail_url = await thumbnail(video, sizes[0]?.link);
      return { id, title: v.name, duration: v.duration, vimeo_video_id: video, thumbnail_url };
    });
    return { source: token ? 'vimeo' : 'review', rows, message: `Đã tải đầy đủ ${rows.length} video từ folder Vimeo. Chọn video để nhập và phân chương; cấu hình bài hiện có được giữ lại.` };
  }
  async function thumbnail(video, source) {
    if (!/^\d+(?:\/[a-zA-Z0-9]+)?$/.test(video)) throw unavailable('Vimeo ID không hợp lệ.');
    const key = `${video}:${source || ''}`;
    if (pending.has(key)) return pending.get(key);
    const work = (async () => {
      if (!source) source = (await json(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(`https://vimeo.com/${video}`)}&width=640`)).thumbnail_url;
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
      const filename = `${video.split('/')[0]}-${crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 16)}.${extension}`;
      await fs.mkdir(directory, { recursive: true });
      const temp = path.join(directory, `${filename}.${crypto.randomUUID()}.tmp`);
      await fs.writeFile(temp, bytes);
      await fs.rename(temp, path.join(directory, filename));
      return `/dong-tien/api/learning/thumbnails/${filename}`;
    })();
    pending.set(key, work);
    try { return await work; } finally { pending.delete(key); }
  }
  return { catalog, thumbnail };
}
async function mapLimit(rows, limit, fn) {
  const result = new Array(rows.length); let index = 0;
  await Promise.all(Array.from({ length: Math.min(limit, rows.length) }, async () => { while (index < rows.length) { const i = index++; result[i] = await fn(rows[i], i); } }));
  return result;
}
module.exports = { createVimeoClient, thumbnailDirectory, thumbnailName, mapLimit };
