import { useT } from './i18n.js';

// Where each series comes from. Metis staff only, so internal-usage licences are enough throughout.
const REC = [
  ['Greek DAM price', 'HEnEx DAM results / ENTSO-E', 'Daily files / API', 'free', 'Connected: HEnEx results files daily (no token). ENTSO-E adds older history once its token is saved.'],
  ['Imbalance price, Uplift 1-3', 'IPTO IMBABE files', 'Weekly XLSX, 15-minute', 'free', 'Connected and updating daily.'],
  ['Greek power forwards', 'EEX Greek Power Base Month / Year Futures (FFBM, FFBY)', 'EEX File Cloud, end of day', 'paid', 'Connected via EEX File Cloud once the token is saved (series gr_month, gr_year). For Buy or wait and cost forecasts.'],
  ['TTF front month', 'EEX TTF Natural Gas Month Future (G3BM)', 'EEX File Cloud, end of day', 'paid', 'Connected via EEX File Cloud once the token is saved. ICE Endex is the larger TTF market; EEX settles close to it.'],
  ['TTF MA ICIS Heren', 'ICIS', 'ICIS subscription', 'paid', 'Optional: only if supply contracts are indexed to the ICIS month-ahead assessment.'],
  ['EUA Dec benchmark', 'EEX EUA Future (FEUA, nearest December)', 'EEX File Cloud, end of day', 'paid', 'Connected via EEX File Cloud once the token is saved. Free fallback: EEX primary auction results.'],
  ['Guarantees of Origin', 'EEX European Renewable Power GO Future (EGOE)', 'EEX File Cloud, end of day', 'paid', 'Connected via EEX File Cloud once the token is saved. HEnEx runs a GO market, DAPEEP is the Greek registry.'],
  ['Solar and wind capture prices', 'DAPEEP monthly reports', 'Reports', 'free', 'Can also be computed from ENTSO-E prices and generation.'],
];

export function RecommendedSources() {
  const t = useT();
  return (
    <section className="panel">
      <h2>{t('recSources')}</h2>
      <p className="fine">{t('recSourcesSub')}</p>
      <div className="scroll">
        <table>
          <thead><tr><th>{t('series')}</th><th>{t('source')}</th><th>{t('access')}</th><th>{t('costCol')}</th><th>{t('note')}</th></tr></thead>
          <tbody>{REC.map(([a, b, c, d, e]) => <tr key={a}><td><b>{a}</b></td><td>{b}</td><td>{c}</td><td><span className={`badge ${d === 'free' ? 'ok' : 'neutral'}`}>{d === 'free' ? t('free') : t('paidLicence')}</span></td><td className="fine">{e}</td></tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}
