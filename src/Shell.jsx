import { createContext, useContext, useState } from 'react';
import { LockSimple, List, X } from '@phosphor-icons/react';
import { useT } from './i18n.js';
import Logo from './Logo.jsx';
import { Link } from './router.jsx';

// App-wide top-bar actions (language, sign in/out) and the test-mode banner, provided by App.
export const ChromeCtx = createContext({ actions: null, banner: null, lang: null });
export const LEGAL = ['privacy', 'terms', 'disclaimer'];

// nav: [{ key, label, icon, locked } | { group: 'label' } | 'sep']
// Language and sign in/out live at the foot of the menu, so the page header carries only the title.
// On phones the menu collapses behind a button in a sticky bar.
export default function Shell({ nav, active, onNav, title, sub, children }) {
  const t = useT();
  const { actions, banner } = useContext(ChromeCtx);
  const [open, setOpen] = useState(false);
  const pick = (k) => { setOpen(false); onNav(k); };
  return (
    <div className="shell">
      <aside className={`side${open ? ' open' : ''}`}>
        <div className="side-bar">
          <div className="brand"><Logo variant="notagline" height={36} /></div>
          <span className="m-title">{title}</span>
          <button className="ghost icon menu-btn" aria-expanded={open} aria-controls="side-menu" aria-label={t('menu')} onClick={() => setOpen(!open)}>
            {open ? <X size={18} /> : <List size={18} />}
          </button>
        </div>
        <div className="side-menu" id="side-menu">
          <nav>
            {nav.map((n, i) => (n === 'sep' ? <div key={i} className="nav-sep" /> : n.group ? <div key={i} className="nav-group">{n.group}</div> : (
              <button key={n.key} className={`nav-item${n.key === active ? ' on' : ''}`} onClick={() => pick(n.key)} aria-current={n.key === active ? 'page' : undefined}>
                <n.icon size={18} weight={n.key === active ? 'fill' : 'regular'} />
                <span>{n.label}</span>
                {n.locked && <LockSimple size={14} className="lock" aria-label={t('locked')} />}
              </button>
            )))}
          </nav>
          <div className="side-foot">
            {actions}
            <div className="legal">
              {LEGAL.map((p) => <Link key={p} to={`/${p}`}>{t(p)}</Link>)}
              <span className="fine">© Metis Energy</span>
            </div>
          </div>
        </div>
      </aside>
      <div className="main">
        {banner}
        <header className="topbar">
          <h1>{title}</h1>
          {sub && <div className="sub">{sub}</div>}
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
        <div className="bare-top"><Link to="/" className="brand" style={{ textDecoration: 'none', padding: 0, height: 44 }}><Logo height={44} /></Link><span className="grow" />{actions}</div>
      </div>
      <main className="bare-main">{children}</main>
      <footer className="bare-foot">
        <span className="fine">© Metis Energy</span>
        {LEGAL.map((p) => <Link key={p} to={`/${p}`}>{t(p)}</Link>)}
      </footer>
    </div>
  );
}
