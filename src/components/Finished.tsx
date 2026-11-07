"use client";

import type { ReactNode } from "react";
import type { Action, PublicState } from "@/lib/game/types";
import { AvatarView } from "./AvatarView";
import { PlayerList } from "./PlayerList";
import { ShareButton } from "./ShareButton";

type Props = {
  state: PublicState;
  act: (action: Action) => Promise<boolean>;
  busy: boolean;
  chat: ReactNode;
};

const STEP_COLORS = ["block-yellow", "block-sky", "block-coral"];
const STEP_HEIGHTS = [170, 120, 84];

export function Finished({ state, act, busy, chat }: Props) {
  const ranking = [...state.players].sort((a, b) => b.score - a.score);
  const top = ranking[0]?.score ?? 0;
  const winners = ranking.filter((player) => player.score === top);
  const isHost = state.hostId === state.you;
  const headline =
    top === 0
      ? "Ninguém pontuou!"
      : winners.length > 1
        ? `Empate: ${winners.map((winner) => winner.name).join(" e ")}!`
        : `${winners[0].name} venceu!`;

  const scores = [...new Set(ranking.map((player) => player.score))];
  const podium = ranking.slice(0, 3);
  const shareText = `${headline} Placar final de Respostas sem Perguntas.`;

  return (
    <div className="finish">
      <h2>{headline}</h2>

      <div className="podium">
        {podium.map((player) => {
          const place = scores.indexOf(player.score);
          return (
            <div className="podium-column" key={player.id}>
              <AvatarView avatar={player.avatar} size={72} />
              <span className="podium-name">{player.name}</span>
              <div
                className={`podium-step block ${STEP_COLORS[Math.min(place, 2)]}`}
                style={{ height: STEP_HEIGHTS[Math.min(place, 2)] }}
              >
                {player.score}
              </div>
            </div>
          );
        })}
      </div>

      <section className="block panel stack">
        <h3 className="section-title">Placar final</h3>
        <PlayerList players={state.players} you={state.you} hostId={state.hostId} showScore />
        <ShareButton
          image={{
            title: "Placar final",
            headline,
            subtitle: `${state.questionTotal} perguntas`,
            rows: ranking.map(({ name, score, avatar }) => ({ name, score, avatar })),
          }}
          text={shareText}
          filename="respostas-sem-perguntas-placar.png"
        />
        {isHost ? (
          <button
            type="button"
            className="button block block-mint"
            disabled={busy}
            onClick={() => void act({ type: "back-to-lobby" })}
          >
            Jogar de novo
          </button>
        ) : (
          <p className="waiting">Aguardando o anfitrião iniciar outra partida...</p>
        )}
      </section>

      {chat}
    </div>
  );
}
