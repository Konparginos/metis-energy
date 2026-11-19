import { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Check, X, Trash, ArrowSquareOut } from '@phosphor-icons/react';
import { auth, call, db } from './firebase.js';
import { useT, loc } from './i18n.js';

// Mini CRM for Metis admins: client card, notes, contracts and invoices (companies/{cid}/notes|contracts|invoices),
// plus the 14-day trial requests from the landing page.

export const STAGES = ['lead', 'trial', 'client', 'paused', 'churned'];
const today = () => new Date().toISOString().slice(0, 10);
const eur = (v) => (Number.isFinite(+v) && v !== '' ? (+v).toLocaleString(loc(), { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }) : '-');
const when = (ts) => (ts?.toDate ? ts.toDate().toLocaleString(loc(), { dateStyle: 'medium', timeStyle: 'short' }) : '');
export const daysLeft = (c) => (c.validUntil ? Math.ceil((c.validUntil.toDate() - Date.now()) / 864e5) : null);

function useSub(cid, name, order) {
  const [rows, setRows] = useState([]);
  useEffect(() => onSnapshot(query(collection(db, 'companies', cid, name), orderBy(order, 'desc')),
    (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setRows([])), [cid, name, order]);
  return rows;
}

// Client card (contact details and stage, stored on the company as `crm`) and a timeline of notes.
export function Crm({ company }) {
  const t = useT();
  const ref = doc(db, 'companies', company.id);
  const [f, setF] = useState({ contact: '', email: '', phone: '', vat: '', address: '', stage: company.trial ? 'trial' : 'client', ...company.crm });
  const [saved, setSaved] = useState(false);
  const [text, setText] = useState('');
  const notes = useSub(company.id, 'notes', 'at');
  const set = (k) => (e) => { setSaved(false); setF({ ...f, [k]: e.target.value }); };
  const save = async (e) => { e.preventDefault(); await updateDoc(ref, { crm: f }); setSaved(true); };
  const add = async (e) => {
    e.preventDefault();
    await addDoc(collection(ref, 'notes'), { text: text.trim(), by: auth.currentUser?.email || 'Metis', at: serverTimestamp() });
    setText('');
  };
  return (
    <>
      <form onSubmit={save}>
        <div className="grid2">
          <label>{t('crmContact')}<input value={f.contact} onChange={set('contact')} /></label>
          <label>{t('crmStage')}<select value={f.stage} onChange={set('stage')}>{STAGES.map((s) => <option key={s} value={s}>{t(`stage_${s}`)}</option>)}</select></label>
          <label>{t('email')}<input type="email" value={f.email} onChange={set('email')} /></label>
          <label>{t('crmPhone')}<input type="tel" value={f.phone} onChange={set('phone')} /></label>
          <label>{t('crmVat')}<input value={f.vat} onChange={set('vat')} /></label>
          <label>{t('crmAddress')}<input value={f.address} onChange={set('address')} /></label>
        </div>
        <div className="row"><button>{t('save')}</button>{saved && <span className="fine" role="status">{t('saved')}</span>}</div>
      </form>

      <h3>{t('crmNotes')}</h3>
      <form onSubmit={add} className="note-form">
        <textarea required placeholder={t('crmNotePh')} value={text} onChange={(e) => setText(e.target.value)} />
        <button disabled={!text.trim()}>{t('crmAddNote')}</button>
      </form>
      {!notes.length ? <p className="fine">{t('crmNoNotes')}</p> : (
        <ol className="timeline">
          {notes.map((n) => (
            <li key={n.id}>
              <div className="row"><small className="grow">{n.by} · {when(n.at)}</small>
                <button className="link danger icon" aria-label={t('delete')} onClick={() => window.confirm(t('confirmDeleteNote')) && deleteDoc(doc(ref, 'notes', n.id))}><Trash size={14} /></button></div>
              <p className="pre">{n.text}</p>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

// Generic list + add form for contracts and invoices. fields: [key, labelKey, inputType]
function Records({ company, name, order, fields, statuses, empty, row, total }) {
  const t = useT();
  const ref = doc(db, 'companies', company.id);
  const rows = useSub(company.id, name, order);
  const blank = Object.fromEntries(fields.map(([k]) => [k, '']));
  const [f, setF] = useState(blank);
  const add = async (e) => {
    e.preventDefault();
    await addDoc(collection(ref, name), { ...f, amount: f.amount === '' ? null : +f.amount, status: statuses[0], createdAt: serverTimestamp() });
    setF(blank);
  };
  return (
    <>
      {total && rows.length > 0 && <div className="stats">{total(rows)}</div>}
      {!rows.length ? <p className="fine">{t(empty)}</p> : (
        <div className="scroll"><table>
          <thead><tr>{fields.map(([k, l]) => <th key={k} className={k === 'amount' ? 'r' : ''}>{t(l)}</th>)}<th>{t('status')}</th><th /></tr></thead>
          <tbody>{rows.map((x) => (
            <tr key={x.id}>
              {fields.map(([k]) => <td key={k} className={k === 'amount' ? 'r num' : ''}>{k === 'amount' ? eur(x.amount) : k === 'link' ? (x.link ? <a href={x.link} target="_blank" rel="noreferrer" aria-label={t('crmOpen')}><ArrowSquareOut size={16} /></a> : '') : x[k] || '-'}</td>)}
              <td>
                <select className="res" value={x.status} onChange={(e) => updateDoc(doc(ref, name, x.id), { status: e.target.value })}>{statuses.map((s) => <option key={s} value={s}>{t(`st_${s}`)}</option>)}</select>
                {row?.(x)}
              </td>
              <td><button className="link danger icon" aria-label={t('delete')} onClick={() => window.confirm(t('confirmDeleteRow')) && deleteDoc(doc(ref, name, x.id))}><Trash size={14} /></button></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      <form onSubmit={add} className="rec-form">
        {fields.map(([k, l, type]) => (
          <label key={k}>{t(l)}<input type={type} required={k === fields[0][0]} step={type === 'number' ? '0.01' : undefined} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>
        ))}
        <button>{t('crmAdd')}</button>
      </form>
    </>
  );
}

export const Contracts = ({ company }) => (
  <Records company={company} name="contracts" order="createdAt" empty="crmNoContracts" statuses={['draft', 'active', 'ended']}
    fields={[['title', 'crmTitle', 'text'], ['start', 'from', 'date'], ['end', 'to', 'date'], ['amount', 'crmValue', 'number'], ['link', 'crmLink', 'url']]} />
);

export function Invoices({ company }) {
  const t = useT();
  const sum = (rs) => rs.reduce((s, x) => s + (+x.amount || 0), 0);
  return (
    <Records company={company} name="invoices" order="createdAt" empty="crmNoInvoices" statuses={['unpaid', 'paid', 'void']}
      fields={[['number', 'crmNumber', 'text'], ['issued', 'crmIssued', 'date'], ['due', 'crmDue', 'date'], ['amount', 'crmAmount', 'number'], ['link', 'crmLink', 'url']]}
      row={(x) => x.status === 'unpaid' && x.due && x.due < today() && <span className="badge bad">{t('crmOverdue')}</span>}
      total={(rs) => (
        <>
          <div><dt>{t('crmInvoiced')}</dt><dd>{eur(sum(rs.filter((x) => x.status !== 'void')))}</dd></div>
          <div><dt>{t('crmOutstanding')}</dt><dd>{eur(sum(rs.filter((x) => x.status === 'unpaid')))}</dd></div>
          <div><dt>{t('crmOverdue')}</dt><dd>{eur(sum(rs.filter((x) => x.status === 'unpaid' && x.due && x.due < today())))}</dd></div>
        </>
      )} />
  );
}

// Trial requests from the landing page: approve (creates the company and its owner) or decline.
export function Trials({ onOpen }) {
  const t = useT();
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => onSnapshot(query(collection(db, 'trialRequests'), orderBy('createdAt', 'desc')),
    (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setRows([])), []);
  if (!rows) return null;
  const approve = async (r) => {
    if (!window.confirm(t('confirmApprove').replace('{c}', r.company))) return;
    setBusy(r.id); setMsg('');
    try {
      const { data } = await call('approveTrial')({ id: r.id });
      setMsg(data.mail === 'sent' ? `${t('mailSentTo')} ${r.email}.` : `${t('mailNotSent')}. ${t('setupLink')} ${data.link}`);
    } catch (e) { setMsg(e.message); }
    setBusy('');
  };
  const decline = (r) => window.confirm(t('confirmDecline')) && updateDoc(doc(db, 'trialRequests', r.id), { status: 'declined', decidedAt: serverTimestamp(), decidedBy: auth.currentUser?.email || 'open-mode' });
  if (!rows.length) return <div className="empty">{t('noTrials')}</div>;
  return (
    <>
      {msg && <p className="notice break" role="status">{msg}</p>}
      <div className="stagger">
        {rows.map((r) => (
          <article key={r.id} className="panel trial-req">
            <div className="row">
              <h2 className="grow">{r.company}</h2>
              <span className={`badge ${r.status === 'approved' ? 'ok' : r.status === 'declined' ? 'muted' : 'warnb'}`}>{t(`tr_${r.status}`)}</span>
            </div>
            <p className="fine">{r.name} · <a href={`mailto:${r.email}`}>{r.email}</a>{r.phone && ` · ${r.phone}`} · {when(r.createdAt)}</p>
            {r.message && <p className="pre msg">{r.message}</p>}
            <div className="row">
              {r.status === 'new' && <>
                <button className="icon" disabled={busy === r.id} onClick={() => approve(r)}><Check size={16} />{busy === r.id ? '…' : t('approveTrial')}</button>
                <button className="ghost icon" onClick={() => decline(r)}><X size={16} />{t('decline')}</button>
              </>}
              {r.cid && <button className="link" onClick={() => onOpen(r.cid)}>{t('openClient')}</button>}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
