import { useEffect, useRef, useState } from 'react';
import { loc } from './i18n.js';

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Counts a number up to its value (ease-out, 700 ms). Shows the final value at once under reduced motion.
export function Num({ value, digits = 0, prefix = '', suffix }) {
  const [shown, setShown] = useState(reduced() ? value : 0);
  const from = useRef(0);
  useEffect(() => {
    if (value == null || !Number.isFinite(value)) return;
    if (reduced()) { setShown(value); return; }
    const start = performance.now(), a = from.current;
    let raf;
    const step = (now) => {
      const k = Math.min(1, (now - start) / 700), e = 1 - (1 - k) ** 3;
      setShown(a + (value - a) * e);
      if (k < 1) raf = requestAnimationFrame(step); else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  if (value == null || !Number.isFinite(value)) return <>-</>;
  return <>{prefix}{shown.toLocaleString(loc(), { minimumFractionDigits: digits, maximumFractionDigits: digits })}{suffix && <small>{suffix}</small>}</>;
}

// Re-runs the enter animation whenever `k` changes (tab or range switch).
export const Enter = ({ k, children, className = '' }) => <div key={k} className={`enter ${className}`}>{children}</div>;
