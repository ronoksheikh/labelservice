import { useId } from 'react';
import { Link } from 'react-router-dom';

// Two flames for two people: the Fireship-style flame, drawn twice. The front flame gets a cut-out
// outline in the background colour so the pair reads clearly at favicon size.
export const FLAME = 'M115.44.64c-.53-.45-1.74-.43-2.75-.64-.53.78-1.21,1.4-1.38,2.08-.4,1.72-.69,3.47-.85,5.23-3.9,39.25-18.51,75.68-46.94,109.02-15.77,18.49-31.47,37.39-43.07,57.48-28.8,49.84-3.17,100.74,59.65,122.99,2.07.73,4.39,1.06,9.57,2.27-21.31-19.27-32.28-38.85-28.58-62.02,3.52-22.1,14.7-41.82,31.64-59.8,1.25,2.5,1.32,4.68,1.24,6.86-.83,19.72,5.7,37.12,25.86,50.86,9.32,6.35,17.69,13.54,26.12,20.61,8.56,7.2,11.04,15.85,8.61,25.28-1.17,4.58-2.88,9.09-4.73,14.74,14.35-1.42,27.62-3.4,36.53-11.33,8.52-7.57,14.82-16.55,23.91-27.01.64,8.85,1.88,15.74,1.4,22.56-.51,7.09-2.7,14.12-4.16,21.18,43.61-6.57,82.08-49.36,83.77-93.13,1.24-31.94-25.94-78.72-48.76-83.26,1.28,3,2.47,5.84,3.75,8.64,7.92,17.44,10.24,35.12,5.23,53.37-5.01,18.15-30.43,38.52-52.85,41.09.76-1.82,1.08-3.52,2.12-4.91,24.15-32.54,24.45-66.6,10.72-101.36C193.12,74.99,157.88,36.14,115.44.64Z';

export function LogoMark({ size = 28, cutout = '#fff' }: { size?: number; cutout?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size * (420 / 320)} height={size} viewBox="0 0 420 320" aria-hidden="true" focusable="false" style={{ display: 'block', flex: 'none' }}>
      <defs>
        <linearGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FF9A3C" /><stop offset="1" stopColor="#FF5A1F" /></linearGradient>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFB45C" /><stop offset="1" stopColor="#FF7A1A" /></linearGradient>
      </defs>
      <path d={FLAME} transform="translate(150 40) scale(0.9)" fill={`url(#${id}b)`} />
      <path d={FLAME} transform="translate(0 18)" fill={`url(#${id}f)`} stroke={cutout} strokeWidth="14" paintOrder="stroke" />
    </svg>
  );
}

export function Logo({ size = 26, to = '/' }: { size?: number; to?: string }) {
  return (
    <Link to={to} className="logo" aria-label="twobytes.dev home">
      <LogoMark size={size} />
      <span className="logo-word" style={{ fontSize: size * 0.78 }}>twobytes<span>.dev</span></span>
    </Link>
  );
}
