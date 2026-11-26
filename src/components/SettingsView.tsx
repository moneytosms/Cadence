import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  Gauge,
  Keyboard,
  Mic,
  MicOff,
  Monitor,
  Moon,
  Plus,
  RotateCcw,
  Sparkles,
  Sun,
  Trash2,
  Volume2,
} from 'lucide-react';
import {
  CustomCueDefinition,
  CustomCueSpeedMode,
  CustomCueTone,
  KeyBindings,
  PrompterFontFamily,
  StageThemeId,
  StudioSettings,
  UiTheme,
} from '../types/prompter';
import {
  CUSTOM_CUE_SWATCHES,
  DEFAULT_STUDIO_SETTINGS,
  STAGE_THEMES,
  STUDIO_PRESETS,
} from '../data/defaults';
import {
  MicVadController,
  playCountdownTick,
  playCueBeep,
  playCustomCueTone,
} from '../utils/audioEngine';
import {
  ClayButton,
  ClayCard,
  ClaySegmented,
  ClaySlider,
  ClaySwitch,
} from './ui/ClayControls';

export type SettingsTab = 'stage' | 'camera' | 'physics' | 'cues' | 'voice' | 'keys';

interface SettingsViewProps {
  initialTab?: SettingsTab;
  settings: StudioSettings;
  onUpdateSettings: (updater: (prev: StudioSettings) => StudioSettings) => void;
  onResetAllSettings: () => void;
  onBack: () => void;
  onNotify: (msg: string) => void;
}

const KEYBIND_ITEMS: { key: keyof KeyBindings; label: string }[] = [
  { key: 'playPause', label: 'Play / Pause' },
  { key: 'speedUp', label: 'Speed Up' },
  { key: 'speedDown', label: 'Speed Down' },
  { key: 'nextMarker', label: 'Next Marker' },
  { key: 'prevMarker', label: 'Previous Marker' },
  { key: 'reset', label: 'Reset' },
  { key: 'mirrorX', label: 'Mirror' },
  { key: 'toggleWebcam', label: 'Webcam' },
  { key: 'fullscreen', label: 'Fullscreen' },
];

export function formatKeyCode(code: string): string {
  if (code === 'Space') return 'Space';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'ArrowUp') return '↑';
  if (code === 'ArrowDown') return '↓';
  if (code === 'ArrowLeft') return '←';
  if (code === 'ArrowRight') return '→';
  return code;
}

const NAV_ITEMS: { id: SettingsTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'stage', label: 'Appearance', icon: Monitor },
  { id: 'camera', label: 'Camera & Focus', icon: Camera },
  { id: 'physics', label: 'Scroll Motion', icon: Gauge },
  { id: 'cues', label: 'Cues & Timing', icon: Sparkles },
  { id: 'voice', label: 'Voice Guard', icon: Mic },
  { id: 'keys', label: 'Shortcuts', icon: Keyboard },
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  initialTab = 'stage',
  settings,
  onUpdateSettings,
  onResetAllSettings,
  onBack,
  onNotify,
}) => {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [listeningKey, setListeningKey] = useState<keyof KeyBindings | null>(null);

  // Custom cue draft builder
  const [newTag, setNewTag] = useState('');
  const [newColor, setNewColor] = useState(CUSTOM_CUE_SWATCHES[0]);
  const [newPause, setNewPause] = useState(0);
  const [newSpeedMode, setNewSpeedMode] = useState<CustomCueSpeedMode>('none');
  const [newSpeedDelta, setNewSpeedDelta] = useState(-10);
  const [newTone, setNewTone] = useState<CustomCueTone>('none');

  // Live VAD tester inside Voice tab
  const [vadTesting, setVadTesting] = useState(false);
  const [vadLiveSpeaking, setVadLiveSpeaking] = useState(false);
  const [vadError, setVadError] = useState<string | null>(null);
  const vadCtrlRef = useRef<MicVadController | null>(null);
  const vadBarRef = useRef<HTMLDivElement | null>(null);
  const vadDbRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (vadCtrlRef.current) {
      vadCtrlRef.current.updateConfig({
        thresholdDb: settings.vad.thresholdDb,
        silenceTimeoutMs: settings.vad.silenceTimeoutMs,
        speechResumeHoldMs: settings.vad.speechResumeHoldMs,
      });
    }
  }, [settings.vad]);

  useEffect(() => {
    if (tab !== 'voice' && vadCtrlRef.current) {
      vadCtrlRef.current.stop();
      vadCtrlRef.current = null;
      setVadTesting(false);
    }
  }, [tab]);

  useEffect(() => {
    return () => {
      vadCtrlRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    if (!listeningKey) return;
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') {
        setListeningKey(null);
        return;
      }
      onUpdateSettings((prev) => ({
        ...prev,
        keybindings: {
          ...prev.keybindings,
          [listeningKey]: e.code,
        },
      }));
      onNotify(`Bound ${formatKeyCode(e.code)}`);
      setListeningKey(null);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [listeningKey, onUpdateSettings, onNotify]);

  useEffect(() => {
    if (listeningKey) return;
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === 'Escape' &&
        !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
      ) {
        onBack();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [listeningKey, onBack]);

  const toggleVadTester = async () => {
    if (vadTesting) {
      vadCtrlRef.current?.stop();
      vadCtrlRef.current = null;
      setVadTesting(false);
      setVadLiveSpeaking(false);
      return;
    }
    setVadError(null);
    const ctrl = new MicVadController(
      {
        thresholdDb: settings.vad.thresholdDb,
        silenceTimeoutMs: settings.vad.silenceTimeoutMs,
        speechResumeHoldMs: settings.vad.speechResumeHoldMs,
      },
      {
        onLevel: (db, norm, isAbove) => {
          if (vadBarRef.current) {
            vadBarRef.current.style.transform = `scaleX(${Math.max(0.02, norm)})`;
            vadBarRef.current.style.backgroundColor = isAbove ? '#4E946C' : '#746556';
          }
          if (vadDbRef.current) {
            vadDbRef.current.textContent = `${Math.round(db)} dB`;
          }
        },
        onSpeechStateChange: (speaking) => setVadLiveSpeaking(speaking),
      }
    );
    try {
      await ctrl.start();
      vadCtrlRef.current = ctrl;
      setVadTesting(true);
    } catch {
      setVadError('Microphone unavailable');
    }
  };

  const handleAddCustomCue = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedTag = newTag
      .replace(/[\[\]]/g, '')
      .trim()
      .toUpperCase();
    if (!cleanedTag) {
      onNotify('Enter a cue tag name');
      return;
    }
    if (
      /^(PAUSE(\s+\d+(\.\d+)?s?)?|BEAT|BEEP|CHIME|SPEED\s+.*)$/i.test(cleanedTag) ||
      /^(MARKER|SECTION|CHAPTER)\s*:/i.test(cleanedTag)
    ) {
      onNotify(`[${cleanedTag}] is reserved for a built-in cue`);
      return;
    }
    const exists = (settings.customCues ?? []).some(
      (c) => c.tag.toUpperCase() === cleanedTag
    );
    if (exists) {
      onNotify(`[${cleanedTag}] already exists`);
      return;
    }

    const created: CustomCueDefinition = {
      id: `cc-${Date.now()}`,
      tag: cleanedTag,
      color: newColor,
      pauseSeconds: newPause,
      speedMode: newSpeedMode,
      speedDeltaPct: newSpeedMode === 'relative' ? newSpeedDelta : 0,
      tone: newTone,
    };

    onUpdateSettings((prev) => ({
      ...prev,
      customCues: [...(prev.customCues ?? []), created],
    }));

    setNewTag('');
    setNewPause(0);
    setNewSpeedMode('none');
    setNewTone('none');
    onNotify(`Added [${cleanedTag}]`);
  };

  const handleDeleteCustomCue = (id: string) => {
    onUpdateSettings((prev) => ({
      ...prev,
      customCues: (prev.customCues ?? []).filter((c) => c.id !== id),
    }));
  };

  const patchAppearance = (patch: Partial<StudioSettings['appearance']>) =>
    onUpdateSettings((prev) => ({ ...prev, appearance: { ...prev.appearance, ...patch } }));
  const patchFocus = (patch: Partial<StudioSettings['focusAndCamera']>) =>
    onUpdateSettings((prev) => ({
      ...prev,
      focusAndCamera: { ...prev.focusAndCamera, ...patch },
    }));
  const patchPhysics = (patch: Partial<StudioSettings['physics']>) =>
    onUpdateSettings((prev) => ({ ...prev, physics: { ...prev.physics, ...patch } }));
  const patchRules = (patch: Partial<StudioSettings['rules']>) =>
    onUpdateSettings((prev) => ({ ...prev, rules: { ...prev.rules, ...patch } }));
  const patchVad = (patch: Partial<StudioSettings['vad']>) =>
    onUpdateSettings((prev) => ({ ...prev, vad: { ...prev.vad, ...patch } }));

  const thresholdPct = Math.max(0, Math.min(100, ((settings.vad.thresholdDb + 60) / 60) * 100));
  const customCues = settings.customCues ?? [];
  const uiTheme: UiTheme = settings.uiTheme ?? 'dark';

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Top Page Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-3">
          <ClayButton variant="surface" size="sm" onClick={onBack} tip="Return to workspace (Esc)">
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </ClayButton>
          <h1 className="font-display text-[20px] font-semibold text-[var(--text-primary)]">
            Settings
          </h1>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="hidden sm:flex items-center gap-1.5 mr-1">
            {STUDIO_PRESETS.map((preset) => (
              <ClayButton
                key={preset.id}
                variant="surface"
                size="sm"
                tip={preset.tip}
                onClick={() => {
                  onUpdateSettings((prev) => preset.patch(prev));
                  onNotify(`${preset.name} preset applied`);
                }}
              >
                {preset.name}
              </ClayButton>
            ))}
          </div>

          <ClayButton
            variant="ghost"
            size="sm"
            tip="Restore all default settings"
            onClick={() => {
              onResetAllSettings();
              onNotify('Defaults restored');
            }}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </ClayButton>
        </div>
      </div>

      {/* Responsive Two-Column Settings Shell */}
      <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-5 items-start">
        {/* Left Navigation Rail */}
        <aside className="md:sticky md:top-[84px] space-y-3">
          <nav className="flex md:flex-col gap-1 overflow-x-auto pb-1 md:pb-0" aria-label="Settings sections">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`h-9 px-3 rounded-[9px] flex items-center gap-2.5 text-[13px] font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50 ${
                    active
                      ? 'wood-btn-moss'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Mobile Presets Strip */}
          <div className="flex sm:hidden items-center gap-1.5 overflow-x-auto pt-1">
            {STUDIO_PRESETS.map((preset) => (
              <ClayButton
                key={preset.id}
                variant="surface"
                size="sm"
                onClick={() => {
                  onUpdateSettings((prev) => preset.patch(prev));
                  onNotify(`${preset.name} preset`);
                }}
              >
                {preset.name}
              </ClayButton>
            ))}
          </div>
        </aside>

        {/* Right Content Pane */}
        <div className="space-y-4 min-w-0">
          {tab === 'stage' && (
            <>
              {/* Workspace Theme */}
              <ClayCard padding="md" className="space-y-3.5">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Workspace Theme</h2>
                  <div className="wood-inset inline-flex items-center gap-1 p-1 rounded-[10px]">
                    <button
                      type="button"
                      onClick={() => onUpdateSettings((p) => ({ ...p, uiTheme: 'dark' }))}
                      className={`h-8 px-3 rounded-[7px] inline-flex items-center gap-1.5 text-[12.5px] font-medium cursor-pointer transition-all ${
                        uiTheme === 'dark'
                          ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)] shadow-xs'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <Moon className="w-3.5 h-3.5" />
                      Walnut Dark
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdateSettings((p) => ({ ...p, uiTheme: 'light' }))}
                      className={`h-8 px-3 rounded-[7px] inline-flex items-center gap-1.5 text-[12.5px] font-medium cursor-pointer transition-all ${
                        uiTheme === 'light'
                          ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)] shadow-xs'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <Sun className="w-3.5 h-3.5" />
                      Sunlit Oak
                    </button>
                  </div>
                </div>
              </ClayCard>

              {/* Prompter Stage Theme */}
              <ClayCard padding="md" className="space-y-4">
                <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Prompter Stage</h2>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {(Object.keys(STAGE_THEMES) as Exclude<StageThemeId, 'custom'>[]).map((id) => {
                    const theme = STAGE_THEMES[id];
                    const selected = settings.appearance.themePreset === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => patchAppearance({ themePreset: id })}
                        className={`h-10 px-3 rounded-[9px] flex items-center gap-2.5 cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50 ${
                          selected ? 'wood-btn-moss' : 'wood-btn-surface'
                        }`}
                      >
                        <span
                          className="w-3.5 h-3.5 rounded-full border border-white/25 shrink-0"
                          style={{ backgroundColor: theme.bg }}
                        />
                        <span className="text-[12.5px] font-medium truncate">{theme.name}</span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => patchAppearance({ themePreset: 'custom' })}
                    className={`h-10 px-3 rounded-[9px] flex items-center gap-2.5 cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50 ${
                      settings.appearance.themePreset === 'custom'
                        ? 'wood-btn-moss'
                        : 'wood-btn-surface'
                    }`}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-white/25 shrink-0"
                      style={{ backgroundColor: settings.appearance.customBgHex }}
                    />
                    <span className="text-[12.5px] font-medium">Custom</span>
                  </button>
                </div>

                {settings.appearance.themePreset === 'custom' && (
                  <div className="grid grid-cols-3 gap-2.5 p-3 rounded-[10px] bg-[var(--bg-inset)] border border-[var(--border-subtle)]">
                    {[
                      { key: 'customBgHex', label: 'Background' },
                      { key: 'customTextHex', label: 'Text' },
                      { key: 'customAccentHex', label: 'Accent' },
                    ].map((c) => (
                      <label key={c.key} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="color"
                          value={
                            settings.appearance[
                              c.key as 'customBgHex' | 'customTextHex' | 'customAccentHex'
                            ]
                          }
                          onChange={(e) => patchAppearance({ [c.key]: e.target.value })}
                          className="w-7 h-7 rounded-[6px] cursor-pointer"
                        />
                        <span className="text-[12.5px] text-[var(--text-primary)]">{c.label}</span>
                      </label>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ClaySlider
                    label="Font Size"
                    value={settings.appearance.fontSizePx}
                    min={26}
                    max={110}
                    step={2}
                    unit=" px"
                    showSteppers
                    onChange={(v) => patchAppearance({ fontSizePx: v })}
                  />
                  <ClaySlider
                    label="Column Width"
                    tip="Narrower columns reduce eye movement"
                    value={settings.appearance.columnWidthPct}
                    min={35}
                    max={96}
                    step={2}
                    unit="%"
                    showSteppers
                    onChange={(v) => patchAppearance({ columnWidthPct: v })}
                  />
                  <ClaySlider
                    label="Line Height"
                    value={settings.appearance.lineHeight}
                    min={1.2}
                    max={2.3}
                    step={0.05}
                    formatValue={(v) => v.toFixed(2)}
                    onChange={(v) => patchAppearance({ lineHeight: v })}
                  />
                  <ClaySlider
                    label="Letter Spacing"
                    value={settings.appearance.letterSpacingEm}
                    min={-0.02}
                    max={0.12}
                    step={0.005}
                    formatValue={(v) => `${v.toFixed(3)}em`}
                    onChange={(v) => patchAppearance({ letterSpacingEm: v })}
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
                  <ClaySegmented<PrompterFontFamily>
                    value={settings.appearance.fontFamily}
                    onChange={(v) => patchAppearance({ fontFamily: v })}
                    options={[
                      { value: 'dm-sans', label: 'Sans' },
                      { value: 'jakarta', label: 'Display' },
                      { value: 'serif', label: 'Serif' },
                      { value: 'mono', label: 'Mono' },
                    ]}
                  />
                  <ClaySegmented
                    value={settings.appearance.textAlign}
                    onChange={(v) => patchAppearance({ textAlign: v })}
                    options={[
                      { value: 'left', label: 'Left' },
                      { value: 'center', label: 'Center' },
                    ]}
                  />
                </div>
              </ClayCard>

              {/* Emphasis & Mirroring */}
              <ClayCard padding="md" className="space-y-3.5">
                <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
                  Emphasis & Mirroring
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <label className="flex items-center justify-between px-3.5 py-2.5 rounded-[10px] bg-[var(--bg-inset)] border border-[var(--border-subtle)] cursor-pointer">
                    <span className="text-[13px] font-medium text-[var(--text-primary)]">Underline</span>
                    <input
                      type="color"
                      value={settings.appearance.underlineColor}
                      onChange={(e) => patchAppearance({ underlineColor: e.target.value })}
                      className="w-7 h-7 rounded-[6px] cursor-pointer"
                    />
                  </label>
                  <label className="flex items-center justify-between px-3.5 py-2.5 rounded-[10px] bg-[var(--bg-inset)] border border-[var(--border-subtle)] cursor-pointer">
                    <span className="text-[13px] font-medium text-[var(--text-primary)]">Highlight</span>
                    <input
                      type="color"
                      value={settings.appearance.highlightColor}
                      onChange={(e) => patchAppearance({ highlightColor: e.target.value })}
                      className="w-7 h-7 rounded-[6px] cursor-pointer"
                    />
                  </label>
                  <ClaySlider
                    label="Underline px"
                    value={settings.appearance.underlineThicknessPx}
                    min={2}
                    max={7}
                    step={1}
                    unit=" px"
                    onChange={(v) => patchAppearance({ underlineThicknessPx: v })}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <ClaySwitch
                    checked={settings.appearance.mirrorX}
                    onChange={(v) => patchAppearance({ mirrorX: v })}
                    label="Mirror X"
                    tip="Flip left to right for beam-splitter glass"
                  />
                  <ClaySwitch
                    checked={settings.appearance.mirrorY}
                    onChange={(v) => patchAppearance({ mirrorY: v })}
                    label="Mirror Y"
                  />
                  <ClaySwitch
                    checked={settings.appearance.showInlineCues}
                    onChange={(v) => patchAppearance({ showInlineCues: v })}
                    label="Show Cue Tags"
                  />
                </div>
              </ClayCard>
            </>
          )}

          {tab === 'camera' && (
            <>
              <ClayCard padding="md" className="space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
                    Eye-Line & Focus Zone
                  </h2>
                  <ClaySegmented
                    value={settings.focusAndCamera.guideStyle}
                    onChange={(v) => patchFocus({ guideStyle: v })}
                    options={[
                      { value: 'chevrons', label: 'Chevrons' },
                      { value: 'band', label: 'Band' },
                      { value: 'line', label: 'Line' },
                      { value: 'minimal', label: 'Off' },
                    ]}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ClaySlider
                    label="Eye-Line Position"
                    tip="Keep near top edge for desk webcams"
                    value={settings.focusAndCamera.focusBandTopPct}
                    min={10}
                    max={65}
                    step={1}
                    unit="% top"
                    showSteppers
                    onChange={(v) => patchFocus({ focusBandTopPct: v })}
                  />
                  <ClaySlider
                    label="Focus Band Height"
                    value={settings.focusAndCamera.focusBandHeightPx}
                    min={64}
                    max={240}
                    step={8}
                    unit=" px"
                    onChange={(v) => patchFocus({ focusBandHeightPx: v })}
                  />
                  <ClaySlider
                    label="Peripheral Dimming"
                    value={Math.round(settings.focusAndCamera.peripheralDimOpacity * 100)}
                    min={0}
                    max={85}
                    step={5}
                    unit="%"
                    onChange={(v) => patchFocus({ peripheralDimOpacity: v / 100 })}
                  />
                </div>
              </ClayCard>

              <ClayCard padding="md" className="space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
                    Local Webcam Overlay
                  </h2>
                  <ClaySegmented
                    value={settings.focusAndCamera.webcamMode}
                    onChange={(v) => patchFocus({ webcamMode: v })}
                    options={[
                      { value: 'off', label: 'Off' },
                      { value: 'pipTop', label: 'Lens Box' },
                      { value: 'backdrop', label: 'Backdrop' },
                    ]}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ClaySlider
                    label="Webcam Opacity"
                    value={Math.round(settings.focusAndCamera.webcamOpacity * 100)}
                    min={15}
                    max={100}
                    step={5}
                    unit="%"
                    onChange={(v) => patchFocus({ webcamOpacity: v / 100 })}
                  />
                  <ClaySlider
                    label="Lens Box Width"
                    value={settings.focusAndCamera.webcamPipWidthPx}
                    min={160}
                    max={420}
                    step={20}
                    unit=" px"
                    onChange={(v) => patchFocus({ webcamPipWidthPx: v })}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <ClaySwitch
                    checked={settings.focusAndCamera.webcamMirror}
                    onChange={(v) => patchFocus({ webcamMirror: v })}
                    label="Mirror View"
                  />
                  <ClaySwitch
                    checked={settings.focusAndCamera.showEyeLineCrosshair}
                    onChange={(v) => patchFocus({ showEyeLineCrosshair: v })}
                    label="Lens Marker"
                  />
                  <ClaySwitch
                    checked={settings.focusAndCamera.showRuleOfThirds}
                    onChange={(v) => patchFocus({ showRuleOfThirds: v })}
                    label="Thirds Grid"
                  />
                </div>
              </ClayCard>
            </>
          )}

          {tab === 'physics' && (
            <ClayCard padding="md" className="space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
                  Scroll Engine
                </h2>
                <ClaySegmented
                  value={settings.physics.mode}
                  onChange={(v) => patchPhysics({ mode: v })}
                  options={[
                    { value: 'wpmWordDensity', label: 'Exact WPM' },
                    { value: 'constantPixels', label: 'Constant Px' },
                  ]}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <ClaySlider
                  label="Glide Inertia"
                  tip="Smooth acceleration on start and stop"
                  value={settings.physics.inertiaMs}
                  min={0}
                  max={800}
                  step={20}
                  unit=" ms"
                  onChange={(v) => patchPhysics({ inertiaMs: v })}
                />
                <ClaySlider
                  label="Speed Cue Ramp"
                  value={settings.physics.speedRampSeconds}
                  min={0.2}
                  max={3.0}
                  step={0.1}
                  formatValue={(v) => `${v.toFixed(1)}s`}
                  onChange={(v) => patchPhysics({ speedRampSeconds: v })}
                />
                <ClaySlider
                  label="WPM Nudge Step"
                  value={settings.physics.nudgeStepWpm}
                  min={1}
                  max={20}
                  step={1}
                  unit=" WPM"
                  showSteppers
                  onChange={(v) => patchPhysics({ nudgeStepWpm: v })}
                />
                <ClaySlider
                  label="Wheel Scrub"
                  value={settings.physics.wheelScrubLines}
                  min={1}
                  max={6}
                  step={1}
                  unit=" lines"
                  onChange={(v) => patchPhysics({ wheelScrubLines: v })}
                />
                {settings.physics.mode === 'constantPixels' && (
                  <ClaySlider
                    label="Base Pixel Speed"
                    value={settings.physics.constantPxPerSecAt140Wpm}
                    min={24}
                    max={160}
                    step={4}
                    unit=" px/s"
                    onChange={(v) => patchPhysics({ constantPxPerSecAt140Wpm: v })}
                  />
                )}
              </div>
            </ClayCard>
          )}

          {tab === 'cues' && (
            <>
              {/* Programmable Custom Cues */}
              <ClayCard padding="md" className="space-y-4">
                <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Custom Cues</h2>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                  {/* Existing Cues List */}
                  <div className="lg:col-span-6 space-y-2">
                    {customCues.length === 0 ? (
                      <div className="rounded-[10px] bg-[var(--bg-inset)] border border-[var(--border-subtle)] p-4 text-[12.5px] text-[var(--text-muted)]">
                        No custom cues yet.
                      </div>
                    ) : (
                      <div className="rounded-[10px] bg-[var(--bg-inset)] border border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
                        {customCues.map((cc) => (
                          <div
                            key={cc.id}
                            className="px-3 py-2.5 flex items-center justify-between gap-2 text-[12.5px]"
                          >
                            <div className="min-w-0 flex items-center gap-2.5">
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: cc.color }}
                              />
                              <div className="min-w-0">
                                <div className="font-mono-tabular font-semibold text-[var(--text-primary)] truncate">
                                  [{cc.tag.toUpperCase()}]
                                </div>
                                <div className="font-mono-tabular text-[11px] text-[var(--text-muted)] flex flex-wrap gap-1.5">
                                  {cc.pauseSeconds > 0 && <span>{cc.pauseSeconds}s pause</span>}
                                  {cc.speedMode === 'relative' && cc.speedDeltaPct !== 0 && (
                                    <span>
                                      {cc.speedDeltaPct > 0 ? '+' : ''}
                                      {cc.speedDeltaPct}% speed
                                    </span>
                                  )}
                                  {cc.speedMode === 'reset' && <span>reset speed</span>}
                                  {cc.tone !== 'none' && <span>{cc.tone} tone</span>}
                                  {cc.pauseSeconds === 0 &&
                                    cc.speedMode === 'none' &&
                                    cc.tone === 'none' && <span>visual cue</span>}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {cc.tone !== 'none' && (
                                <button
                                  type="button"
                                  title="Play tone"
                                  onClick={() =>
                                    playCustomCueTone(cc.tone, settings.rules.beepCueVolume)
                                  }
                                  className="h-7 w-7 rounded-[7px] hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] inline-flex items-center justify-center cursor-pointer"
                                >
                                  <Volume2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                title="Delete cue"
                                onClick={() => handleDeleteCustomCue(cc.id)}
                                className="h-7 w-7 rounded-[7px] hover:bg-[var(--danger-bg)] text-[var(--text-muted)] hover:text-[var(--danger)] inline-flex items-center justify-center cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Create New Cue Form */}
                  <form
                    onSubmit={handleAddCustomCue}
                    className="lg:col-span-6 rounded-[10px] bg-[var(--bg-inset)] border border-[var(--border-subtle)] p-3.5 space-y-3"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        placeholder="Tag name (e.g. DEMO)"
                        maxLength={20}
                        className="flex-1 h-9 px-3 rounded-[8px] bg-[var(--bg-surface)] border border-[var(--border-subtle)] font-mono-tabular text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
                      />
                      <input
                        type="color"
                        value={newColor}
                        onChange={(e) => setNewColor(e.target.value)}
                        title="Cue badge color"
                        className="h-9 w-9 rounded-[8px] bg-transparent cursor-pointer shrink-0"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      {CUSTOM_CUE_SWATCHES.map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          onClick={() => setNewColor(hex)}
                          className={`w-5 h-5 rounded-full cursor-pointer transition-transform ${
                            newColor === hex
                              ? 'scale-115 ring-2 ring-[var(--text-primary)]'
                              : 'opacity-80'
                          }`}
                          style={{ backgroundColor: hex }}
                        />
                      ))}
                    </div>

                    <ClaySlider
                      label="Pause"
                      value={newPause}
                      min={0}
                      max={10}
                      step={0.5}
                      formatValue={(v) => (v === 0 ? 'Off' : `${v.toFixed(1)}s`)}
                      onChange={setNewPause}
                    />

                    <div className="space-y-1.5">
                      <div className="text-[12px] font-medium text-[var(--text-secondary)]">
                        Speed Shift
                      </div>
                      <ClaySegmented<CustomCueSpeedMode>
                        value={newSpeedMode}
                        onChange={setNewSpeedMode}
                        options={[
                          { value: 'none', label: 'None' },
                          { value: 'relative', label: 'Change %' },
                          { value: 'reset', label: 'Reset' },
                        ]}
                      />
                      {newSpeedMode === 'relative' && (
                        <ClaySlider
                          label="Speed Change"
                          value={newSpeedDelta}
                          min={-30}
                          max={30}
                          step={2}
                          formatValue={(v) => `${v > 0 ? '+' : ''}${v}%`}
                          onChange={setNewSpeedDelta}
                        />
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <div className="text-[12px] font-medium text-[var(--text-secondary)]">
                        Audio Tone
                      </div>
                      <ClaySegmented<CustomCueTone>
                        value={newTone}
                        onChange={(v) => {
                          setNewTone(v);
                          if (v !== 'none') playCustomCueTone(v, settings.rules.beepCueVolume);
                        }}
                        options={[
                          { value: 'none', label: 'Off' },
                          { value: 'low', label: 'Low' },
                          { value: 'mid', label: 'Mid' },
                          { value: 'high', label: 'High' },
                        ]}
                      />
                    </div>

                    <ClayButton type="submit" variant="primary" size="md" className="w-full">
                      <Plus className="w-3.5 h-3.5" />
                      Add Custom Cue
                    </ClayButton>
                  </form>
                </div>
              </ClayCard>

              {/* Built-in Cue & Playback Rules */}
              <ClayCard padding="md" className="space-y-4">
                <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
                  Timing & Stage Rules
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ClaySlider
                    label="Countdown"
                    value={settings.rules.countdownSeconds}
                    min={0}
                    max={15}
                    step={1}
                    unit=" s"
                    showSteppers
                    onChange={(v) => patchRules({ countdownSeconds: v })}
                  />
                  <ClaySlider
                    label="Beat Length"
                    value={settings.rules.beatDurationSeconds}
                    min={0.4}
                    max={2.0}
                    step={0.1}
                    formatValue={(v) => `${v.toFixed(1)}s`}
                    onChange={(v) => patchRules({ beatDurationSeconds: v })}
                  />
                  <ClaySlider
                    label="Cue Volume"
                    value={Math.round(settings.rules.beepCueVolume * 100)}
                    min={0}
                    max={100}
                    step={5}
                    unit="%"
                    onChange={(v) => patchRules({ beepCueVolume: v / 100 })}
                  />
                  {!settings.rules.alwaysShowDock && (
                    <ClaySlider
                      label="Hide Dock After"
                      value={Math.round(settings.rules.autoHideDockMs / 1000)}
                      min={1}
                      max={10}
                      step={1}
                      unit=" s"
                      onChange={(v) => patchRules({ autoHideDockMs: v * 1000 })}
                    />
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <ClaySwitch
                    checked={settings.rules.countdownAudioTicks}
                    onChange={(v) => patchRules({ countdownAudioTicks: v })}
                    label="Countdown Ticks"
                  />
                  <ClaySwitch
                    checked={settings.rules.waitForVoiceToStart}
                    onChange={(v) => patchRules({ waitForVoiceToStart: v })}
                    label="Wait for Voice"
                    tip="Hold at top until microphone hears speech"
                  />
                  <ClaySwitch
                    checked={settings.rules.alwaysShowDock}
                    onChange={(v) => patchRules({ alwaysShowDock: v })}
                    label="Pin Stage Dock"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div className="space-y-1.5">
                    <div className="text-[12px] font-medium text-[var(--text-secondary)]">
                      Pause Cues
                    </div>
                    <ClaySegmented
                      value={settings.rules.pauseCueMode}
                      onChange={(v) => patchRules({ pauseCueMode: v })}
                      options={[
                        { value: 'autoTimer', label: 'Auto' },
                        { value: 'manualTap', label: 'Manual' },
                      ]}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="text-[12px] font-medium text-[var(--text-secondary)]">
                      Markers
                    </div>
                    <ClaySegmented
                      value={settings.rules.markerBehavior}
                      onChange={(v) => patchRules({ markerBehavior: v })}
                      options={[
                        { value: 'smooth', label: 'Smooth' },
                        { value: 'pulse', label: 'Pulse' },
                        { value: 'autoPause', label: 'Pause' },
                      ]}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="text-[12px] font-medium text-[var(--text-secondary)]">
                      At Script End
                    </div>
                    <ClaySegmented
                      value={settings.rules.endOfScriptAction}
                      onChange={(v) => patchRules({ endOfScriptAction: v })}
                      options={[
                        { value: 'summary', label: 'Summary' },
                        { value: 'stop', label: 'Hold' },
                        { value: 'loop', label: 'Loop' },
                      ]}
                    />
                  </div>
                </div>

                {settings.rules.endOfScriptAction === 'loop' && (
                  <ClaySlider
                    label="Loop Delay"
                    value={settings.rules.loopDelaySeconds}
                    min={1}
                    max={12}
                    step={1}
                    unit=" s"
                    onChange={(v) => patchRules({ loopDelaySeconds: v })}
                  />
                )}

                <div className="flex items-center gap-2 pt-1">
                  <ClayButton
                    variant="surface"
                    size="sm"
                    onClick={() => playCountdownTick(false, settings.rules.beepCueVolume)}
                  >
                    Test Tick
                  </ClayButton>
                  <ClayButton
                    variant="surface"
                    size="sm"
                    onClick={() => playCueBeep(settings.rules.beepCueVolume)}
                  >
                    Test Beep
                  </ClayButton>
                </div>
              </ClayCard>
            </>
          )}

          {tab === 'voice' && (
            <ClayCard padding="md" className="space-y-4">
              <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
                Microphone Voice Guard
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <ClaySwitch
                  checked={settings.vad.enabled}
                  onChange={(v) => patchVad({ enabled: v })}
                  label="Auto-Pause on Silence"
                  tip="Pauses scroll when you stop speaking"
                />
                <ClaySwitch
                  checked={settings.vad.showLiveMeterInStage}
                  onChange={(v) => patchVad({ showLiveMeterInStage: v })}
                  label="Stage Voice Meter"
                />
              </div>

              <div className="rounded-[10px] bg-[var(--bg-inset)] border border-[var(--border-subtle)] p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <ClayButton
                    variant={vadTesting ? 'tonal' : 'surface'}
                    size="sm"
                    onClick={toggleVadTester}
                  >
                    {vadTesting ? (
                      <>
                        <Mic className="w-3.5 h-3.5" /> Stop Test
                      </>
                    ) : (
                      <>
                        <MicOff className="w-3.5 h-3.5" /> Test Mic Gate
                      </>
                    )}
                  </ClayButton>
                  <div className="flex items-center gap-2.5 text-[12px] font-mono-tabular">
                    {vadTesting && (
                      <span
                        className={
                          vadLiveSpeaking ? 'text-[var(--accent-text)]' : 'text-[var(--amber)]'
                        }
                      >
                        {vadLiveSpeaking ? 'Active' : 'Paused'}
                      </span>
                    )}
                    <span ref={vadDbRef} className="text-[var(--text-secondary)]">
                      -60 dB
                    </span>
                  </div>
                </div>
                <div className="relative h-2.5 rounded-full bg-[var(--bg-surface-hover)] overflow-hidden">
                  <div
                    ref={vadBarRef}
                    className="h-full w-full origin-left rounded-full"
                    style={{ transform: 'scaleX(0.02)', backgroundColor: '#746556' }}
                  />
                  <div
                    className="absolute top-0 bottom-0 w-[2px] bg-[var(--text-primary)]"
                    style={{ left: `${thresholdPct}%` }}
                  />
                </div>
                {vadError && <div className="text-[12px] text-[var(--danger)]">{vadError}</div>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <ClaySlider
                  label="Noise Gate"
                  value={settings.vad.thresholdDb}
                  min={-55}
                  max={-10}
                  step={1}
                  unit=" dB"
                  showSteppers
                  onChange={(v) => patchVad({ thresholdDb: v })}
                />
                <ClaySlider
                  label="Silence Timeout"
                  value={settings.vad.silenceTimeoutMs}
                  min={600}
                  max={4500}
                  step={100}
                  formatValue={(v) => `${(v / 1000).toFixed(1)}s`}
                  onChange={(v) => patchVad({ silenceTimeoutMs: v })}
                />
                <ClaySlider
                  label="Resume Hold"
                  value={settings.vad.speechResumeHoldMs}
                  min={80}
                  max={700}
                  step={20}
                  unit=" ms"
                  onChange={(v) => patchVad({ speechResumeHoldMs: v })}
                />
              </div>
            </ClayCard>
          )}

          {tab === 'keys' && (
            <ClayCard padding="md" className="space-y-3.5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
                  Keyboard & Presenter Shortcuts
                </h2>
                <ClayButton
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onUpdateSettings((prev) => ({
                      ...prev,
                      keybindings: DEFAULT_STUDIO_SETTINGS.keybindings,
                    }));
                    onNotify('Shortcuts reset');
                  }}
                >
                  Reset Keys
                </ClayButton>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {KEYBIND_ITEMS.map((item) => {
                  const isListening = listeningKey === item.key;
                  return (
                    <div
                      key={item.key}
                      className="px-3.5 py-2 rounded-[10px] bg-[var(--bg-inset)] border border-[var(--border-subtle)] flex items-center justify-between gap-3"
                    >
                      <span className="text-[13px] font-medium text-[var(--text-primary)]">
                        {item.label}
                      </span>
                      <ClayButton
                        variant={isListening ? 'primary' : 'surface'}
                        size="sm"
                        onClick={() => setListeningKey(isListening ? null : item.key)}
                        className="min-w-[88px] font-mono-tabular"
                      >
                        {isListening
                          ? 'Press key…'
                          : formatKeyCode(settings.keybindings[item.key])}
                      </ClayButton>
                    </div>
                  );
                })}
              </div>
            </ClayCard>
          )}
        </div>
      </div>
    </div>
  );
};
