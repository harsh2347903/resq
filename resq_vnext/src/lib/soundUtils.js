/**
 * RESQ Mission-Critical Sound, Haptics, and Voice Utilities
 * Uses 100% native Web Audio, Vibration, and Web Speech APIs (0 external dependencies).
 */

let audioCtx = null;
let soundMuted = false;

// Initialize or resume AudioContext on user interaction
function getAudioContext() {
  if (!audioCtx && typeof window !== 'undefined') {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

let activeSirenNodes = null;

export function isSoundMuted() {
  return soundMuted;
}

export function setSoundMuted(muted) {
  soundMuted = muted;
  if (muted) {
    stopContinuousSiren();
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('resq:sound-toggle', { detail: { muted } }));
  }
}

/**
 * Plays an authentic, high-urgency Emergency Disaster Siren burst
 * Multi-layer oscillator with compressor and piercing harmonics
 */
export function playCrisisSiren(duration = 3.0) {
  if (soundMuted || typeof window === 'undefined') return;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();

    const now = ctx.currentTime;

    // Studio Dynamics Compressor for maximum loud, punchy presence without clipping
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-8, now);
    compressor.knee.setValueAtTime(10, now);
    compressor.ratio.setValueAtTime(12, now);
    compressor.attack.setValueAtTime(0.002, now);
    compressor.release.setValueAtTime(0.12, now);
    compressor.connect(ctx.destination);

    // Master Gain (LOUD & HARD)
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.75, now);
    masterGain.connect(compressor);

    // Layer 1: Aggressive Sawtooth Screamer
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sawtooth';

    // Layer 2: Piercing Square Wave (cuts through speakers)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'square';

    // Layer 3: Heavy Sub-Octave Triangle Body
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = 'triangle';

    const q1 = duration * 0.3;
    const half = duration * 0.55;
    const q3 = duration * 0.8;

    // Pitch sweep: 600Hz -> 1180Hz -> 720Hz -> 1220Hz -> 540Hz
    osc1.frequency.setValueAtTime(600, now);
    osc1.frequency.exponentialRampToValueAtTime(1180, now + q1);
    osc1.frequency.exponentialRampToValueAtTime(720, now + half);
    osc1.frequency.exponentialRampToValueAtTime(1220, now + q3);
    osc1.frequency.exponentialRampToValueAtTime(540, now + duration);

    // Square wave detuned by +7Hz for mechanical siren acoustic warble
    osc2.frequency.setValueAtTime(607, now);
    osc2.frequency.exponentialRampToValueAtTime(1187, now + q1);
    osc2.frequency.exponentialRampToValueAtTime(727, now + half);
    osc2.frequency.exponentialRampToValueAtTime(1227, now + q3);
    osc2.frequency.exponentialRampToValueAtTime(547, now + duration);

    // Sub-octave (300Hz -> 590Hz)
    subOsc.frequency.setValueAtTime(300, now);
    subOsc.frequency.exponentialRampToValueAtTime(590, now + q1);
    subOsc.frequency.exponentialRampToValueAtTime(360, now + half);
    subOsc.frequency.exponentialRampToValueAtTime(610, now + q3);
    subOsc.frequency.exponentialRampToValueAtTime(270, now + duration);

    gain1.gain.setValueAtTime(0.55, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + duration);

    gain2.gain.setValueAtTime(0.35, now);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + duration);

    subGain.gain.setValueAtTime(0.40, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc1.connect(gain1);
    osc2.connect(gain2);
    subOsc.connect(subGain);

    gain1.connect(masterGain);
    gain2.connect(masterGain);
    subGain.connect(masterGain);

    osc1.start(now);
    osc2.start(now);
    subOsc.start(now);

    osc1.stop(now + duration + 0.05);
    osc2.stop(now + duration + 0.05);
    subOsc.stop(now + duration + 0.05);
  } catch (err) {
    console.warn('Web Audio crisis siren failed:', err);
  }
}

/**
 * Continuous LOUD & HARD Looping Emergency Air-Raid / Disaster Siren
 * Loops continuously until stopped or muted
 */
export function startContinuousSiren() {
  if (soundMuted || typeof window === 'undefined') return;
  stopContinuousSiren();

  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();

    const now = ctx.currentTime;

    // Compressor for maximum loud volume without distortion
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-8, now);
    compressor.knee.setValueAtTime(12, now);
    compressor.ratio.setValueAtTime(14, now);
    compressor.attack.setValueAtTime(0.002, now);
    compressor.release.setValueAtTime(0.1, now);
    compressor.connect(ctx.destination);

    // Master Gain for continuous siren (LOUD: 0.72)
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.72, now);
    masterGain.connect(compressor);

    // Primary screaming saw oscillator (center: 840Hz)
    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(840, now);

    // Piercing square oscillator (center: 848Hz)
    const osc2 = ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(848, now);

    // Deep sub-octave triangle (center: 420Hz)
    const subOsc = ctx.createOscillator();
    subOsc.type = 'triangle';
    subOsc.frequency.setValueAtTime(420, now);

    // Main Siren Wail LFO: Sweeps frequency up and down every ~2.4s (0.42 Hz)
    // Range: 840Hz ± 280Hz = 560Hz to 1120Hz!
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(0.42, now);

    const lfoGain1 = ctx.createGain();
    lfoGain1.gain.setValueAtTime(280, now);
    lfo.connect(lfoGain1);
    lfoGain1.connect(osc1.frequency);

    const lfoGain2 = ctx.createGain();
    lfoGain2.gain.setValueAtTime(285, now);
    lfo.connect(lfoGain2);
    lfoGain2.connect(osc2.frequency);

    const lfoGainSub = ctx.createGain();
    lfoGainSub.gain.setValueAtTime(140, now);
    lfo.connect(lfoGainSub);
    lfoGainSub.connect(subOsc.frequency);

    // Secondary Rotor Warble LFO: adds mechanical siren flutter (5.5 Hz)
    const warbleLfo = ctx.createOscillator();
    warbleLfo.type = 'sine';
    warbleLfo.frequency.setValueAtTime(5.5, now);
    const warbleGain = ctx.createGain();
    warbleGain.gain.setValueAtTime(18, now);
    warbleLfo.connect(warbleGain);
    warbleGain.connect(osc1.frequency);
    warbleGain.connect(osc2.frequency);

    // Layer gains
    const gain1 = ctx.createGain();
    gain1.gain.setValueAtTime(0.50, now);

    const gain2 = ctx.createGain();
    gain2.gain.setValueAtTime(0.35, now);

    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.38, now);

    osc1.connect(gain1);
    osc2.connect(gain2);
    subOsc.connect(subGain);

    gain1.connect(masterGain);
    gain2.connect(masterGain);
    subGain.connect(masterGain);

    lfo.start(now);
    warbleLfo.start(now);
    osc1.start(now);
    osc2.start(now);
    subOsc.start(now);

    activeSirenNodes = { osc1, osc2, subOsc, lfo, warbleLfo, masterGain, ctx };
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('resq:siren-state', { detail: { running: true } }));
    }
  } catch (err) {
    console.warn('Continuous siren error:', err);
  }
}

export function stopContinuousSiren() {
  if (activeSirenNodes) {
    try {
      const { osc1, osc2, subOsc, lfo, warbleLfo, masterGain, ctx } = activeSirenNodes;
      masterGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      setTimeout(() => {
        try {
          osc1?.stop();
          osc2?.stop();
          subOsc?.stop();
          lfo?.stop();
          warbleLfo?.stop();
        } catch {}
      }, 300);
    } catch {}
    activeSirenNodes = null;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('resq:siren-state', { detail: { running: false } }));
    }
  }
}

export function isSirenRunning() {
  return !!activeSirenNodes;
}

/**
 * Plays an emergency siren tone using native Web Audio API oscillators.
 * @param {'alarm' | 'chime' | 'warning'} type
 */
export function playEmergencyTone(type = 'alarm') {
  if (soundMuted || typeof window === 'undefined') return;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'alarm') {
      // Urgent two-tone crisis siren (850Hz <-> 620Hz)
      osc.type = 'sawtooth';
      gain.gain.setValueAtTime(0.12, now);

      osc.frequency.setValueAtTime(850, now);
      osc.frequency.linearRampToValueAtTime(620, now + 0.25);
      osc.frequency.linearRampToValueAtTime(850, now + 0.5);
      osc.frequency.linearRampToValueAtTime(620, now + 0.75);

      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
      osc.start(now);
      osc.stop(now + 0.95);
    } else if (type === 'warning') {
      // Official alert chime (tri-tone sequence)
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.15, now);

      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.setValueAtTime(880, now + 0.15); // A5
      osc.frequency.setValueAtTime(1174.66, now + 0.3); // D6

      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      osc.start(now);
      osc.stop(now + 0.6);
    } else {
      // Subtle confirmation beep
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.1, now);
      osc.frequency.setValueAtTime(750, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.22);
    }
  } catch (err) {
    console.warn('Web Audio playback failed or blocked by policy:', err);
  }
}

/**
 * Triggers native haptic vibration on mobile devices
 */
export function triggerHaptic(pattern = [200, 100, 200]) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch (e) {
      // Ignore vibration errors
    }
  }
}

/**
 * Native Web Speech Recognition for voice-to-text SOS
 */
export function createSpeechRecognizer({ onResult, onError, onStart, onEnd }) {
  if (typeof window === 'undefined') return null;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    return {
      supported: false,
      start: () => onError?.('Speech recognition is not supported in this browser. Please type directly.'),
      stop: () => {}
    };
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-IN'; // Standard Indian English, works well with bilingual names

  recognition.onstart = () => {
    onStart?.();
  };

  recognition.onresult = (event) => {
    let transcript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    if (transcript) {
      onResult?.(transcript);
    }
  };

  recognition.onerror = (event) => {
    onError?.(event.error === 'not-allowed' ? 'Microphone permission denied. Please allow microphone access.' : 'Voice recognition error. Please try again or type.');
  };

  recognition.onend = () => {
    onEnd?.();
  };

  return {
    supported: true,
    start: () => {
      try {
        recognition.start();
      } catch (err) {
        console.warn('Speech recognition start failed:', err);
      }
    },
    stop: () => {
      try {
        recognition.stop();
      } catch (err) {
        // Ignore stop errors
      }
    }
  };
}
