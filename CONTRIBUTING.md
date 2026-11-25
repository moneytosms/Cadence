# Contributing to Cadence

Contributions, bug reports, and focused improvements are welcome.

## Core Principles

Before opening a pull request, keep Cadence's core design goals in mind:

1. **100% Client-Side & Private**: No accounts, no analytics, no telemetry, and no backend uploads. Scripts, camera video, and microphone audio must stay strictly in the browser.
2. **Zero Built-In AI**: Cadence intentionally avoids embedded AI APIs or model keys. Keep external LLM workflows strictly copy-paste via the Prompt Builder.
3. **60fps Stage Performance**: Avoid per-frame React state updates in the teleprompter scroll loop. Keep smooth scrolling GPU-composited (`translate3d`).
4. **Matched Dark Walnut & Sunlit Oak Themes**: Any UI change should look cohesive and readable in both `dark` and `light` modes.

## Local Setup

Requires Node.js `>= 20`.

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in your browser.

## Before Submitting a Pull Request

Run both checks and confirm they pass without warnings or errors:

```bash
npm run lint
npm run build
```

If you add or modify inline cues, settings, or keyboard shortcuts, update the relevant guide in `docs/` so documentation stays accurate.
