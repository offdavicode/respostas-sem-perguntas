"use client";

import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { playSound } from "@/lib/client/sound";
import { useNow } from "@/lib/client/useRoom";
import { CATEGORIES, type Action, type PublicAttempt, type PublicState } from "@/lib/game/types";
import { ContestPanel } from "./ContestPanel";
import { PlayerList, playerName } from "./PlayerList";
import { ReactionBar } from "./Reactions";

type Props = {
  state: PublicState;
  act: (action: Action) => Promise<boolean>;
  busy: boolean;
  offsetMs: number;
  chat: ReactNode;
};

const formatTime = (ms: number) =>
  `${(ms / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} s`;

function Timer({ deadline, duration, offsetMs }: { deadline: number; duration: number; offsetMs: number }) {
  const now = useNow(true, offsetMs);
  const remaining = now ? Math.max(0, deadline - now) : duration;
  const seconds = Math.ceil(remaining / 1000);
  const lastTick = useRef<number | null>(null);

  useEffect(() => {
    if (seconds > 0 && seconds <= 5 && lastTick.current !== seconds) playSound("tick");
    lastTick.current = seconds;
  }, [seconds]);

  return (
    <div className={`timer${seconds <= 5 ? " urgent" : ""}`} role="timer" aria-label={`${seconds} segundos`}>
      <div className="timer-track">
        <div className="timer-fill" style={{ transform: `scaleX(${Math.min(1, remaining / duration)})` }} />
      </div>
      <span className="timer-number">{seconds}</span>
    </div>
  );
}

function ResultsTable({ state, attempts }: { state: PublicState; attempts: PublicAttempt[] }) {
  const winnerId = state.round?.winnerId;
  const ordered = [...attempts].sort((a, b) => (a.elapsedMs ?? 0) - (b.elapsedMs ?? 0));
  const missing = state.players.filter(
    (player) => player.playing && !attempts.some((attempt) => attempt.playerId === player.id),
  );
  return (
    <table className="results-table">
      <thead>
        <tr>
          <th scope="col">Jogador</th>
          <th scope="col">Resposta</th>
          <th scope="col" style={{ textAlign: "right" }}>
            Tempo
          </th>
        </tr>
      </thead>
      <tbody>
        {ordered.map((attempt) => (
          <tr key={attempt.playerId} className={attempt.playerId === winnerId ? "winner" : ""}>
            <td>{playerName(state.players, attempt.playerId)}</td>
            <td>
              {attempt.text} {attempt.correct ? "(certa)" : "(errada)"}
            </td>
            <td className="time">{formatTime(attempt.elapsedMs ?? 0)}</td>
          </tr>
        ))}
        {missing.map((player) => (
          <tr key={player.id}>
            <td>{player.name}</td>
            <td className="muted">Não respondeu</td>
            <td className="time">—</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function GameBoard({ state, act, busy, offsetMs, chat }: Props) {
  const round = state.round!;
  const [guess, setGuess] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const simultaneous = state.config.mode === "simultaneous";
  const isCurrent = round.currentPlayerId === state.you;
  const me = state.players.find((player) => player.id === state.you);
  const canPlay = !!me?.playing;
  const currentName = playerName(state.players, round.currentPlayerId);
  const winnerName = playerName(state.players, round.winnerId);

  const currentAttempts = round.attempts.filter((a) => a.revealCount === round.revealedCount);
  const alreadyAnswered = currentAttempts.some((a) => a.playerId === state.you);
  const canReveal = round.stage === "reveal" && isCurrent && canPlay;
  const canGuess =
    round.stage === "guess" && canPlay && !alreadyAnswered && (simultaneous || isCurrent);
  const answeredIds =
    simultaneous && round.stage === "guess"
      ? new Set(currentAttempts.map((attempt) => attempt.playerId))
      : undefined;

  const guessKey = `${state.questionIndex}:${round.revealedCount}:${round.currentPlayerId}:${canGuess}`;
  useEffect(() => {
    const timer = setTimeout(() => {
      setGuess("");
      if (canGuess && document.activeElement?.tagName !== "INPUT") inputRef.current?.focus();
    }, 0);
    return () => clearTimeout(timer);
  }, [guessKey, canGuess]);

  const previous = useRef({ revealed: round.revealedCount, attempts: round.attempts.length, stage: round.stage });
  useEffect(() => {
    const before = previous.current;
    if (round.revealedCount > before.revealed) playSound("reveal");
    if (round.stage === "question-end" && before.stage !== "question-end") {
      playSound(round.winnerId ? "correct" : "wrong");
    } else if (round.stage === "results" && before.stage !== "results") {
      playSound(round.winnerId ? "correct" : "wrong");
    } else if (!simultaneous && round.attempts.length > before.attempts) {
      playSound("wrong");
    }
    previous.current = { revealed: round.revealedCount, attempts: round.attempts.length, stage: round.stage };
  }, [round.attempts.length, round.revealedCount, round.stage, round.winnerId, simultaneous]);

  async function submitGuess(event: FormEvent) {
    event.preventDefault();
    if (guess.trim()) await act({ type: "guess", text: guess });
  }

  let headline: string;
  if (round.stage === "question-end") {
    headline = round.contest
      ? `${playerName(state.players, round.contest.playerId)} contestou`
      : round.winnerId
        ? `${winnerName} acertou!`
        : round.attempts.some((attempt) => attempt.accepted)
          ? "Resposta aceita pelos jogadores"
          : "Ninguém acertou";
  } else if (round.stage === "results") {
    headline = round.winnerId ? `${winnerName} foi mais rápido!` : "Ninguém acertou nesta revelação";
  } else if (round.stage === "reveal") {
    headline = canReveal ? "Sua vez: escolha uma palavra" : `${currentName} está escolhendo`;
  } else if (simultaneous) {
    headline = alreadyAnswered ? "Resposta enviada" : "Responda rápido!";
  } else {
    headline = isCurrent ? "Sua vez: arrisque uma resposta" : `${currentName} está respondendo`;
  }

  const visibleAttempts = round.attempts.filter((a) => a.text !== null);
  const history = simultaneous
    ? visibleAttempts.filter((a) => a.revealCount < round.revealedCount)
    : visibleAttempts;
  const showResults =
    simultaneous && (round.stage === "results" || (round.stage === "question-end" && round.revealedCount > 0));
  const categoryLabel = CATEGORIES.find((category) => category.id === round.categoryId)?.label;

  return (
    <div className="game">
      <div className="board">
        <section className="block panel">
          <div className="status">
            <h2 aria-live="polite">{headline}</h2>
            {round.stage !== "question-end" && round.stage !== "results" && (
              <div className="value block block-yellow">
                <b>{round.value}</b>
                <small>{round.value === 1 ? "ponto" : "pontos"}</small>
              </div>
            )}
          </div>
          <Timer
            key={round.deadline}
            deadline={round.deadline}
            duration={round.stageDurationMs}
            offsetMs={offsetMs}
          />
        </section>

        <section aria-label={`Pergunta com ${round.words.length} palavras`}>
          <div className="tiles">
            {round.words.map((word, index) => {
              if (word !== null) {
                const fresh = index === round.lastRevealed && round.stage !== "question-end";
                return (
                  <div
                    key={index}
                    className={`tile word block ${
                      round.stage === "question-end" ? "block-sky" : "block-mint"
                    } ${fresh ? "fresh" : ""}`}
                  >
                    {word}
                  </div>
                );
              }
              return canReveal ? (
                <button
                  key={index}
                  type="button"
                  className="tile block block-yellow"
                  aria-label={`Revelar palavra ${index + 1}`}
                  disabled={busy}
                  onClick={() => void act({ type: "reveal", position: index })}
                >
                  {index + 1}
                </button>
              ) : (
                <div key={index} className="tile block locked" aria-label={`Palavra ${index + 1} oculta`}>
                  {index + 1}
                </div>
              );
            })}
          </div>
        </section>

        <ReactionBar act={act} />

        {round.stage === "question-end" && (
          <section className="block block-yellow panel stack">
            <div>
              <p>A resposta era</p>
              <p className="title reveal-answer">{round.answer}</p>
            </div>
            {round.winnerId ? (
              <p>
                <strong>{winnerName}</strong> ganhou {round.points}{" "}
                {round.points === 1 ? "ponto" : "pontos"}.
              </p>
            ) : (
              !round.attempts.some((attempt) => attempt.accepted) && <p>Ninguém pontuou nesta pergunta.</p>
            )}
            <p>
              {categoryLabel && <strong>{categoryLabel}: </strong>}
              {round.questionText}
            </p>
          </section>
        )}

        {round.stage === "question-end" && <ContestPanel state={state} act={act} busy={busy} />}

        {showResults && round.attempts.length > 0 && (
          <section className="block panel">
            <h3 className="section-title">Quadro de tempos</h3>
            <ResultsTable state={state} attempts={currentAttempts} />
          </section>
        )}

        {canGuess && (
          <form className="guess-form block panel" onSubmit={submitGuess}>
            <input
              ref={inputRef}
              className="input"
              value={guess}
              onChange={(event) => setGuess(event.target.value)}
              maxLength={60}
              autoComplete="off"
              aria-label="Sua resposta"
              placeholder="Qual é a resposta?"
            />
            <button className="button block block-mint" disabled={busy || !guess.trim()}>
              Responder
            </button>
            {!simultaneous && (
              <button
                type="button"
                className="button block"
                disabled={busy}
                onClick={() => void act({ type: "pass" })}
              >
                Passar
              </button>
            )}
          </form>
        )}

        {!canPlay && round.stage !== "question-end" && (
          <p className="block panel waiting">Você entra na próxima pergunta. Por enquanto, observe!</p>
        )}

        {simultaneous && alreadyAnswered && round.stage === "guess" && (
          <p className="block panel waiting">Aguardando os outros jogadores responderem...</p>
        )}

        {history.length > 0 && (
          <section className="block panel">
            <h3 className="section-title">Tentativas</h3>
            <ul className="feed">
              {[...history].reverse().map((attempt, index) => (
                <li key={`${attempt.playerId}-${attempt.revealCount}-${index}`} className={attempt.correct ? "right" : ""}>
                  <span className="who">{playerName(state.players, attempt.playerId)}</span>
                  <span>tentou: {attempt.text}</span>
                  {simultaneous && attempt.elapsedMs !== null && (
                    <span className="time">{formatTime(attempt.elapsedMs)}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <aside className="sidebar">
        <section className="block panel">
          <h2 className="section-title">Placar</h2>
          <PlayerList
            players={state.players}
            you={state.you}
            hostId={state.hostId}
            currentId={round.stage === "reveal" || !simultaneous ? round.currentPlayerId : null}
            answeredIds={answeredIds}
            showScore
            onKick={(playerId) => void act({ type: "kick", playerId })}
          />
        </section>
        {chat}
      </aside>
    </div>
  );
}
