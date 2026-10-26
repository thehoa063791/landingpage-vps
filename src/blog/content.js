// Blog post content (docs/blog-seo-plan.md §5): the stored HTML made safe and ready to show.
// - sanitize(): an allowlist, so pasted or edited HTML can never run scripts (XSS);
// - prepare(): heading anchors + table of contents, lazy images, light YouTube embeds,
//   rel on outside links, and the plain-text numbers (words, reading minutes, excerpt);
// - toMarkdown(): the Markdown copy of a post (/blog/<slug>.md, for AI tools).
const sanitizeHtml = require('sanitize-html');
const { OWN_HOSTS } = require('../site');

const { slugify } = require('./slug');

const decode = text => String(text || '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;|&#8217;|&#8216;/g, "'").replace(/&#8211;/g, '–').replace(/&#8220;|&#8221;/g, '"').replace(/&#038;/g, '&');
const escapeHtml = text => String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plainText = html => decode(String(html || '').replace(/<(script|style)[^]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/(p|h[1-6]|li|blockquote|tr|div)>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
const wordCount = text => (String(text).match(/[\p{L}\p{N}]+/gu) || []).length;

// The first sentences of the text, cut at a word, for descriptions.
function excerpt(text, max = 160) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max * 0.6)).replace(/[\s,.;:–-]+$/, '')}…`;
}

const ALLOWED = {
  allowedTags: ['h2', 'h3', 'h4', 'p', 'br', 'hr', 'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup', 'mark', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li',
    'a', 'img', 'figure', 'figcaption', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'iframe', 'div', 'span', 'aside'],
  allowedAttributes: {
    a: ['href', 'title', 'rel', 'target'], img: ['src', 'alt', 'title', 'width', 'height'], iframe: ['src', 'title', 'width', 'height', 'allowfullscreen'],
    th: ['colspan', 'rowspan', 'scope'], td: ['colspan', 'rowspan'], ol: ['start'], h2: ['id'], h3: ['id'], h4: ['id'],
    div: ['class', 'data-cta'], aside: ['class'], span: ['class'], code: ['class'], pre: ['class'],
  },
  allowedClasses: { div: ['callout', 'cta', 'table-wrap'], aside: ['callout', 'cta'], span: ['highlight'], code: [/^language-/], pre: [/^language-/] },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['http', 'https'] },
  // Only YouTube may be embedded; it is replaced by a light preview in prepare().
  allowedIframeHostnames: ['www.youtube.com', 'youtube.com', 'www.youtube-nocookie.com'],
  // H1 is the post title: headings in the text start at H2.
  transformTags: { h1: 'h2', h5: 'h4', h6: 'h4' },
  // Empty inline wrappers left by pasted text are dropped.
  exclusiveFilter: frame => ['span', 'strong', 'em', 'b', 'i'].includes(frame.tag) && !frame.text.trim() && !frame.mediaChildren?.length,
};
const sanitize = html => sanitizeHtml(String(html || ''), ALLOWED);

const youtubeId = src => /(?:youtube(?:-nocookie)?\.com\/embed\/|youtu\.be\/)([\w-]{11})/.exec(String(src || ''))?.[1] || '';
const isOwn = href => { try { return OWN_HOSTS.includes(new URL(href).host.toLowerCase()); } catch { return true; } };

/**
 * Safe HTML for the post page plus what the page needs around it.
 * Returns { html, toc: [{ id, text, level }], words, minutes, text }.
 */
// options.srcsetFor(src) → srcset of an image's WebP copies, or '' (src/blog/images.js).
function prepare(rawHtml, { srcsetFor = () => '', sizes = '100vw' } = {}) {
  let html = sanitize(rawHtml);
  const used = new Set(), toc = [];
  // Every H2/H3/H4 gets a stable anchor from its text (or keeps the one the editor set).
  html = html.replace(/<(h[234])(\s+id="([^"]*)")?>([^]*?)<\/\1>/g, (all, tag, _attr, id, inner) => {
    const text = plainText(inner);
    if (!text) return '';
    let anchor = slugify(id || text) || 'muc', n = 2;
    while (used.has(anchor)) anchor = `${slugify(id || text) || 'muc'}-${n++}`;
    used.add(anchor);
    if (tag !== 'h4') toc.push({ id: anchor, text, level: Number(tag[1]) });
    return `<${tag} id="${anchor}">${inner}</${tag}>`;
  });
  // Images: lazy after the first, async decoding. Width/height stay when known (no layout shift).
  let images = 0;
  html = html.replace(/<img\b([^>]*)>/g, (all, attrs) => {
    const first = images++ === 0;
    const src = /\bsrc="([^"]+)"/.exec(attrs)?.[1] || '';
    const srcset = src ? srcsetFor(src) : '';
    const extra = (srcset ? ` srcset="${srcset}" sizes="${sizes}"` : '') + (first ? ' decoding="async"' : ' loading="lazy" decoding="async"');
    return `<img${attrs.replace(/\s*\/$/, '').replace(/\s+(loading|decoding)="[^"]*"/g, '')}${extra}>`;
  });
  // YouTube: a preview image that loads the player only when clicked (src/blog/render.js script).
  html = html.replace(/<iframe\b[^>]*src="([^"]+)"[^>]*>\s*<\/iframe>/g, (all, src) => {
    const id = youtubeId(src);
    return id ? `<div class="yt" data-yt="${id}"><img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="Video YouTube" loading="lazy" width="480" height="360"><button type="button" aria-label="Phát video">▶</button></div>` : '';
  });
  // Outside links open safely; links to this site stay plain.
  html = html.replace(/<a\b([^>]*)href="([^"]+)"([^>]*)>/g, (all, before, href, after) => {
    if (/^(#|\/|mailto:|tel:)/.test(href) || isOwn(href)) return `<a${before}href="${href}"${after.replace(/\s+target="[^"]*"/, '')}>`;
    const rel = /rel="([^"]*)"/.exec(before + after)?.[1] || '';
    const rels = [...new Set([...rel.split(/\s+/).filter(Boolean), 'noopener'])].join(' ');
    return `<a${(before + after).replace(/\s+rel="[^"]*"/g, '').replace(/\s+target="[^"]*"/g, '')} href="${href}" rel="${rels}" target="_blank">`;
  });
  // Wide tables scroll inside the column on phones.
  html = html.replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, '</table></div>');
  const text = plainText(html);
  const words = wordCount(text);
  return { html, toc, words, minutes: Math.max(1, Math.round(words / 220)), text };
}

// A readable Markdown copy (headings, paragraphs, lists, links, images, quotes, tables as rows).
function toMarkdown(html) {
  const inline = s => decode(String(s)
    .replace(/<br\s*\/?>/gi, '  \n')
    .replace(/<(strong|b)>([^]*?)<\/\1>/gi, '**$2**').replace(/<(em|i)>([^]*?)<\/\1>/gi, '_$2_').replace(/<code>([^]*?)<\/code>/gi, '`$1`')
    .replace(/<a\b[^>]*href="([^"]+)"[^>]*>([^]*?)<\/a>/gi, (all, href, text) => `[${text.replace(/<[^>]+>/g, '')}](${href})`)
    .replace(/<img\b[^>]*>/gi, tag => `![${/\balt="([^"]*)"/.exec(tag)?.[1] || ''}](${/\bsrc="([^"]+)"/.exec(tag)?.[1] || ''})`)
    .replace(/<[^>]+>/g, '')).replace(/[ \t]+/g, ' ').trim();
  const blocks = [];
  String(html || '').replace(/<div class="yt" data-yt="([\w-]+)">[^]*?<\/div>/g, (all, id) => `<p><a href="https://www.youtube.com/watch?v=${id}">Video YouTube</a></p>`)
    // Every image becomes its own block (empty paragraphs around it are skipped).
    .replace(/<img\b[^>]*>/gi, image => `</p><p>${image}</p><p>`)
    .replace(/<(h[234]|p|blockquote|ul|ol|pre|figure|table|hr)\b[^>]*>([^]*?)(?:<\/\1>|$)/gi, (all, tag, inner) => {
      tag = tag.toLowerCase();
      if (tag === 'hr') blocks.push('---');
      else if (tag[0] === 'h') blocks.push(`${'#'.repeat(Number(tag[1]))} ${inline(inner)}`);
      else if (tag === 'blockquote') blocks.push(inline(inner).split('\n').map(line => `> ${line}`).join('\n'));
      else if (tag === 'ul' || tag === 'ol') blocks.push([...inner.matchAll(/<li\b[^>]*>([^]*?)<\/li>/gi)].map((m, i) => `${tag === 'ol' ? `${i + 1}.` : '-'} ${inline(m[1])}`).join('\n'));
      else if (tag === 'pre') blocks.push(`\`\`\`\n${decode(inner.replace(/<[^>]+>/g, ''))}\n\`\`\``);
      else if (tag === 'table') blocks.push([...inner.matchAll(/<tr\b[^>]*>([^]*?)<\/tr>/gi)].map(m => `| ${[...m[1].matchAll(/<t[hd]\b[^>]*>([^]*?)<\/t[hd]>/gi)].map(c => inline(c[1])).join(' | ')} |`).join('\n'));
      else { const text = inline(inner); if (text) blocks.push(text); }
      return '';
    });
  return blocks.join('\n\n');
}

module.exports = { slugify, sanitize, prepare, toMarkdown, plainText, excerpt, escapeHtml, wordCount, youtubeId };
