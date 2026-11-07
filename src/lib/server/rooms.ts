import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import {
  GameError,
  KickedError,
  ONLINE_WINDOW_MS,
  addPlayer,
  advance,
  applyAction,
  cleanName,
  createRoom,
  toPublicState,
} from "@/lib/game/engine";
import { sanitizeAvatar } from "@/lib/game/avatar";
import { QUESTIONS, getQuestion } from "@/lib/game/questions";
import type { Action, EngineContext, Player, PublicState, Room } from "@/lib/game/types";
import { getStore, notifyRoomChanged } from "./store";

const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_WRITE_RETRIES = 8;

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase();
}

function newCode(): string {
  return Array.from({ length: 4 }, () => CODE_LETTERS[randomInt(CODE_LETTERS.length)]).join("");
}

export type JoinDetails = { name?: unknown; avatar?: unknown; deviceId?: unknown };

function newPlayer({ name, avatar, deviceId }: JoinDetails, now: number): Player {
  return {
    id: randomBytes(8).toString("hex"),
    token: randomBytes(24).toString("hex"),
    name: cleanName(name),
    avatar: sanitizeAvatar(avatar),
    deviceId: typeof deviceId === "string" ? deviceId.slice(0, 64) : undefined,
    score: 0,
    joinedAt: now,
    playsFromQuestion: 0,
  };
}

function sameToken(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function findByToken(room: Room, token: string | null): Player | undefined {
  if (!token) return undefined;
  return room.players.find((player) => sameToken(player.token, token));
}

function requirePlayer(room: Room, token: string | null): Player {
  const player = findByToken(room, token);
  if (player) return player;
  if (token && (room.kicked ?? []).some((entry) => sameToken(entry.token, token))) {
    throw new KickedError("Você foi removido desta sala pelo anfitrião.");
  }
  throw new GameError("Você não está nesta sala.");
}

async function buildContext(code: string, now: number): Promise<EngineContext> {
  const seen = await getStore().presence(code);
  const online = new Set(
    Object.entries(seen)
      .filter(([, lastSeen]) => now - lastSeen < ONLINE_WINDOW_MS)
      .map(([id]) => id),
  );
  return { now, online, getQuestion, allQuestions: QUESTIONS };
}

async function mutate(
  code: string,
  change: (room: Room, ctx: EngineContext) => boolean,
  ctxFor: () => Promise<EngineContext>,
): Promise<{ room: Room; ctx: EngineContext }> {
  const store = getStore();
  for (let attempt = 0; attempt < MAX_WRITE_RETRIES; attempt++) {
    const stored = await store.get(code);
    if (!stored) throw new GameError("Sala não encontrada.");
    const ctx = await ctxFor();
    const changed = change(stored.room, ctx);
    if (!changed) return { room: stored.room, ctx };
    if (await store.update(code, stored.version, stored.room)) {
      await notifyRoomChanged(code, stored.version + 1);
      return { room: stored.room, ctx };
    }
    await new Promise((resolve) => setTimeout(resolve, 20 + Math.random() * 60 * (attempt + 1)));
  }
  throw new GameError("A sala está muito movimentada. Tente de novo.");
}

export type Session = { code: string; token: string; playerId: string };

export async function openRoom(details: JoinDetails): Promise<Session> {
  const store = getStore();
  const now = Date.now();
  const host = newPlayer(details, now);
  void store.cleanup(ROOM_TTL_MS).catch((error) => console.error("Falha na limpeza", error));
  for (let attempt = 0; attempt < 12; attempt++) {
    const code = newCode();
    if (await store.create(createRoom(code, host, now))) {
      await store.touch(code, host.id, now);
      return { code, token: host.token, playerId: host.id };
    }
  }
  throw new GameError("Não foi possível criar a sala. Tente de novo.");
}

export async function joinRoom(rawCode: string, details: JoinDetails): Promise<Session> {
  const code = normalizeCode(rawCode);
  const now = Date.now();
  const player = newPlayer(details, now);
  await mutate(
    code,
    (room) => {
      addPlayer(room, player);
      return true;
    },
    () => buildContext(code, now),
  );
  await getStore().touch(code, player.id, now);
  return { code, token: player.token, playerId: player.id };
}

export type RoomSummary = { exists: boolean; playerCount: number; phase: Room["phase"] | null };

export async function roomSummary(rawCode: string): Promise<RoomSummary> {
  const stored = await getStore().get(normalizeCode(rawCode));
  return {
    exists: !!stored,
    playerCount: stored?.room.players.length ?? 0,
    phase: stored?.room.phase ?? null,
  };
}

export async function readState(rawCode: string, token: string | null): Promise<PublicState> {
  const code = normalizeCode(rawCode);
  const store = getStore();
  const stored = await store.get(code);
  if (!stored) throw new GameError("Sala não encontrada.");
  const player = requirePlayer(stored.room, token);

  const now = Date.now();
  await store.touch(code, player.id, now);
  const { room, ctx } = await mutate(code, advance, () => buildContext(code, now));
  return toPublicState(room, player.id, ctx);
}

export async function performAction(
  rawCode: string,
  token: string | null,
  action: Action,
): Promise<PublicState | null> {
  const code = normalizeCode(rawCode);
  const now = Date.now();
  const stored = await getStore().get(code);
  if (!stored) throw new GameError("Sala não encontrada.");
  const player = requirePlayer(stored.room, token);
  await getStore().touch(code, player.id, now);

  const { room, ctx } = await mutate(
    code,
    (current, context) => {
      advance(current, context);
      applyAction(current, player.id, action, context);
      advance(current, context);
      return true;
    },
    () => buildContext(code, now),
  );
  return action.type === "leave" ? null : toPublicState(room, player.id, ctx);
}
