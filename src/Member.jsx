import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { ArrowLeft, ChartLineUp, Calculator, Signpost, ChatsCircle, Lightning, Scales, Database, ShieldCheck, UsersThree } from '@phosphor-icons/react';
import { db } from './firebase.js';
import { useT } from './i18n.js';
import { CLIENT_PATHS, go, keyOf } from './router.jsx';
import Shell from './Shell.jsx';
import CostModule from './CostModule.jsx';
import MarketModule from './MarketModule.jsx';
import { AdvisoryModule, SignalModule } from './Modules.jsx';
import Team from './Team.jsx';

// The prototype's tabs (Price curves, Imbalance, Uplift, Your profile, Data sources) plus Buy-or-Wait and Advisory.
// module = the subscription module that unlocks the tab.
const TABS = [
  { group: 'grpMarket' },
  { key: 'prices', module: 'market', icon: ChartLineUp },
  { key: 'imbalance', module: 'market', icon: Scales },
  { key: 'uplift', module: 'market', icon: Lightning },
  { group: 'grpYou' },
  { key: 'profile', module: 'cost', icon: Calculator },
  { key: 'signal', module: 'signal', icon: Signpost },
  { key: 'advisory', module: 'advisory', icon: ChatsCircle },
  'sep',
  { key: 'sources', module: 'market', icon: Database },
];

// onBack and base are set when an admin previews a company (base = '/admin/preview/{cid}').
// adminLink adds the single way into the admin area, for Metis admins.
export default function Member({ cid, role, uid, onBack, base = '', slug, adminLink }) {
  const t = useT();
  const [company, setCompany] = useState(null);
  const tab = keyOf(CLIENT_PATHS, slug) || 'prices';

  useEffect(() => onSnapshot(doc(db, 'companies', cid), (s) => setCompany(s.data() || {})), [cid]);
  if (!company) return null;

  const expired = company.validUntil && company.validUntil.toDate() < new Date();
  const enabled = (m) => !expired && company.modules?.[m] === true;
  const canEdit = role !== 'viewer';
  const nav = [
    ...(onBack ? [{ key: 'back', label: t('back'), icon: ArrowLeft }, 'sep'] : []),
    ...TABS.map((x) => (x === 'sep' ? x : x.group ? { group: t(x.group) } : { key: x.key, label: t(`tab_${x.key}`), icon: x.icon, locked: !enabled(x.module) })),
    ...(role === 'owner' ? [{ key: 'team', label: t('tab_team'), icon: UsersThree }] : []),
    ...(adminLink ? ['sep', { key: 'admin', label: t('admin'), icon: ShieldCheck }] : []),
  ];
  const module = TABS.find((x) => x.key === tab)?.module;
  const left = company.validUntil ? Math.ceil((company.validUntil.toDate() - Date.now()) / 864e5) : null;
  const trial = company.trial && left > 0 ? ` · ${t('trial')}: ${t('daysLeft').replace('{n}', left)}` : '';

  return (
    <Shell nav={nav} active={tab} onNav={(k) => (k === 'back' ? onBack() : k === 'admin' ? go('/admin') : go(`${base}/${CLIENT_PATHS[k]}`))} title={t(`tab_${tab}`)} sub={adminLink ? company.name : `${company.name} · ${t(role)}${trial}`}>
      {tab === 'team' ? (role === 'owner' ? <Team cid={cid} uid={uid} /> : <div className="empty">{t('ownersOnly')}</div>)
        : !enabled(module) ? <div className="empty">{t(expired ? 'expired' : 'locked')}</div>
        : module === 'market' ? <MarketModule key={tab} view={tab} />
        : tab === 'profile' ? <CostModule cid={cid} uid={uid} canEdit={canEdit} />
        : tab === 'signal' ? <SignalModule />
        : <AdvisoryModule cid={cid} canEdit={canEdit} />}
    </Shell>
  );
}
