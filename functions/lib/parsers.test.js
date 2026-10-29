import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseImbabe, summarizeDay, fileVersion, localHourKey, parseEntsoeA44, parseHenexResults, henexResultLinks } from './parsers.js';

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

test('HEnEx results: CET periods become Athens hours, clock-change day keeps 25 hours', () => {
  const H = ['TARGET', 'BIDDING_ZONE_DESCR', 'SIDE_DESCR', 'DDAY', 'ASSET_DESCR', 'CLASSIFICATION', 'DELIVERY_MTU', 'DELIVERY_DURATION', 'SORT', 'MCP'];
  const day = (d, n, price) => Array.from({ length: n }, (_, i) => ['DAM', 'Mainland Greece', 'Buy', d, 'LOAD', 'X', '', 15, i + 1, price(i)]);
  // 29 Oct 2026 (CET = UTC+1): period 1 is 00:00 CET = 01:00 Athens; the price repeats on two asset rows.
  const h = parseHenexResults([H, ...day('20261029', 96, (i) => Math.floor(i / 4)), ...day('20261029', 96, (i) => Math.floor(i / 4))]);
  assert.equal(Object.keys(h).length, 24);
  assert.equal(h[localHourKey(Date.UTC(2026, 9, 28, 23))], 0); // 23:00Z = 01:00 Athens
  assert.equal(h[Date.UTC(2026, 9, 29, 1) / 36e5], 0);
  assert.equal(h[Date.UTC(2026, 9, 30, 0) / 36e5], 23); // last CET hour = 00:00 next day in Athens
  // 25 Oct 2026: 100 periods, Athens repeats 03:00, so two clock hours average 8 periods into the same key.
  const dst = parseHenexResults([H, ...day('20261025', 100, () => 50)]);
  assert.equal(Object.keys(dst).length, 24);
  assert.equal(dst[Date.UTC(2026, 9, 25, 3) / 36e5], 50);
});

test('HEnEx publication page: newest version per day, absolute links', () => {
  const a = (u, name) => `<a href="/c/document_library/get_file?uuid=${u}&groupId=20126" style="x"><i class="icon-download"></i>\n &nbsp; ${name}</a>`;
  const html = a('u1', '20261028_EL-DAM_Results_EN_v01') + a('u2', '20261028_EL-DAM_Results_EN_v02') + a('u3', '20261029_EL-DAM_AggrCurves_EN_v01') + a('u4', '20261029_EL-DAM_Results_EN_v01');
  assert.deepEqual(henexResultLinks(html), [
    { day: '2026-10-28', version: 2, url: 'https://www.enexgroup.gr/c/document_library/get_file?uuid=u2&groupId=20126' },
    { day: '2026-10-29', version: 1, url: 'https://www.enexgroup.gr/c/document_library/get_file?uuid=u4&groupId=20126' },
  ]);
});
