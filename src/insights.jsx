// Plain-language reading of the numbers, in Greek and English. Every sentence is built from the data on screen.
import { Lightbulb, Question } from '@phosphor-icons/react';
import { useT, loc } from './i18n.js';

const n = (v, d = 2) => (v == null ? '-' : v.toLocaleString(loc(), { minimumFractionDigits: d, maximumFractionDigits: d }));
const pct = (a, b) => (a != null && b ? Math.round((a / b - 1) * 100) : null);
export const monthName = (ym, lang) => (ym ? new Date(+ym.slice(0, 4), +ym.slice(5) - 1, 1).toLocaleString(lang === 'el' ? 'el-GR' : 'en-GB', { month: 'long', year: 'numeric' }) : '');
const cmp = (p, lang, what) => {
  if (p == null) return '';
  const abs = Math.abs(p);
  if (lang === 'el') return abs < 3 ? `σχεδόν ίδια με ${what}` : `${abs}% ${p > 0 ? 'υψηλότερα από' : 'χαμηλότερα από'} ${what}`;
  return abs < 3 ? `about the same as ${what}` : `${abs}% ${p > 0 ? 'above' : 'below'} ${what}`;
};

export function Insight({ lines, help }) {
  const t = useT();
  return (
    <div className="insight">
      <Lightbulb size={20} weight="duotone" className="insight-icon" />
      <div className="grow">
        {lines.filter(Boolean).map((l, i) => <p key={i}>{l}</p>)}
        {help && (
          <details className="howto">
            <summary><Question size={14} />{t('howToRead')}</summary>
            <p>{help}</p>
          </details>
        )}
      </div>
    </div>
  );
}

export function pricesInsight(lang, commodities) {
  return commodities.map((c) => {
    const p = c.yoy == null ? null : Math.round(c.yoy);
    const when = monthName(c.last, lang);
    if (lang === 'el') return `${c.name}: ${n(c.value)} ${c.unit} (${when})${p == null ? '' : `, ${cmp(p, lang, 'ένα χρόνο πριν')}`}.`;
    return `${c.name}: ${n(c.value)} ${c.unit} in ${when}${p == null ? '' : `, ${cmp(p, lang, 'a year earlier')}`}.`;
  });
}

export const pricesHelp = (lang) => (lang === 'el'
  ? 'Οι κάρτες δείχνουν τον μηνιαίο μέσο κάθε προϊόντος. Στο διάγραμμα σύγκρισης κάθε σειρά ξεκινά από το 100, ώστε να φαίνεται ποιο προϊόν κινήθηκε περισσότερο, ανεξάρτητα από τη μονάδα του. Η ωριαία τιμή ΑΕΗ δείχνει τον ημερήσιο μέσο και, σκιασμένο, το εύρος από τη φθηνότερη έως την ακριβότερη ώρα.'
  : 'Cards show each commodity\'s monthly average. In the comparison chart every series starts at 100, so you can see which one moved most regardless of its unit. The hourly day-ahead chart shows the daily average and, shaded, the range from the cheapest to the most expensive hour.');

export function imbalanceInsight(lang, s, month) {
  const p = pct(s.month, s.year), when = monthName(month, lang);
  return lang === 'el'
    ? [`${when}: η τιμή απόκλισης ήταν κατά μέσο όρο ${n(s.month)} €/MWh, ${cmp(p, lang, `τον μέσο 12 μηνών (${n(s.year)} €/MWh)`)}.`,
      `Τους τελευταίους 12 μήνες τα 15λεπτα κυμάνθηκαν από ${n(s.lo)} έως ${n(s.hi)} €/MWh.`]
    : [`In ${when} the imbalance price averaged €${n(s.month)}/MWh, ${cmp(p, lang, `its 12-month average of €${n(s.year)}`)}.`,
      `Over the last 12 months single quarter-hours ranged from €${n(s.lo)} to €${n(s.hi)}/MWh.`];
}

export const imbalanceHelp = (lang) => (lang === 'el'
  ? 'Η τιμή απόκλισης είναι αυτό που πληρώνει (ή λαμβάνει) ο προμηθευτής για κάθε MWh που καταναλώνεται πάνω (ή κάτω) από το πρόγραμμα. Όταν είναι υψηλή, η ακριβής πρόβλεψη κατανάλωσης και η ευέλικτη λειτουργία αξίζουν περισσότερο, και τα συμβόλαια με χρέωση αποκλίσεων κοστίζουν ακριβότερα.'
  : 'The imbalance price is what a supplier pays (or receives) for every MWh consumed above (or below) its schedule. When it runs high, accurate consumption forecasts and flexible operation are worth more, and contracts that pass imbalance costs through become more expensive.');

export function upliftInsight(lang, stats, month) {
  const total = stats.reduce((a, s) => a + (s.month || 0), 0), totalY = stats.reduce((a, s) => a + (s.year || 0), 0);
  const big = stats.reduce((b, s, i) => ((s.month || 0) > (stats[b].month || 0) ? i : b), 0);
  const share = total ? Math.round(((stats[big].month || 0) / total) * 100) : 0;
  const when = monthName(month, lang), p = pct(total, totalY);
  return lang === 'el'
    ? [`${when}: οι λογαριασμοί προσαυξήσεων πρόσθεσαν ${n(total)} €/MWh σε κάθε MWh κατανάλωσης, ${cmp(p, lang, 'τον μέσο 12 μηνών')}.`,
      `Ο μεγαλύτερος είναι ο Λογαριασμός ${big + 1} με ${n(stats[big].month)} €/MWh (${share}% του συνόλου).`]
    : [`In ${when} the uplift accounts added €${n(total)}/MWh to every MWh consumed, ${cmp(p, lang, 'the 12-month average')}.`,
      `The largest is Account ${big + 1} at €${n(stats[big].month)}/MWh (${share}% of the total).`];
}

export const upliftHelp = (lang) => (lang === 'el'
  ? 'Οι λογαριασμοί προσαυξήσεων ανακτούν από όλους τους καταναλωτές κόστη εξισορρόπησης και λειτουργίας του συστήματος, ανά MWh. Προστίθενται πάνω στην τιμή ενέργειας στον λογαριασμό σας, γι\' αυτό μετρούν στο συνολικό κόστος προμήθειας.'
  : 'Uplift accounts recover balancing and system-operation costs from all consumers, per MWh. They come on top of the energy price in your bill, which is why they matter for your total procurement cost.');

export function profileInsight(lang, p, r) {
  if (!r?.perMWhParts) {
    return r ? [lang === 'el' ? `Το προφίλ κοστίζει ${n(r.perMWh)} €/MWh, σύνολο ${n(r.cost, 0)} €.` : `The profile costs €${n(r.perMWh)}/MWh, €${n(r.cost, 0)} in total.`] : [];
  }
  const x = r.perMWhParts, up = (x.u1 || 0) + (x.u2 || 0) + (x.u3 || 0), damShare = r.perMWh ? Math.round((x.dam / r.perMWh) * 100) : 0;
  const lf = Math.round(p.loadFactor * 100);
  return lang === 'el'
    ? [`Με τον τύπο της Metis το προφίλ κοστίζει ${n(r.perMWh)} €/MWh, συνολικά ${n(r.cost, 0)} € για ${n(r.mwh, 0)} MWh.`,
      `Η ενέργεια (ΑΕΗ) είναι το ${damShare}% του κόστους· οι προσαυξήσεις προσθέτουν ${n(up)} €/MWh.`,
      `Συντελεστής φορτίου ${lf}%: ${lf >= 60 ? 'σταθερή κατανάλωση, που συνήθως πετυχαίνει χαμηλότερη μέση τιμή' : 'κατανάλωση με αιχμές, οπότε η μετατόπιση φορτίου σε φθηνές ώρες μπορεί να μειώσει το κόστος'}.`]
    : [`With the Metis formula this profile costs €${n(r.perMWh)}/MWh, €${n(r.cost, 0)} in total for ${n(r.mwh, 0)} MWh.`,
      `Energy (day-ahead) is ${damShare}% of the cost; uplift adds €${n(up)}/MWh.`,
      `Load factor ${lf}%: ${lf >= 60 ? 'a flat profile, which usually secures a lower average price' : 'a peaky profile, so moving load into cheaper hours could lower the cost'}.`];
}
