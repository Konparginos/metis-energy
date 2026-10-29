import nodemailer from 'nodemailer';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { DEFAULTS, hasTemplate, render } from './templates.js';

export { DEFAULTS, OWNERS } from './templates.js';

/* Email engine, ported from energymeets. Sends only via the energymeets.com mailbox over SMTP
   (no third-party email API): SMTP_URL is a Firebase secret, smtp://user:password@host:port.
   Sender, admin-alert recipients, signature and per-email switches are editable in Admin → Email (config/email).
   Every send is recorded in mailLogs, also when no SMTP_URL is set yet. */

// Secrets must exist at deploy time; "unset" is the placeholder until the real value is saved.
const isSet = (v) => v && v !== 'unset';
export const provider = () => (isSet(process.env.SMTP_URL) ? 'smtp' : 'none');

let cache = null, cacheAt = 0;
export async function getConfig() {
  if (cache && Date.now() - cacheAt < 30000) return cache;
  const data = (await getFirestore().doc('config/email').get()).data() || {};
  cache = { ...DEFAULTS, ...data, enabled: { ...DEFAULTS.enabled, ...(data.enabled || {}) } };
  cacheAt = Date.now();
  return cache;
}

export const adminRecipients = (cfg) => String(cfg.adminEmail || '').split(/[,;\s]+/).filter(Boolean);

// Port 465 needs TLS from the first byte, but nodemailer reads "smtp://" as plain, and the server then
// drops the connection. So 465 is always secure, whichever scheme the secret was saved with; 587 uses STARTTLS.
export function smtpOptions(url = process.env.SMTP_URL) {
  const u = new URL(String(url).trim());
  const port = Number(u.port) || 465;
  return { host: u.hostname, port, secure: u.protocol === 'smtps:' || port === 465, auth: { user: decodeURIComponent(u.username), pass: decodeURIComponent(u.password) } };
}

/** Renders a template and sends it. Returns { status, error }: sent | disabled | skipped-no-provider | error. */
export async function sendMail({ to, templateKey, data = {}, force = false }) {
  const cfg = await getConfig();
  if (!to) return { status: 'no-recipient' };
  if (!hasTemplate(templateKey)) return { status: 'unknown-template' };
  if (!force && cfg.enabled[templateKey] === false) {
    await log({ to, templateKey, subject: '(disabled)', status: 'disabled' });
    return { status: 'disabled' };
  }
  const tpl = render(templateKey, data, cfg);
  const from = `${cfg.fromName} <${cfg.fromEmail}>`;
  let status = 'skipped-no-provider', error = null, providerId = null;
  try {
    if (provider() === 'smtp') {
      const info = await nodemailer.createTransport(smtpOptions()).sendMail({ from, to, replyTo: cfg.replyTo || undefined, subject: tpl.subject, html: tpl.html, text: tpl.text });
      providerId = info.messageId || 'smtp';
      status = 'sent';
    }
  } catch (e) {
    status = 'error';
    error = String(e?.message || e);
  }
  await log({ to, from, subject: tpl.subject, templateKey, status, error, providerId, html: tpl.html });
  return { status, error };
}

async function log(entry) {
  try {
    await getFirestore().collection('mailLogs').add({ ...entry, html: entry.html ? String(entry.html).slice(0, 60000) : null, createdAt: FieldValue.serverTimestamp() });
  } catch (e) {
    console.error('mailLog write failed', e);
  }
}
