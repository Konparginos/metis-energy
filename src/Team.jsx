import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { UserPlus, Trash } from '@phosphor-icons/react';
import { call, db } from './firebase.js';
import { useT } from './i18n.js';

// Client owners manage their own team: up to SEATS colleagues, each Analyst (can edit) or Viewer (read only).
// The seat limit is enforced in createMember; role changes and removals are guarded by firestore.rules.
const SEATS = 3; // keep in line with SEATS in functions/index.js
const ROLES = ['analyst', 'viewer'];

export default function Team({ cid, uid }) {
  const t = useT();
  const [members, setMembers] = useState(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('analyst');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => onSnapshot(collection(db, 'companies', cid, 'members'),
    (s) => setMembers(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : a.email.localeCompare(b.email)))), () => setMembers([])), [cid]);
  if (!members) return null;
  const used = members.filter((m) => m.role !== 'owner').length;
  const full = used >= SEATS;

  const add = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg('');
    try {
      const { data } = await call('createMember')({ cid, email, role });
      setMsg(data.mail === 'sent' ? `${t('mailSentTo')} ${email}.` : `${t('mailNotSent')}. ${t('setupLink')} ${data.link}`);
      setEmail('');
    } catch (err) { setMsg(err.message); }
    setBusy(false);
  };
  const remove = (m) => window.confirm(t('confirmRemove').replace('{e}', m.email)) && deleteDoc(doc(db, 'companies', cid, 'members', m.id)).catch((e) => setMsg(e.message));

  return (
    <>
      <div className="kpis stagger">
        <div className="kpi hero"><div className="k">{t('seats')}</div><div className="v">{used} / {SEATS}</div><div className="d">{t('seatsHint')}</div></div>
        <div className="kpi"><div className="k">{t('analyst')}</div><div className="v">{members.filter((m) => m.role === 'analyst').length}</div><div className="d">{t('analystHint')}</div></div>
        <div className="kpi"><div className="k">{t('viewer')}</div><div className="v">{members.filter((m) => m.role === 'viewer').length}</div><div className="d">{t('viewerHint')}</div></div>
      </div>
      <section className="panel">
        <h2>{t('members')}</h2>
        <div className="seat-bar" aria-hidden="true">{Array.from({ length: SEATS }, (_, i) => <span key={i} className={i < used ? 'on' : ''} />)}</div>
        <ul className="list">
          {members.map((m) => (
            <li key={m.id} className="row">
              <span className="avatar">{m.email[0].toUpperCase()}</span>
              <span className="grow break">{m.email}{m.id === uid && <span className="fine"> · {t('you')}</span>}</span>
              {m.role === 'owner' ? <span className="badge neutral">{t('owner')}</span> : (
                <>
                  <select className="res" aria-label={t('role')} value={m.role} onChange={(e) => updateDoc(doc(db, 'companies', cid, 'members', m.id), { role: e.target.value }).catch((er) => setMsg(er.message))}>
                    {ROLES.map((r) => <option key={r} value={r}>{t(r)}</option>)}
                  </select>
                  <button className="link danger icon" aria-label={`${t('delete')} ${m.email}`} onClick={() => remove(m)}><Trash size={16} /></button>
                </>
              )}
            </li>
          ))}
        </ul>
        {full ? <p className="notice">{t('seatsFull')}</p> : (
          <form onSubmit={add} className="row" style={{ alignItems: 'end' }}>
            <label className="grow">{t('email')}<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <label>{t('role')}<select value={role} onChange={(e) => setRole(e.target.value)}>{ROLES.map((r) => <option key={r} value={r}>{t(r)}</option>)}</select></label>
            <button className="icon" disabled={busy}><UserPlus size={16} />{busy ? '…' : t('invite')}</button>
          </form>
        )}
        {msg && <p className="notice break" role="status">{msg}</p>}
      </section>
    </>
  );
}
