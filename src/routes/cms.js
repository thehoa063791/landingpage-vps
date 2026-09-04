const express = require('express');
const path    = require('path');
const crypto  = require('crypto');
const multer  = require('multer');
const { supabase }   = require('../storage');
const { adminCookieOrAuth, wrap } = require('../utils');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');
const BUCKET = 'cms-media';

const MIME_MAP = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp',
  mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo', webm: 'video/webm',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

function detectMime(name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  return MIME_MAP[ext] || 'application/octet-stream';
}

function cleanStoragePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').split('/')
    .filter(part => part && part !== '.' && part !== '..')
    .map(part => part.replace(/[\\:*?"<>|]/g, '-').trim()).filter(Boolean).join('/');
}

async function moveStorageFile(fromPath, toPath) {
  const source = cleanStoragePath(fromPath);
  const target = cleanStoragePath(toPath);
  if (!source || !target) throw new Error('Đường dẫn không hợp lệ');
  if (source === target) return target;
  const { data, error } = await supabase.storage.from(BUCKET).download(source);
  if (error || !data) throw new Error(error?.message || 'Không đọc được file nguồn');
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(target, data, { contentType: detectMime(target), upsert: false });
  if (uploadError) throw new Error(uploadError.message);
  const { error: removeError } = await supabase.storage.from(BUCKET).remove([source]);
  if (removeError) throw new Error(removeError.message);
  return target;
}

function slugify(title) {
  const map = {
    à:'a',á:'a',ả:'a',ã:'a',ạ:'a',ă:'a',ắ:'a',ằ:'a',ẳ:'a',ẵ:'a',ặ:'a',
    â:'a',ấ:'a',ầ:'a',ẩ:'a',ẫ:'a',ậ:'a',đ:'d',
    è:'e',é:'e',ẻ:'e',ẽ:'e',ẹ:'e',ê:'e',ế:'e',ề:'e',ể:'e',ễ:'e',ệ:'e',
    ì:'i',í:'i',ỉ:'i',ĩ:'i',ị:'i',
    ò:'o',ó:'o',ỏ:'o',õ:'o',ọ:'o',ô:'o',ố:'o',ồ:'o',ổ:'o',ỗ:'o',ộ:'o',
    ơ:'o',ớ:'o',ờ:'o',ở:'o',ỡ:'o',ợ:'o',
    ù:'u',ú:'u',ủ:'u',ũ:'u',ụ:'u',ư:'u',ứ:'u',ừ:'u',ử:'u',ữ:'u',ự:'u',
    ỳ:'y',ý:'y',ỷ:'y',ỹ:'y',ỵ:'y',
  };
  return (title || '').toLowerCase()
    .split('').map(c => map[c] || c).join('')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim().replace(/\s+/g, '-').replace(/-+/g, '-');
}

// ── Serve CMS page ─────────────────────────────────────────────────────────────
router.get('/', adminCookieOrAuth, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'cms.html'));
});

// ── Helper: list all files in a folder recursively ────────────────────────────
async function listFolderFiles(folderPath) {
  const results = [];
  const { data } = await supabase.storage.from(BUCKET).list(folderPath, { limit: 500 });
  for (const item of (data || [])) {
    const itemPath = `${folderPath}/${item.name}`;
    if (item.id === null) {
      const sub = await listFolderFiles(itemPath);
      results.push(...sub);
    } else {
      results.push(itemPath);
    }
  }
  return results;
}

// ── Media: list files ──────────────────────────────────────────────────────────
router.get('/media', adminCookieOrAuth, wrap(async (req, res) => {
  const folder = req.query.folder || '';
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list(folder || undefined, { limit: 500, sortBy: { column: 'created_at', order: 'desc' } });

  if (error) return res.status(500).json({ error: error.message });

  // Entries with id === null are virtual folders (subfolders)
  const folders = (data || [])
    .filter(f => f.id === null)
    .map(f => ({
      name: f.name,
      path: folder ? `${folder}/${f.name}` : f.name,
    }));

  const files = (data || [])
    .filter(f => f.id !== null && f.name !== '.emptyFolderPlaceholder')
    .map(f => {
      const filePath = folder ? `${folder}/${f.name}` : f.name;
      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
      return {
        name:       f.name,
        path:       filePath,
        size:       f.metadata?.size || 0,
        mimetype:   f.metadata?.mimetype || detectMime(f.name),
        created_at: f.created_at,
        url:        urlData.publicUrl,
      };
    });

  res.json({ files, folders, currentFolder: folder });
}));

// ── Media: create folder ───────────────────────────────────────────────────────
router.post('/media/folder', adminCookieOrAuth, wrap(async (req, res) => {
  const { name, parent } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Tên folder không được để trống' });

  const safeName = name.trim().replace(/[/\\:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
  if (!safeName) return res.status(400).json({ error: 'Tên folder không hợp lệ' });

  const parentPath = (parent || '').replace(/[^a-zA-Z0-9À-ÿ\s\-_/]/g, '');
  const folderPath = parentPath ? `${parentPath}/${safeName}` : safeName;
  const placeholder = `${folderPath}/.emptyFolderPlaceholder`;

  const { error } = await supabase.storage.from(BUCKET).upload(
    placeholder, Buffer.from(''), { contentType: 'text/plain', upsert: false }
  );

  if (error) {
    if (error.message?.toLowerCase().includes('already exists') || error.statusCode === '409') {
      return res.status(409).json({ error: 'Folder đã tồn tại' });
    }
    return res.status(500).json({ error: error.message });
  }

  res.json({ success: true, name: safeName, path: folderPath });
}));

// ── Media: delete folder (recursive) ─────────────────────────────────────────
router.delete('/media/folder', adminCookieOrAuth, wrap(async (req, res) => {
  const { path: folderPath } = req.body;
  if (!folderPath) return res.status(400).json({ error: 'path is required' });

  const allFiles = await listFolderFiles(folderPath);
  if (allFiles.length > 0) {
    const { error } = await supabase.storage.from(BUCKET).remove(allFiles);
    if (error) return res.status(500).json({ error: error.message });
  }
  // Remove placeholder of the folder itself
  await supabase.storage.from(BUCKET).remove([`${folderPath}/.emptyFolderPlaceholder`]);

  res.json({ success: true });
}));

router.put('/media/folder', adminCookieOrAuth, wrap(async (req, res) => {
  const source = cleanStoragePath(req.body.path);
  const newName = cleanStoragePath(req.body.name).split('/').pop();
  if (!source || !newName) return res.status(400).json({ error: 'path and name are required' });
  const parent = source.includes('/') ? source.slice(0, source.lastIndexOf('/')) : '';
  const target = parent ? `${parent}/${newName}` : newName;
  const files = await listFolderFiles(source);
  if (!files.length) {
    await moveStorageFile(`${source}/.emptyFolderPlaceholder`, `${target}/.emptyFolderPlaceholder`);
  } else {
    for (const filePath of files) await moveStorageFile(filePath, `${target}/${filePath.slice(source.length + 1)}`);
  }
  res.json({ success: true, path: target, name: newName });
}));

// ── Media: upload ──────────────────────────────────────────────────────────────
router.post('/media/upload', adminCookieOrAuth, upload.single('file'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' });
  if (!/^(image|video)\//.test(String(req.file.mimetype || ''))) {
    return res.status(400).json({ error: 'Chỉ hỗ trợ tài nguyên hình ảnh và video' });
  }

  const folder   = (req.body.folder || '').replace(/[^a-zA-Z0-9-_/]/g, '');
  const ext      = path.extname(req.file.originalname);
  const baseName = path.basename(req.file.originalname, ext)
    .replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase().slice(0, 60);
  const fileName = `${baseName}-${Date.now()}${ext}`;
  const filePath = folder ? `${folder}/${fileName}` : fileName;

  const { error } = await supabase.storage.from(BUCKET).upload(filePath, req.file.buffer, {
    contentType: req.file.mimetype,
    upsert: false,
  });
  if (error) return res.status(500).json({ error: error.message });

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
  res.json({
    success:  true,
    path:     filePath,
    url:      urlData.publicUrl,
    name:     fileName,
    size:     req.file.size,
    mimetype: req.file.mimetype,
  });
}));

// ── Media: delete ──────────────────────────────────────────────────────────────
router.delete('/media', adminCookieOrAuth, wrap(async (req, res) => {
  const { path: filePath } = req.body;
  if (!filePath) return res.status(400).json({ error: 'path is required' });
  const { error } = await supabase.storage.from(BUCKET).remove([filePath]);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
}));

router.put('/media', adminCookieOrAuth, wrap(async (req, res) => {
  const source = cleanStoragePath(req.body.path);
  const requestedName = cleanStoragePath(req.body.name).split('/').pop();
  const targetFolder = cleanStoragePath(req.body.folder ?? (source.includes('/') ? source.slice(0, source.lastIndexOf('/')) : ''));
  if (!source || !requestedName) return res.status(400).json({ error: 'path and name are required' });
  const oldExt = path.extname(source);
  const newExt = path.extname(requestedName);
  const finalName = newExt ? requestedName : `${requestedName}${oldExt}`;
  const target = targetFolder ? `${targetFolder}/${finalName}` : finalName;
  await moveStorageFile(source, target);
  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(target);
  res.json({ success: true, path: target, name: finalName, url: urlData.publicUrl, mimetype: detectMime(finalName) });
}));

// ── Blog: list posts ───────────────────────────────────────────────────────────
router.get('/blog', adminCookieOrAuth, wrap(async (req, res) => {
  const { data, error } = await supabase
    .from('blog_posts')
    .select('id, title, slug, excerpt, cover_image, status, author, tags, created_at, updated_at')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ posts: data || [] });
}));

// ── Blog: get single post ──────────────────────────────────────────────────────
router.get('/blog/:id', adminCookieOrAuth, wrap(async (req, res) => {
  const { data, error } = await supabase
    .from('blog_posts').select('*').eq('id', req.params.id).single();
  if (error) return res.status(404).json({ error: 'Post not found' });
  res.json(data);
}));

// ── Blog: create post ──────────────────────────────────────────────────────────
router.post('/blog', adminCookieOrAuth, wrap(async (req, res) => {
  const { title, slug, content, excerpt, cover_image, status, author, tags } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });

  const now = new Date().toISOString();
  const { data, error } = await supabase.from('blog_posts').insert({
    id:          crypto.randomUUID(),
    title,
    slug:        slug || slugify(title),
    content:     content     || '',
    excerpt:     excerpt     || '',
    cover_image: cover_image || '',
    status:      status      || 'draft',
    author:      author      || '',
    tags:        Array.isArray(tags) ? tags : [],
    created_at:  now,
    updated_at:  now,
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
}));

// ── Blog: update post ──────────────────────────────────────────────────────────
router.put('/blog/:id', adminCookieOrAuth, wrap(async (req, res) => {
  const allowed = ['title', 'slug', 'content', 'excerpt', 'cover_image', 'status', 'author', 'tags'];
  const updates = { updated_at: new Date().toISOString() };
  allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

  const { data, error } = await supabase
    .from('blog_posts').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
}));

// ── Blog: delete post ──────────────────────────────────────────────────────────
router.delete('/blog/:id', adminCookieOrAuth, wrap(async (req, res) => {
  const { error } = await supabase.from('blog_posts').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
}));

module.exports = router;
