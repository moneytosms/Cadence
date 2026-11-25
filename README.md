# Cadence

Cadence is a fast, 100% client-side browser teleprompter studio designed for webcam recording, desk video production, and natural spoken delivery. It measures your real speaking pace, helps you audition and tune your target WPM, provides a borderless script editor with programmable cues, and runs a 60fps GPU-composited teleprompter stage.

Zero AI APIs, zero accounts, and zero cloud uploads. Your scripts, camera preview, microphone voice detection, and preferences stay entirely inside your browser.

---

## Core Features

### 1. Guided Pace Calibration
- **Natural Reading Test**: Read short built-in passages or paste your own paragraph to measure your baseline words per minute.
- **Non-AI Microphone Voice Activity Detection (VAD)**: Uses the browser Web Audio API (`AnalyserNode` RMS decibel calculation) to detect natural breathing pauses and report both overall pace and active speaking speed.
- **Live Speed Audition Strip**: Test your calibrated WPM on a live scrolling strip before launching a recording, switch between Deliberate, Natural, and Energetic presets, and review past calibration runs.

### 2. Borderless Script Editor
- **Single-Scroll Document Canvas**: An auto-growing, distraction-free editor with custom dark-walnut scrollbars and zero nested double scrollbars.
- **Icon-Only Formatting & Keyboard Shortcuts**: Bold (`Ctrl/Cmd+B`), Underline (`Ctrl/Cmd+U`), Highlight (`Ctrl/Cmd+Shift+H`), and Soften Asides (`~~text~~`).
- **Right-Click Context Menu**: Select any phrase and right-click inside the editor to style text, insert built-in cues, insert custom cues, or cut/copy/paste.
- **Flexible Toolbar Layouts**: Open the `•••` menu to switch between:
  - **Compact Bar** (sticky minimal bar + right-click menu)
  - **Floating on Select** (minimal top bar + floating style bubble when highlighting text)
  - **Expanded Cue Bar** (quick one-click cue ribbon across the top)
- **Pace & Target Duration Solver**: Click the live pace readout to override WPM for a specific script or solve the exact WPM needed to hit a target runtime.
- **Instant Export**: Download as `.md` or `.txt`, copy clean plain text (markup stripped), or copy full script with cues.

### 3. Programmable Custom Cues
Open **Settings -> Cues** to create your own reusable inline tags (such as `[SLIDE]`, `[STORY]`, `[SIP]`, or `[B-ROLL]`):
- Custom tag name and badge color swatch
- Optional timed auto-pause (0s to 8s)
- Optional speed shift (none, relative percentage shift, or reset to baseline)
- Optional Web Audio synthesized chime (`Off`, `Low`, `Mid`, or `High`) with instant preview

Custom cues automatically work across the editor cue menu, right-click menu, duration calculator, External LLM Prompt Builder, and live Prompter Stage.

### 4. External LLM Prompt Builder & Smart Paste Importer
Cadence contains no built-in AI. Instead, it includes a copy-pastable prompt builder that formats instructions for any external LLM you choose, teaching it Cadence's inline pauses, underlines, highlights, speed shifts, section markers, and your own custom cues. Paste the external output back into **Paste & Import** to clean code fences, preview rich formatting, and save directly into your workspace.

### 5. 60fps Dark Prompter Stage
- **Word-Density Scroll Engine**: Measures rendered pixel height and spoken word count per paragraph so scroll speed stays true to your WPM regardless of font size or column width.
- **Smooth Inertia & Ramps**: Hardware-composited `translate3d` rendering with configurable start/stop inertia and eased speed transitions.
- **Webcam Eye-Line Framing**: Optional local webcam picture-in-picture near the top bezel or translucent backdrop, complete with eye-line crosshair and rule-of-thirds overlay.
- **Voice Guard Auto-Pause**: Optionally pauses scrolling automatically when you stop speaking and resumes smoothly when your voice returns.
- **Beam-Splitter Mirroring**: One-tap horizontal or vertical flip for hardware teleprompter glass.
- **Post-Take Pace Summary**: Compares actual runtime against estimated duration and lets you save your measured effective WPM as your new baseline.

### 6. Local Script Library & Backup
- Save unlimited scripts in browser `localStorage`.
- Import `.txt` and `.md` files directly from disk.
- Export or restore your entire workspace (scripts, speed profile, calibration history, custom cues, and settings) as a portable `.json` backup.

---

## Inline Markup & Cue Reference

| Syntax | Effect in Prompter Stage |
| :--- | :--- |
| `**text**` | Bold emphasis |
| `__text__` | Underlined key phrase (accent underline) |
| `==text==` | Highlighted punchline |
| `~~text~~` | Softened aside (dimmed italic) |
| `[PAUSE 2s]` | Auto-pauses scrolling for 2 seconds (supports `0.5s` to `30s`) |
| `[BEAT]` | Short rhythmic pause using your configured Beat duration |
| `[MARKER: Intro]` | Section divider and quick-jump chapter marker |
| `[SPEED 130]` | Smoothly ramps scroll speed to 130 WPM |
| `[SPEED -15%]` / `[SPEED +10%]` | Smoothly shifts speed relative to baseline WPM |
| `[SPEED RESET]` | Ramps smoothly back to baseline WPM |
| `[BEEP]` | Plays a gentle synthesized Web Audio tick |
| `[BREATHE]`, `[SMILE]`, `[SLOW]`, `[LOUD]`, `[PAUSE]` | Visual stage direction cue badge |
| `[CUSTOM_TAG]` | Executes any custom cue defined in **Settings -> Cues** |

---

## Default Keyboard & Clicker Shortcuts

Every shortcut below can be remapped inside **Settings -> Keys** to match Bluetooth presenters or foot pedals.

| Action | Default Key |
| :--- | :--- |
| Play / Pause (or resume manual hold) | `Space` |
| Increase Speed | `ArrowUp` |
| Decrease Speed | `ArrowDown` |
| Next Section Marker | `PageDown` |
| Previous Section Marker | `PageUp` |
| Reset to Start | `R` |
| Flip Horizontal Mirror | `M` |
| Toggle Webcam Overlay | `C` |
| Toggle Fullscreen | `F` |
| Exit Prompter Stage | `Escape` |

### Editor Shortcuts
- `Ctrl/Cmd + B`: Bold selection
- `Ctrl/Cmd + U`: Underline selection
- `Ctrl/Cmd + Shift + H`: Highlight selection
- `Right-Click`: Open formatting and cue context menu

---

## Tech Stack

- **Framework**: React 19 + TypeScript + Vite 8
- **Styling**: Tailwind CSS v4 + carved dark walnut/pine design system
- **Icons**: Lucide React
- **Browser APIs**: Web Audio API (RMS voice detection & synthesized chimes), MediaDevices API (local webcam & microphone), Fullscreen API, `localStorage`

---

## Local Development

```bash
# Install dependencies
npm install

# Start development server on port 3000
npm run dev

# Type-check with TypeScript
npm run lint

# Build production bundle
npm run build
```

---

## Architecture Overview

```text
src/
  App.tsx                        # Responsive top bar, workspace state, localStorage persistence
  types/prompter.ts              # Core data models for scripts, cues, settings, and speed profiles
  data/defaults.ts               # Default themes, passages, starter scripts, and default custom cues
  hooks/useLocalStorage.ts       # Safe deep-merging localStorage hook
  utils/
    audioEngine.ts               # RMS MicVadController and Web Audio tone synthesis
    scriptParser.ts              # Inline markup tokenizer, custom cue parser, WPM duration engine, LLM prompt builder
  components/
    CalibrateView.tsx            # Natural pace test, live mic meter, and audition strip
    ScriptStudioView.tsx         # Borderless auto-growing editor, right-click menu, toolbar modes, exports
    LibraryView.tsx              # Script search, TXT/MD import, and JSON workspace backup/restore
    PrompterStage.tsx            # 60fps GPU scroll stage, webcam framing, Voice Guard, take summary
    SettingsView.tsx             # Full-page settings with back navigation, themes, custom cues, and shortcuts
    LlmPromptModal.tsx           # External LLM prompt generator and smart paste importer
    RichTextRenderer.tsx         # Shared stage and preview rich-text renderer
    ui/
      CadenceLogo.tsx            # Organic tree-ring soundwave SVG emblem
      ClayControls.tsx           # Tactile carved-wood buttons, sliders, switches, and segmented controls
```
