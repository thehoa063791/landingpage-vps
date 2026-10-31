// node scripts/test-funnel-compare.cjs — Dashboard > Compare (src/funnelCompare.js) on the local
// test database: made-up rows inside one transaction, rolled back at the end. The ad tables
// are answered by a stub (campaigns by name); the course report by a stub learning service.
require('dotenv').config();
const assert = require('node:assert/strict');
if (!/@(127\.0\.0\.1|localhost):5433\//.test(process.env.DATABASE_URL || '')) { console.error('Refusing: DATABASE_URL is not the local test database.'); process.exit(1); }
const { pool } = require('../src/db');
const { compareFunnels } = require('../src/funnelCompare');
const { clean, patterns } = require('../src/adKeywords');

// Keywords: lower case, unique, comma list or array; % _ \ taken literally in the name match.
assert.deepEqual(clean(' HTKT, htkt ,, fb_message_htkt '), ['htkt', 'fb_message_htkt']);
assert.deepEqual(patterns(['a_b', '50%']), ['%a\\_b%', '%50\\%%']);

// Facebook campaigns over the range: a funnel keyword in the name, message campaigns = chatbot.
const CAMPAIGNS = [
  { id: '111', name: '01/10/2026_fb_conversion_ALPHA', spend: 300000, reach: 10000, link_clicks: 800 },
  { id: '112', name: '19/10/2026_fb_message_alpha ver2', spend: 200000, reach: 2000, link_clicks: 100 },
  { id: '222', name: '05/10/2026_fb_conversion_beta', spend: 100000, reach: 3000, link_clicks: 150 },
  { id: '333', name: '26/10/2026_fb_message', spend: 50000, reach: 500, link_clicks: 20 },
];
const KEYWORDS = { 'cmp-a': ['alpha'], 'cmp-b': ['beta'] };
const at = day => `2026-10-${String(day).padStart(2, '0')}T10:00:00+07:00`;
// ilike '%word%' (escaped) as the database reads it.
const named = (name, pats) => pats.some(p => name.toLowerCase().includes(p.slice(1, -1).replace(/\\(.)/g, '$1').toLowerCase()));

async function main() {
  const client = await pool.connect();
  // The ad tables answered by a stub (CAMPAIGNS); everything else by the local database.
  // One connection (the transaction): its queries wait for each other.
  let queue = Promise.resolve();
  const database = { query: (sql, params) => {
    if (/c\.name ilike any\(\$2/.test(sql)) return Promise.resolve({ rows: CAMPAIGNS.filter(c => params[0].includes(c.id) || named(c.name, params[1])) });
    if (/not \(coalesce\(c\.name/.test(sql)) return Promise.resolve({ rows: CAMPAIGNS.filter(c => !named(c.name, params[0])).map(c => ({ name: c.name, spend: c.spend })) });
    const run = queue.then(() => client.query(sql, params));
    queue = run.catch(() => {});
    return run;
  } };
  try {
    await client.query('begin');
    const contact = (await client.query(`insert into public.contacts (id, display_name) values (gen_random_uuid(), 'Người cũ') returning id`)).rows[0].id;
    const reg = (id, page, day, { bot = false, contactId = null, last = '', first = '', lastSource = '', source = '', referrer = '' } = {}) => client.query(
      `insert into public.registrations (id, page_id, registered_at, email, contact_id, data, last_touch, first_touch, utm_source, referrer) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [id, page, at(day), `${id}@example.invalid`, contactId, bot ? { fb_page_id: 'fb1', fb_id: `fb-${id}` } : {}, last || lastSource ? { ...(last ? { campaign: last } : {}), ...(lastSource ? { source: lastSource } : {}) } : null, first ? { campaign: first } : null, source, referrer]);
    await reg('cmp-old-1', 'cmp-old', 1, { contactId: contact });
    await reg('cmp-a-1', 'cmp-a', 10, { contactId: contact, last: '111' });
    await reg('cmp-a-2', 'cmp-a', 11, { last: '111' });
    await reg('cmp-a-3', 'cmp-a', 12);
    await reg('cmp-a-4', 'cmp-a', 13, { bot: true });
    await reg('cmp-a-5', 'cmp-a-lp2', 14, { bot: true });
    // Bot links before fb_id (19/10): utm_source=ai-cskh, later chatbot; the bot platform's webview.
    await reg('cmp-a-6', 'cmp-a', 15, { source: 'ai-cskh' });
    await reg('cmp-a-7', 'cmp-a', 15, { lastSource: 'Chatbot' });
    await reg('cmp-a-8', 'cmp-a', 16, { referrer: 'https://webview.smax.ai/form' });
    await reg('cmp-a-9', 'cmp-a', 16, { source: 'chatbotx' }); // not the bot
    await reg('cmp-a-out', 'cmp-a', 25); // after the range
    await reg('cmp-b-1', 'cmp-b', 10, { first: '111' });
    await reg('cmp-b-2', 'cmp-b', 11, { last: '222' });
    const view = (session, page, url, day = 12, source = null, event = 'pageview') => client.query(
      `insert into public.events (id, event, event_timestamp, session_id, page_id, url, data, utm_source) values (gen_random_uuid(), $6, $1, $2, $3, $4, '{}', $5)`, [at(day), session, page, url, source, event]);
    for (const s of ['a1', 'a2', 'a3', 'a4', 'a5', 'a6']) await view(s, 'cmp-a', 'https://x.test/a');
    await view('a7', 'cmp-a', 'https://x.test/a?fb_page_id=fb1&fb_id=fb9');
    await view('a7', 'cmp-a', 'https://x.test/a'); // later page of the same bot session
    await view('a8', 'cmp-a', 'https://x.test/a?utm_source=x&fb_id=fb8');
    await view('a11', 'cmp-a', 'https://x.test/a?utm_source=ai-cskh');
    await view('a12', 'cmp-a', 'https://x.test/a?utm_source=chatbotx'); // not the bot
    await view('a13', 'cmp-a', 'https://x.test/a', 12, 'chatbot');
    // Before 28/10 only the form's conversion event of a course page carried the bot's UTM.
    await view('a14', 'cmp-a', 'https://x.test/a');
    await view('a14', 'cmp-a', 'https://x.test/a', 12, 'ai-cskh', 'conversion');
    await view('a15', 'cmp-a', 'https://x.test/a', 12, 'ai-cskh', 'conversion'); // no landing pageview: not a visit
    await view('a9', 'cmp-a', 'https://x.test/a/learn/1'); // lesson page: not a landing visit
    await view('a10', 'cmp-a', 'https://x.test/a', 26); // after the range
    for (const s of ['b1', 'b2', 'b3', 'b4']) await view(s, 'cmp-b', 'https://x.test/b');

    const lesson = (id, title, extra = {}) => ({ id, title, position: id, stage_id: 1, is_visible: true, ...extra });
    const progress = (watched, done = 0) => [1, 2, 3, 4].map(id => ({ lesson_id: id, is_visible: id !== 4, opened: id <= watched, watched_seconds: id <= watched ? 60 : 0, completed: id <= done }));
    let asked = null;
    const learning = slug => ({ report: async query => {
      assert.equal(slug, 'cmp-a'); asked = query;
      return {
        stages: [{ id: 1, position: 1, is_visible: true }, { id: 2, position: 2, is_visible: false }],
        lessons: [lesson(3, 'Bài C', { position: 3 }), lesson(1, 'Bài A'), lesson(2, 'Bài B'), lesson(4, 'Bài ẩn', { is_visible: false }), lesson(5, 'Chương ẩn', { stage_id: 2 })],
        students: [
          { id: 'cmp-a-1', watch_percent: 100, completed: 3, total_lessons: 3, lessons: progress(3, 3) },
          { id: 'cmp-a-2', watch_percent: 40, completed: 1, total_lessons: 3, lessons: progress(2, 1) },
          { id: 'cmp-a-3', watch_percent: 0, completed: 0, total_lessons: 3, lessons: progress(0) },
          { id: 'cmp-a-4', watch_percent: 20, completed: 0, total_lessons: 3, lessons: progress(1) },
          { id: 'cmp-a-5', watch_percent: 0, completed: 0, total_lessons: 3, lessons: progress(0) },
        ],
      };
    } });
    const funnels = [{ slug: 'cmp-a', name: 'A', page_ids: ['cmp-a'], learning: true }, { slug: 'cmp-b', name: 'B', page_ids: ['cmp-b'] }];
    const result = await compareFunnels(funnels, { dateFrom: '2026-10-01T00:00:00+07:00', dateTo: '2026-10-21T00:00:00+07:00' }, { database, learning, keywords: async () => KEYWORDS });
    const [a, b] = result.funnels;

    assert.deepEqual(asked, { dateFrom: '2026-09-30T17:00:00.000Z', dateTo: '2026-10-20T16:59:59.999Z' }, 'The course report gets the same range');
    assert.deepEqual([a.channels.all.visits, a.channels.landing.visits, a.channels.chatbot.visits], [12, 7, 5], 'A bot session (fb_id or utm_source of the bot) counts once, as chatbot; lesson pages and other days not counted');
    assert.deepEqual([a.channels.all.registrations, a.channels.landing.registrations, a.channels.chatbot.registrations], [9, 4, 5], 'Chatbot: fb_id, utm_source ai-cskh / chatbot, smax.ai; "<id>-..." pages belong to the funnel');
    assert.equal(a.channels.all.new_people, 8, 'The person registered in another funnel before is not new');
    assert.equal(Math.round(a.channels.landing.optin_rate), 57);
    assert.equal(a.channels.chatbot.optin_rate, 100);
    assert.equal(b.channels.chatbot.visits, 0);
    assert.equal(b.channels.all.optin_rate, 50);

    // Ads: campaigns named with the funnel's keyword (any case) or by its registrations' utm_campaign;
    // message campaigns are the chatbot's.
    const ads = (f, ch) => { const x = f.channels[ch].ads; return [x.spend, x.reach, x.link_clicks, x.cost_per_registration, x.cost_per_new]; };
    assert.deepEqual(ads(a, 'landing'), [300000, 10000, 800, 75000, 100000]);
    assert.deepEqual(ads(a, 'chatbot'), [200000, 2000, 100, 40000, 40000]);
    assert.deepEqual(ads(a, 'all'), [500000, 12000, 900, 55556, 62500]);
    assert.deepEqual(ads(b, 'landing'), [400000, 13000, 950, 200000, 200000], 'First-touch campaign IDs count too');
    assert.deepEqual(ads(b, 'chatbot'), [0, 0, 0, null, null]);
    assert.deepEqual([a.spend, b.spend], [{ shared: 300000, shared_campaigns: 1 }, { shared: 300000, shared_campaigns: 1 }], 'Campaign 111 is counted in both funnels');
    assert.deepEqual(a.keywords, ['alpha']);
    assert.deepEqual(result.unassigned_campaigns, [{ name: '26/10/2026_fb_message', spend: 50000 }], 'A campaign without a funnel keyword is listed');

    const all = a.channels.all.learning, bot = a.channels.chatbot.learning, landing = a.channels.landing.learning;
    assert.deepEqual([all.students, all.activated, all.activation_rate], [5, 3, 60]);
    assert.equal(Math.round(all.avg_watch_percent), 53, 'Average over the learners who started');
    assert.deepEqual([all.completed, all.completion_rate], [1, 20]);
    assert.deepEqual(all.lessons.map(l => [l.position, l.title, l.viewers, l.rate]), [[1, 'Bài A', 3, 60], [2, 'Bài B', 2, 40], [3, 'Bài C', 1, 20]], 'Visible lessons in learner order');
    assert.deepEqual([landing.students, landing.activated, landing.completed], [3, 2, 1]);
    assert.deepEqual([bot.students, bot.activated, bot.activation_rate, bot.avg_watch_percent], [2, 1, 50, 20]);
    assert.equal(b.channels.all.learning, null, 'No learning numbers for a funnel without lessons');
    console.log('PASS funnel compare: visits, registrations, new people, landing / chatbot, ad spend (shared campaigns), learning.');
  } finally {
    await client.query('rollback').catch(() => {});
    client.release();
    await pool.end();
  }
}

main().catch(error => { console.error(error); process.exit(1); });
