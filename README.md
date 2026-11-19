# Metis Energy platform

Energy procurement intelligence for Greek C&I buyers. Live at https://metis-energy.web.app (Firebase project `metis-energy`, EU region).

## Structure

```
METIS/
├── src/                      Web app (React + Vite)
│   ├── App.jsx               Routing by path, language, login, test-mode banner
│   ├── router.jsx            Paths: /prices /imbalance /uplift /profile /buy-or-wait /advisory /data-sources, /admin/...
│   ├── Shell.jsx, Logo.jsx   Side menu, top bar, Metis logo
│   ├── Member.jsx            Client view (the prototype's tabs)
│   ├── MarketModule.jsx      Price curves, Imbalance, Uplift, Data sources
│   ├── CostModule.jsx        Your profile: upload, sample, pricing
│   ├── Modules.jsx           Buy or wait, Advisory
│   ├── Admin*.jsx            Admin area: clients, data feeds, formula, signals, requests, legal texts, settings
│   ├── Catalogue.jsx         Where each data series should come from
│   ├── insights.jsx          Plain-language reading of the numbers (EN/EL)
│   ├── i18n.js               All texts, Greek (default) and English
│   └── styles.css            Design tokens, layout, motion
├── functions/                Cloud Functions (Node 22, europe-west1)
│   ├── index.js              Users and roles, feeds, pricing, imports
│   └── lib/                  Parsers (IPTO, ENTSO-E), cost formula, feed writers + tests
├── tests/rules.test.js       Security-rules tests (Firestore emulator)
├── scripts/                  One-off: import-prototype.mjs (prototype data, labelled)
├── firestore.rules           Who can read and write what
├── firebase.json             Hosting, functions, Firestore config
└── index.html, vite.config.js, package.json
```

## Brand, landing, trials, CRM

- Brand: Metis brand guidelines v1.0. Logos are the package SVGs (`src/brand/`, favicons in `public/brand/`), fonts Manrope and Comfortaa self-hosted in `public/fonts/`, palette tokens at the top of `src/styles.css`.
- Landing page (`/` for signed-out visitors, `src/Landing.jsx`): hero with the Buyometer, the three modules, a sample dashboard laid out like the Dashboard Design (sample data from `src/demo.js`, labelled as such) and the 14-day trial request form.
- Trials: requests land in `trialRequests` and alert the admins; Admin → Trial requests → Approve creates the company with every module for 14 days and emails the requester (the owner) a password link.
- Client owners manage their team under "Your team": up to 3 colleagues, Analyst or Viewer (`SEATS` in `functions/index.js` and `src/Team.jsx`).
- Admin → Clients → a client: Account, CRM (contact, stage, notes), Contracts and Invoices (amounts, due dates, overdue, document links). Metis staff only.
- Environmental series (EUA carbon, Guarantees of Origin) were removed in Nov 2026.

## Commands

```bash
npm install && (cd functions && npm install)   # once, after copying the folder
npm run dev                                    # local preview at http://localhost:5173
npm test                                       # formula and parser tests
npm run test:rules                             # security rules (needs Java)
npm run deploy                                 # build and deploy everything
```

## Data

- IPTO imbalance and uplift accounts: official, collected daily at 09:00 Athens, history from Oct 2022.
- Hourly day-ahead (Jan 2025 to Sep 2026): copied from the prototype, licensed for Metis internal use only. From October 2026 the official HEnEx Day-ahead results are collected daily (public files, no token; HEnEx keeps the last 7 days online). ENTSO-E (API token in Admin → Data feeds) can backfill older months.
- TTF (G3BM front month) and Greek power forwards (FFBM, FFBY): EEX end-of-day settlements from the EEX Group DataSource File Cloud (`functions/lib/eex.js`), collected daily at 09:00 Athens once the File Cloud access token is saved in Admin → Data feeds. Until then these are the prototype series, labelled Indicative / Low confidence.
- Internal use only: the platform is for Metis staff, so internal-usage licences (EEX DataSource webshop default) cover everything shown.

## Email

Same setup as energymeets: SMTP from the energymeets.com mailbox via nodemailer (`functions/lib/email.js`), Greek templates in `functions/lib/templates.js`, every send logged in `mailLogs`. Sender, admin-alert recipients (konstantinosparginos@gmail.com, ipsarros81@gmail.com), signature, per-email switches, template texts (subject and HTML body with {{placeholders}}, live preview) and a header banner image: Admin → Email. The banner is stored in Firebase Storage (Firebase console → Storage → Get started, once). Sends: invitations with the password link, Advisory request/reply alerts, new Buy or wait signals. The mailbox credentials are the `SMTP_URL` secret (`smtp://user:app-password@smtp.gmail.com:465`); without it emails are logged, not sent.

## Before real clients

1. `firebase functions:secrets:set SMTP_URL` (same mailbox as energymeets), then deploy.
2. Admin → Settings: add the admins (they get an email with their password link), then tick "Login required" (test mode gives everyone admin access).
3. Admin → Data feeds: save the ENTSO-E token and the EEX File Cloud token (EEX DataSource Hub → Access Token; renew yearly), backfill both.
4. Admin → Legal texts: privacy policy, terms, disclaimer.
