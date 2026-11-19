// One-off: copy the prototype's data into the platform, labelled as such.
// Usage: node scripts/import-prototype.mjs <saved prototype .html>
// Reads the file as text and parses numbers only; nothing from the page is executed.
import { readFileSync } from 'node:fs';
import { localHourKey } from '../functions/lib/parsers.js';

const html = readFileSync(process.argv[2], 'utf8');
const FN = 'https://europe-west1-metis-energy.cloudfunctions.net';
const call = async (name, data) => {
  const res = await fetch(`${FN}/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data }) });
  const j = await res.json();
  if (j.error) throw new Error(`${name}: ${j.error.message}`);
  return j.result;
};

// Monthly series from Jan 2020: S = { power: {..., d:[].concat(Y(...),Y(...))}, gas, ... } (environmental eua/go not imported)
const META = {
  power: { id: 'power', name: 'Greek DAM baseload (monthly)', unit: '€/MWh' },
  gas: { id: 'ttf', name: 'TTF natural gas', unit: '€/MWh' },
};
for (const [key, meta] of Object.entries(META)) {
  const block = html.match(new RegExp(`\\b${key}:\\{name:"[^"]*",unit:"[^"]*",src:"([^"]*)",conf:"([^"]*)"[^]*?d:\\[\\]\\.concat\\(([^]*?)\\)\\}`));
  if (!block) throw new Error(`series ${key} not found`);
  const values = [...block[3].matchAll(/-?\d*\.?\d+/g)].map((m) => +m[0]);
  const points = Object.fromEntries(values.map((v, i) => [`${2020 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`, v]));
  const r = await call('saveSeriesData', {
    id: meta.id, replace: true, points,
    meta: { name: meta.name, unit: meta.unit, freq: 'monthly', licence: 'display', source: `${block[1]} (prototype data)`, confidence: block[2], note: 'Monthly averages reconstructed from public reports and anchored on published datapoints, copied from the Metis prototype. Indicative until replaced by the licensed or official feed.' },
  });
  console.log(meta.id, values.length, 'months', r);
}

// Hourly DAM: HDAM = { t0: Date.UTC(2024,11,31,22), s: "<3 base-36 chars per hour>" }, price = (n - 500) / 10, "---" = missing.
const t0 = Date.UTC(2024, 11, 31, 22);
const s = html.match(/const HDAM=\{t0:Date\.UTC\(2024,11,31,22\),s:"([0-9a-z-]+)"/)[1];
const hours = {};
for (let i = 0; i < s.length / 3; i++) {
  const c = s.substr(i * 3, 3);
  if (c !== '---') hours[localHourKey(t0 + i * 36e5)] = (parseInt(c, 36) - 500) / 10;
}
const keys = Object.keys(hours).map(Number).sort((a, b) => a - b);
console.log('hourly DAM', keys.length, 'hours', new Date(keys[0] * 36e5).toISOString(), '→', new Date(keys.at(-1) * 36e5).toISOString());
console.log(await call('importDam', {
  hours, licence: 'internal', source: 'energy-charts.info (ENTSO-E data), prototype import',
  note: 'Licensed for Metis internal use only. Replace with the ENTSO-E feed before clients see it.',
}));
