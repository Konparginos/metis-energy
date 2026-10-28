import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNum, parseTS, aggregate, priceElectricity, priceMonthly, parseSeriesCSV } from './cost.js';

test('series CSV and monthly gas pricing', () => {
  assert.deepEqual(parseSeriesCSV('date;value\n2026-01;62,1\n15/02/2026;50\nbad;1'), { '2026-01': 62.1, '2026-02-15': 50 });
  const r = priceMonthly({ '2026-01': 2000, '2026-02': 1000 }, (ym) => (ym === '2026-01' ? 50 : null));
  assert.equal(r.cost, 100);
  assert.equal(r.uncoveredMWh, 1);
  assert.deepEqual(parseTS(new Date(Date.UTC(2026, 0, 2, 13, 15))), [2026, 1, 2, 13, 15]);
});

test('parseNum handles Greek and English separators', () => {
  assert.equal(parseNum('1.234,5'), 1234.5);
  assert.equal(parseNum('1,234.5'), 1234.5);
  assert.equal(parseNum('12,5'), 12.5);
  assert.equal(parseNum(''), null);
  assert.ok(Number.isNaN(parseNum('abc')));
});

test('parseTS reads ISO, Greek dates and Excel serials', () => {
  assert.deepEqual(parseTS('2025-01-01 13:15'), [2025, 1, 1, 13, 15]);
  assert.deepEqual(parseTS('01/02/2025 00:45'), [2025, 2, 1, 0, 45]);
  assert.deepEqual(parseTS(45658 + 13 / 24), [2025, 1, 1, 13, 0]);
});

test('15-minute readings roll up to hours and price with the formula', () => {
  const rows = [];
  for (const h of [0, 1]) for (const m of [0, 15, 30, 45]) rows.push([`2025-01-01 0${h}:${String(m).padStart(2, '0')}`, '250']);
  rows.push(['2025-01-01 02:00', '']); // empty reading skipped
  const a = aggregate(rows);
  assert.equal(a.stepMin, 15);
  assert.equal(a.totalKWh, 2000);
  assert.equal(a.peakKW, 1000);
  assert.deepEqual(a.hourly.kwh, [1000, 1000]);
  assert.equal(a.skipped.empty, 1);

  const dam = (hk) => (hk === a.hourly.start ? 100 : 120);
  const r = priceElectricity(a.hourly, dam, () => [5, 2, 1], 0.2);
  assert.equal(r.mwh, 2);
  assert.equal(Math.round(r.cost * 100) / 100, 100 + 120 + 2 * (8 + 0.2));
  assert.equal(Math.round(r.perMWh * 100) / 100, 118.2);

  const missing = priceElectricity(a.hourly, dam, () => null, 0.2);
  assert.equal(missing.uncoveredMWh, 2);
  assert.equal(missing.perMWh, null);
});
