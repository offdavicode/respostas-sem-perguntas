const LEET: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  $: "s",
  "!": "i",
};

const BLOCKED_WORDS = [
  "arrombada",
  "arrombado",
  "babaca",
  "bicha",
  "boceta",
  "bosta",
  "buceta",
  "cacete",
  "caralho",
  "corno",
  "crioulo",
  "cu",
  "cuzao",
  "desgracada",
  "desgracado",
  "fdp",
  "filhodaputa",
  "foda",
  "fodase",
  "fode",
  "foder",
  "fodida",
  "fodido",
  "krl",
  "merda",
  "otaria",
  "otario",
  "piranha",
  "porra",
  "pqp",
  "puta",
  "putas",
  "puto",
  "putos",
  "retardada",
  "retardado",
  "tnc",
  "traveco",
  "vadia",
  "vadio",
  "vagabunda",
  "vagabundo",
  "viada",
  "viado",
  "vsf",
  "vtnc",
  "xota",
  "xoxota",
  "bitch",
  "fuck",
  "shit",
];

function collapse(word: string): string {
  return word.replace(/(.)\1+/g, "$1");
}

function normalizeWord(word: string): string {
  const unaccented = word.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const plain = [...unaccented].map((char) => LEET[char] ?? char).join("");
  return collapse(plain.replace(/[^a-z]/g, ""));
}

const BLOCKED = new Set(BLOCKED_WORDS.map(collapse));
const BLOCKED_IN_NAMES = [...BLOCKED].filter((word) => word.length >= 5);
const WORD = /[\p{L}\p{N}@$!]+/gu;

export function censorProfanity(text: string): string {
  const matches = [...text.matchAll(WORD)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
    word: normalizeWord(match[0]),
    single: match[0].length === 1,
  }));
  const ranges: [number, number][] = [];
  matches.forEach((match) => {
    if (BLOCKED.has(match.word)) ranges.push([match.start, match.end]);
  });
  let index = 0;
  while (index < matches.length) {
    if (!matches[index].single) {
      index++;
      continue;
    }
    let last = index;
    while (last + 1 < matches.length && matches[last + 1].single) last++;
    if (last > index) {
      const joined = collapse(matches.slice(index, last + 1).map((match) => match.word).join(""));
      if (BLOCKED.has(joined)) ranges.push([matches[index].start, matches[last].end]);
    }
    index = last + 1;
  }
  return ranges
    .sort((a, b) => b[0] - a[0])
    .reduce((current, [start, end]) => current.slice(0, start) + "*".repeat(end - start) + current.slice(end), text);
}

export function hasProfanity(text: string): boolean {
  return censorProfanity(text) !== text;
}

export function isAllowedName(name: string): boolean {
  if (hasProfanity(name)) return false;
  const joined = normalizeWord(name);
  return !BLOCKED.has(joined) && !BLOCKED_IN_NAMES.some((word) => joined.includes(word));
}
