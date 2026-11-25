import { CustomCueTone } from '../types/prompter';

// Pure Web Audio API utility (zero AI) for synthesized cues & RMS Voice-Activity Detection

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx) {
    sharedAudioCtx = new AudioCtx();
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

export function playSynthesizedTone(
  frequencyHz: number,
  durationMs: number,
  volume = 0.25,
  type: OscillatorType = 'sine'
) {
  const ctx = getAudioContext();
  if (!ctx || volume <= 0) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequencyHz, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001, Math.min(0.6, volume)), now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + durationMs / 1000 + 0.02);
  } catch {
    // Ignore autoplay errors silently
  }
}

export function playCountdownTick(isFinalGo = false, volume = 0.28) {
  if (isFinalGo) {
    playSynthesizedTone(880, 170, volume, 'triangle');
  } else {
    playSynthesizedTone(520, 85, volume * 0.75, 'sine');
  }
}

export function playCueBeep(volume = 0.3) {
  playSynthesizedTone(680, 110, volume, 'sine');
}

export function playCustomCueTone(tone: CustomCueTone, volume = 0.3) {
  if (tone === 'none') return;
  if (tone === 'low') {
    playSynthesizedTone(420, 140, volume, 'sine');
  } else if (tone === 'mid') {
    playSynthesizedTone(640, 120, volume, 'triangle');
  } else if (tone === 'high') {
    playSynthesizedTone(880, 130, volume * 0.9, 'sine');
  }
}

export interface VadCallbacks {
  onLevel: (db: number, normalized01: number, isAboveThreshold: boolean) => void;
  onSpeechStateChange?: (isSpeaking: boolean) => void;
}

export class MicVadController {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private rafId: number | null = null;
  private dataArray: Float32Array<ArrayBuffer> | null = null;
  private thresholdDb: number;
  private silenceTimeoutMs: number;
  private speechResumeHoldMs: number;
  private callbacks: VadCallbacks;

  private isSpeaking = false;
  private aboveSinceMs: number | null = null;
  private belowSinceMs: number | null = null;
  private smoothedDb = -60;

  constructor(
    options: {
      thresholdDb: number;
      silenceTimeoutMs?: number;
      speechResumeHoldMs?: number;
    },
    callbacks: VadCallbacks
  ) {
    this.thresholdDb = options.thresholdDb;
    this.silenceTimeoutMs = options.silenceTimeoutMs ?? 1200;
    this.speechResumeHoldMs = options.speechResumeHoldMs ?? 180;
    this.callbacks = callbacks;
  }

  public updateConfig(options: {
    thresholdDb?: number;
    silenceTimeoutMs?: number;
    speechResumeHoldMs?: number;
  }) {
    if (options.thresholdDb !== undefined) this.thresholdDb = options.thresholdDb;
    if (options.silenceTimeoutMs !== undefined) this.silenceTimeoutMs = options.silenceTimeoutMs;
    if (options.speechResumeHoldMs !== undefined)
      this.speechResumeHoldMs = options.speechResumeHoldMs;
  }

  public async start(): Promise<void> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Microphone access is not supported in this browser.');
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false,
      },
      video: false,
    });

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) {
      throw new Error('Web Audio API is unavailable.');
    }

    this.ctx = new AudioCtx();
    const source = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.4;
    source.connect(this.analyser);

    this.dataArray = new Float32Array(new ArrayBuffer(this.analyser.fftSize * 4));
    this.isSpeaking = false;
    this.aboveSinceMs = null;
    this.belowSinceMs = null;
    this.smoothedDb = -60;

    const tick = () => {
      if (!this.analyser || !this.dataArray) return;
      this.analyser.getFloatTimeDomainData(this.dataArray);

      let sumSq = 0;
      for (let i = 0; i < this.dataArray.length; i++) {
        const s = this.dataArray[i];
        sumSq += s * s;
      }
      const rms = Math.sqrt(sumSq / this.dataArray.length);
      const rawDb = rms > 1e-6 ? 20 * Math.log10(rms) : -60;
      const clampedDb = Math.max(-60, Math.min(0, rawDb));

      const alpha = clampedDb > this.smoothedDb ? 0.45 : 0.18;
      this.smoothedDb = this.smoothedDb + (clampedDb - this.smoothedDb) * alpha;

      const normalized01 = Math.max(0, Math.min(1, (this.smoothedDb + 60) / 60));
      const isAbove = this.smoothedDb >= this.thresholdDb;
      const now = performance.now();

      if (isAbove) {
        this.belowSinceMs = null;
        if (this.aboveSinceMs === null) this.aboveSinceMs = now;
        if (!this.isSpeaking && now - this.aboveSinceMs >= this.speechResumeHoldMs) {
          this.isSpeaking = true;
          this.callbacks.onSpeechStateChange?.(true);
        }
      } else {
        this.aboveSinceMs = null;
        if (this.belowSinceMs === null) this.belowSinceMs = now;
        if (this.isSpeaking && now - this.belowSinceMs >= this.silenceTimeoutMs) {
          this.isSpeaking = false;
          this.callbacks.onSpeechStateChange?.(false);
        }
      }

      this.callbacks.onLevel(this.smoothedDb, normalized01, isAbove);
      this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);
  }

  public stop() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    this.analyser = null;
    this.dataArray = null;
  }
}
