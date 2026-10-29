import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase.js';
import { useT, loc } from './i18n.js';
import LineChart from './Chart.jsx';
import { Num } from './motion.jsx';
import { RecommendedSources } from './Catalogue.jsx';
import { HowTo, Insight, imbalanceHelp, imbalanceInsight, monthName, pricesHelp, upliftHelp, upliftInsight } from './insights.jsx';

const pad2 = (n) => String(n).padStart(2, '0');
const ym = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
const monthsBack = (n) => { const d = new Date(); return Array.from({ length: n }, (_, i) => ym(new Date(d.getFullYear(), d.getMonth() - (n - 1 - i), 1))); };
const monthsSince = (start) => { const out = []; const d = new Date(); for (let x = new Date(+start.slice(0, 4), +start.slice(5) - 1, 1); x <= d; x = new Date(x.getFullYear(), x.getMonth() + 1, 1)) out.push(ym(x)); return out; };
const RANGES = { '1Y': () => monthsBack(13), '3Y': () => monthsBack(37), all: () => monthsSince('2020-01') };
const dayOfHour = (hk) => new Date(hk * 36e5).toISOString().slice(0, 10);
const mean = (a) => { const v = a.filter((x) => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
const when = (ts) => (ts?.toDate ? ts.toDate().toLocaleString(loc(), { dateStyle: 'short', timeStyle: 'short' }) : '-');
const COLORS = { power: '--power', ttf: '--gas', eua: '--ua3', go: '--imb', gr_month: '--power', gr_year: '--power' };

// Confidence / licence label, as in the prototype: Official, Indicative, Low confidence, Internal use only.
export function Conf({ value }) {
  const t = useT();
  if (!value) return null;
  const v = String(value).toLowerCase();
  const cls = v.startsWith('official') ? 'ok' : v.startsWith('internal') ? 'neutral' : v.startsWith('low') ? 'bad' : 'warnb';
  const label = v === 'internal' ? t('internalUse') : v === 'indicative' ? t('indicative') : v.startsWith('low') ? t('lowConf') : v.startsWith('official from') ? `${t('officialFrom')} ${value.slice(14)}` : value;
  return <span className={`badge ${cls}`} title={label}>{label}</span>;
}

function resample(days, val, res) {
  if (res === 'm') {
    const by = {};
    for (const d of days) (by[d.slice(0, 7)] ||= []).push(val(d));
    const labels = Object.keys(by).sort();
    return { labels, data: labels.map((m) => mean(by[m])) };
  }
  const data = days.map(val);
  if (res === 'w') return { labels: days, data: data.map((_, i) => mean(data.slice(Math.max(0, i - 6), i + 1))) };
  return { labels: days, data };
}

function useMarket(range) {
  const t = useT();
  const [data, setData] = useState(null);
  useEffect(() => {
    let live = true;
    const months = RANGES[range]();
    const read = (feed) => Promise.all(months.map((m) => getDoc(doc(db, 'market', feed, 'months', m)).then((s) => s.data())));
    Promise.all([
      read('dam'), read('ipto'),
      getDocs(query(collection(db, 'series'), where('licence', '==', 'display'))),
      getDoc(doc(db, 'market', 'ipto')), getDoc(doc(db, 'market', 'entsoe')),
    ]).then(([dam, ipto, series, si, se]) => live && setData({ months, dam, ipto, series: series.docs.map((d) => ({ id: d.id, ...d.data() })), status: { ipto: si.data(), entsoe: se.data() } }))
      .catch(() => live && setData({ months, dam: [], ipto: [], series: [], status: {} }));
    return () => { live = false; };
  }, [range]);

  return useMemo(() => {
    if (!data) return null;
    const byDay = {};
    for (const mo of data.dam) for (const [hk, p] of Object.entries(mo?.hours || {})) (byDay[dayOfHour(+hk)] ||= []).push(p);
    const damDays = Object.keys(byDay).sort();
    const damInternal = data.dam.some((mo) => mo?.licence === 'internal');
    // Latest complete day: the Greek delivery day ends at 01:00 Athens, so its last hour lands alone on the next date.
    const damLast = damDays.findLast((d) => byDay[d].length >= 20);
    const damLastInternal = damLast && data.dam.find((mo, i) => data.months[i] === damLast.slice(0, 7))?.licence === 'internal';
    const damSource = data.dam.findLast((mo) => mo?.source)?.source;
    const imb = Object.assign({}, ...data.ipto.map((x) => x?.days || {}));
    const imbDays = Object.keys(imb).sort();
    const yearAgo = ym(new Date(new Date().getFullYear() - 1, new Date().getMonth(), 1));
    const last12 = imbDays.filter((d) => d.slice(0, 7) > yearAgo);
    const curMonth = imbDays.at(-1)?.slice(0, 7);
    const inCur = imbDays.filter((d) => d.slice(0, 7) === curMonth);

    // Monthly averages per commodity. Hourly day-ahead months override the monthly power series where they exist.
    const monthlyOf = (points) => {
      const by = {};
      for (const [k, v] of Object.entries(points)) (by[k.slice(0, 7)] ||= []).push(v);
      return Object.fromEntries(Object.entries(by).map(([k, v]) => [k, mean(v)]));
    };
    const damMonthly = monthlyOf(Object.fromEntries(damDays.map((d) => [d, mean(byDay[d])])));
    const order = ['power', 'gr_month', 'gr_year', 'ttf', 'eua', 'go'];
    const series = [...data.series].sort((a, b) => (order.indexOf(a.id) + 1 || 99) - (order.indexOf(b.id) + 1 || 99));
    if (!series.some((s) => s.id === 'power') && damDays.length) series.unshift({ id: 'power', unit: '€/MWh', points: {} });
    const commodities = series.map((s, i) => {
      const monthly = { ...monthlyOf(s.points || {}), ...(s.id === 'power' ? damMonthly : {}) };
      const keys = Object.keys(monthly).filter((k) => data.months.includes(k)).sort();
      const last = keys.at(-1);
      const ago = last && `${+last.slice(0, 4) - 1}${last.slice(4)}`;
      return {
        id: s.id, name: s.id === 'power' ? t('power') : s.name || s.id, unit: s.unit, color: COLORS[s.id] || ['--gas', '--ua3', '--imb'][i % 3],
        confidence: s.id === 'power' && damInternal ? 'internal' : s.confidence, note: s.note, source: s.source, updatedAt: s.updatedAt,
        monthly, keys, last, value: monthly[last], yoy: monthly[ago] ? (monthly[last] / monthly[ago] - 1) * 100 : null,
      };
    }).filter((c) => c.keys.length);
    const allMonths = data.months.filter((mo) => commodities.some((c) => c.monthly[mo] != null));
    const rebased = commodities.length > 1 && {
      labels: allMonths,
      datasets: commodities.map((c) => {
        const base = c.monthly[allMonths.find((mo) => c.monthly[mo] != null)];
        return { label: c.name, data: allMonths.map((mo) => (c.monthly[mo] != null && base ? (c.monthly[mo] / base) * 100 : null)), color: c.color };
      }),
    };
    const missing = imbDays.length ? Math.round((Date.parse(imbDays.at(-1)) - Date.parse(imbDays[0])) / 864e5) + 1 - imbDays.length : 0;
    const coverage = { first: imbDays[0], last: imbDays.at(-1), days: imbDays.length, missing };
    return {
      data, coverage, curMonth, damDays, byDay, damInternal, damSource, imb, imbDays, commodities, rebased,
      kpi: {
        dam: damLast ? { v: mean(byDay[damLast]), d: damLast, internal: damLastInternal } : null,
        imb: imbDays.length ? { v: imb[imbDays.at(-1)].imb, d: imbDays.at(-1) } : null,
        up: imbDays.length ? { v: imb[imbDays.at(-1)].u1 + imb[imbDays.at(-1)].u2 + imb[imbDays.at(-1)].u3, d: imbDays.at(-1) } : null,
      },
      imbStats: {
        month: mean(inCur.map((d) => imb[d].imb)), year: mean(last12.map((d) => imb[d].imb)),
        lo: last12.length ? Math.min(...last12.map((d) => imb[d].imbMin)) : null, hi: last12.length ? Math.max(...last12.map((d) => imb[d].imbMax)) : null,
      },
      upStats: ['u1', 'u2', 'u3'].map((k) => ({ month: mean(inCur.map((d) => imb[d][k])), year: mean(last12.map((d) => imb[d][k])) })),
    };
  }, [data, t]);
}

const Seg = ({ value, set, opts }) => <div className="seg">{opts.map(([k, l]) => <button key={k} className={value === k ? 'on' : ''} onClick={() => set(k)}>{l}</button>)}</div>;
// Chart resolution: a select, so only the range stays as visible buttons.
const Res = ({ value, set, opts }) => { const t = useT(); return <select className="res" aria-label={t('resolution')} value={value} onChange={(e) => set(e.target.value)}>{opts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>; };
// Secondary chart, closed by default; drawn only once opened.
function Fold({ title, sub, children }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="panel fold" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary><h2>{title}</h2><span className="fine">{sub}</span></summary>
      {open && children}
    </details>
  );
}
const Skeleton = () => <div className="kpis">{[0, 1, 2].map((i) => <div key={i} className="kpi skeleton" />)}</div>;

// view: prices | imbalance | uplift | sources
export default function MarketModule({ view }) {
  const t = useT();
  const [range, setRange] = useState('1Y');
  const m = useMarket(view === 'sources' ? 'all' : view === 'imbalance' || view === 'uplift' ? (range === '1Y' ? '1Y' : 'all') : range);
  if (!m) return <Skeleton />;
  if (view === 'imbalance') return <Imbalance m={m} range={range} setRange={setRange} />;
  if (view === 'uplift') return <Uplift m={m} range={range} setRange={setRange} />;
  if (view === 'sources') return <Sources m={m} />;
  return <Prices m={m} range={range} setRange={setRange} />;
}

function Prices({ m, range, setRange }) {
  const t = useT();
  const damChart = m.damDays.length && {
    labels: m.damDays,
    datasets: [
      { label: '_max', data: m.damDays.map((d) => Math.max(...m.byDay[d])), color: '--power', band: true },
      { label: '_min', data: m.damDays.map((d) => Math.min(...m.byDay[d])), color: '--power', borderWidth: 0 },
      { label: t('dailyAvg'), data: m.damDays.map((d) => mean(m.byDay[d])), color: '--power' },
    ],
  };
  const kpis = [['latestDam', m.kpi.dam], ['latestImb', m.kpi.imb], ['latestUplift', m.kpi.up]];
  const hero = kpis.findIndex((x) => x[1]);
  return (
    <>
      <div className="kpis stagger">
        {kpis.map(([k, item], i) => (
          <div key={k} className={`kpi${i === hero ? ' hero' : ''}`}>
            <div className="k">{t(k)}</div>
            <div className="v">{item ? <Num value={item.v} digits={2} suffix="€/MWh" /> : '-'}</div>
            <div className="d">{item ? item.d : t('noData')}{k === 'latestDam' && item?.internal && <> · {t('internalUse')}</>}</div>
          </div>
        ))}
      </div>

      <div className="row section-head">
        <h2 className="grow">{t('priceCurves')}</h2>
        <Seg value={range} set={setRange} opts={[['1Y', '1Y'], ['3Y', '3Y'], ['all', t('since2020')]]} />
      </div>
      <HowTo help={pricesHelp(t.lang)} />

      <div className="commodities stagger">
        {m.commodities.map((c) => (
          <section key={c.id} className="panel commodity">
            <div className="c-head">
              <h3 className="c-name" title={c.name}><span className="dot" style={{ background: `var(${c.color})` }} />{c.name}</h3>
              <Conf value={c.confidence} />
            </div>
            <div className="big"><Num value={c.value} digits={2} suffix={c.unit} /></div>
            <div className="c-meta">
              <span>{monthName(c.last, t.lang)}</span>
              {c.yoy != null && <span className={`delta ${c.yoy >= 0 ? 'up' : 'down'}`}>{c.yoy >= 0 ? '+' : ''}{c.yoy.toFixed(0)}% {t('yoy')}</span>}
            </div>
            <LineChart plain small unit={c.unit} labels={c.keys} datasets={[{ label: c.name, data: c.keys.map((k) => c.monthly[k]), color: c.color }]} />
          </section>
        ))}
      </div>

      <section className="panel">
        <div className="row panel-head">
          <div className="grow"><h2>{t('dam')}</h2><div className="fine">{m.damSource}</div></div>
          <Conf value={m.damInternal ? 'internal' : m.damDays.length ? t('official') : null} />
        </div>
        {m.damInternal && <p className="notice">{t('internalNote')}</p>}
        {damChart ? <LineChart plain unit="€/MWh" {...damChart} /> : <div className="empty">{t('noData')}</div>}
      </section>

      {m.rebased && <Fold title={t('rebased')} sub={t('rebasedSub')}><LineChart plain unit="100 =" {...m.rebased} /></Fold>}
    </>
  );
}

function Imbalance({ m, range, setRange }) {
  const t = useT();
  const [res, setRes] = useState('w');
  const chart = m.imbDays.length && (res === 'r'
    ? {
      labels: m.imbDays,
      datasets: [
        { label: '_max', data: m.imbDays.map((d) => m.imb[d].imbMax), color: '--imb', band: true },
        { label: '_min', data: m.imbDays.map((d) => m.imb[d].imbMin), color: '--imb', borderWidth: 0 },
        { label: t('dailyAvg'), data: m.imbDays.map((d) => m.imb[d].imb), color: '--imb' },
      ],
    }
    : (() => { const r = resample(m.imbDays, (d) => m.imb[d].imb, res); return { labels: r.labels, datasets: [{ label: t(`res_${res}`), data: r.data, color: '--imb' }] }; })());
  return (
    <>
      <Insight lines={imbalanceInsight(t.lang, m.imbStats, m.curMonth)} help={imbalanceHelp(t.lang)} />
      <section className="panel">
        <div className="row panel-head">
          <div className="grow"><h2>{t('imbTitle')}</h2><div className="fine">{t('imbMeta')}</div></div>
          <Conf value={t('official')} />
        </div>
        <dl className="stats">
          <div><dt>{t('avgMonth')}, {monthName(m.curMonth, t.lang)}</dt><dd><Num value={m.imbStats.month} digits={2} suffix="€/MWh" /></dd></div>
          <div><dt>{t('avg12m')}</dt><dd><Num value={m.imbStats.year} digits={2} suffix="€/MWh" /></dd></div>
          <div><dt>{t('lowQh')}</dt><dd><Num value={m.imbStats.lo} digits={2} suffix="€/MWh" /></dd></div>
          <div><dt>{t('highQh')}</dt><dd><Num value={m.imbStats.hi} digits={2} suffix="€/MWh" /></dd></div>
        </dl>
        <div className="row controls">
          <Res value={res} set={setRes} opts={[['d', t('res_d')], ['w', t('res_w')], ['m', t('res_m')], ['r', t('dailyRange')]]} />
          <span className="grow" />
          <Seg value={range} set={setRange} opts={[['1Y', t('last12')], ['all', t('allPublished')]]} />
        </div>
        {chart ? <LineChart plain unit="€/MWh" {...chart} /> : <div className="empty">{t('noData')}</div>}
        <p className="fine">{coverageLine(t, m.coverage)}</p>
      </section>
    </>
  );
}

function Uplift({ m, range, setRange }) {
  const t = useT();
  const [res, setRes] = useState('w');
  const chart = m.imbDays.length && (() => {
    const rs = ['u1', 'u2', 'u3'].map((k) => resample(m.imbDays, (d) => m.imb[d][k], res));
    return { labels: rs[0].labels, datasets: rs.map((r, i) => ({ label: `${t('account')} ${i + 1}`, data: r.data, color: `--ua${i + 1}` })) };
  })();
  const total = m.upStats.reduce((a, s) => a + (s.month || 0), 0), totalY = m.upStats.reduce((a, s) => a + (s.year || 0), 0);
  const vs = (cur, base) => (cur != null && base ? <span className={`delta ${cur >= base ? 'up' : 'down'}`}>{cur >= base ? '+' : ''}{((cur / base - 1) * 100).toFixed(0)}% {t('vs12m')}</span> : null);
  return (
    <>
      <Insight lines={upliftInsight(t.lang, m.upStats, m.curMonth)} help={upliftHelp(t.lang)} />
      <section className="panel">
        <div className="row panel-head">
          <div className="grow"><h2>{t('upTitle')}</h2><div className="fine">{t('upMeta')}</div></div>
          <Conf value={t('official')} />
        </div>
        <dl className="stats">
          {m.upStats.map((s, i) => <div key={i}><dt>{t('account')} {i + 1}, {monthName(m.curMonth, t.lang)}</dt><dd><Num value={s.month} digits={2} suffix="€/MWh" /> {vs(s.month, s.year)}</dd></div>)}
          <div><dt>{t('total')}</dt><dd><Num value={total} digits={2} suffix="€/MWh" /> {vs(total, totalY)}</dd></div>
        </dl>
        <div className="share" aria-label={t('upShare')}>
          {m.upStats.map((s, i) => <span key={i} style={{ flex: s.month || 0, background: `var(--ua${i + 1})` }} title={`${t('account')} ${i + 1}`} />)}
        </div>
        <div className="row controls">
          <Res value={res} set={setRes} opts={[['d', t('res_d')], ['w', t('res_w')], ['m', t('res_m')]]} />
          <span className="grow" />
          <Seg value={range} set={setRange} opts={[['1Y', t('last12')], ['all', t('allPublished')]]} />
        </div>
        {chart ? <LineChart plain unit="€/MWh" {...chart} /> : <div className="empty">{t('noData')}</div>}
      </section>
    </>
  );
}

function Sources({ m }) {
  const t = useT();
  const rows = [
    { name: `${t('imbShort')}, ${t('account')} 1-3`, source: `${t('ipto')}, IMBABE`, conf: t('official'), updated: when(m.data.status.ipto?.lastOk), note: coverageLine(t, m.coverage) },
    { name: `${t('power')} (${t('hourly')})`, source: m.damSource || 'ENTSO-E Transparency', conf: m.damInternal ? 'internal' : t('official'), updated: when(m.data.status.entsoe?.lastOk), note: m.damInternal ? t('internalNote') : '' },
    ...m.commodities.filter((c) => c.id !== 'power' || !m.damDays.length).map((c) => ({ name: c.name, source: c.source, conf: c.confidence, updated: when(c.updatedAt), note: c.note })),
    ...m.data.series.filter((s) => s.id === 'power' && m.damDays.length).map((s) => ({ name: s.name, source: s.source, conf: s.confidence, updated: when(s.updatedAt), note: s.note })),
  ];
  return (
    <>
      <Insight lines={[t('sourcesIntro')]} help={t('sourcesHelp')} />
      <section className="panel">
        <div className="scroll">
          <table>
            <thead><tr><th>{t('series')}</th><th>{t('source')}</th><th>{t('status')}</th><th>{t('updated')}</th><th>{t('note')}</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.name}><td><b>{r.name}</b></td><td>{r.source}</td><td><Conf value={r.conf} /></td><td className="num">{r.updated}</td><td className="fine">{r.note}</td></tr>)}</tbody>
          </table>
        </div>
        <p className="fine">{t('notAdvice')}</p>
      </section>
      <RecommendedSources />
    </>
  );
}

function coverageLine(t, c) {
  if (!c.days) return t('noData');
  return t.lang === 'el'
    ? `Επίσημα δεδομένα ΑΔΜΗΕ από ${c.first} έως ${c.last}: ${c.days} ημέρες${c.missing ? `, λείπουν ${c.missing} ημέρες στον ΑΔΜΗΕ` : ', χωρίς κενά'}.`
    : `Official IPTO data from ${c.first} to ${c.last}: ${c.days} days${c.missing ? `, ${c.missing} days missing on IPTO's side` : ', no gaps'}.`;
}
