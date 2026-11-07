export type Avatar = {
  color: number;
  background: number;
  head: number;
  eyes: number;
  mouth: number;
  hat: number;
};

export const AVATAR_COLORS = [
  "#ffcb2e",
  "#ff5d4d",
  "#27d8a1",
  "#a9c0ff",
  "#ff8fd0",
  "#ff9a3d",
  "#b78cff",
  "#f4f1e8",
];

export const AVATAR_BACKGROUNDS = [
  "#1f47c4",
  "#10163a",
  "#12a077",
  "#c73a2c",
  "#7a3fd1",
  "#eef2ff",
];

export const AVATAR_TRAITS = [
  { key: "color", label: "Cor", options: AVATAR_COLORS.map((_, i) => `Cor ${i + 1}`) },
  { key: "background", label: "Fundo", options: AVATAR_BACKGROUNDS.map((_, i) => `Fundo ${i + 1}`) },
  { key: "head", label: "Cabeça", options: ["Cubo", "Alta", "Larga"] },
  { key: "eyes", label: "Olhos", options: ["Pontos", "Grandes", "Felizes", "Sono", "Óculos", "Piscando"] },
  { key: "mouth", label: "Boca", options: ["Sorriso", "Reta", "Aberta", "Dentes", "Língua", "Triste"] },
  { key: "hat", label: "Chapéu", options: ["Nenhum", "Boné", "Coroa", "Antena", "Chifres", "Cartola", "Faixa"] },
] as const;

export type AvatarTrait = (typeof AVATAR_TRAITS)[number]["key"];

export const DEFAULT_AVATAR: Avatar = { color: 0, background: 0, head: 0, eyes: 0, mouth: 0, hat: 0 };

export function sanitizeAvatar(raw: unknown): Avatar {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const avatar = { ...DEFAULT_AVATAR };
  for (const trait of AVATAR_TRAITS) {
    const value = Number(source[trait.key]);
    if (Number.isInteger(value) && value >= 0 && value < trait.options.length) {
      avatar[trait.key] = value;
    }
  }
  return avatar;
}

export function randomAvatar(random: () => number = Math.random): Avatar {
  const avatar = { ...DEFAULT_AVATAR };
  for (const trait of AVATAR_TRAITS) {
    avatar[trait.key] = Math.floor(random() * trait.options.length);
  }
  return avatar;
}

function shade(hex: string, factor: number): string {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const mixed = channels.map((channel) =>
    Math.round(factor < 0 ? channel * (1 + factor) : channel + (255 - channel) * factor),
  );
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

const INK = "#10163a";
const HEADS = [
  { x: 22, y: 36, w: 44, h: 44 },
  { x: 27, y: 28, w: 36, h: 52 },
  { x: 15, y: 42, w: 56, h: 38 },
];
const DEPTH = 8;

function rect(x: number, y: number, w: number, h: number, fill: string, stroke = true): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${
    stroke ? ` stroke="${INK}" stroke-width="3"` : ""
  }/>`;
}

function poly(points: number[][], fill: string): string {
  return `<polygon points="${points.map((p) => p.join(",")).join(" ")}" fill="${fill}" stroke="${INK}" stroke-width="3"/>`;
}

function line(points: number[][], width = 3): string {
  return `<polyline points="${points.map((p) => p.join(",")).join(" ")}" fill="none" stroke="${INK}" stroke-width="${width}"/>`;
}

function eyesSvg(kind: number, cx: number, y: number, gap: number): string {
  const left = cx - gap;
  const right = cx + gap;
  switch (kind) {
    case 1:
      return rect(left - 4, y - 6, 8, 12, "#ffffff") + rect(right - 4, y - 6, 8, 12, "#ffffff") +
        rect(left - 1, y - 2, 4, 6, INK, false) + rect(right - 1, y - 2, 4, 6, INK, false);
    case 2:
      return line([[left - 5, y + 2], [left, y - 3], [left + 5, y + 2]]) +
        line([[right - 5, y + 2], [right, y - 3], [right + 5, y + 2]]);
    case 3:
      return line([[left - 5, y], [left + 5, y]]) + line([[right - 5, y], [right + 5, y]]);
    case 4:
      return rect(left - 6, y - 5, 12, 10, "#ffffff") + rect(right - 6, y - 5, 12, 10, "#ffffff") +
        line([[left + 6, y], [right - 6, y]]) +
        rect(left - 2, y - 2, 4, 4, INK, false) + rect(right - 2, y - 2, 4, 4, INK, false);
    case 5:
      return rect(left - 3, y - 3, 6, 6, INK, false) + line([[right - 5, y], [right + 5, y]]);
    default:
      return rect(left - 3, y - 3, 6, 6, INK, false) + rect(right - 3, y - 3, 6, 6, INK, false);
  }
}

function mouthSvg(kind: number, cx: number, y: number): string {
  switch (kind) {
    case 1:
      return line([[cx - 8, y], [cx + 8, y]]);
    case 2:
      return rect(cx - 6, y - 4, 12, 9, INK, false);
    case 3:
      return rect(cx - 9, y - 4, 18, 8, "#ffffff") + line([[cx, y - 4], [cx, y + 4]], 2);
    case 4:
      return line([[cx - 8, y - 2], [cx + 8, y - 2]]) + rect(cx - 2, y - 2, 8, 7, "#ff5d4d");
    case 5:
      return line([[cx - 8, y + 3], [cx - 4, y - 2], [cx + 4, y - 2], [cx + 8, y + 3]]);
    default:
      return line([[cx - 8, y - 3], [cx - 4, y + 2], [cx + 4, y + 2], [cx + 8, y - 3]]);
  }
}

function hatSvg(kind: number, x: number, y: number, w: number): string {
  const top = y - DEPTH;
  const left = x + DEPTH / 2;
  const right = x + w + DEPTH / 2;
  const cx = (left + right) / 2;
  switch (kind) {
    case 1:
      return rect(left, top - 8, right - left, 10, "#ff5d4d") + rect(right - 4, top - 2, 14, 5, "#c73a2c");
    case 2:
      return poly(
        [[left, top + 2], [left, top - 12], [left + (cx - left) / 2, top - 4], [cx, top - 14],
          [cx + (right - cx) / 2, top - 4], [right, top - 12], [right, top + 2]],
        "#ffcb2e",
      );
    case 3:
      return line([[cx, top], [cx, top - 12]]) + rect(cx - 4, top - 18, 8, 8, "#ff5d4d");
    case 4:
      return poly([[left + 2, top + 1], [left + 2, top - 12], [left + 11, top + 1]], "#f4f1e8") +
        poly([[right - 2, top + 1], [right - 2, top - 12], [right - 11, top + 1]], "#f4f1e8");
    case 5:
      return rect(cx - 12, top - 16, 24, 16, INK) + rect(left, top - 2, right - left, 5, INK);
    case 6:
      return rect(x, y + 3, w, 7, "#ff5d4d");
    default:
      return "";
  }
}

export function avatarSvg(raw: Avatar): string {
  const avatar = sanitizeAvatar(raw);
  const color = AVATAR_COLORS[avatar.color];
  const background = AVATAR_BACKGROUNDS[avatar.background];
  const { x, y, w, h } = HEADS[avatar.head];
  const cx = x + w / 2;
  const parts = [
    `<rect width="96" height="96" fill="${background}"/>`,
    poly([[x, y], [x + DEPTH, y - DEPTH], [x + w + DEPTH, y - DEPTH], [x + w, y]], shade(color, 0.4)),
    poly([[x + w, y], [x + w + DEPTH, y - DEPTH], [x + w + DEPTH, y + h - DEPTH], [x + w, y + h]], shade(color, -0.3)),
    rect(x, y, w, h, color),
    eyesSvg(avatar.eyes, cx, y + h * 0.4, w * 0.22),
    mouthSvg(avatar.mouth, cx, y + h * 0.74),
    hatSvg(avatar.hat, x, y, w),
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96" stroke-linejoin="miter" stroke-linecap="butt" shape-rendering="crispEdges">${parts.join("")}</svg>`;
}

export function avatarDataUrl(avatar: Avatar): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(avatarSvg(avatar))}`;
}
