import { useT } from './i18n.js';

// Reference list from the prototype's source review: where each series should come from.
const REC = [
  ['Greek DAM price', 'HEnEx DAM results / ENTSO-E', 'Daily files / API', 'free', 'Connected via ENTSO-E once the token is saved.'],
  ['Imbalance price, Uplift 1-3', 'IPTO IMBABE files', 'Weekly XLSX, 15-minute', 'free', 'Connected and updating daily.'],
  ['Greek power forwards', 'EEX Greek Power Futures, HEnEx derivatives', 'EEX DataSource API', 'paid', 'Needed for Buy-or-Wait and cost forecasts.'],
  ['TTF front month and strip', 'ICE Endex settlements', 'ICE data feed', 'paid', 'EEX TTF settlements as alternative. Licence must cover display.'],
  ['TTF MA ICIS Heren', 'ICIS', 'ICIS subscription', 'paid', 'Showing it to clients is redistribution: use "calculations only" unless the licence covers display.'],
  ['EUA Dec front and strip', 'ICE Endex EUA futures', 'ICE data feed', 'paid', 'EEX primary auction results are free daily and track futures closely.'],
  ['Guarantees of Origin', 'EEX GO Futures', 'EEX DataSource API', 'paid', 'EEX French GO auctions are free; HEnEx runs a GO market, DAPEEP is the Greek registry.'],
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
