import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, sendPasswordResetEmail, signOut } from 'firebase/auth';
import { addDoc, collection, doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { SignOut, SignIn, Translate, ShieldCheck } from '@phosphor-icons/react';
import { auth, db } from './firebase.js';
import { LangCtx, MODULES, makeT, useT } from './i18n.js';
import Admin from './Admin.jsx';
import Member from './Member.jsx';
import { Bare, ChromeCtx, LEGAL } from './Shell.jsx';
import { Link, Redirect, usePath } from './router.jsx';

const storedLang = () => { try { return localStorage.getItem('lang') || 'en'; } catch { return 'en'; } };

export default function App() {
  const [lang, setLang] = useState(storedLang);
  const [session, setSession] = useState(undefined); // undefined = loading, null = signed out
  const [settings, setSettings] = useState(undefined);
  const seg = usePath().split('/').filter(Boolean);

  useEffect(() => onAuthStateChanged(auth, async (user) => {
    if (!user) return setSession(null);
    const { claims } = await user.getIdTokenResult(true); // fresh claims after an admin change
    setSession({ user, claims });
  }), []);

  // Unreadable settings fail closed (login required).
  useEffect(() => onSnapshot(doc(db, 'settings', 'app'), (s) => setSettings(s.data() || {}), () => setSettings({ authRequired: true })), []);

  const t = makeT(lang);
  const open = settings?.authRequired !== true;
  const isAdmin = session?.claims.admin || (open && !session?.claims.cid);
  const home = settings?.homeCompany;

  // First admin visit: create Metis' own company (all modules) so admins see the platform as clients do.
  const creating = useRef(false);
  useEffect(() => {
    if (!isAdmin || home || settings === undefined || creating.current) return;
    creating.current = true;
    addDoc(collection(db, 'companies'), { name: 'Metis Energy', home: true, modules: Object.fromEntries(MODULES.map((m) => [m, true])), validUntil: null, createdAt: serverTimestamp() })
      .then((ref) => setDoc(doc(db, 'settings', 'app'), { homeCompany: ref.id }, { merge: true }))
      .catch(() => { creating.current = false; });
  }, [isAdmin, home, settings]);

  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const switchLang = (next) => {
    setLang(next);
    try { localStorage.setItem('lang', next); } catch { /* private mode */ }
  };

  const chrome = {
    banner: open && <p className="notice banner">{t('openMode')}</p>,
    actions: (
      <div className="row">
        <div className="seg lang" role="group" aria-label="Language">
          <Translate size={15} className="lang-icon" />
          {[['en', 'EN'], ['el', 'ΕΛ']].map(([k, l]) => <button key={k} className={lang === k ? 'on' : ''} aria-pressed={lang === k} onClick={() => switchLang(k)}>{l}</button>)}
        </div>
        {session && <button className="ghost icon" onClick={() => signOut(auth)}><SignOut size={16} />{t('signOut')}</button>}
        {!session && open && (seg[0] === 'login'
          ? <Link to="/admin" className="btn-ghost"><ShieldCheck size={16} />{t('admin')}</Link>
          : <Link to="/login" className="btn-ghost"><SignIn size={16} />{t('signIn')}</Link>)}
      </div>
    ),
  };

  let view;
  if (LEGAL.includes(seg[0])) view = <Bare><ContentPage page={seg[0]} /></Bare>;
  else if (session === undefined || settings === undefined) view = null;
  else if (seg[0] === 'login') view = session ? <Redirect to="/" /> : <Bare><Login /></Bare>;
  else if (!session && !open) view = <Redirect to="/login" />;
  else if (isAdmin && seg[0] === 'admin') view = <Admin seg={seg.slice(1)} />;
  else if (isAdmin) view = !seg[0] ? <Redirect to="/prices" /> : home ? <Member cid={home} role="owner" uid={session?.user.uid ?? 'open-mode'} slug={seg[0]} adminLink /> : null;
  else if (session.claims.cid) view = !seg[0] || seg[0] === 'admin' ? <Redirect to="/prices" /> : <Member cid={session.claims.cid} role={session.claims.role} uid={session.user.uid} slug={seg[0]} />;
  else view = <Bare><p className="notice">{t('noCompany')}</p></Bare>;

  return (
    <LangCtx.Provider value={t}>
      <ChromeCtx.Provider value={chrome}>{view}</ChromeCtx.Provider>
    </LangCtx.Provider>
  );
}

function ContentPage({ page }) {
  const t = useT();
  const [c, setC] = useState(undefined);
  useEffect(() => { getDoc(doc(db, 'content', page)).then((s) => setC(s.data() || null)); }, [page]);
  if (c === undefined) return null;
  const text = c && (t.lang === 'en' ? c.en || c.el : c.el || c.en);
  return (
    <article className="card article">
      <h1>{t(page)}</h1>
      <div style={{ marginTop: 16 }}>{text ? <div className="pre">{text}</div> : <p className="notice">{t('noText')}</p>}</div>
    </article>
  );
}

function Login() {
  const t = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');

  const submit = (e) => {
    e.preventDefault();
    signInWithEmailAndPassword(auth, email, password).catch(() => setMsg(t('badLogin')));
  };
  const forgot = () => email && sendPasswordResetEmail(auth, email).finally(() => setMsg(t('resetSent')));

  return (
    <form className="card login" onSubmit={submit}>
      <h1>{t('signIn')}</h1>
      <p className="sub">{t('loginSub')}</p>
      <label>{t('email')}<input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label>{t('password')}<input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      <button>{t('signIn')}</button>
      <button type="button" className="link" onClick={forgot}>{t('forgot')}</button>
      {msg && <p className="notice" role="status">{msg}</p>}
    </form>
  );
}
