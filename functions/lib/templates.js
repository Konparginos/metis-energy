// Branded HTML emails, ported from the energymeets engine, in Metis colours.
// Greek copy (the platform's default language); market jargon (Day-ahead, Imbalance, Uplift, Buy or wait) stays in English.
// Each builder returns { subject, body, text }; render() wraps the body in the layout.
// Admins can override subject/body per template (config/email.templates.{key}) with {{token}} placeholders,
// and set a header banner image (config/email.headerBannerUrl) that replaces the text logo, as in energymeets.

// Same sender and admins as energymeets. Admin → Email (config/email) overrides any of these.
export const OWNERS = ['konstantinosparginos@gmail.com', 'ipsarros81@gmail.com'];

export const DEFAULTS = {
  fromName: 'Metis Energy',
  fromEmail: 'ioannis@energymeets.com',
  replyTo: '',
  adminEmail: OWNERS.join(', '),
  signature: 'Metis Energy - ενεργειακή πληροφόρηση προμηθειών για Έλληνες καταναλωτές.',
  enabled: { invite: true, adminInvite: true, requestAdmin: true, clientReply: true, requestReply: true, signal: true, trialAdmin: true, trialApproved: true },
};

export const SITE = 'https://metis-energy.web.app';
const ACCENT = '#1F7A8C'; // Metis Aegean
const INK = '#12262C';
const MUTED = '#4A5A5E';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function layout({ preheader, body, signature, bannerUrl }) {
  const head = bannerUrl
    ? `<tr><td style="padding:0"><a href="${SITE}" style="display:block;text-decoration:none"><img src="${esc(bannerUrl)}" width="560" alt="Metis Energy" style="display:block;border:0;width:100%;max-width:560px;height:auto;font-size:20px;font-weight:700;color:#0B3D4C;text-align:center"></a></td></tr><tr><td style="height:3px;background:${ACCENT}"></td></tr>`
    // Mark is public/email-logo.gif (scripts/email-logo.py): the curve draws in once, as Logo.jsx does on the site.
    : `<tr><td style="padding:20px 30px 16px;border-bottom:3px solid ${ACCENT}"><a href="${SITE}" style="text-decoration:none"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="padding-right:10px;vertical-align:middle"><img src="${SITE}/email-logo.gif" width="44" height="44" alt="" style="display:block;border:0"></td><td style="vertical-align:middle"><div style="font-size:24px;font-weight:700;letter-spacing:-0.5px;line-height:1;color:#0B3D4C">metis</div><div style="font-size:9px;font-weight:600;letter-spacing:1px;color:#9A5F12;text-transform:uppercase;padding-top:3px">Ride the curve</div></td></tr></table></a></td></tr>`;
  return `<!doctype html><html lang="el"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Metis Energy</title></head>
<body style="margin:0;padding:0;background:#F6EFE3;font-family:Manrope,Segoe UI,Arial,sans-serif;color:${INK}">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6EFE3;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #ECE4D5">
${head}
<tr><td style="padding:30px 30px 22px">${body}</td></tr>
<tr><td style="padding:0 30px 26px"><p style="margin:0;font-size:12px;line-height:1.6;color:${MUTED}">${esc(signature)}</p></td></tr>
<tr><td style="background:#FBF8F2;padding:16px 30px;border-top:1px solid #ECE4D5"><p style="margin:0;font-size:11px;color:${MUTED}">Λαμβάνετε αυτό το μήνυμα επειδή έχετε λογαριασμό στη Metis Energy.</p></td></tr>
</table>
<p style="margin:16px 0 0;font-size:11px;color:#8A95A3">© ${new Date().getFullYear()} Metis Energy</p>
</td></tr></table></body></html>`;
}

const h = (t) => `<h1 style="margin:0 0 14px;font-size:22px;line-height:1.2;letter-spacing:-0.3px">${t}</h1>`;
const p = (t) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#333">${t}</p>`;
const btn = (label, href) => `<p style="margin:6px 0 20px"><a href="${esc(href)}" style="display:inline-block;background:${ACCENT};color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:999px">${label}</a></p>`;
const quote = (t) => `<table role="presentation" width="100%" style="background:#FBF8F2;border-left:3px solid ${ACCENT};margin:0 0 20px"><tr><td style="padding:12px 16px;font-size:14px;line-height:1.6;color:#333;white-space:pre-wrap">${esc(t)}</td></tr></table>`;
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
    body: h(`Νέο σήμα Buy or wait: ${esc(SIGNAL[d.signal] || d.signal)}`) + kv('Προϊόν', COMMODITY[d.commodity] || d.commodity) + kv('Ορίζοντας', d.horizon) + kv('Ημερομηνία', d.date) + `<div style="height:12px"></div>` + quote(d.rationale) + btn('Άνοιγμα στη Metis', `${SITE}/buy-or-wait`) + p('<span style="font-size:12px;color:#4A5A5E">Ενδεικτικά στοιχεία, όχι επενδυτική συμβουλή.</span>'),
    text: `Buy or wait: ${SIGNAL[d.signal] || d.signal}, ${COMMODITY[d.commodity] || d.commodity}, ${d.horizon}\n\n${d.rationale}`,
  }),
  trialAdmin: (d) => ({
    subject: `Νέο αίτημα δοκιμής: ${d.company}`,
    body: h('Νέο αίτημα δοκιμής 14 ημερών') + kv('Εταιρεία', d.company) + kv('Όνομα', d.name) + kv('Email', d.email) + kv('Τηλέφωνο', d.phone) + `<div style="height:12px"></div>` + quote(d.text) + btn('Έγκριση ή απόρριψη', `${SITE}/admin/trials`),
    text: `${d.company}: ${d.name} <${d.email}>, ${d.phone}

${d.text}`,
  }),
  trialApproved: (d) => ({
    subject: `Η δοκιμή σας στη Metis ξεκίνησε (${d.days} ημέρες)`,
    body: h('Καλώς ήρθατε στη Metis') + p(`Εγκρίναμε τη δοκιμή της <b>${esc(d.company)}</b>: πλήρης πρόσβαση σε όλες τις ενότητες για ${esc(d.days)} ημέρες, έως ${esc(d.until)}. Ως διαχειριστής μπορείτε να προσθέσετε έως ${esc(d.seats)} συναδέλφους από την ενότητα «Η ομάδα σας».`) + btn('Ορισμός κωδικού', d.link) + p('Ο σύνδεσμος λήγει σε μία ώρα. Αν λήξει, χρησιμοποιήστε το «Ξεχάσατε τον κωδικό;» στη σελίδα σύνδεσης.'),
    text: `Η δοκιμή της ${d.company} ξεκίνησε, έως ${d.until}. Ορίστε τον κωδικό σας: ${d.link}`,
  }),
  test: () => ({
    subject: 'Δοκιμαστικό email από τη Metis Energy',
    body: h('Η αποστολή email λειτουργεί') + p('Αυτό είναι δοκιμαστικό μήνυμα από τη διαχείριση της Metis Energy.'),
    text: 'Η αποστολή email λειτουργεί.',
  }),
};

export const TEMPLATE_KEYS = Object.keys(builders);

// Tokens each template can use in an admin-edited version (Admin → Email → Templates).
export const TEMPLATE_VARS = {
  invite: ['company', 'role', 'link'],
  adminInvite: ['link'],
  requestAdmin: ['company', 'from', 'title', 'text'],
  clientReply: ['company', 'from', 'title', 'text'],
  requestReply: ['title', 'text'],
  signal: ['signal', 'commodity', 'horizon', 'date', 'rationale'],
  trialAdmin: ['company', 'name', 'email', 'phone', 'text'],
  trialApproved: ['company', 'days', 'until', 'seats', 'link'],
};

// Codes become the words shown in the email, so {{role}} reads "Αναλυτής", not "analyst".
const prep = (d = {}) => ({ ...d, role: ROLE[d.role] || d.role, commodity: COMMODITY[d.commodity] || d.commodity, signal: SIGNAL[d.signal] || d.signal });
const fill = (s, d, html) => String(s).replace(/\{\{(\w+)\}\}/g, (_, k) => (d[k] == null ? '' : html ? esc(d[k]) : String(d[k])));
export const ADMIN_ALERTS = new Set(['requestAdmin', 'clientReply', 'trialAdmin']);

// Sample data for test sends from Admin → Email.
export const SAMPLE = {
  invite: { company: 'Helios Industrial', role: 'analyst', link: `${SITE}/login` },
  adminInvite: { link: `${SITE}/login` },
  requestAdmin: { company: 'Helios Industrial', from: 'a.marinou@helios.gr', title: 'Σταθερή ή κυμαινόμενη τιμή για το 2027;', text: 'Μας προτείνουν σταθερή τιμή 118 €/MWh για το 2027. Αξίζει σε σχέση με το Day-ahead;' },
  clientReply: { company: 'Helios Industrial', from: 'a.marinou@helios.gr', title: 'Σταθερή ή κυμαινόμενη τιμή για το 2027;', text: 'Ευχαριστούμε. Μπορείτε να δείτε και το προφίλ φυσικού αερίου;' },
  requestReply: { title: 'Σταθερή ή κυμαινόμενη τιμή για το 2027;', text: 'Με το τρέχον προφίλ σας, η σταθερή τιμή είναι περίπου 6% πάνω από τον μέσο Day-ahead + Uplift των τελευταίων 12 μηνών.' },
  signal: { commodity: 'power', signal: 'wait', horizon: 'Q1 2027', date: '2026-10-29', rationale: 'Οι τιμές Day-ahead είναι 69% πάνω από πέρυσι· αναμένουμε αποκλιμάκωση μετά τον Ιανουάριο.' },
  trialAdmin: { company: 'Helios Industrial', name: 'Άννα Μαρίνου', email: 'a.marinou@helios.gr', phone: '+30 210 000 0000', text: 'Θέλουμε να δούμε το κόστος 2027 με βάση το προφίλ μας.' },
  trialApproved: { company: 'Helios Industrial', days: 14, until: '2026-12-03', seats: 3, link: `${SITE}/login` },
  test: {},
};

export const hasTemplate = (key) => Object.hasOwn(builders, key);

/** { subject, html, text } for a template, using the admin's edited version when there is one. */
export function render(key, data, cfg = {}) {
  const d = prep(data);
  const t = builders[key](d);
  const ov = cfg.templates?.[key] || {};
  const subject = ov.subject ? fill(ov.subject, d, false) : t.subject;
  const body = ov.body ? fill(ov.body, d, true) : t.body;
  const text = ov.body ? body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : t.text;
  return { subject, html: layout({ preheader: subject, body, signature: cfg.signature, bannerUrl: cfg.headerBannerUrl }), text };
}

/** Default subject and body of a template with {{token}} placeholders, for the template editor. */
export function templateDefault(key) {
  const t = builders[key](Object.fromEntries(TEMPLATE_VARS[key].map((v) => [v, `{{${v}}}`])));
  return { subject: t.subject, body: t.body };
}
