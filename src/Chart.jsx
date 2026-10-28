import { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// datasets: [{ label, data, color: '--css-token', band?: true }]; a band dataset fills down to the next one.
// Labels starting with "_" stay out of the legend and tooltip. `plain` drops the panel frame (for charts inside a panel).
export default function LineChart({ title, sub, labels, datasets, unit, type = 'line', plain, small }) {
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
          x: { ticks: { color: v('--faint'), maxTicksLimit: 6, maxRotation: 0, font: { family: 'Geist Mono', size: 10 } }, grid: { display: false }, border: { color: v('--line') } },
          y: { ticks: { color: v('--faint'), font: { family: 'Geist Mono', size: 10 } }, grid: { color: v('--line') }, border: { display: false }, title: { display: !!unit, text: unit, color: v('--faint'), font: { size: 10 } } },
        },
        plugins: {
          legend: { display: !small, position: 'top', align: 'end', labels: { color: v('--muted'), boxWidth: 10, boxHeight: 2, font: { family: 'Geist', size: 11 }, filter: (i) => !i.text.startsWith('_') } },
          tooltip: { backgroundColor: '#0F1A24', titleColor: '#fff', bodyColor: '#D7E3EA', padding: 10, cornerRadius: 8, titleFont: { family: 'Geist Mono' }, bodyFont: { family: 'Geist Mono' }, filter: (i) => !i.dataset.label.startsWith('_') },
        },
      },
    });
    return () => chart.destroy();
  }, [labels, datasets, unit, type, small]);
  return (
    <figure className={`chart${plain ? ' plain' : ''}${small ? ' small' : ''}`}>
      {title && <figcaption>{title}{sub && <span className="fine"> {sub}</span>}</figcaption>}
      <div className="chart-box"><canvas ref={ref} role="img" aria-label={title || unit} /></div>
    </figure>
  );
}
