import React, { useId } from 'react';
import { UiTheme } from '../../types/prompter';

interface CadenceLogoProps {
  size?: number;
  theme?: UiTheme;
  className?: string;
}

export const CadenceLogo: React.FC<CadenceLogoProps> = ({
  size = 32,
  theme = 'dark',
  className = '',
}) => {
  const uid = useId();
  const isLight = theme === 'light';

  const bgGradId = `cadenceBg-${uid}`;
  const waveGradId = `cadenceWave-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <defs>
        {isLight ? (
          <>
            <linearGradient id={bgGradId} x1="6" y1="4" x2="58" y2="60" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#F6EBDA" />
              <stop offset="100%" stopColor="#DFCBB0" />
            </linearGradient>
            <linearGradient id={waveGradId} x1="30" y1="20" x2="56" y2="44" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#265A3D" />
              <stop offset="60%" stopColor="#32724E" />
              <stop offset="100%" stopColor="#B36F1F" />
            </linearGradient>
          </>
        ) : (
          <>
            <linearGradient id={bgGradId} x1="8" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#352920" />
              <stop offset="100%" stopColor="#1B140F" />
            </linearGradient>
            <linearGradient id={waveGradId} x1="30" y1="20" x2="56" y2="44" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#7AC49A" />
              <stop offset="65%" stopColor="#4E946C" />
              <stop offset="100%" stopColor="#D99B52" />
            </linearGradient>
          </>
        )}
      </defs>

      {/* Carved wood medallion */}
      <rect
        x="2"
        y="2"
        width="60"
        height="60"
        rx="15"
        fill={`url(#${bgGradId})`}
        stroke={isLight ? 'rgba(72, 49, 26, 0.25)' : 'rgba(243, 234, 216, 0.18)'}
        strokeWidth="1.6"
      />

      {/* Outer tree growth ring */}
      <path
        d="M32 11.5C20.7 11.5 11.5 20.7 11.5 32C11.5 43.3 20.7 52.5 32 52.5C39.2 52.5 45.6 48.7 49.2 43"
        stroke={isLight ? '#7A5E42' : '#B6A690'}
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity={isLight ? '0.52' : '0.54'}
      />

      {/* Middle growth ring */}
      <path
        d="M32 17.5C24 17.5 17.5 24 17.5 32C17.5 40 24 46.5 32 46.5C37.2 46.5 41.7 43.8 44.3 39.7"
        stroke={isLight ? '#3B2B1D' : '#F3EAD8'}
        strokeWidth="2.6"
        strokeLinecap="round"
        opacity={isLight ? '0.86' : '0.9'}
      />

      {/* Inner heartwood ring */}
      <path
        d="M32 23.5C27.3 23.5 23.5 27.3 23.5 32C23.5 36.7 27.3 40.5 32 40.5"
        stroke={isLight ? '#2D6847' : '#63AD82'}
        strokeWidth="2.8"
        strokeLinecap="round"
      />

      {/* Rhythmic soundwave pulse radiating out of the heartwood */}
      <path
        d="M30 32H35.5L38.2 23.5L42.2 41L45.8 27.5L48.5 34.5L51 32H54.5"
        stroke={`url(#${waveGradId})`}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Center pith dot */}
      <circle cx="30" cy="32" r="2.2" fill={isLight ? '#B36F1F' : '#D99B52'} />
    </svg>
  );
};
