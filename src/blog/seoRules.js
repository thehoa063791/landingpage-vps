// SEO checks of a blog post (docs/blog-seo-plan.md §6), shared by the admin editor (live, as the
// writer types) and the server (errors block publishing). Thresholds follow Yoast's analysis;
// our own code since yoastseo is GPL and has no Vietnamese. No DOM or Node modules: the HTML is
// the editor's clean output, read with patterns.
const { slugify, fold } = require('./slug');

const BRAND = 'Phạm Thành Biên';
const fullTitle = title => (String(title).includes(BRAND) ? String(title) : `${title} | ${BRAND}`);

// Approximate rendered width in px of Arial (Google's results font): title 20px, snippet 14px.
// Widths in em by character class, close enough for Google's cut-offs (~580px / ~920px).
function textWidth(text, size) {
  let em = 0;
  for (const ch of String(text || '').normalize('NFC')) {
    const base = fold(ch);
    if (/[ilj.,:;'|!I]/.test(base)) em += 0.26;
    else if (/[ft r()\[\]\-/]/.test(base)) em += 0.33;
    else if (/[mw]/.test(base)) em += 0.83;
    else if (/[MW]/.test(base)) em += 0.9;
    else if (/[A-Z]/.test(base)) em += 0.68;
    else if (/[0-9]/.test(base)) em += 0.556;
    else em += 0.53;
  }
  return Math.round(em * size);
}
const TITLE_PX = 580, DESC_PX = 920;

const stripTags = html => String(html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
const words = text => (String(text).match(/[\p{L}\p{N}]+/gu) || []);
const has = (text, keyword) => !!keyword && fold(text).replace(/\s+/g, ' ').includes(fold(keyword).replace(/\s+/g, ' ').trim());

/**
 * post: { title, seo_title, meta_description, slug, focus_keyword, html, cover_image, cover_alt, robots }
 * context: { keywordUsedBy: [titles of other posts with the same focus keyword], siteHosts: [hosts of this site] }
 * Returns { checks: [{ id, level: 'error' | 'warn' | 'ok', label, message }], score (0–100), errors }.
 */
function analyze(post, context = {}) {
  const checks = [];
  const add = (id, level, label, message) => checks.push({ id, level, label, message });
  const html = String(post.html || '');
  const text = stripTags(html);
  const wordCount = words(text).length;
  const keyword = String(post.focus_keyword || '').trim();
  const title = String(post.title || '').trim();
  const seoTitle = fullTitle(String(post.seo_title || '').trim() || title);
  const description = String(post.meta_description || '').trim();
  const slug = String(post.slug || '');
  const hosts = context.siteHosts || ['phamthanhbien.com', 'www.phamthanhbien.com', 'event.phamthanhbien.com'];

  // Errors: publishing is blocked.
  add('title', title ? 'ok' : 'error', 'Tiêu đề', title ? 'Đã có tiêu đề.' : 'Bài cần có tiêu đề.');
  const slugOk = !!slug && slugify(slug) === slug;
  add('slug', slugOk ? 'ok' : 'error', 'Đường dẫn', slugOk ? `/blog/${slug}` : 'Đường dẫn chỉ gồm chữ thường không dấu, số và dấu gạch ngang.');
  if (post.cover_image) add('cover-alt', String(post.cover_alt || '').trim() ? 'ok' : 'error', 'Alt ảnh bìa', String(post.cover_alt || '').trim() ? 'Ảnh bìa có mô tả (alt).' : 'Ảnh bìa cần mô tả (alt) cho Google và người dùng trình đọc màn hình.');
  const levels = [...html.matchAll(/<h([1-6])\b/gi)].map(m => Number(m[1]));
  if (levels.includes(1)) add('h1', 'error', 'Tiêu đề H1', 'Nội dung không được có H1: tiêu đề bài đã là H1. Đổi thành H2.');
  const jump = levels.find((level, i) => level > (i ? levels[i - 1] : 1) + 1);
  add('headings', jump ? 'error' : 'ok', 'Cấp tiêu đề', jump ? `Tiêu đề con nhảy cấp (lên H${jump} khi chưa có cấp trên). Dùng lần lượt H2 → H3 → H4.` : levels.length ? 'Tiêu đề con theo đúng thứ tự.' : 'Chưa có tiêu đề con (H2).');

  // Warnings: shown with how to fix, never blocking.
  const titlePx = textWidth(seoTitle, 20);
  add('seo-title', titlePx > TITLE_PX ? 'warn' : seoTitle.length < 30 ? 'warn' : 'ok', 'Tiêu đề SEO',
    titlePx > TITLE_PX ? `Dài ${titlePx}px, Google sẽ cắt (tối đa ~${TITLE_PX}px). Rút gọn tiêu đề SEO.` : seoTitle.length < 30 ? 'Hơi ngắn: nên 30–60 ký tự để mô tả đủ nội dung.' : `Độ dài ổn (${seoTitle.length} ký tự, ${titlePx}px).`);
  const descPx = textWidth(description, 14);
  add('description', !description ? 'warn' : description.length < 120 || descPx > DESC_PX ? 'warn' : 'ok', 'Mô tả',
    !description ? 'Chưa có mô tả: Google sẽ tự lấy một đoạn trong bài. Nên viết 120–160 ký tự.'
      : descPx > DESC_PX ? `Dài ${descPx}px, Google sẽ cắt (tối đa ~${DESC_PX}px).` : description.length < 120 ? `Hơi ngắn (${description.length} ký tự): nên 120–160 ký tự.` : `Độ dài ổn (${description.length} ký tự).`);

  if (!keyword) add('keyword', 'warn', 'Từ khóa chính', 'Chưa đặt từ khóa chính: đặt một cụm từ người đọc hay tìm để kiểm tra các mục dưới.');
  else {
    const firstParagraph = stripTags(/<p\b[^>]*>([^]*?)<\/p>/i.exec(html)?.[1] || '');
    const h2s = [...html.matchAll(/<h2\b[^>]*>([^]*?)<\/h2>/gi)].map(m => stripTags(m[1]));
    const places = [
      ['keyword-title', 'Từ khóa trong tiêu đề', has(seoTitle, keyword) || has(title, keyword), 'Đưa từ khóa vào tiêu đề (tốt nhất ở đầu).'],
      ['keyword-slug', 'Từ khóa trong đường dẫn', slug.includes(slugify(keyword)), `Đường dẫn nên chứa "${slugify(keyword)}".`],
      ['keyword-intro', 'Từ khóa ở đoạn đầu', has(firstParagraph, keyword), 'Nhắc từ khóa ngay trong đoạn mở đầu.'],
      ['keyword-h2', 'Từ khóa trong tiêu đề con', h2s.some(t => has(t, keyword)), 'Dùng từ khóa (hoặc cách nói gần) trong ít nhất một H2.'],
      ['keyword-description', 'Từ khóa trong mô tả', has(description, keyword), 'Đưa từ khóa vào mô tả.'],
    ];
    for (const [id, label, ok, fix] of places) add(id, ok ? 'ok' : 'warn', label, ok ? 'Đạt.' : fix);
    const others = context.keywordUsedBy || [];
    add('keyword-unique', others.length ? 'warn' : 'ok', 'Từ khóa chưa trùng bài khác', others.length ? `Bài khác đã dùng từ khóa này: ${others.slice(0, 3).join('; ')}. Hai bài sẽ tranh nhau một từ khóa.` : 'Chưa bài nào khác dùng từ khóa này.');
  }

  add('length', wordCount >= 600 ? 'ok' : 'warn', 'Độ dài bài',
    wordCount >= 600 ? `${wordCount} chữ.` : wordCount < 300 ? `Chỉ ${wordCount} chữ: bài quá mỏng. Viết thêm, hoặc đặt noindex.` : `${wordCount} chữ: nên từ 600 chữ để đủ sâu.`);
  const images = [...html.matchAll(/<img\b[^>]*>/gi)].map(m => m[0]);
  const noAlt = images.filter(tag => !/\balt="[^"]+"/.test(tag)).length;
  if (images.length) add('image-alt', noAlt ? 'warn' : 'ok', 'Alt của ảnh trong bài', noAlt ? `${noAlt}/${images.length} ảnh chưa có mô tả (alt).` : 'Mọi ảnh đều có alt.');
  const hrefs = [...html.matchAll(/<a\b[^>]*href="([^"]+)"/gi)].map(m => m[1]);
  const internal = hrefs.filter(href => href.startsWith('/') || hosts.some(host => href.includes(`//${host}`))).length;
  const external = hrefs.filter(href => /^https?:\/\//.test(href) && !hosts.some(host => href.includes(`//${host}`))).length;
  add('internal-links', internal >= 2 ? 'ok' : 'warn', 'Link nội bộ', internal >= 2 ? `${internal} link tới trang khác của site.` : `Có ${internal} link nội bộ: nên ít nhất 2 (bài liên quan, chương trình).`);
  add('external-links', external >= 1 ? 'ok' : 'warn', 'Link nguồn bên ngoài', external >= 1 ? `${external} link ra nguồn bên ngoài.` : 'Nên dẫn ít nhất 1 nguồn uy tín bên ngoài.');
  const paragraphs = [...html.matchAll(/<p\b[^>]*>([^]*?)<\/p>/gi)].map(m => words(stripTags(m[1])).length);
  const longParagraphs = paragraphs.filter(n => n > 150).length;
  add('paragraphs', longParagraphs ? 'warn' : 'ok', 'Độ dài đoạn văn', longParagraphs ? `${longParagraphs} đoạn quá 150 chữ: tách nhỏ cho dễ đọc trên điện thoại.` : 'Đoạn văn vừa phải.');
  const sentences = text.split(/(?<=[.!?…])\s+/).map(s => words(s).length).filter(Boolean);
  const longSentences = sentences.filter(n => n > 35).length;
  const tooMany = sentences.length && longSentences / sentences.length > 0.2;
  add('sentences', tooMany ? 'warn' : 'ok', 'Độ dài câu', tooMany ? `${longSentences}/${sentences.length} câu dài hơn 35 chữ: nên dưới 20%.` : 'Câu văn vừa phải.');
  add('slug-length', slug.length > 75 ? 'warn' : 'ok', 'Độ dài đường dẫn', slug.length > 75 ? `Đường dẫn dài ${slug.length} ký tự: nên dưới 75, bỏ các từ thừa.` : 'Đường dẫn gọn.');

  const points = { ok: 1, warn: 0.5, error: 0 };
  const score = Math.round(checks.reduce((sum, c) => sum + points[c.level], 0) / checks.length * 100);
  return { checks, score, errors: checks.filter(c => c.level === 'error').length, words: wordCount, titlePx, descPx };
}

module.exports = { analyze, textWidth, fullTitle, TITLE_PX, DESC_PX };
