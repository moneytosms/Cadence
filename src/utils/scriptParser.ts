import {
  CompiledBlock,
  CompiledScript,
  CueEvent,
  CustomCueDefinition,
  InlineRun,
  PromptBuilderConfig,
} from '../types/prompter';

const CUE_TAG_REGEX = /\[([^\]]+)\]/g;
const INLINE_FORMAT_REGEX = /(__[^_]+__|\*\*[^*]+\*\*|==[^=]+==|~~[^~]+~~|\[[^\]]+\])/g;

function countSpokenWordsInPlainText(text: string): number {
  const cleaned = text
    .replace(CUE_TAG_REGEX, ' ')
    .replace(/__|(\*\*)|==|~~/g, '')
    .trim();
  if (!cleaned) return 0;
  return cleaned.split(/\s+/).filter((token) => /[a-zA-Z0-9\u00C0-\u024F]/.test(token)).length;
}

export function countSpokenWords(rawText: string): number {
  return countSpokenWordsInPlainText(rawText);
}

export function stripMarkupToPlainText(rawText: string): string {
  return rawText
    .replace(CUE_TAG_REGEX, '')
    .replace(/__|(\*\*)|==|~~/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseCueTag(
  tagInner: string,
  blockIndex: number,
  cueOrdinal: number,
  beatDurationSeconds: number,
  customCues: CustomCueDefinition[]
): {
  cue?: CueEvent;
  chipKind: InlineRun['cueKind'];
  chipLabel: string;
  customColor?: string;
} {
  const trimmed = tagInner.trim();
  const upper = trimmed.toUpperCase();
  const id = `cue-${blockIndex}-${cueOrdinal}`;

  // Check user-defined custom cues first
  const matchedCustom = customCues.find((c) => c.tag.trim().toUpperCase() === upper);
  if (matchedCustom) {
    const hasAction =
      matchedCustom.pauseSeconds > 0 ||
      matchedCustom.speedMode !== 'none' ||
      matchedCustom.tone !== 'none';

    return {
      cue: hasAction
        ? {
            id,
            blockIndex,
            type: 'custom',
            value: matchedCustom.pauseSeconds > 0 ? matchedCustom.pauseSeconds : undefined,
            label: matchedCustom.tag.toUpperCase(),
            tone: matchedCustom.tone,
            speedMode: matchedCustom.speedMode,
            speedDeltaPct: matchedCustom.speedDeltaPct,
          }
        : undefined,
      chipKind: 'custom',
      chipLabel: matchedCustom.tag.toUpperCase(),
      customColor: matchedCustom.color,
    };
  }

  const pauseMatch = trimmed.match(/^PAUSE(?:\s+(\d+(?:\.\d+)?)\s*s?)?$/i);
  if (pauseMatch) {
    const secs = pauseMatch[1] ? Math.max(0.3, Math.min(30, parseFloat(pauseMatch[1]))) : 2;
    return {
      cue: { id, blockIndex, type: 'pause', value: secs, label: `Pause ${secs}s` },
      chipKind: 'pause',
      chipLabel: `PAUSE ${secs}s`,
    };
  }

  if (upper === 'BEAT') {
    return {
      cue: {
        id,
        blockIndex,
        type: 'beat',
        value: beatDurationSeconds,
        label: `Beat ${beatDurationSeconds}s`,
      },
      chipKind: 'beat',
      chipLabel: 'BEAT',
    };
  }

  if (/^SPEED\s+RESET$/i.test(trimmed)) {
    return {
      cue: { id, blockIndex, type: 'speedReset', label: 'Reset WPM' },
      chipKind: 'speed',
      chipLabel: 'SPEED RESET',
    };
  }

  const relSpeedMatch = trimmed.match(/^SPEED\s*([+-]\d+(?:\.\d+)?)\s*%$/i);
  if (relSpeedMatch) {
    const deltaPct = Math.max(-50, Math.min(80, parseFloat(relSpeedMatch[1])));
    const sign = deltaPct > 0 ? '+' : '';
    return {
      cue: {
        id,
        blockIndex,
        type: 'speedRelative',
        value: deltaPct,
        label: `Speed ${sign}${deltaPct}%`,
      },
      chipKind: 'speed',
      chipLabel: `SPEED ${sign}${deltaPct}%`,
    };
  }

  const absSpeedMatch = trimmed.match(/^SPEED\s+(\d+)(?:\s*WPM)?$/i);
  if (absSpeedMatch) {
    const wpm = Math.max(50, Math.min(320, parseInt(absSpeedMatch[1], 10)));
    return {
      cue: { id, blockIndex, type: 'speedAbsolute', value: wpm, label: `${wpm} WPM` },
      chipKind: 'speed',
      chipLabel: `${wpm} WPM`,
    };
  }

  const markerMatch = trimmed.match(/^(?:MARKER|SECTION|CHAPTER)\s*:\s*(.+)$/i);
  if (markerMatch) {
    const title = markerMatch[1].trim();
    return {
      cue: { id, blockIndex, type: 'marker', label: title },
      chipKind: 'marker',
      chipLabel: title,
    };
  }

  if (upper === 'BEEP' || upper === 'CHIME') {
    return {
      cue: { id, blockIndex, type: 'beep', label: 'Audio Tick' },
      chipKind: 'beep',
      chipLabel: 'BEEP',
    };
  }

  return {
    chipKind: 'delivery',
    chipLabel: trimmed.toUpperCase(),
  };
}

export function compileScript(
  rawText: string,
  beatDurationSeconds = 0.8,
  customCues: CustomCueDefinition[] = []
): CompiledScript {
  const lines = rawText.replace(/\r\n/g, '\n').split('\n');
  const blocks: CompiledBlock[] = [];
  const markers: { id: string; title: string; blockIndex: number }[] = [];

  const cueSummary = {
    pauses: 0,
    beats: 0,
    speedChanges: 0,
    underlines: 0,
    bolds: 0,
    highlights: 0,
    markers: 0,
    deliveryNotes: 0,
  };

  let totalSpokenWords = 0;
  let totalExplicitPauseSeconds = 0;

  const rawParagraphs: string[] = [];
  let buffer: string[] = [];

  const flushBuffer = () => {
    if (buffer.length > 0) {
      rawParagraphs.push(buffer.join(' '));
      buffer = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushBuffer();
      continue;
    }
    const isStandaloneMarker = /^\[(?:MARKER|SECTION|CHAPTER)\s*:\s*.+\]$/i.test(trimmed);
    const isStandaloneCue = /^\[[^\]]+\]$/.test(trimmed);
    if (isStandaloneMarker || isStandaloneCue) {
      flushBuffer();
      rawParagraphs.push(trimmed);
    } else {
      buffer.push(trimmed);
    }
  }
  flushBuffer();

  rawParagraphs.forEach((rawBlock, blockIndex) => {
    const runs: InlineRun[] = [];
    const cues: CueEvent[] = [];
    let markerTitle: string | undefined;
    let cueOrdinal = 0;

    let lastIndex = 0;
    let match: RegExpExecArray | null;
    INLINE_FORMAT_REGEX.lastIndex = 0;

    while ((match = INLINE_FORMAT_REGEX.exec(rawBlock)) !== null) {
      if (match.index > lastIndex) {
        runs.push({ type: 'text', text: rawBlock.slice(lastIndex, match.index) });
      }
      const token = match[0];

      if (token.startsWith('__') && token.endsWith('__')) {
        cueSummary.underlines += 1;
        runs.push({ type: 'underline', text: token.slice(2, -2) });
      } else if (token.startsWith('**') && token.endsWith('**')) {
        cueSummary.bolds += 1;
        runs.push({ type: 'bold', text: token.slice(2, -2) });
      } else if (token.startsWith('==') && token.endsWith('==')) {
        cueSummary.highlights += 1;
        runs.push({ type: 'highlight', text: token.slice(2, -2) });
      } else if (token.startsWith('~~') && token.endsWith('~~')) {
        runs.push({ type: 'soft', text: token.slice(2, -2) });
      } else if (token.startsWith('[') && token.endsWith(']')) {
        const inner = token.slice(1, -1);
        const parsed = parseCueTag(inner, blockIndex, cueOrdinal++, beatDurationSeconds, customCues);
        if (parsed.cue) {
          cues.push(parsed.cue);
          if (parsed.cue.type === 'pause') {
            cueSummary.pauses += 1;
            totalExplicitPauseSeconds += parsed.cue.value ?? 2;
          } else if (parsed.cue.type === 'beat') {
            cueSummary.beats += 1;
            totalExplicitPauseSeconds += parsed.cue.value ?? beatDurationSeconds;
          } else if (
            parsed.cue.type === 'speedAbsolute' ||
            parsed.cue.type === 'speedRelative' ||
            parsed.cue.type === 'speedReset'
          ) {
            cueSummary.speedChanges += 1;
          } else if (parsed.cue.type === 'marker') {
            cueSummary.markers += 1;
            markerTitle = parsed.cue.label;
            markers.push({ id: parsed.cue.id, title: parsed.cue.label, blockIndex });
          } else if (parsed.cue.type === 'custom') {
            if (parsed.cue.value && parsed.cue.value > 0) {
              cueSummary.pauses += 1;
              totalExplicitPauseSeconds += parsed.cue.value;
            }
            if (parsed.cue.speedMode && parsed.cue.speedMode !== 'none') {
              cueSummary.speedChanges += 1;
            }
          }
        } else if (parsed.chipKind === 'delivery' || parsed.chipKind === 'custom') {
          cueSummary.deliveryNotes += 1;
        }
        runs.push({
          type: 'cueChip',
          text: parsed.chipLabel,
          cueKind: parsed.chipKind,
          customColor: parsed.customColor,
        });
      }

      lastIndex = match.index + token.length;
    }

    if (lastIndex < rawBlock.length) {
      runs.push({ type: 'text', text: rawBlock.slice(lastIndex) });
    }

    const spokenWords = countSpokenWordsInPlainText(rawBlock);
    totalSpokenWords += spokenWords;

    const kind: CompiledBlock['kind'] =
      markerTitle && spokenWords === 0
        ? 'marker'
        : spokenWords === 0 && (cues.length > 0 || runs.every((r) => r.type === 'cueChip'))
          ? 'cueLine'
          : 'paragraph';

    blocks.push({
      index: blockIndex,
      kind,
      raw: rawBlock,
      runs,
      spokenWords,
      cues,
      markerTitle,
    });
  });

  return {
    blocks,
    totalSpokenWords,
    totalExplicitPauseSeconds,
    markers,
    cueSummary,
  };
}

export function estimateScriptDurationSeconds(compiled: CompiledScript, baseWpm: number): number {
  const safeBase = Math.max(50, baseWpm);
  let activeWpm = safeBase;
  let totalSeconds = 0;

  for (const block of compiled.blocks) {
    for (const cue of block.cues) {
      if (cue.type === 'speedAbsolute' && cue.value) {
        activeWpm = cue.value;
      } else if (cue.type === 'speedRelative' && cue.value !== undefined) {
        activeWpm = Math.max(50, Math.min(320, Math.round(activeWpm * (1 + cue.value / 100))));
      } else if (cue.type === 'speedReset') {
        activeWpm = safeBase;
      } else if (cue.type === 'pause' && cue.value) {
        totalSeconds += cue.value;
      } else if (cue.type === 'beat' && cue.value) {
        totalSeconds += cue.value;
      } else if (cue.type === 'custom') {
        if (cue.value && cue.value > 0) totalSeconds += cue.value;
        if (cue.speedMode === 'relative' && cue.speedDeltaPct) {
          activeWpm = Math.max(
            50,
            Math.min(320, Math.round(safeBase * (1 + cue.speedDeltaPct / 100)))
          );
        } else if (cue.speedMode === 'reset') {
          activeWpm = safeBase;
        }
      }
    }
    if (block.spokenWords > 0) {
      totalSeconds += (block.spokenWords / activeWpm) * 60;
    }
  }

  return Math.round(totalSeconds);
}

export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatDurationHuman(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  if (mins === 0) return `${secs}s`;
  if (secs === 0) return `${mins}m`;
  return `${mins}m ${secs}s`;
}

export function cleanImportedLlmScript(rawPaste: string): string {
  let cleaned = rawPaste.trim();

  const fenceMatches = [...cleaned.matchAll(/```(?:[a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g)];
  if (fenceMatches.length > 0) {
    const longest = fenceMatches.reduce((best, cur) =>
      cur[1].length > best[1].length ? cur : best
    );
    cleaned = longest[1].trim();
  }

  const lines = cleaned.split(/\r?\n/);
  while (
    lines.length > 1 &&
    /^(here(?:'s| is) (?:your|the) (?:formatted|rewritten|teleprompter)|sure[,!]|certainly[,!]|below is)/i.test(
      lines[0].trim()
    )
  ) {
    lines.shift();
  }

  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function buildExternalLlmPrompt(
  config: PromptBuilderConfig,
  rawDraft: string,
  customCues: CustomCueDefinition[] = []
): string {
  const pauseGuide =
    config.pauseDensity === 'light'
      ? 'Use [BEAT] sparingly at transitions and [PAUSE 2s] only between major sections.'
      : config.pauseDensity === 'balanced'
        ? 'Use [BEAT] after key points and [PAUSE 2s] or [PAUSE 1.5s] at paragraph shifts.'
        : 'Use expressive spoken rhythm with [BEAT] before punchlines and [PAUSE 2s] to [PAUSE 3s] for breathing room.';

  const emphasisGuide =
    config.emphasisDensity === 'minimal'
      ? 'Keep styling minimal: underline (__phrase__) only the main takeaway per section.'
      : config.emphasisDensity === 'moderate'
        ? 'Use __underlines__ for key phrases, **bold** for 1 to 2 punch words per paragraph, and ==highlights== for key numbers or calls to action.'
        : 'Format vividly for spoken inflection: combine __underlines__, **bold**, ==highlights==, and ~~soften~~ on brief asides.';

  const optionalLines: string[] = [];
  if (config.includeSectionMarkers) {
    optionalLines.push('- Put section headers on their own line as `[MARKER: Short Title]`.');
  }
  if (config.includeBreathNotes) {
    optionalLines.push('- Include brief delivery cues like `[BREATHE]`, `[SMILE]`, or `[LOOK AT LENS]`.');
  }
  if (config.includeSpeedShifts) {
    optionalLines.push('- Insert `[SPEED -10%]`, `[SPEED +10%]`, and `[SPEED RESET]` where pace shifts help.');
  }
  if (customCues.length > 0) {
    const customList = customCues
      .map((c) => {
        const effects: string[] = [];
        if (c.pauseSeconds > 0) effects.push(`${c.pauseSeconds}s pause`);
        if (c.speedMode === 'relative' && c.speedDeltaPct !== 0) {
          effects.push(`speed ${c.speedDeltaPct > 0 ? '+' : ''}${c.speedDeltaPct}%`);
        } else if (c.speedMode === 'reset') {
          effects.push('reset speed');
        }
        if (c.tone !== 'none') effects.push(`${c.tone} chime`);
        return `[${c.tag.toUpperCase()}]${effects.length > 0 ? ` (${effects.join(', ')})` : ''}`;
      })
      .join(', ');
    optionalLines.push(`- Custom cues available if helpful: ${customList}.`);
  }

  const draftSection = rawDraft.trim()
    ? `Script to format:\n\n"""\n${rawDraft.trim()}\n"""`
    : `Script to format:\n\n"""\n[PASTE YOUR DRAFT HERE]\n"""`;

  return `Rewrite and format the script below for spoken on-camera delivery at ${config.targetWpm} words per minute (${config.deliveryTone} tone, sentences under ${config.maxWordsPerSentence} words, short 2 to 3 sentence paragraphs, no em dashes).

Use ONLY these Cadence markup tags:
- __underlined phrase__ for vocal emphasis
- **bold word** for punch
- ==highlighted phrase== for key takeaways
- ~~softened aside~~ for quiet asides
- [BEAT] for a brief 0.8s pause
- [PAUSE 2s] (or [PAUSE 1.5s], [PAUSE 3s]) for timed pauses
${optionalLines.join('\n')}

Rules:
1. ${pauseGuide}
2. ${emphasisGuide}
3. Keep my meaning intact while making phrasing sound natural out loud.
4. Output ONLY the formatted script in one plain text block with no intro text or markdown headings (#).

${draftSection}`;
}
