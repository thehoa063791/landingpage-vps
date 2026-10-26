// node scripts/test-wp-posts.cjs — cleaning of the WordPress posts moved into the blog
// (scripts/wp-posts.cjs, docs/blog-seo-plan.md §7). No network, no database.
const assert = require('node:assert/strict');
const { cleanContent, uploadPath, autop } = require('./wp-posts.cjs');
const { analyze } = require('../src/blog/seoRules');

const images = new Map([['2021/10/elon.jpg', { url: '/storage/cms-media/blog/wp/2021/10/elon.jpg', width: 1200, height: 800 }]]);
const clean = html => cleanContent(html, { postSlugs: new Set(['bai-khac']), images });

// Block comments and shortcodes go; captions become figures.
let html = clean('<!-- wp:paragraph --><p>Một [vc_row]hai[/vc_row]</p><!-- /wp:paragraph -->[caption id="x"]<img src="https://phamthanhbien.com/wp-content/uploads/2021/10/elon-1024x683.jpg"> Elon Musk[/caption]');
assert.doesNotMatch(html, /wp:|\[/);
assert.match(html, /<figure><img src="\/storage\/cms-media\/blog\/wp\/2021\/10\/elon\.jpg" alt="" width="1200" height="800"><figcaption>Elon Musk<\/figcaption><\/figure>/, 'resized WordPress copy → the stored original');

// Classic posts get paragraphs; headings start at H2 and never skip a level.
assert.equal(autop('Dòng một\ndòng hai\n\nĐoạn hai'), '<p>Dòng một<br>dòng hai</p>\n<p>Đoạn hai</p>');
assert.equal(clean('<h3>A</h3><h3>B</h3><h4>c</h4>'), '<h2>A</h2><h2>B</h2><h3>c</h3>');
assert.equal(clean('<h3>A</h3><h2>B</h2><h4>c</h4>'), '<h2>A</h2><h2>B</h2><h3>c</h3>');

// Lost spaces restored in the text, not in links or numbers.
assert.equal(clean('<p>rồi?Với tôi này!Bạn to:“Đi ngay!”Người ông.Tuy 1.5 phamthanhbien.com</p>'), '<p>rồi? Với tôi này! Bạn to: “Đi ngay!” Người ông. Tuy 1.5 phamthanhbien.com</p>');

// Links: another post → /blog/<slug>; other pages of the site → relative; outside links kept.
html = clean('<p><a href="https://phamthanhbien.com/bai-khac/">a</a> <a href="http://www.phamthanhbien.com/dautu/?x=1">b</a> <a href="https://investopedia.com/x">c</a></p>');
assert.match(html, /href="\/blog\/bai-khac"/); assert.match(html, /href="\/dautu\?x=1"/); assert.match(html, /href="https:\/\/investopedia\.com\/x"/);

// A YouTube link alone on its line becomes an embed.
assert.match(clean('<p>https://www.youtube.com/watch?v=dQw4w9WgXcQ</p>'), /<iframe src="https:\/\/www\.youtube\.com\/embed\/dQw4w9WgXcQ"><\/iframe>/);

assert.equal(uploadPath('https://phamthanhbien.com/wp-content/uploads/2021/10/%E1%BA%A3nh-300x200.png?ver=1'), '2021/10/ảnh-300x200.png');
assert.equal(uploadPath('https://example.com/a.jpg'), '');

// The result passes the blog's publishing rules (no H1, no skipped heading level).
assert.equal(analyze({ title: 'Bài', slug: 'bai', html: clean('<h3>A</h3><p>x</p><h5>B</h5>') }).errors, 0);

console.log('PASS: WordPress posts — block comments/shortcodes removed, captions → figures, classic paragraphs, headings from H2 without skips, lost spaces restored, internal links → /blog or relative, YouTube embeds, images → stored originals.');
