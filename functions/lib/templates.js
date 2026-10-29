// Branded HTML emails, ported from the energymeets engine, in Metis colours.
// Greek copy (the platform's default language); market jargon (Day-ahead, Imbalance, Uplift, Buy or wait) stays in English.
// Each builder returns { subject, body, text }; render() wraps the body in the layout.

// Same sender and admins as energymeets. Admin → Email (config/email) overrides any of these.
export const OWNERS = ['konstantinosparginos@gmail.com', 'ipsarros81@gmail.com'];

export const DEFAULTS = {
  fromName: 'Metis Energy',
  fromEmail: 'ioannis@energymeets.com',
  replyTo: '',
  adminEmail: OWNERS.join(', '),
  signature: 'Metis Energy - ενεργειακή πληροφόρηση προμηθειών για Έλληνες καταναλωτές.',
  enabled: { invite: true, adminInvite: true, requestAdmin: true, clientReply: true, requestReply: true, signal: true },
};

export const SITE = 'https://metis-energy.web.app';
const ACCENT = '#157A8C';
const INK = '#0F1A24';
const MUTED = '#5B6878';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function layout({ preheader, body, signature }) {
  return `<!doctype html><html lang="el"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Metis Energy</title></head>
<body style="margin:0;padding:0;background:#F4F6F9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${INK}">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6F9;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #E6EAF0">
<tr><td style="padding:22px 30px 18px;border-bottom:3px solid ${ACCENT}"><a href="${SITE}" style="text-decoration:none;font-size:24px;font-weight:700;letter-spacing:-0.5px;color:#0B3D4C">metis</a><div style="font-size:9px;font-weight:600;letter-spacing:1px;color:#B97714;text-transform:uppercase">Ride the curve</div></td></tr>
<tr><td style="padding:30px 30px 22px">${body}</td></tr>
<tr><td style="padding:0 30px 26px"><p style="margin:0;font-size:12px;line-height:1.6;color:${MUTED}">${esc(signature)}</p></td></tr>
<tr><td style="background:#F8FAFC;padding:16px 30px;border-top:1px solid #E6EAF0"><p style="margin:0;font-size:11px;color:${MUTED}">Λαμβάνετε αυτό το μήνυμα επειδή έχετε λογαριασμό στη Metis Energy.</p></td></tr>
</table>
<p style="margin:16px 0 0;font-size:11px;color:#8A95A3">© ${new Date().getFullYear()} Metis Energy</p>
</td></tr></table></body></html>`;
}

const h = (t) => `<h1 style="margin:0 0 14px;font-size:22px;line-height:1.2;letter-spacing:-0.3px">${t}</h1>`;
const p = (t) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#333">${t}</p>`;
const btn = (label, href) => `<p style="margin:6px 0 20px"><a href="${esc(href)}" style="display:inline-block;background:${ACCENT};color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:999px">${label}</a></p>`;
const quote = (t) => `<table role="presentation" width="100%" style="background:#F8FAFC;border-left:3px solid ${ACCENT};margin:0 0 20px"><tr><td style="padding:12px 16px;font-size:14px;line-height:1.6;color:#333;white-space:pre-wrap">${esc(t)}</td></tr></table>`;
const kv = (k, v) => `<p style="margin:4px 0;font-size:14px;color:#333"><b style="color:${MUTED};font-weight:600">${k}:</b> ${esc(v)}</p>`;

const ROLE = { owner: 'Διαχειριστής', analyst: 'Αναλυτής', viewer: 'Θεατής' };
const COMMODITY = { power: 'Ηλεκτρική ενέργεια', gas: 'Φυσικό αέριο', carbon: 'Δικαιώματα CO₂ (EUA)' };
const SIGNAL = { buy: 'Buy', wait: 'Wait', neutral: 'Neutral' };

const builders = {
  invite: (d) => ({
    subject: `Πρόσβαση στη Metis Energy για ${d.company}`,
    body: h('Καλώς ήρθατε στη Metis Energy') + p(`Σας προσθέσαμε στην <b>${esc(d.company)}</b> με ρόλο <b>${esc(ROLE[d.role] || d.role)}</b>. Ορίστε τον κωδικό σας για να συνδεθείτε.`) + btn('Ορισμός κωδικού', d.link) + p('Ο σύνδεσμος λήγει σε μία ώρα. Αν λήξει, χρησιμοποιήστε το «Ξεχάσατε τον κωδικό;» στη σελίδα σύνδεσης.'),
    text: `Σας προσθέσαμε στην ${d.company}. Ορίστε τον κωδικό σας: ${d.link}`,
  }),
  adminInvite: (d) => ({
    subject: 'Πρόσβαση διαχειριστή στη Metis Energy',
    body: h('Είστε διαχειριστής της Metis Energy') + p('Ορίστε τον κωδικό σας για να συνδεθείτε στη διαχείριση της πλατφόρμας.') + btn('Ορισμός κωδικού', d.link),
    text: `Ορίστε τον κωδικό διαχειριστή: ${d.link}`,
  }),
  requestAdmin: (d) => ({
    subject: `Νέο αίτημα Advisory: ${d.title} (${d.company})`,
    body: h('Νέο αίτημα συμβουλευτικής') + kv('Εταιρεία', d.company) + kv('Από', d.from) + kv('Θέμα', d.title) + `<div style="height:12px"></div>` + quote(d.text) + btn('Άνοιγμα αιτημάτων', `${SITE}/admin/requests`),
    text: `${d.company} (${d.from}): ${d.title}\n\n${d.text}`,
  }),
  clientReply: (d) => ({
    subject: `Απάντηση πελάτη: ${d.title} (${d.company})`,
    body: h('Ο πελάτης απάντησε') + kv('Εταιρεία', d.company) + kv('Από', d.from) + kv('Θέμα', d.title) + `<div style="height:12px"></div>` + quote(d.text) + btn('Άνοιγμα αιτημάτων', `${SITE}/admin/requests`),
    text: `${d.company} (${d.from}): ${d.title}\n\n${d.text}`,
  }),
  requestReply: (d) => ({
    subject: `Απάντηση της Metis: ${d.title}`,
    body: h('Η Metis Energy απάντησε στο αίτημά σας') + kv('Θέμα', d.title) + `<div style="height:12px"></div>` + quote(d.text) + btn('Προβολή αιτήματος', `${SITE}/advisory`),
    text: `${d.title}\n\n${d.text}\n\n${SITE}/advisory`,
  }),
  signal: (d) => ({
    subject: `Buy or wait: ${SIGNAL[d.signal] || d.signal}, ${COMMODITY[d.commodity] || d.commodity}`,
    body: h(`Νέο σήμα Buy or wait: ${esc(SIGNAL[d.signal] || d.signal)}`) + kv('Προϊόν', COMMODITY[d.commodity] || d.commodity) + kv('Ορίζοντας', d.horizon) + kv('Ημερομηνία', d.date) + `<div style="height:12px"></div>` + quote(d.rationale) + btn('Άνοιγμα στη Metis', `${SITE}/buy-or-wait`) + p('<span style="font-size:12px;color:#5B6878">Ενδεικτικά στοιχεία, όχι επενδυτική συμβουλή.</span>'),
    text: `Buy or wait: ${SIGNAL[d.signal] || d.signal}, ${COMMODITY[d.commodity] || d.commodity}, ${d.horizon}\n\n${d.rationale}`,
  }),
  test: () => ({
    subject: 'Δοκιμαστικό email από τη Metis Energy',
    body: h('Η αποστολή email λειτουργεί') + p('Αυτό είναι δοκιμαστικό μήνυμα από τη διαχείριση της Metis Energy.'),
    text: 'Η αποστολή email λειτουργεί.',
  }),
};

export const TEMPLATE_KEYS = Object.keys(builders);
export const ADMIN_ALERTS = new Set(['requestAdmin', 'clientReply']);

// Sample data for test sends from Admin → Email.
export const SAMPLE = {
  invite: { company: 'Helios Industrial', role: 'analyst', link: `${SITE}/login` },
  adminInvite: { link: `${SITE}/login` },
  requestAdmin: { company: 'Helios Industrial', from: 'a.marinou@helios.gr', title: 'Σταθερή ή κυμαινόμενη τιμή για το 2027;', text: 'Μας προτείνουν σταθερή τιμή 118 €/MWh για το 2027. Αξίζει σε σχέση με το Day-ahead;' },
  clientReply: { company: 'Helios Industrial', from: 'a.marinou@helios.gr', title: 'Σταθερή ή κυμαινόμενη τιμή για το 2027;', text: 'Ευχαριστούμε. Μπορείτε να δείτε και το προφίλ φυσικού αερίου;' },
  requestReply: { title: 'Σταθερή ή κυμαινόμενη τιμή για το 2027;', text: 'Με το τρέχον προφίλ σας, η σταθερή τιμή είναι περίπου 6% πάνω από τον μέσο Day-ahead + Uplift των τελευταίων 12 μηνών.' },
  signal: { commodity: 'power', signal: 'wait', horizon: 'Q1 2027', date: '2026-10-29', rationale: 'Οι τιμές Day-ahead είναι 69% πάνω από πέρυσι· αναμένουμε αποκλιμάκωση μετά τον Ιανουάριο.' },
  test: {},
};

export const hasTemplate = (key) => Object.hasOwn(builders, key);

/** { subject, html, text } for a template. */
export function render(key, data, cfg = {}) {
  const t = builders[key](data);
  return { subject: t.subject, html: layout({ preheader: t.subject, body: t.body, signature: cfg.signature }), text: t.text };
}
