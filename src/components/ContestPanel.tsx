"use client";

import type { Action, PublicState } from "@/lib/game/types";
import { playerName } from "./PlayerList";

type Props = {
  state: PublicState;
  act: (action: Action) => Promise<boolean>;
  busy: boolean;
};

const pointsLabel = (points: number) => `${points} ${points === 1 ? "ponto" : "pontos"}`;

export function ContestPanel({ state, act, busy }: Props) {
  const round = state.round!;
  const { contest, attempts } = round;
  const finished = attempts.filter((attempt) => attempt.contested && (!contest || attempt.text !== contest.text));
  const alreadyContested = attempts.some((a) => a.playerId === state.you && a.contested);
  const options = attempts
    .map((attempt, index) => ({ attempt, index }))
    .filter(({ attempt }) => attempt.playerId === state.you && attempt.correct === false)
    .slice(-3);
  const canContest = !contest && !alreadyContested && options.length > 0;

  if (!contest && !canContest && finished.length === 0) return null;

  return (
    <section className="block panel stack">
      <h3 className="section-title">Contestar resposta</h3>

      {contest && (
        <div className="stack">
          <p>
            <strong>{playerName(state.players, contest.playerId)}</strong> pede que{" "}
            <strong>&quot;{contest.text}&quot;</strong> seja aceita. Valendo {pointsLabel(contest.points)}.
          </p>
          <p className="muted">
            A favor: {contest.votesFor} · Contra: {contest.votesAgainst} · Votantes: {contest.voterCount}
          </p>
          {contest.canVote ? (
            <div className="options">
              <button
                type="button"
                className="button block block-mint"
                disabled={busy}
                onClick={() => void act({ type: "vote", accept: true })}
              >
                Aceitar
              </button>
              <button
                type="button"
                className="button block block-coral"
                disabled={busy}
                onClick={() => void act({ type: "vote", accept: false })}
              >
                Recusar
              </button>
            </div>
          ) : (
            <p className="waiting">
              {contest.yourVote === null ? "Aguardando os votos..." : "Voto registrado. Aguardando os outros..."}
            </p>
          )}
        </div>
      )}

      {canContest && (
        <div className="stack">
          <p>A correção recusou uma resposta certa? Peça para os outros jogadores votarem.</p>
          <div className="options">
            {options.map(({ attempt, index }) => (
              <button
                type="button"
                key={index}
                className="option"
                disabled={busy}
                onClick={() => void act({ type: "contest", attemptIndex: index })}
              >
                Contestar &quot;{attempt.text}&quot;
              </button>
            ))}
          </div>
        </div>
      )}

      {finished.map((attempt, index) => (
        <p key={index}>
          <strong>{playerName(state.players, attempt.playerId)}</strong>: &quot;{attempt.text}&quot;{" "}
          {attempt.accepted ? "foi aceita pelos jogadores." : "foi recusada pelos jogadores."}
        </p>
      ))}
    </section>
  );
}
