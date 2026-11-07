"use client";

import { type ReactNode, useState } from "react";
import { MAX_PLAYERS, MIN_PLAYERS } from "@/lib/game/engine";
import { CATEGORIES, type Action, type PublicState, type RoomConfig } from "@/lib/game/types";
import { PlayerList } from "./PlayerList";

type Props = {
  state: PublicState;
  act: (action: Action) => Promise<boolean>;
  busy: boolean;
  chat: ReactNode;
};

const MODES = [
  {
    id: "turns",
    label: "Turnos",
    description: "Só quem está na vez revela e responde. Errou, passa para o próximo.",
  },
  {
    id: "simultaneous",
    label: "Simultâneo",
    description: "Todos respondem a cada revelação. Pontua quem enviar primeiro a resposta certa.",
  },
] as const;

export function Lobby({ state, act, busy, chat }: Props) {
  const [copied, setCopied] = useState(false);
  const isHost = state.hostId === state.you;
  const { config } = state;
  const onlineCount = state.players.filter((player) => player.online).length;
  const canStart = isHost && onlineCount >= MIN_PLAYERS;

  const configure = (patch: Partial<RoomConfig>) => {
    if (isHost) void act({ type: "configure", config: patch });
  };

  async function copyLink() {
    const url = `${window.location.origin}/sala/${state.code}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt("Copie o link da sala:", url);
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function toggleCategory(id: RoomConfig["categories"][number]) {
    const next = config.categories.includes(id)
      ? config.categories.filter((category) => category !== id)
      : [...config.categories, id];
    configure({ categories: next });
  }

  return (
    <div className="lobby">
      <div className="stack">
        <section className="block block-yellow panel code-card">
          <div>
            <p>Código da sala</p>
            <p className="room-code">{state.code}</p>
          </div>
          <button type="button" className="button block" onClick={copyLink}>
            {copied ? "Link copiado" : "Copiar link"}
          </button>
        </section>

        <section className="block panel stack">
          <div>
            <h2 className="section-title">Modo de jogo</h2>
            <div className="mode-grid">
              {MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  className="option mode-option"
                  aria-pressed={config.mode === mode.id}
                  disabled={!isHost}
                  onClick={() => configure({ mode: mode.id })}
                >
                  <strong>{mode.label}</strong>
                  <span>{mode.description}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <h2 className="section-title">Número de perguntas</h2>
            <div className="options">
              {([3, 5, 10] as const).map((count) => (
                <button
                  key={count}
                  type="button"
                  className="option"
                  aria-pressed={config.questionCount === count}
                  disabled={!isHost}
                  onClick={() => configure({ questionCount: count })}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>

          {config.mode === "turns" && (
            <div>
              <h2 className="section-title">Tempo por turno</h2>
              <div className="options">
                {([15, 30, 45, 60] as const).map((seconds) => (
                  <button
                    key={seconds}
                    type="button"
                    className="option"
                    aria-pressed={config.turnSeconds === seconds}
                    disabled={!isHost}
                    onClick={() => configure({ turnSeconds: seconds })}
                  >
                    {seconds} s
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <h2 className="section-title">Categorias</h2>
            <div className="options">
              {CATEGORIES.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className="option"
                  aria-pressed={config.categories.includes(category.id)}
                  disabled={!isHost}
                  onClick={() => toggleCategory(category.id)}
                >
                  {category.label}
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>

      <aside className="sidebar">
        <section className="block panel stack">
        <h2 className="section-title">
          Jogadores ({state.players.length}/{MAX_PLAYERS})
        </h2>
        <PlayerList
          players={state.players}
          you={state.you}
          hostId={state.hostId}
          onKick={(playerId) => void act({ type: "kick", playerId })}
        />
        {isHost ? (
          <button
            type="button"
            className="button block block-mint"
            disabled={!canStart || busy}
            onClick={() => void act({ type: "start" })}
          >
            Iniciar partida
          </button>
        ) : (
          <p className="waiting">Aguardando o anfitrião iniciar...</p>
        )}
        {isHost && !canStart && (
          <p className="muted">Convide pelo menos mais um jogador para começar.</p>
        )}
        </section>
        {chat}
      </aside>
    </div>
  );
}
