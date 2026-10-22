/**
 * Run & Learn Racer 3D (런앤런 레이서 3D)
 * Procedural Web Audio API Retro Arcade & Synthwave Sound Engine
 * Works 100% offline with zero external audio file dependencies.
 */
(function (window) {
  'use strict';

  let _ctx = null;
  let _masterGain = null;
  let _sfxGain = null;
  let _bgmGain = null;
  let _muted = false;
  let _initialized = false;

  // BGM Sequencer State
  let _bgmTimer = null;
  let _bgmPlaying = false;
  let _bgmStage = 1;
  let _bgmIsBoss = false;
  let _bgmStep = 0;
  let _currentSpeedKmh = 110;

  // ============================================================================
  // 🎵 AUTHENTIC ROBLOX OBBY & CLASSIC ROBLOX SOUNDTRACK REFERENCE ENGINE
  // 1) Tobu - Candyland (The #1 Iconic Roblox Obby / Tycoon Anthem: Bm - G - D - A)
  // 2) BadLiZ - The Great Strategy (Official Classic Roblox Theme Song)
  // 3) Roblox Obby Boss Overdrive (Fast Melodic Electro-House Drop)
  // ============================================================================

  // Note frequency table (Hz)
  const N = {
    R: 0,
    G2: 98.00, A2: 110.00, Bb2: 116.54, B2: 123.47,
    C3: 130.81, Cs3: 138.59, D3: 146.83, Eb3: 155.56, E3: 164.81, F3: 174.61, Fs3: 185.00, G3: 196.00, Ab3: 207.65, A3: 220.00, Bb3: 233.08, B3: 246.94,
    C4: 261.63, Cs4: 277.18, D4: 293.66, Eb4: 311.13, E4: 329.63, F4: 349.23, Fs4: 369.99, G4: 392.00, Ab4: 415.30, A4: 440.00, Bb4: 466.16, B4: 493.88,
    C5: 523.25, Cs5: 554.37, D5: 587.33, Eb5: 622.25, E5: 659.25, F5: 698.46, Fs5: 739.99, G5: 783.99, Ab5: 830.61, A5: 880.00, Bb5: 932.33, B5: 987.77,
    C6: 1046.50, Cs6: 1108.73, D6: 1174.66, Eb6: 1244.51, E6: 1318.51, F6: 1396.91, Fs6: 1479.98, G6: 1567.98
  };

  // Roblox Obby Chord Progressions per Bar (8 bars = 128 sixteenth steps)
  // Bars 0..3: Tobu - Candyland (Bm - G - D - A)
  // Bars 4..7: Tobu - Candyland Climax + Classic Roblox "The Great Strategy" (Bm - G - D - A / E)
  const ROBLOX_CHORD_PROGRESSION = [
    { root: N.B2,  triad: [N.B4,  N.D5,  N.Fs5] }, // Bar 1: Bm
    { root: N.G2,  triad: [N.G4,  N.B4,  N.D5]  }, // Bar 2: G
    { root: N.D3,  triad: [N.D4,  N.Fs4, N.A4]  }, // Bar 3: D
    { root: N.A2,  triad: [N.A4,  N.Cs5, N.E5]  }, // Bar 4: A
    { root: N.B2,  triad: [N.B4,  N.D5,  N.Fs5] }, // Bar 5: Bm
    { root: N.G2,  triad: [N.G4,  N.B4,  N.D5]  }, // Bar 6: G
    { root: N.D3,  triad: [N.D4,  N.Fs4, N.A4]  }, // Bar 7: D
    { root: N.A2,  triad: [N.A4,  N.Cs5, N.E5]  }  // Bar 8: A
  ];

  const BOSS_CHORD_PROGRESSION = [
    { root: N.C3,  triad: [N.C5,  N.Eb5, N.G5]  }, // Cm (The Great Strategy)
    { root: N.Bb2, triad: [N.Bb4, N.D5,  N.F5]  }, // Bb
    { root: N.Ab3 * 0.5, triad: [N.Ab4, N.C5, N.Eb5] }, // Ab
    { root: N.G2,  triad: [N.G4,  N.B4,  N.D5]  }  // G
  ];

  // Track 1 (128 steps): Tobu - Candyland (Exact Iconic Roblox Obby Drop Melody!)
  const ROBLOX_CANDYLAND_MELODY = [
    // Bar 1 (Bm): B5 - A5 - E5 - F#5 - B5 - F#5 - B5 - G5
    N.B5,  N.R,   N.A5,  N.R,   N.E5,  N.R,   N.Fs5, N.R,
    N.B5,  N.R,   N.Fs5, N.R,   N.B5,  N.R,   N.G5,  N.R,
    // Bar 2 (G): F#5 - E5 - B4 - G5 - F#5 - B5 - B5 - C#6 - G5
    N.Fs5, N.R,   N.E5,  N.R,   N.B4,  N.R,   N.G5,  N.R,
    N.Fs5, N.R,   N.B5,  N.R,   N.B5,  N.Cs6, N.G5,  N.R,
    // Bar 3 (D): B5 - A5 - E5 - F#5 - B5 - F#5 - B5 - D6
    N.B5,  N.R,   N.A5,  N.R,   N.E5,  N.R,   N.Fs5, N.R,
    N.B5,  N.R,   N.Fs5, N.R,   N.B5,  N.R,   N.D6,  N.R,
    // Bar 4 (A): C#6 - A5 - E5 - A5 - B5 - A5 - F#5 - E5
    N.Cs6, N.R,   N.A5,  N.R,   N.E5,  N.R,   N.A5,  N.R,
    N.B5,  N.R,   N.A5,  N.R,   N.Fs5, N.R,   N.E5,  N.A5,

    // Bar 5 (Bm - High Energy Variation): B5 - D6 - A5 - F#5 - B5 - F#5 - B5 - G5
    N.B5,  N.D6,  N.A5,  N.R,   N.E5,  N.R,   N.Fs5, N.R,
    N.B5,  N.R,   N.Fs5, N.R,   N.B5,  N.Cs6, N.G5,  N.R,
    // Bar 6 (G): F#5 - E5 - B4 - G5 - F#5 - B5 - C#6 - D6
    N.Fs5, N.R,   N.E5,  N.R,   N.B4,  N.D5,  N.G5,  N.R,
    N.Fs5, N.R,   N.B5,  N.R,   N.Cs6, N.R,   N.D6,  N.R,
    // Bar 7 (D): F#6 - E6 - D6 - B5 - A5 - F#5 - A5 - D6
    N.Fs6, N.R,   N.E6,  N.R,   N.D6,  N.R,   N.B5,  N.R,
    N.A5,  N.R,   N.Fs5, N.R,   N.A5,  N.R,   N.D6,  N.R,
    // Bar 8 (A): C#6 - B5 - A5 - E5 - F#5 - A5 - B5 - C#6!
    N.Cs6, N.R,   N.B5,  N.R,   N.A5,  N.R,   N.E5,  N.R,
    N.Fs5, N.G5,  N.A5,  N.B5,  N.Cs6, N.D6,  N.E6,  N.Fs6
  ];

  // Track 2 (64 steps): BadLiZ - "The Great Strategy" (Classic Roblox Anthem + Boss Theme!)
  const ROBLOX_GREAT_STRATEGY_MELODY = [
    // Bar 1 (Cm): Iconic Classic Roblox Synth Lead
    N.C5,  N.D5,  N.Eb5, N.G5,  N.C6,  N.R,   N.B5,  N.C6,
    N.G5,  N.R,   N.Ab5, N.G5,  N.F5,  N.Eb5, N.D5,  N.G5,
    // Bar 2 (Bb):
    N.Bb4, N.C5,  N.D5,  N.F5,  N.Bb5, N.R,   N.A5,  N.Bb5,
    N.F5,  N.R,   N.G5,  N.F5,  N.Eb5, N.D5,  N.C5,  N.F5,
    // Bar 3 (Ab):
    N.Ab4, N.Bb4, N.C5,  N.Eb5, N.Ab5, N.R,   N.G5,  N.Ab5,
    N.Eb5, N.R,   N.C6,  N.Bb5, N.Ab5, N.G5,  N.F5,  N.Eb5,
    // Bar 4 (G):
    N.G5,  N.R,   N.B5,  N.R,   N.D6,  N.R,   N.G6,  N.F6,
    N.Eb6, N.D6,  N.C6,  N.B5,  N.C6,  N.D6,  N.Eb6, N.G6
  ];

  function ensureContext() {
    if (_muted) return null;
    try {
      if (!_ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;
        _ctx = new AudioCtx();

        _masterGain = _ctx.createGain();
        _masterGain.gain.value = _muted ? 0 : 0.7;
        _masterGain.connect(_ctx.destination);

        _sfxGain = _ctx.createGain();
        _sfxGain.gain.value = 0.85;
        _sfxGain.connect(_masterGain);

        _bgmGain = _ctx.createGain();
        _bgmGain.gain.value = 0.28;
        _bgmGain.connect(_masterGain);

        _initialized = true;
      }
      if (_ctx && _ctx.state === 'suspended') {
        _ctx.resume().catch(function () {});
      }
    } catch (e) {
      // Ignore autoplay or headless audio restrictions
    }
    return _ctx;
  }

  /**
   * Helper to schedule a clean synthesizer tone with envelope
   */
  function playTone(freq, type, duration, startTimeOffset, volume, endFreq, targetNode) {
    const ctx = ensureContext();
    if (!ctx || _muted) return;

    try {
      const now = ctx.currentTime + (startTimeOffset || 0);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type || 'sawtooth';
      osc.frequency.setValueAtTime(Math.max(20, freq), now);
      if (endFreq && endFreq > 20) {
        osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);
      }

      const peakVol = Math.min(1.0, Math.max(0.001, volume || 0.25));
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(peakVol, now + Math.min(0.015, duration * 0.2));
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc.connect(gain);
      gain.connect(targetNode || _sfxGain || ctx.destination);

      osc.start(now);
      osc.stop(now + duration + 0.02);
    } catch (e) {
      // Safe fallback
    }
  }

  /**
   * Helper to generate a burst of filtered white noise (explosions, hits, snares)
   */
  function playNoiseBurst(duration, startTimeOffset, volume, filterFreq, targetNode) {
    const ctx = ensureContext();
    if (!ctx || _muted) return;

    try {
      const now = ctx.currentTime + (startTimeOffset || 0);
      const bufferSize = Math.max(256, Math.floor(ctx.sampleRate * duration));
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(filterFreq || 1200, now);
      filter.frequency.exponentialRampToValueAtTime(120, now + duration);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume || 0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(targetNode || _sfxGain || ctx.destination);

      noise.start(now);
      noise.stop(now + duration + 0.02);
    } catch (e) {
      // Safe fallback
    }
  }

  /**
   * Multi-oscillator detuned Supersaw + Pluck synth for authentic Tobu Candyland / Roblox Obby lead!
   */
  function playRobloxSupersaw(freq, duration, volume) {
    const ctx = ensureContext();
    if (!ctx || _muted || !freq || freq <= 20) return;

    try {
      const now = ctx.currentTime;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      // Snappy EDM pluck filter envelope (bright attack -> warm body)
      filter.frequency.setValueAtTime(Math.min(7200, freq * 6.5), now);
      filter.frequency.exponentialRampToValueAtTime(Math.max(1200, freq * 2.4), now + duration);

      const envGain = ctx.createGain();
      const peak = Math.min(0.45, Math.max(0.01, volume || 0.22));
      envGain.gain.setValueAtTime(0.0001, now);
      envGain.gain.linearRampToValueAtTime(peak, now + 0.008);
      envGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      filter.connect(envGain);
      envGain.connect(_bgmGain || ctx.destination);

      // 3 detuned oscillators (Left Saw, Right Saw, Center Square/Triangle)
      const detunes = [-11, 11, 0];
      const types = ['sawtooth', 'sawtooth', 'square'];
      const mults = [1.0, 1.0, 0.5];

      for (let i = 0; i < 3; i++) {
        const osc = ctx.createOscillator();
        osc.type = types[i];
        osc.frequency.setValueAtTime(freq * mults[i], now);
        osc.detune.setValueAtTime(detunes[i], now);
        osc.connect(filter);
        osc.start(now);
        osc.stop(now + duration + 0.02);
      }
    } catch (e) {
      // Safe fallback
    }
  }

  function scheduleNextBGMStep() {
    if (!_bgmPlaying) return;

    // Authentic Roblox Obby 128~136 BPM 16th-note groove!
    const clampedSpeed = Math.max(25, Math.min(120, _currentSpeedKmh || 36));
    const tempoFactor = 1 + (clampedSpeed - 36) / 420;
    const baseStepMs = _bgmIsBoss ? 104 : 115; // ~130 BPM 16th notes
    const stepMs = Math.max(85, Math.round(baseStepMs / tempoFactor));
    const stepSec = stepMs / 1000;

    if (!_muted && _ctx && _ctx.state === 'running') {
      const barIdx = Math.floor(_bgmStep / 16) % 8;
      const step16 = _bgmStep % 16;

      // Alternate between Tobu - Candyland (Stages 1,2,4) & Classic Roblox "The Great Strategy" (Boss & Stage 3)
      const useGreatStrategy = _bgmIsBoss || ((_bgmStage % 3 === 0) && (_bgmStep >= 64));
      const chordObj = useGreatStrategy
        ? BOSS_CHORD_PROGRESSION[barIdx % BOSS_CHORD_PROGRESSION.length]
        : ROBLOX_CHORD_PROGRESSION[barIdx % ROBLOX_CHORD_PROGRESSION.length];

      // Slight key transposition per stage so higher stages feel fresh while keeping the exact Roblox melody
      const stageSemitone = (_bgmIsBoss || _bgmStage % 2 === 1) ? 1.0 : 1.059463; // Original key or +1 semitone
      const rootFreq = chordObj.root * stageSemitone;

      // 1. Bouncy Roblox EDM Sidechain Bassline (Pumping off-beat octave bass)
      if (step16 % 2 === 0) {
        const isOffbeat = (step16 % 4 === 2);
        const bassFreq = rootFreq * (isOffbeat ? 2.0 : 1.0);
        playTone(
          bassFreq,
          'sawtooth',
          stepSec * (isOffbeat ? 1.55 : 0.85),
          0,
          isOffbeat ? 0.24 : 0.19,
          bassFreq * 0.995,
          _bgmGain
        );
      }

      // 2. Tobu Candyland / Roblox Obby Off-Beat Pluck Chords (Sidechain Pump on steps 2, 6, 10, 14 + syncopation on 15)
      if (step16 === 2 || step16 === 6 || step16 === 10 || step16 === 14 || step16 === 12) {
        const triad = chordObj.triad;
        for (let c = 0; c < triad.length; c++) {
          playTone(
            triad[c] * stageSemitone,
            'triangle',
            stepSec * 1.4,
            0,
            0.095,
            triad[c] * stageSemitone,
            _bgmGain
          );
        }
      }

      // 3. Sparkling Background Roblox Obby Synth Arpeggio
      const arpNote = chordObj.triad[_bgmStep % chordObj.triad.length] * stageSemitone;
      playTone(
        arpNote,
        'sine',
        stepSec * 0.75,
        0,
        0.08,
        arpNote,
        _bgmGain
      );

      // 4. Iconic Roblox Lead Melody (Tobu - Candyland / BadLiZ - The Great Strategy)
      const rawLeadFreq = useGreatStrategy
        ? ROBLOX_GREAT_STRATEGY_MELODY[_bgmStep % ROBLOX_GREAT_STRATEGY_MELODY.length]
        : ROBLOX_CANDYLAND_MELODY[_bgmStep % ROBLOX_CANDYLAND_MELODY.length];

      if (rawLeadFreq && rawLeadFreq > 0) {
        const leadFreq = rawLeadFreq * stageSemitone;
        playRobloxSupersaw(leadFreq, stepSec * 1.85, 0.22);
      }

      // 5. Crisp 4-on-the-floor Roblox EDM Obby Drum Groove (Kick + Clap/Snare + Open Hat)
      if (step16 === 0 || step16 === 4 || step16 === 8 || step16 === 12 || (_bgmIsBoss && step16 === 14)) {
        // Punchy EDM Kick Drum
        playTone(150, 'sine', 0.095, 0, 0.40, 38, _bgmGain);
      }
      if (step16 === 4 || step16 === 12) {
        // Crisp EDM Clap / Snare on beats 2 & 4
        playTone(230, 'triangle', 0.065, 0, 0.22, 95, _bgmGain);
        playNoiseBurst(0.075, 0, 0.16, 3800, _bgmGain);
      } else if (step16 % 4 === 2) {
        // Upbeat Open Hi-Hat on off-beats (2, 6, 10, 14)
        playNoiseBurst(0.045, 0, 0.09, 7200, _bgmGain);
      } else if (step16 % 2 === 1) {
        // Light 16th closed hi-hat tick
        playNoiseBurst(0.02, 0, 0.035, 8500, _bgmGain);
      }
    }

    _bgmStep = (_bgmStep + 1) % 128;
    _bgmTimer = window.setTimeout(scheduleNextBGMStep, stepMs);
  }

  const SoundEngine = {
    /**
     * Initializes Web Audio API context. Safe to call on any user interaction.
     */
    init: function () {
      ensureContext();
      return _initialized;
    },

    /**
     * Sets mute state and updates master gain immediately.
     * @param {boolean} muted
     * @returns {boolean}
     */
    setMuted: function (muted) {
      _muted = Boolean(muted);
      if (_masterGain && _ctx) {
        try {
          _masterGain.gain.setValueAtTime(_muted ? 0 : 0.7, _ctx.currentTime);
        } catch (e) {}
      }
      return _muted;
    },

    /**
     * Toggles mute state and returns the new state (true = muted).
     * @returns {boolean}
     */
    toggleMute: function () {
      return this.setMuted(!_muted);
    },

    /**
     * Returns whether sound is currently muted.
     * @returns {boolean}
     */
    isMuted: function () {
      return _muted;
    },

    /**
     * Crisp futuristic whoosh when switching lanes (Left / Center / Right).
     */
    playLaneSwitch: function () {
      playTone(260, 'sine', 0.08, 0, 0.22, 540);
      playTone(420, 'triangle', 0.06, 0.02, 0.14, 680);
    },

    /**
     * Bouncy Roblox Obby spring jump sound when Soyun leaps over lava hurdles!
     */
    playJump: function () {
      playTone(240, 'sine', 0.14, 0, 0.32, 720);
      playTone(360, 'triangle', 0.16, 0.03, 0.26, 980);
    },

    /**
     * Punchy Roblox Block-Smash + Robux Coin Ding + Rising Synth Chord!
     * Pitch scales up slightly with higher combo streaks!
     * @param {number} [combo=1]
     */
    playCorrect: function (combo) {
      const c = Math.min(12, Math.max(0, parseInt(combo, 10) || 1));
      const pitchShift = Math.pow(1.03, c);

      // 1. Crisp arcade block-shatter punch (low thump + noise crunch)
      playTone(155, 'square', 0.08, 0, 0.34, 58);
      playNoiseBurst(0.08, 0, 0.28, 2400);

      // 2. Bright Roblox Robux Coin Collect Ding (B5 -> E6 crisp bell)
      playTone(987.77 * pitchShift, 'sine', 0.09, 0.02, 0.34);
      playTone(1318.51 * pitchShift, 'sine', 0.22, 0.08, 0.38);

      // 3. Uplifting arcade synth arpeggio chord
      playTone(523.25 * pitchShift, 'triangle', 0.11, 0.01, 0.28);   // C5
      playTone(659.25 * pitchShift, 'triangle', 0.11, 0.07, 0.28);   // E5
      playTone(783.99 * pitchShift, 'triangle', 0.14, 0.13, 0.30);   // G5
      playTone(1046.5 * pitchShift, 'triangle', 0.24, 0.19, 0.34);   // C6
    },

    /**
     * Classic funny blocky "OOF / Boing" low thud + hazard buzz when hitting a wrong gate.
     */
    playWrong: function () {
      // Heavy low thud
      playTone(140, 'sine', 0.16, 0, 0.42, 45);
      // Funny blocky "OOF" pitch-bend + boing
      playTone(260, 'sawtooth', 0.16, 0, 0.35, 115);
      playTone(155, 'square', 0.26, 0.11, 0.36, 78);
      playTone(190, 'triangle', 0.18, 0.05, 0.26, 95);
      // Hazard impact crunch
      playNoiseBurst(0.24, 0, 0.32, 950);
    },

    /**
     * Dramatic siren warning when the stage boss appears!
     */
    playBossWarning: function () {
      for (let i = 0; i < 3; i++) {
        const offset = i * 0.28;
        playTone(320, 'sawtooth', 0.14, offset, 0.3, 640);
        playTone(640, 'sawtooth', 0.14, offset + 0.14, 0.3, 320);
      }
    },

    /**
     * Heavy bomb/missile cannon launch whoosh + whistle fired at the boss on a correct answer!
     */
    playLaserShot: function () {
      // Sub-bass cannon launch kick
      playTone(210, 'sine', 0.16, 0, 0.42, 48);
      // Missile thruster ignition noise + flying bomb whistle arc
      playNoiseBurst(0.14, 0, 0.28, 3200);
      playTone(520, 'sawtooth', 0.28, 0.02, 0.30, 1280);
      playTone(1350, 'triangle', 0.18, 0.14, 0.28, 220);
    },

    /**
     * Massive bomb explosion + block smash when the bomb slams into the boss!
     */
    playBossHit: function () {
      // Deep bomb explosion boom + shockwave crunch
      playNoiseBurst(0.38, 0, 0.50, 2400);
      playTone(165, 'sine', 0.32, 0, 0.48, 28);
      playTone(125, 'sawtooth', 0.30, 0.02, 0.42, 30);
      playTone(90, 'square', 0.26, 0.04, 0.38, 26);
      // Metallic hit marker ding
      playTone(680, 'triangle', 0.12, 0.05, 0.28, 1120);
      playTone(1020, 'sine', 0.16, 0.10, 0.32, 1360);
    },

    /**
     * Massive celebratory explosion + fanfare when a boss is defeated!
     */
    playBossDefeat: function () {
      playNoiseBurst(0.55, 0, 0.45, 2200);
      playTone(140, 'sawtooth', 0.45, 0, 0.4, 32);
      // Victory fanfare arpeggio
      const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5];
      for (let i = 0; i < notes.length; i++) {
        playTone(notes[i], 'triangle', 0.16, 0.18 + i * 0.09, 0.32);
      }
    },

    /**
     * Celebratory fanfare when clearing a stage and advancing to the next stage.
     */
    playStageClear: function () {
      const fanfare = [
        { f: 523.25, t: 0.0, d: 0.12 },
        { f: 659.25, t: 0.11, d: 0.12 },
        { f: 783.99, t: 0.22, d: 0.12 },
        { f: 1046.5, t: 0.34, d: 0.32 }
      ];
      for (let i = 0; i < fanfare.length; i++) {
        const n = fanfare[i];
        playTone(n.f, 'triangle', n.d, n.t, 0.32);
        playTone(n.f * 0.5, 'sine', n.d, n.t, 0.2);
      }
    },

    /**
     * UI button click feedback
     */
    playClick: function () {
      playTone(660, 'sine', 0.05, 0, 0.18, 880);
    },

    /**
     * Game over / HP depleted sound
     */
    playGameOver: function () {
      const notes = [392.0, 349.23, 329.63, 261.63];
      for (let i = 0; i < notes.length; i++) {
        playTone(notes[i], 'sawtooth', 0.22, i * 0.18, 0.28, notes[i] * 0.96);
      }
    },

    /**
     * Starts procedural synthwave BGM for the given stage and boss state.
     * @param {number} [stage=1]
     * @param {boolean} [isBoss=false]
     */
    startBGM: function (stage, isBoss) {
      ensureContext();
      _bgmStage = Math.max(1, parseInt(stage, 10) || 1);
      _bgmIsBoss = Boolean(isBoss);

      if (_bgmPlaying) {
        return;
      }
      _bgmPlaying = true;
      _bgmStep = 0;
      scheduleNextBGMStep();
    },

    /**
     * Stops procedural BGM playback.
     */
    stopBGM: function () {
      _bgmPlaying = false;
      if (_bgmTimer) {
        window.clearTimeout(_bgmTimer);
        _bgmTimer = null;
      }
    },

    /**
     * Updates the BGM tempo dynamically based on the player's current speed (km/h).
     * @param {number} speedKmh
     */
    setSpeedTempo: function (speedKmh) {
      if (typeof speedKmh === 'number' && !isNaN(speedKmh)) {
        _currentSpeedKmh = Math.max(80, Math.min(400, speedKmh));
      }
    }
  };

  window.SoundEngine = SoundEngine;
})(window);
