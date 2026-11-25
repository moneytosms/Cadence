export type NavTab = 'calibrate' | 'script' | 'library' | 'settings';

export type UiTheme = 'dark' | 'light';

export type ScriptCategory = 'Video' | 'Tutorial' | 'Keynote' | 'Update' | 'Practice';

export type StageThemeId = 'obsidian' | 'oled' | 'amber' | 'graphite' | 'paper' | 'custom';

export type PrompterFontFamily = 'dm-sans' | 'jakarta' | 'serif' | 'mono';

export type FocusGuideStyle = 'chevrons' | 'line' | 'band' | 'minimal';

export type WebcamOverlayMode = 'off' | 'pipTop' | 'backdrop';

export type ScrollEngineMode = 'wpmWordDensity' | 'constantPixels';

export type PauseCueMode = 'autoTimer' | 'manualTap';

export type MarkerBehavior = 'smooth' | 'pulse' | 'autoPause';

export type EndOfScriptAction = 'stop' | 'loop' | 'summary';

export type CustomCueTone = 'none' | 'low' | 'mid' | 'high';

export type CustomCueSpeedMode = 'none' | 'relative' | 'reset';

export type EditorToolbarMode = 'compact' | 'floating' | 'expanded';

export interface CustomCueDefinition {
  id: string;
  tag: string;
  color: string;
  pauseSeconds: number;
  speedMode: CustomCueSpeedMode;
  speedDeltaPct: number;
  tone: CustomCueTone;
}

export interface EditorPreferences {
  toolbarMode: EditorToolbarMode;
  wideCanvas: boolean;
}

export interface CalibrationRecord {
  id: string;
  timestamp: number;
  passageTitle: string;
  wordCount: number;
  totalSeconds: number;
  activeSpeakingSeconds: number;
  pauseCount: number;
  avgPauseSeconds: number;
  grossWpm: number;
  activeWpm: number;
  usedMicVad: boolean;
}

export interface SpeedProfile {
  baselineWpm: number;
  deliberateWpm: number;
  energeticWpm: number;
  activeWpm: number;
  lastCalibratedAt: number | null;
}

export interface ScriptDocument {
  id: string;
  title: string;
  content: string;
  category: ScriptCategory;
  updatedAt: number;
  customWpmOverride: number | null;
  targetSeconds: number | null;
}

export interface KeyBindings {
  playPause: string;
  speedUp: string;
  speedDown: string;
  nextMarker: string;
  prevMarker: string;
  reset: string;
  mirrorX: string;
  toggleWebcam: string;
  fullscreen: string;
}

export interface PrompterAppearance {
  fontSizePx: number;
  fontFamily: PrompterFontFamily;
  fontWeight: 400 | 500 | 600 | 700;
  lineHeight: number;
  letterSpacingEm: number;
  wordSpacingEm: number;
  columnWidthPct: number;
  horizontalPaddingPx: number;
  textAlign: 'left' | 'center';
  mirrorX: boolean;
  mirrorY: boolean;
  underlineColor: string;
  underlineThicknessPx: number;
  highlightColor: string;
  showInlineCues: boolean;
  themePreset: StageThemeId;
  customBgHex: string;
  customTextHex: string;
  customAccentHex: string;
}

export interface FocusAndCameraSettings {
  focusBandTopPct: number;
  focusBandHeightPx: number;
  peripheralDimOpacity: number;
  guideStyle: FocusGuideStyle;
  webcamMode: WebcamOverlayMode;
  webcamOpacity: number;
  webcamPipWidthPx: number;
  webcamMirror: boolean;
  showEyeLineCrosshair: boolean;
  showRuleOfThirds: boolean;
}

export interface ScrollPhysicsSettings {
  mode: ScrollEngineMode;
  inertiaMs: number;
  speedRampSeconds: number;
  wheelScrubLines: number;
  nudgeStepWpm: number;
  constantPxPerSecAt140Wpm: number;
}

export interface AutomationRules {
  countdownSeconds: number;
  countdownAudioTicks: boolean;
  waitForVoiceToStart: boolean;
  pauseCueMode: PauseCueMode;
  beatDurationSeconds: number;
  markerBehavior: MarkerBehavior;
  endOfScriptAction: EndOfScriptAction;
  loopDelaySeconds: number;
  autoHideDockMs: number;
  alwaysShowDock: boolean;
  beepCueVolume: number;
}

export interface VadSettings {
  enabled: boolean;
  thresholdDb: number;
  silenceTimeoutMs: number;
  speechResumeHoldMs: number;
  showLiveMeterInStage: boolean;
}

export interface StudioSettings {
  uiTheme: UiTheme;
  appearance: PrompterAppearance;
  focusAndCamera: FocusAndCameraSettings;
  physics: ScrollPhysicsSettings;
  rules: AutomationRules;
  vad: VadSettings;
  keybindings: KeyBindings;
  customCues: CustomCueDefinition[];
  editor: EditorPreferences;
}

export type InlineRunType = 'text' | 'underline' | 'bold' | 'highlight' | 'soft' | 'cueChip';

export interface InlineRun {
  type: InlineRunType;
  text: string;
  cueKind?: 'pause' | 'beat' | 'speed' | 'marker' | 'delivery' | 'beep' | 'custom';
  customColor?: string;
}

export type CueActionType =
  | 'pause'
  | 'beat'
  | 'speedAbsolute'
  | 'speedRelative'
  | 'speedReset'
  | 'marker'
  | 'beep'
  | 'custom';

export interface CueEvent {
  id: string;
  blockIndex: number;
  type: CueActionType;
  value?: number;
  label: string;
  tone?: CustomCueTone;
  speedMode?: CustomCueSpeedMode;
  speedDeltaPct?: number;
}

export interface CompiledBlock {
  index: number;
  kind: 'paragraph' | 'marker' | 'cueLine';
  raw: string;
  runs: InlineRun[];
  spokenWords: number;
  cues: CueEvent[];
  markerTitle?: string;
}

export interface CompiledScript {
  blocks: CompiledBlock[];
  totalSpokenWords: number;
  totalExplicitPauseSeconds: number;
  markers: { id: string; title: string; blockIndex: number }[];
  cueSummary: {
    pauses: number;
    beats: number;
    speedChanges: number;
    underlines: number;
    bolds: number;
    highlights: number;
    markers: number;
    deliveryNotes: number;
  };
}

export interface TakeSummary {
  scriptTitle: string;
  spokenWords: number;
  estimatedSeconds: number;
  actualSeconds: number;
  targetWpm: number;
  effectiveWpm: number;
  pausesTriggered: number;
  vadPauses: number;
  completedPct: number;
}

export interface PromptBuilderConfig {
  targetWpm: number;
  pauseDensity: 'light' | 'balanced' | 'expressive';
  emphasisDensity: 'minimal' | 'moderate' | 'vivid';
  includeBreathNotes: boolean;
  includeSectionMarkers: boolean;
  includeSpeedShifts: boolean;
  deliveryTone: 'conversational' | 'instructional' | 'storytelling' | 'executive';
  maxWordsPerSentence: number;
}
