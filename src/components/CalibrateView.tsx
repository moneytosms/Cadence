import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Mic,
  MicOff,
  Pause,
  Play,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import {
  CalibrationRecord,
  SpeedProfile,
  StudioSettings,
} from '../types/prompter';
import { CALIBRATION_PASSAGES, resolveStageColors } from '../data/defaults';
import { countSpokenWords, formatDuration } from '../utils/scriptParser';
import { MicVadController } from '../utils/audioEngine';
import { ClayButton, ClayCard, ClaySegmented, ClaySlider } from './ui/ClayControls';

type PaceTierId = 'slow' | 'natural' | 'brisk' | 'custom';

interface CalibrateViewProps {
  speedProfile: SpeedProfile;
  calibrationHistory: CalibrationRecord[];
  settings: StudioSettings;
  onApplyBaselineWpm: (wpm: number, activeWpm?: number) => void;
  onSaveCalibrationRecord: (record: CalibrationRecord) => void;
  onDeleteCalibrationRecord: (id: string) => void;
  onUpdateVadThreshold: (db: number) => void;
  onNotify: (message: string) => void;
}

export const CalibrateView: React.FC<CalibrateViewProps> = ({
  speedProfile,
  calibrationHistory,
  settings,
  onApplyBaselineWpm,
  onSaveCalibrationRecord,
  onDeleteCalibrationRecord,
  onUpdateVadThreshold,
  onNotify,
}) => {
  const [passageMode, setPassageMode] = useState<string>(CALIBRATION_PASSAGES[0].id);
  const [customPassage, setCustomPassage] = useState<string>(
    'Paste a natural paragraph here to test your speaking speed.'
  );
  const [showHistory, setShowHistory] = useState(false);

  const activePassageText = useMemo(() => {
    if (passageMode === 'custom') return customPassage;
    return CALIBRATION_PASSAGES.find((p) => p.id === passageMode)?.text ?? CALIBRATION_PASSAGES[0].text;
  }, [passageMode, customPassage]);

  const activePassageTitle = useMemo(() => {
    if (passageMode === 'custom') return 'Custom';
    return CALIBRATION_PASSAGES.find((p) => p.id === passageMode)?.title ?? 'Sample';
  }, [passageMode]);

  const wordCount = useMemo(() => countSpokenWords(activePassageText), [activePassageText]);

  const [isTesting, setIsTesting] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [latestResult, setLatestResult] = useState<CalibrationRecord | null>(
    calibrationHistory[0] ?? null
  );

  // Mic VAD
  const [micEnabled, setMicEnabled] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [isSpeakingLive, setIsSpeakingLive] = useState(false);

  const vadRef = useRef<MicVadController | null>(null);
  const meterFillRef = useRef<HTMLDivElement | null>(null);
  const meterDbLabelRef = useRef<HTMLSpanElement | null>(null);

  const testStartMsRef = useRef<number>(0);
  const lastFrameMsRef = useRef<number>(0);
  const activeSpeakingMsRef = useRef<number>(0);
  const pauseCountRef = useRef<number>(0);
  const currentSilenceMsRef = useRef<number>(0);
  const hasSpokenOnceRef = useRef<boolean>(false);
  const isAboveNowRef = useRef<boolean>(false);
  const pausedFlagRef = useRef<boolean>(false);

  // Keep the Slow / Natural / Brisk reference anchored so clicking Slow or Brisk
  // highlights that tier cleanly instead of shifting Natural to the new speed.
  const [anchorNaturalWpm, setAnchorNaturalWpm] = useState<number>(() => {
    const raw = calibrationHistory[0] ? calibrationHistory[0].grossWpm : speedProfile.baselineWpm;
    return Math.max(70, Math.min(250, Math.round(raw)));
  });

  const naturalWpm = Math.max(70, Math.min(250, Math.round(anchorNaturalWpm)));
  const slowWpm = Math.max(55, Math.min(naturalWpm - 10, Math.round(naturalWpm * 0.88)));
  const briskWpm = Math.min(280, Math.max(naturalWpm + 10, Math.round(naturalWpm * 1.12)));

  // Live active pace synced with global speedProfile.baselineWpm
  const currentWpm = speedProfile.baselineWpm;

  const [selectedTier, setSelectedTier] = useState<PaceTierId>(() => {
    if (currentWpm === slowWpm) return 'slow';
    if (currentWpm === naturalWpm) return 'natural';
    if (currentWpm === briskWpm) return 'brisk';
    return 'custom';
  });

  // Sync highlighted tier when slider or external pace changes
  useEffect(() => {
    if (currentWpm === slowWpm) setSelectedTier('slow');
    else if (currentWpm === naturalWpm) setSelectedTier('natural');
    else if (currentWpm === briskWpm) setSelectedTier('brisk');
    else setSelectedTier('custom');
  }, [currentWpm, slowWpm, naturalWpm, briskWpm]);

  // Speed audition strip
  const [auditionPlaying, setAuditionPlaying] = useState<boolean>(false);
  const auditionTrackRef = useRef<HTMLDivElement | null>(null);
  const auditionViewportRef = useRef<HTMLDivElement | null>(null);
  const auditionOffsetRef = useRef<number>(0);
  const auditionRafRef = useRef<number | null>(null);
  const auditionWpmRef = useRef<number>(currentWpm);
  auditionWpmRef.current = currentWpm;

  useEffect(() => {
    if (vadRef.current) {
      vadRef.current.updateConfig({ thresholdDb: settings.vad.thresholdDb });
    }
  }, [settings.vad.thresholdDb]);

  useEffect(() => {
    return () => {
      vadRef.current?.stop();
      vadRef.current = null;
    };
  }, []);

  const toggleMic = async () => {
    if (micEnabled) {
      vadRef.current?.stop();
      vadRef.current = null;
      setMicEnabled(false);
      setIsSpeakingLive(false);
      setMicError(null);
      return;
    }

    setMicError(null);
    const controller = new MicVadController(
      {
        thresholdDb: settings.vad.thresholdDb,
        silenceTimeoutMs: 420,
        speechResumeHoldMs: 110,
      },
      {
        onLevel: (db, normalized, isAbove) => {
          isAboveNowRef.current = isAbove;
          if (meterFillRef.current) {
            meterFillRef.current.style.transform = `scaleX(${Math.max(0.02, normalized)})`;
            meterFillRef.current.style.backgroundColor = isAbove ? '#4E946C' : '#746556';
          }
          if (meterDbLabelRef.current) {
            meterDbLabelRef.current.textContent = `${Math.round(db)} dB`;
          }
        },
        onSpeechStateChange: (speaking) => {
          setIsSpeakingLive(speaking);
        },
      }
    );

    try {
      await controller.start();
      vadRef.current = controller;
      setMicEnabled(true);
    } catch {
      setMicError('Microphone unavailable');
      setMicEnabled(false);
    }
  };

  useEffect(() => {
    if (!isTesting) return;
    let rafId: number;
    testStartMsRef.current = performance.now();
    lastFrameMsRef.current = testStartMsRef.current;
    activeSpeakingMsRef.current = 0;
    pauseCountRef.current = 0;
    currentSilenceMsRef.current = 0;
    hasSpokenOnceRef.current = false;
    pausedFlagRef.current = false;

    const loop = (now: number) => {
      const dt = Math.min(100, now - lastFrameMsRef.current);
      lastFrameMsRef.current = now;

      if (micEnabled) {
        if (isAboveNowRef.current) {
          hasSpokenOnceRef.current = true;
          activeSpeakingMsRef.current += dt;
          currentSilenceMsRef.current = 0;
          pausedFlagRef.current = false;
        } else if (hasSpokenOnceRef.current) {
          currentSilenceMsRef.current += dt;
          if (!pausedFlagRef.current && currentSilenceMsRef.current >= 420) {
            pausedFlagRef.current = true;
            pauseCountRef.current += 1;
          }
        }
      } else {
        activeSpeakingMsRef.current += dt;
      }

      setElapsedSec((now - testStartMsRef.current) / 1000);
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [isTesting, micEnabled]);

  const handleStartTest = () => {
    if (wordCount < 12) {
      onNotify('Add at least 12 words.');
      return;
    }
    setAuditionPlaying(false);
    setElapsedSec(0);
    setIsTesting(true);
  };

  const handleFinishTest = () => {
    const rawSeconds = (performance.now() - testStartMsRef.current) / 1000;
    setIsTesting(false);

    if (rawSeconds < 2.2) {
      setElapsedSec(0);
      onNotify('Read the passage aloud before finishing.');
      return;
    }

    const totalSeconds = rawSeconds;
    const usedMicVad = micEnabled && hasSpokenOnceRef.current && activeSpeakingMsRef.current > 1000;
    const activeSpeakingSeconds = usedMicVad
      ? Math.max(1.5, activeSpeakingMsRef.current / 1000)
      : totalSeconds;
    const totalSilentSeconds = Math.max(0, totalSeconds - activeSpeakingSeconds);
    const pauseCount = usedMicVad ? pauseCountRef.current : 0;
    const avgPauseSeconds =
      pauseCount > 0 ? Math.round((totalSilentSeconds / pauseCount) * 10) / 10 : 0;

    // Clamp natural speaking measurement within realistic bounds so tiers always stay distinct
    const grossWpm = Math.max(70, Math.min(250, Math.round((wordCount / totalSeconds) * 60)));
    const activeWpm = Math.max(
      grossWpm,
      Math.min(280, Math.round((wordCount / activeSpeakingSeconds) * 60))
    );

    const record: CalibrationRecord = {
      id: `cal-${Date.now()}`,
      timestamp: Date.now(),
      passageTitle: activePassageTitle,
      wordCount,
      totalSeconds: Math.round(totalSeconds * 10) / 10,
      activeSpeakingSeconds: Math.round(activeSpeakingSeconds * 10) / 10,
      pauseCount,
      avgPauseSeconds,
      grossWpm,
      activeWpm,
      usedMicVad,
    };

    setLatestResult(record);
    setAnchorNaturalWpm(grossWpm);
    setSelectedTier('natural');
    onSaveCalibrationRecord(record);
    onApplyBaselineWpm(grossWpm, activeWpm);
    onNotify(`Calibrated to ${grossWpm} WPM`);
  };

  const handleSelectTier = (tier: 'slow' | 'natural' | 'brisk', wpm: number) => {
    setSelectedTier(tier);
    onApplyBaselineWpm(wpm, latestResult?.activeWpm);
  };

  const handleSliderChange = (nextWpm: number) => {
    onApplyBaselineWpm(nextWpm, latestResult?.activeWpm);
  };

  useEffect(() => {
    if (!auditionPlaying) {
      if (auditionRafRef.current) cancelAnimationFrame(auditionRafRef.current);
      return;
    }

    let lastNow = performance.now();
    const tick = (now: number) => {
      const dtSec = Math.min(0.05, (now - lastNow) / 1000);
      lastNow = now;

      const track = auditionTrackRef.current;
      const viewport = auditionViewportRef.current;
      if (track && viewport) {
        const totalHeight = Math.max(120, track.scrollHeight);
        const words = Math.max(20, wordCount);
        const pxPerWord = totalHeight / words;
        const pxPerSec = (auditionWpmRef.current / 60) * pxPerWord;

        auditionOffsetRef.current += pxPerSec * dtSec;
        const maxScroll = Math.max(0, totalHeight - viewport.clientHeight + 70);
        if (auditionOffsetRef.current >= maxScroll) {
          auditionOffsetRef.current = 0;
        }
        track.style.transform = `translate3d(0, ${-auditionOffsetRef.current}px, 0)`;
      }
      auditionRafRef.current = requestAnimationFrame(tick);
    };

    auditionRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (auditionRafRef.current) cancelAnimationFrame(auditionRafRef.current);
    };
  }, [auditionPlaying, wordCount]);

  const resetAudition = () => {
    auditionOffsetRef.current = 0;
    if (auditionTrackRef.current) {
      auditionTrackRef.current.style.transform = 'translate3d(0, 0, 0)';
    }
  };

  const stageColors = resolveStageColors(settings.appearance);
  const thresholdPct = Math.max(0, Math.min(100, ((settings.vad.thresholdDb + 60) / 60) * 100));

  const tiers: { id: 'slow' | 'natural' | 'brisk'; label: string; wpm: number; tip: string }[] = [
    { id: 'slow', label: 'Slow', wpm: slowWpm, tip: '12% slower than natural' },
    { id: 'natural', label: 'Natural', wpm: naturalWpm, tip: 'Measured speaking pace' },
    { id: 'brisk', label: 'Brisk', wpm: briskWpm, tip: '12% faster than natural' },
  ];

  return (
    <div className="max-w-[740px] mx-auto space-y-5">
      {/* Step 1: Reading Test */}
      <ClayCard padding="lg" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <ClaySegmented
            value={passageMode}
            onChange={(val) => {
              if (!isTesting) {
                setPassageMode(val);
                resetAudition();
              }
            }}
            options={[
              { value: 'conversational', label: 'Conversational' },
              { value: 'instructional', label: 'Walkthrough' },
              { value: 'storytelling', label: 'Story' },
              { value: 'custom', label: 'Custom' },
            ]}
          />

          <ClayButton
            variant={micEnabled ? 'tonal' : 'surface'}
            size="sm"
            onClick={toggleMic}
            disabled={isTesting}
            tip="Detect breath pauses via microphone"
          >
            {micEnabled ? (
              <Mic className="w-3.5 h-3.5" />
            ) : (
              <MicOff className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
            )}
            {micEnabled ? 'Mic On' : 'Mic'}
          </ClayButton>
        </div>

        {micEnabled && (
          <div className="rounded-[10px] bg-[var(--bg-inset)] border border-[var(--border-subtle)] px-3.5 py-2.5 space-y-2">
            <div className="flex items-center justify-between gap-3 text-[12px] font-mono-tabular">
              <span
                className={
                  isSpeakingLive ? 'text-[var(--accent-text)] font-medium' : 'text-[var(--text-muted)]'
                }
              >
                {isSpeakingLive ? 'Speaking' : 'Quiet'}
              </span>
              <div className="relative flex-1 h-2 rounded-full bg-[var(--bg-surface-hover)] overflow-hidden">
                <div
                  ref={meterFillRef}
                  className="h-full w-full origin-left rounded-full"
                  style={{ transform: 'scaleX(0.02)', backgroundColor: '#746556' }}
                />
                <div
                  className="absolute top-0 bottom-0 w-[2px] bg-[var(--text-primary)]"
                  style={{ left: `${thresholdPct}%` }}
                />
              </div>
              <span ref={meterDbLabelRef} className="text-[var(--text-secondary)] w-11 text-right">
                -60 dB
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span
                className="text-[11.5px] font-mono-tabular text-[var(--text-secondary)] whitespace-nowrap"
                title="Volume level needed to count as speaking"
              >
                Gate {settings.vad.thresholdDb} dB
              </span>
              <input
                type="range"
                min={-55}
                max={-10}
                step={1}
                value={settings.vad.thresholdDb}
                onChange={(e) => onUpdateVadThreshold(parseInt(e.target.value, 10))}
                className="wood-range flex-1"
              />
            </div>
          </div>
        )}

        {micError && <div className="text-[12.5px] text-[var(--danger)]">{micError}</div>}

        {passageMode === 'custom' && !isTesting ? (
          <textarea
            value={customPassage}
            onChange={(e) => setCustomPassage(e.target.value)}
            rows={4}
            className="w-full rounded-[10px] wood-inset p-4 text-[14.5px] leading-[1.7] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] resize-y"
          />
        ) : (
          <div
            className={`rounded-[10px] p-4 sm:p-5 transition-colors duration-200 ${
              isTesting
                ? 'bg-[var(--bg-inset)] border border-[var(--accent)] text-[var(--text-primary)]'
                : 'wood-inset text-[var(--text-primary)]'
            }`}
          >
            <p className="text-[15.5px] leading-[1.75] font-normal">{activePassageText}</p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-0.5">
          <div className="flex items-center gap-2">
            {!isTesting ? (
              <ClayButton variant="primary" size="md" onClick={handleStartTest}>
                <Play className="w-3.5 h-3.5 fill-current" />
                Start Reading Test
              </ClayButton>
            ) : (
              <ClayButton variant="primary" size="md" onClick={handleFinishTest}>
                <Check className="w-3.5 h-3.5" />
                Finish ({elapsedSec.toFixed(1)}s)
              </ClayButton>
            )}

            {isTesting && (
              <ClayButton
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsTesting(false);
                  setElapsedSec(0);
                }}
              >
                Cancel
              </ClayButton>
            )}
          </div>

          <div className="font-mono-tabular text-[12px] text-[var(--text-muted)]">
            {wordCount} words · {formatDuration((wordCount / currentWpm) * 60)}
          </div>
        </div>
      </ClayCard>

      {/* Step 2: Pace Check & Live Audition */}
      <ClayCard padding="lg" className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex items-baseline gap-2.5 flex-wrap">
            <h2 className="text-[17px] font-semibold text-[var(--text-primary)]">Pace Check</h2>
            {latestResult && (
              <span className="font-mono-tabular text-[12px] text-[var(--text-muted)]">
                Measured {latestResult.grossWpm} WPM
                {latestResult.usedMicVad
                  ? ` · ${latestResult.activeWpm} active · ${latestResult.pauseCount} pauses`
                  : ''}
              </span>
            )}
          </div>
          <span className="font-mono-tabular text-[13.5px] font-semibold text-[var(--accent-text)] inline-flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5" />
            {currentWpm} WPM
          </span>
        </div>

        {/* 3 Distinct Pace Tier Buttons */}
        <div className="grid grid-cols-3 gap-2.5">
          {tiers.map((tier) => {
            const isActive = selectedTier === tier.id;
            return (
              <button
                key={tier.id}
                type="button"
                title={tier.tip}
                aria-pressed={isActive}
                onClick={() => handleSelectTier(tier.id, tier.wpm)}
                className={`h-11 px-3.5 rounded-[10px] flex items-center justify-between cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50 ${
                  isActive ? 'wood-btn-moss' : 'wood-btn-surface'
                }`}
              >
                <span className="text-[13px] font-medium">{tier.label}</span>
                <span className="font-mono-tabular text-[14px] font-semibold">{tier.wpm}</span>
              </button>
            );
          })}
        </div>

        {/* Live Scrolling Preview Strip */}
        <div
          ref={auditionViewportRef}
          className="relative h-[116px] rounded-[10px] overflow-hidden border border-[var(--border-subtle)]"
          style={{ backgroundColor: stageColors.bg }}
        >
          <div
            className="pointer-events-none absolute inset-x-0 top-[35%] h-[34px] border-y z-10"
            style={{
              borderColor: `${stageColors.accent}40`,
              backgroundColor: `${stageColors.accent}10`,
            }}
          />
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-7 z-10"
            style={{ background: `linear-gradient(to bottom, ${stageColors.bg}, transparent)` }}
          />
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-7 z-10"
            style={{ background: `linear-gradient(to top, ${stageColors.bg}, transparent)` }}
          />
          <div
            ref={auditionTrackRef}
            className="px-5 pt-10 pb-16 will-change-transform"
            style={{
              color: stageColors.text,
              fontSize: '17px',
              lineHeight: 1.55,
            }}
          >
            {activePassageText}
          </div>
        </div>

        <ClaySlider
          label="Speed"
          value={currentWpm}
          min={55}
          max={280}
          step={5}
          unit=" WPM"
          showSteppers
          onChange={handleSliderChange}
        />

        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-0.5">
          <div className="flex items-center gap-2">
            <ClayButton
              variant="surface"
              size="sm"
              onClick={() => setAuditionPlaying((p) => !p)}
              tip="Preview scroll speed"
            >
              {auditionPlaying ? (
                <>
                  <Pause className="w-3.5 h-3.5" /> Pause
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" /> Preview
                </>
              )}
            </ClayButton>
            <ClayButton variant="ghost" size="sm" onClick={resetAudition} tip="Back to start">
              <RotateCcw className="w-3.5 h-3.5" />
            </ClayButton>
          </div>

          {currentWpm !== naturalWpm && (
            <ClayButton
              variant="ghost"
              size="sm"
              onClick={() => handleSelectTier('natural', naturalWpm)}
              tip="Return to measured natural pace"
            >
              Reset to {naturalWpm} WPM
            </ClayButton>
          )}
        </div>
      </ClayCard>

      {/* Collapsible History */}
      {calibrationHistory.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowHistory((s) => !s)}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer px-1 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50 rounded-[6px]"
          >
            {showHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            History ({calibrationHistory.length})
          </button>

          {showHistory && (
            <ClayCard padding="sm" className="mt-2 divide-y divide-[var(--border-subtle)]">
              {calibrationHistory.slice(0, 6).map((rec) => (
                <div
                  key={rec.id}
                  className="py-2 px-2 flex items-center justify-between gap-3 text-[12.5px]"
                >
                  <div className="font-mono-tabular text-[var(--text-secondary)] flex items-center gap-2 flex-wrap">
                    <span className="text-[var(--text-primary)] font-semibold">
                      {rec.grossWpm} WPM
                    </span>
                    <span>·</span>
                    <span>{rec.passageTitle}</span>
                    <span>·</span>
                    <span>{rec.totalSeconds}s</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <ClayButton
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setLatestResult(rec);
                        setAnchorNaturalWpm(rec.grossWpm);
                        onApplyBaselineWpm(rec.grossWpm, rec.activeWpm);
                        onNotify(`Applied ${rec.grossWpm} WPM`);
                      }}
                    >
                      Use
                    </ClayButton>
                    <ClayButton
                      variant="ghost"
                      size="sm"
                      tip="Delete"
                      onClick={() => onDeleteCalibrationRecord(rec.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                    </ClayButton>
                  </div>
                </div>
              ))}
            </ClayCard>
          )}
        </div>
      )}
    </div>
  );
};
