"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Action, PublicState } from "@/lib/game/types";
import { ApiError, type Session, actionRequest, clearSession, stateRequest } from "./api";

const POLL_WITH_REALTIME_MS = 8_000;
const POLL_WITHOUT_REALTIME_MS = 2_000;

export function useRoom(session: Session) {
  const [state, setState] = useState<PublicState | null>(null);
  const [offsetMs, setOffsetMs] = useState(0);
  const [realtime, setRealtime] = useState(false);
  const [lost, setLost] = useState<"removed" | "kicked" | null>(null);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const requestSeq = useRef(0);

  const apply = useCallback((next: PublicState, seq: number) => {
    if (seq < requestSeq.current) return;
    requestSeq.current = seq;
    setOffsetMs(next.serverNow - Date.now());
    setState(next);
    setOffline(false);
  }, []);

  const seqCounter = useRef(0);
  const refresh = useCallback(async () => {
    const seq = ++seqCounter.current;
    try {
      apply(await stateRequest(session), seq);
    } catch (failure) {
      if (failure instanceof ApiError && (failure.status === 400 || failure.status === 403)) {
        clearSession(session.code);
        setLost(failure.status === 403 ? "kicked" : "removed");
      } else {
        setOffline(true);
      }
    }
  }, [apply, session]);

  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const interval = setInterval(
      refresh,
      realtime ? POLL_WITH_REALTIME_MS : POLL_WITHOUT_REALTIME_MS,
    );
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [realtime, refresh]);

  const deadline = state?.round?.deadline;
  const phase = state?.phase;
  useEffect(() => {
    if (!deadline || phase !== "playing") return;
    const wait = Math.max(0, deadline - (Date.now() + offsetMs)) + 550;
    const timer = setTimeout(refresh, wait);
    return () => clearTimeout(timer);
  }, [deadline, offsetMs, phase, refresh]);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    void import("@supabase/supabase-js").then(({ createClient }) => {
      if (cancelled) return;
      const client = createClient(url, key, { auth: { persistSession: false } });
      const channel = client
        .channel(`room:${session.code}`)
        .on("broadcast", { event: "changed" }, () => void refresh())
        .subscribe((status) => setRealtime(status === "SUBSCRIBED"));
      cleanup = () => void client.removeChannel(channel);
    });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [refresh, session.code]);

  const act = useCallback(
    async (action: Action): Promise<boolean> => {
      const seq = ++seqCounter.current;
      const quiet = action.type === "chat" || action.type === "react";
      if (!quiet) setBusy(true);
      try {
        const next = await actionRequest(session, action);
        if (next) apply(next, seq);
        setError(null);
        return true;
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : "Algo deu errado.");
        void refresh();
        return false;
      } finally {
        if (!quiet) setBusy(false);
      }
    },
    [apply, refresh, session],
  );

  const clearError = useCallback(() => setError(null), []);

  return { state, offsetMs, lost, offline, error, clearError, busy, act };
}

export function useNow(active: boolean, offsetMs: number, everyMs = 200): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now() + offsetMs);
    const first = setTimeout(tick, 0);
    const interval = setInterval(tick, everyMs);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [active, everyMs, offsetMs]);
  return now;
}
