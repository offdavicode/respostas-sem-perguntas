"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { type Session, clearSession } from "@/lib/client/api";
import { isMuted, setMuted } from "@/lib/client/sound";
import { useRoom } from "@/lib/client/useRoom";
import { Chat } from "./Chat";
import { Finished } from "./Finished";
import { GameBoard } from "./GameBoard";
import { Lobby } from "./Lobby";
import { ReactionBubbles } from "./Reactions";

type Props = { session: Session; onLost: (kicked: boolean) => void };

export function RoomScreen({ session, onLost }: Props) {
  const router = useRouter();
  const room = useRoom(session);
  const { state, lost, error, clearError, offline, act, busy, offsetMs } = room;
  const [muted, setMutedState] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMutedState(isMuted()), 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (lost) onLost(lost === "kicked");
  }, [lost, onLost]);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(clearError, 4000);
    return () => clearTimeout(timer);
  }, [clearError, error]);

  function toggleMute() {
    setMuted(!muted);
    setMutedState(!muted);
  }

  async function leave() {
    await act({ type: "leave" });
    clearSession(session.code);
    router.push("/");
  }

  const chat = state ? <Chat state={state} act={act} /> : null;

  return (
    <main className="room">
      <header className="topbar">
        <Link className="brand" href="/">
          Respostas sem Perguntas
        </Link>
        <span className="tag">Sala {session.code}</span>
        {state?.phase === "playing" && (
          <span className="tag">
            Pergunta {state.questionIndex + 1} de {state.questionTotal}
          </span>
        )}
        <button
          type="button"
          className="button button-small block"
          onClick={toggleMute}
          aria-pressed={muted}
        >
          {muted ? "Som: off" : "Som: on"}
        </button>
        <button type="button" className="button button-small block block-coral" onClick={leave}>
          Sair
        </button>
      </header>

      {!state && <p className="title">Conectando...</p>}
      {state?.phase === "lobby" && <Lobby state={state} act={act} busy={busy} chat={chat} />}
      {state?.phase === "playing" && (
        <GameBoard state={state} act={act} busy={busy} offsetMs={offsetMs} chat={chat} />
      )}
      {state?.phase === "finished" && <Finished state={state} act={act} busy={busy} chat={chat} />}

      {state && <ReactionBubbles state={state} offsetMs={offsetMs} />}

      {(error || offline) && (
        <p className="error toast" role="alert">
          {error ?? "Conexão instável. Tentando reconectar..."}
        </p>
      )}
    </main>
  );
}
