import { useEffect, useState } from 'react';
import { addDoc, collection, collectionGroup, deleteDoc, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase.js';
import { useT } from './i18n.js';
import { SignalCard, Thread } from './Modules.jsx';

export const PAGES = ['privacy', 'terms', 'disclaimer'];

export function Texts() {
  const t = useT();
  const [page, setPage] = useState('privacy');
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { setF(null); setMsg(''); getDoc(doc(db, 'content', page)).then((s) => setF({ el: '', en: '', ...s.data() })); }, [page]);
  const save = async (e) => {
    e.preventDefault();
    await setDoc(doc(db, 'content', page), { el: f.el, en: f.en, updatedAt: serverTimestamp() });
    setMsg(t('saved'));
  };
  return (
    <form className="panel" onSubmit={save}>
      <div className="row">{PAGES.map((p) => <button type="button" key={p} className={p === page ? 'chip on' : 'chip'} onClick={() => setPage(p)}>{t(p)}</button>)}</div>
      {f && (
        <>
          <label>{t('textEl')}<textarea rows="14" value={f.el} onChange={(e) => setF({ ...f, el: e.target.value })} /></label>
          <label>{t('textEn')}<textarea rows="14" value={f.en} onChange={(e) => setF({ ...f, en: e.target.value })} /></label>
          <button>{t('publish')}</button> {msg && <span className="fine">{msg}</span>}
        </>
      )}
    </form>
  );
}

const NEW_SIGNAL = { commodity: 'power', signal: 'neutral', horizon: '', date: new Date().toISOString().slice(0, 10), rationaleEl: '', rationaleEn: '' };

export function Signals() {
  const t = useT();
  const [list, setList] = useState([]);
  const [f, setF] = useState(NEW_SIGNAL);
  useEffect(() => onSnapshot(query(collection(db, 'signals'), orderBy('date', 'desc')), (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() })))), []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const publish = async (e) => {
    e.preventDefault();
    await addDoc(collection(db, 'signals'), { ...f, createdAt: serverTimestamp() });
    setF(NEW_SIGNAL);
  };
  return (
    <>
      <form className="panel" onSubmit={publish}>
        <div className="grid2">
          <label>{t('commodity')}<select value={f.commodity} onChange={set('commodity')}>{['power', 'gas', 'carbon'].map((c) => <option key={c} value={c}>{t(c)}</option>)}</select></label>
          <label>{t('signal')}<select value={f.signal} onChange={set('signal')}>{['buy', 'wait', 'neutral'].map((c) => <option key={c} value={c}>{t(c)}</option>)}</select></label>
          <label>{t('horizon')}<input required placeholder="Q1 2027" value={f.horizon} onChange={set('horizon')} /></label>
          <label>{t('date')}<input type="date" required value={f.date} onChange={set('date')} /></label>
        </div>
        <label>{t('rationaleEl')}<textarea required value={f.rationaleEl} onChange={set('rationaleEl')} /></label>
        <label>{t('rationaleEn')}<textarea value={f.rationaleEn} onChange={set('rationaleEn')} /></label>
        <button>{t('publish')}</button>
      </form>
      {list.map((s) => (
        <SignalCard key={s.id} s={s}>
          <button className="link danger" onClick={() => deleteDoc(doc(db, 'signals', s.id))}>{t('delete')}</button>
        </SignalCard>
      ))}
    </>
  );
}

// All advisory requests across clients, newest activity first.
export function AdvisoryInbox({ companies }) {
  const t = useT();
  const [list, setList] = useState([]);
  useEffect(() => onSnapshot(collectionGroup(db, 'requests'), (s) => setList(
    s.docs.map((d) => ({ id: d.id, path: d.ref.path.split('/'), ...d.data() }))
      .sort((a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0)),
  )), []);
  const name = (cid) => companies.find((c) => c.id === cid)?.name ?? cid;
  if (!list.length) return <div className="empty">{t('noRequests')}</div>;
  return list.map((r) => (
    <Thread key={r.path.join('/')} r={r} path={r.path} side="metis" canReply heading={name(r.path[1])}
      actions={<button className="link" onClick={() => updateDoc(doc(db, ...r.path), { status: r.status === 'closed' ? 'open' : 'closed' })}>{t(r.status === 'closed' ? 'reopen' : 'close')}</button>} />
  ));
}
