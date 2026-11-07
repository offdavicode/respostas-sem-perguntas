import { type Avatar, avatarDataUrl } from "@/lib/game/avatar";

export type ResultRow = { name: string; score: number; avatar: Avatar };

export type ResultImage = {
  title: string;
  headline: string;
  subtitle?: string;
  rows?: ResultRow[];
  tiles?: boolean[];
};

const SIZE = 1080;
const INK = "#10163a";
const SKY = "#2f62f5";
const SKY_DEEP = "#1f47c4";
const PAPER = "#ffffff";
const PAPER_SIDE = "#c3cdf0";
const YELLOW = "#ffcb2e";
const YELLOW_SIDE = "#d99a00";
const MINT = "#27d8a1";
const MINT_SIDE = "#12a077";

function fontFamily(variable: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return value || fallback;
}

function drawBlock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  face: string,
  side: string,
  depth = 10,
): void {
  ctx.fillStyle = INK;
  ctx.fillRect(x + depth, y + depth, w + 4, h + 4);
  ctx.fillStyle = side;
  for (let step = depth - 1; step > 0; step--) ctx.fillRect(x + step, y + step, w, h);
  ctx.fillStyle = face;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  ctx.strokeRect(x, y, w, h);
}

function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  family: string,
  start: number,
  maxWidth: number,
): void {
  let size = start;
  do {
    ctx.font = `${size}px ${family}`;
    size -= 2;
  } while (ctx.measureText(text).width > maxWidth && size > 18);
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = source;
  });
}

export async function renderResultImage(data: ResultImage): Promise<Blob> {
  await document.fonts.ready;
  const display = fontFamily("--font-display", "Impact, sans-serif");
  const body = fontFamily("--font-body", "sans-serif");
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = SKY;
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";

  fitFont(ctx, data.title, display, 54, SIZE - 120);
  for (const [offset, color] of [[6, INK], [3, SKY_DEEP], [0, PAPER]] as const) {
    ctx.fillStyle = color;
    ctx.fillText(data.title, SIZE / 2 + offset, 80 + offset);
  }

  drawBlock(ctx, 70, 140, SIZE - 150, 150, YELLOW, YELLOW_SIDE, 12);
  ctx.fillStyle = INK;
  fitFont(ctx, data.headline, display, 76, SIZE - 210);
  ctx.fillText(data.headline, (SIZE - 10) / 2, data.subtitle ? 195 : 215);
  if (data.subtitle) {
    fitFont(ctx, data.subtitle, body, 36, SIZE - 210);
    ctx.fillText(data.subtitle, (SIZE - 10) / 2, 255);
  }

  const rows = data.rows?.slice(0, 8) ?? [];
  const rowGap = rows.length > 5 ? 86 : 118;
  const rowHeight = rowGap - 20;
  for (const [index, row] of rows.entries()) {
    const y = 335 + index * rowGap;
    const leading = index === 0 || row.score === rows[0].score;
    drawBlock(ctx, 70, y, SIZE - 150, rowHeight, leading ? MINT : PAPER, leading ? MINT_SIDE : PAPER_SIDE, 8);
    const image = await loadImage(avatarDataUrl(row.avatar));
    ctx.drawImage(image, 80, y + 8, rowHeight - 16, rowHeight - 16);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    ctx.strokeRect(80, y + 8, rowHeight - 16, rowHeight - 16);
    ctx.fillStyle = INK;
    ctx.textAlign = "left";
    fitFont(ctx, row.name, body, 40, 620);
    ctx.fillText(row.name, 80 + rowHeight, y + rowHeight / 2);
    ctx.textAlign = "right";
    ctx.font = `44px ${display}`;
    ctx.fillText(String(row.score), SIZE - 110, y + rowHeight / 2);
    ctx.textAlign = "center";
  }

  if (data.tiles?.length) {
    const tile = data.tiles.length > 12 ? 74 : 92;
    const gap = 22;
    const perRow = Math.floor((SIZE - 160) / (tile + gap));
    data.tiles.forEach((revealed, index) => {
      const row = Math.floor(index / perRow);
      const count = Math.min(perRow, data.tiles!.length - row * perRow);
      const startX = (SIZE - (count * (tile + gap) - gap)) / 2;
      const x = startX + (index % perRow) * (tile + gap);
      const y = 380 + row * (tile + gap);
      drawBlock(ctx, x, y, tile, tile, revealed ? MINT : PAPER, revealed ? MINT_SIDE : PAPER_SIDE, 6);
    });
  }

  ctx.fillStyle = PAPER;
  ctx.font = `30px ${body}`;
  ctx.fillText("Respostas sem Perguntas", SIZE / 2, SIZE - 50);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Falha ao gerar a imagem."))), "image/png");
  });
}

export type ShareOutcome = "shared" | "downloaded" | "cancelled";

export async function shareResult(data: ResultImage, text: string, filename: string): Promise<ShareOutcome> {
  const blob = await renderResultImage(data);
  const file = new File([blob], filename, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "downloaded";
}
