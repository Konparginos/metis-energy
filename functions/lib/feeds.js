// Market data collection. Every write goes through writeVersioned, so earlier values stay under versions/.
//   market/{feed}                     run status shown in Admin → Data sources
//   market/ipto/days/{YYYY-MM-DD}     96 quarter-hour values per field, + versions/
//   market/ipto/months/{YYYY-MM}      { days: { date: daily summary } } for charts and pricing
//   market/dam/months/{YYYY-MM}       { hours: { hourKey: €/MWh } } + versions/
//   series/{id}                       admin-managed series (TTF, EUA, GoO, forwards …) + versions/
import ExcelJS from 'exceljs';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { parseImbabe, summarizeDay, fileVersion, parseEntsoeA44 } from './parsers.js';
import { parseSeriesCSV } from './cost.js';

const db = () => getFirestore();
const DAY = 864e5;
export const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

const stable = (v) => (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && typeof v.toMillis !== 'function'
  ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`
  : Array.isArray(v) ? `[${v.map(stable).join(',')}]` : JSON.stringify(v));
const content = ({ version, updatedAt, feed, ...rest } = {}) => stable(rest); // feed = run status, not data

// Writes data; when it differs from what is stored, the old document is archived as versions/{n}.
export async function writeVersioned(ref, data) {
  const prev = (await ref.get()).data();
  if (prev && content(prev) === content(data)) return false;
  const batch = db().batch();
  if (prev) batch.set(ref.collection('versions').doc(String(prev.version || 1)), prev);
  batch.set(ref, { ...data, version: (prev?.version || 0) + 1, updatedAt: FieldValue.serverTimestamp() });
  await batch.commit();
  return true;
}

// Runs a feed and records the outcome for the admin panel.
export async function track(feed, fn) {
  const ref = db().doc(`market/${feed}`);
  try {
    const summary = await fn();
    await ref.set({ lastRun: FieldValue.serverTimestamp(), ok: true, error: null, summary, lastOk: FieldValue.serverTimestamp() }, { merge: true });
    return summary;
  } catch (e) {
    await ref.set({ lastRun: FieldValue.serverTimestamp(), ok: false, error: String(e.message || e).slice(0, 500) }, { merge: true });
    throw e;
  }
}

async function get(url, init) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`${res.status} from ${url.split('?')[0]}: ${(await res.text()).slice(0, 200)}`);
  return res;
}

// IPTO weekly IMBABE files (imbalance price, mFRR, uplift accounts 1-3). Public, official.
export async function runIpto(from, to) {
  const latest = new Map(); // one entry per week, highest file version wins
  for (let a = Date.parse(from); a <= Date.parse(to); a += 60 * DAY) {
    const b = Math.min(a + 59 * DAY, Date.parse(to));
    const files = await (await get(`https://www.admie.gr/getOperationMarketFilewRange?dateStart=${isoDay(a)}&dateEnd=${isoDay(b)}&FileCategory=IMBABE`)).json();
    for (const f of files || []) {
      const name = f.file_path.split('/').pop(), week = name.slice(0, 8), v = fileVersion(name);
      if (!latest.has(week) || latest.get(week).v < v) latest.set(week, { url: f.file_path, name, v });
    }
  }
  let filesRead = 0, daysChanged = 0;
  for (const { url, name, v } of latest.values()) {
    const seen = db().doc(`market/ipto/files/${name}`);
    if ((await seen.get()).exists) continue;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await (await get(url)).arrayBuffer()));
    const rows = [];
    wb.worksheets[0].eachRow((r) => rows.push(r.values));
    const months = {};
    for (const [day, data] of Object.entries(parseImbabe(rows))) {
      if (await writeVersioned(db().doc(`market/ipto/days/${day}`), { ...data, source: name, fileVersion: v })) daysChanged++;
      (months[day.slice(0, 7)] ||= {})[day] = summarizeDay(data);
    }
    for (const [ym, days] of Object.entries(months)) await db().doc(`market/ipto/months/${ym}`).set({ days }, { merge: true });
    await seen.set({ url, version: v, at: FieldValue.serverTimestamp() });
    filesRead++;
  }
  return { weeksListed: latest.size, filesRead, daysChanged };
}

// ENTSO-E Transparency day-ahead prices for the Greek bidding zone. Needs the API token saved in Admin.
const ymdhm = (ms) => new Date(ms).toISOString().replace(/[-:T]/g, '').slice(0, 12);
export async function runEntsoe(from, to) {
  const token = (await db().doc('secrets/entsoe').get()).data()?.value;
  if (!token) throw new Error('ENTSO-E API token missing: add it in Admin → Data sources.');
  const hours = {};
  for (let a = Date.parse(from); a < Date.parse(to); a += 30 * DAY) {
    const b = Math.min(a + 30 * DAY, Date.parse(to));
    const res = await fetch(`https://web-api.tp.entsoe.eu/api?documentType=A44&contract_MarketAgreement.type=A01&in_Domain=10YGR-HTSO-----Y&out_Domain=10YGR-HTSO-----Y&periodStart=${ymdhm(a)}&periodEnd=${ymdhm(b)}&securityToken=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(60_000) });
    const xml = await res.text();
    if (/No matching data/i.test(xml)) continue;
    if (!res.ok || !xml.includes('<Period>')) throw new Error(`ENTSO-E ${res.status}: ${xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 200)}`);
    Object.assign(hours, parseEntsoeA44(xml));
  }
  return saveDamHours(hours, 'ENTSO-E Transparency (A44, Greece)', 'official');
}

// Merges hourly day-ahead prices ({ localHourKey: €/MWh }) into market/dam/months, versioned.
// licence: 'official' | 'internal' (internal = licensed for Metis' internal use only, flagged in the UI).
export async function saveDamHours(hours, source, licence, note = null) {
  const byMonth = {};
  for (const [hk, p] of Object.entries(hours)) (byMonth[isoDay(+hk * 36e5).slice(0, 7)] ||= {})[hk] = p;
  let monthsChanged = 0;
  for (const [ym, h] of Object.entries(byMonth)) {
    const ref = db().doc(`market/dam/months/${ym}`);
    const prev = (await ref.get()).data() || {};
    // A month counts as official only when every hour in it came from an official feed.
    const covers = Object.keys(prev.hours || {}).every((k) => k in h);
    const lic = licence === 'internal' || (prev.licence === 'internal' && !covers) ? 'internal' : 'official';
    if (await writeVersioned(ref, { hours: { ...(prev.hours || {}), ...h }, source, licence: lic, note })) monthsChanged++;
  }
  return { hours: Object.keys(hours).length, monthsChanged };
}

// Admin-managed series. A series with a URL is fetched daily; the URL must return "date;value" lines.
// An optional header (e.g. "Authorization: Bearer …") is kept in secrets/series_{id}.
export async function saveSeries(id, meta, points, replace) {
  const ref = db().doc(`series/${id}`);
  const prev = (await ref.get()).data() || {};
  const { version, updatedAt, ...base } = prev;
  return writeVersioned(ref, { ...base, ...meta, points: replace ? points : { ...(prev.points || {}), ...points } });
}

export async function runUrlSeries() {
  const out = {};
  for (const s of (await db().collection('series').get()).docs) {
    const { url } = s.data();
    if (!url) continue;
    try {
      const header = (await db().doc(`secrets/series_${s.id}`).get()).data()?.value;
      const headers = header && header.includes(':') ? { [header.split(':')[0].trim()]: header.slice(header.indexOf(':') + 1).trim() } : {};
      const points = parseSeriesCSV(await (await get(url, { headers })).text());
      if (!Object.keys(points).length) throw new Error('No "date;value" rows in the response.');
      out[s.id] = (await saveSeries(s.id, {}, points, false)) ? 'updated' : 'unchanged';
      await s.ref.set({ feed: { ok: true, lastRun: FieldValue.serverTimestamp(), error: null } }, { merge: true });
    } catch (e) {
      out[s.id] = `error: ${e.message}`;
      await s.ref.set({ feed: { ok: false, lastRun: FieldValue.serverTimestamp(), error: String(e.message).slice(0, 300) } }, { merge: true });
    }
  }
  return out;
}
