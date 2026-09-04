const crypto = require('crypto');
const { pool } = require('./db');

const GRAPH = 'https://graph.facebook.com/v20.0';
const BREAKDOWNS = {
  age: 'age', gender: 'gender', region: 'region', device: 'device_platform',
  publisher: 'publisher_platform', placement_detail: 'publisher_platform,platform_position',
};
const INSIGHT_FIELDS = [
  'spend','impressions','reach','clicks','unique_clicks','frequency','actions','action_values',
  'quality_ranking','engagement_rate_ranking','conversion_rate_ranking',
  'campaign_id','adset_id','ad_id',
].join(',');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const num = value => Number(value || 0) || 0;
const actionMap = rows => Object.fromEntries((rows || []).map(row => [row.action_type, num(row.value)]));
const dateString = date => date.toISOString().slice(0, 10);

async function graphGet(path, params, token, retries = 3) {
  const url = new URL(`${GRAPH}/${path}`);
  Object.entries({ ...params, access_token: token }).forEach(([key, value]) => url.searchParams.set(key, value));
  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    const json = await response.json().catch(() => ({}));
    if (response.ok && !json.error) return json;
    const code = json.error?.code;
    if (attempt < retries && (response.status >= 500 || response.status === 429 || [4, 17, 32, 613].includes(code))) {
      await sleep(Math.min(1500 * (2 ** attempt), 15_000));
      continue;
    }
    throw new Error(`Meta API [${code || response.status}] ${json.error?.message || response.statusText}`);
  }
}

async function paginate(path, params, token) {
  const data = [];
  let cursor = '';
  do {
    const page = await graphGet(path, { ...params, limit: '500', ...(cursor ? { after: cursor } : {}) }, token);
    data.push(...(page.data || []));
    cursor = page.paging?.cursors?.after && page.paging?.next ? page.paging.cursors.after : '';
  } while (cursor);
  return data;
}

async function upsertByPlatform(client, table, accountId, row) {
  const existing = await client.query(`select id from ${table} where account_id=$1 and platform_id=$2 limit 1`, [accountId, row.platform_id]);
  const id = existing.rows[0]?.id || crypto.randomUUID();
  const fields = { id, account_id: accountId, ...row, updated_at: new Date() };
  const keys = Object.keys(fields);
  if (existing.rows[0]) {
    const mutable = keys.filter(key => !['id','account_id','platform_id','created_at'].includes(key));
    await client.query(`update ${table} set ${mutable.map((key, i) => `${key}=$${i + 1}`).join(',')} where id=$${mutable.length + 1}`, [...mutable.map(key => fields[key]), id]);
  } else {
    fields.created_at = new Date();
    const insertKeys = Object.keys(fields);
    await client.query(`insert into ${table} (${insertKeys.join(',')}) values (${insertKeys.map((_, i) => `$${i + 1}`).join(',')})`, insertKeys.map(key => fields[key]));
  }
  return id;
}

async function replaceStats(client, table, rows, where) {
  await client.query(`delete from ${table} where account_id=$1 and date between $2 and $3`, [where.accountId, where.dateFrom, where.dateTo]);
  for (const row of rows) {
    const fields = { id: crypto.randomUUID(), ...row, created_at: new Date(), updated_at: new Date() };
    const keys = Object.keys(fields);
    await client.query(`insert into ${table} (${keys.join(',')}) values (${keys.map((_, i) => `$${i + 1}`).join(',')})`, keys.map(key => fields[key]));
  }
}

function statRow(raw, entityType, entityId, accountId) {
  return {
    date: raw.date_start, entity_type: entityType, entity_id: entityId, account_id: accountId,
    spend: num(raw.spend), impressions: Math.round(num(raw.impressions)), reach: Math.round(num(raw.reach)),
    clicks: Math.round(num(raw.clicks)), link_clicks: Math.round(num(raw.unique_clicks)), frequency: num(raw.frequency),
    actions: actionMap(raw.actions), action_values: actionMap(raw.action_values), video_metrics: {},
    quality_scores: { quality_ranking: raw.quality_ranking, engagement_rate_ranking: raw.engagement_rate_ranking, conversion_rate_ranking: raw.conversion_rate_ranking },
    attribution_window: '7d_click_1d_view', is_final: false,
  };
}

async function syncAccount(accountId, { dateFrom, dateTo, jobType = 'incremental' }) {
  const accountResult = await pool.query('select * from ad_accounts where id=$1', [accountId]);
  const account = accountResult.rows[0];
  if (!account) throw new Error('Không tìm thấy tài khoản quảng cáo');
  if (!account.access_token_enc) throw new Error('Tài khoản chưa có Meta access token');
  const token = account.access_token_enc;
  const metaId = String(account.platform_account_id || '').replace(/^act_/, '');
  const jobId = crypto.randomUUID();
  await pool.query(`insert into sync_jobs(id,account_id,job_type,date_from,date_to,status,rows_upserted,started_at,created_at,updated_at)
    values($1,$2,$3,$4,$5,'running',0,now(),now(),now())`, [jobId, accountId, jobType, dateFrom, dateTo]);
  let rowsUpserted = 0;
  try {
    const [campaigns, adsets, ads] = await Promise.all([
      paginate(`act_${metaId}/campaigns`, { fields: 'id,name,objective,status,daily_budget,lifetime_budget,start_time,stop_time' }, token),
      paginate(`act_${metaId}/adsets`, { fields: 'id,name,campaign_id,status,optimization_goal,billing_event,bid_amount,daily_budget,lifetime_budget,targeting,start_time,end_time' }, token),
      paginate(`act_${metaId}/ads`, { fields: 'id,name,adset_id,campaign_id,status,creative{id,name,title,body,call_to_action_type,image_url,thumbnail_url,object_type}' }, token),
    ]);
    const client = await pool.connect();
    const campaignMap = {}, adsetMap = {}, adMap = {};
    try {
      await client.query('begin');
      for (const raw of campaigns) campaignMap[raw.id] = await upsertByPlatform(client, 'campaigns', accountId, { platform_id: raw.id, name: raw.name, objective: raw.objective || null, status: raw.status, daily_budget: num(raw.daily_budget) / 100 || null, lifetime_budget: num(raw.lifetime_budget) / 100 || null, start_time: raw.start_time || null, stop_time: raw.stop_time || null, raw_data: raw });
      for (const raw of adsets) adsetMap[raw.id] = await upsertByPlatform(client, 'ad_sets', accountId, { platform_id: raw.id, campaign_id: campaignMap[raw.campaign_id], name: raw.name, status: raw.status, optimization_goal: raw.optimization_goal || null, billing_event: raw.billing_event || null, bid_amount: num(raw.bid_amount) / 100 || null, daily_budget: num(raw.daily_budget) / 100 || null, lifetime_budget: num(raw.lifetime_budget) / 100 || null, targeting: raw.targeting || {}, start_time: raw.start_time || null, stop_time: raw.end_time || null, raw_data: raw });
      for (const raw of ads) {
        let creativeId = null;
        if (raw.creative?.id) creativeId = await upsertByPlatform(client, 'creatives', accountId, { platform_id: raw.creative.id, name: raw.creative.name || null, type: raw.creative.object_type || null, headline: raw.creative.title || null, body: raw.creative.body || null, call_to_action: raw.creative.call_to_action_type || null, image_url: raw.creative.image_url || null, thumbnail_url: raw.creative.thumbnail_url || null, asset_data: raw.creative });
        adMap[raw.id] = await upsertByPlatform(client, 'ads', accountId, { platform_id: raw.id, campaign_id: campaignMap[raw.campaign_id], ad_set_id: adsetMap[raw.adset_id], creative_id: creativeId, name: raw.name, status: raw.status, raw_data: raw });
      }
      const base = { fields: INSIGHT_FIELDS, time_increment: '1', time_range: JSON.stringify({ since: dateFrom, until: dateTo }), action_attribution_windows: JSON.stringify(['7d_click','1d_view']) };
      const [campaignStats, adsetStats, adStats] = await Promise.all(['campaign','adset','ad'].map(level => paginate(`act_${metaId}/insights`, { ...base, level }, token)));
      const stats = [
        ...campaignStats.filter(r => campaignMap[r.campaign_id]).map(r => statRow(r, 'campaign', campaignMap[r.campaign_id], accountId)),
        ...adsetStats.filter(r => adsetMap[r.adset_id]).map(r => statRow(r, 'adset', adsetMap[r.adset_id], accountId)),
        ...adStats.filter(r => adMap[r.ad_id]).map(r => statRow(r, 'ad', adMap[r.ad_id], accountId)),
      ];
      await replaceStats(client, 'daily_stats', stats, { accountId, dateFrom, dateTo });
      const breakdownRows = [];
      for (const [key, breakdowns] of Object.entries(BREAKDOWNS)) {
        const rawRows = await paginate(`act_${metaId}/insights`, { ...base, fields: `spend,impressions,reach,clicks,actions,action_values,campaign_id`, level: 'campaign', breakdowns }, token);
        for (const raw of rawRows) {
          if (!campaignMap[raw.campaign_id]) continue;
          const value = key === 'placement_detail' ? `${raw.publisher_platform || 'unknown'} / ${raw.platform_position || 'unknown'}` : raw[breakdowns] || 'unknown';
          breakdownRows.push({
            date: raw.date_start, entity_type: 'campaign', entity_id: campaignMap[raw.campaign_id], account_id: accountId,
            breakdown_type: key, breakdown_value: value, spend: num(raw.spend), impressions: Math.round(num(raw.impressions)),
            reach: Math.round(num(raw.reach)), clicks: Math.round(num(raw.clicks)), link_clicks: Math.round(num(raw.unique_clicks)),
            actions: actionMap(raw.actions), action_values: actionMap(raw.action_values), attribution_window: '7d_click_1d_view',
          });
        }
      }
      await replaceStats(client, 'breakdown_stats', breakdownRows, { accountId, dateFrom, dateTo });
      rowsUpserted = campaigns.length + adsets.length + ads.length + stats.length + breakdownRows.length;
      await client.query('commit');
    } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
    await pool.query('update ad_accounts set last_synced_at=now(),updated_at=now() where id=$1', [accountId]);
    await pool.query(`update sync_jobs set status='completed',rows_upserted=$2,finished_at=now(),updated_at=now() where id=$1`, [jobId, rowsUpserted]);
    return { jobId, rowsUpserted };
  } catch (error) {
    await pool.query(`update sync_jobs set status='failed',error_message=$2,finished_at=now(),updated_at=now() where id=$1`, [jobId, error.message]);
    throw error;
  }
}

function syncDates(type) {
  const today = new Date();
  const days = type === 'backfill' ? 89 : type === 'incremental' ? 6 : 1;
  return { dateFrom: dateString(new Date(today.getTime() - days * 86400000)), dateTo: dateString(today) };
}

module.exports = { syncAccount, syncDates };
