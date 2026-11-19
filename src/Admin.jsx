import { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, Timestamp, updateDoc, where } from 'firebase/firestore';
import { ArrowLeft, Buildings, Database, Function as Formula, Signpost, ChatsCircle, Article, EnvelopeSimple, GearSix, Eye, Trash, Sparkle } from '@phosphor-icons/react';
import { auth, call, db } from './firebase.js';
import { MODULES, ROLES, useT } from './i18n.js';
import Shell from './Shell.jsx';
import Member from './Member.jsx';
import { ADMIN_PATHS, go, keyOf } from './router.jsx';
import { DataSources, FormulaTemplate } from './AdminData.jsx';
import { AdvisoryInbox, Signals, Texts } from './AdminContent.jsx';
import EmailSettings from './AdminEmail.jsx';
import { Contracts, Crm, Invoices, Trials, daysLeft } from './AdminCrm.jsx';

const TABS = [['tabClients', Buildings], ['tabTrials', Sparkle], ['tabData', Database], ['tabFormula', Formula], ['tabSignals', Signpost], ['tabAdvisory', ChatsCircle], ['tabContent', Article], ['tabEmail', EnvelopeSimple], ['tabSettings', GearSix]];
// The invite email carries the setup link; the link is shown here only when the email did not go out.
const inviteResult = (t, email, data) => (data.mail === 'sent' ? `${t('mailSentTo')} ${email}.` : `${t('mailNotSent')}. ${t('setupLink')} ${data.link}`);
const active = (c) => !(c.validUntil && c.validUntil.toDate() < new Date()) && MODULES.some((m) => c.modules?.[m]);

// seg: path segments after "admin", e.g. ['clients', cid] or ['preview', cid, 'prices'].
export default function Admin({ seg = [] }) {
  const t = useT();
  const tab = keyOf(ADMIN_PATHS, seg[0]) || 'tabClients';
  const selected = tab === 'tabClients' ? seg[1] : null;
  const setSelected = (id) => go(id ? `/admin/clients/${id}` : '/admin/clients');
  const [companies, setCompanies] = useState([]);
  const [name, setName] = useState('');
  const [newTrials, setNewTrials] = useState(0);
  useEffect(() => onSnapshot(query(collection(db, 'trialRequests'), where('status', '==', 'new')), (s) => setNewTrials(s.size), () => {}), []);

  useEffect(() => onSnapshot(query(collection(db, 'companies'), orderBy('name')),
    (s) => setCompanies(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => !c.home))), []);

  const create = async (e) => {
    e.preventDefault();
    const ref = await addDoc(collection(db, 'companies'), {
      name: name.trim(), modules: Object.fromEntries(MODULES.map((m) => [m, false])), validUntil: null, createdAt: serverTimestamp(),
    });
    setName('');
    setSelected(ref.id);
  };

  const company = companies.find((c) => c.id === selected);

  if (seg[0] === 'preview' && seg[1]) {
    return <Member cid={seg[1]} role="owner" uid={auth.currentUser?.uid ?? 'open-mode'} base={`/admin/preview/${seg[1]}`} slug={seg[2]} onBack={() => go(`/admin/clients/${seg[1]}`)} />;
  }

  return (
    <Shell nav={[{ key: 'platform', label: t('toPlatform'), icon: ArrowLeft }, 'sep', { group: t('admin') }, ...TABS.map(([key, icon]) => ({ key, label: key === 'tabTrials' && newTrials ? `${t(key)} (${newTrials})` : t(key), icon }))]} active={tab} onNav={(k) => go(k === 'platform' ? '/prices' : `/admin/${ADMIN_PATHS[k]}`)} title={t(tab)} sub={t('admin')}>
      {tab === 'tabData' && <DataSources />}
      {tab === 'tabFormula' && <FormulaTemplate />}
      {tab === 'tabContent' && <Texts />}
      {tab === 'tabSignals' && <Signals />}
      {tab === 'tabAdvisory' && <AdvisoryInbox companies={companies} />}
      {tab === 'tabEmail' && <EmailSettings />}
      {tab === 'tabSettings' && <Settings />}
      {tab === 'tabTrials' && <Trials onOpen={setSelected} />}
      {tab === 'tabClients' && (
        <>
          <div className="kpis">
            <div className="kpi"><div className="k">{t('companies')}</div><div className="v">{companies.length}</div></div>
            <div className="kpi"><div className="k">{t('activeSubs')}</div><div className="v">{companies.filter(active).length}</div></div>
            <div className="kpi"><div className="k">{t('onTrial')}</div><div className="v">{companies.filter((c) => c.trial && daysLeft(c) > 0).length}</div></div>
          </div>
          <div className="split">
            <section className="panel">
              <h2>{t('companies')}</h2>
              <nav className="list">
                {companies.map((c) => (
                  <button key={c.id} className={`nav-item${c.id === selected ? ' on' : ''}`} onClick={() => setSelected(c.id)}>
                    <span className="grow">{c.name}</span>
                    {c.trial ? <span className={`badge ${daysLeft(c) > 0 ? 'warnb' : 'muted'}`}>{t('trial')} · {Math.max(0, daysLeft(c))}{t('dShort')}</span>
                      : <span className={`badge ${active(c) ? 'ok' : 'muted'}`}>{MODULES.filter((m) => c.modules?.[m]).length}/{MODULES.length}</span>}
                  </button>
                ))}
              </nav>
              <form onSubmit={create}>
                <label>{t('newCompany')}<input required value={name} onChange={(e) => setName(e.target.value)} /></label>
                <button>{t('create')}</button>
              </form>
            </section>
            {company ? <CompanyPanel key={company.id} company={company} onPreview={() => go(`/admin/preview/${company.id}/prices`)} onDeleted={() => setSelected(null)} />
              : <div className="empty">{t('pickCompany')}</div>}
          </div>
        </>
      )}
    </Shell>
  );
}

function Settings() {
  const t = useT();
  const [settings, setSettings] = useState({});
  const [admins, setAdmins] = useState([]);
  const [email, setEmail] = useState('');
  const [result, setResult] = useState('');

  useEffect(() => onSnapshot(doc(db, 'settings', 'app'), (s) => setSettings(s.data() || {})), []);
  useEffect(() => onSnapshot(collection(db, 'admins'), (s) => setAdmins(s.docs.map((d) => ({ id: d.id, ...d.data() })))), []);

  const toggle = (on) => {
    if (on && !admins.length) return setResult(t('needAdmin'));
    setDoc(doc(db, 'settings', 'app'), { authRequired: on }, { merge: true });
  };

  const add = async (e) => {
    e.preventDefault();
    setResult('…');
    try {
      const { data } = await call('createAdmin')({ email });
      setResult(inviteResult(t, email, data));
      setEmail('');
    } catch (err) {
      setResult(err.message);
    }
  };

  return (
    <section className="panel">
      <label className="check">
        <input type="checkbox" checked={settings.authRequired === true} onChange={(e) => toggle(e.target.checked)} />
        {t('loginRequired')}
      </label>
      <h3>{t('admins')}</h3>
      <ul className="list">{admins.map((a) => <li key={a.id}>{a.email}</li>)}</ul>
      <form onSubmit={add} className="row" style={{ alignItems: 'end' }}>
        <label className="grow">{t('email')}<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <button>{t('addAdmin')}</button>
      </form>
      {result && <p className="notice break">{result}</p>}
    </section>
  );
}

const SUBTABS = ['account', 'crm', 'contracts', 'invoices'];
function CompanyPanel({ company, onPreview, onDeleted }) {
  const t = useT();
  const [sub, setSub] = useState('account');
  return (
    <section className="panel">
      <div className="row">
        <h2 className="grow">{company.name}</h2>
        {company.trial && <span className="badge warnb">{t('trial')} · {Math.max(0, daysLeft(company))}{t('dShort')}</span>}
        <button className="ghost icon" onClick={onPreview}><Eye size={16} />{t('preview')}</button>
      </div>
      <div className="seg" role="tablist">{SUBTABS.map((k) => <button key={k} role="tab" aria-selected={sub === k} className={sub === k ? 'on' : ''} onClick={() => setSub(k)}>{t(`sub_${k}`)}</button>)}</div>
      <div className="enter" key={sub}>
        {sub === 'account' && <Account company={company} onDeleted={onDeleted} />}
        {sub === 'crm' && <Crm company={company} />}
        {sub === 'contracts' && <Contracts company={company} />}
        {sub === 'invoices' && <Invoices company={company} />}
      </div>
    </section>
  );
}

function Account({ company, onDeleted }) {
  const t = useT();
  const ref = doc(db, 'companies', company.id);
  const [members, setMembers] = useState([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('analyst');
  const [result, setResult] = useState('');

  useEffect(() => onSnapshot(collection(ref, 'members'),
    (s) => setMembers(s.docs.map((d) => ({ id: d.id, ...d.data() })))), [company.id]);

  const until = company.validUntil?.toDate().toISOString().slice(0, 10) ?? '';
  const setUntil = (v) => updateDoc(ref, { validUntil: v ? Timestamp.fromDate(new Date(`${v}T23:59:59`)) : null });

  const add = async (e) => {
    e.preventDefault();
    setResult('…');
    try {
      const { data } = await call('createMember')({ cid: company.id, email, role });
      setResult(inviteResult(t, email, data));
      setEmail('');
    } catch (err) {
      setResult(err.message);
    }
  };

  return (
    <>
      {company.trial && (
        <p className="notice row"><span className="grow">{t('trialNote')}</span>
          <button className="ghost" onClick={() => updateDoc(ref, { trial: false, 'crm.stage': 'client' })}>{t('convertClient')}</button></p>
      )}
      <fieldset>
        <legend>{t('modules')}</legend>
        {MODULES.map((m) => (
          <label key={m} className="check">
            <input type="checkbox" checked={company.modules?.[m] === true} onChange={(e) => updateDoc(ref, { [`modules.${m}`]: e.target.checked })} />
            {t(m)}
          </label>
        ))}
        <button type="button" className="link" onClick={() => updateDoc(ref, { modules: Object.fromEntries(MODULES.map((m) => [m, true])) })}>{t('bundle')}</button>
      </fieldset>
      <label>{t('validUntil')}<input type="date" value={until} onChange={(e) => setUntil(e.target.value)} /></label>

      <h3>{t('members')} <span className="fine">· {t('seatsUsed').replace('{n}', members.filter((m) => m.role !== 'owner').length).replace('{max}', 3)}</span></h3>
      <ul className="list">
        {members.map((m) => (
          <li key={m.id} className="row">
            <span className="grow">{m.email}</span>
            <select value={m.role} onChange={(e) => updateDoc(doc(ref, 'members', m.id), { role: e.target.value })}>
              {ROLES.map((r) => <option key={r} value={r}>{t(r)}</option>)}
            </select>
            <button className="link danger" onClick={() => deleteDoc(doc(ref, 'members', m.id))}>{t('delete')}</button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="row" style={{ alignItems: 'end' }}>
        <label className="grow">{t('email')}<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>{t('role')}<select value={role} onChange={(e) => setRole(e.target.value)}>
          {ROLES.map((r) => <option key={r} value={r}>{t(r)}</option>)}
        </select></label>
        <button>{t('addMember')}</button>
      </form>
      {result && <p className="notice break">{result}</p>}
      <div className="row danger-zone">
        <button className="link danger icon" onClick={async () => {
          if (!window.confirm(t('confirmDelete'))) return;
          try { await call('deleteCompany')({ cid: company.id }); onDeleted(); } catch (e) { setResult(e.message); }
        }}><Trash size={16} />{t('deleteCompany')}</button>
      </div>
    </>
  );
}
