const express = require('express');
const { pool } = require('../db');
const { adminCookieOrAuth, wrap } = require('../utils');
const { syncAccount, syncDates } = require('../metaAdsSync');

const router = express.Router();
router.use(adminCookieOrAuth);

function range(req) {
  return [req.query.start || '2026-01-01', req.query.end || new Date().toISOString().slice(0, 10)];
}
function accountId(req) {
  const value = String(req.query.accountId || '').trim();
  return value || null;
}
const resultsSql = `coalesce((actions->>'complete_registration')::numeric,
  (actions->>'purchase')::numeric, (actions->>'lead')::numeric, 0)`;
const registrationsSql = `coalesce((actions->>'offsite_conversion.fb_pixel_complete_registration')::numeric,
  (actions->>'complete_registration')::numeric, 0)`;
const purchasesSql = `coalesce((actions->>'offsite_conversion.fb_pixel_purchase')::numeric,
  (actions->>'onsite_web_purchase')::numeric, (actions->>'purchase')::numeric, 0)`;
const revenueSql = `coalesce((action_values->>'offsite_conversion.fb_pixel_purchase')::numeric,
  (action_values->>'onsite_web_purchase')::numeric, (action_values->>'purchase')::numeric, 0)`;
const landingViewsSql = `coalesce((actions->>'landing_page_view')::numeric, 0)`;

router.get('/accounts', wrap(async (_req, res) => {
  const { rows } = await pool.query(`select id, name, platform, platform_account_id, currency, status, last_synced_at
    from ad_accounts order by case when status='active' then 0 else 1 end, name`);
  res.json(rows);
}));

router.get('/kpis', wrap(async (req, res) => {
  const [start, end] = range(req);
  const account = accountId(req);
  const { rows } = await pool.query(`select coalesce(sum(spend),0)::float spend,
    coalesce(sum(impressions),0)::float impressions, coalesce(sum(reach),0)::float reach,
    coalesce(sum(clicks),0)::float clicks, coalesce(sum(link_clicks),0)::float link_clicks,
    coalesce(sum(${registrationsSql}),0)::float registrations,
    coalesce(sum(${purchasesSql}),0)::float purchases,
    coalesce(sum(${revenueSql}),0)::float revenue,
    coalesce(sum(${landingViewsSql}),0)::float landing_page_views,
    coalesce(sum(${resultsSql}),0)::float results,
    count(distinct entity_id)::int campaigns from daily_stats
    where entity_type='campaign' and date between $1 and $2
      and ($3::uuid is null or account_id=$3)`, [start, end, account]);
  const row = rows[0];
  addDerivedMetrics(row);
  row.conversion_rate = row.landing_page_views ? row.registrations * 100 / row.landing_page_views : 0;
  res.json(row);
}));

router.get('/daily', wrap(async (req, res) => {
  const [start, end] = range(req);
  const account = accountId(req);
  const { rows } = await pool.query(`select date::text d, sum(spend)::float spend,
    sum(${resultsSql})::float results, sum(${registrationsSql})::float registrations,
    sum(${revenueSql})::float revenue from daily_stats
    where entity_type='campaign' and date between $1 and $2
      and ($3::uuid is null or account_id=$3) group by date order by date`, [start, end, account]);
  res.json(rows);
}));

router.post('/sync', wrap(async (req, res) => {
  const account = String(req.body?.accountId || '').trim();
  const type = ['today', 'incremental', 'backfill'].includes(req.body?.type) ? req.body.type : 'today';
  if (!account) return res.status(400).json({ error: 'accountId is required' });
  const dates = syncDates(type);
  const result = await syncAccount(account, { ...dates, jobType: type === 'today' ? 'realtime' : type });
  res.json({ ...result, ...dates, type });
}));

router.get('/sync/status', wrap(async (req, res) => {
  const account = accountId(req);
  const { rows } = await pool.query(`select id,job_type,date_from,date_to,status,rows_upserted,error_message,
    started_at,finished_at from sync_jobs where ($1::uuid is null or account_id=$1)
    order by created_at desc limit 10`, [account]);
  res.json(rows);
}));

router.get('/demographics', wrap(async (req, res) => {
  const [start, end] = range(req);
  const account = accountId(req);
  const type = ['age', 'gender', 'platform_position'].includes(req.query.type) ? req.query.type : 'age';
  const { rows } = await pool.query(`select breakdown_value k, sum(spend)::float spend,
    sum(${resultsSql})::float results from breakdown_stats
    where breakdown_type=$1 and date between $2 and $3
      and ($4::uuid is null or account_id=$4) group by breakdown_value order by breakdown_value`, [type, start, end, account]);
  res.json(rows);
}));

router.get('/campaigns', wrap(async (req, res) => {
  const [start, end] = range(req);
  const account = accountId(req);
  const { rows } = await pool.query(`select c.id campaign_id, c.name campaign_name,
    coalesce(sum(d.spend),0)::float spend, coalesce(sum(${resultsSql.replaceAll('actions', 'd.actions')}),0)::float results
    from campaigns c join daily_stats d on d.entity_id=c.id and d.entity_type='campaign'
    where d.date between $1 and $2 and ($3::uuid is null or d.account_id=$3)
    group by c.id,c.name order by spend desc`, [start, end, account]);
  rows.forEach(row => { row.cpr = row.results ? row.spend / row.results : 0; });
  res.json(rows);
}));

router.get('/top5', wrap(async (req, res) => {
  const [start, end] = range(req);
  const account = accountId(req);
  const { rows } = await pool.query(`select a.id ad_id, a.name ad_name, sum(d.spend)::float spend,
    sum(${resultsSql.replaceAll('actions', 'd.actions')})::float results
    from ads a join daily_stats d on d.entity_id=a.id and d.entity_type='ad'
    where d.date between $1 and $2 and ($3::uuid is null or d.account_id=$3) group by a.id,a.name
    having sum(${resultsSql.replaceAll('actions', 'd.actions')}) > 0
    order by sum(d.spend)/nullif(sum(${resultsSql.replaceAll('actions', 'd.actions')}),0) limit 5`, [start, end, account]);
  rows.forEach(row => { row.cpr = row.results ? row.spend / row.results : 0; });
  res.json(rows);
}));

router.get('/campaign/:id/detail', wrap(async (req, res) => {
  if (req.params.id === 'none') return res.json({ ads: [], demo: { age: [], gender: [], platform_position: [] } });
  const [start, end] = range(req);
  const adsResult = await pool.query(`select a.id ad_id,a.name ad_name,sum(d.spend)::float spend,
    sum(d.clicks)::float clicks,sum(d.impressions)::float impressions,
    sum(${resultsSql.replaceAll('actions', 'd.actions')})::float results
    from ads a left join daily_stats d on d.entity_id=a.id and d.entity_type='ad' and d.date between $2 and $3
    where a.campaign_id=$1 group by a.id,a.name order by spend desc nulls last`, [req.params.id, start, end]);
  adsResult.rows.forEach(row => {
    row.cpr = row.results ? row.spend / row.results : 0;
    row.ctr = row.impressions ? row.clicks * 100 / row.impressions : 0;
  });
  const demoResult = await pool.query(`select breakdown_type,breakdown_value k,
    sum(${resultsSql})::float v from breakdown_stats
    where entity_type='campaign' and entity_id=$1 and date between $2 and $3
      and breakdown_type in ('age','gender','platform_position')
    group by breakdown_type,breakdown_value order by breakdown_value`, [req.params.id, start, end]);
  const demo = { age: [], gender: [], platform_position: [] };
  demoResult.rows.forEach(row => demo[row.breakdown_type].push({ k: row.k, v: row.v }));
  res.json({ ads: adsResult.rows, demo });
}));

router.get('/entities/campaigns', wrap(async (req, res) => {
  const [start, end] = range(req);
  const account = accountId(req);
  const { rows } = await pool.query(`select c.id, c.platform_id, c.name, c.objective,
    c.conversion_goal, c.status, c.daily_budget, c.lifetime_budget,
    coalesce(sum(d.spend),0)::float spend, coalesce(sum(d.impressions),0)::float impressions,
    coalesce(sum(d.reach),0)::float reach, coalesce(sum(d.clicks),0)::float clicks,
    coalesce(sum(d.link_clicks),0)::float link_clicks,
    coalesce(sum(${registrationsSql.replaceAll('actions', 'd.actions')}),0)::float registrations,
    coalesce(sum(${purchasesSql.replaceAll('actions', 'd.actions')}),0)::float purchases,
    coalesce(sum(${revenueSql.replaceAll('action_values', 'd.action_values')}),0)::float revenue,
    coalesce(sum(${landingViewsSql.replaceAll('actions', 'd.actions')}),0)::float landing_page_views
    from campaigns c left join daily_stats d on d.entity_id=c.id and d.entity_type='campaign'
      and d.date between $1 and $2
    where ($3::uuid is null or c.account_id=$3)
    group by c.id order by spend desc`, [start, end, account]);
  rows.forEach(r => addDerivedMetrics(r));
  res.json(rows);
}));

router.get('/entities/adsets', wrap(async (req, res) => {
  const [start, end] = range(req);
  const account = accountId(req);
  const campaign = String(req.query.campaignId || '').trim() || null;
  const { rows } = await pool.query(`select s.id, s.platform_id, s.campaign_id, s.name,
    s.status, s.optimization_goal, s.billing_event, s.daily_budget, s.lifetime_budget,
    c.name campaign_name, c.conversion_goal,
    coalesce(sum(d.spend),0)::float spend, coalesce(sum(d.impressions),0)::float impressions,
    coalesce(sum(d.reach),0)::float reach, coalesce(sum(d.clicks),0)::float clicks,
    coalesce(sum(d.link_clicks),0)::float link_clicks,
    coalesce(sum(${registrationsSql.replaceAll('actions', 'd.actions')}),0)::float registrations,
    coalesce(sum(${purchasesSql.replaceAll('actions', 'd.actions')}),0)::float purchases,
    coalesce(sum(${revenueSql.replaceAll('action_values', 'd.action_values')}),0)::float revenue,
    coalesce(sum(${landingViewsSql.replaceAll('actions', 'd.actions')}),0)::float landing_page_views
    from ad_sets s join campaigns c on c.id=s.campaign_id
    left join daily_stats d on d.entity_id=s.id and d.entity_type='adset' and d.date between $1 and $2
    where ($3::uuid is null or s.account_id=$3) and ($4::uuid is null or s.campaign_id=$4)
    group by s.id,c.name,c.conversion_goal order by spend desc`, [start, end, account, campaign]);
  rows.forEach(r => addDerivedMetrics(r));
  res.json(rows);
}));

router.get('/entities/ads', wrap(async (req, res) => {
  const [start, end] = range(req);
  const account = accountId(req);
  const adset = String(req.query.adSetId || '').trim() || null;
  const campaign = String(req.query.campaignId || '').trim() || null;
  const { rows } = await pool.query(`select a.id, a.platform_id, a.ad_set_id, a.campaign_id,
    a.name, a.status, s.name adset_name, c.name campaign_name,
    cr.type creative_type, cr.headline, cr.thumbnail_url, cr.image_url,
    coalesce(sum(d.spend),0)::float spend, coalesce(sum(d.impressions),0)::float impressions,
    coalesce(sum(d.reach),0)::float reach, coalesce(sum(d.clicks),0)::float clicks,
    coalesce(sum(d.link_clicks),0)::float link_clicks,
    coalesce(sum(${registrationsSql.replaceAll('actions', 'd.actions')}),0)::float registrations,
    coalesce(sum(${purchasesSql.replaceAll('actions', 'd.actions')}),0)::float purchases,
    coalesce(sum(${revenueSql.replaceAll('action_values', 'd.action_values')}),0)::float revenue,
    max(d.quality_scores->>'quality_ranking') quality_ranking
    from ads a join ad_sets s on s.id=a.ad_set_id join campaigns c on c.id=a.campaign_id
    left join creatives cr on cr.id=a.creative_id
    left join daily_stats d on d.entity_id=a.id and d.entity_type='ad' and d.date between $1 and $2
    where ($3::uuid is null or a.account_id=$3) and ($4::uuid is null or a.ad_set_id=$4)
      and ($5::uuid is null or a.campaign_id=$5)
    group by a.id,s.name,c.name,cr.type,cr.headline,cr.thumbnail_url,cr.image_url order by spend desc`,
    [start, end, account, adset, campaign]);
  rows.forEach(r => addDerivedMetrics(r));
  res.json(rows);
}));

router.get('/entities/creatives', wrap(async (req, res) => {
  const [start, end] = range(req);
  const account = accountId(req);
  const { rows } = await pool.query(`select cr.id, cr.platform_id, cr.name, cr.type creative_type,
    cr.headline, cr.body, cr.call_to_action, cr.thumbnail_url, cr.image_url,
    count(distinct a.id)::int ads_count,
    coalesce(sum(d.spend),0)::float spend, coalesce(sum(d.impressions),0)::float impressions,
    coalesce(sum(d.reach),0)::float reach, coalesce(sum(d.clicks),0)::float clicks,
    coalesce(sum(d.link_clicks),0)::float link_clicks,
    coalesce(sum(${registrationsSql.replaceAll('actions', 'd.actions')}),0)::float registrations,
    coalesce(sum(${purchasesSql.replaceAll('actions', 'd.actions')}),0)::float purchases,
    coalesce(sum(${revenueSql.replaceAll('action_values', 'd.action_values')}),0)::float revenue
    from creatives cr left join ads a on a.creative_id=cr.id
    left join daily_stats d on d.entity_id=a.id and d.entity_type='ad' and d.date between $1 and $2
    where ($3::uuid is null or cr.account_id=$3)
    group by cr.id order by spend desc`, [start, end, account]);
  rows.forEach(r => addDerivedMetrics(r));
  res.json(rows);
}));

router.get('/breakdowns', wrap(async (req, res) => {
  const [start, end] = range(req);
  const account = accountId(req);
  const type = ['age', 'gender', 'region', 'device', 'placement', 'publisher', 'placement_detail', 'platform_position']
    .includes(req.query.type) ? req.query.type : 'age';
  const entityId = String(req.query.entityId || '').trim() || null;
  const entityType = ['campaign', 'adset', 'ad'].includes(req.query.entityType) ? req.query.entityType : 'campaign';
  const { rows } = await pool.query(`select breakdown_value,
    coalesce(sum(spend),0)::float spend, coalesce(sum(impressions),0)::float impressions,
    coalesce(sum(reach),0)::float reach, coalesce(sum(clicks),0)::float clicks,
    coalesce(sum(link_clicks),0)::float link_clicks,
    coalesce(sum(${registrationsSql}),0)::float registrations,
    coalesce(sum(${purchasesSql}),0)::float purchases,
    coalesce(sum(${revenueSql}),0)::float revenue
    from breakdown_stats where breakdown_type=$1 and date between $2 and $3
      and ($4::uuid is null or account_id=$4) and entity_type=$5
      and ($6::uuid is null or entity_id=$6)
    group by breakdown_value order by spend desc`, [type, start, end, account, entityType, entityId]);
  const total = rows.reduce((sum, r) => sum + Number(r.spend || 0), 0);
  rows.forEach(r => { addDerivedMetrics(r); r.spend_pct = total ? r.spend * 100 / total : 0; });
  res.json(rows);
}));

function addDerivedMetrics(row) {
  row.ctr = row.impressions ? (row.link_clicks || row.clicks || 0) * 100 / row.impressions : 0;
  row.cpc = row.link_clicks ? row.spend / row.link_clicks : 0;
  row.cpm = row.impressions ? row.spend * 1000 / row.impressions : 0;
  row.frequency = row.reach ? row.impressions / row.reach : 0;
  row.cpl = row.registrations ? row.spend / row.registrations : 0;
  row.cpa = row.purchases ? row.spend / row.purchases : 0;
  row.roas = row.spend ? row.revenue / row.spend : 0;
}

// Express's default HTML error response hides the cause from the admin client.
router.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const connectionError = ['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT', '57P01', '57P03', '53300'].includes(err.code);
  const schemaError = ['42P01', '42703'].includes(err.code);
  console.error('[ads]', req.method, req.path, { code: err.code || 'ADS_ERROR' });
  const error = connectionError
    ? 'Không kết nối được PostgreSQL. Kiểm tra dịch vụ database và cấu hình DATABASE_URL/PGPORT trên máy chủ.'
    : schemaError
      ? 'Database thiếu bảng hoặc cột quảng cáo. Chạy npm run db:migrate trên máy chủ rồi tải lại.'
      : 'Không tải được dữ liệu quảng cáo. Kiểm tra log máy chủ với mã lỗi đi kèm.';
  res.status(connectionError ? 503 : 500).json({ error, code: err.code || 'ADS_ERROR' });
});

module.exports = router;
