import { setGlobalOptions } from 'firebase-functions/v2';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { isoDay, runEntsoe, runIpto, runUrlSeries, saveDamHours, saveSeries, track } from './lib/feeds.js';
import { priceElectricity, priceMonthly } from './lib/cost.js';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

initializeApp();
setGlobalOptions({ region: 'europe-west1' });

const ROLES = ['owner', 'analyst', 'viewer'];

// Mirrors openMode() in firestore.rules: until an admin switches login on, every caller counts as admin.
const isAdminCaller = async (req) => req.auth?.token?.admin === true
  || (await getFirestore().doc('settings/app').get()).data()?.authRequired !== true;

const getOrCreateUser = async (email) => {
  const auth = getAuth();
  try {
    return await auth.getUserByEmail(email);
  } catch (e) {
    if (e.code === 'auth/configuration-not-found') {
      throw new HttpsError('failed-precondition', 'Firebase Authentication is not set up: enable Email/Password in the Firebase console.');
    }
    if (e.code !== 'auth/user-not-found') throw e;
    return auth.createUser({ email });
  }
};

const validEmail = (email) => typeof email === 'string' && /^\S+@\S+\.\S+$/.test(email.trim());

// Member doc is the source of truth; claims { cid, role } let rules check access without a read.
// ponytail: one company per user, add a company switcher if advisers need several.
export const syncMemberClaims = onDocumentWritten('companies/{cid}/members/{uid}', async (event) => {
  const { cid, uid } = event.params;
  const auth = getAuth();
  const user = await auth.getUser(uid).catch(() => null);
  if (!user) return;
  const current = user.customClaims || {};
  const after = event.data.after.data();
  if (!after && current.cid !== cid) return; // removed from a company they no longer belong to
  const claims = after ? { cid, role: after.role } : {};
  if (current.admin) claims.admin = true;
  await auth.setCustomUserClaims(uid, claims);
});

// Metis admins add users to any company; company owners add users to their own.
// Returns a password-setup link for the inviter to pass on.
// ponytail: link is shown to the inviter, send it by email once a mail provider is chosen.
export const createMember = onCall(async (req) => {
  const t = req.auth?.token;
  const { cid, email, role } = req.data || {};
  if (typeof cid !== 'string' || !cid || !validEmail(email) || !ROLES.includes(role)) {
    throw new HttpsError('invalid-argument', 'Company, valid email and role are required.');
  }
  if (!((t?.cid === cid && t?.role === 'owner') || await isAdminCaller(req))) throw new HttpsError('permission-denied', 'Not allowed.');

  const db = getFirestore();
  if (!(await db.doc(`companies/${cid}`).get()).exists) throw new HttpsError('not-found', 'Company not found.');

  const normalized = email.trim().toLowerCase();
  const user = await getOrCreateUser(normalized);
  const other = user.customClaims?.cid;
  if (other && other !== cid) throw new HttpsError('already-exists', 'This user belongs to another company.');

  await db.doc(`companies/${cid}/members/${user.uid}`).set(
    { email: normalized, role, addedBy: req.auth?.uid ?? 'open-mode', addedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  return { uid: user.uid, link: await getAuth().generatePasswordResetLink(normalized) };
});

// Creates (or promotes) a Metis admin. Needed before login can be switched on.
export const createAdmin = onCall(async (req) => {
  const { email } = req.data || {};
  if (!validEmail(email)) throw new HttpsError('invalid-argument', 'Valid email required.');
  if (!(await isAdminCaller(req))) throw new HttpsError('permission-denied', 'Not allowed.');
  const normalized = email.trim().toLowerCase();
  const user = await getOrCreateUser(normalized);
  await getAuth().setCustomUserClaims(user.uid, { ...user.customClaims, admin: true });
  await getFirestore().doc(`admins/${user.uid}`).set({ email: normalized, addedAt: FieldValue.serverTimestamp() });
  return { uid: user.uid, link: await getAuth().generatePasswordResetLink(normalized) };
});

const requireAdmin = async (req) => {
  if (!(await isAdminCaller(req))) throw new HttpsError('permission-denied', 'Admins only.');
};

// Removes a company with its members, profiles and requests, and clears the members' access.
export const deleteCompany = onCall(async (req) => {
  await requireAdmin(req);
  const { cid } = req.data || {};
  if (typeof cid !== 'string' || !cid) throw new HttpsError('invalid-argument', 'Company required.');
  const db = getFirestore();
  const ref = db.doc(`companies/${cid}`);
  const members = await ref.collection('members').get();
  await db.recursiveDelete(ref); // member deletes fire syncMemberClaims, which clears their claims
  return { removedMembers: members.size };
});

// Daily collection, 09:00 Athens. IPTO publishes weekly files with revisions, so look back three weeks.
const DAY = 864e5;
async function runAll(lookbackDays) {
  const now = Date.now(), out = {};
  const run = async (name, fn) => { try { out[name] = await track(name, fn); } catch (e) { out[name] = `error: ${e.message}`; } };
  await run('ipto', () => runIpto(isoDay(now - lookbackDays * DAY), isoDay(now)));
  await run('entsoe', () => runEntsoe(isoDay(now - Math.min(lookbackDays, 10) * DAY), isoDay(now + 2 * DAY)));
  await run('series', () => runUrlSeries());
  return out;
}

export const feedsDaily = onSchedule({ schedule: '0 9 * * *', timeZone: 'Europe/Athens', timeoutSeconds: 540, memory: '1GiB' }, () => runAll(21));

// Admin "Run now" and backfill. feed: ipto | entsoe | series, from/to: YYYY-MM-DD.
export const runFeed = onCall({ timeoutSeconds: 540, memory: '1GiB' }, async (req) => {
  await requireAdmin(req);
  const { feed, from, to } = req.data || {};
  const day = /^\d{4}-\d{2}-\d{2}$/;
  if (feed !== 'series' && !(day.test(from) && day.test(to) && from <= to)) throw new HttpsError('invalid-argument', 'from/to as YYYY-MM-DD.');
  try {
    if (feed === 'ipto') return await track('ipto', () => runIpto(from, to));
    if (feed === 'entsoe') return await track('entsoe', () => runEntsoe(from, isoDay(Date.parse(to) + DAY)));
    if (feed === 'series') return await track('series', () => runUrlSeries());
  } catch (e) {
    throw new HttpsError('internal', e.message);
  }
  throw new HttpsError('invalid-argument', 'Unknown feed.');
});

// Create or update an admin-managed series; points as { 'YYYY-MM' | 'YYYY-MM-DD': value }.
const LICENCES = ['display', 'derived', 'internal'];
export const saveSeriesData = onCall(async (req) => {
  await requireAdmin(req);
  const { id, meta = {}, points = {}, replace = false } = req.data || {};
  if (typeof id !== 'string' || !/^[a-z0-9_-]{2,40}$/.test(id)) throw new HttpsError('invalid-argument', 'Id: 2-40 lowercase letters, digits, - or _.');
  if (meta.licence && !LICENCES.includes(meta.licence)) throw new HttpsError('invalid-argument', 'Licence must be display, derived or internal.');
  const clean = Object.fromEntries(Object.entries(points).filter(([k, v]) => /^\d{4}-\d{2}(-\d{2})?$/.test(k) && Number.isFinite(v)));
  const pick = ({ name, unit, freq, licence, source, url, note, confidence }) => Object.fromEntries(Object.entries({ name, unit, freq, licence, source, url, note, confidence }).filter(([, v]) => v !== undefined));
  return { changed: await saveSeries(id, pick(meta), clean, replace), points: Object.keys(clean).length };
});

// Pricing runs on the server, so licensed ('derived') series never reach the browser.
async function requireCostAccess(req, cid) {
  if (typeof cid !== 'string' || !cid) throw new HttpsError('invalid-argument', 'Company required.');
  const company = (await getFirestore().doc(`companies/${cid}`).get()).data();
  if (!company) throw new HttpsError('not-found', 'Company not found.');
  const valid = !company.validUntil || company.validUntil.toMillis() > Date.now();
  if (!(await isAdminCaller(req)) && !(req.auth?.token?.cid === cid && company.modules?.cost === true && valid)) throw new HttpsError('permission-denied', 'Not allowed.');
}

// p: { kind, monthly: { ym: kWh }, hourly: { start, kwh[] } } as produced by aggregate().
async function computePrice(p) {
  const db = getFirestore();
  const config = (await db.doc('config/app').get()).data() || {};
  const months = Object.keys(p.monthly || {});
  let result;
  if (p.kind === 'gas') {
    const seriesId = config.gasSeries || 'ttf';
    const s = (await db.doc(`series/${seriesId}`).get()).data();
    if (!s) throw new HttpsError('failed-precondition', `Gas price series "${seriesId}" is not set up yet (Admin → Data sources).`);
    const monthAvg = (ym) => {
      if (s.points[ym] != null) return s.points[ym];
      const daily = Object.entries(s.points).filter(([k]) => k.startsWith(`${ym}-`)).map(([, v]) => v);
      return daily.length ? daily.reduce((a, b) => a + b, 0) / daily.length : null;
    };
    result = { ...priceMonthly(p.monthly, monthAvg), series: s.name || seriesId, confidence: s.confidence || null };
  } else {
    const fee = Number(config.adminFee ?? 0.2);
    const read = (col) => Promise.all(months.map((ym) => db.doc(`market/${col}/months/${ym}`).get()));
    const [dam, ipto] = await Promise.all([read('dam'), read('ipto')]);
    const hours = Object.assign({}, ...dam.map((d) => d.data()?.hours || {}));
    const days = Object.assign({}, ...ipto.map((d) => d.data()?.days || {}));
    const internal = dam.some((d) => d.data()?.licence === 'internal');
    // Hours without an hourly price fall back to the monthly power series, as in the prototype.
    const fallback = (await db.doc(`series/${config.powerSeries || 'power'}`).get()).data()?.points || {};
    let fallbackHours = 0;
    const damAt = (hk) => {
      if (hours[hk] != null) return hours[hk];
      const v = fallback[new Date(hk * 36e5).toISOString().slice(0, 7)];
      if (v != null) fallbackHours++;
      return v ?? null;
    };
    const r = priceElectricity(p.hourly, damAt, (day) => (days[day] && days[day].u1 != null ? [days[day].u1, days[day].u2, days[day].u3] : null), fee);
    const per = (x) => (r.mwh ? x / r.mwh : null);
    result = { ...r, fee, fallbackHours, damInternal: internal, perMWhParts: { dam: per(r.dam), u1: per(r.u[0]), u2: per(r.u[1]), u3: per(r.u[2]), fee: r.mwh ? fee : null } };
  }
  result.pricedAt = new Date().toISOString();
  return result;
}

export const priceProfile = onCall(async (req) => {
  const { cid, pid } = req.data || {};
  if (typeof pid !== 'string') throw new HttpsError('invalid-argument', 'Profile required.');
  await requireCostAccess(req, cid);
  const pref = getFirestore().doc(`companies/${cid}/profiles/${pid}`);
  const p = (await pref.get()).data();
  if (!p) throw new HttpsError('not-found', 'Profile not found.');
  const result = await computePrice(p);
  await pref.update({ result });
  return result;
});

// Prices a profile that is not saved (the sample, or a file before the user saves it). Nothing is stored.
export const priceDraft = onCall(async (req) => {
  const { cid, profile } = req.data || {};
  await requireCostAccess(req, cid);
  const kwh = profile?.hourly?.kwh;
  if (!['electricity', 'gas'].includes(profile?.kind) || !Number.isInteger(profile?.hourly?.start) || !Array.isArray(kwh) || kwh.length > 20000
    || typeof profile.monthly !== 'object' || Object.keys(profile.monthly).length > 30) {
    throw new HttpsError('invalid-argument', 'Profile must be electricity or gas, at most about two years of hourly data.');
  }
  return computePrice(profile);
});

// Manual import of hourly day-ahead prices, e.g. a licensed file or the prototype's data.
// hours: { localHourKey: €/MWh }. licence 'internal' keeps a visible "internal use" label on every chart that uses it.
export const importDam = onCall({ timeoutSeconds: 300, memory: '512MiB' }, async (req) => {
  await requireAdmin(req);
  const { hours = {}, source, licence = 'internal', note = null } = req.data || {};
  if (typeof source !== 'string' || !source.trim()) throw new HttpsError('invalid-argument', 'Source required.');
  if (!['official', 'internal'].includes(licence)) throw new HttpsError('invalid-argument', 'Licence must be official or internal.');
  const clean = Object.fromEntries(Object.entries(hours).filter(([k, v]) => /^\d{6}$/.test(k) && Number.isFinite(v)));
  return saveDamHours(clean, source.trim(), licence, note);
});
