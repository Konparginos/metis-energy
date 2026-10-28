import { useLayoutEffect, useRef } from 'react';

// Metis lockup from the prototype: ring, the curve, the ochre point, wordmark and "Ride the curve".
// Colours adapted for the light theme. The curve draws itself in once (static under reduced motion).
export default function Logo({ size = 34, tagline = true }) {
  const word = useRef(), tag = useRef();

  // Spread the tagline to the wordmark's width, as the prototype does.
  useLayoutEffect(() => {
    const fit = () => {
      const w = word.current, t = tag.current;
      if (!w || !t) return;
      t.style.letterSpacing = '0px'; t.style.marginRight = '0px';
      const gap = (w.getBoundingClientRect().width - t.getBoundingClientRect().width) / (t.textContent.length - 1);
      if (gap > 0) { t.style.letterSpacing = `${gap}px`; t.style.marginRight = `${-gap}px`; }
    };
    fit();
    document.fonts?.ready.then(fit);
  }, [tagline]);

  return (
    <span className="lockup" aria-label="metis, Ride the curve">
      <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <circle cx="32" cy="32" r="24" stroke="#0B3D4C" strokeWidth="4" />
        <path className="lk-curve" d="M 8.7 38 C 18 26, 26 26, 32 33 S 46 42, 53.8 22" stroke="#157A8C" strokeWidth="4" strokeLinecap="round" pathLength="1" />
        <circle className="lk-dot" cx="42" cy="19" r="4.5" fill="#E3A23B" />
      </svg>
      <span className="lk-text">
        <span className="wordmark" ref={word}>metis</span>
        {tagline && <span className="tagline" ref={tag}>Ride the curve</span>}
      </span>
    </span>
  );
}
