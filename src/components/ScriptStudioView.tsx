import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Bold,
  Check,
  ChevronDown,
  ClipboardCopy,
  Clock,
  Download,
  Eye,
  FileCode2,
  FileText,
  Highlighter,
  Italic,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  PenLine,
  Plus,
  Scissors,
  Sparkles,
  Underline,
} from 'lucide-react';
import {
  EditorToolbarMode,
  ScriptDocument,
  SpeedProfile,
  StudioSettings,
} from '../types/prompter';
import { resolveStageColors } from '../data/defaults';
import {
  compileScript,
  estimateScriptDurationSeconds,
  formatDuration,
  formatDurationHuman,
  stripMarkupToPlainText,
} from '../utils/scriptParser';
import { ClayButton, ClaySlider } from './ui/ClayControls';
import { getPrompterFontCss, RichBlockView } from './RichTextRenderer';

interface ScriptStudioViewProps {
  script: ScriptDocument;
  speedProfile: SpeedProfile;
  settings: StudioSettings;
  onUpdateScript: (patch: Partial<ScriptDocument>) => void;
  onUpdateSettings: (updater: (prev: StudioSettings) => StudioSettings) => void;
  onOpenLlmModal: () => void;
  onOpenCustomCuesSettings: () => void;
  onNotify: (msg: string) => void;
}

interface ContextMenuState {
  x: number;
  y: number;
  hasSelection: boolean;
}

interface FloatingBarState {
  x: number;
  y: number;
  visible: boolean;
}

export const ScriptStudioView: React.FC<ScriptStudioViewProps> = ({
  script,
  speedProfile,
  settings,
  onUpdateScript,
  onUpdateSettings,
  onOpenLlmModal,
  onOpenCustomCuesSettings,
  onNotify,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const cueMenuRef = useRef<HTMLDivElement | null>(null);
  const paceMenuRef = useRef<HTMLDivElement | null>(null);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  const [showPreview, setShowPreview] = useState(false);
  const [cueMenuOpen, setCueMenuOpen] = useState(false);
  const [pacePopoverOpen, setPacePopoverOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [floatingBar, setFloatingBar] = useState<FloatingBarState>({ x: 0, y: 0, visible: false });

  const [targetMin, setTargetMin] = useState<string>(
    script.targetSeconds ? String(Math.floor(script.targetSeconds / 60)) : '1'
  );
  const [targetSec, setTargetSec] = useState<string>(
    script.targetSeconds ? String(script.targetSeconds % 60).padStart(2, '0') : '30'
  );

  const toolbarMode = settings.editor?.toolbarMode ?? 'compact';
  const wideCanvas = settings.editor?.wideCanvas ?? false;
  const customCues = settings.customCues ?? [];

  // Auto-grow borderless textarea for a single smooth page scrollbar (zero double scrollbars)
  const syncTextareaHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(440, el.scrollHeight + 32)}px`;
  }, []);

  useLayoutEffect(() => {
    if (!showPreview) {
      syncTextareaHeight();
    }
  }, [script.content, showPreview, wideCanvas, syncTextareaHeight]);

  useEffect(() => {
    window.addEventListener('resize', syncTextareaHeight);
    return () => window.removeEventListener('resize', syncTextareaHeight);
  }, [syncTextareaHeight]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (cueMenuRef.current && !cueMenuRef.current.contains(target)) setCueMenuOpen(false);
      if (paceMenuRef.current && !paceMenuRef.current.contains(target)) setPacePopoverOpen(false);
      if (moreMenuRef.current && !moreMenuRef.current.contains(target)) setMoreMenuOpen(false);
      if (contextMenuRef.current && !contextMenuRef.current.contains(target)) {
        setContextMenu(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setCueMenuOpen(false);
        setPacePopoverOpen(false);
        setMoreMenuOpen(false);
        setContextMenu(null);
        setFloatingBar((f) => ({ ...f, visible: false }));
      }
    };
    document.addEventListener('mousedown', onDocClick);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const effectiveWpm = script.customWpmOverride ?? speedProfile.baselineWpm;

  const compiled = useMemo(
    () => compileScript(script.content, settings.rules.beatDurationSeconds, customCues),
    [script.content, settings.rules.beatDurationSeconds, customCues]
  );

  const estimatedSeconds = useMemo(
    () => estimateScriptDurationSeconds(compiled, effectiveWpm),
    [compiled, effectiveWpm]
  );

  const totalCueCount =
    compiled.cueSummary.pauses +
    compiled.cueSummary.beats +
    compiled.cueSummary.speedChanges +
    compiled.cueSummary.markers +
    compiled.cueSummary.deliveryNotes;

  const setToolbarMode = (mode: EditorToolbarMode) => {
    onUpdateSettings((prev) => ({
      ...prev,
      editor: { ...(prev.editor ?? { toolbarMode: 'compact', wideCanvas: false }), toolbarMode: mode },
    }));
    setMoreMenuOpen(false);
  };

  const toggleWideCanvas = () => {
    onUpdateSettings((prev) => ({
      ...prev,
      editor: {
        ...(prev.editor ?? { toolbarMode: 'compact', wideCanvas: false }),
        wideCanvas: !prev.editor?.wideCanvas,
      },
    }));
    setMoreMenuOpen(false);
  };

  const wrapSelection = useCallback(
    (prefix: string, suffix: string, fallback = 'phrase') => {
      const el = textareaRef.current;
      if (!el) return;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const selected = script.content.slice(start, end) || fallback;
      const next =
        script.content.slice(0, start) +
        prefix +
        selected +
        suffix +
        script.content.slice(end);
      onUpdateScript({ content: next, updatedAt: Date.now() });
      setContextMenu(null);
      setFloatingBar((f) => ({ ...f, visible: false }));
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
      });
    },
    [onUpdateScript, script.content]
  );

  const insertAtCursor = useCallback(
    (snippet: string, asOwnLine = false) => {
      const el = textareaRef.current;
      if (!el) return;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const before = script.content.slice(0, start);
      const after = script.content.slice(end);
      const lead = asOwnLine && before.length > 0 && !before.endsWith('\n') ? '\n' : '';
      const trail = asOwnLine && after.length > 0 && !after.startsWith('\n') ? '\n' : ' ';
      const inserted = `${lead}${snippet}${trail}`;
      const next = before + inserted + after;
      onUpdateScript({ content: next, updatedAt: Date.now() });
      setCueMenuOpen(false);
      setContextMenu(null);
      requestAnimationFrame(() => {
        el.focus();
        const pos = before.length + inserted.length;
        el.setSelectionRange(pos, pos);
      });
    },
    [onUpdateScript, script.content]
  );

  const jumpToMarkerInEditor = (markerTitle: string) => {
    const el = textareaRef.current;
    if (!el || showPreview) return;
    const needle = `[MARKER: ${markerTitle}]`;
    const idx = script.content.indexOf(needle);
    if (idx < 0) return;
    el.focus();
    el.setSelectionRange(idx, idx + needle.length);
    const linesBefore = script.content.slice(0, idx).split('\n').length;
    const approxTop = Math.max(0, el.offsetTop + linesBefore * 26 - 180);
    window.scrollTo({ top: approxTop, behavior: 'smooth' });
  };

  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.metaKey || e.ctrlKey) {
      const k = e.key.toLowerCase();
      if (k === 'b') {
        e.preventDefault();
        wrapSelection('**', '**', 'bold');
      } else if (k === 'u') {
        e.preventDefault();
        wrapSelection('__', '__', 'phrase');
      } else if (k === 'h' && e.shiftKey) {
        e.preventDefault();
        wrapSelection('==', '==', 'key point');
      }
    }
  };

  const handleEditorContextMenu = (e: React.MouseEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    const el = textareaRef.current;
    const hasSelection = !!el && el.selectionEnd > el.selectionStart;
    const menuW = 224;
    const menuH = 340;
    const x = Math.min(e.clientX, window.innerWidth - menuW - 12);
    const y = Math.min(e.clientY, window.innerHeight - menuH - 12);
    setContextMenu({ x: Math.max(12, x), y: Math.max(12, y), hasSelection });
    setFloatingBar((f) => ({ ...f, visible: false }));
  };

  const handleEditorMouseUp = (e: React.MouseEvent<HTMLTextAreaElement>) => {
    if (toolbarMode !== 'floating') return;
    const el = textareaRef.current;
    if (!el) return;
    if (el.selectionEnd > el.selectionStart) {
      const barW = 210;
      const x = Math.max(12, Math.min(e.clientX - barW / 2, window.innerWidth - barW - 12));
      const y = Math.max(76, e.clientY - 52);
      setFloatingBar({ x, y, visible: true });
    } else {
      setFloatingBar((f) => ({ ...f, visible: false }));
    }
  };

  const handleContextCopy = async (cut: boolean) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    if (end <= start) return;
    const text = script.content.slice(start, end);
    try {
      await navigator.clipboard.writeText(text);
      if (cut) {
        const next = script.content.slice(0, start) + script.content.slice(end);
        onUpdateScript({ content: next, updatedAt: Date.now() });
      }
      onNotify(cut ? 'Cut' : 'Copied');
    } catch {
      onNotify('Use Ctrl+C / Cmd+C');
    }
    setContextMenu(null);
  };

  const handleContextPaste = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip) insertAtCursor(clip, false);
    } catch {
      onNotify('Use Ctrl+V / Cmd+V');
    }
    setContextMenu(null);
  };

  const handleSolveTargetDuration = () => {
    const mins = Math.max(0, parseInt(targetMin || '0', 10) || 0);
    const secs = Math.max(0, Math.min(59, parseInt(targetSec || '0', 10) || 0));
    const desiredTotalSec = mins * 60 + secs;
    if (desiredTotalSec < 10) {
      onNotify('Enter at least 10 seconds');
      return;
    }
    const speakingSec = desiredTotalSec - compiled.totalExplicitPauseSeconds;
    if (speakingSec <= 5) {
      onNotify('Pauses exceed target length');
      return;
    }
    const requiredWpm = Math.round((compiled.totalSpokenWords / speakingSec) * 60);
    const clamped = Math.max(60, Math.min(280, requiredWpm));
    onUpdateScript({
      targetSeconds: desiredTotalSec,
      customWpmOverride: clamped,
      updatedAt: Date.now(),
    });
    setPacePopoverOpen(false);
    onNotify(`Target set: ${clamped} WPM`);
  };

  const exportFile = (ext: 'md' | 'txt') => {
    setMoreMenuOpen(false);
    const body = ext === 'txt' ? stripMarkupToPlainText(script.content) : script.content;
    const mime = ext === 'txt' ? 'text/plain;charset=utf-8' : 'text/markdown;charset=utf-8';
    const blob = new Blob([body], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${script.title.replace(/[^a-z0-9-_ ]/gi, '').trim() || 'script'}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify(`Exported .${ext}`);
  };

  const copyScript = async (plain: boolean) => {
    setMoreMenuOpen(false);
    const text = plain ? stripMarkupToPlainText(script.content) : script.content;
    try {
      await navigator.clipboard.writeText(text);
      onNotify(plain ? 'Copied clean text' : 'Copied script');
    } catch {
      onNotify('Clipboard unavailable');
    }
  };

  const stageColors = resolveStageColors(settings.appearance);

  return (
    <div className={`${wideCanvas ? 'max-w-5xl' : 'max-w-[780px]'} mx-auto transition-all duration-200`}>
      {/* Sticky Minimal Studio Ribbon */}
      <div className="sticky top-[102px] sm:top-[61px] z-20 -mx-2 px-2 py-2 bg-[var(--bg-header)] backdrop-blur-md border-b border-[var(--border-subtle)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Left: Icon-Only Styling & Insert Cue */}
          <div className="flex items-center gap-1 flex-wrap">
            {toolbarMode !== 'floating' && (
              <>
                <button
                  type="button"
                  title="Bold (Ctrl+B)"
                  aria-label="Bold"
                  onClick={() => wrapSelection('**', '**', 'bold')}
                  className="h-8 w-8 rounded-[7px] hover:bg-[var(--bg-surface-hover)] text-[var(--text-primary)] inline-flex items-center justify-center cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50"
                >
                  <Bold className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  title="Underline (Ctrl+U)"
                  aria-label="Underline"
                  onClick={() => wrapSelection('__', '__', 'phrase')}
                  className="h-8 w-8 rounded-[7px] hover:bg-[var(--bg-surface-hover)] text-[var(--accent-text)] inline-flex items-center justify-center cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50"
                >
                  <Underline className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  title="Highlight (Ctrl+Shift+H)"
                  aria-label="Highlight"
                  onClick={() => wrapSelection('==', '==', 'key point')}
                  className="h-8 w-8 rounded-[7px] hover:bg-[var(--bg-surface-hover)] text-[var(--amber)] inline-flex items-center justify-center cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50"
                >
                  <Highlighter className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  title="Soften aside"
                  aria-label="Soften aside"
                  onClick={() => wrapSelection('~~', '~~', 'aside')}
                  className="h-8 w-8 rounded-[7px] hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] inline-flex items-center justify-center cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50"
                >
                  <Italic className="w-3.5 h-3.5" />
                </button>

                <span className="w-[1px] h-4 bg-[var(--border-strong)] mx-1" aria-hidden="true" />
              </>
            )}

            {/* Insert Cue Dropdown */}
            <div ref={cueMenuRef} className="relative">
              <ClayButton
                variant={cueMenuOpen ? 'tonal' : 'surface'}
                size="sm"
                onClick={() => setCueMenuOpen((o) => !o)}
                tip="Insert pause, marker, or custom cue"
              >
                <Plus className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                Cue
                <ChevronDown className="w-3 h-3 opacity-65" />
              </ClayButton>

              {cueMenuOpen && (
                <div className="absolute left-0 top-full mt-1.5 z-40 w-52 max-h-[68vh] overflow-y-auto rounded-[12px] wood-popover p-1.5 space-y-0.5">
                  {[
                    { label: 'Pause 2s', action: () => insertAtCursor('[PAUSE 2s]', true) },
                    { label: 'Pause 3s', action: () => insertAtCursor('[PAUSE 3s]', true) },
                    {
                      label: `Beat (${settings.rules.beatDurationSeconds}s)`,
                      action: () => insertAtCursor('[BEAT]'),
                    },
                    {
                      label: 'Section Marker',
                      action: () => insertAtCursor('[MARKER: Section]', true),
                    },
                    { label: 'Slow (-10%)', action: () => insertAtCursor('[SPEED -10%]', true) },
                    { label: 'Fast (+10%)', action: () => insertAtCursor('[SPEED +10%]', true) },
                    { label: 'Reset Speed', action: () => insertAtCursor('[SPEED RESET]', true) },
                    { label: 'Breathe', action: () => insertAtCursor('[BREATHE]') },
                    { label: 'Smile', action: () => insertAtCursor('[SMILE]') },
                    { label: 'Audio Tick', action: () => insertAtCursor('[BEEP]') },
                  ].map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      onClick={item.action}
                      className="w-full h-8 px-2.5 rounded-[7px] text-left text-[12.5px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                    >
                      {item.label}
                    </button>
                  ))}

                  {customCues.length > 0 && (
                    <div className="pt-1 mt-1 border-t border-[var(--border-subtle)] space-y-0.5">
                      <div className="px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                        Custom
                      </div>
                      {customCues.map((cc) => (
                        <button
                          key={cc.id}
                          type="button"
                          onClick={() => insertAtCursor(`[${cc.tag.toUpperCase()}]`)}
                          className="w-full h-8 px-2.5 rounded-[7px] flex items-center justify-between gap-2 text-[12.5px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                        >
                          <span className="inline-flex items-center gap-2">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: cc.color }}
                            />
                            {cc.tag.toUpperCase()}
                          </span>
                          {cc.pauseSeconds > 0 && (
                            <span className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
                              {cc.pauseSeconds}s
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="pt-1 mt-1 border-t border-[var(--border-subtle)]">
                    <button
                      type="button"
                      onClick={() => {
                        setCueMenuOpen(false);
                        onOpenCustomCuesSettings();
                      }}
                      className="w-full h-8 px-2.5 rounded-[7px] text-left text-[12px] font-medium text-[var(--accent-text)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                    >
                      Manage Custom Cues…
                    </button>
                  </div>
                </div>
              )}
            </div>

            <ClayButton
              variant="ghost"
              size="sm"
              onClick={onOpenLlmModal}
              tip="Copy prompt for an external LLM or paste formatted output"
            >
              <Sparkles className="w-3.5 h-3.5 text-[var(--amber)]" />
              LLM
            </ClayButton>
          </div>

          {/* Right: Live Pace, Edit/Preview Toggle, More Menu */}
          <div className="flex items-center gap-1.5">
            {/* Clickable Pace & Runtime Trigger */}
            <div ref={paceMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setPacePopoverOpen((o) => !o)}
                title="Adjust pace or target length"
                className="h-8 px-2.5 rounded-[8px] hover:bg-[var(--bg-surface-hover)] font-mono-tabular text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] inline-flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Clock className="w-3.5 h-3.5 text-[var(--accent-text)] hidden xs:inline" />
                <span className="text-[var(--text-primary)] font-semibold">
                  {formatDurationHuman(estimatedSeconds)}
                </span>
                <span className="opacity-40">·</span>
                <span>{effectiveWpm} WPM</span>
                {script.customWpmOverride !== null && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--amber)]" title="Custom script pace" />
                )}
              </button>

              {pacePopoverOpen && (
                <div className="absolute right-0 top-full mt-1.5 z-40 w-72 rounded-[12px] wood-popover p-3.5 space-y-3">
                  <ClaySlider
                    label="Script Pace"
                    value={effectiveWpm}
                    min={60}
                    max={280}
                    step={5}
                    unit=" WPM"
                    showSteppers
                    onChange={(v) =>
                      onUpdateScript({ customWpmOverride: v, updatedAt: Date.now() })
                    }
                  />

                  <div className="space-y-1.5 pt-2 border-t border-[var(--border-subtle)]">
                    <div className="text-[11.5px] font-medium text-[var(--text-secondary)]">
                      Fit Target Length
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={0}
                        max={60}
                        value={targetMin}
                        onChange={(e) => setTargetMin(e.target.value)}
                        aria-label="Target minutes"
                        className="w-14 h-8 rounded-[8px] wood-inset px-2 font-mono-tabular text-[12.5px] text-center text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                      />
                      <span className="text-[12px] text-[var(--text-muted)]">m</span>
                      <input
                        type="number"
                        min={0}
                        max={59}
                        value={targetSec}
                        onChange={(e) => setTargetSec(e.target.value)}
                        aria-label="Target seconds"
                        className="w-14 h-8 rounded-[8px] wood-inset px-2 font-mono-tabular text-[12.5px] text-center text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                      />
                      <span className="text-[12px] text-[var(--text-muted)]">s</span>
                      <ClayButton
                        variant="primary"
                        size="sm"
                        onClick={handleSolveTargetDuration}
                        className="ml-auto"
                      >
                        Fit
                      </ClayButton>
                    </div>
                  </div>

                  {script.customWpmOverride !== null && (
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateScript({
                          customWpmOverride: null,
                          targetSeconds: null,
                          updatedAt: Date.now(),
                        });
                        setPacePopoverOpen(false);
                      }}
                      className="text-[12px] font-medium text-[var(--accent-text)] hover:underline cursor-pointer"
                    >
                      Use baseline ({speedProfile.baselineWpm} WPM)
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Edit / Preview Toggle */}
            <ClayButton
              variant={showPreview ? 'tonal' : 'surface'}
              size="sm"
              onClick={() => setShowPreview((p) => !p)}
              tip={showPreview ? 'Return to editor' : 'Preview prompter formatting'}
            >
              {showPreview ? (
                <>
                  <PenLine className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Edit</span>
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Preview</span>
                </>
              )}
            </ClayButton>

            {/* Subtle Three-Dots Menu */}
            <div ref={moreMenuRef} className="relative">
              <button
                type="button"
                aria-label="Editor options and export"
                title="Toolbar layout & export"
                onClick={() => setMoreMenuOpen((o) => !o)}
                className={`h-8 w-8 rounded-[8px] inline-flex items-center justify-center cursor-pointer transition-colors ${
                  moreMenuOpen
                    ? 'wood-btn-moss'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
                }`}
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>

              {moreMenuOpen && (
                <div className="absolute right-0 top-full mt-1.5 z-40 w-56 rounded-[12px] wood-popover p-1.5 space-y-1">
                  <div className="px-2.5 pt-1 pb-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Toolbar
                  </div>
                  {(
                    [
                      { id: 'compact', label: 'Compact Bar' },
                      { id: 'floating', label: 'Floating on Select' },
                      { id: 'expanded', label: 'Expanded Cue Bar' },
                    ] as { id: EditorToolbarMode; label: string }[]
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setToolbarMode(opt.id)}
                      className="w-full h-8 px-2.5 rounded-[7px] flex items-center justify-between text-[12.5px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                    >
                      <span>{opt.label}</span>
                      {toolbarMode === opt.id && (
                        <Check className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                      )}
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={toggleWideCanvas}
                    className="w-full h-8 px-2.5 rounded-[7px] flex items-center justify-between text-[12.5px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                  >
                    <span className="inline-flex items-center gap-2">
                      {wideCanvas ? (
                        <Minimize2 className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                      ) : (
                        <Maximize2 className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                      )}
                      {wideCanvas ? 'Standard Width' : 'Wide Canvas'}
                    </span>
                  </button>

                  <div className="pt-1 mt-1 border-t border-[var(--border-subtle)]">
                    <div className="px-2.5 pt-1 pb-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      Export
                    </div>
                    <button
                      type="button"
                      onClick={() => exportFile('md')}
                      className="w-full h-8 px-2.5 rounded-[7px] flex items-center gap-2 text-[12.5px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                    >
                      <FileCode2 className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                      Download .md
                    </button>
                    <button
                      type="button"
                      onClick={() => exportFile('txt')}
                      className="w-full h-8 px-2.5 rounded-[7px] flex items-center gap-2 text-[12.5px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5 text-[var(--amber)]" />
                      Download .txt (Clean)
                    </button>
                    <button
                      type="button"
                      onClick={() => copyScript(true)}
                      className="w-full h-8 px-2.5 rounded-[7px] flex items-center gap-2 text-[12.5px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                    >
                      <ClipboardCopy className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                      Copy Clean Text
                    </button>
                    <button
                      type="button"
                      onClick={() => copyScript(false)}
                      className="w-full h-8 px-2.5 rounded-[7px] flex items-center gap-2 text-[12.5px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                      Copy With Cues
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Expanded Cue Ribbon */}
        {toolbarMode === 'expanded' && !showPreview && (
          <div className="flex items-center gap-1.5 flex-wrap pt-2 mt-2 border-t border-[var(--border-subtle)]">
            {[
              { label: 'Pause 2s', snippet: '[PAUSE 2s]', ownLine: true },
              { label: 'Beat', snippet: '[BEAT]', ownLine: false },
              { label: 'Marker', snippet: '[MARKER: Section]', ownLine: true },
              { label: 'Slow', snippet: '[SPEED -10%]', ownLine: true },
              { label: 'Reset', snippet: '[SPEED RESET]', ownLine: true },
              { label: 'Breathe', snippet: '[BREATHE]', ownLine: false },
              { label: 'Smile', snippet: '[SMILE]', ownLine: false },
            ].map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => insertAtCursor(q.snippet, q.ownLine)}
                className="h-7 px-2.5 rounded-[7px] bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-[11.5px] font-medium text-[var(--text-primary)] cursor-pointer transition-colors"
              >
                {q.label}
              </button>
            ))}
            {customCues.map((cc) => (
              <button
                key={cc.id}
                type="button"
                onClick={() => insertAtCursor(`[${cc.tag.toUpperCase()}]`, false)}
                className="h-7 px-2.5 rounded-[7px] bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-[11.5px] font-medium text-[var(--text-primary)] inline-flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cc.color }} />
                {cc.tag.toUpperCase()}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Borderless Document Canvas */}
      <article className="pt-7 pb-14 px-1 sm:px-2">
        {/* Document Title */}
        <input
          type="text"
          value={script.title}
          onChange={(e) => onUpdateScript({ title: e.target.value, updatedAt: Date.now() })}
          placeholder="Untitled Script"
          aria-label="Script title"
          className="w-full bg-transparent font-display text-[24px] sm:text-[28px] font-semibold tracking-tight text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
        />

        {/* Subtle Section Jump Rail (appears automatically when markers exist) */}
        {compiled.markers.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap pt-3">
            {compiled.markers.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => jumpToMarkerInEditor(m.title)}
                title={`Jump to ${m.title}`}
                className="h-6 px-2.5 rounded-[6px] bg-[var(--bg-inset)] hover:bg-[var(--bg-surface-hover)] font-mono-tabular text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer transition-colors"
              >
                {m.title}
              </button>
            ))}
          </div>
        )}

        <div className="my-4 h-[1px] bg-[var(--border-subtle)]" />

        {/* Borderless Auto-Growing Editor or Stage Preview */}
        {!showPreview ? (
          <textarea
            ref={textareaRef}
            value={script.content}
            onChange={(e) => onUpdateScript({ content: e.target.value, updatedAt: Date.now() })}
            onKeyDown={handleEditorKeyDown}
            onContextMenu={handleEditorContextMenu}
            onMouseUp={handleEditorMouseUp}
            onBlur={() => {
              setTimeout(() => setFloatingBar((f) => ({ ...f, visible: false })), 180);
            }}
            spellCheck
            placeholder="Write your script here. Select text and right-click to style or insert cues..."
            className="w-full bg-transparent border-0 text-[15.5px] leading-[1.85] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none resize-none overflow-hidden"
          />
        ) : (
          <div
            className="rounded-[12px] p-5 sm:p-7"
            style={{
              backgroundColor: stageColors.bg,
              fontFamily: getPrompterFontCss(settings.appearance.fontFamily),
              fontSize: '18px',
              lineHeight: settings.appearance.lineHeight,
            }}
          >
            {compiled.blocks.map((block) => (
              <RichBlockView
                key={block.index}
                block={block}
                appearance={settings.appearance}
                compact
              />
            ))}
          </div>
        )}

        {/* Quiet Document Status Footer */}
        <footer className="mt-8 pt-3.5 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2 text-[11.5px] font-mono-tabular text-[var(--text-muted)]">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span>{compiled.totalSpokenWords} words</span>
            <span>·</span>
            <span>{formatDuration(estimatedSeconds)}</span>
            {totalCueCount > 0 && (
              <>
                <span>·</span>
                <span>{totalCueCount} cues</span>
              </>
            )}
          </div>
          <span className="hidden sm:inline opacity-75">Right-click for styles & cues</span>
        </footer>
      </article>

      {/* Floating Selection Style Bar */}
      {toolbarMode === 'floating' && floatingBar.visible && !showPreview && (
        <div
          style={{ left: `${floatingBar.x}px`, top: `${floatingBar.y}px` }}
          onMouseDown={(e) => e.preventDefault()}
          className="fixed z-50 rounded-[10px] wood-popover px-1.5 py-1 flex items-center gap-0.5"
        >
          <button
            type="button"
            title="Bold"
            onClick={() => wrapSelection('**', '**', 'bold')}
            className="h-7 w-7 rounded-[6px] hover:bg-[var(--bg-surface-hover)] text-[var(--text-primary)] inline-flex items-center justify-center cursor-pointer"
          >
            <Bold className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="Underline"
            onClick={() => wrapSelection('__', '__', 'phrase')}
            className="h-7 w-7 rounded-[6px] hover:bg-[var(--bg-surface-hover)] text-[var(--accent-text)] inline-flex items-center justify-center cursor-pointer"
          >
            <Underline className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="Highlight"
            onClick={() => wrapSelection('==', '==', 'key point')}
            className="h-7 w-7 rounded-[6px] hover:bg-[var(--bg-surface-hover)] text-[var(--amber)] inline-flex items-center justify-center cursor-pointer"
          >
            <Highlighter className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="Soften"
            onClick={() => wrapSelection('~~', '~~', 'aside')}
            className="h-7 w-7 rounded-[6px] hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] inline-flex items-center justify-center cursor-pointer"
          >
            <Italic className="w-3.5 h-3.5" />
          </button>
          <span className="w-[1px] h-4 bg-[var(--border-strong)] mx-0.5" />
          <button
            type="button"
            title="Insert Beat"
            onClick={() => insertAtCursor('[BEAT]')}
            className="h-7 px-2 rounded-[6px] hover:bg-[var(--bg-surface-hover)] text-[11.5px] font-medium text-[var(--text-primary)] cursor-pointer"
          >
            Beat
          </button>
        </div>
      )}

      {/* Custom Right-Click Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
          onMouseDown={(e) => e.preventDefault()}
          className="fixed z-50 w-56 rounded-[12px] wood-popover p-1.5 space-y-1"
        >
          <div className="flex items-center justify-between gap-1 px-1 py-0.5">
            <button
              type="button"
              title="Bold"
              onClick={() => wrapSelection('**', '**', 'bold')}
              className="flex-1 h-8 rounded-[7px] hover:bg-[var(--bg-surface-hover)] text-[var(--text-primary)] inline-flex items-center justify-center cursor-pointer"
            >
              <Bold className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title="Underline"
              onClick={() => wrapSelection('__', '__', 'phrase')}
              className="flex-1 h-8 rounded-[7px] hover:bg-[var(--bg-surface-hover)] text-[var(--accent-text)] inline-flex items-center justify-center cursor-pointer"
            >
              <Underline className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title="Highlight"
              onClick={() => wrapSelection('==', '==', 'key point')}
              className="flex-1 h-8 rounded-[7px] hover:bg-[var(--bg-surface-hover)] text-[var(--amber)] inline-flex items-center justify-center cursor-pointer"
            >
              <Highlighter className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title="Soften"
              onClick={() => wrapSelection('~~', '~~', 'aside')}
              className="flex-1 h-8 rounded-[7px] hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] inline-flex items-center justify-center cursor-pointer"
            >
              <Italic className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="pt-1 border-t border-[var(--border-subtle)] space-y-0.5">
            <button
              type="button"
              onClick={() => insertAtCursor('[PAUSE 2s]', true)}
              className="w-full h-8 px-2.5 rounded-[7px] text-left text-[12.5px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            >
              Pause 2s
            </button>
            <button
              type="button"
              onClick={() => insertAtCursor('[BEAT]')}
              className="w-full h-8 px-2.5 rounded-[7px] text-left text-[12.5px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            >
              Beat
            </button>
            <button
              type="button"
              onClick={() => insertAtCursor('[MARKER: Section]', true)}
              className="w-full h-8 px-2.5 rounded-[7px] text-left text-[12.5px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            >
              Section Marker
            </button>
            {customCues.slice(0, 4).map((cc) => (
              <button
                key={cc.id}
                type="button"
                onClick={() => insertAtCursor(`[${cc.tag.toUpperCase()}]`)}
                className="w-full h-8 px-2.5 rounded-[7px] flex items-center gap-2 text-[12.5px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cc.color }} />
                {cc.tag.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="pt-1 border-t border-[var(--border-subtle)] space-y-0.5">
            {contextMenu.hasSelection && (
              <>
                <button
                  type="button"
                  onClick={() => handleContextCopy(true)}
                  className="w-full h-8 px-2.5 rounded-[7px] flex items-center gap-2 text-[12.5px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                >
                  <Scissors className="w-3.5 h-3.5" />
                  Cut
                </button>
                <button
                  type="button"
                  onClick={() => handleContextCopy(false)}
                  className="w-full h-8 px-2.5 rounded-[7px] flex items-center gap-2 text-[12.5px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                >
                  <ClipboardCopy className="w-3.5 h-3.5" />
                  Copy
                </button>
              </>
            )}
            <button
              type="button"
              onClick={handleContextPaste}
              className="w-full h-8 px-2.5 rounded-[7px] flex items-center gap-2 text-[12.5px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              Paste
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
