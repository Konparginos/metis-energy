import { useEffect, useState } from 'react';
import { collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore';
import { call, db } from './firebase.js';
import { loc, useT } from './i18n.js';
import { DEFAULTS } from '../functions/lib/templates.js';

// Admin → Email: sender, alert recipients, signature, per-email switches, test sends and the send log
// (as in energymeets). Stored in config/email; Cloud Functions read it on every send.
const KEYS = Object.keys(DEFAULTS.enabled);
const FIELDS = ['fromName', 'fromEmail', 'replyTo', 'adminEmail'];
const BADGE = { sent: 'ok', error: 'bad', disabled: 'muted' };

export default function EmailSettings() {
  const t = useT();
  const [cfg, setCfg] = useState(null);
  const [logs, setLogs] = useState([]);
  const [msg, setMsg] = useState('');

  useEffect(() => onSnapshot(doc(db, 'config', 'email'), (s) => {
    const d = s.data() || {};
    setCfg({ ...DEFAULTS, ...d, enabled: { ...DEFAULTS.enabled, ...(d.enabled || {}) } });
  }), []);
  useEffect(() => onSnapshot(query(collection(db, 'mailLogs'), orderBy('createdAt', 'desc'), limit(25)),
    (s) => setLogs(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setLogs([])), []);
  if (!cfg) return null;

  const set = (k) => (e) => setCfg({ ...cfg, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault();
    await setDoc(doc(db, 'config', 'email'), { ...Object.fromEntries(FIELDS.map((k) => [k, cfg[k].trim()])), signature: cfg.signature.trim(), updatedAt: serverTimestamp() }, { merge: true });
    setMsg(t('saved'));
  };
  const toggle = (k, on) => setDoc(doc(db, 'config', 'email'), { enabled: { ...cfg.enabled, [k]: on }, updatedAt: serverTimestamp() }, { merge: true });
  const test = async (templateKey) => {
    setMsg('…');
    try {
      const { data } = await call('sendTestEmail')({ templateKey });
      setMsg(data.status === 'sent' ? `${t('mailSentTo')} ${data.to}` : data.provider === 'none' ? t('noProvider') : `${t('mailNotSent')}: ${data.error || data.status}`);
    } catch (err) {
      setMsg(err.message);
    }
  };

  return (
    <>
      <form className="panel" onSubmit={save}>
        <h2>{t('mailSender')}</h2>
        <div className="grid2">
          {FIELDS.map((k) => <label key={k}>{t(k)}<input value={cfg[k]} onChange={set(k)} required={k !== 'replyTo'} /></label>)}
        </div>
        <label>{t('signature')}<textarea rows="2" style={{ minHeight: 0 }} value={cfg.signature} onChange={set('signature')} /></label>
        <div className="row"><button>{t('save')}</button><button type="button" className="ghost" onClick={() => test('test')}>{t('sendTest')}</button></div>
      </form>
      {msg && <p className="notice break" role="status">{msg}</p>}

      <section className="panel">
        <h2>{t('mailAuto')}</h2>
        <ul className="list">
          {KEYS.map((k) => (
            <li key={k} className="row">
              <label className="check grow"><input type="checkbox" checked={cfg.enabled[k] !== false} onChange={(e) => toggle(k, e.target.checked)} />{t(`mail_${k}`)}</label>
              <button type="button" className="link" onClick={() => test(k)}>{t('sendTest')}</button>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>{t('mailLog')}</h2>
        {!logs.length ? <p className="fine">{t('noMail')}</p> : (
          <div className="scroll">
            <table>
              <thead><tr><th>{t('date')}</th><th>{t('email')}</th><th>{t('subject')}</th><th>{t('status')}</th></tr></thead>
              <tbody>{logs.map((l) => (
                <tr key={l.id}>
                  <td className="num">{l.createdAt?.toDate().toLocaleString(loc(), { dateStyle: 'short', timeStyle: 'short' }) ?? '-'}</td>
                  <td className="break">{l.to}</td>
                  <td>{l.subject}</td>
                  <td><span className={`badge ${BADGE[l.status] || 'warnb'}`} title={l.error || ''}>{l.status}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
