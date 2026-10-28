import { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { ArrowLeft, Buildings, Database, Function as Formula, Signpost, ChatsCircle, Article, GearSix, Eye, Trash } from '@phosphor-icons/react';
import { auth, call, db } from './firebase.js';
import { MODULES, ROLES, useT } from './i18n.js';
import Shell from './Shell.jsx';
import Member from './Member.jsx';
import { ADMIN_PATHS, go, keyOf } from './router.jsx';
import { DataSources, FormulaTemplate } from './AdminData.jsx';
import { AdvisoryInbox, Signals, Texts } from './AdminContent.jsx';

const TABS = [['tabClients', Buildings], ['tabData', Database], ['tabFormula', Formula], ['tabSignals', Signpost], ['tabAdvisory', ChatsCircle], ['tabContent', Article], ['tabSettings', GearSix]];
const active = (c) => !(c.validUntil && c.validUntil.toDate() < new Date()) && MODULES.some((m) => c.modules?.[m]);

// seg: path segments after "admin", e.g. ['clients', cid] or ['preview', cid, 'prices'].
export default function Admin({ seg = [] }) {
  const t = useT();
  const tab = keyOf(ADMIN_PATHS, seg[0]) || 'tabClients';
  const selected = tab === 'tabClients' ? seg[1] : null;
  const setSelected = (id) => go(id ? `/admin/clients/${id}` : '/admin/clients');
  const [companies, setCompanies] = useState([]);
  const [name, setName] = useState('');

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
    <Shell nav={[{ key: 'platform', label: t('toPlatform'), icon: ArrowLeft }, 'sep', { group: t('admin') }, ...TABS.map(([key, icon]) => ({ key, label: t(key), icon }))]} active={tab} onNav={(k) => go(k === 'platform' ? '/prices' : `/admin/${ADMIN_PATHS[k]}`)} title={t(tab)} sub={t('admin')}>
      {tab === 'tabData' && <DataSources />}
      {tab === 'tabFormula' && <FormulaTemplate />}
      {tab === 'tabContent' && <Texts />}
      {tab === 'tabSignals' && <Signals />}
      {tab === 'tabAdvisory' && <AdvisoryInbox companies={companies} />}
      {tab === 'tabSettings' && <Settings />}
      {tab === 'tabClients' && (
        <>
          <div className="kpis">
            <div className="kpi"><div className="k">{t('companies')}</div><div className="v">{companies.length}</div></div>
            <div className="kpi"><div className="k">{t('activeSubs')}</div><div className="v">{companies.filter(active).length}</div></div>
            <div className="kpi"><div className="k">{t('bundles')}</div><div className="v">{companies.filter((c) => MODULES.every((m) => c.modules?.[m])).length}</div></div>
          </div>
          <div className="split">
            <section className="panel">
              <h2>{t('companies')}</h2>
              <nav className="list">
                {companies.map((c) => (
                  <button key={c.id} className={`nav-item${c.id === selected ? ' on' : ''}`} onClick={() => setSelected(c.id)}>
                    <span className="grow">{c.name}</span>
                    <span className={`badge ${active(c) ? 'ok' : 'muted'}`}>{MODULES.filter((m) => c.modules?.[m]).length}/{MODULES.length}</span>
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
      setResult(`${t('setupLink')} ${data.link}`);
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

function CompanyPanel({ company, onPreview, onDeleted }) {
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
      setResult(`${t('setupLink')} ${data.link}`);
      setEmail('');
    } catch (err) {
      setResult(err.message);
    }
  };

  return (
    <section className="panel">
      <div className="row">
        <h2 className="grow">{company.name}</h2>
        <button className="ghost icon" onClick={onPreview}><Eye size={16} />{t('preview')}</button>
        <button className="link danger icon" onClick={async () => {
          if (!window.confirm(t('confirmDelete'))) return;
          try { await call('deleteCompany')({ cid: company.id }); onDeleted(); } catch (e) { setResult(e.message); }
        }}><Trash size={16} />{t('deleteCompany')}</button>
      </div>
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

      <h3>{t('members')}</h3>
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
    </section>
  );
}
