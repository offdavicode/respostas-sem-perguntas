import { type Avatar, randomAvatar, sanitizeAvatar } from "@/lib/game/avatar";
import type { Action, PublicState } from "@/lib/game/types";

export type Session = { code: string; token: string; playerId: string };

const sessionKey = (code: string) => `rsp:session:${code}`;
const NAME_KEY = "rsp:name";
const AVATAR_KEY = "rsp:avatar";
const DEVICE_KEY = "rsp:device";

function storageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
  }
}

export function loadSession(code: string): Session | null {
  const raw = storageGet(sessionKey(code));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function saveSession(session: Session): void {
  storageSet(sessionKey(session.code), JSON.stringify(session));
}

export function clearSession(code: string): void {
  try {
    window.localStorage.removeItem(sessionKey(code));
  } catch {
  }
}

export const loadName = () => storageGet(NAME_KEY) ?? "";
export const saveName = (name: string) => storageSet(NAME_KEY, name);

export function loadAvatar(): Avatar {
  const raw = storageGet(AVATAR_KEY);
  if (raw) {
    try {
      return sanitizeAvatar(JSON.parse(raw));
    } catch {
      return randomAvatar();
    }
  }
  const avatar = randomAvatar();
  saveAvatar(avatar);
  return avatar;
}

export function saveAvatar(avatar: Avatar): void {
  storageSet(AVATAR_KEY, JSON.stringify(avatar));
}

function deviceId(): string {
  const saved = storageGet(DEVICE_KEY);
  if (saved) return saved;
  const created = window.crypto.randomUUID();
  storageSet(DEVICE_KEY, created);
  return created;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { cache: "no-store", ...init });
  } catch {
    throw new ApiError("Sem conexão com o servidor.", 0);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.error ?? "Algo deu errado.", response.status);
  return data as T;
}

const jsonPost = (body: unknown, token?: string): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json", ...(token ? { "x-player-token": token } : {}) },
  body: JSON.stringify(body),
});

export const createRoomRequest = (name: string, avatar: Avatar) =>
  request<Session>("/api/rooms", jsonPost({ name, avatar, deviceId: deviceId() }));

export const joinRoomRequest = (code: string, name: string, avatar: Avatar) =>
  request<Session>(
    `/api/rooms/${encodeURIComponent(code)}`,
    jsonPost({ name, avatar, deviceId: deviceId() }),
  );

export const roomSummaryRequest = (code: string) =>
  request<{ exists: boolean; playerCount: number; phase: string | null }>(
    `/api/rooms/${encodeURIComponent(code)}`,
  );

export const stateRequest = (session: Session) =>
  request<PublicState>(`/api/rooms/${session.code}/state`, {
    headers: { "x-player-token": session.token },
  });

export const actionRequest = (session: Session, action: Action) =>
  request<PublicState | null>(`/api/rooms/${session.code}/action`, jsonPost(action, session.token));
