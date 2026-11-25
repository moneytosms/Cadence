import React from 'react';
import { CompiledBlock, PrompterAppearance } from '../types/prompter';
import { resolveStageColors } from '../data/defaults';

interface RichBlockViewProps {
  block: CompiledBlock;
  appearance: PrompterAppearance;
  compact?: boolean;
  isActiveMarker?: boolean;
}

export function getPrompterFontCss(fontFamily: PrompterAppearance['fontFamily']): string {
  switch (fontFamily) {
    case 'jakarta':
      return 'var(--font-display)';
    case 'serif':
      return 'var(--font-serif-stage)';
    case 'mono':
      return 'var(--font-mono)';
    case 'dm-sans':
    default:
      return 'var(--font-body)';
  }
}

export const RichBlockView: React.FC<RichBlockViewProps> = ({
  block,
  appearance,
  compact = false,
  isActiveMarker = false,
}) => {
  const colors = resolveStageColors(appearance);
  const isLight = Boolean(colors.isLight);

  if (block.kind === 'marker' && block.markerTitle) {
    return (
      <div
        className={`flex items-center gap-3 ${compact ? 'my-3' : 'my-6'} ${
          appearance.textAlign === 'center' ? 'justify-center' : 'justify-start'
        }`}
      >
        <span
          className="h-[2px] w-7 rounded-full opacity-75"
          style={{ backgroundColor: colors.accent }}
        />
        <span
          className={`font-mono-tabular uppercase tracking-wider font-semibold transition-transform duration-200 ${
            compact ? 'text-[12px]' : 'text-[15px]'
          } ${isActiveMarker ? 'scale-105' : ''}`}
          style={{ color: colors.accent }}
        >
          {block.markerTitle}
        </span>
        <span
          className="h-[2px] flex-1 max-w-[110px] rounded-full opacity-30"
          style={{ backgroundColor: colors.accent }}
        />
      </div>
    );
  }

  if (block.kind === 'cueLine') {
    if (!appearance.showInlineCues) return null;
    return (
      <div
        className={`flex flex-wrap items-center gap-2 ${compact ? 'my-2' : 'my-4'} ${
          appearance.textAlign === 'center' ? 'justify-center' : 'justify-start'
        }`}
      >
        {block.runs
          .filter((r) => r.type === 'cueChip')
          .map((run, idx) => (
            <CueInlineTag
              key={idx}
              label={run.text}
              kind={run.cueKind}
              customColor={run.customColor}
              compact={compact}
              isLight={isLight}
              accent={colors.accent}
            />
          ))}
      </div>
    );
  }

  return (
    <p
      className={compact ? 'mb-4' : 'mb-7'}
      style={{
        textAlign: appearance.textAlign,
        color: colors.text,
      }}
    >
      {block.runs.map((run, idx) => {
        if (run.type === 'text') {
          return <React.Fragment key={idx}>{run.text}</React.Fragment>;
        }
        if (run.type === 'underline') {
          return (
            <span
              key={idx}
              style={{
                textDecorationLine: 'underline',
                textDecorationColor: appearance.underlineColor,
                textDecorationThickness: `${compact ? Math.max(2, appearance.underlineThicknessPx - 1) : appearance.underlineThicknessPx}px`,
                textUnderlineOffset: '0.18em',
              }}
            >
              {run.text}
            </span>
          );
        }
        if (run.type === 'bold') {
          return (
            <strong
              key={idx}
              className="font-extrabold"
              style={{
                color: isLight ? '#000000' : '#FFFFFF',
              }}
            >
              {run.text}
            </strong>
          );
        }
        if (run.type === 'highlight') {
          return (
            <mark
              key={idx}
              className="rounded-[6px] px-1.5 py-0.5"
              style={{
                backgroundColor: `${appearance.highlightColor}${isLight ? '38' : '30'}`,
                color: colors.text,
                boxShadow: `inset 0 -2px 0 ${appearance.highlightColor}`,
              }}
            >
              {run.text}
            </mark>
          );
        }
        if (run.type === 'soft') {
          return (
            <span key={idx} className="italic opacity-65">
              {run.text}
            </span>
          );
        }
        if (run.type === 'cueChip') {
          if (!appearance.showInlineCues) return null;
          return (
            <React.Fragment key={idx}>
              {' '}
              <CueInlineTag
                label={run.text}
                kind={run.cueKind}
                customColor={run.customColor}
                compact={compact}
                isLight={isLight}
                accent={colors.accent}
              />{' '}
            </React.Fragment>
          );
        }
        return null;
      })}
    </p>
  );
};

const CueInlineTag: React.FC<{
  label: string;
  kind: 'pause' | 'beat' | 'speed' | 'marker' | 'delivery' | 'beep' | 'custom' | undefined;
  customColor?: string;
  compact: boolean;
  isLight: boolean;
  accent: string;
}> = ({ label, kind, customColor, compact, isLight, accent }) => {
  let color = accent;
  let bg = isLight ? 'rgba(47, 108, 75, 0.12)' : 'rgba(99, 173, 130, 0.16)';

  if (kind === 'custom' && customColor) {
    color = customColor;
    bg = `${customColor}26`;
  } else if (kind === 'pause' || kind === 'beat') {
    color = isLight ? '#9A5B13' : '#E8AE62';
    bg = isLight ? 'rgba(217, 155, 82, 0.18)' : 'rgba(217, 155, 82, 0.16)';
  } else if (kind === 'speed') {
    color = isLight ? '#2F6C4B' : '#7AC49A';
    bg = isLight ? 'rgba(62, 124, 89, 0.16)' : 'rgba(99, 173, 130, 0.16)';
  } else if (kind === 'delivery') {
    color = isLight ? '#6B543D' : '#D4C3AE';
    bg = isLight ? 'rgba(130, 104, 78, 0.14)' : 'rgba(212, 195, 174, 0.14)';
  } else if (kind === 'beep') {
    color = isLight ? '#9F3B2B' : '#E88878';
    bg = isLight ? 'rgba(201, 91, 72, 0.14)' : 'rgba(232, 136, 120, 0.16)';
  }

  return (
    <span
      className={`inline-flex items-center align-middle font-mono-tabular font-semibold tracking-wide rounded-[8px] ${
        compact ? 'text-[11px] px-2 py-0.5' : 'text-[0.38em] px-2.5 py-1'
      }`}
      style={{
        color,
        backgroundColor: bg,
        lineHeight: 1.2,
      }}
    >
      {label}
    </span>
  );
};
