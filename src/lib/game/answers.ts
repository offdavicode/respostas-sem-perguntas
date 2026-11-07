const LEADING_ARTICLE = /^(o|a|os|as|um|uma|uns|umas|the)\s+/;

export function normalizeAnswer(input: string): string {
  const cleaned = input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const withoutArticle = cleaned.replace(LEADING_ARTICLE, "");
  return withoutArticle || cleaned;
}

export function levenshtein(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }
  return previous[b.length];
}

function allowedTypos(answer: string): number {
  if (/\d/.test(answer) || answer.length <= 3) return 0;
  return answer.length <= 7 ? 1 : 2;
}

export function isCorrectAnswer(guess: string, answer: string): boolean {
  const normalizedGuess = normalizeAnswer(guess);
  const normalizedAnswer = normalizeAnswer(answer);
  if (!normalizedGuess) return false;
  return levenshtein(normalizedGuess, normalizedAnswer) <= allowedTypos(normalizedAnswer);
}

export function mentionsAnswer(text: string, answer: string): boolean {
  const words = normalizeAnswer(text).split(" ");
  const normalizedAnswer = normalizeAnswer(answer);
  const size = normalizedAnswer.split(" ").length;
  const tolerant = normalizedAnswer.length >= 8;
  for (let start = 0; start + size <= words.length; start++) {
    const candidate = words.slice(start, start + size).join(" ");
    if (candidate === normalizedAnswer) return true;
    if (tolerant && isCorrectAnswer(candidate, answer)) return true;
  }
  return false;
}
