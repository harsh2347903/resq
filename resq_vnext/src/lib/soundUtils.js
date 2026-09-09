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
 * Plays an authentic, high-urgency Emergency Disaster Siren
 * Dual oscillator with frequency sweep and harmonic distortion
 * Simulates real-world outdoor warning / air-raid sirens
 */
export function playCrisisSiren(duration = 2.4) {
  if (soundMuted || typeof window === 'undefined') return;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();

    const now = ctx.currentTime;
    
    // Primary siren oscillator (sweep)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sawtooth';

    // Harmonic richness oscillator
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';

    // Sub-rumble oscillator for deep presence
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(110, now);

    // Master gain
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.24, now);

    // Dynamic siren pitch envelope:
    // Cycle 1: rise from 520Hz to 940Hz, fall to 620Hz
    // Cycle 2: rise to 980Hz, fall to 540Hz
    const half = duration / 2;
    const q1 = duration * 0.25;
    const q3 = duration * 0.75;

    osc1.frequency.setValueAtTime(520, now);
    osc1.frequency.exponentialRampToValueAtTime(940, now + q1);
    osc1.frequency.exponentialRampToValueAtTime(600, now + half);
    osc1.frequency.exponentialRampToValueAtTime(980, now + q3);
    osc1.frequency.exponentialRampToValueAtTime(480, now + duration);

    // Second oscillator slightly detuned for chorus thickness
    osc2.frequency.setValueAtTime(523, now);
    osc2.frequency.exponentialRampToValueAtTime(945, now + q1);
    osc2.frequency.exponentialRampToValueAtTime(604, now + half);
    osc2.frequency.exponentialRampToValueAtTime(985, now + q3);
    osc2.frequency.exponentialRampToValueAtTime(483, now + duration);

    // Envelope for gains
    gain1.gain.setValueAtTime(0.20, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + duration);

    gain2.gain.setValueAtTime(0.24, now);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + duration);

    subGain.gain.setValueAtTime(0.09, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    // Connect nodes
    osc1.connect(gain1);
    osc2.connect(gain2);
    subOsc.connect(subGain);

    gain1.connect(masterGain);
    gain2.connect(masterGain);
    subGain.connect(masterGain);

    masterGain.connect(ctx.destination);

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
 * Continuous looping siren wail
 */
export function startContinuousSiren() {
  if (soundMuted || typeof window === 'undefined') return;
  stopContinuousSiren();

  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();

    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const masterGain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(740, now); // Center pitch

    // LFO sweeps frequency between ~550Hz and 930Hz at 0.45 Hz (every ~2.2s)
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(0.45, now);
    lfoGain.gain.setValueAtTime(200, now);

    lfo.connect(osc.frequency);

    masterGain.gain.setValueAtTime(0.20, now);

    osc.connect(masterGain);
    masterGain.connect(ctx.destination);

    lfo.start(now);
    osc.start(now);

    activeSirenNodes = { osc, lfo, masterGain, ctx };
    window.dispatchEvent(new CustomEvent('resq:siren-state', { detail: { running: true } }));
  } catch (err) {
    console.warn('Continuous siren error:', err);
  }
}

export function stopContinuousSiren() {
  if (activeSirenNodes) {
    try {
      const { osc, lfo, masterGain, ctx } = activeSirenNodes;
      masterGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      setTimeout(() => {
        try {
          osc.stop();
          lfo.stop();
        } catch {}
      }, 350);
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
