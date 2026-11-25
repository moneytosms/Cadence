import React from 'react';
import { Minus, Plus } from 'lucide-react';

export interface ClayCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export const ClayCard: React.FC<ClayCardProps> = ({
  children,
  className = '',
  padding = 'md',
  ...rest
}) => {
  const padClass =
    padding === 'none'
      ? ''
      : padding === 'sm'
        ? 'p-3.5'
        : padding === 'lg'
          ? 'p-5 sm:p-6'
          : 'p-4 sm:p-5';

  return (
    <div className={`wood-card rounded-[14px] ${padClass} ${className}`} {...rest}>
      {children}
    </div>
  );
};

export interface ClayButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'tonal' | 'surface' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  tip?: string;
  children: React.ReactNode;
}

export const ClayButton: React.FC<ClayButtonProps> = ({
  variant = 'surface',
  size = 'md',
  tip,
  className = '',
  children,
  type = 'button',
  title,
  ...rest
}) => {
  const variantClasses: Record<NonNullable<ClayButtonProps['variant']>, string> = {
    primary: 'wood-btn-pine',
    tonal: 'wood-btn-moss',
    surface: 'wood-btn-surface',
    ghost:
      'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] active:scale-[0.99] transition-colors duration-150',
    danger:
      'bg-[var(--danger-bg)] text-[var(--danger)] border border-[var(--danger-border)] hover:brightness-105 active:scale-[0.99] transition-all duration-150',
  };

  const sizeClasses =
    size === 'icon'
      ? 'h-9 w-9 p-0 rounded-[9px]'
      : size === 'sm'
        ? 'h-8 px-2.5 text-[12.5px] rounded-[8px]'
        : size === 'lg'
          ? 'h-10 px-4.5 text-[13.5px] rounded-[10px]'
          : 'h-9 px-3.5 text-[13px] rounded-[9px]';

  return (
    <button
      type={type}
      title={tip ?? title}
      className={`inline-flex items-center justify-center gap-1.5 font-medium whitespace-nowrap shrink-0 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50 disabled:opacity-40 disabled:cursor-not-allowed ${sizeClasses} ${variantClasses[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
};

export interface ClaySwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  tip?: string;
  disabled?: boolean;
}

export const ClaySwitch: React.FC<ClaySwitchProps> = ({
  checked,
  onChange,
  label,
  tip,
  disabled = false,
}) => {
  return (
    <label
      title={tip}
      className={`flex items-center justify-between gap-4 py-2.5 px-3.5 rounded-[10px] bg-[var(--bg-inset)] border border-[var(--border-subtle)] transition-colors ${
        disabled ? 'opacity-45 cursor-not-allowed' : 'cursor-pointer hover:border-[var(--border-strong)]'
      }`}
    >
      <span className="text-[13px] font-medium text-[var(--text-primary)] leading-snug">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative inline-flex h-[22px] w-[40px] shrink-0 items-center rounded-full p-[3px] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50 cursor-pointer ${
          checked ? 'bg-[var(--accent)]' : 'bg-[var(--bg-surface-hover)]'
        }`}
      >
        <span
          className={`inline-block h-[16px] w-[16px] rounded-full bg-[#FAF6EE] shadow-xs transition-transform duration-200 ${
            checked ? 'translate-x-[18px]' : 'translate-x-0'
          }`}
        />
      </button>
    </label>
  );
};

export interface ClaySliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  formatValue?: (val: number) => string;
  tip?: string;
  showSteppers?: boolean;
  onChange: (value: number) => void;
}

export const ClaySlider: React.FC<ClaySliderProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  formatValue,
  tip,
  showSteppers = false,
  onChange,
}) => {
  const display = formatValue ? formatValue(value) : `${value}${unit}`;
  const clamp = (v: number) => {
    const rounded = Math.round(v * 1000) / 1000;
    return Math.max(min, Math.min(max, rounded));
  };

  return (
    <div
      title={tip}
      className="py-2.5 px-3.5 rounded-[10px] bg-[var(--bg-inset)] border border-[var(--border-subtle)]"
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="text-[13px] font-medium text-[var(--text-secondary)]">{label}</span>
        <span className="font-mono-tabular text-[12.5px] font-semibold text-[var(--accent-text)] shrink-0">
          {display}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {showSteppers && (
          <button
            type="button"
            aria-label={`Decrease ${label}`}
            onClick={() => onChange(clamp(value - step))}
            className="wood-btn-surface h-7 w-7 rounded-[7px] flex items-center justify-center shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
        )}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={Math.max(min, Math.min(max, value))}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="wood-range flex-1"
        />
        {showSteppers && (
          <button
            type="button"
            aria-label={`Increase ${label}`}
            onClick={() => onChange(clamp(value + step))}
            className="wood-btn-surface h-7 w-7 rounded-[7px] flex items-center justify-center shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  tip?: string;
}

export function ClaySegmented<T extends string>({
  options,
  value,
  onChange,
  className = '',
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (val: T) => void;
  className?: string;
}) {
  return (
    <div
      className={`wood-inset inline-flex flex-wrap items-center gap-0.5 p-1 rounded-[10px] ${className}`}
      role="tablist"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            title={opt.tip}
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={`h-8 px-3 rounded-[7px] text-[12.5px] font-medium whitespace-nowrap shrink-0 cursor-pointer transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50 ${
              active
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)] shadow-xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-transparent'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
