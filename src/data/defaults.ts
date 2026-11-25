import {
  CustomCueDefinition,
  PromptBuilderConfig,
  ScriptDocument,
  SpeedProfile,
  StageThemeId,
  StudioSettings,
} from '../types/prompter';

export interface StageThemeSpec {
  id: StageThemeId;
  name: string;
  bg: string;
  text: string;
  accent: string;
  muted: string;
  isLight?: boolean;
}

export const STAGE_THEMES: Record<Exclude<StageThemeId, 'custom'>, StageThemeSpec> = {
  obsidian: {
    id: 'obsidian',
    name: 'Walnut Night',
    bg: '#100D0B',
    text: '#F5EFE4',
    accent: '#63AD82',
    muted: '#A99986',
  },
  oled: {
    id: 'oled',
    name: 'Pure OLED',
    bg: '#000000',
    text: '#FFFFFF',
    accent: '#63AD82',
    muted: '#9CA3AF',
  },
  amber: {
    id: 'amber',
    name: 'Amber Bark',
    bg: '#110C07',
    text: '#FDE9B8',
    accent: '#E09F4B',
    muted: '#B49A74',
  },
  graphite: {
    id: 'graphite',
    name: 'Forest Slate',
    bg: '#131916',
    text: '#ECF2ED',
    accent: '#7AC49A',
    muted: '#8FA397',
  },
  paper: {
    id: 'paper',
    name: 'Warm Paper',
    bg: '#F7F2E9',
    text: '#1C1611',
    accent: '#2F6C4B',
    muted: '#5E5144',
    isLight: true,
  },
};

export const CUSTOM_CUE_SWATCHES = [
  '#63AD82',
  '#D99B52',
  '#C97A5B',
  '#8FA98F',
  '#C2A878',
  '#7BA4B8',
];

export const DEFAULT_CUSTOM_CUES: CustomCueDefinition[] = [
  {
    id: 'cc-slide',
    tag: 'SLIDE',
    color: '#D99B52',
    pauseSeconds: 1.5,
    speedMode: 'none',
    speedDeltaPct: 0,
    tone: 'mid',
  },
  {
    id: 'cc-story',
    tag: 'STORY',
    color: '#63AD82',
    pauseSeconds: 0,
    speedMode: 'relative',
    speedDeltaPct: -12,
    tone: 'none',
  },
  {
    id: 'cc-sip',
    tag: 'SIP',
    color: '#C2A878',
    pauseSeconds: 2.5,
    speedMode: 'none',
    speedDeltaPct: 0,
    tone: 'low',
  },
];

export function resolveStageColors(settings: StudioSettings['appearance']) {
  if (settings.themePreset === 'custom') {
    return {
      bg: settings.customBgHex,
      text: settings.customTextHex,
      accent: settings.customAccentHex,
      muted: settings.customTextHex,
      isLight: false,
    };
  }
  return STAGE_THEMES[settings.themePreset] ?? STAGE_THEMES.obsidian;
}

export const DEFAULT_SPEED_PROFILE: SpeedProfile = {
  baselineWpm: 142,
  deliberateWpm: 125,
  energeticWpm: 159,
  activeWpm: 156,
  lastCalibratedAt: null,
};

export const DEFAULT_STUDIO_SETTINGS: StudioSettings = {
  uiTheme: 'dark',
  appearance: {
    fontSizePx: 46,
    fontFamily: 'dm-sans',
    fontWeight: 500,
    lineHeight: 1.55,
    letterSpacingEm: 0.01,
    wordSpacingEm: 0,
    columnWidthPct: 60,
    horizontalPaddingPx: 40,
    textAlign: 'left',
    mirrorX: false,
    mirrorY: false,
    underlineColor: '#63AD82',
    underlineThicknessPx: 3,
    highlightColor: '#D99B52',
    showInlineCues: true,
    themePreset: 'obsidian',
    customBgHex: '#100D0B',
    customTextHex: '#F5EFE4',
    customAccentHex: '#63AD82',
  },
  focusAndCamera: {
    focusBandTopPct: 22,
    focusBandHeightPx: 126,
    peripheralDimOpacity: 0.45,
    guideStyle: 'chevrons',
    webcamMode: 'off',
    webcamOpacity: 0.85,
    webcamPipWidthPx: 240,
    webcamMirror: true,
    showEyeLineCrosshair: true,
    showRuleOfThirds: false,
  },
  physics: {
    mode: 'wpmWordDensity',
    inertiaMs: 260,
    speedRampSeconds: 1.0,
    wheelScrubLines: 2,
    nudgeStepWpm: 5,
    constantPxPerSecAt140Wpm: 68,
  },
  rules: {
    countdownSeconds: 3,
    countdownAudioTicks: true,
    waitForVoiceToStart: false,
    pauseCueMode: 'autoTimer',
    beatDurationSeconds: 0.8,
    markerBehavior: 'pulse',
    endOfScriptAction: 'summary',
    loopDelaySeconds: 4,
    autoHideDockMs: 3200,
    alwaysShowDock: false,
    beepCueVolume: 0.35,
  },
  vad: {
    enabled: false,
    thresholdDb: -34,
    silenceTimeoutMs: 1400,
    speechResumeHoldMs: 220,
    showLiveMeterInStage: true,
  },
  keybindings: {
    playPause: 'Space',
    speedUp: 'ArrowUp',
    speedDown: 'ArrowDown',
    nextMarker: 'ArrowRight',
    prevMarker: 'ArrowLeft',
    reset: 'KeyR',
    mirrorX: 'KeyM',
    toggleWebcam: 'KeyC',
    fullscreen: 'KeyF',
  },
  customCues: DEFAULT_CUSTOM_CUES,
  editor: {
    toolbarMode: 'compact',
    wideCanvas: false,
  },
};

export interface StudioPreset {
  id: string;
  name: string;
  tip: string;
  patch: (base: StudioSettings) => StudioSettings;
}

export const STUDIO_PRESETS: StudioPreset[] = [
  {
    id: 'webcam-natural',
    name: 'Webcam',
    tip: 'Narrow top eye-line column for desk cameras',
    patch: (base) => ({
      ...base,
      appearance: {
        ...base.appearance,
        fontSizePx: 52,
        columnWidthPct: 58,
        mirrorX: false,
        mirrorY: false,
        themePreset: 'obsidian',
      },
      focusAndCamera: {
        ...base.focusAndCamera,
        focusBandTopPct: 20,
        guideStyle: 'chevrons',
        peripheralDimOpacity: 0.45,
      },
      physics: {
        ...base.physics,
        mode: 'wpmWordDensity',
        inertiaMs: 260,
      },
    }),
  },
  {
    id: 'glass-rig',
    name: 'Glass Rig',
    tip: 'Mirrored high-contrast OLED for beam splitters',
    patch: (base) => ({
      ...base,
      appearance: {
        ...base.appearance,
        fontSizePx: 66,
        columnWidthPct: 78,
        mirrorX: true,
        mirrorY: false,
        themePreset: 'oled',
      },
      focusAndCamera: {
        ...base.focusAndCamera,
        focusBandTopPct: 38,
        guideStyle: 'band',
        peripheralDimOpacity: 0.55,
        webcamMode: 'off',
      },
      physics: {
        ...base.physics,
        inertiaMs: 180,
      },
    }),
  },
  {
    id: 'fast-explainer',
    name: 'Explainer',
    tip: 'Snappy inertia and shorter beats for demos',
    patch: (base) => ({
      ...base,
      appearance: {
        ...base.appearance,
        fontSizePx: 56,
        columnWidthPct: 62,
        themePreset: 'obsidian',
        underlineColor: '#63AD82',
        highlightColor: '#D99B52',
      },
      physics: {
        ...base.physics,
        inertiaMs: 140,
        speedRampSeconds: 0.6,
        nudgeStepWpm: 10,
      },
      rules: {
        ...base.rules,
        countdownSeconds: 3,
        beatDurationSeconds: 0.6,
        markerBehavior: 'pulse',
      },
    }),
  },
  {
    id: 'strict-pitch',
    name: 'Timed Pitch',
    tip: 'Audio countdown ticks and automatic pace summary',
    patch: (base) => ({
      ...base,
      appearance: {
        ...base.appearance,
        fontSizePx: 50,
        columnWidthPct: 64,
        themePreset: 'graphite',
      },
      rules: {
        ...base.rules,
        countdownSeconds: 5,
        countdownAudioTicks: true,
        pauseCueMode: 'autoTimer',
        markerBehavior: 'pulse',
        endOfScriptAction: 'summary',
      },
    }),
  },
];

export interface CalibrationPassage {
  id: string;
  title: string;
  text: string;
}

export const CALIBRATION_PASSAGES: CalibrationPassage[] = [
  {
    id: 'conversational',
    title: 'Conversational',
    text: `Good camera presence has very little to do with memorizing every word in advance. What actually makes a video feel effortless is finding the exact rhythm where your eyes stay relaxed and your voice has room to breathe. When a teleprompter scrolls even slightly too fast, most speakers unconsciously flatten their tone and rush through the best part of their point. By measuring your natural speaking speed first, every line arrives right when you expect it, so you can focus on connecting with the person watching on the other side of the lens.`,
  },
  {
    id: 'instructional',
    title: 'Walkthrough',
    text: `Before we look at the final dashboard, let us walk through the three steps that keep this workflow predictable. First, we separate raw input from formatting cues so our timing math stays completely accurate no matter how large you make the text. Second, we align the reading window right below your desk webcam, which cuts out distracting side-to-side eye movement. Finally, we layer in short visual pauses so complex ideas have a full second to settle before you move on to the next screen.`,
  },
  {
    id: 'storytelling',
    title: 'Story',
    text: `Most great talks begin with a single quiet observation rather than a loud headline. Picture standing in front of a room that has already heard five presentations before yours. Everyone is tired, checking the clock, and expecting another wall of slides. Then you pause for two full seconds, look straight ahead, and ask one simple question nobody has answered yet. Suddenly the room leans forward. That small shift in pacing is not luck, it is deliberate rhythm.`,
  },
];

export const DEFAULT_PROMPT_BUILDER_CONFIG: PromptBuilderConfig = {
  targetWpm: 142,
  pauseDensity: 'balanced',
  emphasisDensity: 'moderate',
  includeBreathNotes: true,
  includeSectionMarkers: true,
  includeSpeedShifts: true,
  deliveryTone: 'conversational',
  maxWordsPerSentence: 18,
};

export const STARTER_SCRIPTS: ScriptDocument[] = [
  {
    id: 'starter-webcam-intro',
    title: 'Webcam Studio Demo',
    category: 'Video',
    updatedAt: Date.now() - 1000 * 60 * 15,
    customWpmOverride: null,
    targetSeconds: null,
    content: `[MARKER: Hook]
[SMILE]
Most people think reading from a teleprompter makes you look **robotic** on camera. [BEAT] Actually, the real culprit is __guessing the scroll speed__.

[PAUSE 2s]

[MARKER: Pacing]
When text moves even ten words per minute faster than your natural voice, your shoulders tense up and you stop pausing at the end of thoughts. [BREATHE]

[STORY]
Notice how this section gently slows down right here, giving ==the most important takeaway== room to breathe so your audience remembers it.

[SLIDE]

[MARKER: Delivery]
[SPEED RESET]
Because the reading column stays narrow right underneath your webcam lens, your eyes stay calm in one spot. [BEAT] Lean into the __underlined phrases__, hit the **bold punches**, and let ~~small conversational asides~~ feel light and natural.

[BEEP]
[MARKER: Close]
[PAUSE 1.5s]
Whenever you are ready, open **Calibrate** to measure your exact natural speed, or tap **Prompt** to run a take right away. [SMILE]`,
  },
  {
    id: 'starter-product-launch',
    title: '90-Second Product Walkthrough',
    category: 'Tutorial',
    updatedAt: Date.now() - 1000 * 60 * 120,
    customWpmOverride: null,
    targetSeconds: 90,
    content: `[MARKER: Problem]
[LOOK AT LENS]
If you record weekly demos at your desk, you already know the **two-hour reshoot trap**. [BEAT] You nail the first forty seconds, stumble over one feature name, and start all over again.

[PAUSE 2s]

[MARKER: Three Steps]
Here is how we cut recording time down to ==one single confident take==.

First, calibrate your natural voice for thirty seconds so every script shows its __exact runtime__ before you hit record. [BEAT]

Second, drop in short timed pauses right where you switch tabs or show a chart, so the script waits for **you**. [BREATHE]

[SPEED -10%]
Third, turn on the local webcam eye-line guide to verify your framing right beneath the lens.

[PAUSE 2s]

[MARKER: Next Step]
[SPEED RESET]
[SMILE]
Try running this walkthrough once at your natural baseline, then nudge by five words per minute until it feels completely effortless.`,
  },
  {
    id: 'starter-team-update',
    title: 'Weekly Team Update',
    category: 'Update',
    updatedAt: Date.now() - 1000 * 60 * 60 * 24,
    customWpmOverride: null,
    targetSeconds: 60,
    content: `[MARKER: Wins]
[SMILE]
Quick three-part update for the team before we head into Friday. [BEAT]

First, we shipped the __new onboarding checklist__ on Tuesday, and early completion rates jumped to ==seventy-four percent== in the first forty-eight hours.

[PAUSE 1.5s]

[MARKER: Next Priority]
[BREATHE]
Next week our **top priority** is tightening mobile checkout latency ~~we already trimmed two hundred milliseconds yesterday~~ so the whole flow feels instant.

[PAUSE 2s]

[MARKER: Ask]
If you have any edge-case feedback from customer calls, drop it in the thread by **Wednesday noon**. Thanks everyone!`,
  },
];
