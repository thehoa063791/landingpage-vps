// Funnel overview by people (roadmap 3.2b): registrations of a funnel split into people new to
// the system and people who already had a profile from another funnel (contacts layer), per
// day and per source, compared with the period before. Counted in SQL; nothing is loaded whole.
const { pool } = require('./db');

const DAY = 86400000;
// The funnel's registrations: its page IDs, also "<id>-..." variants, as src/funnels.js findFunnel.
const PAGE_MATCH = alias => `(${alias}.page_id = any($1::text[]) or ${alias}.page_id like any($2::text[]))`;
const SOURCE = (alias, which) => `coalesce(nullif(${alias}.${which}->>'source', ''), nullif(${alias}.utm_source, ''), '(direct)')`;
const CAMPAIGN = (alias, which) => `coalesce(nullif(${alias}.${which}->>'campaign', ''), nullif(${alias}.utm_campaign, ''), '')`;
const VN_DAY = column => `to_char((${column}) at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD')`;

function periods(dateFrom, dateTo, now = new Date()) {
  const to = dateTo ? new Date(dateTo) : now;
  const from = dateFrom ? new Date(dateFrom) : new Date(to.getTime() - 30 * DAY);
  const length = Math.max(DAY / 24, to.getTime() - from.getTime());
  return { from, to, prevFrom: new Date(from.getTime() - length), prevTo: from };
}

async function funnelPeople(funnel, { dateFrom, dateTo, now } = {}, { database = pool } = {}) {
  const ids = funnel.page_ids?.length ? funnel.page_ids : [funnel.slug];
  const likes = ids.map(id => `${id.replace(/[\\%_]/g, ch => `\\${ch}`)}-%`);
  const { from, to, prevFrom, prevTo } = periods(dateFrom, dateTo, now);
  const q = (sql, params) => database.query(sql, params).then(r => r.rows);
  // Each registration with whether its person existed before it, and where they came from.
  const regsCte = `with regs as (
    select r.id, r.contact_id, r.registered_at, r.email, r.data, r.first_touch, r.last_touch, r.utm_source, r.utm_campaign,
           prior.page_id as prior_page, prior.registered_at as prior_at,
           exists (select 1 from public.registrations s where s.contact_id = r.contact_id and s.id <> r.id and ${PAGE_MATCH('s')}
                    and s.registered_at < r.registered_at and lower(coalesce(s.email, '')) <> lower(coalesce(r.email, ''))) as same_funnel_other_email
      from public.registrations r
      left join lateral (select p.page_id, p.registered_at from public.registrations p
                          where r.contact_id is not null and p.contact_id = r.contact_id and p.id <> r.id and p.registered_at < r.registered_at
                          order by p.registered_at asc limit 1) prior on true
     where ${PAGE_MATCH('r')} and r.registered_at >= $3 and r.registered_at < $4)`;
  const summarySql = `${regsCte}
    select count(*)::int as registrations,
           count(distinct coalesce(contact_id::text, id))::int as people,
           count(*) filter (where prior_page is null)::int as new_people,
           count(*) filter (where prior_page is not null)::int as existing_people,
           count(*) filter (where same_funnel_other_email)::int as same_person_other_email
      from regs`;
  const [current, previous, daily, origins, repeats, lastSources, firstSources, visits, prevVisits, visitsBySource] = await Promise.all([
    q(summarySql, [ids, likes, from, to]).then(r => r[0]),
    q(summarySql, [ids, likes, prevFrom, prevTo]).then(r => r[0]),
    q(`${regsCte} select ${VN_DAY('registered_at')} as day, count(*) filter (where prior_page is null)::int as new, count(*) filter (where prior_page is not null)::int as existing
         from regs group by 1 order by 1`, [ids, likes, from, to]),
    q(`${regsCte} select prior_page as page_id, count(*)::int as count from regs where prior_page is not null group by 1 order by 2 desc limit 8`, [ids, likes, from, to]),
    // Repeat submissions of the period (kept in the registration's form history, not counted as registrations).
    q(`select count(*)::int as n from public.registrations r, jsonb_array_elements(case when jsonb_typeof(r.data->'registration_forms') = 'array' then r.data->'registration_forms' else '[]'::jsonb end) f
        where ${PAGE_MATCH('r')} and f->>'source' = 'repeat_submission' and (f->>'submitted_at')::timestamptz >= $3 and (f->>'submitted_at')::timestamptz < $4`, [ids, likes, from, to]).then(r => r[0].n),
    q(`${regsCte} select ${SOURCE('regs', 'last_touch')} as source, ${CAMPAIGN('regs', 'last_touch')} as campaign, count(*)::int as registrations, count(*) filter (where prior_page is null)::int as new_people
         from regs group by 1, 2 order by 3 desc limit 25`, [ids, likes, from, to]),
    q(`${regsCte} select ${SOURCE('regs', 'first_touch')} as source, ${CAMPAIGN('regs', 'first_touch')} as campaign, count(*)::int as registrations, count(*) filter (where prior_page is null)::int as new_people
         from regs group by 1, 2 order by 3 desc limit 25`, [ids, likes, from, to]),
    pageviewSessions(q, funnel, ids, likes, from, to),
    pageviewSessions(q, funnel, ids, likes, prevFrom, prevTo),
    q(`select coalesce(nullif(e.utm_source, ''), nullif(e.data->>'utm_source', ''), '(direct)') as source,
              coalesce(nullif(e.utm_campaign, ''), nullif(e.data->>'utm_campaign', ''), '') as campaign,
              count(distinct coalesce(e.session_id, e.ip))::int as visits
         from public.events e
        where e.event = 'pageview' and e.event_timestamp >= $3 and e.event_timestamp < $4 and ${PAGE_MATCH('e')} ${funnel.learning ? "and coalesce(e.url, '') not like '%/learn%'" : ''}
        group by 1, 2`, [ids, likes, from, to]),
  ]);
  const spend = await adSpend(q, [...lastSources, ...firstSources].map(s => s.campaign).filter(Boolean), from, to, prevFrom, prevTo, ids, likes);
  const visitsKey = new Map(visitsBySource.map(v => [`${v.source}|${v.campaign}`, v.visits]));
  const withMoney = rows => rows.map(row => {
    const cost = spend.byCampaign[row.campaign];
    return { ...row, visits: visitsKey.get(`${row.source}|${row.campaign}`) || 0, spend: cost ?? null, cost_per_new: cost != null && row.new_people ? Math.round(cost / row.new_people) : null };
  });
  return {
    funnel: funnel.slug,
    range: { from: from.toISOString(), to: to.toISOString(), previous_from: prevFrom.toISOString(), previous_to: prevTo.toISOString() },
    current: { ...current, visits, repeats },
    previous: { ...previous, visits: prevVisits },
    daily,
    origins,
    sources: { last_touch: withMoney(lastSources), first_touch: withMoney(firstSources) },
    spend: { total: spend.total, previous_total: spend.previousTotal, matched_registrations: spend.matched, paid_registrations: spend.paid },
  };
}

// Sessions that viewed the funnel's landing pages (course funnels: not the lesson pages).
async function pageviewSessions(q, funnel, ids, likes, from, to) {
  const rows = await q(`select count(distinct coalesce(e.session_id, e.ip))::int as n from public.events e
    where e.event = 'pageview' and e.event_timestamp >= $3 and e.event_timestamp < $4 and ${PAGE_MATCH('e')} ${funnel.learning ? "and coalesce(e.url, '') not like '%/learn%'" : ''}`, [ids, likes, from, to]);
  return rows[0].n;
}

// Ad spend of the Facebook campaigns these registrations name (utm_campaign = campaign ID).
// A campaign can also bring people to other funnels; its whole spend is counted here.
async function adSpend(q, campaigns, from, to, prevFrom, prevTo, ids, likes) {
  const empty = { byCampaign: {}, total: null, previousTotal: null, matched: 0, paid: 0 };
  const names = [...new Set(campaigns)];
  try {
    const [rows, coverage] = await Promise.all([
      names.length ? q(`select c.platform_id as campaign,
                coalesce(sum(d.spend) filter (where d.date >= ($2::timestamptz at time zone 'Asia/Ho_Chi_Minh')::date and d.date < ($3::timestamptz at time zone 'Asia/Ho_Chi_Minh')::date), 0)::float as spend,
                coalesce(sum(d.spend) filter (where d.date >= ($4::timestamptz at time zone 'Asia/Ho_Chi_Minh')::date and d.date < ($5::timestamptz at time zone 'Asia/Ho_Chi_Minh')::date), 0)::float as previous
           from public.campaigns c left join public.daily_stats d on d.entity_id = c.id and d.entity_type = 'campaign'
          where c.platform_id = any($1::text[]) group by c.platform_id`, [names, from, to, prevFrom, prevTo]) : [],
      q(`select count(*) filter (where ${SOURCE('r', 'last_touch')} ilike any(array['%facebook%', 'fb', 'ig', '%instagram%']))::int as paid,
                count(*) filter (where exists (select 1 from public.campaigns c where c.platform_id = ${CAMPAIGN('r', 'last_touch')}))::int as matched
           from public.registrations r where ${PAGE_MATCH('r')} and r.registered_at >= $3 and r.registered_at < $4`, [ids, likes, from, to]).then(r => r[0]),
    ]);
    if (!rows.length) return { ...empty, matched: coverage.matched, paid: coverage.paid };
    return {
      byCampaign: Object.fromEntries(rows.map(r => [r.campaign, Math.round(r.spend)])),
      total: Math.round(rows.reduce((sum, r) => sum + r.spend, 0)),
      previousTotal: Math.round(rows.reduce((sum, r) => sum + r.previous, 0)),
      matched: coverage.matched, paid: coverage.paid,
    };
  } catch (error) {
    if (!/relation .* does not exist/i.test(error.message)) console.warn('[funnelPeople] ad spend unavailable:', error.message);
    return empty;
  }
}

// New people per funnel for the funnel list (one query for all funnels).
async function newPeopleByPage({ dateFrom, dateTo, now } = {}, { database = pool } = {}) {
  const { from, to } = periods(dateFrom, dateTo, now);
  const { rows } = await database.query(`
    select r.page_id, count(*)::int as registrations, count(distinct coalesce(r.contact_id::text, r.id))::int as people,
           count(*) filter (where not exists (select 1 from public.registrations p where r.contact_id is not null and p.contact_id = r.contact_id and p.id <> r.id and p.registered_at < r.registered_at))::int as new_people
      from public.registrations r where r.registered_at >= $1 and r.registered_at < $2 group by r.page_id`, [from, to]);
  return rows;
}

module.exports = { funnelPeople, newPeopleByPage, periods };
