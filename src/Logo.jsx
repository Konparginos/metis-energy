import full from './brand/metis_horizontal_full.svg?raw';
import reverse from './brand/metis_horizontal_reverse.svg?raw';
import notagline from './brand/metis_horizontal_notagline_full.svg?raw';
import notaglineReverse from './brand/metis_horizontal_notagline_reverse.svg?raw';

// The logo files from the Metis brand package (02_Logos/SVG), inlined unchanged so CSS can draw the curve in
// and let the sun ride it. Brand rule: use the files, never retype or redraw. Width/height come from CSS (.lockup svg).
const FILES = { full, reverse, notagline, notaglineReverse };
const strip = (svg) => svg.replace(/ width="[\d.]+" height="[\d.]+"/, ' aria-hidden="true"');
const SVG = Object.fromEntries(Object.entries(FILES).map(([k, v]) => [k, strip(v)]));

// variant: full (light backgrounds, default) | reverse (deep sea) | notagline / notaglineReverse (below 140 px wide)
export default function Logo({ variant = 'full', height = 40 }) {
  return <span className="lockup" role="img" aria-label="metis, Ride the curve" style={{ height }} dangerouslySetInnerHTML={{ __html: SVG[variant] }} />;
}
