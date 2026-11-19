// Sample market data for the public landing page, laid out like the Metis dashboard design
// (forward curve M+1..Y+5, historical settlements, OHLC table, curve evolution).
// Illustrative only: generated from a fixed seed, never market data.

const rng = (seed) => () => { // mulberry32
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
const r2 = (x) => Math.round(x * 100) / 100;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Settlement levels per product, in contract order M+1..M+5, Q+1..Q+4, Y+1..Y+5 (€/MWh).
const LEVELS = {
  power: [118.5, 121.2, 116.8, 112.0, 104.3, 114.6, 98.9, 109.3, 117.2, 108.4, 99.7, 94.2, 91.1, 89.0],
  gas: [31.4, 32.1, 31.6, 29.8, 27.4, 31.7, 26.9, 26.4, 28.9, 28.4, 26.1, 24.3, 23.2, 22.8],
};
const VOL = { power: 0.016, gas: 0.021 };

function contracts(ref) {
  const y = ref.getFullYear(), m = ref.getMonth(), q = Math.floor(m / 3);
  const out = [];
  for (let i = 1; i <= 5; i++) { const d = new Date(y, m + i, 1); out.push({ id: `M+${i}`, name: `${MON[d.getMonth()]}-${String(d.getFullYear()).slice(2)}`, kind: 'm', beta: 1 - i * 0.03 }); }
  for (let i = 1; i <= 4; i++) { const k = q + i; out.push({ id: `Q+${i}`, name: `Q${(k % 4) + 1}-${String(y + Math.floor(k / 4)).slice(2)}`, kind: 'q', beta: 0.85 - i * 0.03 }); }
  for (let i = 1; i <= 5; i++) out.push({ id: `Y+${i}`, name: `Cal-${String(y + i).slice(2)}`, kind: 'y', beta: 0.62 - i * 0.05 });
  return out;
}

// The last 261 trading days (Mon-Fri, about a year) up to the reference date. A fixed count keeps the
// random draws, and so the figures and the Buyometer reading, the same whatever today's date is.
function tradingDays(ref) {
  const out = [];
  for (let d = ref; out.length < 261; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1)) if (d.getDay() % 6) out.unshift(d);
  return out;
}

/** { ref, days, contracts: [{ id, name, kind, close[], ohlc{open,high,low,close,settle}, prev }] } for 'power' | 'gas'. */
export function demoMarket(product, ref = new Date()) {
  const r = rng(product === 'power' ? 2029 : 3029);
  const days = tradingDays(new Date(ref.getFullYear(), ref.getMonth(), ref.getDate()));
  const n = days.length, vol = VOL[product];
  // Common market factor walked backwards from today (0 at the reference date), with a slow seasonal swell.
  const F = new Array(n).fill(0);
  for (let i = n - 2; i >= 0; i--) F[i] = F[i + 1] * 0.996 + gauss(r) * vol + Math.sin(i / 38) * vol * 0.12;
  const cs = contracts(ref).map((c, k) => {
    let e = 0;
    const close = new Array(n);
    for (let i = n - 1; i >= 0; i--) { close[i] = r2(LEVELS[product][k] * Math.exp(F[i] * c.beta + e)); e += gauss(r) * vol * 0.25; }
    const last = close[n - 1], prev = close[n - 2];
    const open = r2(prev * (1 + gauss(r) * vol * 0.3));
    const cl = r2(last * (1 + gauss(r) * vol * 0.15));
    const wig = Math.abs(gauss(r)) * vol * 0.4 + 0.002;
    return { ...c, close, prev, ohlc: { settle: last, open, close: cl, high: r2(Math.max(open, cl, last) * (1 + wig)), low: r2(Math.min(open, cl, last) * (1 - wig)) } };
  });
  return { ref: days[n - 1], days, contracts: cs };
}

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;

/** Headline numbers for the KPI strip and the Buyometer. */
export function demoStats(m) {
  const n = m.days.length;
  const m1 = m.contracts[0], y1 = m.contracts.find((c) => c.id === 'Y+1');
  const back = (c, k) => c.close[Math.max(0, n - 1 - k)];
  const avg90 = mean(y1.close.slice(-63));
  const vsAvg = (y1.ohlc.settle / avg90 - 1) * 100;
  // Five-step Buyometer from the Y+1 discount to its 90-day average: cheap means buy.
  const signal = vsAvg <= -6 ? 4 : vsAvg <= -2 ? 3 : vsAvg < 2 ? 2 : vsAvg < 6 ? 1 : 0;
  return {
    m1, y1, vsAvg, signal,
    dayChange: m1.ohlc.settle - m1.prev,
    month: { from: back(m1, 21), pct: (m1.ohlc.settle / back(m1, 21) - 1) * 100 },
    range: [Math.min(...m1.close), Math.max(...m1.close)],
    shape: y1.ohlc.settle - m1.ohlc.settle,
  };
}

export const SIGNALS = ['strongSell', 'sell', 'neutral', 'buy', 'strongBuy'];
