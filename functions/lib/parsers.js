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
