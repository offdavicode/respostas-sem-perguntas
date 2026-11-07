"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
  type Session,
  joinRoomRequest,
  loadAvatar,
  loadName,
  loadSession,
  roomSummaryRequest,
  saveAvatar,
  saveName,
  saveSession,
} from "@/lib/client/api";
import { type Avatar, DEFAULT_AVATAR } from "@/lib/game/avatar";
import { AvatarEditor } from "./AvatarEditor";
import { RoomScreen } from "./RoomScreen";

type GateState =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "kicked" }
  | { kind: "join"; playerCount: number; playing: boolean }
  | { kind: "ready"; session: Session };

export function RoomGate({ code }: { code: string }) {
  const [gate, setGate] = useState<GateState>({ kind: "loading" });
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<Avatar>(DEFAULT_AVATAR);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const askToJoin = useCallback(async () => {
    try {
      const summary = await roomSummaryRequest(code);
      setGate(
        summary.exists
          ? { kind: "join", playerCount: summary.playerCount, playing: summary.phase === "playing" }
          : { kind: "missing" },
      );
    } catch {
      setGate({ kind: "missing" });
    }
  }, [code]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const session = loadSession(code);
      setName(loadName());
      setAvatar(loadAvatar());
      if (session) setGate({ kind: "ready", session });
      else void askToJoin();
    }, 0);
    return () => clearTimeout(timer);
  }, [askToJoin, code]);

  function changeAvatar(next: Avatar) {
    setAvatar(next);
    saveAvatar(next);
  }

  const onLost = useCallback(
    (kicked: boolean) => {
      if (kicked) setGate({ kind: "kicked" });
      else void askToJoin();
    },
    [askToJoin],
  );

  async function join(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      saveName(name.trim());
      const session = await joinRoomRequest(code, name, avatar);
      saveSession(session);
      setGate({ kind: "ready", session });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Algo deu errado.");
    } finally {
      setBusy(false);
    }
  }

  if (gate.kind === "ready") {
    return <RoomScreen session={gate.session} onLost={onLost} />;
  }

  return (
    <main className="room">
      <div className="center-card block panel stack">
        {gate.kind === "loading" && <p className="title">Abrindo a sala...</p>}
        {gate.kind === "kicked" && (
          <>
            <h1>Você saiu da sala</h1>
            <p>O anfitrião removeu você da sala {code}.</p>
            <Link className="button block block-yellow" href="/">
              Voltar ao início
            </Link>
          </>
        )}
        {gate.kind === "missing" && (
          <>
            <h1>Sala não encontrada</h1>
            <p>O código {code} não existe ou a sala já foi encerrada.</p>
            <Link className="button block block-yellow" href="/">
              Voltar ao início
            </Link>
          </>
        )}
        {gate.kind === "join" && (
          <form className="stack" onSubmit={join}>
            <h1>Sala {code}</h1>
            <p className="muted">
              {gate.playerCount} {gate.playerCount === 1 ? "jogador" : "jogadores"} na sala.
              {gate.playing && " A partida já começou: você entra na próxima pergunta."}
            </p>
            <label className="field">
              Seu apelido
              <input
                className="input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={16}
                required
                autoComplete="nickname"
                placeholder="Como vão te chamar?"
              />
            </label>
            <AvatarEditor avatar={avatar} onChange={changeAvatar} />
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="button block block-yellow" disabled={busy}>
              Entrar na sala
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
