// Consumption parsing and the Metis electricity cost formula.
// Electricity €/MWh = hourly DAM + Uplift 1 + Uplift 2 + Uplift 3 + regulator admin fee.
// 15-minute readings are summed to the hour and priced at the hourly DAM; uplift is a daily value.

const pad2 = (n) => String(n).padStart(2, '0');

// "1.234,5" / "1,234.5" / "1234,5" → number; empty → null; garbage → NaN
export function parseNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  let s = String(v ?? '').trim().replace(/\s/g, '');
  if (!s) return null;
  const c = s.lastIndexOf(','), p = s.lastIndexOf('.');
  if (c > -1 && p > -1) s = c > p ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (c > -1) s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

// Accepts "YYYY-MM-DD HH:MM", "DD/MM/YYYY HH:MM" (also "." or "-" separators) or an Excel serial.
// Returns [y, mo, d, hh, mi] in local market time, or null.
export function parseTS(v) {
  if (v instanceof Date) { // Excel readers hand back wall-clock time in the UTC fields
    return Number.isNaN(+v) ? null : [v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate(), v.getUTCHours(), v.getUTCMinutes()];
  }
  if (typeof v === 'number' || /^\d+(\.\d+)?$/.test(String(v).trim())) {
    const ms = Math.round((Number(v) - 25569) * 864e5 / 6e4) * 6e4; // Excel epoch, rounded to the minute
    const t = new Date(ms);
    return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate(), t.getUTCHours(), t.getUTCMinutes()];
  }
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})/);
  if (m) return [+m[1], +m[2], +m[3], +m[4], +m[5]];
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\s+(\d{1,2}):(\d{2})/);
  if (m) return [+m[3], +m[2], +m[1], +m[4], +m[5]];
  return null;
}

export const hourKey = (y, mo, d, hh) => Date.UTC(y, mo - 1, d, hh) / 36e5;
export const dayOfHour = (hk) => { const t = new Date(hk * 36e5); return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`; };

// rows: [[timestamp, kWh], ...] → summary plus an hourly series small enough for one Firestore doc
export function aggregate(rows) {
  const a = { n: 0, empty: 0, bad: 0, neg: 0, totalKWh: 0, peakV: 0, solarKWh: 0, sub: false, monthly: {}, hr: new Map() };
  for (const [tv, vv] of rows) {
    const t = parseTS(tv);
    if (!t) continue;
    const v = parseNum(vv);
    if (v === null) { a.empty++; continue; }
    if (Number.isNaN(v)) { a.bad++; continue; }
    if (v < 0) { a.neg++; continue; }
    const [y, mo, d, hh, mi] = t;
    if (mi) a.sub = true;
    const ym = `${y}-${pad2(mo)}`, hk = hourKey(y, mo, d, hh);
    a.n++; a.totalKWh += v; a.peakV = Math.max(a.peakV, v);
    a.monthly[ym] = (a.monthly[ym] || 0) + v;
    a.hr.set(hk, (a.hr.get(hk) || 0) + v);
    if (hh >= 10 && hh < 17) a.solarKWh += v;
  }
  if (!a.n) return null;
  const step = a.sub ? 15 : 60, keys = [...a.hr.keys()];
  const start = Math.min(...keys), end = Math.max(...keys);
  const kwh = new Array(end - start + 1).fill(null);
  for (const [k, v] of a.hr) kwh[k - start] = Math.round(v * 1000) / 1000;
  const peakKW = a.peakV * 60 / step, avgKW = a.totalKWh / (a.n * step / 60);
  return {
    readings: a.n, skipped: { empty: a.empty, bad: a.bad, negative: a.neg }, stepMin: step,
    totalKWh: a.totalKWh, peakKW, loadFactor: peakKW ? avgKW / peakKW : 0, solarShare: a.solarKWh / a.totalKWh,
    from: dayOfHour(start), to: dayOfHour(end), monthly: a.monthly,
    hourly: { start, kwh },
  };
}

// Monthly kWh × monthly price (gas at TTF). priceAt('YYYY-MM') → €/MWh | null
export function priceMonthly(monthly, priceAt) {
  const r = { mwh: 0, cost: 0, uncoveredMWh: 0, byMonth: {} };
  for (const [ym, kwh] of Object.entries(monthly)) {
    const p = priceAt(ym), mwh = kwh / 1000;
    if (p == null) { r.uncoveredMWh += mwh; continue; }
    r.mwh += mwh; r.cost += mwh * p; r.byMonth[ym] = mwh * p;
  }
  r.perMWh = r.mwh ? r.cost / r.mwh : null;
  return r;
}

// ";" or tab when present (Greek Excel exports), otherwise ",".
export const splitLine = (line) => line.split(/[;\t]/.test(line) ? /[;\t]/ : ',');

// Admin-pasted series: one "date;value" per line, date as YYYY-MM or YYYY-MM-DD (also DD/MM/YYYY).
export function parseSeriesCSV(text) {
  const points = {};
  for (const line of String(text).split(/\r?\n/)) {
    const [d, v] = splitLine(line).map((s) => (s || '').replace(/"/g, '').trim());
    let key = (d.match(/^\d{4}-\d{2}(-\d{2})?$/) || [])[0];
    const m = d.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
    if (m) key = `${m[3]}-${pad2(m[2])}-${pad2(m[1])}`;
    const n = parseNum(v);
    if (key && typeof n === 'number' && !Number.isNaN(n)) points[key] = n;
  }
  return points;
}

// damAt(hourKey) → €/MWh | null, upliftAt('YYYY-MM-DD') → [u1, u2, u3] €/MWh | null
export function priceElectricity(hourly, damAt, upliftAt, feePerMWh) {
  const r = { mwh: 0, dam: 0, u: [0, 0, 0], fee: 0, uncoveredMWh: 0, byMonth: {} };
  hourly.kwh.forEach((kwh, i) => {
    if (kwh == null) return;
    const hk = hourly.start + i, mwh = kwh / 1000, p = damAt(hk), u = upliftAt(dayOfHour(hk));
    if (p == null || u == null) { r.uncoveredMWh += mwh; return; }
    r.mwh += mwh; r.dam += mwh * p; r.fee += mwh * feePerMWh;
    for (let k = 0; k < 3; k++) r.u[k] += mwh * u[k];
    const ym = dayOfHour(hk).slice(0, 7);
    r.byMonth[ym] = (r.byMonth[ym] || 0) + mwh * (p + u[0] + u[1] + u[2] + feePerMWh);
  });
  r.cost = r.dam + r.u[0] + r.u[1] + r.u[2] + r.fee;
  r.perMWh = r.mwh ? r.cost / r.mwh : null;
  return r;
}
