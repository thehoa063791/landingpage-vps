#!/usr/bin/env node
// Imports the WordPress Redirection plugin export (JSON) into the redirects table.
//   node scripts/import-wp-redirects.cjs <redirection-export.json>          dry run: report only
//   node scripts/import-wp-redirects.cjs <redirection-export.json> --apply  write
// Re-runnable: rows are matched by their WordPress ID; hits counted here are kept.
// Decisions agreed for the phamthanhbien.com move (2026-10-22):
// - a redirect to its own path on this system (/zoom, /trading) is disabled;
// - a redirect on a path the system serves moves to "<path>-2";
// - /youtube goes straight to the channel instead of through short.phamthanhbien.com;
// - old WordPress pages that are not kept redirect to the home page.
require('dotenv').config();
const fs = require('fs');
const { planWordPressImport, getRedirectStore, sourceKey, systemPath } = require('../src/redirects');

// WordPress pages rebuilt on this system (pages/wp-*).
const KEPT_PAGES = ['/', '/ve-toi', '/cashching', '/cashchingclub', '/playlist-2', '/loinhuan', '/vong-quay-von', '/tai-san-va-dong-tien',
  '/phan-bo-danh-muc-dau-tu', '/quan-tri-cam-xuc', '/phuong-phap-hoi-tu-ky-thuat', '/chinh-sach-quy-dinh', '/thank-you-webinar'];
const TARGETS = { '/youtube': 'https://www.youtube.com/channel/UCksDjd9gQcJy4RZipD_NYaA?sub_confirmation=1' };
const OLD_PAGES_GROUP = 'Trang WordPress không giữ';

function main() {
  const [file] = process.argv.slice(2).filter(a => !a.startsWith('--'));
  if (!file) { console.error('Usage: node scripts/import-wp-redirects.cjs <redirection-export.json> [--apply]'); process.exit(1); }
  const exported = JSON.parse(fs.readFileSync(file, 'utf8'));
  const kept = new Set(KEPT_PAGES.map(sourceKey));
  const isSystemPath = key => kept.has(key) || systemPath(key);
  const sources = new Set((exported.redirects || []).map(r => sourceKey(r.match_url || r.url)));
  // Old pages: targets inside the site that no rule and no page answer any more.
  const missing = new Map();
  for (const r of exported.redirects || []) {
    if (r.enabled === false) continue;
    const target = String(r.action_data?.url || '').replace(/^https?:\/\/(www\.)?phamthanhbien\.com/i, '');
    if (/^https?:\/\//i.test(target)) continue;
    const key = sourceKey(target);
    if (!isSystemPath(key) && !sources.has(key) && !TARGETS[sourceKey(r.match_url || r.url)]) missing.set(key, (missing.get(key) || 0) + Number(r.hits || 0));
  }
  const extra = [...missing.keys()].sort().map(source => ({ source, target: '/', group_name: OLD_PAGES_GROUP, note: 'Trang WordPress cũ không chuyển sang, đưa về trang chủ' }));
  return { exported, isSystemPath, extra };
}

(async () => {
  const { exported, isSystemPath, extra } = main();
  const { rows, report } = planWordPressImport(exported, { isSystemPath, targets: TARGETS, extra });
  const line = items => items.length ? items.map(i => '  ' + Object.values(i).join(' | ')).join('\n') : '  (không có)';
  console.log(`Redirect sẽ nhập: ${rows.length} (${rows.filter(r => r.enabled).length} bật)`);
  console.log(`\nĐổi đường dẫn vì trùng trang hệ thống (${report.renamed.length}):\n${line(report.renamed)}`);
  console.log(`\nTắt vì đích là chính trang này (${report.disabled.length}):\n${line(report.disabled)}`);
  console.log(`\nĐổi đích (${report.retargeted.length}):\n${line(report.retargeted)}`);
  console.log(`\nTrang cũ đưa về trang chủ (${report.extra.length}):\n${line(report.extra)}`);
  console.log(`\nBỏ qua (${report.skipped.length}):\n${line(report.skipped)}`);
  if (!process.argv.includes('--apply')) { console.log('\nChạy thử: chưa ghi gì. Thêm --apply để nhập.'); process.exit(0); }
  const result = await getRedirectStore().importRows(rows);
  console.log(`\nĐã nhập: ${result.inserted} mới, ${result.updated} cập nhật.`);
  process.exit(0);
})().catch(error => { console.error(error); process.exit(1); });
