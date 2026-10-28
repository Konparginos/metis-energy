import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseImbabe, summarizeDay, fileVersion, localHourKey, parseEntsoeA44 } from './parsers.js';

const HEAD = [undefined, 'STARTDATE', 'ENDDATE', 'Up', 'Down', 'ISP', 'Dev', 'Curt_Flag', 'Imbalance Price  (€/MWh)', 'mFRR Price UP (€/MWh)',
  'mFRR Price Down (€/MWh)', 'Uplift Account 1 (€/MWh)', 'Uplift Account 2 (€/MWh)', 'Uplift Account 3 (€/MWh)'];
const row = (iso, imb, u) => [undefined, new Date(iso), null, 0, 0, 0, 0, 0, imb, imb, 0, u[0], u[1], u[2]];

test('IMBABE rows land in 96 quarter slots per day', () => {
  const days = parseImbabe([HEAD, row('2026-10-12T00:00:00Z', 100, [6, 0.3, -6]), row('2026-10-12T00:15:00Z', 300, [10, 0.5, 2]), row('2026-10-13T23:45:00Z', 50, [1, 1, 1])]);
  assert.deepEqual(Object.keys(days), ['2026-10-12', '2026-10-13']);
  assert.equal(days['2026-10-12'].imb.length, 96);
  assert.equal(days['2026-10-13'].imb[95], 50);
  const s = summarizeDay(days['2026-10-12']);
  assert.equal(s.imb, 200);
  assert.equal(s.imbMin, 100);
  assert.equal(s.u1, 8);
});

test('IMBABE header change is reported, not silently misread', () => {
  assert.throws(() => parseImbabe([[undefined, 'STARTDATE', 'Something else']]), /header changed/);
});

test('file version comes from the name', () => {
  assert.equal(fileVersion('https://x/20261012_IMBABE_02.xlsx'), 2);
  assert.equal(fileVersion('https://x/20261012_IMBABE.xlsx'), 1);
});

test('Athens local hour key handles DST', () => {
  assert.equal(localHourKey(Date.parse('2026-07-01T00:00Z')), Date.UTC(2026, 6, 1, 3) / 36e5); // UTC+3 summer
  assert.equal(localHourKey(Date.parse('2026-01-01T00:00Z')), Date.UTC(2026, 0, 1, 2) / 36e5); // UTC+2 winter
});

test('ENTSO-E 15-minute prices average to the hour, with A03 gaps carried forward', () => {
  const xml = `<Publication_MarketDocument><TimeSeries><Period>
    <timeInterval><start>2026-01-01T22:00Z</start><end>2026-01-01T23:00Z</end></timeInterval>
    <resolution>PT15M</resolution>
    <Point><position>1</position><price.amount>100</price.amount></Point>
    <Point><position>3</position><price.amount>140</price.amount></Point>
  </Period></TimeSeries></Publication_MarketDocument>`;
  const r = parseEntsoeA44(xml);
  assert.deepEqual(Object.values(r), [120]); // 100, 100, 140, 140
  assert.equal(+Object.keys(r)[0], Date.UTC(2026, 0, 2, 0) / 36e5); // 22:00Z = 00:00 Athens
});
