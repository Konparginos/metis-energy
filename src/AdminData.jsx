import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { call, db } from './firebase.js';
import { parseSeriesCSV } from '../functions/lib/cost.js';
import { useT, loc } from './i18n.js';
import { RecommendedSources } from './Catalogue.jsx';

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const when = (ts) => (ts?.toDate ? ts.toDate().toLocaleString(loc(), { dateStyle: 'short', timeStyle: 'short' }) : null);

function useDoc(...path) {
  const [d, setD] = useState(null); // null until loaded
  useEffect(() => onSnapshot(doc(db, ...path), (s) => setD(s.data() || {})), [path.join('/')]);
  return d;
}

function Status({ s }) {
  const t = useT();
  if (!s.lastRun) return <span className="badge muted">{t('never')}</span>;
  return (
    <>
      <span className={`badge ${s.ok ? 'ok' : 'bad'}`}>{s.ok ? t('ok') : t('failed')}</span>{' '}
      <span className="fine">{t('lastRun')}: {when(s.lastRun)}</span>
      {s.error && <p className="notice break">{s.error}</p>}
      {s.ok && s.summary && <p className="fine break">{JSON.stringify(s.summary)}</p>}
    </>
  );
}

function FeedCard({ feed, title, children, defaultFrom }) {
  const t = useT();
  const s = useDoc('market', feed) || {};
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(today());
  const [msg, setMsg] = useState('');
  const run = async (f, tt) => {
    setMsg('…');
    try { setMsg(JSON.stringify((await call('runFeed')({ feed, from: f, to: tt })).data)); } catch (e) { setMsg(e.message); }
  };
  return (
    <section className="panel">
      <h3>{title}</h3>
      <Status s={s} />
      {children}
      <div className="row">
        <button onClick={() => run(daysAgo(21), today())}>{t('runNow')}</button>
        {feed !== 'series' && (
          <>
            <label>{t('from')}<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label>{t('to')}<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
            <button onClick={() => run(from, to)}>{t('backfill')}</button>
          </>
        )}
      </div>
      {msg && <p className="fine break">{msg}</p>}
    </section>
  );
}

function SecretInput({ id, flag, label }) {
  const t = useT();
  const cfg = useDoc('config', 'app');
  const [v, setV] = useState('');
  const save = async (e) => {
    e.preventDefault();
    await setDoc(doc(db, 'secrets', id), { value: v.trim() });
    await setDoc(doc(db, 'config', 'app'), { secretsSet: { [flag]: true } }, { merge: true });
    setV('');
  };
  return (
    <form onSubmit={save} className="row">
      <label className="grow">{label || t('token')}<input type="password" autoComplete="off" required value={v} onChange={(e) => setV(e.target.value)} /></label>
      <button>{t('save')}</button>
      <span className="fine">{cfg?.secretsSet?.[flag] ? t('tokenSet') : t('tokenMissing')}</span>
    </form>
  );
}

const EMPTY = { id: '', name: '', unit: '€/MWh', freq: 'monthly', licence: 'display', source: '', url: '' };

function SeriesManager() {
  const t = useT();
  const [list, setList] = useState([]);
  const [f, setF] = useState(EMPTY);
  const [csv, setCsv] = useState('');
  const [header, setHeader] = useState('');
  const [replace, setReplace] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => onSnapshot(collection(db, 'series'), (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() })))), []);

  const edit = (s) => { setF({ ...EMPTY, ...s, id: s.id }); setCsv(''); setMsg(''); };
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault();
    setMsg('…');
    try {
      const { id, name, unit, freq, licence, source, url } = f;
      const r = await call('saveSeriesData')({ id: id.trim().toLowerCase(), meta: { name, unit, freq, licence, source, url: url.trim() }, points: parseSeriesCSV(csv), replace });
      if (header.trim()) await setDoc(doc(db, 'secrets', `series_${id.trim().toLowerCase()}`), { value: header.trim() });
      setMsg(`${t('saved')} ${JSON.stringify(r.data)}`); setCsv(''); setHeader('');
    } catch (err) { setMsg(err.message); }
  };

  return (
    <section className="panel">
      <h3>{t('series')}</h3>
      <div className="scroll">
        <table>
          <thead><tr><th>Id</th><th>{t('name')}</th><th>{t('unit')}</th><th>{t('licence')}</th><th className="num">{t('points')}</th><th>{t('latest')}</th><th>URL</th><th /></tr></thead>
          <tbody>
            {list.map((s) => {
              const keys = Object.keys(s.points || {}).sort();
              return (
                <tr key={s.id}>
                  <td>{s.id}</td><td>{s.name}</td><td>{s.unit}</td><td>{s.licence}</td><td className="num">{keys.length}</td>
                  <td>{keys.at(-1)}</td><td>{s.url ? (s.feed ? <span className={`badge ${s.feed.ok ? 'ok' : 'bad'}`} title={s.feed.error || ''}>{s.feed.ok ? t('ok') : t('failed')}</span> : '✓') : ''}</td>
                  <td><button className="link" onClick={() => edit(s)}>✎</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <form onSubmit={save}>
        <div className="grid2">
          <label>{t('seriesId')}<input required pattern="[a-z0-9_\-]{2,40}" value={f.id} onChange={set('id')} /></label>
          <label>{t('name')}<input value={f.name} onChange={set('name')} /></label>
          <label>{t('unit')}<input value={f.unit} onChange={set('unit')} /></label>
          <label>{t('freq')}<select value={f.freq} onChange={set('freq')}><option value="monthly">{t('monthly')}</option><option value="daily">{t('daily')}</option></select></label>
          <label>{t('licence')}<select value={f.licence} onChange={set('licence')}>
            <option value="display">{t('licDisplay')}</option><option value="derived">{t('licDerived')}</option><option value="internal">{t('licInternal')}</option>
          </select></label>
          <label>{t('source')}<input value={f.source} onChange={set('source')} /></label>
        </div>
        <label>{t('feedUrl')}<input type="url" value={f.url} onChange={set('url')} /></label>
        <label>{t('feedHeader')}<input type="password" autoComplete="off" value={header} onChange={(e) => setHeader(e.target.value)} /></label>
        <label>{t('pasteCsv')}<textarea value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={'2026-01;62.1\n2026-02;58.4'} /></label>
        <input type="file" accept=".csv,.txt" onChange={async (e) => e.target.files[0] && setCsv(await e.target.files[0].text())} />
        <label className="check"><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />{t('replaceAll')}</label>
        <div className="row"><button>{t('save')}</button><button type="button" className="link" onClick={() => edit({})}>{t('create')} …</button></div>
        {msg && <p className="fine break">{msg}</p>}
      </form>
    </section>
  );
}

export function DataSources() {
  const t = useT();
  return (
    <>
      <FeedCard feed="ipto" title={t('feedIpto')} defaultFrom="2025-01-01" />
      <FeedCard feed="henex" title={t('feedHenex')} defaultFrom={daysAgo(7)} />
      <FeedCard feed="entsoe" title={t('feedEntsoe')} defaultFrom="2025-01-01">
        <SecretInput id="entsoe" flag="entsoe" />
      </FeedCard>
      <FeedCard feed="eex" title={t('feedEex')} defaultFrom="2025-01-01">
        <SecretInput id="eex" flag="eex" label={t('eexToken')} />
      </FeedCard>
      <FeedCard feed="series" title={t('feedSeries')} />
      <SeriesManager />
      <RecommendedSources />
    </>
  );
}

const COLS = 'ABCDEFGHIJ';

// Dropdown over the series the data feeds maintain (EEX, URL feeds, manual uploads).
function SeriesSelect({ list, value, onChange }) {
  const t = useT();
  const known = list.some((s) => s.id === value);
  return (
    <select value={value} onChange={onChange}>
      {!value && <option value="">{t('pickSeries')}</option>}
      {value && !known && <option value={value}>{value} ({t('seriesMissing')})</option>}
      {list.map((s) => <option key={s.id} value={s.id}>{s.name ? `${s.name} (${s.id})` : s.id}{s.unit ? ` · ${s.unit}` : ''}</option>)}
    </select>
  );
}

function TemplatePreview({ f }) {
  const t = useT();
  const ts = +f.tsCol || 1, val = +f.valCol || 2, first = +f.firstRow || 1;
  const width = Math.max(ts, val), cols = [...COLS.slice(0, width)];
  const rows = Array.from({ length: first - 1 + 3 }, (_, i) => i + 1);
  const cell = (r, c) => {
    if (r < first) return r === first - 1 ? (c === ts ? t('tplTime') : c === val ? f.unit : '') : '';
    const h = r - first;
    if (c === ts) return `01/01/2026 ${String(h).padStart(2, '0')}:00`;
    if (c === val) return f.unit === 'MWh' ? (0.42 + h * 0.03).toFixed(3) : String(420 + h * 30);
    return '';
  };
  return (
    <>
      <h3>{t('tplPreview')}</h3>
      <p className="fine">{t('tplPreviewSub')} {t('tplSheetName')} {f.sheet || 1} (.xlsx).</p>
      <div className="scroll">
        <table>
          <thead><tr><th />{cols.map((c, i) => <th key={c}>{c}{i + 1 !== ts && i + 1 !== val ? ` (${t('tplNotRead')})` : ''}</th>)}</tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r} className={r < first ? 'fine' : ''}>
                <th>{r}</th>
                {cols.map((_, i) => <td key={i} className={i + 1 === val && r >= first ? 'num' : ''}>{cell(r, i + 1)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function FormulaTemplate() {
  const t = useT();
  const cfg = useDoc('config', 'app');
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState('');
  const [series, setSeries] = useState([]);
  useEffect(() => onSnapshot(collection(db, 'series'), (s) => setSeries(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.id.localeCompare(b.id)))), []);
  useEffect(() => {
    if (!f && cfg) setF({ adminFee: cfg.adminFee ?? 0.2, gasSeries: cfg.gasSeries ?? 'ttf', powerSeries: cfg.powerSeries ?? 'power', ...{ sheet: 1, firstRow: 2, tsCol: 1, valCol: 2, unit: 'kWh', ...(cfg.template || {}) } });
  }, [cfg]);
  if (!f) return null;
  const num = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault();
    const n = (k, d) => (Number.isFinite(+f[k]) ? +f[k] : d);
    await setDoc(doc(db, 'config', 'app'), {
      adminFee: n('adminFee', 0.2), gasSeries: f.gasSeries.trim(), powerSeries: f.powerSeries.trim(),
      template: { sheet: n('sheet', 1), firstRow: n('firstRow', 2), tsCol: n('tsCol', 1), valCol: n('valCol', 2), unit: f.unit },
    }, { merge: true });
    setMsg(t('saved'));
  };
  return (
    <form className="panel" onSubmit={save}>
      <p className="fine">Electricity €/MWh = hourly DAM + Uplift 1 + Uplift 2 + Uplift 3 + regulator admin fee · Gas €/MWh = monthly average of the gas series</p>
      <div className="grid2">
        <label>{t('adminFee')}<input type="number" step="0.01" min="0" value={f.adminFee} onChange={num('adminFee')} /></label>
        <label>{t('gasSeries')}<SeriesSelect list={series} value={f.gasSeries} onChange={num('gasSeries')} /></label>
        <label>{t('powerSeries')}<SeriesSelect list={series} value={f.powerSeries} onChange={num('powerSeries')} /></label>
      </div>
      <h3>{t('template')}</h3>
      <div className="grid2">
        <label>{t('tplSheet')}<input type="number" min="1" value={f.sheet} onChange={num('sheet')} /></label>
        <label>{t('tplFirstRow')}<input type="number" min="1" value={f.firstRow} onChange={num('firstRow')} /></label>
        <label>{t('tplTs')}<select value={f.tsCol} onChange={num('tsCol')}>{[...COLS].map((c, i) => <option key={c} value={i + 1}>{c}</option>)}</select></label>
        <label>{t('tplVal')}<select value={f.valCol} onChange={num('valCol')}>{[...COLS].map((c, i) => <option key={c} value={i + 1}>{c}</option>)}</select></label>
        <label>{t('tplUnit')}<select value={f.unit} onChange={num('unit')}><option>kWh</option><option>MWh</option></select></label>
      </div>
      <TemplatePreview f={f} />
      <button>{t('save')}</button> {msg && <span className="fine">{msg}</span>}
    </form>
  );
}
