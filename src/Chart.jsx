import { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const FONT = 'Manrope'; // brand typeface, tabular figures come from the font

// datasets: [{ label, data, color: '--css-token', band?: true }]; a band dataset fills down to the next one.
// Labels starting with "_" stay out of the legend and tooltip. `plain` drops the panel frame (for charts inside a panel).
// allTicks: show every x label (a forward curve's contracts) instead of thinning them to six.
export default function LineChart({ title, sub, labels, datasets, unit, type = 'line', plain, small, allTicks }) {
  const ref = useRef();
  useEffect(() => {
    const css = getComputedStyle(document.documentElement);
    const v = (n) => css.getPropertyValue(n).trim();
    const chart = new Chart(ref.current, {
      type,
      data: {
        labels,
        datasets: datasets.map(({ color, band, ...d }) => ({
          borderColor: v(color), backgroundColor: type === 'bar' ? `${v(color)}cc` : `${v(color)}2e`, // hex token + alpha
          borderWidth: type === 'bar' ? 0 : band ? 0 : 1.8, borderRadius: 4, fill: band ? '+1' : false, spanGaps: false, tension: 0.25, ...d,
        })),
      },
      options: {
        animation: reduced() ? false : { duration: 700, easing: 'easeOutQuart' },
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false }, elements: { point: { radius: 0, hoverRadius: 4 } },
        scales: {
          x: { ticks: { color: v('--faint'), maxTicksLimit: allTicks ? 99 : 6, autoSkip: !allTicks, maxRotation: 0, font: { family: FONT, size: 11 } }, grid: { display: false }, border: { color: v('--line') } },
          y: { ticks: { color: v('--faint'), font: { family: FONT, size: 11 } }, grid: { color: v('--line') }, border: { display: false }, title: { display: !!unit, text: unit, color: v('--faint'), font: { family: FONT, size: 11 } } },
        },
        plugins: {
          legend: { display: !small, position: 'top', align: 'end', labels: { color: v('--muted'), boxWidth: 10, boxHeight: 2, font: { family: FONT, size: 12 }, filter: (i) => !i.text.startsWith('_') } },
          tooltip: { backgroundColor: '#0B3D4C', titleColor: '#F6EFE3', bodyColor: '#C9D9DC', padding: 10, cornerRadius: 8, titleFont: { family: FONT }, bodyFont: { family: FONT }, filter: (i) => !i.dataset.label.startsWith('_') },
        },
      },
    });
    let live = true;
    document.fonts?.load(`12px ${FONT}`).then(() => live && chart.update('none'));
    return () => { live = false; chart.destroy(); };
  }, [labels, datasets, unit, type, small, allTicks]);
  return (
    <figure className={`chart${plain ? ' plain' : ''}${small ? ' small' : ''}`}>
      {title && <figcaption>{title}{sub && <span className="fine"> {sub}</span>}</figcaption>}
      <div className="chart-box"><canvas ref={ref} role="img" aria-label={title || unit} /></div>
    </figure>
  );
}
