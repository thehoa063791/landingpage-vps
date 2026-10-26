const express = require('express');
const path    = require('path');
const multer  = require('multer');
const { supabase }   = require('../storage');
const { adminCookieOrAuth, wrap } = require('../utils');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

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

// ── Serve CMS page ─────────────────────────────────────────────────────────────
// The old standalone CMS page is gone: media live in Admin > Media Library, posts in Admin > Blog.
router.get('/', (req, res) => res.redirect(301, '/admin/view/cms'));

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


module.exports = router;
