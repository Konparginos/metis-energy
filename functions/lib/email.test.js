import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render, SAMPLE, TEMPLATE_KEYS, templateDefault } from './templates.js';
import { DEFAULTS, adminRecipients, smtpOptions } from './email.js';

test('every template renders, escapes user text and keeps market jargon in English', () => {
  for (const k of TEMPLATE_KEYS) {
    const r = render(k, SAMPLE[k], DEFAULTS);
    assert.ok(r.subject && r.html.includes('</html>') && r.text, k);
  }
  const r = render('requestAdmin', { ...SAMPLE.requestAdmin, text: '<script>x</script>' }, DEFAULTS);
  assert.ok(!r.html.includes('<script>') && r.html.includes('&lt;script&gt;'));
  assert.match(render('signal', SAMPLE.signal, DEFAULTS).subject, /^Buy or wait: Wait/);
});

test('SMTP options: port 465 is TLS whatever the scheme, 587 upgrades', () => {
  assert.deepEqual(smtpOptions('smtp://ioannis%40energymeets.com:p%40ss@smtp.gmail.com:465'),
    { host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: 'ioannis@energymeets.com', pass: 'p@ss' } });
  assert.equal(smtpOptions('smtp://u:p@smtp.gmail.com:587').secure, false);
});

test('admin alerts go to both owners by default', () => {
  assert.deepEqual(adminRecipients(DEFAULTS), ['konstantinosparginos@gmail.com', 'ipsarros81@gmail.com']);
  assert.deepEqual(adminRecipients({ adminEmail: 'a@x.gr; b@x.gr' }), ['a@x.gr', 'b@x.gr']);
});

test('admin-edited templates: tokens filled, user text escaped, banner replaces the logo', () => {
  const cfg = { ...DEFAULTS, headerBannerUrl: 'https://img.example/banner.png', templates: { requestAdmin: { subject: 'Νέο: {{title}} ({{company}})', body: '<p>{{from}}: {{text}}</p>' } } };
  const r = render('requestAdmin', { ...SAMPLE.requestAdmin, text: '<b>x</b>' }, cfg);
  assert.equal(r.subject, `Νέο: ${SAMPLE.requestAdmin.title} (Helios Industrial)`);
  assert.ok(r.html.includes('<p>a.marinou@helios.gr: &lt;b&gt;x&lt;/b&gt;</p>'));
  assert.ok(r.html.includes('<img src="https://img.example/banner.png"') && !r.html.includes('Ride the curve'));
  assert.equal(render('invite', SAMPLE.invite, { templates: { invite: { subject: '{{role}}' } } }).subject, 'Αναλυτής');
  assert.equal(templateDefault('signal').subject, 'Buy or wait: {{signal}}, {{commodity}}');
});
