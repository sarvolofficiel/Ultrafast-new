export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private engineOscA: OscillatorNode | null = null;
  private engineOscB: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;

  private driftNoise: AudioBufferSourceNode | null = null;
  private driftFilter: BiquadFilterNode | null = null;
  private driftGain: GainNode | null = null;

  private muted = false;
  private initialized = false;
  private running = false;

  public unlock(): void {
    if (this.initialized) {
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : 0.35;
    this.masterGain.connect(this.ctx.destination);

    // Engine synth (retro pixel arcade dual-oscillator)
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 260;

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;

    this.engineOscA = this.ctx.createOscillator();
    this.engineOscA.type = 'sawtooth';
    this.engineOscA.frequency.value = 62;

    this.engineOscB = this.ctx.createOscillator();
    this.engineOscB.type = 'triangle';
    this.engineOscB.frequency.value = 93;

    this.engineOscA.connect(this.engineFilter);
    this.engineOscB.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.masterGain);

    this.engineOscA.start();
    this.engineOscB.start();

    // Drift tire noise buffer
    const bufferSize = this.ctx.sampleRate * 1.5;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    this.driftNoise = this.ctx.createBufferSource();
    this.driftNoise.buffer = noiseBuffer;
    this.driftNoise.loop = true;

    this.driftFilter = this.ctx.createBiquadFilter();
    this.driftFilter.type = 'bandpass';
    this.driftFilter.frequency.value = 1400;
    this.driftFilter.Q.value = 2.5;

    this.driftGain = this.ctx.createGain();
    this.driftGain.gain.value = 0;

    this.driftNoise.connect(this.driftFilter);
    this.driftFilter.connect(this.driftGain);
    this.driftGain.connect(this.masterGain);
    this.driftNoise.start();

    this.initialized = true;
    this.running = true;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        muted ? 0 : 0.35,
        this.ctx.currentTime,
        0.04,
      );
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public updateEngine(
    speedRatio: number,
    isDrifting: boolean,
    isBoosting: boolean,
    active: boolean,
  ): void {
    if (!this.initialized || !this.ctx || !this.running) return;
    const now = this.ctx.currentTime;

    if (!active) {
      this.engineGain?.gain.setTargetAtTime(0, now, 0.08);
      this.driftGain?.gain.setTargetAtTime(0, now, 0.06);
      return;
    }

    // Virtual 5-speed gear saw-tooth cadence
    const clamped = Math.max(0, Math.min(1.3, speedRatio));
    const gear = Math.min(5, Math.floor(clamped * 4.5) + 1);
    const gearMin = (gear - 1) / 4.5;
    const gearProgress = Math.max(0, Math.min(1, (clamped - gearMin) * 4.5));

    const baseFreq = 58 + gear * 12 + gearProgress * 68 + (isBoosting ? 35 : 0);
    this.engineOscA?.frequency.setTargetAtTime(baseFreq, now, 0.04);
    this.engineOscB?.frequency.setTargetAtTime(baseFreq * 1.5, now, 0.04);
    this.engineFilter?.frequency.setTargetAtTime(
      240 + clamped * 520 + (isBoosting ? 400 : 0),
      now,
      0.05,
    );
    this.engineGain?.gain.setTargetAtTime(0.16 + clamped * 0.08, now, 0.06);

    const targetDrift = isDrifting && clamped > 0.25 ? 0.14 : 0;
    this.driftGain?.gain.setTargetAtTime(targetDrift, now, 0.05);
  }

  public playCountdownBeep(isGo: boolean): void {
    if (!this.initialized || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(isGo ? 880 : 440, now);
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isGo ? 0.42 : 0.18));
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + (isGo ? 0.45 : 0.2));
  }

  public playBoost(): void {
    if (!this.initialized || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(760, now + 0.28);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.34);
  }

  public playJump(): void {
    if (!this.initialized || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(170, now);
    osc.frequency.exponentialRampToValueAtTime(520, now + 0.19);
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.21);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.22);
  }

  public playCollision(intensity = 1): void {
    if (!this.initialized || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.15);
    gain.gain.setValueAtTime(Math.min(0.32, 0.18 * intensity), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  public playLapChime(isFinal: boolean): void {
    if (!this.initialized || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const notes = isFinal ? [523.25, 659.25, 783.99, 1046.5] : [523.25, 659.25, 783.99];
    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      const t = now + idx * 0.085;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.16, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.24);
    });
  }

  public dispose(): void {
    this.running = false;
    try {
      this.engineOscA?.stop();
      this.engineOscB?.stop();
      this.driftNoise?.stop();
      if (this.ctx && this.ctx.state !== 'closed') {
        void this.ctx.close();
      }
    } catch {
      // ignore
    }
    this.initialized = false;
  }
}
