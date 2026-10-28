import { createContext, useContext } from 'react';
import { LockSimple } from '@phosphor-icons/react';
import { useT } from './i18n.js';
import Logo from './Logo.jsx';
import { Link } from './router.jsx';

// App-wide top-bar actions (language, sign in/out) and the test-mode banner, provided by App.
export const ChromeCtx = createContext({ actions: null, banner: null });
export const LEGAL = ['privacy', 'terms', 'disclaimer'];

// nav: [{ key, label, icon, locked } | { group: 'label' } | 'sep']
export default function Shell({ nav, active, onNav, title, sub, children }) {
  const t = useT();
  const { actions, banner } = useContext(ChromeCtx);
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand"><Logo /></div>
        <nav>
          {nav.map((n, i) => (n === 'sep' ? <div key={i} className="nav-sep" /> : n.group ? <div key={i} className="nav-group">{n.group}</div> : (
            <button key={n.key} className={`nav-item${n.key === active ? ' on' : ''}`} onClick={() => onNav(n.key)} aria-current={n.key === active ? 'page' : undefined}>
              <n.icon size={18} weight={n.key === active ? 'fill' : 'regular'} />
              <span>{n.label}</span>
              {n.locked && <LockSimple size={14} className="lock" aria-label={t('locked')} />}
            </button>
          )))}
        </nav>
        <div className="side-foot">
          {LEGAL.map((p) => <Link key={p} to={`/${p}`}>{t(p)}</Link>)}
          <span className="fine">© Metis Energy</span>
        </div>
      </aside>
      <div className="main">
        {banner}
        <header className="topbar">
          <div className="grow">
            <h1>{title}</h1>
            {sub && <div className="sub">{sub}</div>}
          </div>
          {actions}
        </header>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}

// Centered layout for login and legal pages.
export function Bare({ children }) {
  const t = useT();
  const { actions, banner } = useContext(ChromeCtx);
  return (
    <div className="bare">
      <div>
        {banner}
        <div className="bare-top"><Link to="/" className="brand" style={{ textDecoration: 'none', padding: 0 }}><Logo /></Link><span className="grow" />{actions}</div>
      </div>
      <main className="bare-main">{children}</main>
      <footer className="bare-foot">
        <span className="fine">© Metis Energy</span>
        {LEGAL.map((p) => <Link key={p} to={`/${p}`}>{t(p)}</Link>)}
      </footer>
    </div>
  );
}
