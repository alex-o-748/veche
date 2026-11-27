/**
 * Game sounds, synthesised with the Web Audio API (no audio files):
 *   bell   – the veche bell, when the City Assembly opens and on victory
 *   horn   – the Order's war horn, when it attacks and on defeat
 *   clink  – coins, when you spend money
 *
 * Players can mute them from the header; the choice is remembered.
 * Browsers only allow sound after the player has interacted with the page,
 * which is always true by the time any of these play.
 */

const KEY = 'veche.sound';
let ctx = null;
const listeners = new Set();

export const isSoundOn = () => {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
};

export const setSoundOn = (on) => {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    // Storage unavailable: the choice lasts for this visit only
  }
  listeners.forEach((fn) => fn(on));
};

export const onSoundChange = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

const audio = () => {
  if (!isSoundOn() || typeof window === 'undefined') return null;
  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    ctx = new AudioCtx();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
};

// A decaying sine partial
const partial = (ac, out, freq, amp, start, duration, type = 'sine') => {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(amp, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(out);
  osc.start(start);
  osc.stop(start + duration + 0.05);
};

/** The veche bell: two strikes of a bronze bell (inharmonic partials) */
export const playBell = () => {
  const ac = audio();
  if (!ac) return;
  const out = ac.createGain();
  out.gain.value = 0.16;
  out.connect(ac.destination);
  const base = 196; // G3
  [0, 1.1].forEach((offset) => {
    const t = ac.currentTime + offset;
    partial(ac, out, base * 0.5, 0.35, t, 4.5); // hum
    partial(ac, out, base, 1, t, 3.6); // prime
    partial(ac, out, base * 1.2, 0.45, t, 2.6); // minor third
    partial(ac, out, base * 1.5, 0.3, t, 2.2); // fifth
    partial(ac, out, base * 2, 0.4, t, 1.8); // nominal
    partial(ac, out, base * 2.76, 0.2, t, 1.0);
    partial(ac, out, base * 5.4, 0.08, t, 0.5);
  });
};

/** The Order's war horn: a low brassy call, rising a fifth */
export const playHorn = () => {
  const ac = audio();
  if (!ac) return;
  const out = ac.createGain();
  out.gain.value = 0.12;
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 700;
  filter.Q.value = 2;
  filter.connect(out).connect(ac.destination);

  const notes = [
    { freq: 98, start: 0, dur: 0.7 },
    { freq: 147, start: 0.55, dur: 1.2 },
  ];
  notes.forEach(({ freq, start, dur }) => {
    const t = ac.currentTime + start;
    [1, 1.005].forEach((detune) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq * detune * 0.97, t);
      osc.frequency.linearRampToValueAtTime(freq * detune, t + 0.12);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.5, t + 0.15);
      gain.gain.setValueAtTime(0.5, t + dur - 0.3);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(filter);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    });
  });
};

/** Coins: two short bright tings */
export const playClink = () => {
  const ac = audio();
  if (!ac) return;
  const out = ac.createGain();
  out.gain.value = 0.08;
  out.connect(ac.destination);
  const t = ac.currentTime;
  partial(ac, out, 2093, 1, t, 0.22, 'triangle');
  partial(ac, out, 3136, 0.6, t + 0.07, 0.25, 'triangle');
  partial(ac, out, 4186, 0.25, t + 0.07, 0.15);
};
