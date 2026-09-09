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

export function isSoundMuted() {
  return soundMuted;
}

export function setSoundMuted(muted) {
  soundMuted = muted;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('resq:sound-toggle', { detail: { muted } }));
  }
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
