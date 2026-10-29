import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { UploadSimple, Trash } from '@phosphor-icons/react';
import { call, db } from './firebase.js';
import { aggregate, parseNum, splitLine } from '../functions/lib/cost.js';
import { useT, loc } from './i18n.js';
import LineChart from './Chart.jsx';
import { Num } from './motion.jsx';
import { Insight, profileInsight } from './insights.jsx';
import { Conf } from './MarketModule.jsx';

const fmt = (v, d = 0) => (v == null ? '-' : v.toLocaleString(loc(), { minimumFractionDigits: d, maximumFractionDigits: d }));

// Column layout comes from Admin → Formula & template (config/app.template); defaults to A = timestamp, B = value.
async function readRows(file, tpl) {
  const ts = (tpl.tsCol || 1) - 1, val = (tpl.valCol || 2) - 1, first = (tpl.firstRow || 2) - 1;
  const factor = tpl.unit === 'MWh' ? 1000 : 1;
  let rows;
  if (/\.xlsx?$/i.test(file.name)) {
    const { default: readXlsxFile } = await import('read-excel-file');
    rows = await readXlsxFile(file, { sheet: tpl.sheet || 1 });
  } else {
    rows = (await file.text()).split(/\r?\n/).map(splitLine);
  }
  return rows.slice(first).filter((r) => r && r[ts] != null).map((r) => {
    const v = parseNum(r[val]);
    return [typeof r[ts] === 'string' ? r[ts].replace(/"/g, '') : r[ts], typeof v === 'number' ? v * factor : v];
  });
}

// A year of hourly readings for a two-shift plant, as in the prototype (Excel serial timestamps, 2025).
function sampleRows(kind) {
  const out = [], s0 = 45658; // 1 Jan 2025, a Wednesday
  for (let i = 0; i < 8760; i++) {
    const doy = Math.floor(i / 24), hh = i % 24, dow = (3 + doy) % 7, wk = dow >= 1 && dow <= 5, sat = dow === 6, shut = doy >= 222 && doy < 236;
    const nz = 1 + 0.04 * Math.sin(i * 12.9898) * Math.cos(i * 0.7);
    let v;
    if (kind === 'electricity') v = (260 + (wk && hh >= 6 && hh < 22 ? 540 * (hh < 14 ? 1 : 0.85) : sat && hh >= 6 && hh < 14 ? 260 : 0)) * (1 + 0.14 * Math.cos(2 * Math.PI * (doy - 200) / 365)) * nz * (shut ? 0.4 : 1);
    else v = (140 + 320 * Math.max(0, Math.cos(2 * Math.PI * (doy - 15) / 365)) + (wk && hh >= 6 && hh < 22 ? 880 : sat && hh >= 6 && hh < 14 ? 400 : 0)) * nz * (shut ? 0.3 : 1);
    out.push([s0 + i / 24, Math.round(v * 10) / 10]);
  }
  return out;
}

function downloadTemplate() {
  const lines = ['timestamp;kWh'];
  for (let h = 0; h < 48; h++) lines.push(`2026-01-${String(1 + Math.floor(h / 24)).padStart(2, '0')} ${String(h % 24).padStart(2, '0')}:00;`);
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/csv' })), download: 'metis-consumption-template.csv' });
  a.click();
  URL.revokeObjectURL(a.href);
}

// Prices a profile that is not saved (sample or fresh upload) on the server; nothing is stored.
function useDraftPrice(cid, p) {
  const [state, setState] = useState({});
  useEffect(() => {
    if (!p) return;
    let live = true;
    setState({ busy: true });
    call('priceDraft')({ cid, profile: { kind: p.kind, monthly: p.monthly, hourly: p.hourly } })
      .then((r) => live && setState({ r: r.data }), (e) => live && setState({ err: e.message }));
    return () => { live = false; };
  }, [cid, p]);
  return state;
}

export default function CostModule({ cid, uid, canEdit }) {
  const t = useT();
  const [profiles, setProfiles] = useState(null);
  const [tpl, setTpl] = useState({});
  const [kind, setKind] = useState('electricity');
  const [draft, setDraft] = useState(null);
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');
  const [over, setOver] = useState(false);

  useEffect(() => onSnapshot(doc(db, 'config', 'app'), (s) => setTpl(s.data()?.template || {})), []);
  useEffect(() => onSnapshot(
    query(collection(db, 'companies', cid, 'profiles'), orderBy('createdAt', 'desc')),
    (s) => setProfiles(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
  ), [cid]);

  const load = (rows, label, k = kind) => {
    const a = aggregate(rows);
    setMsg(a ? '' : t('noRows'));
    setDraft(a && { ...a, kind: k });
    setName(label);
  };
  const onFile = async (f) => {
    if (!f) return;
    try { load(await readRows(f, tpl), f.name.replace(/\.\w+$/, '')); } catch (err) { setMsg(`${t('noRows')} (${err.message})`); }
  };
  const save = async () => {
    await addDoc(collection(db, 'companies', cid, 'profiles'), { name, ...draft, createdBy: uid, createdAt: serverTimestamp() });
    setDraft(null);
  };

  return (
    <>
      {canEdit ? (
        <section className="panel">
          <div className="seg" style={{ marginBottom: 12 }}>{['electricity', 'gas'].map((k) => <button type="button" key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{t(k)}</button>)}</div>
          <label
            className={`drop${over ? ' over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); onFile(e.dataTransfer.files[0]); }}
          >
            <UploadSimple size={26} className="drop-icon" />
            <span><b>{t('chooseFile')}</b> {t('orDrop')}</span>
            <span className="fine">{t('dropHint')} <button type="button" className="link" onClick={(e) => { e.preventDefault(); downloadTemplate(); }}>{t('tplLink')}</button></span>
            <input type="file" className="vh" accept=".csv,.txt,.xlsx" onChange={(e) => onFile(e.target.files[0])} />
          </label>
          {msg && <p className="notice" style={{ marginTop: 12 }}>{msg}</p>}
          {draft && (
            <div className="enter">
              <Stats p={draft} />
              <ProfileCharts p={draft} />
              <DraftResult cid={cid} p={draft} />
              <div className="row" style={{ alignItems: 'end' }}>
                <label className="grow">{t('profileName')}<input value={name} onChange={(e) => setName(e.target.value)} /></label>
                <button onClick={save} disabled={!name}>{t('save')}</button>
              </div>
            </div>
          )}
        </section>
      ) : <p className="fine">{t('viewOnly')}</p>}

      {profiles && !profiles.length && !draft && <SampleProfile cid={cid} />}

      {profiles?.length > 0 && <h2 style={{ marginTop: 8 }}>{t('profiles')}</h2>}
      <div className="stagger">{profiles?.map((p) => <Profile key={p.id} p={p} cid={cid} canEdit={canEdit} />)}</div>
    </>
  );
}

// Shown until the company saves its first profile: the prototype's sample plant, electricity and gas, priced.
function SampleProfile({ cid }) {
  const t = useT();
  const elec = useMemo(() => ({ ...aggregate(sampleRows('electricity')), kind: 'electricity' }), []);
  const gas = useMemo(() => ({ ...aggregate(sampleRows('gas')), kind: 'gas' }), []);
  return (
    <section className="panel enter">
      <div className="row panel-head">
        <div className="grow"><h2>{t('sample')}</h2><div className="fine">{t('sampleNote')}</div></div>
        <span className="badge warnb">{t('sample')}</span>
      </div>
      <h3>{t('electricity')}</h3>
      <Stats p={elec} />
      <ProfileCharts p={elec} />
      <DraftResult cid={cid} p={elec} />
      <h3>{t('gas')}</h3>
      <Stats p={gas} />
      <DraftResult cid={cid} p={gas} />
    </section>
  );
}

function DraftResult({ cid, p }) {
  const { r, err, busy } = useDraftPrice(cid, p);
  if (busy) return <div className="kpis"><div className="kpi skeleton" /><div className="kpi skeleton" /><div className="kpi skeleton" /></div>;
  if (err) return <p className="notice">{err}</p>;
  return r ? <Result p={p} r={r} /> : null;
}

function ProfileCharts({ p }) {
  const t = useT();
  const charts = useMemo(() => {
    const months = Object.keys(p.monthly || {}).sort();
    const wd = Array(24).fill(0), wdN = Array(24).fill(0), we = Array(24).fill(0), weN = Array(24).fill(0);
    p.hourly?.kwh.forEach((v, i) => {
      if (v == null) return;
      const d = new Date((p.hourly.start + i) * 36e5), h = d.getUTCHours(), w = d.getUTCDay() % 6 === 0;
      if (w) { we[h] += v; weN[h]++; } else { wd[h] += v; wdN[h]++; }
    });
    return {
      monthly: { labels: months, datasets: [{ label: 'MWh', data: months.map((m) => p.monthly[m] / 1000), color: p.kind === 'gas' ? '--gas' : '--power' }] },
      day: {
        labels: Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`),
        datasets: [
          { label: t('weekday'), data: wd.map((v, h) => (wdN[h] ? v / wdN[h] : null)), color: '--power' },
          { label: t('weekend'), data: we.map((v, h) => (weN[h] ? v / weN[h] : null)), color: '--gas' },
        ],
      },
    };
  }, [p, t]);
  return (
    <div className="charts2">
      <LineChart type="bar" title={t('monthlyUse')} unit="MWh" {...charts.monthly} />
      <LineChart title={t('avgDay')} unit="kWh/h" {...charts.day} />
    </div>
  );
}

function Profile({ p, cid, canEdit }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const price = async () => {
    setBusy(true); setErr('');
    try { await call('priceProfile')({ cid, pid: p.id }); } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  return (
    <details className="panel profile" open={!!p.result}>
      <summary>
        <b className="grow">{p.name}</b>
        <span className="badge neutral">{t(p.kind || 'electricity')}</span>
        <span className="fine num">{p.from} → {p.to}</span>
      </summary>
      <Stats p={p} />
      <ProfileCharts p={p} />
      <div className="row">
        <button onClick={price} disabled={busy}>{busy ? t('calculating') : t('calc')}</button>
        {canEdit && <button className="link danger icon" onClick={() => deleteDoc(doc(db, 'companies', cid, 'profiles', p.id))}><Trash size={16} />{t('delete')}</button>}
      </div>
      {err && <p className="notice" style={{ marginTop: 12 }}>{err}</p>}
      {p.result && <Result p={p} r={p.result} />}
    </details>
  );
}

function Result({ p, r }) {
  const t = useT();
  const months = Object.keys(r.byMonth || {}).sort();
  const official = <Conf value={t('official')} />;
  return (
    <div className="enter">
      <div style={{ marginTop: 14 }}><Insight lines={profileInsight(t.lang, p, r)} /></div>
      <div className="kpis stagger">
        <div className="kpi hero"><div className="k">{t('costTotal')}</div><div className="v"><Num value={r.cost} prefix="€ " /></div></div>
        <div className="kpi"><div className="k">{t('perMWh')}</div><div className="v"><Num value={r.perMWh} digits={2} /></div></div>
        <div className="kpi"><div className="k">MWh</div><div className="v"><Num value={r.mwh} /></div></div>
      </div>
      <div className="scroll">
        <table>
          <thead><tr><th>{t('component')}</th><th>{t('priceBasis')}</th><th className="num">{t('perMWh')}</th><th className="num">€</th></tr></thead>
          <tbody>
            {r.perMWhParts ? (
              [['Day-ahead', 'dam', r.dam, r.damInternal ? <Conf value="internal" /> : official],
                ['Uplift 1', 'u1', r.u[0], official], ['Uplift 2', 'u2', r.u[1], official], ['Uplift 3', 'u3', r.u[2], official],
                [t('fee'), 'fee', (r.perMWhParts.fee || 0) * r.mwh, <span className="badge neutral">{t('fixed')}</span>]]
                .map(([label, k, eur, basis]) => <tr key={k}><td>{label}</td><td>{basis}</td><td className="num">{fmt(r.perMWhParts[k], 2)}</td><td className="num">{fmt(eur)}</td></tr>)
            ) : <tr><td>{r.series}</td><td><Conf value={r.confidence} /></td><td className="num">{fmt(r.perMWh, 2)}</td><td className="num">{fmt(r.cost)}</td></tr>}
            <tr className="total"><th colSpan="2">{t('costTotal')} ({fmt(r.mwh)} MWh)</th><th className="num">{fmt(r.perMWh, 2)}</th><th className="num">{fmt(r.cost)}</th></tr>
          </tbody>
        </table>
      </div>
      {months.length > 0 && <LineChart type="bar" title={t('monthlyCost')} unit="€" labels={months} datasets={[{ label: '€', data: months.map((m) => r.byMonth[m]), color: '--accent' }]} />}
      {r.uncoveredMWh > 0.5 && <p className="fine">{t('uncovered')}: {fmt(r.uncoveredMWh)} MWh</p>}
      {r.fallbackHours > 0 && <p className="fine">{t('fallbackNote')}: {fmt(r.fallbackHours)} h</p>}
      <p className="fine">{t('formulaNote')} · {t('notAdvice')}</p>
    </div>
  );
}

function Stats({ p }) {
  const t = useT();
  return (
    <dl className="stats">
      <div><dt>{t('total')}</dt><dd><Num value={p.totalKWh / 1000} suffix="MWh" /></dd></div>
      <div><dt>{t('peak')}</dt><dd><Num value={p.peakKW} suffix="kW" /></dd></div>
      <div><dt>{t('loadFactor')}</dt><dd><Num value={p.loadFactor * 100} suffix="%" /></dd></div>
      <div><dt>{t('daytime')}</dt><dd><Num value={p.solarShare * 100} suffix="%" /></dd></div>
      <div><dt>{t('period')}</dt><dd>{p.from} → {p.to}</dd></div>
      <div><dt>{t('readings')}</dt><dd><Num value={p.readings} /> ({p.stepMin}′)</dd></div>
    </dl>
  );
}
