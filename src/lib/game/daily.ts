import type { Question } from "./types";

const FIRST_DAY = Date.UTC(2026, 0, 1);
const DAY_MS = 86_400_000;
const SEED = 20260101;

export function dailyKey(now: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
}

export function dailyNumber(key: string): number {
  const [year, month, day] = key.split("-").map(Number);
  return Math.round((Date.UTC(year, month - 1, day) - FIRST_DAY) / DAY_MS) + 1;
}

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function dailyQuestion(key: string, questions: Question[]): Question {
  const ordered = [...questions].sort((a, b) => a.id.localeCompare(b.id));
  const random = seededRandom(SEED);
  for (let i = ordered.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
  }
  const index = (dailyNumber(key) - 1) % ordered.length;
  return ordered[(index + ordered.length) % ordered.length];
}
