import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Room } from "@/lib/game/types";

export type StoredRoom = { room: Room; version: number };

export interface RoomStore {
  create(room: Room): Promise<boolean>;
  get(code: string): Promise<StoredRoom | null>;
  update(code: string, version: number, room: Room): Promise<boolean>;
  touch(code: string, playerId: string, at: number): Promise<void>;
  presence(code: string): Promise<Record<string, number>>;
  cleanup(olderThanMs: number): Promise<void>;
}

class MemoryStore implements RoomStore {
  private rooms = new Map<string, { json: string; version: number; updatedAt: number }>();
  private seen = new Map<string, Record<string, number>>();

  async create(room: Room) {
    if (this.rooms.has(room.code)) return false;
    this.rooms.set(room.code, { json: JSON.stringify(room), version: 0, updatedAt: Date.now() });
    return true;
  }

  async get(code: string) {
    const entry = this.rooms.get(code);
    return entry ? { room: JSON.parse(entry.json) as Room, version: entry.version } : null;
  }

  async update(code: string, version: number, room: Room) {
    const entry = this.rooms.get(code);
    if (!entry || entry.version !== version) return false;
    this.rooms.set(code, {
      json: JSON.stringify(room),
      version: version + 1,
      updatedAt: Date.now(),
    });
    return true;
  }

  async touch(code: string, playerId: string, at: number) {
    this.seen.set(code, { ...this.seen.get(code), [playerId]: at });
  }

  async presence(code: string) {
    return this.seen.get(code) ?? {};
  }

  async cleanup(olderThanMs: number) {
    const limit = Date.now() - olderThanMs;
    for (const [code, entry] of this.rooms) {
      if (entry.updatedAt < limit) {
        this.rooms.delete(code);
        this.seen.delete(code);
      }
    }
  }
}

class SupabaseStore implements RoomStore {
  constructor(private db: SupabaseClient) {}

  async create(room: Room) {
    const { error } = await this.db.from("rooms").insert({ code: room.code, state: room });
    if (error?.code === "23505") return false;
    if (error) throw new Error(error.message);
    return true;
  }

  async get(code: string) {
    const { data, error } = await this.db
      .from("rooms")
      .select("state, version")
      .eq("code", code)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? { room: data.state as Room, version: data.version as number } : null;
  }

  async update(code: string, version: number, room: Room) {
    const { data, error } = await this.db
      .from("rooms")
      .update({ state: room, version: version + 1, updated_at: new Date().toISOString() })
      .eq("code", code)
      .eq("version", version)
      .select("code");
    if (error) throw new Error(error.message);
    return (data?.length ?? 0) > 0;
  }

  async touch(code: string, playerId: string, at: number) {
    const { error } = await this.db
      .from("room_presence")
      .upsert({ code, player_id: playerId, last_seen: new Date(at).toISOString() });
    if (error) throw new Error(error.message);
  }

  async presence(code: string) {
    const { data, error } = await this.db
      .from("room_presence")
      .select("player_id, last_seen")
      .eq("code", code);
    if (error) throw new Error(error.message);
    return Object.fromEntries(
      (data ?? []).map((row) => [row.player_id as string, Date.parse(row.last_seen as string)]),
    );
  }

  async cleanup(olderThanMs: number) {
    const limit = new Date(Date.now() - olderThanMs).toISOString();
    const { error } = await this.db.from("rooms").delete().lt("updated_at", limit);
    if (error) throw new Error(error.message);
  }
}

const holder = globalThis as unknown as { __roomStore?: RoomStore };

export function getStore(): RoomStore {
  if (holder.__roomStore) return holder.__roomStore;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    holder.__roomStore = new SupabaseStore(
      createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }),
    );
  } else if (process.env.VERCEL) {
    throw new Error("Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
  } else {
    holder.__roomStore = new MemoryStore();
  }
  return holder.__roomStore;
}

export async function notifyRoomChanged(code: string, version: number): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ topic: `room:${code}`, event: "changed", payload: { version } }],
      }),
    });
  } catch (error) {
    console.error("Falha ao avisar a sala", code, error);
  }
}
