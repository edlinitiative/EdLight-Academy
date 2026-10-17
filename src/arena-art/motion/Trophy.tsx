import React, { useId } from 'react';

/**
 * An original Arène trophy: a cup with a five-point star cut into the bowl,
 * a knotted stem and an enamel plinth. `lit` = earned (gold); unlit is a
 * quiet silhouette for provisional / tied states. The sheen group is
 * animated by CSS (`.mo-tr__sheen`) only while the ceremony reveals.
 */
export default function Trophy({ lit, year, className = '' }: { lit: boolean; year?: string; className?: string }) {
  const raw = useId().replace(/:/g, '');
  const id = (k: string) => `mo-tr-${raw}-${k}`;
  const gold = lit ? `url(#${id('gold')})` : '#2A3D5A';
  const side = lit ? `url(#${id('side')})` : 'transparent';
  const deep = lit ? '#B8760F' : '#22324B';
  const edge = lit ? '#FFE9AE' : '#4A6385';

  const bowl = 'M50 36 H150 C150 94 132 128 100 138 C68 128 50 94 50 36 Z';
  const stem = 'M91 137 H109 L104 172 H96 Z';
  const star = 'M100 62 L105.3 73.6 L118 75 L108.5 83.6 L111.2 96.2 L100 89.8 L88.8 96.2 L91.5 83.6 L82 75 L94.7 73.6 Z';

  return (
    <svg className={`mo-tr ${lit ? 'mo-tr--lit' : ''} ${className}`} viewBox="0 0 200 232" aria-hidden="true">
      <defs>
        <linearGradient id={id('gold')} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor="#FFEBB0" />
          <stop offset="0.42" stopColor="#FFB92E" />
          <stop offset="0.78" stopColor="#DB8F16" />
          <stop offset="1" stopColor="#A9670C" />
        </linearGradient>
        <linearGradient id={id('side')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#FFF6D8" stopOpacity="0.55" />
          <stop offset="0.3" stopColor="#FFF6D8" stopOpacity="0" />
          <stop offset="0.72" stopColor="#7A4706" stopOpacity="0" />
          <stop offset="1" stopColor="#7A4706" stopOpacity="0.5" />
        </linearGradient>
        <linearGradient id={id('shine')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
          <stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.95" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <clipPath id={id('clip')}>
          <path d={bowl} /><rect x="44" y="27" width="112" height="13" rx="6.5" />
          <path d={stem} /><ellipse cx="100" cy="151" rx="13" ry="6" />
          <rect x="72" y="171" width="56" height="13" rx="3" />
        </clipPath>
      </defs>

      {/* handles */}
      <path d="M54 48 C22 46 20 94 66 106" fill="none" stroke={deep} strokeWidth="10" strokeLinecap="round" />
      <path d="M146 48 C178 46 180 94 134 106" fill="none" stroke={deep} strokeWidth="10" strokeLinecap="round" />
      <path d="M54 48 C25 47 23 92 66 104" fill="none" stroke={gold} strokeWidth="6" strokeLinecap="round" />
      <path d="M146 48 C175 47 177 92 134 104" fill="none" stroke={gold} strokeWidth="6" strokeLinecap="round" />

      {/* cup */}
      <path d={bowl} fill={gold} stroke={edge} strokeWidth={lit ? 0 : 1.5} />
      <path d={bowl} fill={side} />
      <rect x="44" y="27" width="112" height="13" rx="6.5" fill={gold} stroke={edge} strokeWidth={lit ? 0 : 1.5} />
      <rect x="50" y="29" width="100" height="3" rx="1.5" fill={lit ? '#FFF3CF' : '#3A5174'} opacity="0.8" />
      <path d={star} fill={deep} />
      <path d={star} fill={lit ? '#FFD66B' : 'transparent'} transform="translate(100 79) scale(0.62) translate(-100 -79)" />

      {/* stem + base */}
      <path d={stem} fill={gold} />
      <ellipse cx="100" cy="151" rx="13" ry="6" fill={gold} />
      <rect x="72" y="171" width="56" height="13" rx="3" fill={gold} />
      <rect x="56" y="184" width="88" height="40" rx="5" fill={lit ? '#14233C' : '#16243A'} stroke={lit ? '#D9971E' : '#365171'} strokeWidth="2" />
      <rect x="70" y="196" width="60" height="16" rx="2.5" fill={lit ? '#E9A825' : '#22324B'} />
      {year && (
        <text x="100" y="208.5" textAnchor="middle" fontSize="11" fontWeight="800" letterSpacing="2"
          fill={lit ? '#3B2404' : '#6F86A8'} fontFamily="inherit">{year}</text>
      )}

      {/* one sheen pass, clipped to the metal */}
      {lit && (
        <g clipPath={`url(#${id('clip')})`}>
          <g className="mo-tr__sheen">
            <rect x="-80" y="-20" width="60" height="260" fill={`url(#${id('shine')})`} transform="rotate(18 0 120)" />
          </g>
        </g>
      )}
    </svg>
  );
}
