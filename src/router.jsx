import { useEffect, useState } from 'react';

// Paths for every screen, on the History API (Firebase Hosting serves index.html for all paths).
// ponytail: no router library; add one if routes ever need params beyond these few segments.
export const CLIENT_PATHS = { prices: 'prices', imbalance: 'imbalance', uplift: 'uplift', profile: 'profile', signal: 'buy-or-wait', advisory: 'advisory', sources: 'data-sources' };
export const ADMIN_PATHS = { tabClients: 'clients', tabData: 'data-feeds', tabFormula: 'formula', tabSignals: 'signals', tabAdvisory: 'requests', tabContent: 'texts', tabSettings: 'settings' };
export const keyOf = (paths, slug) => Object.keys(paths).find((k) => paths[k] === slug);

export function usePath() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const on = () => setPath(location.pathname);
    addEventListener('popstate', on);
    return () => removeEventListener('popstate', on);
  }, []);
  return path;
}

export function go(path, replace = false) {
  if (path === location.pathname) return;
  history[replace ? 'replaceState' : 'pushState'](null, '', path);
  dispatchEvent(new PopStateEvent('popstate'));
  scrollTo({ top: 0 });
}

export function Redirect({ to }) {
  useEffect(() => go(to, true), [to]);
  return null;
}

export function Link({ to, children, ...rest }) {
  return <a href={to} onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return; e.preventDefault(); go(to); }} {...rest}>{children}</a>;
}
