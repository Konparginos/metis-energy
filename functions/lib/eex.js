// EEX Group DataSource File Cloud: end-of-day settlement prices (internal-usage subscription).
// Files: https://filecloud.eex-group.com/spr/YYYY/MM/<File>_YYYYMMDD.csv.gz, Bearer token from the DataSource Hub.
// One request per month (".../spr/YYYY/MM?download" returns a .tar of that month's files): EEX allows 250 downloads per 30 min.
import { gunzipSync } from 'node:zlib';

// Which contract feeds which Metis series. pick: 'front' = nearest maturity, 'dec' = nearest December (the EUA benchmark).
export const EEX_SERIES = [
  { id: 'ttf', file: 'SettlementNATGASDerivatives_TTF_Future', code: 'G3BM', pick: 'front', name: 'TTF natural gas (EEX front month)', unit: '€/MWh' },
  { id: 'eua', file: 'SettlementENVIRONMENTALSDerivatives_EU_Future', code: 'FEUA', pick: 'dec', name: 'EU carbon allowances (EUA, EEX Dec)', unit: '€/tCO₂' },
  { id: 'go', file: 'SettlementGODerivatives_EU_Future', code: 'EGOE', pick: 'front', name: 'Guarantees of Origin (EEX European Renewable)', unit: '€/MWh' },
  { id: 'gr_month', file: 'SettlementPOWERDerivatives_GR_Future', code: 'FFBM', pick: 'front', name: 'Greek power base, front month (EEX)', unit: '€/MWh' },
  { id: 'gr_year', file: 'SettlementPOWERDerivatives_GR_Future', code: 'FFBY', pick: 'front', name: 'Greek power base, front year (EEX)', unit: '€/MWh' },
];

// Files in a ustar/GNU tar archive: 512-byte header (name at 0, octal size at 124), data padded to 512.
export function untar(buf) {
  const out = [];
  for (let at = 0; at + 512 <= buf.length;) {
    const name = buf.toString('utf8', at, at + 100).replace(/\0.*$/s, '');
    if (!name) break;
    const size = parseInt(buf.toString('ascii', at + 124, at + 136).replace(/\0.*$/s, '').trim() || '0', 8);
    const type = String.fromCharCode(buf[at + 156] || 48);
    if (type === '0' || type === '\0') out.push({ name, data: buf.subarray(at + 512, at + 512 + size) });
    at += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}

// Settlement file text → { 'YYYY-MM-DD': { maturity, px } } for one contract code, choosing the maturity by `pick`.
export function settlementFor(csv, code, pick) {
  const [head, ...lines] = csv.trim().split(/\r?\n/);
  const col = Object.fromEntries(head.split(',').map((h, i) => [h.trim(), i]));
  const out = {};
  for (const line of lines) {
    const c = line.split(',');
    if (c[col.ShortCode] !== code) continue;
    const px = Number(c[col.Px]), mat = c[col.Maturity], day = c[col.TrdDate];
    if (!Number.isFinite(px) || !/^\d{6}$/.test(mat) || (pick === 'dec' && !mat.endsWith('12'))) continue;
    if (!out[day] || mat < out[day].maturity) out[day] = { maturity: mat, px };
  }
  return out;
}

// Reads a month's tar and returns { seriesId: { 'YYYY-MM-DD': px } } for the given date range.
export function pricesFromTar(tar, from, to) {
  const out = {};
  for (const { name, data } of untar(tar)) {
    const base = name.split('/').pop();
    const m = /^(.+)_(\d{4})(\d{2})(\d{2})\.csv(\.gz)?$/.exec(base);
    if (!m) continue;
    const day = `${m[2]}-${m[3]}-${m[4]}`;
    if (day < from || day > to) continue;
    const specs = EEX_SERIES.filter((s) => s.file === m[1]);
    if (!specs.length) continue;
    const csv = (m[5] ? gunzipSync(data) : data).toString('utf8');
    for (const s of specs) for (const [d, { px }] of Object.entries(settlementFor(csv, s.code, s.pick))) (out[s.id] ||= {})[d] = px;
  }
  return out;
}

// Merges daily prices into a series' points. Daily values replace the month's single monthly value (e.g. the prototype's),
// so charts and gas pricing average the real settlements instead of mixing them with an old estimate.
export function mergeDaily(points = {}, daily) {
  const next = { ...points, ...daily };
  for (const ym of new Set(Object.keys(daily).map((d) => d.slice(0, 7)))) delete next[ym];
  return next;
}
