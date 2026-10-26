// Responsive images of the blog: an image uploaded from the blog editor has WebP copies 640 and
// 1280 px wide next to it (name-640.webp, name-1280.webp, src/blog/admin.js saveImage); pages
// then serve srcset so phones load the small copy. Other images are served as they are.
const fs = require('fs');
const path = require('path');
const { localPath } = require('../site');

const STORAGE_ROOT = path.resolve(process.env.STORAGE_ROOT || path.join(__dirname, '..', '..', 'storage'));
const STORAGE_PATH = (process.env.STORAGE_PUBLIC_PATH || '/storage').replace(/\/$/, '');
const SIZES = [640, 1280];
const known = new Map();

// "url-640.webp 640w, url-1280.webp 1280w" for an image with copies, else ''.
function srcsetFor(url) {
  const local = localPath(url);
  if (!local.startsWith(`${STORAGE_PATH}/`) || !/\.(jpe?g|png|webp|gif)$/i.test(local)) return '';
  if (known.has(local)) return known.get(local);
  const relative = decodeURIComponent(local.slice(STORAGE_PATH.length + 1)).replace(/\.[a-z]+$/i, '');
  const file = path.resolve(STORAGE_ROOT, relative);
  let srcset = '';
  if (file.startsWith(STORAGE_ROOT + path.sep)) {
    const base = local.replace(/\.[a-z]+$/i, '');
    srcset = SIZES.filter(size => fs.existsSync(`${file}-${size}.webp`)).map(size => `${base}-${size}.webp ${size}w`).join(', ');
  }
  if (known.size > 5000) known.clear();
  known.set(local, srcset);
  return srcset;
}

// Column width of a post: full width on phones, 720 px from tablets up.
const CONTENT_SIZES = '(max-width: 760px) 100vw, 720px';

module.exports = { srcsetFor, CONTENT_SIZES };
