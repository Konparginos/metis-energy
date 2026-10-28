import { useEffect, useState } from 'react';
import { addDoc, arrayUnion, collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { auth, db } from './firebase.js';
import { useT, loc } from './i18n.js';

// Buy-or-Wait: signals published by Metis in Admin → Buy or wait.
// ponytail: signals are set by hand; automate here once Metis delivers the methodology.
export function SignalModule() {
  const t = useT();
  const [signals, setSignals] = useState(null);
  useEffect(() => onSnapshot(query(collection(db, 'signals'), orderBy('date', 'desc'), limit(30)),
    (s) => setSignals(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setSignals([])), []);
  if (!signals) return null;
  if (!signals.length) return <div className="empty">{t('noSignals')}</div>;
  return signals.map((s) => <SignalCard key={s.id} s={s} />);
}

export function SignalCard({ s, children }) {
  const t = useT();
  return (
    <div className="panel inset">
      <div className="row">
        <b className="grow">{t(s.commodity) ?? s.commodity}</b>
        <span className={`badge ${s.signal}`}>{t(s.signal)}</span>
      </div>
      <p className="fine">{s.date} · {t('horizon')}: {s.horizon}</p>
      <p className="pre">{t.lang === 'en' ? s.rationaleEn || s.rationaleEl : s.rationaleEl || s.rationaleEn}</p>
      {children}
    </div>
  );
}

// Advisory: client opens a request, both sides add messages.
export function AdvisoryModule({ cid, canEdit }) {
  const t = useT();
  const [requests, setRequests] = useState([]);
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');

  useEffect(() => onSnapshot(query(collection(db, 'companies', cid, 'requests'), orderBy('updatedAt', 'desc')),
    (s) => setRequests(s.docs.map((d) => ({ id: d.id, ...d.data() })))), [cid]);

  const create = async (e) => {
    e.preventDefault();
    const u = auth.currentUser;
    await addDoc(collection(db, 'companies', cid, 'requests'), {
      title: subject, status: 'open', createdBy: u?.uid ?? 'open-mode', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      thread: [{ side: 'client', name: u?.email ?? '-', text, at: new Date().toISOString() }],
    });
    setSubject(''); setText('');
  };

  return (
    <>
      {canEdit && (
        <form className="panel" onSubmit={create}>
          <h3>{t('newRequest')}</h3>
          <label>{t('subject')}<input required value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
          <label>{t('message')}<textarea required value={text} onChange={(e) => setText(e.target.value)} /></label>
          <button>{t('send')}</button>
        </form>
      )}
      {!requests.length && <div className="empty">{t('noRequests')}</div>}
      {requests.map((r) => <Thread key={r.id} r={r} path={['companies', cid, 'requests', r.id]} side="client" canReply={canEdit && r.status !== 'closed'} />)}
    </>
  );
}

export function Thread({ r, path, side, canReply, heading, actions }) {
  const t = useT();
  const [text, setText] = useState('');
  const send = async (e) => {
    e.preventDefault();
    const name = side === 'metis' ? t('metisTeam') : auth.currentUser?.email ?? '-';
    await updateDoc(doc(db, ...path), { thread: arrayUnion({ side, name, text, at: new Date().toISOString() }), updatedAt: serverTimestamp() });
    setText('');
  };
  return (
    <details className="panel inset">
      <summary>
        {heading && <span className="fine">{heading} · </span>}
        <b>{r.title}</b> <span className={`badge ${r.status === 'closed' ? 'muted' : 'ok'}`}>{t(r.status === 'closed' ? 'closed' : 'open')}</span>
      </summary>
      {r.thread.map((m, i) => (
        <div key={i} className={`msg ${m.side}`}>
          <small>{m.name} · {new Date(m.at).toLocaleString(loc(), { dateStyle: 'short', timeStyle: 'short' })}</small>
          <div className="pre">{m.text}</div>
        </div>
      ))}
      {canReply && (
        <form onSubmit={send}>
          <label>{t('reply')}<textarea required value={text} onChange={(e) => setText(e.target.value)} /></label>
          <button>{t('send')}</button>
        </form>
      )}
      {actions}
    </details>
  );
}
