import type { FlightProfile } from '../data/munitions';

class TacticalSoundEngine {
  private ctx: AudioContext | null = null;
  private reverbNode: ConvolverNode | null = null;
  private reverbGain: GainNode | null = null;
  private dryBus: GainNode | null = null;
  private shaperCurve: Float32Array<ArrayBuffer> | null = null;
  private muted = false;

  // Background Air-Raid Siren & Munition Audio state
  private sirenEnabled = true;
  private sirenVolume = 0.65;
  private droneVolume = 0.75;
  private missileVolume = 0.75;
  private sirenMode: 'off' | 'drone' | 'missile' = 'off';
  private lastAlertPingAt = 0;
  private previewTimerId: number | null = null;
  private sirenCycleTimerId: number | null = null;
  private allClearDelayId: number | null = null;
  private allClearStopId: number | null = null;
  private lastInFlightCounts = {
    propDrone: 0,
    jetDrone: 0,
    cruiseMissile: 0,
    ballistic: 0,
    samMissile: 0,
    flakGun: 0,
  };
  private sirenNodes: {
    osc1: OscillatorNode;
    osc2: OscillatorNode;
    oscDistant: OscillatorNode;
    airNoise: AudioBufferSourceNode;
    airGain: GainNode;
    cycleGain: GainNode;
    filter: BiquadFilterNode;
    masterGain: GainNode;
  } | null = null;
  private allClearNodes: {
    osc1: OscillatorNode;
    osc2: OscillatorNode;
    oscDistant: OscillatorNode;
    airNoise: AudioBufferSourceNode;
    masterGain: GainNode;
  } | null = null;
  private sirenStopTimeout: number | null = null;

  // Continuous in-flight audio loops (drones, cruise/jet missiles, ballistics, ППО interceptors)
  private inFlightNodes: {
    propOsc1: OscillatorNode;
    propOsc2: OscillatorNode;
    propLfo: OscillatorNode;
    propLfoGain: GainNode;
    propGain: GainNode;
    jetNoise: AudioBufferSourceNode;
    jetWhine: OscillatorNode;
    jetGain: GainNode;
    ballisticNoise: AudioBufferSourceNode;
    ballisticGain: GainNode;
    samNoise: AudioBufferSourceNode;
    samRumble: AudioBufferSourceNode;
    samGain: GainNode;
    flakNoise: AudioBufferSourceNode;
    flakGain: GainNode;
    masterGain: GainNode;
  } | null = null;

  private ensureGraph(): {
    ctx: AudioContext;
    dry: GainNode;
    wet: GainNode;
  } | null {
    if (this.muted) return null;
    if (typeof window === 'undefined') return null;

    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();

      // Master compressor to prevent clipping when multiple explosions overlap
      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.value = -10;
      compressor.knee.value = 14;
      compressor.ratio.value = 6;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.22;
      compressor.connect(this.ctx.destination);

      const dry = this.ctx.createGain();
      dry.gain.value = 0.9;
      dry.connect(compressor);

      // Outdoor battlefield & urban canyon impulse response (~2.3s stereo decay)
      const convolver = this.ctx.createConvolver();
      convolver.buffer = this.createOutdoorImpulse(this.ctx, 2.3);
      const wet = this.ctx.createGain();
      wet.gain.value = 0.36;
      convolver.connect(wet);
      wet.connect(compressor);

      this.dryBus = dry;
      this.reverbNode = convolver;
      this.reverbGain = wet;
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }

    return {
      ctx: this.ctx,
      dry: this.dryBus!,
      wet: this.reverbNode as unknown as GainNode,
    };
  }

  private createOutdoorImpulse(ctx: AudioContext, durationSec: number): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * durationSec);
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < length; i++) {
        const t = i / length;
        const env = Math.pow(1 - t, 2.3);
        const white = Math.random() * 2 - 1;
        // Lowpass progressively darkens distant urban reflections
        lp = lp * 0.72 + white * 0.28;
        data[i] = lp * env;
      }
    }
    return impulse;
  }

  private getSaturationCurve(): Float32Array<ArrayBuffer> {
    if (this.shaperCurve) return this.shaperCurve;
    const samples = 256;
    const buffer = new ArrayBuffer(samples * Float32Array.BYTES_PER_ELEMENT);
    const curve = new Float32Array(buffer);
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = Math.tanh(x * 2.8);
    }
    this.shaperCurve = curve;
    return curve;
  }

  private createPinkNoiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
    const sampleCount = Math.floor(ctx.sampleRate * durationSec);
    const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < sampleCount; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.16;
      b6 = white * 0.115926;
    }
    return buffer;
  }

  private createBrownNoiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
    const sampleCount = Math.floor(ctx.sampleRate * durationSec);
    const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < sampleCount; i++) {
      const white = Math.random() * 2 - 1;
      lastOut = (lastOut + 0.04 * white) / 1.04;
      data[i] = lastOut * 3.6;
    }
    return buffer;
  }

  private createWhiteNoiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
    const sampleCount = Math.floor(ctx.sampleRate * durationSec);
    const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (muted) {
      this.stopSirenImmediate();
      this.stopAllClearImmediate();
      this.stopInFlightImmediate();
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  setSirenEnabled(enabled: boolean) {
    this.sirenEnabled = enabled;
    if (!enabled) {
      this.stopSirenGraceful(false);
    }
  }

  setSirenVolume(volume: number) {
    this.sirenVolume = Math.max(0, Math.min(1, volume));
    if (this.sirenNodes && this.ctx && this.sirenMode !== 'off' && !this.muted && this.sirenEnabled) {
      const targetGain = this.computeSirenGain(this.sirenMode);
      this.sirenNodes.masterGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.18);
    }
  }

  setDroneVolume(volume: number) {
    this.droneVolume = Math.max(0, Math.min(1, volume));
    this.updateInFlightAudio(this.lastInFlightCounts);
  }

  setMissileVolume(volume: number) {
    this.missileVolume = Math.max(0, Math.min(1, volume));
    this.updateInFlightAudio(this.lastInFlightCounts);
  }

  isSirenRunning(): boolean {
    return this.sirenMode !== 'off';
  }

  private computeSirenGain(mode: 'drone' | 'missile'): number {
    const base = mode === 'missile' ? 0.165 : 0.12;
    return base * this.sirenVolume;
  }

  /**
   * Authentic Ukrainian emergency alert notification chime ("Увага! Повітряна тривога")
   * played when a threat enters a district or escalates.
   */
  private playAlertDispatchPing(mode: 'drone' | 'missile') {
    const nowMs = Date.now();
    if (nowMs - this.lastAlertPingAt < 2200) return;
    this.lastAlertPingAt = nowMs;

    const g = this.ensureGraph();
    if (!g) return;
    const { ctx, dry } = g;
    const wet = this.reverbNode!;
    const now = ctx.currentTime;
    const vol = Math.max(0.02, 0.125 * this.sirenVolume);

    // Classic civil-defense broadcast dual-tone attention chime
    const notes =
      mode === 'missile'
        ? [
            { f: 783.99, dt: 0, dur: 0.16 },
            { f: 1046.5, dt: 0.14, dur: 0.16 },
            { f: 783.99, dt: 0.28, dur: 0.28 },
          ]
        : [
            { f: 659.25, dt: 0, dur: 0.16 },
            { f: 880.0, dt: 0.15, dur: 0.26 },
          ];

    for (const note of notes) {
      const t = now + note.dt;
      const osc = ctx.createOscillator();
      const overtone = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      overtone.type = 'sine';
      osc.frequency.setValueAtTime(note.f, t);
      overtone.frequency.setValueAtTime(note.f * 2, t);

      const overGain = ctx.createGain();
      overGain.gain.value = 0.22;

      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.014);
      gain.gain.exponentialRampToValueAtTime(0.0008, t + note.dur);

      osc.connect(gain);
      overtone.connect(overGain);
      overGain.connect(gain);
      gain.connect(dry);
      gain.connect(wet);
      osc.start(t);
      overtone.start(t);
      osc.stop(t + note.dur + 0.02);
      overtone.stop(t + note.dur + 0.02);
    }
  }

  private stopAllClearImmediate() {
    if (this.allClearDelayId !== null) {
      window.clearTimeout(this.allClearDelayId);
      this.allClearDelayId = null;
    }
    if (this.allClearStopId !== null) {
      window.clearTimeout(this.allClearStopId);
      this.allClearStopId = null;
    }
    const nodes = this.allClearNodes;
    this.allClearNodes = null;
    if (nodes) {
      try {
        nodes.osc1.stop();
        nodes.osc2.stop();
        nodes.oscDistant.stop();
        nodes.airNoise.stop();
        nodes.masterGain.disconnect();
      } catch {
        // ignore
      }
    }
  }

  /**
   * Realistic Ukrainian "Відбій повітряної тривоги":
   * Plays the exact same C-40 electromechanical siren sound as the alert,
   * but as a single shorter ~3.5s cycle (instead of the repeating 8–9s alert cycles).
   */
  private playShortAllClearSiren(mode: 'drone' | 'missile' = 'drone') {
    if (this.muted) return;
    this.stopAllClearImmediate();

    const g = this.ensureGraph();
    if (!g) return;
    const { ctx, dry } = g;
    const wet = this.reverbNode!;
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const oscDistant = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc2.type = 'sawtooth';
    oscDistant.type = 'sawtooth';

    const airNoise = ctx.createBufferSource();
    airNoise.buffer = this.createPinkNoiseBuffer(ctx, 4.0);
    airNoise.loop = true;
    const airBand = ctx.createBiquadFilter();
    airBand.type = 'bandpass';
    airBand.frequency.value = 620;
    airBand.Q.value = 1.4;
    const airGain = ctx.createGain();

    const hornPeak = ctx.createBiquadFilter();
    hornPeak.type = 'peaking';
    hornPeak.frequency.value = 740;
    hornPeak.Q.value = 2.0;
    hornPeak.gain.value = 5.5;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 1.6;

    const cycleGain = ctx.createGain();
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(Math.max(0.0001, this.computeSirenGain(mode)), now);

    const distantDelay = ctx.createDelay(0.5);
    distantDelay.delayTime.value = 0.24;
    const distantGain = ctx.createGain();
    distantGain.gain.value = 0.42;

    osc1.connect(hornPeak);
    osc2.connect(hornPeak);
    oscDistant.connect(distantDelay);
    distantDelay.connect(distantGain);
    distantGain.connect(hornPeak);

    airNoise.connect(airBand);
    airBand.connect(airGain);
    airGain.connect(filter);

    hornPeak.connect(filter);
    filter.connect(cycleGain);
    cycleGain.connect(masterGain);

    const dryTap = ctx.createGain();
    dryTap.gain.value = 0.26;
    const wetTap = ctx.createGain();
    wetTap.gain.value = 0.98;
    masterGain.connect(dryTap);
    masterGain.connect(wetTap);
    dryTap.connect(dry);
    wetTap.connect(wet);

    // Shorter single cycle (~3.5s vs ~8.5s alert cycle)
    const lowHz = 148;
    const peakHz = mode === 'missile' ? 500 : 455;
    const spinUpSec = 1.05;
    const holdSec = 0.5;
    const coastDownSec = 1.95;
    const totalSec = spinUpSec + holdSec + coastDownSec;

    const offsets = [1, 1.0045, 0.994];
    [osc1, osc2, oscDistant].forEach((osc, idx) => {
      const m = offsets[idx];
      const echoShift = idx === 2 ? 0.14 : 0;
      osc.frequency.setValueAtTime(lowHz * m, now);
      osc.frequency.exponentialRampToValueAtTime(peakHz * m, now + spinUpSec + echoShift);
      osc.frequency.setValueAtTime(peakHz * m, now + spinUpSec + holdSec + echoShift);
      osc.frequency.exponentialRampToValueAtTime(95 * m, now + totalSec);
    });

    cycleGain.gain.setValueAtTime(0.01, now);
    cycleGain.gain.linearRampToValueAtTime(1.0, now + spinUpSec);
    cycleGain.gain.setValueAtTime(1.0, now + spinUpSec + holdSec);
    cycleGain.gain.exponentialRampToValueAtTime(0.001, now + totalSec);

    filter.frequency.setValueAtTime(560, now);
    filter.frequency.exponentialRampToValueAtTime(1180, now + spinUpSec);
    filter.frequency.setValueAtTime(1180, now + spinUpSec + holdSec);
    filter.frequency.exponentialRampToValueAtTime(420, now + totalSec);

    airGain.gain.setValueAtTime(0.008, now);
    airGain.gain.linearRampToValueAtTime(0.055, now + spinUpSec);
    airGain.gain.exponentialRampToValueAtTime(0.001, now + totalSec);

    this.allClearNodes = { osc1, osc2, oscDistant, airNoise, masterGain };

    osc1.start(now);
    osc2.start(now);
    oscDistant.start(now);
    airNoise.start(now);

    const stopAt = now + totalSec + 0.15;
    osc1.stop(stopAt);
    osc2.stop(stopAt);
    oscDistant.stop(stopAt);
    airNoise.stop(stopAt);

    this.allClearStopId = window.setTimeout(() => {
      this.allClearStopId = null;
      this.stopAllClearImmediate();
    }, (totalSec + 0.4) * 1000);
  }

  previewAllClear() {
    if (this.muted) return;
    if (this.previewTimerId !== null) {
      window.clearTimeout(this.previewTimerId);
      this.previewTimerId = null;
      this.stopSirenGraceful(false);
    }
    this.playShortAllClearSiren('drone');
  }

  /**
   * Schedules one realistic electromechanical C-40 siren motor cycle:
   * - Exponential spin-up (~3.0s)
   * - Full-RPM piercing peak hold (~1.9s)
   * - Heavy rotor coast-down (~3.3s)
   * Total cycle: ~8.2s (missile) or ~9.4s (drone).
   */
  private scheduleSirenCycle(mode: 'drone' | 'missile') {
    if (!this.sirenNodes || !this.ctx || this.sirenMode === 'off') return;
    const { osc1, osc2, oscDistant, airGain, cycleGain, filter } = this.sirenNodes;
    const now = this.ctx.currentTime;

    const lowHz = mode === 'missile' ? 165 : 150;
    const peakHz = mode === 'missile' ? 545 : 470;
    const spinUpSec = mode === 'missile' ? 2.9 : 3.4;
    const holdSec = mode === 'missile' ? 1.9 : 1.7;
    const coastDownSec = mode === 'missile' ? 3.2 : 3.9;
    const totalSec = spinUpSec + holdSec + coastDownSec;

    for (const osc of [osc1, osc2, oscDistant]) {
      osc.frequency.cancelScheduledValues(now);
    }
    cycleGain.gain.cancelScheduledValues(now);
    airGain.gain.cancelScheduledValues(now);
    filter.frequency.cancelScheduledValues(now);

    // Subtle detuning between city sirens creates authentic chorus & beating
    const offsets = [1, 1.0045, 0.994];
    const oscList = [osc1, osc2, oscDistant];

    oscList.forEach((osc, idx) => {
      const m = offsets[idx];
      const echoShift = idx === 2 ? 0.22 : 0; // distant speaker lags slightly
      osc.frequency.setValueAtTime(lowHz * m, now);
      osc.frequency.exponentialRampToValueAtTime(peakHz * m, now + spinUpSec + echoShift);
      osc.frequency.setValueAtTime(peakHz * m, now + spinUpSec + holdSec + echoShift);
      osc.frequency.exponentialRampToValueAtTime(lowHz * m, now + totalSec);
    });

    // Rotary airflow volume swells with RPM
    cycleGain.gain.setValueAtTime(0.36, now);
    cycleGain.gain.linearRampToValueAtTime(1.0, now + spinUpSec);
    cycleGain.gain.setValueAtTime(1.0, now + spinUpSec + holdSec);
    cycleGain.gain.linearRampToValueAtTime(0.34, now + totalSec);

    // Horn filter opens up at peak RPM for brassy outdoor cut-through
    filter.frequency.setValueAtTime(580, now);
    filter.frequency.exponentialRampToValueAtTime(mode === 'missile' ? 1420 : 1120, now + spinUpSec);
    filter.frequency.setValueAtTime(mode === 'missile' ? 1420 : 1120, now + spinUpSec + holdSec);
    filter.frequency.exponentialRampToValueAtTime(560, now + totalSec);

    // Subtle mechanical air rush
    airGain.gain.setValueAtTime(0.015, now);
    airGain.gain.linearRampToValueAtTime(0.065, now + spinUpSec);
    airGain.gain.linearRampToValueAtTime(0.015, now + totalSec);
  }

  private ensureSirenNodes(initialMode: 'drone' | 'missile') {
    const g = this.ensureGraph();
    if (!g) return;
    const { ctx, dry } = g;
    const wet = this.reverbNode!;

    if (this.sirenStopTimeout !== null) {
      window.clearTimeout(this.sirenStopTimeout);
      this.sirenStopTimeout = null;
    }

    if (this.sirenNodes) {
      this.applySirenModeParams(initialMode);
      return;
    }

    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const oscDistant = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc2.type = 'sawtooth';
    oscDistant.type = 'sawtooth';

    // Pink noise air turbulence from the rotary siren stator
    const airNoise = ctx.createBufferSource();
    airNoise.buffer = this.createPinkNoiseBuffer(ctx, 3.0);
    airNoise.loop = true;
    const airBand = ctx.createBiquadFilter();
    airBand.type = 'bandpass';
    airBand.frequency.value = 620;
    airBand.Q.value = 1.4;
    const airGain = ctx.createGain();
    airGain.gain.setValueAtTime(0.02, now);

    // Horn formant resonator + warm outdoor lowpass
    const hornPeak = ctx.createBiquadFilter();
    hornPeak.type = 'peaking';
    hornPeak.frequency.value = 740;
    hornPeak.Q.value = 2.0;
    hornPeak.gain.value = 5.5;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, now);
    filter.Q.value = 1.6;

    const cycleGain = ctx.createGain();
    cycleGain.gain.setValueAtTime(0.4, now);

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.0001, now);

    // Distant neighborhood siren echoes slightly delayed into outdoor reverb
    const distantDelay = ctx.createDelay(0.5);
    distantDelay.delayTime.value = 0.24;
    const distantGain = ctx.createGain();
    distantGain.gain.value = 0.42;

    osc1.connect(hornPeak);
    osc2.connect(hornPeak);
    oscDistant.connect(distantDelay);
    distantDelay.connect(distantGain);
    distantGain.connect(hornPeak);

    airNoise.connect(airBand);
    airBand.connect(airGain);
    airGain.connect(filter);

    hornPeak.connect(filter);
    filter.connect(cycleGain);
    cycleGain.connect(masterGain);

    // Heavy outdoor reverb + subtle direct path so it sounds like real city sirens outside
    const dryTap = ctx.createGain();
    dryTap.gain.value = 0.26;
    const wetTap = ctx.createGain();
    wetTap.gain.value = 0.98;
    masterGain.connect(dryTap);
    masterGain.connect(wetTap);
    dryTap.connect(dry);
    wetTap.connect(wet);

    this.sirenNodes = {
      osc1,
      osc2,
      oscDistant,
      airNoise,
      airGain,
      cycleGain,
      filter,
      masterGain,
    };

    osc1.start(now);
    osc2.start(now);
    oscDistant.start(now);
    airNoise.start(now);

    this.applySirenModeParams(initialMode);
  }

  private applySirenModeParams(mode: 'drone' | 'missile') {
    if (!this.sirenNodes || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.sirenNodes.masterGain.gain.setTargetAtTime(
      Math.max(0.0001, this.computeSirenGain(mode)),
      now,
      0.55,
    );

    if (this.sirenCycleTimerId === null) {
      this.scheduleSirenCycle(mode);
      const periodMs = mode === 'missile' ? 8000 : 9000;
      this.sirenCycleTimerId = window.setInterval(() => {
        if (this.sirenMode !== 'off') {
          this.scheduleSirenCycle(this.sirenMode);
        }
      }, periodMs);
    }
  }

  private stopSirenGraceful(playAllClear: boolean) {
    if (this.sirenMode === 'off' && !this.sirenNodes) return;
    const prevMode = this.sirenMode;
    this.sirenMode = 'off';

    if (this.sirenCycleTimerId !== null) {
      window.clearInterval(this.sirenCycleTimerId);
      this.sirenCycleTimerId = null;
    }

    if (this.sirenNodes && this.ctx) {
      const nodes = this.sirenNodes;
      const now = this.ctx.currentTime;
      for (const osc of [nodes.osc1, nodes.osc2, nodes.oscDistant]) {
        osc.frequency.cancelScheduledValues(now);
        osc.frequency.setTargetAtTime(92, now, 0.65);
      }
      nodes.cycleGain.gain.cancelScheduledValues(now);
      nodes.cycleGain.gain.setTargetAtTime(0.18, now, 0.5);
      nodes.airGain.gain.cancelScheduledValues(now);
      nodes.airGain.gain.setTargetAtTime(0.001, now, 0.4);
      nodes.masterGain.gain.setTargetAtTime(0.0001, now, 0.55);

      this.sirenNodes = null;
      this.sirenStopTimeout = window.setTimeout(() => {
        try {
          nodes.osc1.stop();
          nodes.osc2.stop();
          nodes.oscDistant.stop();
          nodes.airNoise.stop();
          nodes.osc1.disconnect();
          nodes.osc2.disconnect();
          nodes.oscDistant.disconnect();
          nodes.airNoise.disconnect();
          nodes.masterGain.disconnect();
        } catch {
          // ignore already stopped
        }
      }, 1900);
    }

    if (playAllClear && prevMode !== 'off' && !this.muted && this.sirenEnabled) {
      if (this.allClearDelayId !== null) {
        window.clearTimeout(this.allClearDelayId);
      }
      this.allClearDelayId = window.setTimeout(() => {
        this.allClearDelayId = null;
        if (this.sirenMode === 'off' && !this.muted && this.sirenEnabled) {
          this.playShortAllClearSiren(prevMode);
        }
      }, 750);
    }
  }

  private stopSirenImmediate() {
    if (this.previewTimerId !== null) {
      window.clearTimeout(this.previewTimerId);
      this.previewTimerId = null;
    }
    if (this.sirenCycleTimerId !== null) {
      window.clearInterval(this.sirenCycleTimerId);
      this.sirenCycleTimerId = null;
    }
    if (this.sirenStopTimeout !== null) {
      window.clearTimeout(this.sirenStopTimeout);
      this.sirenStopTimeout = null;
    }
    this.sirenMode = 'off';
    const nodes = this.sirenNodes;
    this.sirenNodes = null;
    if (nodes) {
      try {
        nodes.osc1.stop();
        nodes.osc2.stop();
        nodes.oscDistant.stop();
        nodes.airNoise.stop();
        nodes.masterGain.disconnect();
      } catch {
        // ignore
      }
    }
  }

  /**
   * Synchronizes the background air-raid siren with active Ukrainian district alerts.
   */
  updateAirRaidSiren(state: {
    droneRaions: number;
    missileRaions: number;
    newlyAlertedDrone: boolean;
    newlyAlertedMissile: boolean;
  }) {
    if (this.previewTimerId !== null && (state.droneRaions > 0 || state.missileRaions > 0)) {
      window.clearTimeout(this.previewTimerId);
      this.previewTimerId = null;
    }
    if (this.previewTimerId !== null) return;

    const desired: 'off' | 'drone' | 'missile' =
      this.muted || !this.sirenEnabled || (state.droneRaions === 0 && state.missileRaions === 0)
        ? 'off'
        : state.missileRaions > 0
          ? 'missile'
          : 'drone';

    if (desired === 'off') {
      if (this.sirenMode !== 'off') {
        this.stopSirenGraceful(!this.muted && this.sirenEnabled);
      }
      return;
    }

    const wasOff = this.sirenMode === 'off';
    const escalated = this.sirenMode === 'drone' && desired === 'missile';
    this.sirenMode = desired;
    this.stopAllClearImmediate();

    if (wasOff || escalated || state.newlyAlertedMissile || state.newlyAlertedDrone) {
      if (wasOff || escalated || state.newlyAlertedMissile) {
        this.playAlertDispatchPing(desired);
      }
    }

    if (escalated && this.sirenCycleTimerId !== null) {
      window.clearInterval(this.sirenCycleTimerId);
      this.sirenCycleTimerId = null;
    }

    this.ensureSirenNodes(desired);
  }

  previewSiren(mode: 'drone' | 'missile' = 'missile') {
    if (this.muted) return;
    if (this.previewTimerId !== null) {
      window.clearTimeout(this.previewTimerId);
      this.previewTimerId = null;
      this.stopSirenGraceful(false);
      return;
    }
    if (this.sirenCycleTimerId !== null) {
      window.clearInterval(this.sirenCycleTimerId);
      this.sirenCycleTimerId = null;
    }
    this.sirenMode = mode;
    this.playAlertDispatchPing(mode);
    this.ensureSirenNodes(mode);
    this.previewTimerId = window.setTimeout(() => {
      this.previewTimerId = null;
      this.stopSirenGraceful(true);
    }, 8200);
  }

  private ensureInFlightNodes() {
    if (this.inFlightNodes) return this.inFlightNodes;
    const g = this.ensureGraph();
    if (!g) return null;
    const { ctx, dry } = g;
    const wet = this.reverbNode!;
    const now = ctx.currentTime;

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.95, now);

    const dryTap = ctx.createGain();
    dryTap.gain.value = 0.72;
    const wetTap = ctx.createGain();
    wetTap.gain.value = 0.35;
    masterGain.connect(dryTap);
    masterGain.connect(wetTap);
    dryTap.connect(dry);
    wetTap.connect(wet);

    // 1. Prop-drone ("Shahed-136" persistent 2-stroke moped buzz)
    const propOsc1 = ctx.createOscillator();
    const propOsc2 = ctx.createOscillator();
    propOsc1.type = 'sawtooth';
    propOsc2.type = 'triangle';
    propOsc1.frequency.setValueAtTime(78, now);
    propOsc2.frequency.setValueAtTime(156, now);

    const propLfo = ctx.createOscillator();
    const propLfoGain = ctx.createGain();
    propLfo.type = 'sine';
    propLfo.frequency.setValueAtTime(23.5, now);
    propLfoGain.gain.setValueAtTime(14, now);

    const propFilter = ctx.createBiquadFilter();
    propFilter.type = 'lowpass';
    propFilter.frequency.setValueAtTime(410, now);
    propFilter.Q.value = 2.2;
    propLfo.connect(propLfoGain);
    propLfoGain.connect(propFilter.frequency);

    const propGain = ctx.createGain();
    propGain.gain.setValueAtTime(0.0001, now);

    propOsc1.connect(propFilter);
    propOsc2.connect(propFilter);
    propFilter.connect(propGain);
    propGain.connect(masterGain);

    // 2. Jet / Cruise missile continuous turbofan rush + whine
    const jetNoise = ctx.createBufferSource();
    jetNoise.buffer = this.createPinkNoiseBuffer(ctx, 2.5);
    jetNoise.loop = true;
    const jetBand = ctx.createBiquadFilter();
    jetBand.type = 'bandpass';
    jetBand.frequency.setValueAtTime(720, now);
    jetBand.Q.value = 0.85;

    const jetWhine = ctx.createOscillator();
    jetWhine.type = 'triangle';
    jetWhine.frequency.setValueAtTime(1180, now);
    const jetWhineBand = ctx.createBiquadFilter();
    jetWhineBand.type = 'bandpass';
    jetWhineBand.frequency.setValueAtTime(1220, now);
    jetWhineBand.Q.value = 2.6;
    const jetWhineGain = ctx.createGain();
    jetWhineGain.gain.value = 0.14;

    const jetGain = ctx.createGain();
    jetGain.gain.setValueAtTime(0.0001, now);

    jetNoise.connect(jetBand);
    jetBand.connect(jetGain);
    jetWhine.connect(jetWhineBand);
    jetWhineBand.connect(jetWhineGain);
    jetWhineGain.connect(jetGain);
    jetGain.connect(masterGain);

    // 3. Ballistic supersonic rocket sustain roar
    const ballisticNoise = ctx.createBufferSource();
    ballisticNoise.buffer = this.createBrownNoiseBuffer(ctx, 2.5);
    ballisticNoise.loop = true;
    const balFilter = ctx.createBiquadFilter();
    balFilter.type = 'lowpass';
    balFilter.frequency.setValueAtTime(340, now);
    balFilter.Q.value = 1.1;
    const ballisticGain = ctx.createGain();
    ballisticGain.gain.setValueAtTime(0.0001, now);

    ballisticNoise.connect(balFilter);
    balFilter.connect(ballisticGain);
    ballisticGain.connect(masterGain);

    // 4. ППО SAM interceptor missile flight (realistic solid-propellant rocket thrust + Mach air rush)
    const samNoise = ctx.createBufferSource();
    samNoise.buffer = this.createPinkNoiseBuffer(ctx, 2.2);
    samNoise.loop = true;
    const samBand = ctx.createBiquadFilter();
    samBand.type = 'bandpass';
    samBand.frequency.setValueAtTime(1180, now);
    samBand.Q.value = 0.72;

    const samRumble = ctx.createBufferSource();
    samRumble.buffer = this.createBrownNoiseBuffer(ctx, 2.2);
    samRumble.loop = true;
    const samLp = ctx.createBiquadFilter();
    samLp.type = 'lowpass';
    samLp.frequency.setValueAtTime(480, now);
    const samRumbleGain = ctx.createGain();
    samRumbleGain.gain.value = 0.78;

    const samGain = ctx.createGain();
    samGain.gain.setValueAtTime(0.0001, now);

    samNoise.connect(samBand);
    samBand.connect(samGain);
    samRumble.connect(samLp);
    samLp.connect(samRumbleGain);
    samRumbleGain.connect(samGain);
    samGain.connect(masterGain);

    // 5. ППО 35mm / HMG tracer volley supersonic air tear
    const flakNoise = ctx.createBufferSource();
    flakNoise.buffer = this.createWhiteNoiseBuffer(ctx, 1.5);
    flakNoise.loop = true;
    const flakBand = ctx.createBiquadFilter();
    flakBand.type = 'bandpass';
    flakBand.frequency.setValueAtTime(1950, now);
    flakBand.Q.value = 1.35;
    const flakGain = ctx.createGain();
    flakGain.gain.setValueAtTime(0.0001, now);

    flakNoise.connect(flakBand);
    flakBand.connect(flakGain);
    flakGain.connect(masterGain);

    propOsc1.start(now);
    propOsc2.start(now);
    propLfo.start(now);
    jetNoise.start(now);
    jetWhine.start(now);
    ballisticNoise.start(now);
    samNoise.start(now);
    samRumble.start(now);
    flakNoise.start(now);

    this.inFlightNodes = {
      propOsc1,
      propOsc2,
      propLfo,
      propLfoGain,
      propGain,
      jetNoise,
      jetWhine,
      jetGain,
      ballisticNoise,
      ballisticGain,
      samNoise,
      samRumble,
      samGain,
      flakNoise,
      flakGain,
      masterGain,
    };

    return this.inFlightNodes;
  }

  private stopInFlightImmediate() {
    const nodes = this.inFlightNodes;
    this.inFlightNodes = null;
    if (!nodes) return;
    try {
      nodes.propOsc1.stop();
      nodes.propOsc2.stop();
      nodes.propLfo.stop();
      nodes.jetNoise.stop();
      nodes.jetWhine.stop();
      nodes.ballisticNoise.stop();
      nodes.samNoise.stop();
      nodes.samRumble.stop();
      nodes.flakNoise.stop();
      nodes.masterGain.disconnect();
    } catch {
      // ignore already stopped
    }
  }

  /**
   * Updates continuous airborne sounds for active drones, cruise/ballistic missiles,
   * and flying ППО interceptors, respecting independent Шахед and Ракета volume sliders.
   */
  updateInFlightAudio(counts: {
    propDrone: number;
    jetDrone: number;
    cruiseMissile: number;
    ballistic: number;
    samMissile: number;
    flakGun: number;
  }) {
    this.lastInFlightCounts = counts;

    const total =
      counts.propDrone +
      counts.jetDrone +
      counts.cruiseMissile +
      counts.ballistic +
      counts.samMissile +
      counts.flakGun;

    if (this.muted || (total === 0 && !this.inFlightNodes)) {
      return;
    }

    const nodes = this.ensureInFlightNodes();
    if (!nodes || !this.ctx) return;

    const now = this.ctx.currentTime;
    const scaleCount = (n: number, base: number, max: number) =>
      n <= 0 ? 0 : Math.min(max, base * (0.7 + Math.min(n, 5) * 0.14));

    const propTarget = scaleCount(counts.propDrone, 0.065, 0.11) * this.droneVolume;
    const jetTarget =
      scaleCount(counts.jetDrone, 0.072, 0.115) * this.droneVolume +
      scaleCount(counts.cruiseMissile, 0.082, 0.13) * this.missileVolume;
    const ballisticTarget = scaleCount(counts.ballistic, 0.115, 0.17) * this.missileVolume;
    const samTarget = scaleCount(counts.samMissile, 0.078, 0.13);
    const flakTarget = scaleCount(counts.flakGun, 0.032, 0.055);

    nodes.propGain.gain.setTargetAtTime(Math.max(0.0001, propTarget), now, 0.14);
    nodes.jetGain.gain.setTargetAtTime(Math.max(0.0001, jetTarget), now, 0.14);
    nodes.ballisticGain.gain.setTargetAtTime(Math.max(0.0001, ballisticTarget), now, 0.12);
    nodes.samGain.gain.setTargetAtTime(Math.max(0.0001, samTarget), now, 0.09);
    nodes.flakGain.gain.setTargetAtTime(Math.max(0.0001, flakTarget), now, 0.07);
  }

  /**
   * Crisp hardware / tactical console button clicks instead of synthetic sine sweeps.
   */
  playUiClick(variant: 'tap' | 'toggle' | 'tab' | 'back' | 'confirm' = 'tap') {
    const g = this.ensureGraph();
    if (!g) return;
    const { ctx, dry } = g;
    const now = ctx.currentTime;

    // 1. Short mechanical switch transient (filtered crisp click)
    const snap = ctx.createBufferSource();
    snap.buffer = this.createWhiteNoiseBuffer(ctx, 0.025);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(
      variant === 'confirm' ? 2900 : variant === 'tab' ? 2400 : variant === 'back' ? 1650 : 2150,
      now,
    );
    bp.Q.value = 2.4;

    const sg = ctx.createGain();
    sg.gain.setValueAtTime(variant === 'confirm' ? 0.14 : 0.11, now);
    sg.gain.exponentialRampToValueAtTime(0.001, now + 0.022);
    snap.connect(bp);
    bp.connect(sg);
    sg.connect(dry);
    snap.start(now);

    // 2. Subtle housing body resonance
    const body = ctx.createOscillator();
    const bg = ctx.createGain();
    body.type = 'triangle';
    if (variant === 'confirm') {
      body.frequency.setValueAtTime(340, now);
      body.frequency.exponentialRampToValueAtTime(510, now + 0.036);
    } else if (variant === 'back') {
      body.frequency.setValueAtTime(310, now);
      body.frequency.exponentialRampToValueAtTime(195, now + 0.035);
    } else if (variant === 'toggle') {
      body.frequency.setValueAtTime(420, now);
      body.frequency.exponentialRampToValueAtTime(260, now + 0.024);
    } else {
      body.frequency.setValueAtTime(variant === 'tab' ? 380 : 295, now);
      body.frequency.exponentialRampToValueAtTime(150, now + 0.026);
    }
    bg.gain.setValueAtTime(0.065, now);
    bg.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    body.connect(bg);
    bg.connect(dry);
    body.start(now);
    body.stop(now + 0.045);
  }

  playPlaceLauncher() {
    const g = this.ensureGraph();
    if (!g) return;
    const { ctx, dry } = g;
    const now = ctx.currentTime;

    // Hydraulic stabilizer deployment thud + steel locking pin clack
    const thud = ctx.createOscillator();
    const thudGain = ctx.createGain();
    thud.type = 'triangle';
    thud.frequency.setValueAtTime(125, now);
    thud.frequency.exponentialRampToValueAtTime(44, now + 0.11);
    thudGain.gain.setValueAtTime(0.22, now);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    thud.connect(thudGain);
    thudGain.connect(dry);
    thud.start(now);
    thud.stop(now + 0.14);

    const clickSrc = ctx.createBufferSource();
    clickSrc.buffer = this.createWhiteNoiseBuffer(ctx, 0.04);
    const cf = ctx.createBiquadFilter();
    cf.type = 'bandpass';
    cf.frequency.value = 2300;
    cf.Q.value = 1.9;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.14, now + 0.028);
    cg.gain.exponentialRampToValueAtTime(0.001, now + 0.062);
    clickSrc.connect(cf);
    cf.connect(cg);
    cg.connect(dry);
    clickSrc.start(now + 0.025);
  }

  playSelectLauncher() {
    this.playUiClick('confirm');
  }

  playBlocked() {
    const g = this.ensureGraph();
    if (!g) return;
    const { ctx, dry } = g;
    const now = ctx.currentTime;

    // Tactile muted double mechanical thud (non-annoying error feedback)
    for (const dt of [0, 0.075]) {
      const thud = ctx.createOscillator();
      const gain = ctx.createGain();
      thud.type = 'triangle';
      thud.frequency.setValueAtTime(dt === 0 ? 155 : 122, now + dt);
      thud.frequency.exponentialRampToValueAtTime(68, now + dt + 0.055);
      gain.gain.setValueAtTime(0.09, now + dt);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dt + 0.06);
      thud.connect(gain);
      gain.connect(dry);
      thud.start(now + dt);
      thud.stop(now + dt + 0.065);
    }
  }

  playLaunch(profile: FlightProfile) {
    const isDrone = profile === 'prop-drone' || profile === 'jet-drone';
    const volScale = isDrone ? this.droneVolume : this.missileVolume;
    if (volScale <= 0.005) return;

    const g = this.ensureGraph();
    if (!g) return;
    const { ctx, dry } = g;
    const wet = this.reverbNode!;
    const now = ctx.currentTime;

    if (profile === 'prop-drone') {
      // Catapult rail snap
      const snap = ctx.createBufferSource();
      snap.buffer = this.createPinkNoiseBuffer(ctx, 0.08);
      const sf = ctx.createBiquadFilter();
      sf.type = 'bandpass';
      sf.frequency.value = 1100;
      const sg = ctx.createGain();
      sg.gain.setValueAtTime(0.24 * volScale, now);
      sg.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
      snap.connect(sf);
      sf.connect(sg);
      sg.connect(dry);
      snap.start(now);

      // Authentic Shahed two-stroke piston buzz with flutter LFO + propeller air chop
      const buzz = ctx.createOscillator();
      const subBuzz = ctx.createOscillator();
      buzz.type = 'sawtooth';
      subBuzz.type = 'triangle';
      buzz.frequency.setValueAtTime(64, now);
      buzz.frequency.exponentialRampToValueAtTime(98, now + 0.35);
      buzz.frequency.linearRampToValueAtTime(86, now + 1.05);
      subBuzz.frequency.setValueAtTime(128, now);
      subBuzz.frequency.exponentialRampToValueAtTime(196, now + 0.35);
      subBuzz.frequency.linearRampToValueAtTime(172, now + 1.05);

      // Flutter LFO for realistic moped cylinder chug
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 24;
      lfoGain.gain.value = 0.04 * volScale;

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(520, now);
      lp.Q.value = 2.4;

      const engineGain = ctx.createGain();
      engineGain.gain.setValueAtTime(0.001, now);
      engineGain.gain.linearRampToValueAtTime(0.12 * volScale, now + 0.12);
      engineGain.gain.exponentialRampToValueAtTime(0.001, now + 1.15);

      lfo.connect(lfoGain);
      lfoGain.connect(engineGain.gain);
      buzz.connect(lp);
      subBuzz.connect(lp);
      lp.connect(engineGain);
      engineGain.connect(dry);
      engineGain.connect(wet);

      lfo.start(now);
      buzz.start(now);
      subBuzz.start(now);
      lfo.stop(now + 1.18);
      buzz.stop(now + 1.18);
      subBuzz.stop(now + 1.18);
      return;
    }

    if (profile === 'airstrike') {
      // Tactical strike jet flyover spool-up with twin afterburner roar
      const dur = 1.45;
      const jetSrc = ctx.createBufferSource();
      jetSrc.buffer = this.createPinkNoiseBuffer(ctx, dur);

      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(420, now);
      bp.frequency.exponentialRampToValueAtTime(1380, now + 0.45);
      bp.frequency.exponentialRampToValueAtTime(340, now + dur);
      bp.Q.value = 0.7;

      const shaper = ctx.createWaveShaper();
      shaper.curve = this.getSaturationCurve();

      const jetGain = ctx.createGain();
      jetGain.gain.setValueAtTime(0.01, now);
      jetGain.gain.linearRampToValueAtTime(0.32 * volScale, now + 0.28);
      jetGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

      jetSrc.connect(bp);
      bp.connect(shaper);
      shaper.connect(jetGain);
      jetGain.connect(dry);
      jetGain.connect(wet);
      jetSrc.start(now);
      return;
    }

    if (profile === 'kab') {
      // Aerodynamic glide bomb release whistle + rushing air
      const dur = 0.85;
      const airSrc = ctx.createBufferSource();
      airSrc.buffer = this.createPinkNoiseBuffer(ctx, dur);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1100, now);
      bp.frequency.exponentialRampToValueAtTime(380, now + dur);
      bp.Q.value = 1.6;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.18 * volScale, now + 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
      airSrc.connect(bp);
      bp.connect(gain);
      gain.connect(dry);
      gain.connect(wet);
      airSrc.start(now);
      return;
    }

    // Missile / Jet launch: cold-launch canister thump + turbulent rocket exhaust plume
    const dur = profile === 'ballistic' ? 1.35 : 0.95;

    const thump = ctx.createOscillator();
    const thumpGain = ctx.createGain();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(115, now);
    thump.frequency.exponentialRampToValueAtTime(30, now + 0.24);
    thumpGain.gain.setValueAtTime(0.32 * volScale, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
    thump.connect(thumpGain);
    thumpGain.connect(dry);
    thumpGain.connect(wet);
    thump.start(now);
    thump.stop(now + 0.28);

    const roarSrc = ctx.createBufferSource();
    roarSrc.buffer = this.createPinkNoiseBuffer(ctx, dur);

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(profile === 'ballistic' ? 540 : 880, now);
    bp.frequency.exponentialRampToValueAtTime(190, now + dur);
    bp.Q.value = 0.75;

    const shaper = ctx.createWaveShaper();
    shaper.curve = this.getSaturationCurve();

    const roarGain = ctx.createGain();
    roarGain.gain.setValueAtTime(0.01, now);
    roarGain.gain.linearRampToValueAtTime(
      (profile === 'ballistic' ? 0.36 : 0.26) * volScale,
      now + 0.05,
    );
    roarGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    roarSrc.connect(bp);
    bp.connect(shaper);
    shaper.connect(roarGain);
    roarGain.connect(dry);
    roarGain.connect(wet);
    roarSrc.start(now);
  }

  playBombDrop() {
    if (this.missileVolume <= 0.005) return;
    const g = this.ensureGraph();
    if (!g) return;
    const { ctx, dry } = g;
    const wet = this.reverbNode!;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(640, now);
    osc.frequency.exponentialRampToValueAtTime(240, now + 0.34);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.065 * this.missileVolume, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);

    osc.connect(gain);
    gain.connect(dry);
    gain.connect(wet);
    osc.start(now);
    osc.stop(now + 0.38);
  }

  playSamLaunch(isGun: boolean, isSmallBullet = false) {
    const g = this.ensureGraph();
    if (!g) return;
    const { ctx, dry } = g;
    const wet = this.reverbNode!;
    const now = ctx.currentTime;
    const vol = Math.max(0.2, this.missileVolume);

    if (isGun && isSmallBullet) {
      // Realistic 12.7mm DShK / M2 Browning 3-round pickup burst: sharp supersonic crack + breech punch
      for (let i = 0; i < 3; i++) {
        const t = now + i * 0.058;
        const crack = ctx.createBufferSource();
        crack.buffer = this.createWhiteNoiseBuffer(ctx, 0.052);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(2200, t);
        bp.frequency.exponentialRampToValueAtTime(520, t + 0.048);
        bp.Q.value = 0.85;
        const sg = ctx.createGain();
        sg.gain.setValueAtTime(0.18 * vol, t);
        sg.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        crack.connect(bp);
        bp.connect(sg);
        sg.connect(dry);
        sg.connect(wet);
        crack.start(t);

        const thump = ctx.createOscillator();
        const tg = ctx.createGain();
        thump.type = 'triangle';
        thump.frequency.setValueAtTime(185, t);
        thump.frequency.exponentialRampToValueAtTime(62, t + 0.036);
        tg.gain.setValueAtTime(0.12 * vol, t);
        tg.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
        thump.connect(tg);
        tg.connect(dry);
        thump.start(t);
        thump.stop(t + 0.045);
      }
      return;
    }

    if (isGun) {
      // Realistic Gepard twin-35mm KDA autocannon salvo: deep chesty muzzle bark + supersonic whip
      for (let i = 0; i < 4; i++) {
        const t = now + i * 0.072;
        const blast = ctx.createBufferSource();
        blast.buffer = this.createPinkNoiseBuffer(ctx, 0.11);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(1180, t);
        bp.frequency.exponentialRampToValueAtTime(210, t + 0.1);
        bp.Q.value = 0.72;
        const sg = ctx.createGain();
        sg.gain.setValueAtTime(0.28 * vol, t);
        sg.gain.exponentialRampToValueAtTime(0.001, t + 0.105);
        blast.connect(bp);
        bp.connect(sg);
        sg.connect(dry);
        sg.connect(wet);
        blast.start(t);

        const punch = ctx.createOscillator();
        const pg = ctx.createGain();
        punch.type = 'sine';
        punch.frequency.setValueAtTime(145, t);
        punch.frequency.exponentialRampToValueAtTime(38, t + 0.068);
        pg.gain.setValueAtTime(0.26 * vol, t);
        pg.gain.exponentialRampToValueAtTime(0.001, t + 0.072);
        punch.connect(pg);
        pg.connect(dry);
        pg.connect(wet);
        punch.start(t);
        punch.stop(t + 0.078);
      }
      return;
    }

    // Realistic SAM launch: pressurized gas-generator canister pop -> solid-fuel rocket ignition roar
    const pop = ctx.createOscillator();
    const popGain = ctx.createGain();
    pop.type = 'sine';
    pop.frequency.setValueAtTime(102, now);
    pop.frequency.exponentialRampToValueAtTime(28, now + 0.18);
    popGain.gain.setValueAtTime(0.32 * vol, now);
    popGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    pop.connect(popGain);
    popGain.connect(dry);
    popGain.connect(wet);
    pop.start(now);
    pop.stop(now + 0.21);

    const ignStart = now + 0.032;
    const ignDur = 0.78;
    const rocketNoise = ctx.createBufferSource();
    rocketNoise.buffer = this.createPinkNoiseBuffer(ctx, ignDur);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1750, ignStart);
    bp.frequency.exponentialRampToValueAtTime(360, ignStart + ignDur);
    bp.Q.value = 0.65;

    const shaper = ctx.createWaveShaper();
    shaper.curve = this.getSaturationCurve();

    const rocketGain = ctx.createGain();
    rocketGain.gain.setValueAtTime(0.005, ignStart);
    rocketGain.gain.linearRampToValueAtTime(0.34 * vol, ignStart + 0.035);
    rocketGain.gain.exponentialRampToValueAtTime(0.001, ignStart + ignDur);

    rocketNoise.connect(bp);
    bp.connect(shaper);
    shaper.connect(rocketGain);
    rocketGain.connect(dry);
    rocketGain.connect(wet);
    rocketNoise.start(ignStart);

    // Throaty low-end booster combustion rumble
    const subNoise = ctx.createBufferSource();
    subNoise.buffer = this.createBrownNoiseBuffer(ctx, 0.7);
    const subLp = ctx.createBiquadFilter();
    subLp.type = 'lowpass';
    subLp.frequency.setValueAtTime(340, ignStart);
    subLp.frequency.exponentialRampToValueAtTime(110, ignStart + 0.68);
    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.01, ignStart);
    subGain.gain.linearRampToValueAtTime(0.28 * vol, ignStart + 0.04);
    subGain.gain.exponentialRampToValueAtTime(0.001, ignStart + 0.7);
    subNoise.connect(subLp);
    subLp.connect(subGain);
    subGain.connect(dry);
    subGain.connect(wet);
    subNoise.start(ignStart);
  }

  playAirIntercept(isDrone = false, isGun = false) {
    const g = this.ensureGraph();
    if (!g) return;
    const { ctx, dry } = g;
    const wet = this.reverbNode!;
    const now = ctx.currentTime;
    const vol = Math.max(0.22, this.missileVolume);

    const shaper = ctx.createWaveShaper();
    shaper.curve = this.getSaturationCurve();
    shaper.oversample = '2x';
    shaper.connect(dry);
    shaper.connect(wet);

    // 1. Sharp mid-air proximity-warhead double snap (no synthetic oscillator clang)
    const crack = ctx.createBufferSource();
    crack.buffer = this.createWhiteNoiseBuffer(ctx, 0.18);
    const crackBp = ctx.createBiquadFilter();
    crackBp.type = 'bandpass';
    crackBp.frequency.setValueAtTime(isGun ? 2450 : 2100, now);
    crackBp.frequency.exponentialRampToValueAtTime(310, now + 0.17);
    crackBp.Q.value = 0.72;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime((isGun ? 0.36 : 0.48) * vol, now);
    cg.gain.exponentialRampToValueAtTime(0.001, now + 0.175);
    crack.connect(crackBp);
    crackBp.connect(cg);
    cg.connect(shaper);
    crack.start(now);

    // 2. Concussive outdoor sky pressure boom (target warhead / fuel tank cook-off)
    const pop = ctx.createOscillator();
    const pg = ctx.createGain();
    pop.type = 'sine';
    pop.frequency.setValueAtTime(isDrone ? 118 : 94, now);
    pop.frequency.exponentialRampToValueAtTime(24, now + 0.34);
    pg.gain.setValueAtTime((isDrone ? 0.38 : 0.48) * vol, now);
    pg.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
    pop.connect(pg);
    pg.connect(shaper);
    pop.start(now);
    pop.stop(now + 0.38);

    // 3. Broadband airburst blast & distant atmospheric rumble tail
    const blast = ctx.createBufferSource();
    blast.buffer = this.createBrownNoiseBuffer(ctx, 1.15);
    const blastLp = ctx.createBiquadFilter();
    blastLp.type = 'lowpass';
    blastLp.frequency.setValueAtTime(980, now);
    blastLp.frequency.exponentialRampToValueAtTime(110, now + 1.05);
    const blastGain = ctx.createGain();
    blastGain.gain.setValueAtTime(0.01, now);
    blastGain.gain.linearRampToValueAtTime((isDrone ? 0.32 : 0.42) * vol, now + 0.02);
    blastGain.gain.exponentialRampToValueAtTime(0.001, now + 1.14);
    blast.connect(blastLp);
    blastLp.connect(blastGain);
    blastGain.connect(wet);
    blastGain.connect(dry);
    blast.start(now);

    // 4. Fragmentation air-tear & falling debris scatter
    const shred = ctx.createBufferSource();
    shred.buffer = this.createPinkNoiseBuffer(ctx, 0.52);
    const shredBp = ctx.createBiquadFilter();
    shredBp.type = 'bandpass';
    shredBp.frequency.setValueAtTime(1450, now + 0.04);
    shredBp.frequency.exponentialRampToValueAtTime(280, now + 0.5);
    shredBp.Q.value = 1.1;
    const shredGain = ctx.createGain();
    shredGain.gain.setValueAtTime(0.001, now + 0.03);
    shredGain.gain.linearRampToValueAtTime(0.2 * vol, now + 0.06);
    shredGain.gain.exponentialRampToValueAtTime(0.001, now + 0.51);
    shred.connect(shredBp);
    shredBp.connect(shredGain);
    shredGain.connect(wet);
    shred.start(now + 0.03);
  }

  playExplosion(power = 1, isDrone = false) {
    const volScale = isDrone ? this.droneVolume : this.missileVolume;
    if (volScale <= 0.005) return;

    const g = this.ensureGraph();
    if (!g) return;
    const { ctx, dry } = g;
    const wet = this.reverbNode!;
    const now = ctx.currentTime;
    const dur = 2.25 + power * 0.95;

    const shaper = ctx.createWaveShaper();
    shaper.curve = this.getSaturationCurve();
    shaper.oversample = '2x';
    shaper.connect(dry);
    shaper.connect(wet);

    // 1. Instantaneous supersonic shock-front crack (0..100ms)
    const crackSrc = ctx.createBufferSource();
    crackSrc.buffer = this.createWhiteNoiseBuffer(ctx, 0.14);
    const crackFilter = ctx.createBiquadFilter();
    crackFilter.type = 'bandpass';
    crackFilter.frequency.setValueAtTime(2600, now);
    crackFilter.frequency.exponentialRampToValueAtTime(220, now + 0.12);
    crackFilter.Q.value = 0.6;
    const crackGain = ctx.createGain();
    crackGain.gain.setValueAtTime(Math.min(0.62, 0.46 * power) * volScale, now);
    crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    crackSrc.connect(crackFilter);
    crackFilter.connect(crackGain);
    crackGain.connect(shaper);
    crackSrc.start(now);

    // 2. Real-life seismic sub-bass blast pressure drop (78Hz -> 16Hz)
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(78, now);
    subOsc.frequency.exponentialRampToValueAtTime(16, now + 0.72);
    subGain.gain.setValueAtTime(Math.min(0.86, 0.64 * power) * volScale, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.78);
    subOsc.connect(subGain);
    subGain.connect(shaper);
    subOsc.start(now);
    subOsc.stop(now + 0.8);

    // 3. Heavy broadband high-explosive detonation body (layered brown + pink roar)
    const blastSrc = ctx.createBufferSource();
    blastSrc.buffer = this.createBrownNoiseBuffer(ctx, dur);
    const blastFilter = ctx.createBiquadFilter();
    blastFilter.type = 'lowpass';
    blastFilter.frequency.setValueAtTime(2150, now);
    blastFilter.frequency.exponentialRampToValueAtTime(78, now + dur * 0.78);
    blastFilter.Q.value = 0.65;

    const blastGain = ctx.createGain();
    blastGain.gain.setValueAtTime(0.04 * volScale, now);
    blastGain.gain.linearRampToValueAtTime(Math.min(0.82, 0.58 * power) * volScale, now + 0.015);
    blastGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    blastSrc.connect(blastFilter);
    blastFilter.connect(blastGain);
    blastGain.connect(shaper);
    blastSrc.start(now);

    // 4. Rolling horizon thunder & urban valley echo tail
    const rumbleSrc = ctx.createBufferSource();
    rumbleSrc.buffer = this.createPinkNoiseBuffer(ctx, dur * 1.4);
    const rumbleFilter = ctx.createBiquadFilter();
    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.setValueAtTime(640, now + 0.06);
    rumbleFilter.frequency.exponentialRampToValueAtTime(68, now + dur * 1.3);

    const rumbleGain = ctx.createGain();
    rumbleGain.gain.setValueAtTime(0.001, now);
    rumbleGain.gain.linearRampToValueAtTime(0.32 * power * volScale, now + 0.14);
    rumbleGain.gain.exponentialRampToValueAtTime(0.001, now + dur * 1.38);

    rumbleSrc.connect(rumbleFilter);
    rumbleFilter.connect(rumbleGain);
    rumbleGain.connect(wet);
    rumbleGain.connect(dry);
    rumbleSrc.start(now + 0.03);

    // 5. Realistic falling soil, masonry & shrapnel crackle echoes
    for (const [delay, freq] of [
      [0.21, 980],
      [0.44, 720],
      [0.72, 540],
    ] as const) {
      const debSrc = ctx.createBufferSource();
      debSrc.buffer = this.createPinkNoiseBuffer(ctx, 0.28);
      const debFilter = ctx.createBiquadFilter();
      debFilter.type = 'bandpass';
      debFilter.frequency.setValueAtTime(freq, now + delay);
      debFilter.frequency.exponentialRampToValueAtTime(190, now + delay + 0.25);
      debFilter.Q.value = 1.1;
      const debGain = ctx.createGain();
      debGain.gain.setValueAtTime(0.001, now + delay);
      debGain.gain.linearRampToValueAtTime(0.11 * Math.min(1.4, power) * volScale, now + delay + 0.022);
      debGain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.26);
      debSrc.connect(debFilter);
      debFilter.connect(debGain);
      debGain.connect(wet);
      debSrc.start(now + delay);
    }
  }
}

export const soundFx = new TacticalSoundEngine();
