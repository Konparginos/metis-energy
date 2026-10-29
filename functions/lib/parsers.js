// Pure parsers for the market feeds, kept free of Firebase so they can be tested with node --test.

const pad2 = (n) => String(n).padStart(2, '0');
const avg = (a) => { const v = a.filter((x) => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
const round = (x, d = 4) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);

// IPTO IMBABE sheet rows (as from exceljs getRow().values, 1-based) → { 'YYYY-MM-DD': day }
// Columns: B start, H imbalance price, I mFRR up, J mFRR down, K-M uplift accounts 1-3 (€/MWh).
// Timestamps in the file are Greek local time stored without zone; exceljs exposes them as UTC fields.
export function parseImbabe(rows) {
  const head = rows[0] || [];
  const col = (re) => head.findIndex((h) => typeof h === 'string' && re.test(h));
  const c = {
    start: col(/^STARTDATE/i), imb: col(/^Imbalance Price/i), up: col(/^mFRR Price UP/i), down: col(/^mFRR Price Down/i),
    u1: col(/^Uplift Account 1/i), u2: col(/^Uplift Account 2/i), u3: col(/^Uplift Account 3/i),
  };
  if (Object.values(c).some((i) => i < 0)) throw new Error(`IMBABE header changed: ${JSON.stringify(head)}`);

  const days = {};
  for (const r of rows.slice(1)) {
    const t = r[c.start];
    if (!(t instanceof Date)) continue;
    const day = `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
    const q = t.getUTCHours() * 4 + Math.floor(t.getUTCMinutes() / 15);
    const d = days[day] ||= { imb: [], up: [], down: [], u1: [], u2: [], u3: [] };
    for (const k of Object.keys(d)) {
      const v = r[c[k]];
      d[k][q] = typeof v === 'number' ? round(v) : null;
    }
  }
  for (const d of Object.values(days)) for (const k of Object.keys(d)) d[k] = Array.from({ length: 96 }, (_, i) => d[k][i] ?? null);
  return days;
}

// Daily figures used by charts and the cost formula (uplift as daily average, as in the prototype).
export function summarizeDay(d) {
  const imb = d.imb.filter((x) => x != null);
  return {
    imb: round(avg(d.imb), 2), imbMin: imb.length ? Math.min(...imb) : null, imbMax: imb.length ? Math.max(...imb) : null,
    u1: round(avg(d.u1)), u2: round(avg(d.u2)), u3: round(avg(d.u3)),
  };
}

// Version number from an IPTO file name such as 20261012_IMBABE_02.xlsx
export const fileVersion = (url) => Number((url.match(/_(\d+)\.xlsx$/i) || [])[1] || 1);

// Greek local wall-clock parts for a UTC instant.
const athens = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Athens', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
export function localHourKey(ms) {
  const p = Object.fromEntries(athens.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour) / 36e5; // same key scheme as src/lib/cost.js hourKey
}

// ENTSO-E A44 day-ahead XML → { localHourKey: €/MWh } (15-minute prices averaged to the hour).
// ponytail: regex over a known, flat schema; switch to an XML parser if ENTSO-E nests it differently.
export function parseEntsoeA44(xml) {
  const sums = new Map();
  for (const period of xml.match(/<Period>[\s\S]*?<\/Period>/g) || []) {
    const start = Date.parse(period.match(/<start>([^<]+)<\/start>/)[1]);
    const res = period.match(/<resolution>PT(\d+)M<\/resolution>/);
    const step = res ? +res[1] : 60;
    const pts = [...period.matchAll(/<Point>\s*<position>(\d+)<\/position>\s*<price\.amount>([-\d.]+)<\/price\.amount>/g)]
      .map((m) => [+m[1], +m[2]]);
    const count = Math.round((Date.parse(period.match(/<end>([^<]+)<\/end>/)[1]) - start) / (step * 6e4));
    // ENTSO-E omits repeated prices (curve type A03): carry the last price forward.
    let p = 0, last = null;
    for (let pos = 1; pos <= count; pos++) {
      if (p < pts.length && pts[p][0] === pos) last = pts[p++][1];
      if (last == null) continue;
      const hk = localHourKey(start + (pos - 1) * step * 6e4);
      const s = sums.get(hk) || [0, 0];
      sums.set(hk, [s[0] + last, s[1] + 1]);
    }
  }
  return Object.fromEntries([...sums].map(([k, [s, n]]) => [k, round(s / n, 2)]));
}

// HEnEx Day-ahead "Results" file (YYYYMMDD_EL-DAM_Results_EN_vNN.xlsx), rows with a header row first.
// MCP is the Greek clearing price per 15-minute period (SORT 1..96, 92 or 100 on clock-change days).
// DELIVERY_MTU is Central European wall-clock time (the repeated hour on 25 Oct is 02:00), so SORT 1 starts at
// 00:00 CET/CEST of DDAY, i.e. 01:00 in Athens; prices are averaged to Athens local hours like the ENTSO-E feed.
const berlin = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const berlinMidnight = (y, m, d) => {
  const guess = Date.UTC(y, m - 1, d);
  const p = Object.fromEntries(berlin.formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
  return guess - (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - guess); // CET/CEST offset of that midnight
};
export function parseHenexResults(rows) {
  const head = (rows[0] || []).map((h) => (typeof h === 'string' ? h.trim() : h));
  const at = (k) => head.indexOf(k);
  const [iDay, iSort, iMcp] = [at('DDAY'), at('SORT'), at('MCP')];
  if (iDay < 0 || iSort < 0 || iMcp < 0) throw new Error('HEnEx results: DDAY, SORT or MCP column missing.');
  const mcp = new Map(); // "day|sort" → price; the same MCP repeats on every asset row
  for (const r of rows.slice(1)) {
    const day = String(r[iDay] ?? ''), sort = Number(r[iSort]), p = Number(r[iMcp]);
    if (/^\d{8}$/.test(day) && sort >= 1 && Number.isFinite(p) && r[iMcp] !== null && r[iMcp] !== '') mcp.set(`${day}|${sort}`, p);
  }
  const sums = new Map();
  for (const [k, p] of mcp) {
    const [day, sort] = k.split('|');
    const start = berlinMidnight(+day.slice(0, 4), +day.slice(4, 6), +day.slice(6, 8));
    const hk = localHourKey(start + (Number(sort) - 1) * 15 * 6e4);
    const s = sums.get(hk) || [0, 0];
    sums.set(hk, [s[0] + p, s[1] + 1]);
  }
  return Object.fromEntries([...sums].map(([k, [s, n]]) => [k, round(s / n, 2)]));
}

// Links to the Results files on HEnEx's Day-ahead publications page → [{ day: 'YYYY-MM-DD', version, url }], newest version per day.
export function henexResultLinks(html) {
  const best = new Map();
  for (const m of html.matchAll(/href="(\/c\/document_library\/get_file\?uuid=[^"]+)"[^>]*>[\s\S]{0,120}?(\d{4})(\d{2})(\d{2})_EL-DAM_Results_EN_v(\d+)/g)) {
    const day = `${m[2]}-${m[3]}-${m[4]}`, version = Number(m[5]);
    if (!best.has(day) || best.get(day).version < version) best.set(day, { day, version, url: `https://www.enexgroup.gr${m[1].replace(/&amp;/g, '&')}` });
  }
  return [...best.values()].sort((a, b) => a.day.localeCompare(b.day));
}
