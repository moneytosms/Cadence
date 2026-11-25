import React, { useState } from 'react';
import { UiTheme } from '../../types/prompter';

interface ThemeWaveToggleProps {
  theme: UiTheme;
  onToggle: () => void;
  className?: string;
}

export const ThemeWaveToggle: React.FC<ThemeWaveToggleProps> = ({
  theme,
  onToggle,
  className = '',
}) => {
  const [pulseKey, setPulseKey] = useState(0);
  const isDark = theme === 'dark';

  const handleClick = () => {
    setPulseKey((k) => k + 1);
    onToggle();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={isDark ? 'Switch to light oak theme' : 'Switch to dark walnut theme'}
      title={isDark ? 'Sunlit Oak' : 'Dark Walnut'}
      className={`relative h-9 px-2.5 rounded-[9px] wood-btn-surface inline-flex items-center justify-center gap-1.5 cursor-pointer overflow-visible focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50 group ${className}`}
    >
      {/* Expanding acoustic ring pulse on toggle */}
      {pulseKey > 0 && (
        <span
          key={pulseKey}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[9px] border-2 border-[var(--accent-text)] animate-sound-ring"
        />
      )}

      {/* Left miniature cadence wave bars */}
      <svg
        width="10"
        height="16"
        viewBox="0 0 10 16"
        fill="none"
        aria-hidden="true"
        className="shrink-0 text-[var(--accent-text)] opacity-85"
      >
        <rect
          key={`l1-${pulseKey}`}
          x="1"
          y="5.5"
          width="1.8"
          height="5"
          rx="0.9"
          fill="currentColor"
          className={pulseKey > 0 ? 'animate-wave-bar-1' : 'transition-transform duration-200 group-hover:scale-y-125 origin-center'}
        />
        <rect
          key={`l2-${pulseKey}`}
          x="4.5"
          y="3"
          width="1.8"
          height="10"
          rx="0.9"
          fill="currentColor"
          className={pulseKey > 0 ? 'animate-wave-bar-2' : 'transition-transform duration-200 group-hover:scale-y-75 origin-center'}
        />
        <rect
          key={`l3-${pulseKey}`}
          x="8"
          y="6"
          width="1.8"
          height="4"
          rx="0.9"
          fill="currentColor"
          className={pulseKey > 0 ? 'animate-wave-bar-3' : 'transition-transform duration-200 group-hover:scale-y-125 origin-center'}
        />
      </svg>

      {/* Morphing Sun / Crescent Moon emblem */}
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="shrink-0 text-[var(--amber)] transition-transform duration-300 ease-out"
        style={{ transform: isDark ? 'rotate(0deg)' : 'rotate(180deg)' }}
      >
        {isDark ? (
          <>
            <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="2" />
            <path
              d="M12 2.5V5M12 19V21.5M4.5 12H2M22 12H19.5M6.3 6.3L4.6 4.6M19.4 19.4L17.7 17.7M17.7 6.3L19.4 4.6M4.6 19.4L6.3 17.7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </>
        ) : (
          <path
            d="M20.2 14.8A8.5 8.5 0 0 1 9.2 3.8a8.5 8.5 0 1 0 11 11Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
    </button>
  );
};
