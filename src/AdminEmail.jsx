import { useEffect, useState } from 'react';
import { collection, deleteField, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { call, db } from './firebase.js';
import { loc, useT } from './i18n.js';
import { DEFAULTS, SAMPLE, TEMPLATE_VARS, render, templateDefault } from '../functions/lib/templates.js';

// Admin → Email: sender, alert recipients, signature, per-email switches, template texts, header banner,
// test sends and the send log (as in energymeets). Stored in config/email; Cloud Functions read it on every send.
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

      <Templates cfg={cfg} test={test} />
      <Banner url={cfg.headerBannerUrl} />

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

// Edit the subject and HTML body of each email, with {{token}} placeholders and a live preview on sample data.
// Saved versions live in config/email.templates.{key}; "Reset" goes back to the text in functions/lib/templates.js.
function Templates({ cfg, test }) {
  const t = useT();
  const [key, setKey] = useState('invite');
  const saved = cfg.templates?.[key];
  const [draft, setDraft] = useState(null);
  useEffect(() => { setDraft({ ...templateDefault(key), ...saved }); }, [key, saved?.subject, saved?.body]);
  if (!draft) return null;

  const preview = render(key, SAMPLE[key], { ...cfg, templates: { [key]: draft } });
  const save = () => setDoc(doc(db, 'config', 'email'), { templates: { [key]: { subject: draft.subject.trim(), body: draft.body.trim() } }, updatedAt: serverTimestamp() }, { merge: true });
  const reset = () => window.confirm(t('confirmReset')) && updateDoc(doc(db, 'config', 'email'), { [`templates.${key}`]: deleteField() });

  return (
    <details className="panel fold">
      <summary><h2>{t('mailTemplates')}</h2><span className="fine">{t('mailTemplatesSub')}</span></summary>
      <div className="row">
        <select value={key} onChange={(e) => setKey(e.target.value)} aria-label={t('mailTemplates')}>
          {Object.keys(TEMPLATE_VARS).map((k) => <option key={k} value={k}>{t(`mail_${k}`)}{cfg.templates?.[k] ? ` (${t('tplEdited')})` : ''}</option>)}
        </select>
        <span className="fine">{t('tplTokens')}: {TEMPLATE_VARS[key].map((v) => `{{${v}}}`).join(' ')}</span>
      </div>
      <div className="tpl-edit">
        <div>
          <label>{t('subject')}<input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} /></label>
          <label>{t('tplBody')}<textarea className="code" rows="16" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} /></label>
          <div className="row">
            <button type="button" onClick={save}>{t('save')}</button>
            <button type="button" className="ghost" onClick={() => test(key)}>{t('sendTest')}</button>
            {saved && <button type="button" className="link danger" onClick={reset}>{t('resetDefault')}</button>}
          </div>
        </div>
        <figure className="tpl-preview">
          <figcaption className="fine"><b>{preview.subject}</b></figcaption>
          <iframe title={t('mailPreview')} srcDoc={preview.html} sandbox="" />
        </figure>
      </div>
    </details>
  );
}

// Header banner for every email, uploaded through the uploadMailBanner function (Firebase Storage).
function Banner({ url }) {
  const t = useT();
  const [msg, setMsg] = useState('');
  const upload = (file) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return setMsg(t('bannerTooBig'));
    const reader = new FileReader();
    reader.onload = async () => {
      setMsg('…');
      try {
        await call('uploadMailBanner')({ base64: String(reader.result).split(',')[1], contentType: file.type });
        setMsg(t('saved'));
      } catch (err) {
        setMsg(err.message);
      }
    };
    reader.readAsDataURL(file);
  };
  return (
    <details className="panel fold">
      <summary><h2>{t('mailBanner')}</h2><span className="fine">{t('bannerHint')}</span></summary>
      {url ? <img className="banner-preview" src={url} alt={t('mailBanner')} /> : <p className="fine">{t('noBanner')}</p>}
      <div className="row">
        <label className="btn-ghost">{t('uploadBanner')}<input type="file" className="vh" accept="image/png,image/jpeg,image/gif,image/webp" onChange={(e) => upload(e.target.files[0])} /></label>
        {url && <button type="button" className="link danger" onClick={() => window.confirm(t('confirmBanner')) && updateDoc(doc(db, 'config', 'email'), { headerBannerUrl: deleteField() })}>{t('removeBanner')}</button>}
      </div>
      {msg && <p className="notice break" role="status">{msg}</p>}
    </details>
  );
}
