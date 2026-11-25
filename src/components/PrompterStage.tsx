import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  CameraOff,
  Check,
  FlipHorizontal2,
  Maximize2,
  Minimize2,
  Mic,
  MicOff,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import {
  ScriptDocument,
  StudioSettings,
  TakeSummary,
} from '../types/prompter';
import { resolveStageColors, STAGE_THEMES } from '../data/defaults';
import {
  compileScript,
  estimateScriptDurationSeconds,
  formatDuration,
} from '../utils/scriptParser';
import {
  MicVadController,
  playCountdownTick,
  playCueBeep,
  playCustomCueTone,
} from '../utils/audioEngine';
import { getPrompterFontCss, RichBlockView } from './RichTextRenderer';
import { formatKeyCode } from './SettingsView';

interface PrompterStageProps {
  script: ScriptDocument;
  baselineWpm: number;
  settings: StudioSettings;
  onUpdateSettings: (updater: (prev: StudioSettings) => StudioSettings) => void;
  onApplyMeasuredBaseline: (wpm: number) => void;
  onClose: () => void;
  onNotify: (msg: string) => void;
}

interface MeasuredBlock {
  blockIndex: number;
  top: number;
  height: number;
  spokenWords: number;
}

export const PrompterStage: React.FC<PrompterStageProps> = ({
  script,
  baselineWpm,
  settings,
  onUpdateSettings,
  onApplyMeasuredBaseline,
  onClose,
  onNotify,
}) => {
  const initialWpm = script.customWpmOverride ?? baselineWpm;
  const compiled = useMemo(
    () =>
      compileScript(
        script.content,
        settings.rules.beatDurationSeconds,
        settings.customCues ?? []
      ),
    [script.content, settings.rules.beatDurationSeconds, settings.customCues]
  );

  const estimatedTotalSec = useMemo(
    () => estimateScriptDurationSeconds(compiled, initialWpm),
    [compiled, initialWpm]
  );

  const [isPlaying, setIsPlaying] = useState(false);
  const [countdownVal, setCountdownVal] = useState<number | null>(null);
  const [waitingForVoice, setWaitingForVoice] = useState(false);
  const [displayWpm, setDisplayWpm] = useState<number>(initialWpm);
  const [activeCueBanner, setActiveCueBanner] = useState<string | null>(null);
  const [activeMarkerIdx, setActiveMarkerIdx] = useState<number>(0);
  const [markerPulse, setMarkerPulse] = useState(false);
  const [dockVisible, setDockVisible] = useState(true);
  const [quickDrawerOpen, setQuickDrawerOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [takeSummary, setTakeSummary] = useState<TakeSummary | null>(null);
  const [vadPausedState, setVadPausedState] = useState(false);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);

  const stageRootRef = useRef<HTMLDivElement | null>(null);
  const scrollTrackRef = useRef<HTMLDivElement | null>(null);
  const blockNodesRef = useRef<(HTMLDivElement | null)[]>([]);
  const progressBarRef = useRef<HTMLDivElement | null>(null);
  const elapsedLabelRef = useRef<HTMLSpanElement | null>(null);
  const remainingLabelRef = useRef<HTMLSpanElement | null>(null);
  const vadStageMeterRef = useRef<HTMLDivElement | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);

  const offsetYRef = useRef<number>(0);
  const maxScrollRef = useRef<number>(1000);
  const currentVelRef = useRef<number>(0);
  const targetWpmRef = useRef<number>(initialWpm);
  const effectiveWpmRef = useRef<number>(initialWpm);
  const rampStartWpmRef = useRef<number>(initialWpm);
  const rampEndWpmRef = useRef<number>(initialWpm);
  const rampElapsedRef = useRef<number>(0);
  const rampDurationRef = useRef<number>(0);
  const isPlayingRef = useRef<boolean>(false);
  const cuePauseRemainingRef = useRef<number>(0);
  const manualCueHoldRef = useRef<boolean>(false);
  const vadPausedRef = useRef<boolean>(false);
  const waitingForVoiceRef = useRef<boolean>(false);
  const triggeredCuesRef = useRef<Set<string>>(new Set());
  const measuredBlocksRef = useRef<MeasuredBlock[]>([]);
  const totalElapsedRunSecRef = useRef<number>(0);
  const pausesTriggeredCountRef = useRef<number>(0);
  const vadPausesCountRef = useRef<number>(0);
  const hasEndedRef = useRef<boolean>(false);
  const loopTimeoutRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const dockHideTimerRef = useRef<number | null>(null);
  const settingsRef = useRef<StudioSettings>(settings);
  settingsRef.current = settings;

  const vadControllerRef = useRef<MicVadController | null>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);

  const stageColors = resolveStageColors(settings.appearance);

  const measureBlocks = useCallback(() => {
    const track = scrollTrackRef.current;
    const root = stageRootRef.current;
    if (!track || !root) return;

    const measured: MeasuredBlock[] = [];
    compiled.blocks.forEach((b, idx) => {
      const el = blockNodesRef.current[idx];
      if (!el) return;
      measured.push({
        blockIndex: b.index,
        top: el.offsetTop,
        height: Math.max(24, el.offsetHeight),
        spokenWords: b.spokenWords,
      });
    });

    measuredBlocksRef.current = measured;
    const viewportH = root.clientHeight || window.innerHeight;
    const focusY = (settingsRef.current.focusAndCamera.focusBandTopPct / 100) * viewportH;
    const lastBlock = measured[measured.length - 1];
    const endOfTextY = lastBlock ? lastBlock.top + lastBlock.height : track.scrollHeight;
    maxScrollRef.current = Math.max(120, endOfTextY - focusY + 40);
  }, [compiled.blocks]);

  useEffect(() => {
    const id = requestAnimationFrame(measureBlocks);
    window.addEventListener('resize', measureBlocks);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('resize', measureBlocks);
    };
  }, [
    measureBlocks,
    settings.appearance.fontSizePx,
    settings.appearance.columnWidthPct,
    settings.appearance.lineHeight,
    settings.appearance.fontFamily,
    settings.appearance.letterSpacingEm,
    settings.appearance.showInlineCues,
    settings.focusAndCamera.focusBandTopPct,
  ]);

  const applyScrollDom = useCallback((y: number) => {
    const track = scrollTrackRef.current;
    if (track) {
      const mirrorX = settingsRef.current.appearance.mirrorX ? -1 : 1;
      const mirrorY = settingsRef.current.appearance.mirrorY ? -1 : 1;
      track.style.transform = `translate3d(0, ${-y}px, 0) scaleX(${mirrorX}) scaleY(${mirrorY})`;
    }
    const pct = Math.max(0, Math.min(1, y / Math.max(1, maxScrollRef.current)));
    if (progressBarRef.current) {
      progressBarRef.current.style.transform = `scaleX(${pct})`;
    }
  }, []);

  useEffect(() => {
    applyScrollDom(offsetYRef.current);
  }, [settings.appearance.mirrorX, settings.appearance.mirrorY, applyScrollDom]);

  const pokeDock = useCallback(() => {
    setDockVisible(true);
    if (dockHideTimerRef.current) window.clearTimeout(dockHideTimerRef.current);
    if (!settingsRef.current.rules.alwaysShowDock && isPlayingRef.current) {
      dockHideTimerRef.current = window.setTimeout(() => {
        setDockVisible(false);
      }, settingsRef.current.rules.autoHideDockMs);
    }
  }, []);

  useEffect(() => {
    if (settings.rules.alwaysShowDock || !isPlaying || quickDrawerOpen) {
      setDockVisible(true);
      if (dockHideTimerRef.current) window.clearTimeout(dockHideTimerRef.current);
    } else {
      pokeDock();
    }
  }, [isPlaying, quickDrawerOpen, settings.rules.alwaysShowDock, pokeDock]);

  useEffect(() => {
    return () => {
      if (countdownTimerRef.current) window.clearInterval(countdownTimerRef.current);
      if (loopTimeoutRef.current) window.clearTimeout(loopTimeoutRef.current);
      if (dockHideTimerRef.current) window.clearTimeout(dockHideTimerRef.current);
    };
  }, []);

  // Local Webcam Stream
  useEffect(() => {
    const mode = settings.focusAndCamera.webcamMode;
    if (mode === 'off') {
      if (webcamStreamRef.current) {
        webcamStreamRef.current.getTracks().forEach((t) => t.stop());
        webcamStreamRef.current = null;
      }
      setWebcamError(null);
      return;
    }

    let cancelled = false;
    setWebcamError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setWebcamError('Camera unavailable');
      return;
    }

    navigator.mediaDevices
      .getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 360 } }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        webcamStreamRef.current = stream;
        if (videoElRef.current) {
          videoElRef.current.srcObject = stream;
          videoElRef.current.play().catch(() => {});
        }
      })
      .catch(() => {
        if (!cancelled) setWebcamError('Camera unavailable');
      });

    return () => {
      cancelled = true;
      if (webcamStreamRef.current) {
        webcamStreamRef.current.getTracks().forEach((t) => t.stop());
        webcamStreamRef.current = null;
      }
    };
  }, [settings.focusAndCamera.webcamMode]);

  // Live Microphone VAD
  const needsMic = settings.vad.enabled || settings.rules.waitForVoiceToStart;

  useEffect(() => {
    if (!needsMic) {
      vadControllerRef.current?.stop();
      vadControllerRef.current = null;
      vadPausedRef.current = false;
      setVadPausedState(false);
      setMicError(null);
      return;
    }

    let cancelled = false;
    setMicError(null);
    const ctrl = new MicVadController(
      {
        thresholdDb: settings.vad.thresholdDb,
        silenceTimeoutMs: settings.vad.silenceTimeoutMs,
        speechResumeHoldMs: settings.vad.speechResumeHoldMs,
      },
      {
        onLevel: (_db, norm, isAbove) => {
          if (vadStageMeterRef.current) {
            vadStageMeterRef.current.style.transform = `scaleX(${Math.max(0.05, norm)})`;
            vadStageMeterRef.current.style.backgroundColor = isAbove ? '#63AD82' : '#746556';
          }
        },
        onSpeechStateChange: (speaking) => {
          if (speaking && waitingForVoiceRef.current) {
            waitingForVoiceRef.current = false;
            setWaitingForVoice(false);
            isPlayingRef.current = true;
            setIsPlaying(true);
            setActiveCueBanner(null);
            return;
          }

          if (!settingsRef.current.vad.enabled) return;

          if (!speaking && isPlayingRef.current && !vadPausedRef.current) {
            vadPausedRef.current = true;
            vadPausesCountRef.current += 1;
            setVadPausedState(true);
            setActiveCueBanner('Waiting for voice…');
          } else if (speaking && vadPausedRef.current) {
            vadPausedRef.current = false;
            setVadPausedState(false);
            setActiveCueBanner(null);
          }
        },
      }
    );

    ctrl
      .start()
      .then(() => {
        if (cancelled) {
          ctrl.stop();
        } else {
          vadControllerRef.current = ctrl;
        }
      })
      .catch(() => {
        if (!cancelled) setMicError('Mic unavailable');
      });

    return () => {
      cancelled = true;
      ctrl.stop();
      vadControllerRef.current = null;
    };
  }, [needsMic]);

  useEffect(() => {
    vadControllerRef.current?.updateConfig({
      thresholdDb: settings.vad.thresholdDb,
      silenceTimeoutMs: settings.vad.silenceTimeoutMs,
      speechResumeHoldMs: settings.vad.speechResumeHoldMs,
    });
  }, [settings.vad]);

  const setLiveWpm = useCallback((nextWpm: number) => {
    const clamped = Math.max(55, Math.min(300, Math.round(nextWpm)));
    targetWpmRef.current = clamped;
    effectiveWpmRef.current = clamped;
    rampDurationRef.current = 0;
    setDisplayWpm(clamped);
  }, []);

  const resetStage = useCallback(
    (autoStart = false) => {
      if (countdownTimerRef.current) {
        window.clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
      if (loopTimeoutRef.current) {
        window.clearTimeout(loopTimeoutRef.current);
        loopTimeoutRef.current = null;
      }
      offsetYRef.current = 0;
      currentVelRef.current = 0;
      cuePauseRemainingRef.current = 0;
      manualCueHoldRef.current = false;
      vadPausedRef.current = false;
      waitingForVoiceRef.current = false;
      hasEndedRef.current = false;
      totalElapsedRunSecRef.current = 0;
      pausesTriggeredCountRef.current = 0;
      vadPausesCountRef.current = 0;
      triggeredCuesRef.current.clear();

      setLiveWpm(initialWpm);
      setCountdownVal(null);
      setWaitingForVoice(false);
      setVadPausedState(false);
      setActiveCueBanner(null);
      setActiveMarkerIdx(0);
      setTakeSummary(null);
      applyScrollDom(0);

      if (elapsedLabelRef.current) elapsedLabelRef.current.textContent = '0:00';
      if (remainingLabelRef.current)
        remainingLabelRef.current.textContent = formatDuration(estimatedTotalSec);

      if (autoStart) {
        isPlayingRef.current = true;
        setIsPlaying(true);
      } else {
        isPlayingRef.current = false;
        setIsPlaying(false);
      }
    },
    [applyScrollDom, estimatedTotalSec, initialWpm, setLiveWpm]
  );

  const openTakeSummaryNow = useCallback(() => {
    isPlayingRef.current = false;
    setIsPlaying(false);
    const actualSec = Math.max(1, Math.round(totalElapsedRunSecRef.current));
    const pct = Math.min(1, offsetYRef.current / Math.max(1, maxScrollRef.current));
    const spokenSoFar = Math.round(compiled.totalSpokenWords * pct);
    const effectiveWpm =
      actualSec > 3 && spokenSoFar > 5
        ? Math.max(55, Math.min(280, Math.round((spokenSoFar / actualSec) * 60)))
        : Math.round(effectiveWpmRef.current);

    setTakeSummary({
      scriptTitle: script.title,
      spokenWords: compiled.totalSpokenWords,
      estimatedSeconds: estimatedTotalSec,
      actualSeconds: actualSec,
      targetWpm: initialWpm,
      effectiveWpm,
      pausesTriggered: pausesTriggeredCountRef.current,
      vadPauses: vadPausesCountRef.current,
      completedPct: Math.round(pct * 100),
    });
  }, [compiled.totalSpokenWords, estimatedTotalSec, initialWpm, script.title]);

  const startPlaybackWithRules = useCallback(() => {
    setTakeSummary(null);

    if (manualCueHoldRef.current || cuePauseRemainingRef.current > 0) {
      manualCueHoldRef.current = false;
      cuePauseRemainingRef.current = 0;
      setActiveCueBanner(null);
      isPlayingRef.current = true;
      setIsPlaying(true);
      return;
    }

    if (hasEndedRef.current) {
      resetStage(false);
    }

    const atBeginning = offsetYRef.current < 12;
    const preRoll = settingsRef.current.rules.countdownSeconds;

    const beginAfterCountdown = () => {
      if (settingsRef.current.rules.waitForVoiceToStart && vadControllerRef.current) {
        waitingForVoiceRef.current = true;
        setWaitingForVoice(true);
        setActiveCueBanner('Speak to begin…');
      } else {
        isPlayingRef.current = true;
        setIsPlaying(true);
      }
    };

    if (atBeginning && preRoll > 0) {
      let remaining = preRoll;
      setCountdownVal(remaining);
      if (settingsRef.current.rules.countdownAudioTicks) {
        playCountdownTick(false, settingsRef.current.rules.beepCueVolume);
      }

      if (countdownTimerRef.current) window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = window.setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          if (countdownTimerRef.current) {
            window.clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
          }
          setCountdownVal(null);
          if (settingsRef.current.rules.countdownAudioTicks) {
            playCountdownTick(true, settingsRef.current.rules.beepCueVolume);
          }
          beginAfterCountdown();
        } else {
          setCountdownVal(remaining);
          if (settingsRef.current.rules.countdownAudioTicks) {
            playCountdownTick(false, settingsRef.current.rules.beepCueVolume);
          }
        }
      }, 1000);
    } else {
      beginAfterCountdown();
    }
  }, [resetStage]);

  const togglePlayPause = useCallback(() => {
    if (countdownVal !== null) {
      if (countdownTimerRef.current) {
        window.clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
      setCountdownVal(null);
      return;
    }
    if (waitingForVoiceRef.current) {
      waitingForVoiceRef.current = false;
      setWaitingForVoice(false);
      setActiveCueBanner(null);
      return;
    }
    if (isPlayingRef.current && !manualCueHoldRef.current && cuePauseRemainingRef.current <= 0) {
      isPlayingRef.current = false;
      setIsPlaying(false);
    } else {
      startPlaybackWithRules();
    }
  }, [countdownVal, startPlaybackWithRules]);

  const jumpToMarker = useCallback(
    (markerIdx: number) => {
      const m = compiled.markers[markerIdx];
      if (!m) return;
      const measured = measuredBlocksRef.current.find((b) => b.blockIndex === m.blockIndex);
      if (!measured) return;

      const root = stageRootRef.current;
      const viewportH = root?.clientHeight || window.innerHeight;
      const focusY = (settingsRef.current.focusAndCamera.focusBandTopPct / 100) * viewportH;
      const targetOffset = Math.max(0, Math.min(maxScrollRef.current, measured.top - focusY + 12));

      compiled.blocks.forEach((b) => {
        if (b.index >= m.blockIndex) {
          b.cues.forEach((c) => triggeredCuesRef.current.delete(c.id));
        }
      });

      offsetYRef.current = targetOffset;
      cuePauseRemainingRef.current = 0;
      manualCueHoldRef.current = false;
      hasEndedRef.current = false;
      setActiveMarkerIdx(markerIdx);
      setActiveCueBanner(null);
      applyScrollDom(targetOffset);
    },
    [applyScrollDom, compiled.blocks, compiled.markers]
  );

  // 60fps+ GPU Scroll Loop
  useEffect(() => {
    let rafId: number;
    let lastNow = performance.now();
    let hudThrottleMs = 0;

    const frame = (now: number) => {
      const dtSec = Math.min(0.05, Math.max(0.001, (now - lastNow) / 1000));
      lastNow = now;

      const cfg = settingsRef.current;
      const root = stageRootRef.current;
      const viewportH = root?.clientHeight || window.innerHeight;
      const focusLineY = (cfg.focusAndCamera.focusBandTopPct / 100) * viewportH + 24;

      if (rampDurationRef.current > 0) {
        rampElapsedRef.current += dtSec;
        const t = Math.min(1, rampElapsedRef.current / rampDurationRef.current);
        const eased = 1 - Math.pow(1 - t, 3);
        effectiveWpmRef.current =
          rampStartWpmRef.current + (rampEndWpmRef.current - rampStartWpmRef.current) * eased;
        if (t >= 1) {
          rampDurationRef.current = 0;
          effectiveWpmRef.current = rampEndWpmRef.current;
        }
      }

      let activelyScrolling =
        isPlayingRef.current && !manualCueHoldRef.current && !vadPausedRef.current;

      if (activelyScrolling && cuePauseRemainingRef.current > 0) {
        cuePauseRemainingRef.current = Math.max(0, cuePauseRemainingRef.current - dtSec);
        totalElapsedRunSecRef.current += dtSec;
        activelyScrolling = false;
        if (cuePauseRemainingRef.current <= 0) {
          setActiveCueBanner(null);
        } else if (hudThrottleMs > 90) {
          setActiveCueBanner(`Pause · ${cuePauseRemainingRef.current.toFixed(1)}s`);
        }
      }

      let desiredPxPerSec = 0;
      if (activelyScrolling && !hasEndedRef.current) {
        totalElapsedRunSecRef.current += dtSec;

        if (cfg.physics.mode === 'constantPixels') {
          desiredPxPerSec =
            (effectiveWpmRef.current / 140) * cfg.physics.constantPxPerSecAt140Wpm;
        } else {
          const scriptFocusY = offsetYRef.current + focusLineY;
          const blocks = measuredBlocksRef.current;
          let activeBlock = blocks.find(
            (b) => scriptFocusY >= b.top && scriptFocusY <= b.top + b.height + 28
          );
          if (!activeBlock && blocks.length > 0) activeBlock = blocks[0];

          if (activeBlock && activeBlock.spokenWords > 0) {
            const pxPerWord = activeBlock.height / activeBlock.spokenWords;
            const clampedPxPerWord = Math.max(4, Math.min(48, pxPerWord));
            desiredPxPerSec = (effectiveWpmRef.current / 60) * clampedPxPerWord;
          } else {
            desiredPxPerSec = (effectiveWpmRef.current / 60) * 14;
          }
        }
      }

      const inertiaSec = cfg.physics.inertiaMs / 1000;
      if (inertiaSec <= 0.01) {
        currentVelRef.current = desiredPxPerSec;
      } else {
        const lerpAlpha = 1 - Math.exp(-dtSec / (inertiaSec * 0.45));
        currentVelRef.current += (desiredPxPerSec - currentVelRef.current) * lerpAlpha;
        if (!activelyScrolling && currentVelRef.current < 0.35) {
          currentVelRef.current = 0;
        }
      }

      if (currentVelRef.current > 0.01) {
        offsetYRef.current = Math.min(
          maxScrollRef.current,
          offsetYRef.current + currentVelRef.current * dtSec
        );
        applyScrollDom(offsetYRef.current);
      }

      if (isPlayingRef.current && !hasEndedRef.current) {
        const scriptFocusY = offsetYRef.current + focusLineY;
        const blocks = measuredBlocksRef.current;

        for (let i = 0; i < blocks.length; i++) {
          const mb = blocks[i];
          if (mb.top <= scriptFocusY && mb.top + mb.height >= scriptFocusY - 40) {
            const compiledBlock = compiled.blocks[mb.blockIndex];
            if (!compiledBlock) continue;

            for (const cue of compiledBlock.cues) {
              if (triggeredCuesRef.current.has(cue.id)) continue;
              triggeredCuesRef.current.add(cue.id);

              if (cue.type === 'pause' || cue.type === 'beat') {
                pausesTriggeredCountRef.current += 1;
                if (cfg.rules.pauseCueMode === 'manualTap') {
                  manualCueHoldRef.current = true;
                  setActiveCueBanner(`${cue.label} · Space to resume`);
                } else {
                  cuePauseRemainingRef.current = cue.value ?? 1.5;
                  setActiveCueBanner(`Pause · ${cuePauseRemainingRef.current.toFixed(1)}s`);
                }
              } else if (cue.type === 'speedAbsolute' && cue.value) {
                rampStartWpmRef.current = effectiveWpmRef.current;
                rampEndWpmRef.current = cue.value;
                rampElapsedRef.current = 0;
                rampDurationRef.current = cfg.physics.speedRampSeconds;
                targetWpmRef.current = cue.value;
                setDisplayWpm(cue.value);
                setActiveCueBanner(`${cue.value} WPM`);
                window.setTimeout(() => setActiveCueBanner(null), 1600);
              } else if (cue.type === 'speedRelative' && cue.value !== undefined) {
                const next = Math.max(
                  55,
                  Math.min(300, Math.round(initialWpm * (1 + cue.value / 100)))
                );
                rampStartWpmRef.current = effectiveWpmRef.current;
                rampEndWpmRef.current = next;
                rampElapsedRef.current = 0;
                rampDurationRef.current = cfg.physics.speedRampSeconds;
                targetWpmRef.current = next;
                setDisplayWpm(next);
                setActiveCueBanner(`${next} WPM`);
                window.setTimeout(() => setActiveCueBanner(null), 1600);
              } else if (cue.type === 'speedReset') {
                rampStartWpmRef.current = effectiveWpmRef.current;
                rampEndWpmRef.current = initialWpm;
                rampElapsedRef.current = 0;
                rampDurationRef.current = cfg.physics.speedRampSeconds;
                targetWpmRef.current = initialWpm;
                setDisplayWpm(initialWpm);
                setActiveCueBanner(`${initialWpm} WPM`);
                window.setTimeout(() => setActiveCueBanner(null), 1400);
              } else if (cue.type === 'beep') {
                playCueBeep(cfg.rules.beepCueVolume);
              } else if (cue.type === 'marker') {
                const mIdx = compiled.markers.findIndex((m) => m.id === cue.id);
                if (mIdx >= 0) setActiveMarkerIdx(mIdx);
                if (cfg.rules.markerBehavior === 'pulse') {
                  setMarkerPulse(true);
                  window.setTimeout(() => setMarkerPulse(false), 600);
                } else if (cfg.rules.markerBehavior === 'autoPause') {
                  manualCueHoldRef.current = true;
                  setActiveCueBanner(`${cue.label} · Space to continue`);
                }
              } else if (cue.type === 'custom') {
                if (cue.tone && cue.tone !== 'none') {
                  playCustomCueTone(cue.tone, cfg.rules.beepCueVolume);
                }

                if (cue.speedMode === 'relative' && cue.speedDeltaPct) {
                  const next = Math.max(
                    55,
                    Math.min(300, Math.round(initialWpm * (1 + cue.speedDeltaPct / 100)))
                  );
                  rampStartWpmRef.current = effectiveWpmRef.current;
                  rampEndWpmRef.current = next;
                  rampElapsedRef.current = 0;
                  rampDurationRef.current = cfg.physics.speedRampSeconds;
                  targetWpmRef.current = next;
                  setDisplayWpm(next);
                } else if (cue.speedMode === 'reset') {
                  rampStartWpmRef.current = effectiveWpmRef.current;
                  rampEndWpmRef.current = initialWpm;
                  rampElapsedRef.current = 0;
                  rampDurationRef.current = cfg.physics.speedRampSeconds;
                  targetWpmRef.current = initialWpm;
                  setDisplayWpm(initialWpm);
                }

                if (cue.value && cue.value > 0) {
                  pausesTriggeredCountRef.current += 1;
                  if (cfg.rules.pauseCueMode === 'manualTap') {
                    manualCueHoldRef.current = true;
                    setActiveCueBanner(`${cue.label} · Space to resume`);
                  } else {
                    cuePauseRemainingRef.current = cue.value;
                    setActiveCueBanner(`${cue.label} · ${cue.value.toFixed(1)}s`);
                  }
                } else {
                  setActiveCueBanner(cue.label);
                  window.setTimeout(() => setActiveCueBanner(null), 1500);
                }
              }
            }
          }
        }

        if (offsetYRef.current >= maxScrollRef.current - 2 && !hasEndedRef.current) {
          hasEndedRef.current = true;
          const action = cfg.rules.endOfScriptAction;
          if (action === 'summary') {
            openTakeSummaryNow();
          } else if (action === 'loop') {
            isPlayingRef.current = false;
            setIsPlaying(false);
            setActiveCueBanner(`Restarting in ${cfg.rules.loopDelaySeconds}s`);
            loopTimeoutRef.current = window.setTimeout(() => {
              resetStage(true);
            }, cfg.rules.loopDelaySeconds * 1000);
          } else {
            isPlayingRef.current = false;
            setIsPlaying(false);
            setActiveCueBanner('End');
          }
        }
      }

      hudThrottleMs += dtSec * 1000;
      if (hudThrottleMs >= 160) {
        hudThrottleMs = 0;
        if (elapsedLabelRef.current) {
          elapsedLabelRef.current.textContent = formatDuration(totalElapsedRunSecRef.current);
        }
        if (remainingLabelRef.current) {
          const pctRemaining = Math.max(
            0,
            1 - offsetYRef.current / Math.max(1, maxScrollRef.current)
          );
          remainingLabelRef.current.textContent = formatDuration(estimatedTotalSec * pctRemaining);
        }
      }

      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [
    applyScrollDom,
    compiled.blocks,
    compiled.markers,
    estimatedTotalSec,
    initialWpm,
    openTakeSummaryNow,
    resetStage,
  ]);

  const toggleFullscreen = useCallback(() => {
    const el = stageRootRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Escape') {
        if (quickDrawerOpen) setQuickDrawerOpen(false);
        else if (takeSummary) setTakeSummary(null);
        else onClose();
        return;
      }

      const kb = settingsRef.current.keybindings;
      const step = settingsRef.current.physics.nudgeStepWpm;

      if (e.code === kb.playPause) {
        e.preventDefault();
        togglePlayPause();
      } else if (e.code === kb.speedUp) {
        e.preventDefault();
        setLiveWpm(targetWpmRef.current + step);
        pokeDock();
      } else if (e.code === kb.speedDown) {
        e.preventDefault();
        setLiveWpm(targetWpmRef.current - step);
        pokeDock();
      } else if (e.code === kb.nextMarker) {
        e.preventDefault();
        if (compiled.markers.length > 0) {
          jumpToMarker(Math.min(compiled.markers.length - 1, activeMarkerIdx + 1));
        }
      } else if (e.code === kb.prevMarker) {
        e.preventDefault();
        if (compiled.markers.length > 0) {
          jumpToMarker(Math.max(0, activeMarkerIdx - 1));
        }
      } else if (e.code === kb.reset) {
        e.preventDefault();
        resetStage(false);
      } else if (e.code === kb.mirrorX) {
        e.preventDefault();
        onUpdateSettings((prev) => ({
          ...prev,
          appearance: { ...prev.appearance, mirrorX: !prev.appearance.mirrorX },
        }));
      } else if (e.code === kb.toggleWebcam) {
        e.preventDefault();
        onUpdateSettings((prev) => ({
          ...prev,
          focusAndCamera: {
            ...prev.focusAndCamera,
            webcamMode: prev.focusAndCamera.webcamMode === 'off' ? 'pipTop' : 'off',
          },
        }));
      } else if (e.code === kb.fullscreen) {
        e.preventDefault();
        toggleFullscreen();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activeMarkerIdx,
    compiled.markers.length,
    jumpToMarker,
    onClose,
    onUpdateSettings,
    pokeDock,
    quickDrawerOpen,
    resetStage,
    setLiveWpm,
    takeSummary,
    toggleFullscreen,
    togglePlayPause,
  ]);

  const handleWheel = (e: React.WheelEvent) => {
    if (quickDrawerOpen || takeSummary) return;
    const lineStepPx =
      settings.appearance.fontSizePx *
      settings.appearance.lineHeight *
      (settings.physics.wheelScrubLines * 0.45);
    const delta = e.deltaY > 0 ? lineStepPx : -lineStepPx;
    const nextY = Math.max(0, Math.min(maxScrollRef.current, offsetYRef.current + delta));

    if (delta < 0) {
      const focusY =
        (settings.focusAndCamera.focusBandTopPct / 100) *
        (stageRootRef.current?.clientHeight || window.innerHeight);
      const scriptFocusY = nextY + focusY;
      measuredBlocksRef.current.forEach((mb) => {
        if (mb.top >= scriptFocusY) {
          compiled.blocks[mb.blockIndex]?.cues.forEach((c) =>
            triggeredCuesRef.current.delete(c.id)
          );
        }
      });
      hasEndedRef.current = false;
    }

    offsetYRef.current = nextY;
    applyScrollDom(nextY);
    pokeDock();
  };

  const focusTopPct = settings.focusAndCamera.focusBandTopPct;
  const focusH = settings.focusAndCamera.focusBandHeightPx;
  const dimAlpha = settings.focusAndCamera.peripheralDimOpacity;

  return (
    <div
      ref={stageRootRef}
      onMouseMove={pokeDock}
      onTouchStart={pokeDock}
      onWheel={handleWheel}
      className={`fixed inset-0 z-50 overflow-hidden select-none transition-shadow duration-300 ${
        markerPulse ? 'ring-4 ring-inset ring-[#63AD82]' : ''
      }`}
      style={{ backgroundColor: stageColors.bg }}
    >
      {/* Top Progress Hairline */}
      <div className="absolute top-0 inset-x-0 h-[3px] bg-white/10 z-40">
        <div
          ref={progressBarRef}
          className="h-full w-full origin-left"
          style={{ transform: 'scaleX(0)', backgroundColor: stageColors.accent }}
        />
      </div>

      {/* Webcam Backdrop */}
      {settings.focusAndCamera.webcamMode === 'backdrop' && (
        <div
          className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
          style={{ opacity: settings.focusAndCamera.webcamOpacity * 0.45 }}
        >
          <video
            ref={videoElRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
            style={{
              transform: settings.focusAndCamera.webcamMirror ? 'scaleX(-1)' : undefined,
            }}
          />
          {settings.focusAndCamera.showRuleOfThirds && <RuleOfThirdsOverlay />}
        </div>
      )}

      {/* Webcam Top Lens Box */}
      {settings.focusAndCamera.webcamMode === 'pipTop' && (
        <div
          className="absolute top-4 left-1/2 -translate-x-1/2 z-30 rounded-[18px] overflow-hidden border border-[#F3EAD8]/20 shadow-2xl bg-black/80"
          style={{
            width: `${settings.focusAndCamera.webcamPipWidthPx}px`,
            opacity: settings.focusAndCamera.webcamOpacity,
          }}
        >
          <div className="relative aspect-video w-full">
            <video
              ref={videoElRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{
                transform: settings.focusAndCamera.webcamMirror ? 'scaleX(-1)' : undefined,
              }}
            />
            {settings.focusAndCamera.showEyeLineCrosshair && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="w-full h-[1px] bg-[#63AD82]/55" />
                <div className="absolute w-3 h-3 rounded-full border-2 border-[#63AD82]" />
              </div>
            )}
            {settings.focusAndCamera.showRuleOfThirds && <RuleOfThirdsOverlay />}
            {webcamError && (
              <div className="absolute inset-0 flex items-center justify-center p-3 text-center text-[12px] text-[#F3EAD8] bg-black/80">
                {webcamError}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Subtle Top Lens Marker */}
      {settings.focusAndCamera.showEyeLineCrosshair &&
        settings.focusAndCamera.webcamMode !== 'pipTop' && (
          <div
            className="pointer-events-none fixed top-2.5 left-1/2 -translate-x-1/2 z-30 text-[11px] font-mono-tabular tracking-widest uppercase opacity-50"
            style={{ color: stageColors.accent }}
          >
            ▲ Lens ▲
          </div>
        )}

      {/* Minimal Top HUD */}
      <div
        className={`fixed top-4 sm:top-5 inset-x-3 sm:inset-x-6 z-30 flex items-center justify-between gap-2.5 sm:gap-4 transition-opacity duration-200 ${
          dockVisible ? 'opacity-100' : 'opacity-20 hover:opacity-100'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[42px] px-4 rounded-[14px] bg-[#211B16]/85 hover:bg-[#2E251E] text-[#F3EAD8] backdrop-blur-md border border-[#F3EAD8]/12 inline-flex items-center gap-2 text-[14px] font-semibold cursor-pointer"
          >
            <X className="w-4 h-4" />
            Exit
          </button>

          {compiled.markers.length > 0 && (
            <div className="hidden md:flex items-center gap-1.5 overflow-x-auto max-w-[44vw]">
              {compiled.markers.map((m, idx) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => jumpToMarker(idx)}
                  className={`min-h-[36px] px-3 rounded-[11px] text-[13px] font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                    idx === activeMarkerIdx
                      ? 'bg-[#3E7C59] text-[#FAF5EC]'
                      : 'bg-[#211B16]/80 text-[#C7B7A2] hover:text-[#F3EAD8]'
                  }`}
                >
                  {m.title}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          {needsMic && settings.vad.showLiveMeterInStage && (
            <div className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-[14px] bg-[#1C1612]/85 border border-[#F3EAD8]/12 backdrop-blur-md">
              <Mic
                className={`w-4 h-4 ${vadPausedState ? 'text-[#D99B52]' : 'text-[#63AD82]'}`}
              />
              <div className="w-14 h-2 rounded-full bg-white/15 overflow-hidden">
                <div
                  ref={vadStageMeterRef}
                  className="h-full w-full origin-left rounded-full"
                  style={{ transform: 'scaleX(0.08)', backgroundColor: '#746556' }}
                />
              </div>
            </div>
          )}

          <div className="px-3.5 py-2 rounded-[14px] bg-[#1C1612]/85 border border-[#F3EAD8]/12 backdrop-blur-md font-mono-tabular text-[13.5px] text-[#F3EAD8] flex items-center gap-2">
            <span ref={elapsedLabelRef}>0:00</span>
            <span className="text-[#857562]">/</span>
            <span ref={remainingLabelRef} className="text-[#B3A38E]">
              {formatDuration(estimatedTotalSec)}
            </span>
          </div>
        </div>
      </div>

      {/* Active Cue Banner */}
      {(activeCueBanner || micError) && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-[14px] bg-[#211B16]/95 border border-[#63AD82]/40 text-[#F3EAD8] font-mono-tabular text-[14px] font-semibold shadow-xl">
          {activeCueBanner ?? micError}
        </div>
      )}

      {/* Pre-Roll Countdown */}
      {countdownVal !== null && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/55 backdrop-blur-xs">
          <div
            className="font-mono-tabular text-[124px] font-bold leading-none"
            style={{ color: stageColors.accent }}
          >
            {countdownVal}
          </div>
        </div>
      )}

      {/* Peripheral Scrims */}
      {dimAlpha > 0 && (
        <>
          <div
            className="pointer-events-none fixed inset-x-0 top-0 z-20"
            style={{
              height: `${focusTopPct}%`,
              background: stageColors.bg,
              opacity: dimAlpha,
            }}
          />
          <div
            className="pointer-events-none fixed inset-x-0 bottom-0 z-20"
            style={{
              top: `calc(${focusTopPct}% + ${focusH}px)`,
              background: stageColors.bg,
              opacity: dimAlpha,
            }}
          />
        </>
      )}

      {/* Focus Reading Zone */}
      {settings.focusAndCamera.guideStyle !== 'minimal' && (
        <div
          className="pointer-events-none fixed inset-x-0 z-20 flex items-center justify-between px-4 sm:px-8"
          style={{
            top: `${focusTopPct}%`,
            height: `${focusH}px`,
            backgroundColor:
              settings.focusAndCamera.guideStyle === 'band'
                ? `${stageColors.accent}14`
                : 'transparent',
            borderTop:
              settings.focusAndCamera.guideStyle === 'line' ||
              settings.focusAndCamera.guideStyle === 'band'
                ? `1.5px solid ${stageColors.accent}66`
                : undefined,
            borderBottom:
              settings.focusAndCamera.guideStyle === 'band'
                ? `1.5px solid ${stageColors.accent}66`
                : undefined,
          }}
        >
          {settings.focusAndCamera.guideStyle === 'chevrons' && (
            <>
              <span
                className="text-[32px] font-bold leading-none"
                style={{ color: stageColors.accent }}
              >
                ▸
              </span>
              <span
                className="text-[32px] font-bold leading-none"
                style={{ color: stageColors.accent }}
              >
                ◂
              </span>
            </>
          )}
        </div>
      )}

      {/* GPU-Composited Scrolling Script */}
      <div className="relative z-10 h-full w-full flex justify-center overflow-hidden">
        <div
          ref={scrollTrackRef}
          className="will-change-transform"
          style={{
            width: `${settings.appearance.columnWidthPct}%`,
            paddingLeft: `${settings.appearance.horizontalPaddingPx}px`,
            paddingRight: `${settings.appearance.horizontalPaddingPx}px`,
            paddingTop: `${focusTopPct}vh`,
            paddingBottom: '75vh',
            fontFamily: getPrompterFontCss(settings.appearance.fontFamily),
            fontSize: `${settings.appearance.fontSizePx}px`,
            fontWeight: settings.appearance.fontWeight,
            lineHeight: settings.appearance.lineHeight,
            letterSpacing: `${settings.appearance.letterSpacingEm}em`,
            wordSpacing: `${settings.appearance.wordSpacingEm}em`,
          }}
        >
          {compiled.blocks.map((block, idx) => (
            <div
              key={block.index}
              ref={(el) => {
                blockNodesRef.current[idx] = el;
              }}
            >
              <RichBlockView
                block={block}
                appearance={settings.appearance}
                isActiveMarker={
                  block.kind === 'marker' &&
                  compiled.markers[activeMarkerIdx]?.blockIndex === block.index
                }
              />
            </div>
          ))}
        </div>
      </div>

      {/* Calm Auto-Hiding Walnut Bottom Dock */}
      <div
        className={`fixed bottom-4 sm:bottom-5 left-1/2 -translate-x-1/2 z-40 w-[min(95vw,760px)] transition-all duration-200 ${
          dockVisible
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 translate-y-5 pointer-events-none'
        }`}
      >
        <div className="rounded-[22px] px-3 sm:px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 sm:gap-2.5 bg-[#1D1713]/92 border border-[#F3EAD8]/14 text-[#F3EAD8] backdrop-blur-xl shadow-2xl">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={togglePlayPause}
              className="wood-btn-pine min-h-[46px] px-5 rounded-[15px] font-semibold text-[15px] inline-flex items-center gap-2 cursor-pointer"
            >
              {isPlaying && !waitingForVoice ? (
                <>
                  <Pause className="w-4 h-4 fill-current" /> Pause
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  {waitingForVoice ? 'Listening…' : 'Start'}
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => resetStage(false)}
              title={`Reset (${formatKeyCode(settings.keybindings.reset)})`}
              className="min-h-[46px] w-[46px] rounded-[14px] bg-[#2B231C] hover:bg-[#382D24] text-[#F3EAD8] inline-flex items-center justify-center cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-1.5 bg-[#15110E] px-2 py-1 rounded-[15px] border border-[#F3EAD8]/10">
            <button
              type="button"
              aria-label="Slower"
              onClick={() => setLiveWpm(targetWpmRef.current - settings.physics.nudgeStepWpm)}
              className="h-[38px] w-[38px] rounded-[11px] bg-[#2A221B] hover:bg-[#382D24] flex items-center justify-center cursor-pointer"
            >
              <Minus className="w-4 h-4" />
            </button>
            <div className="px-2.5 text-center min-w-[78px] font-mono-tabular">
              <span className="text-[17px] font-bold">{displayWpm}</span>
              <span className="text-[11px] text-[#A99985] ml-1">WPM</span>
            </div>
            <button
              type="button"
              aria-label="Faster"
              onClick={() => setLiveWpm(targetWpmRef.current + settings.physics.nudgeStepWpm)}
              className="h-[38px] w-[38px] rounded-[11px] bg-[#2A221B] hover:bg-[#382D24] flex items-center justify-center cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                onUpdateSettings((prev) => ({
                  ...prev,
                  appearance: { ...prev.appearance, mirrorX: !prev.appearance.mirrorX },
                }))
              }
              title="Mirror horizontally"
              className={`min-h-[44px] w-[44px] rounded-[13px] inline-flex items-center justify-center cursor-pointer ${
                settings.appearance.mirrorX
                  ? 'bg-[#3E7C59] text-[#FAF5EC]'
                  : 'bg-[#2B231C] hover:bg-[#382D24] text-[#D4C3AE]'
              }`}
            >
              <FlipHorizontal2 className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() =>
                onUpdateSettings((prev) => ({
                  ...prev,
                  focusAndCamera: {
                    ...prev.focusAndCamera,
                    webcamMode:
                      prev.focusAndCamera.webcamMode === 'off'
                        ? 'pipTop'
                        : prev.focusAndCamera.webcamMode === 'pipTop'
                          ? 'backdrop'
                          : 'off',
                  },
                }))
              }
              title="Webcam overlay"
              className={`min-h-[44px] w-[44px] rounded-[13px] inline-flex items-center justify-center cursor-pointer ${
                settings.focusAndCamera.webcamMode !== 'off'
                  ? 'bg-[#3E7C59] text-[#FAF5EC]'
                  : 'bg-[#2B231C] hover:bg-[#382D24] text-[#D4C3AE]'
              }`}
            >
              {settings.focusAndCamera.webcamMode !== 'off' ? (
                <Camera className="w-4 h-4" />
              ) : (
                <CameraOff className="w-4 h-4" />
              )}
            </button>

            <button
              type="button"
              onClick={() =>
                onUpdateSettings((prev) => ({
                  ...prev,
                  vad: { ...prev.vad, enabled: !prev.vad.enabled },
                }))
              }
              title="Voice auto-pause"
              className={`min-h-[44px] w-[44px] rounded-[13px] inline-flex items-center justify-center cursor-pointer ${
                settings.vad.enabled
                  ? 'bg-[#3E7C59] text-[#FAF5EC]'
                  : 'bg-[#2B231C] hover:bg-[#382D24] text-[#D4C3AE]'
              }`}
            >
              {settings.vad.enabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => setQuickDrawerOpen((o) => !o)}
              title="Stage settings"
              className={`min-h-[44px] w-[44px] rounded-[13px] inline-flex items-center justify-center cursor-pointer ${
                quickDrawerOpen
                  ? 'bg-[#F3EAD8] text-[#15110E]'
                  : 'bg-[#2B231C] hover:bg-[#382D24] text-[#D4C3AE]'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={toggleFullscreen}
              title="Fullscreen"
              className="min-h-[44px] w-[44px] rounded-[13px] bg-[#2B231C] hover:bg-[#382D24] text-[#D4C3AE] inline-flex items-center justify-center cursor-pointer"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Quick On-Stage Tuning Drawer */}
      {quickDrawerOpen && (
        <div className="fixed top-20 right-6 bottom-24 z-40 w-[min(92vw,340px)] rounded-[22px] bg-[#1D1713]/96 border border-[#F3EAD8]/14 backdrop-blur-xl text-[#F3EAD8] p-5 overflow-y-auto shadow-2xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-[18px] font-semibold">Stage Tuning</h3>
            <button
              type="button"
              onClick={() => setQuickDrawerOpen(false)}
              className="h-9 w-9 rounded-[10px] bg-[#2B231C] hover:bg-[#382D24] flex items-center justify-center cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <StageSlider
            label="Font Size"
            value={settings.appearance.fontSizePx}
            min={26}
            max={110}
            step={2}
            unit="px"
            onChange={(v) =>
              onUpdateSettings((p) => ({
                ...p,
                appearance: { ...p.appearance, fontSizePx: v },
              }))
            }
          />
          <StageSlider
            label="Column Width"
            value={settings.appearance.columnWidthPct}
            min={35}
            max={96}
            step={2}
            unit="%"
            onChange={(v) =>
              onUpdateSettings((p) => ({
                ...p,
                appearance: { ...p.appearance, columnWidthPct: v },
              }))
            }
          />
          <StageSlider
            label="Eye-Line"
            value={settings.focusAndCamera.focusBandTopPct}
            min={10}
            max={65}
            step={1}
            unit="%"
            onChange={(v) =>
              onUpdateSettings((p) => ({
                ...p,
                focusAndCamera: { ...p.focusAndCamera, focusBandTopPct: v },
              }))
            }
          />
          <StageSlider
            label="Dimming"
            value={Math.round(settings.focusAndCamera.peripheralDimOpacity * 100)}
            min={0}
            max={85}
            step={5}
            unit="%"
            onChange={(v) =>
              onUpdateSettings((p) => ({
                ...p,
                focusAndCamera: { ...p.focusAndCamera, peripheralDimOpacity: v / 100 },
              }))
            }
          />

          <div className="grid grid-cols-2 gap-2 pt-1">
            {Object.values(STAGE_THEMES).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() =>
                  onUpdateSettings((p) => ({
                    ...p,
                    appearance: { ...p.appearance, themePreset: t.id },
                  }))
                }
                className={`min-h-[38px] px-3 rounded-[11px] text-[12.5px] font-semibold text-left cursor-pointer border ${
                  settings.appearance.themePreset === t.id
                    ? 'border-[#63AD82] bg-[#2B4435] text-[#FAF5EC]'
                    : 'border-[#F3EAD8]/10 bg-[#261F19] text-[#C7B7A2]'
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={openTakeSummaryNow}
            className="w-full min-h-[44px] rounded-[13px] bg-[#2B231C] hover:bg-[#382D24] text-[#F3EAD8] font-semibold text-[13.5px] cursor-pointer"
          >
            Pace Summary
          </button>
        </div>
      )}

      {/* Post-Take Pace Summary */}
      {takeSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-5">
          <div className="w-full max-w-md rounded-[26px] wood-card text-[#F3EAD8] p-6 space-y-5 shadow-2xl">
            <h2 className="font-display text-[23px] font-semibold">{takeSummary.scriptTitle}</h2>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[16px] wood-inset p-4">
                <div className="text-[12px] text-[#A99985]">Time</div>
                <div className="font-mono-tabular text-[24px] font-bold mt-0.5">
                  {formatDuration(takeSummary.actualSeconds)}
                </div>
                <div className="text-[12px] text-[#857562] font-mono-tabular">
                  est. {formatDuration(takeSummary.estimatedSeconds)}
                </div>
              </div>
              <div className="rounded-[16px] wood-inset p-4">
                <div className="text-[12px] text-[#A99985]">Effective Pace</div>
                <div className="font-mono-tabular text-[24px] font-bold text-[#63AD82] mt-0.5">
                  {takeSummary.effectiveWpm} WPM
                </div>
                <div className="text-[12px] text-[#857562] font-mono-tabular">
                  target {takeSummary.targetWpm}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  onApplyMeasuredBaseline(takeSummary.effectiveWpm);
                  onNotify(`Pace saved: ${takeSummary.effectiveWpm} WPM`);
                  setTakeSummary(null);
                  resetStage(false);
                }}
                className="flex-1 wood-btn-pine min-h-[46px] px-4 rounded-[15px] font-semibold text-[14px] inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                Use {takeSummary.effectiveWpm} WPM
              </button>
              <button
                type="button"
                onClick={() => resetStage(false)}
                className="wood-btn-surface min-h-[46px] px-4 rounded-[15px] font-semibold text-[14px] cursor-pointer"
              >
                Again
              </button>
              <button
                type="button"
                onClick={onClose}
                className="min-h-[46px] px-4 rounded-[15px] text-[#B3A38E] hover:text-[#F3EAD8] font-semibold text-[14px] cursor-pointer"
              >
                Exit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const StageSlider: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (val: number) => void;
}> = ({ label, value, min, max, step, unit, onChange }) => (
  <div className="space-y-1.5">
    <div className="flex items-center justify-between text-[13px]">
      <span className="text-[#D4C3AE]">{label}</span>
      <span className="font-mono-tabular font-semibold text-[#63AD82]">
        {value}
        {unit}
      </span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="wood-range"
    />
  </div>
);

const RuleOfThirdsOverlay: React.FC = () => (
  <div className="pointer-events-none absolute inset-0">
    <div className="absolute left-1/3 top-0 bottom-0 w-[1px] bg-white/25" />
    <div className="absolute left-2/3 top-0 bottom-0 w-[1px] bg-white/25" />
    <div className="absolute top-1/3 left-0 right-0 h-[1px] bg-white/25" />
    <div className="absolute top-2/3 left-0 right-0 h-[1px] bg-white/25" />
  </div>
);
