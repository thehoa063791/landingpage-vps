require('dotenv').config();
const crypto = require('crypto');

const {
  getCrmSetting,
  setCrmSetting,
  getRegistrations,
  updateRegistration,
  upsertZoomMeeting,
  upsertLeadZoomAttendances,
  getZoomMeetingsOverview,
} = require('./storage');

const ZOOM_API_BASE = 'https://api.zoom.us/v2';
const ZOOM_AUTH_BASE = 'https://zoom.us/oauth/authorize';
const ZOOM_TOKEN_URL = 'https://zoom.us/oauth/token';

let zoomSyncJob = {
  running: false,
  status: 'idle',
  stage: 'Chua chay sync.',
  started_at: null,
  finished_at: null,
  result: null,
  error: null,
  logs: [],
};

function createSyncedMeetingsMap() {
  const map = {};
  Object.defineProperty(map, '__instanceKeys', {
    value: {},
    enumerable: false,
    writable: true,
  });
  return map;
}

function zoomSyncDay(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function zoomMeetingInstanceKey(input = {}) {
  const meetingId = String(input.meeting_id || input.zoom_meeting_id || input.id || '').trim();
  const day = zoomSyncDay(input.start_time);
  return meetingId && day ? `${meetingId}|${day}` : '';
}

function addSyncedMeetingMeta(map, meetingUuid, meta = {}) {
  if (!meetingUuid || Number(meta.participants_scanned || 0) <= 0) return map;
  map[meetingUuid] = meta;
  const instanceKey = zoomMeetingInstanceKey(meta);
  if (instanceKey) map.__instanceKeys[instanceKey] = meetingUuid;
  return map;
}

function getSyncedMeetingMeta(map, meeting = {}) {
  const meetingUuid = meeting.uuid || meeting.zoom_meeting_uuid || meeting.id;
  if (meetingUuid && map[meetingUuid]) return map[meetingUuid];
  const instanceKey = zoomMeetingInstanceKey(meeting);
  const uuidFromInstance = instanceKey ? map.__instanceKeys?.[instanceKey] : '';
  return uuidFromInstance ? map[uuidFromInstance] : null;
}

async function getSyncedMeetingsMap() {
  const stored = await getCrmSetting('zoom_synced_meetings', {});
  const fromSettings = createSyncedMeetingsMap();
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
    for (const [uuid, meta] of Object.entries(stored)) {
      addSyncedMeetingMeta(fromSettings, uuid, meta);
    }
  }
  const fromExistingRows = createSyncedMeetingsMap();
  try {
    const meetings = await getZoomMeetingsOverview();
    for (const meeting of meetings || []) {
      if (!meeting.zoom_meeting_uuid || !Number(meeting.participant_rows || 0)) continue;
      addSyncedMeetingMeta(fromExistingRows, meeting.zoom_meeting_uuid, {
        meeting_id: String(meeting.zoom_meeting_id || ''),
        topic: meeting.topic || '',
        start_time: meeting.start_time || null,
        participants_scanned: Number(meeting.participant_rows || 0),
        synced_at: meeting.updated_at || meeting.created_at || new Date().toISOString(),
      });
    }
  } catch (e) {
    console.warn('[zoom_synced_meetings seed]', e.message);
  }
  const merged = createSyncedMeetingsMap();
  for (const [uuid, meta] of Object.entries(fromExistingRows)) addSyncedMeetingMeta(merged, uuid, meta);
  for (const [uuid, meta] of Object.entries(fromSettings)) addSyncedMeetingMeta(merged, uuid, meta);
  return merged;
}

async function markMeetingSynced(map, meetingUuid, meta = {}) {
  if (!meetingUuid) return map;
  const next = createSyncedMeetingsMap();
  for (const [uuid, existingMeta] of Object.entries(map || {})) addSyncedMeetingMeta(next, uuid, existingMeta);
  const previous = map[meetingUuid] || {};
  const row = {
    ...previous,
    meeting_id: String(meta.meeting_id || ''),
    topic: meta.topic || '',
    start_time: meta.start_time || null,
    participants_scanned: Number(meta.participants_scanned || 0),
    registrants_scanned: Number(meta.registrants_scanned ?? previous.registrants_scanned ?? 0),
    registrants_enriched: !!(meta.registrants_enriched ?? previous.registrants_enriched),
    synced_at: new Date().toISOString(),
  };
  addSyncedMeetingMeta(next, meetingUuid, row);
  await setCrmSetting('zoom_synced_meetings', next);
  return next;
}

async function appendZoomSyncHistory(snapshot) {
  const stored = await getCrmSetting('zoom_sync_history', []);
  const history = Array.isArray(stored) ? stored : [];
  const row = {
    id: `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    status: snapshot.status || 'completed',
    started_at: snapshot.started_at || null,
    finished_at: snapshot.finished_at || new Date().toISOString(),
    result: snapshot.result || null,
    error: snapshot.error || null,
    logs: snapshot.logs || [],
  };
  await setCrmSetting('zoom_sync_history', [row, ...history].slice(0, 30));
  return row;
}

function publishSyncProgress(patch = {}) {
  const { reset_logs, ...publicPatch } = patch;
  const now = new Date().toISOString();
  const previousStage = zoomSyncJob.stage;
  const shouldLog = publicPatch.log || (publicPatch.stage && publicPatch.stage !== previousStage);
  const currentLogs = reset_logs ? [] : (zoomSyncJob.logs || []);
  const logs = shouldLog
    ? [
        ...currentLogs,
        {
          at: now,
          level: publicPatch.level || (publicPatch.error ? 'error' : 'info'),
          message: publicPatch.log || publicPatch.stage,
          users_scanned: publicPatch.users_scanned ?? zoomSyncJob.users_scanned ?? 0,
          users_total: publicPatch.users_total ?? zoomSyncJob.users_total ?? 0,
          meetings_scanned: publicPatch.meetings_scanned ?? zoomSyncJob.meetings_scanned ?? 0,
          meetings_skipped: publicPatch.meetings_skipped ?? zoomSyncJob.meetings_skipped ?? 0,
          participants_scanned: publicPatch.participants_scanned ?? zoomSyncJob.participants_scanned ?? 0,
          participants_matched: publicPatch.participants_matched ?? zoomSyncJob.participants_matched ?? 0,
          leads_updated: publicPatch.leads_updated ?? zoomSyncJob.leads_updated ?? 0,
        },
      ].slice(-200)
    : currentLogs;
  if (shouldLog) {
    const message = publicPatch.log || publicPatch.stage || '';
    const level = publicPatch.level || (publicPatch.error ? 'error' : 'info');
    console.log(`[zoom-sync] ${level}: ${message}`);
  }
  zoomSyncJob = {
    ...zoomSyncJob,
    ...publicPatch,
    logs,
    updated_at: now,
  };
  return zoomSyncJob;
}

function zoomConfig() {
  const accountId = process.env.ZOOM_ACCOUNT_ID || '';
  return {
    accountId,
    clientId: process.env.ZOOM_CLIENT_ID || '',
    clientSecret: process.env.ZOOM_CLIENT_SECRET || '',
    redirectUri: process.env.ZOOM_REDIRECT_URI || '',
    authType: accountId ? 'server_to_server' : 'oauth',
    syncUserIds: String(process.env.ZOOM_SYNC_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean),
  };
}

function assertZoomConfig({ requireRedirect = false } = {}) {
  const cfg = zoomConfig();
  if (!cfg.clientId || !cfg.clientSecret) {
    throw new Error('Missing ZOOM_CLIENT_ID or ZOOM_CLIENT_SECRET');
  }
  if (cfg.authType === 'server_to_server' && !cfg.accountId) {
    throw new Error('Missing ZOOM_ACCOUNT_ID');
  }
  if (requireRedirect && !cfg.redirectUri) {
    throw new Error('Missing ZOOM_REDIRECT_URI');
  }
  return cfg;
}

function base64Url(input) {
  return Buffer.from(input).toString('base64url');
}

function signState(payload) {
  const cfg = assertZoomConfig({ requireRedirect: true });
  return crypto.createHmac('sha256', cfg.clientSecret).update(payload).digest('base64url');
}

function createOAuthState() {
  const payload = base64Url(JSON.stringify({
    ts: Date.now(),
    nonce: crypto.randomBytes(16).toString('hex'),
  }));
  return `${payload}.${signState(payload)}`;
}

function verifyOAuthState(state) {
  try {
    const [payload, sig] = String(state || '').split('.');
    if (!payload || !sig) return false;
    const expected = signState(payload);
    if (Buffer.byteLength(sig) !== Buffer.byteLength(expected)) return false;
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return Number.isFinite(parsed.ts) && Date.now() - parsed.ts < 10 * 60 * 1000;
  } catch {
    return false;
  }
}

function getAuthorizeUrl() {
  const cfg = assertZoomConfig({ requireRedirect: true });
  if (cfg.authType === 'server_to_server') {
    throw new Error('Server-to-Server OAuth does not need an authorization URL');
  }
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    state: createOAuthState(),
  });
  return `${ZOOM_AUTH_BASE}?${params.toString()}`;
}

async function readTokenState() {
  return await getCrmSetting('zoom_oauth', null);
}

async function saveTokenState(tokenPayload) {
  const now = Date.now();
  const expiresIn = Number(tokenPayload.expires_in || 3600);
  const current = await readTokenState();
  const next = {
    access_token: tokenPayload.access_token,
    refresh_token: tokenPayload.refresh_token || current?.refresh_token || '',
    token_type: tokenPayload.token_type || 'bearer',
    scope: tokenPayload.scope || current?.scope || '',
    auth_type: tokenPayload.auth_type || current?.auth_type || zoomConfig().authType,
    expires_at: now + Math.max(60, expiresIn - 60) * 1000,
    connected_at: current?.connected_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await setCrmSetting('zoom_oauth', next);
  return next;
}

async function tokenRequest(params) {
  const cfg = assertZoomConfig();
  const auth = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');
  const res = await fetch(`${ZOOM_TOKEN_URL}?${params.toString()}`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.reason || body.message || `Zoom token error ${res.status}`);
  return saveTokenState({ ...body, auth_type: cfg.authType });
}

async function exchangeCodeForToken(code) {
  const cfg = assertZoomConfig({ requireRedirect: true });
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: cfg.redirectUri,
  });
  return tokenRequest(params);
}

async function getServerToServerToken() {
  const cfg = assertZoomConfig();
  const tokenState = await readTokenState();
  if (
    tokenState?.auth_type === 'server_to_server' &&
    tokenState.access_token &&
    Number(tokenState.expires_at || 0) > Date.now()
  ) {
    return tokenState.access_token;
  }
  const params = new URLSearchParams({
    grant_type: 'account_credentials',
    account_id: cfg.accountId,
  });
  const token = await tokenRequest(params);
  return token.access_token;
}

async function refreshAccessToken(refreshToken) {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  return tokenRequest(params);
}

async function getAccessToken() {
  const cfg = zoomConfig();
  if (cfg.authType === 'server_to_server') {
    return getServerToServerToken();
  }

  const tokenState = await readTokenState();
  if (!tokenState?.refresh_token && !tokenState?.access_token) {
    throw new Error('Zoom is not connected');
  }
  if (tokenState.access_token && Number(tokenState.expires_at || 0) > Date.now()) {
    return tokenState.access_token;
  }
  if (!tokenState.refresh_token) throw new Error('Zoom refresh token is missing');
  const refreshed = await refreshAccessToken(tokenState.refresh_token);
  return refreshed.access_token;
}

async function zoomFetch(path, params = {}) {
  const accessToken = await getAccessToken();
  const url = new URL(`${ZOOM_API_BASE}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  });
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || body.reason || `Zoom API error ${res.status}`);
  return body;
}

async function fetchPaged(path, params, listKey) {
  const rows = [];
  let nextPageToken = '';
  do {
    const body = await zoomFetch(path, { page_size: 300, ...params, next_page_token: nextPageToken });
    rows.push(...(body[listKey] || []));
    nextPageToken = body.next_page_token || '';
  } while (nextPageToken);
  return rows;
}

async function fetchMeetingRegistrants(meetingId) {
  if (!meetingId) return [];
  try {
    const approved = await fetchPaged(`/meetings/${encodeZoomId(meetingId)}/registrants`, {
      status: 'approved',
    }, 'registrants');
    const pending = await fetchPaged(`/meetings/${encodeZoomId(meetingId)}/registrants`, {
      status: 'pending',
    }, 'registrants').catch(() => []);
    return [...approved, ...pending];
  } catch (error) {
    console.warn('[zoom registrants]', error.message);
    return [];
  }
}

function indexRegistrantsByEmail(registrants = []) {
  const byEmail = new Map();
  for (const registrant of registrants || []) {
    const email = String(registrant.email || registrant.user_email || '').trim().toLowerCase();
    if (email && !byEmail.has(email)) byEmail.set(email, registrant);
  }
  return byEmail;
}

function encodeZoomId(id) {
  const raw = String(id || '');
  const encoded = encodeURIComponent(raw);
  return raw.includes('/') ? encodeURIComponent(encoded) : encoded;
}

function toZoomDate(value) {
  return new Date(value).toISOString().slice(0, 10);
}

async function getSyncUsers() {
  const cfg = zoomConfig();
  if (cfg.syncUserIds.length) return cfg.syncUserIds;
  const users = await fetchPaged('/users', { status: 'active' }, 'users');
  return users.map(u => u.id || u.email).filter(Boolean);
}

function indexLeadsByEmail(registrations) {
  const byEmail = new Map();
  for (const lead of registrations || []) {
    const email = String(lead.email || '').trim().toLowerCase();
    if (email && !byEmail.has(email)) byEmail.set(email, lead);
  }
  return byEmail;
}

function participantIdentity(meetingUuid, participant = {}) {
  const email = String(participant.user_email || participant.email || '').trim().toLowerCase();
  if (email) return email;
  const stableValue = [
    meetingUuid,
    participant.participant_id,
    participant.id,
    participant.user_id,
    participant.name || participant.user_name,
    participant.join_time,
    participant.leave_time,
  ].filter(Boolean).join('|');
  const digest = crypto.createHash('sha1').update(stableValue || JSON.stringify(participant || {})).digest('hex').slice(0, 16);
  return `zoom-participant:${digest}`;
}

async function fetchMeetingParticipants(meetingUuid, meetingId) {
  const primary = await fetchPaged(`/report/meetings/${encodeZoomId(meetingUuid)}/participants`, {}, 'participants')
    .catch(error => {
      console.warn('[zoom participants by uuid]', error.message);
      return [];
    });
  if (primary.length || !meetingId || String(meetingId) === String(meetingUuid)) return primary;
  const fallback = await fetchPaged(`/report/meetings/${encodeZoomId(meetingId)}/participants`, {}, 'participants')
    .catch(error => {
      console.warn('[zoom participants by meeting id]', error.message);
      return [];
    });
  return fallback.length ? fallback : primary;
}

function dedupeZoomParticipantRows(rows = []) {
  const bestByConflictKey = new Map();
  for (const row of rows || []) {
    const key = [
      String(row.lead_email || '').trim().toLowerCase(),
      String(row.zoom_meeting_uuid || ''),
      row.join_time || '',
    ].join('|');
    const current = bestByConflictKey.get(key);
    if (!current || Number(row.duration || 0) >= Number(current.duration || 0)) {
      bestByConflictKey.set(key, row);
    }
  }
  return [...bestByConflictKey.values()];
}

async function syncZoomAttendances({ from, to, force = false, onProgress } = {}) {
  const now = new Date();
  const toDate = to ? new Date(to) : now;
  const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  const fromStr = toZoomDate(fromDate);
  const toStr = toZoomDate(toDate);

  onProgress?.({
    stage: `Dang lay danh sach Zoom users (${fromStr} -> ${toStr})...`,
    from: fromStr,
    to: toStr,
  });
  const [registrations, userIds, syncedMeetingsInitial] = await Promise.all([
    getRegistrations(),
    getSyncUsers(),
    getSyncedMeetingsMap(),
  ]);
  onProgress?.({
    stage: `Da tim thay ${userIds.length} Zoom user. Dang quet meetings...`,
    users_total: userIds.length,
    users_scanned: 0,
    meetings_scanned: 0,
    meetings_skipped: 0,
    participants_scanned: 0,
    participants_matched: 0,
    leads_updated: 0,
  });
  const leadsByEmail = indexLeadsByEmail(registrations);
  const touchedLeadTimes = new Map();
  let syncedMeetings = syncedMeetingsInitial;
  let meetingCount = 0;
  let skippedMeetingCount = 0;
  let participantCount = 0;
  let matchedCount = 0;
  let unmatchedCount = 0;

  for (let userIndex = 0; userIndex < userIds.length; userIndex++) {
    const userId = userIds[userIndex];
    onProgress?.({
      stage: `Dang quet meetings cua user ${userIndex + 1}/${userIds.length}...`,
      current_user: userId,
      users_scanned: userIndex,
    });
    const meetings = await fetchPaged(`/report/users/${encodeZoomId(userId)}/meetings`, {
      from: fromStr,
      to: toStr,
      type: 'past',
    }, 'meetings');

    onProgress?.({
      stage: `User ${userIndex + 1}/${userIds.length}: tim thay ${meetings.length} meetings.`,
      current_user: userId,
      users_scanned: userIndex + 1,
      current_user_meetings: meetings.length,
    });

    for (let meetingIndex = 0; meetingIndex < meetings.length; meetingIndex++) {
      const meeting = meetings[meetingIndex];
      meetingCount += 1;
      const meetingUuid = meeting.uuid || meeting.id;
      onProgress?.({
        stage: `Dang lay participants meeting ${meetingIndex + 1}/${meetings.length}: ${meeting.topic || meeting.id}`,
        current_user: userId,
        current_meeting: meeting.topic || String(meeting.id || ''),
        meetings_scanned: meetingCount,
        participants_scanned: participantCount,
        participants_matched: matchedCount,
        participants_unmatched: unmatchedCount,
        leads_updated: touchedLeadTimes.size,
      });
      await upsertZoomMeeting({
        zoom_meeting_uuid: meetingUuid,
        zoom_meeting_id: meeting.id,
        topic: meeting.topic || '',
        start_time: meeting.start_time || null,
        duration: meeting.duration || 0,
        host_email: meeting.host_email || '',
        host_id: meeting.host_id || userId,
        raw: meeting,
      });

      const syncMeta = getSyncedMeetingMeta(syncedMeetings, meeting);
      if (syncMeta && !force) {
        skippedMeetingCount += 1;
        onProgress?.({
          stage: `Bo qua meeting da sync: ${meeting.topic || meeting.id}`,
          current_user: userId,
          current_meeting: meeting.topic || String(meeting.id || ''),
          meetings_scanned: meetingCount,
          meetings_skipped: skippedMeetingCount,
          participants_scanned: participantCount,
          participants_matched: matchedCount,
          participants_unmatched: unmatchedCount,
          leads_updated: touchedLeadTimes.size,
        });
        continue;
      }

      const registrants = await fetchMeetingRegistrants(meeting.id);
      const registrantByEmail = indexRegistrantsByEmail(registrants);
      const participants = await fetchMeetingParticipants(meetingUuid, meeting.id);
      const rows = dedupeZoomParticipantRows(participants.map(p => {
        const email = String(p.user_email || p.email || '').trim().toLowerCase();
        const identity = participantIdentity(meetingUuid, p);
        const registrant = registrantByEmail.get(email) || null;
        const lead = leadsByEmail.get(email) || null;
        const interactionAt = p.leave_time || p.join_time || meeting.start_time || null;
        return {
          registration_id: lead?.id || null,
          lead_email: identity,
          lead_phone: p.phone || p.phone_number || p.user_phone || p.registrant_phone || p.mobile || p.mobile_phone || registrant?.phone || registrant?.phone_number || '',
          zoom_meeting_uuid: meetingUuid,
          zoom_meeting_id: meeting.id,
          zoom_display_name: p.name || p.user_name || '',
          join_time: p.join_time || null,
          leave_time: p.leave_time || null,
          duration: Number(p.duration || 0),
          raw: registrant ? { ...p, registrant, real_email: email, phone: p.phone || registrant.phone || registrant.phone_number || '' } : { ...p, real_email: email },
          _interaction_at: interactionAt,
        };
      }));

      for (const row of rows) {
        if (row.registration_id) matchedCount += 1; else unmatchedCount += 1;
        if (row.registration_id && row._interaction_at) {
          const prev = touchedLeadTimes.get(row.registration_id);
          if (!prev || new Date(row._interaction_at).getTime() > new Date(prev).getTime()) {
            touchedLeadTimes.set(row.registration_id, row._interaction_at);
          }
        }
      }

      participantCount += rows.length;
      await upsertLeadZoomAttendances(rows);
      syncedMeetings = await markMeetingSynced(syncedMeetings, meetingUuid, {
        meeting_id: meeting.id,
        topic: meeting.topic || '',
        start_time: meeting.start_time || null,
        participants_scanned: rows.length,
        registrants_scanned: registrants.length,
        registrants_enriched: true,
      });
      onProgress?.({
        stage: `Da luu ${rows.length} participants tu meeting: ${meeting.topic || meeting.id}`,
        meetings_scanned: meetingCount,
        meetings_skipped: skippedMeetingCount,
        participants_scanned: participantCount,
        participants_matched: matchedCount,
        participants_unmatched: unmatchedCount,
        leads_updated: touchedLeadTimes.size,
      });
    }
  }

  onProgress?.({
    stage: `Dang cap nhat ${touchedLeadTimes.size} ho so Lead...`,
    meetings_scanned: meetingCount,
    meetings_skipped: skippedMeetingCount,
    participants_scanned: participantCount,
    participants_matched: matchedCount,
    participants_unmatched: unmatchedCount,
    leads_updated: touchedLeadTimes.size,
  });
  for (const [leadId, interactionAt] of touchedLeadTimes.entries()) {
    await updateRegistration(leadId, { last_interaction_at: interactionAt });
  }

  const result = {
    from: fromStr,
    to: toStr,
    users_scanned: userIds.length,
    meetings_scanned: meetingCount,
    meetings_skipped: skippedMeetingCount,
    participants_scanned: participantCount,
    participants_matched: matchedCount,
    participants_unmatched: unmatchedCount,
    leads_updated: touchedLeadTimes.size,
    force_resync: !!force,
    synced_at: new Date().toISOString(),
  };
  await setCrmSetting('zoom_last_sync', result);
  return result;
}

function getZoomSyncJob() {
  return zoomSyncJob;
}

async function runZoomSync(options = {}) {
  if (zoomSyncJob.running) return zoomSyncJob;
  publishSyncProgress({
    running: true,
    status: 'running',
    stage: 'Dang khoi dong Zoom sync...',
    log: 'Bat dau Zoom sync 30 ngay.',
    started_at: new Date().toISOString(),
    finished_at: null,
    result: null,
    error: null,
    reset_logs: true,
  });
  try {
    const result = await syncZoomAttendances({
      ...options,
      onProgress: publishSyncProgress,
    });
    const finalJob = publishSyncProgress({
      running: false,
      status: 'completed',
      stage: 'Zoom sync hoan tat.',
      log: `Hoan tat Zoom sync: ${result.participants_matched} participants matched, ${result.leads_updated} leads updated.`,
      level: 'success',
      finished_at: new Date().toISOString(),
      result,
      error: null,
      ...result,
    });
    appendZoomSyncHistory(finalJob).catch(e => console.warn('[zoom_sync_history]', e.message));
    return finalJob;
  } catch (error) {
    const finalJob = publishSyncProgress({
      running: false,
      status: 'failed',
      stage: 'Zoom sync bi loi.',
      log: error?.message || String(error),
      level: 'error',
      finished_at: new Date().toISOString(),
      error: error?.message || String(error),
    });
    appendZoomSyncHistory(finalJob).catch(e => console.warn('[zoom_sync_history]', e.message));
    return finalJob;
  }
}

function startZoomSync(options = {}) {
  if (zoomSyncJob.running) return zoomSyncJob;
  runZoomSync(options).catch(error => {
    console.warn('[zoom sync background]', error?.message || error);
  });
  return zoomSyncJob;
}

async function getZoomStatus() {
  const cfg = zoomConfig();
  const token = await readTokenState();
  const [lastSync, syncHistory] = await Promise.all([
    getCrmSetting('zoom_last_sync', null),
    getCrmSetting('zoom_sync_history', []),
  ]);
  return {
    auth_type: cfg.authType,
    configured: cfg.authType === 'server_to_server'
      ? !!(cfg.accountId && cfg.clientId && cfg.clientSecret)
      : !!(cfg.clientId && cfg.clientSecret && cfg.redirectUri),
    connected: cfg.authType === 'server_to_server' ? !!(cfg.accountId && cfg.clientId && cfg.clientSecret) : !!token?.refresh_token,
    scope: token?.scope || '',
    connected_at: token?.connected_at || null,
    updated_at: token?.updated_at || null,
    last_sync: lastSync,
    sync_history: Array.isArray(syncHistory) ? syncHistory : [],
    sync_job: getZoomSyncJob(),
  };
}

module.exports = {
  getAuthorizeUrl,
  verifyOAuthState,
  exchangeCodeForToken,
  syncZoomAttendances,
  runZoomSync,
  startZoomSync,
  getZoomSyncJob,
  getZoomStatus,
};
