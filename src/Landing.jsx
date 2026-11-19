import { Fragment, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { ArrowRight, ChartLineUp, Gauge, ChatsCircle, UploadSimple, CheckCircle, ShieldCheck, SignIn } from '@phosphor-icons/react';
import { db } from './firebase.js';
import { useT, loc } from './i18n.js';
import { demoMarket, demoStats, SIGNALS } from './demo.js';
import LineChart from './Chart.jsx';
import Logo from './Logo.jsx';
import { Num } from './motion.jsx';
import { ChromeCtx, LEGAL } from './Shell.jsx';
import { Link } from './router.jsx';
import './landing.css';

// Public landing page: hero with the Buyometer, a ticker, the three modules, the dashboard with sample data
// (structure from "METIS ENERGY - Dashboard Design"), the signal scale and the 14-day trial request.
// Voice per the brand book: calm, plain, every block ends with what to do.

const L = {
  en: {
    navPlatform: 'Platform', navDemo: 'Sample dashboard', navBuyometer: 'Buyometer', navTrial: 'Free trial', openPlatform: 'Open platform',
    eyebrow: 'Energy procurement intelligence · Greece',
    h1: 'Know when to buy, when to hedge and when to wait.',
    lead: 'Metis turns Greek power and gas markets into clear decisions for industrial and commercial energy buyers. Market data, your own consumption and expert counsel, in one calm place.',
    ctaTrial: 'Start a 14-day trial', ctaDemo: 'See the sample dashboard',
    trust: ['Official IPTO and HEnEx data', 'EEX forward settlements', 'Greek and English'],
    bmLabel: 'Metis Buyometer · sample', bmSays: (p, v) => `${p} is ${Math.abs(v).toFixed(1)}% ${v < 0 ? 'below' : 'above'} its 90-day average.`,
    bmDo: ['Hold off: prices are rich against recent history.', 'Wait for a dip before adding volume.', 'No edge either way: stick to your plan.', 'Buy for 30% of your volume.', 'Buy for up to half of your open volume.'],
    pillarsEyebrow: 'One platform, three modules', pillarsH: 'Decisions, not data dumps',
    pillars: [
      ['Market intelligence', 'Day-ahead and imbalance prices from 15 minutes to monthly, Greek power and TTF forward curves from M+1 to Y+5, uplift, losses and the full supply cost.'],
      ['Energy management', 'Drop in your electricity or gas consumption, see what it really cost hour by hour, and budget the next years on today’s forward curves.'],
      ['Advisory', 'Tender and PPA reviews line by line, a hedging plan that fits your risk appetite, and a direct line to Metis analysts.'],
    ],
    pillarsMore: [['15’, hourly, daily, monthly', 'Forward curves M+1 to Y+5', 'Supply cost calculator'], ['Drag and drop upload', 'Historical cost analysis', 'Budget on forwards'], ['Tender and PPA review', 'Hedging strategy', 'Buy or wait signals']],
    demoEyebrow: 'Sample dashboard', demoH: 'The market, read for you',
    demoNote: 'Illustrative figures generated for this page. Not market data and not investment advice.',
    power: 'Greek power', gas: 'Natural gas (TTF)', refDate: 'Reference date',
    kM1: 'M+1 settlement', kMonth: 'Change over 1 month', kRange: '52-week range (M+1)', kShape: 'Curve shape (Y+1 vs M+1)', dod: 'day on day', from: 'from',
    backw: 'Backwardation', contango: 'Contango',
    fwd: 'Forward curve', fwdSub: (p, d) => `${p} settlement · €/MWh · ${d}`, hist: 'Historical prices', histSub: 'Daily settlement · €/MWh · tap a row in the table to add a contract',
    table: 'Market prices', product: 'Product', settle: 'Settlement', open: 'Open', high: 'High', low: 'Low', close: 'Close',
    evo: 'Curve evolution', evoSub: 'Settlement by contract · €/MWh', today: 'Today', w1: '1 week', m1: '1 month', y1: '1 year',
    insight: (p, v, s) => `${p} is ${Math.abs(v).toFixed(1)}% ${v < 0 ? 'below' : 'above'} its 90-day average. The Buyometer says ${s}.`,
    bmEyebrow: 'Metis Buyometer', bmH: 'One clear signal per product',
    bmText: 'Five steps from Strong sell to Strong buy, set by Metis analysts on forward prices, fundamentals and your own exposure. Warm means wait, cool means buy, and the word always sits next to the colour.',
    trialEyebrow: '14 days, free', trialH: 'Ride the curve.',
    trialText: 'Try every module on your own data for 14 days. No card, no commitment.',
    steps: [['Request access', 'Tell us about your company below.'], ['Metis approves', 'An analyst checks the request and sends your login.'], ['Bring your team', 'Full platform for 14 days, with up to 3 colleagues.']],
    fCompany: 'Company', fName: 'Your name', fEmail: 'Work email', fPhone: 'Phone (optional)', fMsg: 'What would you like to solve? (optional)',
    fConsent: 'I agree that Metis stores these details to handle my request, as described in the', fSubmit: 'Request my trial', fSending: 'Sending…',
    fDone: 'Thank you. We have your request', fDoneSub: 'A Metis analyst will review it and email you the login for your 14-day trial.', fErr: 'The request could not be sent. Please try again or email us.',
    footer: 'Energy procurement intelligence and advisory for industrial and commercial buyers, first in Greece and then across South East Europe.',
  },
  el: {
    navPlatform: 'Πλατφόρμα', navDemo: 'Δείγμα dashboard', navBuyometer: 'Buyometer', navTrial: 'Δωρεάν δοκιμή', openPlatform: 'Άνοιγμα πλατφόρμας',
    eyebrow: 'Ενεργειακή πληροφόρηση προμηθειών · Ελλάδα',
    h1: 'Ξέρετε πότε να αγοράσετε, πότε να αντισταθμίσετε και πότε να περιμένετε.',
    lead: 'Η Metis μετατρέπει τις αγορές ηλεκτρισμού και φυσικού αερίου σε καθαρές αποφάσεις για βιομηχανικούς και εμπορικούς καταναλωτές. Δεδομένα αγοράς, η δική σας κατανάλωση και έμπειρη συμβουλευτική, σε ένα σημείο.',
    ctaTrial: 'Δοκιμή 14 ημερών', ctaDemo: 'Δείτε το δείγμα dashboard',
    trust: ['Επίσημα δεδομένα ΑΔΜΗΕ και ΕΧΕ', 'Τιμές εκκαθάρισης EEX', 'Ελληνικά και αγγλικά'],
    bmLabel: 'Metis Buyometer · δείγμα', bmSays: (p, v) => `Το ${p} είναι ${Math.abs(v).toFixed(1)}% ${v < 0 ? 'κάτω' : 'πάνω'} από τον μέσο όρο 90 ημερών.`,
    bmDo: ['Αναμονή: οι τιμές είναι υψηλές σε σχέση με το πρόσφατο ιστορικό.', 'Περιμένετε μια υποχώρηση πριν προσθέσετε όγκο.', 'Κανένα πλεονέκτημα: μείνετε στο πλάνο σας.', 'Αγορά για το 30% του όγκου σας.', 'Αγορά έως τον μισό ανοιχτό όγκο σας.'],
    pillarsEyebrow: 'Μία πλατφόρμα, τρεις ενότητες', pillarsH: 'Αποφάσεις, όχι σωροί δεδομένων',
    pillars: [
      ['Πληροφόρηση αγοράς', 'Τιμές Day-ahead και Imbalance από 15λεπτο έως μήνα, καμπύλες προθεσμιακών ελληνικού ρεύματος και TTF από M+1 έως Y+5, Uplift, απώλειες και το πλήρες κόστος προμήθειας.'],
      ['Ενεργειακή διαχείριση', 'Ανεβάστε την κατανάλωση ρεύματος ή αερίου, δείτε τι κόστισε πραγματικά ώρα προς ώρα και προϋπολογίστε τα επόμενα χρόνια με τις σημερινές προθεσμιακές τιμές.'],
      ['Συμβουλευτική', 'Ανάλυση διαγωνισμών και PPA γραμμή προς γραμμή, πλάνο αντιστάθμισης στα μέτρα σας και απευθείας επαφή με τους αναλυτές της Metis.'],
    ],
    pillarsMore: [['15λεπτα, ωριαία, ημερήσια, μηνιαία', 'Καμπύλες M+1 έως Y+5', 'Υπολογισμός κόστους προμήθειας'], ['Ανέβασμα με σύρσιμο', 'Ανάλυση ιστορικού κόστους', 'Προϋπολογισμός με προθεσμιακά'], ['Ανάλυση διαγωνισμών και PPA', 'Στρατηγική αντιστάθμισης', 'Σήματα Buy or wait']],
    demoEyebrow: 'Δείγμα dashboard', demoH: 'Η αγορά, διαβασμένη για εσάς',
    demoNote: 'Ενδεικτικά στοιχεία που δημιουργήθηκαν για αυτή τη σελίδα. Δεν είναι δεδομένα αγοράς ούτε επενδυτική συμβουλή.',
    power: 'Ελληνικό ρεύμα', gas: 'Φυσικό αέριο (TTF)', refDate: 'Ημερομηνία αναφοράς',
    kM1: 'Τιμή εκκαθάρισης M+1', kMonth: 'Μεταβολή 1 μήνα', kRange: 'Εύρος 52 εβδομάδων (M+1)', kShape: 'Σχήμα καμπύλης (Y+1 έναντι M+1)', dod: 'ημερήσια', from: 'από',
    backw: 'Backwardation', contango: 'Contango',
    fwd: 'Καμπύλη προθεσμιακών', fwdSub: (p, d) => `${p} · €/MWh · ${d}`, hist: 'Ιστορικές τιμές', histSub: 'Ημερήσια εκκαθάριση · €/MWh · πατήστε μια γραμμή του πίνακα για να προσθέσετε συμβόλαιο',
    table: 'Τιμές αγοράς', product: 'Προϊόν', settle: 'Εκκαθάριση', open: 'Άνοιγμα', high: 'Υψηλό', low: 'Χαμηλό', close: 'Κλείσιμο',
    evo: 'Εξέλιξη καμπύλης', evoSub: 'Εκκαθάριση ανά συμβόλαιο · €/MWh', today: 'Σήμερα', w1: '1 εβδομάδα', m1: '1 μήνας', y1: '1 έτος',
    insight: (p, v, s) => `Το ${p} είναι ${Math.abs(v).toFixed(1)}% ${v < 0 ? 'κάτω' : 'πάνω'} από τον μέσο όρο 90 ημερών. Το Buyometer λέει ${s}.`,
    bmEyebrow: 'Metis Buyometer', bmH: 'Ένα καθαρό σήμα ανά προϊόν',
    bmText: 'Πέντε βαθμίδες από Strong sell έως Strong buy, που ορίζουν οι αναλυτές της Metis με βάση τις προθεσμιακές τιμές, τα θεμελιώδη και τη δική σας έκθεση. Τα ζεστά χρώματα σημαίνουν αναμονή, τα ψυχρά αγορά, και η λέξη είναι πάντα δίπλα στο χρώμα.',
    trialEyebrow: '14 ημέρες, δωρεάν', trialH: 'Ride the curve.',
    trialText: 'Δοκιμάστε όλες τις ενότητες με τα δικά σας δεδομένα για 14 ημέρες. Χωρίς κάρτα, χωρίς δέσμευση.',
    steps: [['Ζητήστε πρόσβαση', 'Πείτε μας για την εταιρεία σας παρακάτω.'], ['Έγκριση από τη Metis', 'Ένας αναλυτής ελέγχει το αίτημα και σας στέλνει τα στοιχεία σύνδεσης.'], ['Φέρτε την ομάδα σας', 'Πλήρης πλατφόρμα για 14 ημέρες, με έως 3 συναδέλφους.']],
    fCompany: 'Εταιρεία', fName: 'Ονοματεπώνυμο', fEmail: 'Εταιρικό email', fPhone: 'Τηλέφωνο (προαιρετικό)', fMsg: 'Τι θέλετε να λύσετε; (προαιρετικό)',
    fConsent: 'Συμφωνώ να αποθηκεύσει η Metis αυτά τα στοιχεία για τη διαχείριση του αιτήματός μου, όπως περιγράφεται στην', fSubmit: 'Αίτημα δοκιμής', fSending: 'Αποστολή…',
    fDone: 'Ευχαριστούμε. Λάβαμε το αίτημά σας', fDoneSub: 'Ένας αναλυτής της Metis θα το εξετάσει και θα σας στείλει με email τα στοιχεία σύνδεσης για τη δοκιμή 14 ημερών.', fErr: 'Το αίτημα δεν στάλθηκε. Δοκιμάστε ξανά ή στείλτε μας email.',
    footer: 'Ενεργειακή πληροφόρηση και συμβουλευτική για βιομηχανικούς και εμπορικούς καταναλωτές, πρώτα στην Ελλάδα και μετά σε όλη τη Νοτιοανατολική Ευρώπη.',
  },
};
const SIG_WORD = ['Strong sell', 'Sell', 'Neutral', 'Buy', 'Strong buy'];
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmt = (v, d = 2) => v.toLocaleString(loc(), { minimumFractionDigits: d, maximumFractionDigits: d });
const sign = (v, d = 2) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v), d)}`;

// Adds .in to every .reveal element once it scrolls into view (CSS does the motion).
function useReveal(root) {
  useEffect(() => {
    const els = root.current.querySelectorAll('.reveal');
    if (reduced() || !('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return; }
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [root]);
}

// true once the element has been on screen, so count-ups start where they are seen.
function useSeen() {
  const ref = useRef(), [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return setSeen(true);
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setSeen(true), { threshold: 0.3 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  return [ref, seen];
}

// Cursor-following glow on cards: sets --mx/--my, CSS paints the light.
const spot = (e) => { const r = e.currentTarget.getBoundingClientRect(); e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`); e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`); };

export default function Landing({ open }) {
  const t = useT();
  const l = L[t.lang] || L.en;
  const { lang } = useContext(ChromeCtx);
  const root = useRef();
  const [scrolled, setScrolled] = useState(false);
  const power = useMemo(() => demoMarket('power'), []);
  const stats = useMemo(() => demoStats(power), [power]);
  useReveal(root);
  useEffect(() => {
    const on = () => setScrolled(scrollY > 24);
    on(); addEventListener('scroll', on, { passive: true });
    return () => removeEventListener('scroll', on);
  }, []);

  return (
    <div className="landing" ref={root}>
      <header className={`l-nav${scrolled ? ' solid' : ''}`}>
        <div className="l-wrap l-nav-in">
          <a href="#top" className="l-logo" aria-label="metis"><Logo variant={scrolled ? 'full' : 'reverse'} height={40} /></a>
          <nav className="l-links">
            <a href="#platform">{l.navPlatform}</a><a href="#demo">{l.navDemo}</a><a href="#buyometer">{l.navBuyometer}</a>
          </nav>
          <span className="grow" />
          {lang}
          <Link to={open ? '/prices' : '/login'} className="l-signin">{open ? <ShieldCheck size={16} /> : <SignIn size={16} />}{open ? l.openPlatform : t('signIn')}</Link>
          <a href="#trial" className="l-btn sun sm">{l.navTrial}</a>
        </div>
      </header>

      <Hero l={l} stats={stats} power={power} />
      <Ticker power={power} />

      <section className="l-sec" id="platform">
        <div className="l-wrap">
          <div className="l-head reveal"><span className="l-eyebrow">{l.pillarsEyebrow}</span><h2>{l.pillarsH}</h2></div>
          <div className="l-pillars">
            {[ChartLineUp, UploadSimple, ChatsCircle].map((Icon, i) => (
              <article key={i} className="l-card spot reveal" style={{ transitionDelay: `${i * 80}ms` }} onPointerMove={spot}>
                <span className="l-icon"><Icon size={26} /></span>
                <h3>{l.pillars[i][0]}</h3>
                <p>{l.pillars[i][1]}</p>
                <ul>{l.pillarsMore[i].map((x) => <li key={x}>{x}</li>)}</ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <Curve />
      <Demo l={l} power={power} />
      <Buyometer l={l} signal={stats.signal} />
      <Curve sun />
      <Trial l={l} />

      <footer className="l-foot">
        <div className="l-wrap l-foot-in">
          <div><Logo variant="reverse" height={44} /><p>{l.footer}</p></div>
          <nav>
            <a href="#platform">{l.navPlatform}</a><a href="#demo">{l.navDemo}</a><a href="#trial">{l.navTrial}</a>
            <Link to="/login">{t('signIn')}</Link>
          </nav>
          <nav>{LEGAL.map((p) => <Link key={p} to={`/${p}`}>{t(p)}</Link>)}<a href="https://metis.ai">metis.ai</a></nav>
        </div>
        <div className="l-wrap l-fine">© {new Date().getFullYear()} Metis · {t('notAdvice')}</div>
      </footer>
    </div>
  );
}

// The brand wave crosses the hero edge to edge and draws itself in; the sun then rides it (SMIL, skipped under reduced motion).
const WAVE = 'M -40 250 C 220 120, 430 110, 640 205 S 1060 330, 1480 70';
function Hero({ l, stats, power }) {
  const still = reduced();
  return (
    <section className="l-hero" id="top">
      <svg className="l-wave" viewBox="0 0 1440 360" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <path d={WAVE} pathLength="1" />
        <circle r="13" cx={still ? 1180 : 0} cy={still ? 190 : 0}>
          {!still && <animateMotion dur="3.2s" begin="1.2s" fill="freeze" keyPoints="0;0.78" keyTimes="0;1" calcMode="spline" keySplines=".45 0 .2 1" path={WAVE} />}
        </circle>
      </svg>
      <div className="l-wrap l-hero-in">
        <div className="l-hero-copy">
          <span className="l-eyebrow sun">{l.eyebrow}</span>
          <h1 className="l-h1">{l.h1.split(' ').map((w, i) => <Fragment key={i}><span style={{ animationDelay: `${120 + i * 45}ms` }}>{w}</span> </Fragment>)}</h1>
          <p className="l-lead">{l.lead}</p>
          <div className="l-ctas">
            <a href="#trial" className="l-btn sun">{l.ctaTrial}<ArrowRight size={18} /></a>
            <a href="#demo" className="l-btn line">{l.ctaDemo}</a>
          </div>
          <ul className="l-trust">{l.trust.map((x) => <li key={x}><CheckCircle size={16} weight="fill" />{x}</li>)}</ul>
        </div>
        <BuyCard l={l} stats={stats} power={power} />
      </div>
    </section>
  );
}

// Half-ring gauge in the five Buyometer colours; the needle swings to today's signal.
const arc = (a0, a1, r = 80) => {
  const p = (a) => [100 + r * Math.cos(a), 100 + r * Math.sin(a)];
  const [x0, y0] = p(a0), [x1, y1] = p(a1);
  return `M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`;
};
function BuyCard({ l, stats, power }) {
  const [on, setOn] = useState(reduced());
  useEffect(() => { const id = setTimeout(() => setOn(true), 900); return () => clearTimeout(id); }, []);
  const angle = -90 + (stats.signal + 0.5) * 36; // centre of the signal's segment; -90 = Strong sell end
  return (
    <aside className="l-buy" aria-label={l.bmLabel}>
      <div className="l-buy-head"><span>{l.bmLabel}</span><b>GR Base {stats.y1.name}</b></div>
      <svg viewBox="0 0 200 116" className="l-gauge" aria-hidden="true">
        {SIG_COLOR.map((c, i) => <path key={i} d={arc(Math.PI + i * (Math.PI / 5) + 0.03, Math.PI + (i + 1) * (Math.PI / 5) - 0.03)} stroke={c} className={i === stats.signal ? 'hit' : ''} />)}
        <g className="needle" style={{ transform: `rotate(${on ? angle : -90}deg)` }}><line x1="100" y1="100" x2="100" y2="34" /><circle cx="100" cy="100" r="6" /></g>
      </svg>
      <div className={`l-signal s${stats.signal}`}>{SIG_WORD[stats.signal].toUpperCase()}</div>
      <p className="l-buy-say">{l.bmSays(stats.y1.name, stats.vsAvg)} <b>{l.bmDo[stats.signal]}</b></p>
      <div className="l-buy-stats">
        {['M+1', 'Q+1', 'Y+1'].map((id, i) => <Mini key={id} c={power.contracts.find((x) => x.id === id)} i={i} />)}
      </div>
    </aside>
  );
}
// Buyometer colours from the brand book: Terracotta, Sun Ochre, Signal Grey, Light Aegean, Aegean.
const SIG_COLOR = ['#B54A2F', '#E3A23B', '#A7B3B5', '#5CC2D1', '#1F7A8C'];
function Mini({ c, i }) {
  const ch = (c.ohlc.settle / c.prev - 1) * 100;
  return (
    <div className="l-mini" style={{ animationDelay: `${i * 0.6}s` }}>
      <span>{c.id} · {c.name}</span>
      <b><Num value={c.ohlc.settle} digits={2} /></b>
      <em className={ch > 0 ? 'up' : 'down'}>{ch > 0 ? '▲' : '▼'} {fmt(Math.abs(ch), 1)}%</em>
    </div>
  );
}

function Ticker({ power }) {
  const gas = useMemo(() => demoMarket('gas'), []);
  const items = [...power.contracts.map((c) => ['GR Base', c]), ...gas.contracts.filter((c) => c.kind !== 'q').map((c) => ['TTF', c])];
  const row = items.map(([p, c], i) => {
    const ch = c.ohlc.settle - c.prev;
    return <span key={i} className="l-tick"><b>{p} {c.id}</b> {c.name} <span className="num">{fmt(c.ohlc.settle)}</span> <em className={ch > 0 ? 'up' : 'down'}>{ch > 0 ? '▲' : '▼'} {fmt(Math.abs(ch))}</em></span>;
  });
  return <div className="l-ticker" aria-hidden="true"><div className="l-ticker-in">{row}{row}</div></div>;
}

// Thin curve divider between sections (brand graphic element: 2 px, Aegean or Ochre, round ends).
const Curve = ({ sun }) => (
  <svg className={`l-curve reveal${sun ? ' sun' : ''}`} viewBox="0 0 1200 40" preserveAspectRatio="none" aria-hidden="true">
    <path d="M 2 30 C 220 4, 420 4, 600 20 S 980 38, 1198 8" pathLength="1" />
  </svg>
);

const SERIES = ['--power', '--gas', '--imb', '--s4', '--s5'];
function Demo({ l, power }) {
  const t = useT();
  const [product, setProduct] = useState('power');
  const [range, setRange] = useState('1Y');
  const [picked, setPicked] = useState(['M+1', 'Q+1', 'Y+1']);
  const [ref, seen] = useSeen();
  const m = useMemo(() => (product === 'power' ? power : demoMarket('gas')), [product, power]);
  const s = useMemo(() => demoStats(m), [m]);
  const pname = product === 'power' ? 'GR Base' : 'TTF';
  const refDay = m.ref.toLocaleDateString(loc(), { day: 'numeric', month: 'short', year: 'numeric' });
  const n = m.days.length;
  const from = { '1M': n - 21, '3M': n - 63, '6M': n - 126, YTD: m.days.findIndex((d) => d.getFullYear() === m.ref.getFullYear()), '1Y': 0 }[range];

  const fwd = useMemo(() => ({
    labels: m.contracts.map((c) => [c.id, c.name]),
    datasets: [{ label: pname, data: m.contracts.map((c) => c.ohlc.settle), color: '--power', pointRadius: 3.5, pointHoverRadius: 6, pointBackgroundColor: '#E3A23B', pointBorderColor: '#E3A23B', borderWidth: 2.4, tension: 0.3 }],
  }), [m, pname]);
  const hist = useMemo(() => ({
    labels: m.days.slice(from).map((d) => d.toLocaleDateString(loc(), { day: 'numeric', month: 'short' })),
    datasets: picked.map((id, i) => ({ label: id, data: m.contracts.find((c) => c.id === id).close.slice(from), color: SERIES[i % 5], borderWidth: 1.8 })),
  }), [m, from, picked]);
  const evo = useMemo(() => ({
    labels: m.contracts.map((c) => c.id),
    datasets: [[l.today, 0, '--power'], [l.w1, 5, '--gas'], [l.m1, 21, '--imb'], [l.y1, n - 1, '--s4']].map(([label, k, color]) => ({
      label, color, data: m.contracts.map((c) => c.close[n - 1 - k]), pointRadius: 2.5, borderWidth: label === l.today ? 2.4 : 1.6,
    })),
  }), [m, n, l]);
  const toggle = (id) => setPicked((p) => (p.includes(id) ? (p.length > 1 ? p.filter((x) => x !== id) : p) : [...p, id].slice(-5)));

  return (
    <section className="l-sec l-demo-sec" id="demo">
      <div className="l-wrap">
        <div className="l-head reveal"><span className="l-eyebrow">{l.demoEyebrow}</span><h2>{l.demoH}</h2><p className="l-sub">{l.demoNote}</p></div>
        <div className="l-app reveal" ref={ref}>
          <div className="l-app-bar">
            <Logo variant="notaglineReverse" height={22} />
            <div className="l-app-tabs">{['power', 'gas'].map((k) => <button key={k} className={product === k ? 'on' : ''} onClick={() => setProduct(k)}>{l[k]}</button>)}</div>
            <span className="grow" />
            <span className={`l-chip s${s.signal}`}>{pname} {s.y1.name} <b>{SIG_WORD[s.signal].toUpperCase()}</b></span>
          </div>
          <div className="l-app-body" key={product}>
            <div className="l-kpis">
              <div className="l-ref"><span>{l.refDate}</span><b>{refDay}</b></div>
              <div><span>{pname} {l.kM1}</span><b className="num"><Num value={seen ? s.m1.ohlc.settle : 0} digits={2} /> <small>€/MWh</small></b><em className={s.dayChange > 0 ? 'up' : 'down'}>{s.dayChange > 0 ? '▲' : '▼'} {sign(s.dayChange)} ({sign((s.dayChange / s.m1.prev) * 100, 1)}%) {l.dod}</em></div>
              <div><span>{l.kMonth}</span><b className={`num ${s.month.pct > 0 ? 'up' : 'down'}`}>{sign(s.month.pct, 1)}%</b><em>{l.from} {fmt(s.month.from)}</em></div>
              <div><span>{l.kRange}</span><b className="num">{fmt(s.range[0])} – {fmt(s.range[1])}</b><em>€/MWh</em></div>
              <div><span>{l.kShape}</span><b>{s.shape < 0 ? l.backw : l.contango}</b><em>{sign(s.shape)} €/MWh</em></div>
            </div>
            <p className="l-insight"><Gauge size={18} />{l.insight(`${pname} ${s.y1.name}`, s.vsAvg, SIG_WORD[s.signal])}</p>
            <div className="l-grid">
              <div className="l-panel"><h3>{l.fwd}</h3><p className="fine">{l.fwdSub(pname, refDay)}</p><LineChart plain allTicks labels={fwd.labels} datasets={fwd.datasets} /></div>
              <div className="l-panel">
                <div className="row"><div className="grow"><h3>{l.hist}</h3><p className="fine">{l.histSub}</p></div>
                  <div className="seg">{['1M', '3M', '6M', 'YTD', '1Y'].map((k) => <button key={k} className={range === k ? 'on' : ''} onClick={() => setRange(k)}>{k}</button>)}</div></div>
                <LineChart plain labels={hist.labels} datasets={hist.datasets} />
              </div>
              <div className="l-panel">
                <h3>{l.table}</h3><p className="fine">€/MWh · {refDay}</p>
                <div className="scroll"><table className="l-table">
                  <thead><tr><th>{l.product}</th>{['settle', 'open', 'high', 'low', 'close'].map((k) => <th key={k} className="r">{l[k]}</th>)}</tr></thead>
                  <tbody>{m.contracts.map((c) => {
                    const up = c.ohlc.close >= c.ohlc.open, i = picked.indexOf(c.id);
                    return (
                      <tr key={c.id} className={i >= 0 ? 'on' : ''} onClick={() => toggle(c.id)} tabIndex={0} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle(c.id))} aria-pressed={i >= 0}>
                        <td><i className="sw" style={{ background: i >= 0 ? `var(${SERIES[i % 5]})` : 'transparent' }} /><b>{c.id}</b> <span className="fine">{c.name}</span></td>
                        <td className="r num"><b>{fmt(c.ohlc.settle)}</b></td><td className="r num">{fmt(c.ohlc.open)}</td><td className="r num">{fmt(c.ohlc.high)}</td><td className="r num">{fmt(c.ohlc.low)}</td>
                        <td className={`r num ${up ? 'up' : 'down'}`}>{fmt(c.ohlc.close)} {up ? '▲' : '▼'}</td>
                      </tr>
                    );
                  })}</tbody>
                </table></div>
              </div>
              <div className="l-panel"><h3>{l.evo}</h3><p className="fine">{l.evoSub}</p><LineChart plain labels={evo.labels} datasets={evo.datasets} /></div>
            </div>
            <p className="fine l-disc">{t('notAdvice')}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Buyometer({ l, signal }) {
  return (
    <section className="l-sec" id="buyometer">
      <div className="l-wrap l-bm">
        <div className="reveal"><span className="l-eyebrow">{l.bmEyebrow}</span><h2>{l.bmH}</h2><p className="l-sub">{l.bmText}</p></div>
        <div className="l-scale reveal" style={{ '--at': `${(signal + 0.5) * 20}%` }}>
          <div className="l-scale-bar">{SIGNALS.map((k, i) => <span key={k} className={`s${i}`} />)}<i className="l-pin" /></div>
          <div className="l-scale-words">{SIG_WORD.map((w, i) => <span key={w} className={i === signal ? 'on' : ''}>{w.toUpperCase()}</span>)}</div>
        </div>
      </div>
    </section>
  );
}

const EMPTY = { company: '', name: '', email: '', phone: '', message: '' };
function Trial({ l }) {
  const t = useT();
  const [f, setF] = useState(EMPTY);
  const [state, setState] = useState('idle'); // idle | sending | done | error
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setState('sending');
    try {
      const v = Object.fromEntries(Object.entries(f).map(([k, x]) => [k, x.trim()]));
      await addDoc(collection(db, 'trialRequests'), { ...v, email: v.email.toLowerCase(), lang: t.lang, status: 'new', createdAt: serverTimestamp() });
      setState('done');
    } catch { setState('error'); }
  };
  return (
    <section className="l-sec l-trial" id="trial">
      <div className="l-wrap l-trial-in">
        <div className="reveal">
          <span className="l-eyebrow">{l.trialEyebrow}</span>
          <h2 className="l-display">{l.trialH}</h2>
          <p className="l-sub">{l.trialText}</p>
          <ol className="l-steps">{l.steps.map(([h, p], i) => <li key={h} style={{ transitionDelay: `${i * 90}ms` }}><span>{i + 1}</span><div><b>{h}</b><p>{p}</p></div></li>)}</ol>
        </div>
        <div className="l-form-card reveal">
          {state === 'done' ? (
            <div className="l-done" role="status">
              <svg viewBox="0 0 52 52" className="l-check" aria-hidden="true"><circle cx="26" cy="26" r="23" /><path d="M 15 27 L 23 34 L 37 19" /></svg>
              <h3>{l.fDone}, {f.name.split(' ')[0]}.</h3><p>{l.fDoneSub}</p>
            </div>
          ) : (
            <form onSubmit={submit}>
              <label>{l.fCompany}<input required minLength={2} maxLength={120} autoComplete="organization" value={f.company} onChange={set('company')} /></label>
              <div className="l-two">
                <label>{l.fName}<input required maxLength={120} autoComplete="name" value={f.name} onChange={set('name')} /></label>
                <label>{l.fPhone}<input type="tel" maxLength={40} autoComplete="tel" value={f.phone} onChange={set('phone')} /></label>
              </div>
              <label>{l.fEmail}<input type="email" required maxLength={200} autoComplete="email" value={f.email} onChange={set('email')} /></label>
              <label>{l.fMsg}<textarea maxLength={2000} rows={3} value={f.message} onChange={set('message')} /></label>
              <label className="check"><input type="checkbox" required /> <span>{l.fConsent} <Link to="/privacy">{t('privacy').toLowerCase()}</Link>.</span></label>
              <button className="l-btn sun wide" disabled={state === 'sending'}>{state === 'sending' ? l.fSending : l.fSubmit}<ArrowRight size={18} /></button>
              {state === 'error' && <p className="notice" role="alert">{l.fErr}</p>}
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
