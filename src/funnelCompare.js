// Dashboard > Compare: the same numbers for several funnels over one date range, side by side.
// Every count is split into landing leads and chatbot leads. A chatbot lead came through a link
// of the customer-care bot: since 19/10/2026 they carry utm_source=ai-cskh (later "chatbot"),
// since 28/10 also ?fb_page_id=&fb_id= (kept 90 days in the ptb_fb cookie, src/attribution.js,
// stored on the registration); some came from the bot platform's webview (smax.ai).
// A chatbot visit is a session that opened such a link.
const { pool } = require('./db');
const { PAGE_MATCH, CAMPAIGN, periods } = require('./funnelPeople');
const { allKeywords, patterns } = require('./adKeywords');
const { getAdminService } = require('./learningAdmin');

const CHANNELS = ['all', 'landing', 'chatbot'];
const BOT_SOURCES = "array['chatbot', 'ai-cskh']";
const BOT_SITE = "'smax\\.ai'";
const BOT_REG = alias => `(coalesce(${alias}.data->>'fb_id', '') <> ''
  or lower(coalesce(nullif(${alias}.utm_source, ''), ${alias}.last_touch->>'source', '')) = any(${BOT_SOURCES})
  or concat_ws(' ', ${alias}.utm_source, ${alias}.referrer, ${alias}.last_touch->>'source', ${alias}.last_touch->>'referrer_host') ~* ${BOT_SITE})`;
const BOT_URL = alias => `(coalesce(nullif(${alias}.url, ''), ${alias}.data->>'url', '') ~* '[?&](fb_id=|utm_source=(chatbot|ai-cskh)(&|$))'
  or lower(coalesce(nullif(${alias}.utm_source, ''), ${alias}.data->>'utm_source', '')) = any(${BOT_SOURCES})
  or concat_ws(' ', ${alias}.utm_source, ${alias}.referrer) ~* ${BOT_SITE})`;
const rate = (part, whole) => whole ? part / whole * 100 : null;
const pick = (counts, channel) => channel === 'all' ? counts.landing + counts.chatbot : counts[channel];
// Message campaigns ("…_fb_message_htkt") bring people to the chatbot; the others to the landing.
const MESSAGE_CAMPAIGN = /(^|[^a-z])message/i;
const AD_DATE = n => `($${n}::timestamptz at time zone 'Asia/Ho_Chi_Minh')::date`;

async function compareFunnels(funnels, { dateFrom, dateTo, now } = {}, { database = pool, learning = getAdminService, keywords = allKeywords } = {}) {
  const { from, to } = periods(dateFrom, dateTo, now);
  const q = (sql, params) => database.query(sql, params).then(r => r.rows);
  const words = await keywords();
  const [rows, unassigned] = await Promise.all([
    Promise.all(funnels.map(funnel => funnelNumbers(q, funnel, from, to, learning, words[funnel.slug] || []))),
    unassignedCampaigns(q, Object.values(words).flat(), from, to),
  ]);
  // A campaign counted in more than one of these funnels (keywords or utm_campaign of both):
  // its whole spend is in each, so the page says how much of a funnel's spend is shared.
  const owners = new Map();
  rows.forEach(row => row.campaigns.forEach(c => owners.set(c.id, (owners.get(c.id) || 0) + 1)));
  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    unassigned_campaigns: unassigned,
    funnels: rows.map(({ campaigns, ...row }) => {
      const shared = campaigns.filter(c => owners.get(c.id) > 1);
      return { ...row, keywords: words[row.slug] || [], spend: { shared: shared.length ? Math.round(shared.reduce((sum, c) => sum + c.spend, 0)) : 0, shared_campaigns: shared.length } };
    }),
  };
}

async function funnelNumbers(q, funnel, from, to, learning, keywords) {
  const ids = funnel.page_ids?.length ? funnel.page_ids : [funnel.slug];
  const likes = ids.map(id => `${id.replace(/[\\%_]/g, ch => `\\${ch}`)}-%`);
  const params = [ids, likes, from, to];
  const [visits, regs, campaignIds, bots] = await Promise.all([
    // Sessions on the funnel's landing pages (course funnels: not the lesson pages). Any event of
    // the session can name the bot: before 28/10 the course pages' pageviews had no UTM, their
    // form's conversion event did.
    q(`with v as (select coalesce(e.session_id, e.ip) as s, bool_or(${BOT_URL('e')}) as bot,
              bool_or(e.event = 'pageview' ${funnel.learning ? "and coalesce(e.url, '') not like '%/learn%'" : ''}) as visit
         from public.events e
        where e.event in ('pageview', 'conversion') and e.event_timestamp >= $3 and e.event_timestamp < $4 and ${PAGE_MATCH('e')} and coalesce(e.session_id, e.ip) is not null group by 1)
       select count(*) filter (where visit and not bot)::int as landing, count(*) filter (where visit and bot)::int as chatbot from v`, params).then(r => r[0]),
    // Registrations, and the ones by people new to the system (no earlier registration).
    q(`select ${BOT_REG('r')} as bot, count(*)::int as registrations,
              count(*) filter (where not exists (select 1 from public.registrations p where r.contact_id is not null and p.contact_id = r.contact_id and p.id <> r.id and p.registered_at < r.registered_at))::int as new_people
         from public.registrations r where ${PAGE_MATCH('r')} and r.registered_at >= $3 and r.registered_at < $4 group by 1`, params),
    // Campaign IDs the registrations name (utm_campaign={{campaign.id}} links).
    q(`select distinct c from public.registrations r, lateral (values (${CAMPAIGN('r', 'last_touch')}), (${CAMPAIGN('r', 'first_touch')})) t(c)
        where ${PAGE_MATCH('r')} and r.registered_at >= $3 and r.registered_at < $4 and c <> ''`, params).then(r => r.map(row => row.c)),
    funnel.learning ? q(`select r.id from public.registrations r where ${PAGE_MATCH('r')} and ${BOT_REG('r')}`, [ids, likes]).then(r => new Set(r.map(row => row.id))) : null,
  ]);
  const regOf = bot => regs.find(row => row.bot === bot) || { registrations: 0, new_people: 0 };
  const counts = {
    visits: visits || { landing: 0, chatbot: 0 },
    registrations: { landing: regOf(false).registrations, chatbot: regOf(true).registrations },
    new_people: { landing: regOf(false).new_people, chatbot: regOf(true).new_people },
  };
  const [campaigns, course] = await Promise.all([
    adCampaigns(q, keywords, campaignIds, from, to),
    funnel.learning ? learningNumbers(learning(funnel.slug), from, to, bots) : null,
  ]);
  const channels = Object.fromEntries(CHANNELS.map(channel => {
    const v = pick(counts.visits, channel), r = pick(counts.registrations, channel), fresh = pick(counts.new_people, channel);
    return [channel, { visits: v, registrations: r, new_people: fresh, optin_rate: rate(r, v), ads: adsOf(campaigns, channel, r, fresh), learning: course ? course[channel] : null }];
  }));
  return { slug: funnel.slug, name: funnel.name, url: funnel.url, learning: !!funnel.learning, channels, campaigns: campaigns || [] };
}

// Spend, reach and link clicks of a channel's campaigns, and its costs. null without ad data.
function adsOf(campaigns, channel, registrations, fresh) {
  if (!campaigns || !campaigns.length) return null;
  const own = campaigns.filter(c => channel === 'all' || (channel === 'chatbot') === c.chatbot);
  const sum = key => Math.round(own.reduce((total, c) => total + c[key], 0));
  const spend = sum('spend');
  return {
    spend, reach: sum('reach'), link_clicks: sum('link_clicks'), campaigns: own.length,
    cost_per_registration: registrations ? Math.round(spend / registrations) : null,
    cost_per_new: fresh ? Math.round(spend / fresh) : null,
  };
}

// The funnel's Facebook campaigns over the range: named with one of its keywords, or named by
// its registrations' utm_campaign. Reach and link clicks are per day, added up (a person reached
// on two days counts twice). null when the ad tables are missing.
async function adCampaigns(q, keywords, campaignIds, from, to) {
  if (!keywords.length && !campaignIds.length) return [];
  try {
    const rows = await q(`select c.platform_id as id, c.name, coalesce(sum(d.spend), 0)::float as spend, coalesce(sum(d.reach), 0)::float as reach, coalesce(sum(d.link_clicks), 0)::float as link_clicks
        from public.campaigns c join public.daily_stats d on d.entity_id = c.id and d.entity_type = 'campaign'
       where d.date >= ${AD_DATE(3)} and d.date < ${AD_DATE(4)} and (c.platform_id = any($1::text[]) or c.name ilike any($2::text[]))
       group by 1, 2`, [campaignIds, patterns(keywords), from, to]);
    return rows.map(row => ({ ...row, chatbot: MESSAGE_CAMPAIGN.test(row.name || '') }));
  } catch (error) {
    if (!/relation .* does not exist/i.test(error.message)) console.warn('[funnelCompare] ad numbers unavailable:', error.message);
    return null;
  }
}

// Campaigns that spent in the range with no funnel keyword in their name (to be given one).
async function unassignedCampaigns(q, keywords, from, to) {
  try {
    const rows = await q(`select c.name, coalesce(sum(d.spend), 0)::float as spend
        from public.campaigns c join public.daily_stats d on d.entity_id = c.id and d.entity_type = 'campaign'
       where d.date >= ${AD_DATE(2)} and d.date < ${AD_DATE(3)} and not (coalesce(c.name, '') ilike any($1::text[]))
       group by c.id, c.name having sum(d.spend) > 0 order by 2 desc limit 10`, [patterns(keywords), from, to]);
    return rows.map(row => ({ name: row.name, spend: Math.round(row.spend) }));
  } catch {
    return [];
  }
}

// Course funnels: the learners who registered in the range (as the funnel's Học viên tab),
// whatever they watched afterwards.
async function learningNumbers(service, from, to, bots) {
  const report = await service.report({ dateFrom: from.toISOString(), dateTo: new Date(to.getTime() - 1).toISOString() });
  const stages = new Map((report.stages || []).map(s => [Number(s.id), s]));
  const stagePos = new Map([...stages].map(([id, s]) => [id, Number(s.position ?? id)]));
  // The lessons learners see (as the report's), in their order: chapter, then lesson.
  const lessons = report.lessons.filter(l => l.is_visible !== false && (!l.stage_id || stages.get(Number(l.stage_id)) && stages.get(Number(l.stage_id)).is_visible !== false))
    .sort((a, b) => (stagePos.get(Number(a.stage_id)) ?? Number.MAX_SAFE_INTEGER) - (stagePos.get(Number(b.stage_id)) ?? Number.MAX_SAFE_INTEGER) || Number(a.position || a.id) - Number(b.position || b.id));
  const started = s => s.lessons.some(l => l.opened || l.watched_seconds > 0 || l.completed);
  const watched = (s, id) => s.lessons.some(l => l.lesson_id === Number(id) && (l.watched_seconds > 0 || l.completed));
  return Object.fromEntries(CHANNELS.map(channel => {
    const students = report.students.filter(s => channel === 'all' || (channel === 'chatbot') === bots.has(s.id));
    const active = students.filter(started);
    const done = students.filter(s => s.total_lessons > 0 && s.completed >= s.total_lessons);
    return [channel, {
      students: students.length,
      activated: active.length, activation_rate: rate(active.length, students.length),
      // Average share of the whole programme watched, among the learners who started.
      avg_watch_percent: active.length ? active.reduce((sum, s) => sum + Number(s.watch_percent || 0), 0) / active.length : null,
      completed: done.length, completion_rate: rate(done.length, students.length),
      lessons: lessons.map((l, i) => {
        const viewers = students.filter(s => watched(s, l.id)).length;
        return { position: i + 1, id: Number(l.id), title: l.title, viewers, rate: rate(viewers, students.length) };
      }),
    }];
  }));
}

module.exports = { compareFunnels };
