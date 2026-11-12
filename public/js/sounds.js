/**
 * Tiny synthesised sound effects (Web Audio). No audio files, no downloads.
 * Muted state is remembered in localStorage.
 */
const STORAGE_KEY = 'chessuno:sound';

let context = null;
let enabled = true;

export function initSound() {
  try {
    enabled = localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    enabled = true;
  }
  return enabled;
}

export function isSoundEnabled() {
  return enabled;
}

export function setSoundEnabled(value) {
  enabled = Boolean(value);
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    /* ignore */
  }
}

/** Browsers require a user gesture before audio can start. */
export function unlockAudio() {
  if (!enabled) return;
  try {
    const ctx = getContext();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  } catch {
    /* ignore */
  }
}

function getContext() {
  if (!enabled) return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!context) context = new AudioContextClass();
  return context;
}

function tone({ frequency = 440, duration = 0.12, type = 'sine', gain = 0.06, delay = 0, glideTo = null }) {
  const ctx = getContext();
  if (!ctx) return;
  const start = ctx.currentTime + delay;
  const oscillator = ctx.createOscillator();
  const volume = ctx.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  if (glideTo) oscillator.frequency.exponentialRampToValueAtTime(glideTo, start + duration);

  volume.gain.setValueAtTime(0.0001, start);
  volume.gain.exponentialRampToValueAtTime(gain, start + 0.01);
  volume.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  oscillator.connect(volume).connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function noise({ duration = 0.16, gain = 0.05, delay = 0 }) {
  const ctx = getContext();
  if (!ctx) return;
  const frames = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** 2;
  }
  const source = ctx.createBufferSource();
  const volume = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 1200;
  volume.gain.value = gain;
  source.buffer = buffer;
  source.connect(filter).connect(volume).connect(ctx.destination);
  source.start(ctx.currentTime + delay);
}

export const sounds = {
  move() {
    tone({ frequency: 300, duration: 0.09, type: 'triangle', gain: 0.07 });
    noise({ duration: 0.05, gain: 0.02 });
  },
  capture() {
    tone({ frequency: 170, duration: 0.18, type: 'square', gain: 0.05, glideTo: 90 });
    noise({ duration: 0.2, gain: 0.05 });
  },
  card() {
    tone({ frequency: 520, duration: 0.12, type: 'triangle', gain: 0.05, glideTo: 900 });
  },
  check() {
    tone({ frequency: 760, duration: 0.1, type: 'square', gain: 0.045 });
    tone({ frequency: 980, duration: 0.14, type: 'square', gain: 0.04, delay: 0.1 });
  },
  revive() {
    tone({ frequency: 380, duration: 0.1, type: 'sine', gain: 0.06 });
    tone({ frequency: 560, duration: 0.1, type: 'sine', gain: 0.06, delay: 0.08 });
    tone({ frequency: 760, duration: 0.16, type: 'sine', gain: 0.06, delay: 0.16 });
  },
  emote() {
    tone({ frequency: 880, duration: 0.08, type: 'sine', gain: 0.05 });
  },
  win() {
    [523, 659, 784, 1047].forEach((frequency, index) => {
      tone({ frequency, duration: 0.16, type: 'triangle', gain: 0.07, delay: index * 0.12 });
    });
  },
  lose() {
    [392, 330, 262].forEach((frequency, index) => {
      tone({ frequency, duration: 0.2, type: 'triangle', gain: 0.07, delay: index * 0.13 });
    });
  },
  draw() {
    [440, 440].forEach((frequency, index) => {
      tone({ frequency, duration: 0.14, type: 'sine', gain: 0.06, delay: index * 0.16 });
    });
  },
};
