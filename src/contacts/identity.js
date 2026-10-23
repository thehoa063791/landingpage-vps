// Who is who (docs/contact-model-plan.md section 6, roadmap 3.1): the identity rules shared by
// the contacts layer, imports and (from 3.5) the partner API. Pure functions, no storage.
//  1. Same email → same person, unless both names are given and clearly differ (one email
//     shared by a family, a sign-up for someone else): then a "possible duplicate"
//     (decided 2026-10-23).
//  2. Same phone and matching names → same person ("Hòa" matches "Đinh Thế Hòa").
//  3. Same phone, different names → "possible duplicate" for review, not merged.
//  4. Same name only → different people (names are not identities).
//  5. Same name and a near-identical email → "possible duplicate".
//  6. Same Zalo/Messenger/HubCRM/Ebila ID → same person (identities, once they are stored).
//  7. Chains: A~B by email and B~C by phone+name make one person.
//  8. A phone used by SHARED_PHONE_NAMES or more different names never merges anyone.
//  9/10. Manual decisions (not the same person / merge / split) are applied by the caller.
//  11. Empty values and test phones are ignored.
// Same as normalizeContactPhoneKey in src/storage.js (kept here so the rules need no storage).
function normalizeContactPhoneKey(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('0084')) digits = digits.slice(2);
  if (digits.startsWith('84') && digits.length >= 11) digits = `0${digits.slice(2)}`;
  return digits;
}

const SHARED_PHONE_NAMES = 4;
const TEST_PHONE = /^0\d?(\d)\1{7,}$|^0123456789$|^0987654321$/;

const emailKey = value => String(value || '').trim().toLowerCase();
function phoneKey(value) {
  const key = normalizeContactPhoneKey(value);
  return /^\d{9,11}$/.test(key) && !TEST_PHONE.test(key) ? key : '';
}
const nameWords = value => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
const nameKey = value => nameWords(value).join(' ');
// One name's words all appear in the other; an empty name matches nothing.
function namesMatch(a, b) {
  const x = nameWords(a), y = nameWords(b);
  if (!x.length || !y.length) return false;
  const [short, long] = x.length <= y.length ? [x, new Set(y)] : [y, new Set(x)];
  return short.every(word => long.has(word));
}

// Edit distance up to `max` (anything larger returns max + 1).
function distance(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
// Rule 5: one or two typos, or the same name before @ on another domain.
function emailsNearlySame(a, b) {
  if (!a || !b || a === b) return false;
  const [la, da] = a.split('@'), [lb, db] = b.split('@');
  if (la && la === lb && la.length >= 4) return true;
  return da === db && distance(la, lb) <= 2 && Math.min(la.length, lb.length) >= 5;
}

/**
 * Groups registrations into people.
 * @param rows registrations ({ id, name, email, phone, registered_at })
 * @param options.notSame Set of "idA|idB" registration pairs marked "not the same person"
 * @param options.same Set of "idA|idB" registration pairs merged by hand (joined before the rules)
 * @returns { groups: rows[][], candidates: [{ reason, a, b, key }], sharedPhones: [{ phone, names }] }
 *   candidates reference group indexes (a < b), one per group pair and reason.
 */
function cluster(rows, { notSame = new Set(), same = new Set() } = {}) {
  const parent = rows.map((_, i) => i);
  const find = i => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  const join = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
  const blocked = (a, b) => notSame.has(`${rows[a].id}|${rows[b].id}`) || notSame.has(`${rows[b].id}|${rows[a].id}`);

  // Rule 10: a manual merge holds whatever the rules say.
  if (same.size) {
    const at = new Map(rows.map((row, i) => [String(row.id), i]));
    for (const pair of same) {
      const [x, y] = pair.split('|').map(id => at.get(id));
      if (x !== undefined && y !== undefined) join(x, y);
    }
  }

  const byEmail = new Map(), byPhone = new Map();
  rows.forEach((row, i) => {
    const email = emailKey(row.email), phone = phoneKey(row.phone);
    if (email) { if (!byEmail.has(email)) byEmail.set(email, []); byEmail.get(email).push(i); }
    if (phone) { if (!byPhone.has(phone)) byPhone.set(phone, []); byPhone.get(phone).push(i); }
  });
  // Rule 1: same email joins named registrations whose names match; one without a name joins
  // the earliest named one only, so it never bridges two different names.
  for (const list of byEmail.values()) {
    const named = list.filter(i => nameKey(rows[i].name)), nameless = list.filter(i => !nameKey(rows[i].name));
    for (let a = 0; a < named.length; a++) for (let b = a + 1; b < named.length; b++) {
      if (find(named[a]) !== find(named[b]) && !blocked(named[a], named[b]) && namesMatch(rows[named[a]].name, rows[named[b]].name)) join(named[a], named[b]);
    }
    const anchor = named[0] ?? nameless[0];
    for (const i of nameless) if (i !== anchor && !blocked(i, anchor)) join(i, anchor);
  }
  // Rule 8: a phone with many different names is not an identity.
  const sharedPhones = [];
  const phoneShared = new Set();
  for (const [phone, list] of byPhone) {
    const names = new Set(list.map(i => nameKey(rows[i].name)).filter(Boolean));
    if (names.size >= SHARED_PHONE_NAMES) { phoneShared.add(phone); sharedPhones.push({ phone, names: names.size, registrations: list.length }); }
  }
  // Rule 2 (and 7 through union-find).
  for (const [phone, list] of byPhone) {
    if (phoneShared.has(phone)) continue;
    for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
      if (find(list[a]) !== find(list[b]) && !blocked(list[a], list[b]) && namesMatch(rows[list[a]].name, rows[list[b]].name)) join(list[a], list[b]);
    }
  }

  const index = new Map(), groups = [];
  rows.forEach((row, i) => {
    const root = find(i);
    if (!index.has(root)) { index.set(root, groups.length); groups.push([]); }
    groups[index.get(root)].push(row);
  });
  // Oldest first; registered_at may be a Date (PostgreSQL) or an ISO string.
  const time = row => new Date(row.registered_at || 0).getTime() || 0;
  for (const group of groups) group.sort((a, b) => time(a) - time(b) || String(a.id).localeCompare(String(b.id)));
  const groupOf = i => index.get(find(i));

  // Possible duplicates (rules 3 and 5), one per group pair and reason.
  const seen = new Set(), candidates = [];
  const add = (reason, i, j, key) => {
    let a = groupOf(i), b = groupOf(j);
    if (a === b || blocked(i, j)) return;
    if (a > b) [a, b] = [b, a];
    const id = `${reason}:${a}:${b}`;
    if (seen.has(id)) return;
    seen.add(id);
    candidates.push({ reason, a, b, key });
  };
  for (const [email, list] of byEmail) {
    for (let x = 0; x < list.length; x++) for (let y = x + 1; y < list.length; y++) add('same_email_other_name', list[x], list[y], email);
  }
  for (const [phone, list] of byPhone) {
    if (phoneShared.has(phone)) continue;
    for (let x = 0; x < list.length; x++) for (let y = x + 1; y < list.length; y++) add('same_phone_other_name', list[x], list[y], phone);
  }
  const byName = new Map();
  rows.forEach((row, i) => { const key = nameKey(row.name); if (key.split(' ').length >= 2 && emailKey(row.email)) { if (!byName.has(key)) byName.set(key, []); byName.get(key).push(i); } });
  for (const [name, list] of byName) {
    if (list.length > 200) continue; // very common names: emails decide, as rule 4 says
    for (let x = 0; x < list.length; x++) for (let y = x + 1; y < list.length; y++) {
      if (emailsNearlySame(emailKey(rows[list[x]].email), emailKey(rows[list[y]].email))) add('same_name_similar_email', list[x], list[y], name);
    }
  }
  return { groups, candidates, sharedPhones };
}

module.exports = { cluster, namesMatch, nameWords, nameKey, emailKey, phoneKey, emailsNearlySame, SHARED_PHONE_NAMES };
