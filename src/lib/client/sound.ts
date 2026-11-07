export type SoundName = "reveal" | "correct" | "wrong" | "tick";

const MUTE_KEY = "rsp:muted";
let context: AudioContext | null = null;

export function isMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setMuted(muted: boolean): void {
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
  }
}

const PATTERNS: Record<SoundName, { freq: number; at: number; length: number; type: OscillatorType }[]> = {
  reveal: [
    { freq: 300, at: 0, length: 0.07, type: "square" },
    { freq: 520, at: 0.06, length: 0.1, type: "square" },
  ],
  correct: [
    { freq: 523, at: 0, length: 0.12, type: "triangle" },
    { freq: 659, at: 0.11, length: 0.12, type: "triangle" },
    { freq: 784, at: 0.22, length: 0.25, type: "triangle" },
  ],
  wrong: [
    { freq: 196, at: 0, length: 0.14, type: "sawtooth" },
    { freq: 147, at: 0.12, length: 0.22, type: "sawtooth" },
  ],
  tick: [{ freq: 880, at: 0, length: 0.04, type: "square" }],
};

export function playSound(name: SoundName): void {
  if (typeof window === "undefined" || isMuted()) return;
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume();
    const start = context.currentTime;
    for (const note of PATTERNS[name]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = note.type;
      oscillator.frequency.value = note.freq;
      gain.gain.setValueAtTime(0.08, start + note.at);
      gain.gain.exponentialRampToValueAtTime(0.001, start + note.at + note.length);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start + note.at);
      oscillator.stop(start + note.at + note.length);
    }
  } catch {
  }
}
