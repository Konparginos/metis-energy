import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { mergeDaily, pricesFromTar } from './eex.js';

// Minimal tar archive, as File Cloud's "?download" returns: 512-byte header per file, data padded to 512.
const tar = (files) => Buffer.concat([...files.flatMap(([name, data]) => {
  const h = Buffer.alloc(512);
  h.write(name, 0);
  h.write(`${data.length.toString(8).padStart(11, '0')}\0`, 124);
  h.write('0', 156);
  return [h, data, Buffer.alloc((512 - (data.length % 512)) % 512)];
}), Buffer.alloc(1024)]);

const HEAD = 'TrdDate,Cmdty,Area,ShortCode,Maturity,InstrumenISIN,ProductType,ExpiryDate,Currency,UOM,Px,Tm,UpdtAct,CreationTm';
const row = (d, code, mat, px) => `${d},X,X,${code},${mat},ISIN,Future,${d},EUR,MWh,${px},T,NEW,T`;

test('EEX month archive: front TTF month, Greek month and year, environmental files ignored, date range respected', () => {
  const t = tar([
    ['spr/2026/10/SettlementNATGASDerivatives_TTF_Future_20261027.csv.gz', gzipSync([HEAD, row('2026-10-27', 'G3BM', '202612', 31.4), row('2026-10-27', 'G3BM', '202611', 30.9), row('2026-10-27', 'G3BQ', '202701', 33)].join('\n'))],
    ['spr/2026/10/SettlementENVIRONMENTALSDerivatives_EU_Future_20261027.csv.gz', gzipSync([HEAD, row('2026-10-27', 'FEUA', '202611', 70), row('2026-10-27', 'FEUA', '202612', 71.25), row('2026-10-27', 'FEUA', '202712', 74)].join('\n'))],
    ['spr/2026/10/SettlementPOWERDerivatives_GR_Future_20261027.csv.gz', gzipSync([HEAD, row('2026-10-27', 'FFBM', '202611', 118), row('2026-10-27', 'FFBY', '202701', 104.5)].join('\n'))],
    ['spr/2026/10/SettlementNATGASDerivatives_TTF_Future_20261001.csv.gz', gzipSync([HEAD, row('2026-10-01', 'G3BM', '202611', 29)].join('\n'))],
    ['spr/2026/10/StatisticsNATGASDerivatives_TTF_Future_20261027.csv.gz', gzipSync('ignored')],
  ]);
  assert.deepEqual(pricesFromTar(t, '2026-10-02', '2026-10-31'), {
    ttf: { '2026-10-27': 30.9 }, gr_month: { '2026-10-27': 118 }, gr_year: { '2026-10-27': 104.5 },
  });
});

test('daily settlements replace the month\'s single monthly value', () => {
  assert.deepEqual(mergeDaily({ '2026-09': 40, '2026-10': 41 }, { '2026-10-27': 30.9 }), { '2026-09': 40, '2026-10-27': 30.9 });
});
