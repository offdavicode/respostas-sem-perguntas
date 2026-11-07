"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { playSound } from "@/lib/client/sound";
import { ShareButton } from "./ShareButton";

type Info = { key: string; number: number; wordCount: number };

type Result = {
  correct: boolean;
  finished: boolean;
  points: number;
  answer: string | null;
  question: string | null;
  category: string | null;
};

type Progress = {
  order: number[];
  words: Record<number, string>;
  attempts: string[];
  stage: "reveal" | "guess";
  result: Result | null;
};

const EMPTY: Progress = { order: [], words: {}, attempts: [], stage: "reveal", result: null };
const storageKey = (key: string) => `rsp:daily:${key}`;

function loadProgress(key: string): Progress {
  try {
    const raw = window.localStorage.getItem(storageKey(key));
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Progress) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

function saveProgress(key: string, progress: Progress): void {
  try {
    window.localStorage.setItem(storageKey(key), JSON.stringify(progress));
  } catch {
    return;
  }
}

async function post<T>(body: unknown): Promise<T> {
  const response = await fetch("/api/daily", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Algo deu errado.");
  return data as T;
}

export function Daily() {
  const [info, setInfo] = useState<Info | null>(null);
  const [progress, setProgress] = useState<Progress>(EMPTY);
  const [guess, setGuess] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/daily", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: Info) => {
        if (!active) return;
        setInfo(data);
        setProgress(loadProgress(data.key));
      })
      .catch(() => {
        if (active) setError("Não foi possível carregar o desafio.");
      });
    return () => {
      active = false;
    };
  }, []);

  const update = useCallback(
    (next: Progress) => {
      setProgress(next);
      if (info) saveProgress(info.key, next);
    },
    [info],
  );

  useEffect(() => {
    if (progress.stage === "guess" && !progress.result) inputRef.current?.focus();
  }, [progress.stage, progress.result]);

  async function run<T>(work: () => Promise<T>): Promise<T | null> {
    setBusy(true);
    setError(null);
    try {
      return await work();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Algo deu errado.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function reveal(position: number) {
    if (!info) return;
    const data = await run(() =>
      post<{ position: number; word: string }>({ key: info.key, action: "reveal", position }),
    );
    if (!data) return;
    playSound("reveal");
    update({
      ...progress,
      order: [...progress.order, position],
      words: { ...progress.words, [position]: data.word },
      stage: "guess",
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!info || !guess.trim()) return;
    const text = guess;
    const data = await run(() =>
      post<Result>({ key: info.key, action: "guess", text, revealed: progress.order }),
    );
    if (!data) return;
    setGuess("");
    playSound(data.correct ? "correct" : "wrong");
    update({
      ...progress,
      attempts: [...progress.attempts, text.trim()],
      stage: "reveal",
      result: data.finished ? data : null,
    });
  }

  async function giveUp() {
    if (!info) return;
    const data = await run(() =>
      post<Result>({ key: info.key, action: "give-up", revealed: progress.order }),
    );
    if (data) update({ ...progress, result: data });
  }

  function skipGuess() {
    if (info && progress.order.length >= info.wordCount) void giveUp();
    else update({ ...progress, stage: "reveal" });
  }

  const header = (
    <header className="topbar">
      <Link className="brand" href="/">
        Respostas sem Perguntas
      </Link>
      {info && <span className="tag">Desafio {info.number}</span>}
    </header>
  );

  if (!info) {
    return (
      <main className="room">
        {header}
        {error ? <p className="error">{error}</p> : <p className="title">Carregando...</p>}
      </main>
    );
  }

  const { order, words, attempts, stage, result } = progress;
  const positions = Array.from({ length: info.wordCount }, (_, index) => index);
  const fullWords = result?.question?.split(/\s+/);
  const nextValue = Math.max(1, info.wordCount - order.length - (stage === "reveal" ? 0 : -1));
  const headline = result
    ? result.correct
      ? `Você acertou! ${result.points} ${result.points === 1 ? "ponto" : "pontos"}`
      : "Hoje não deu"
    : stage === "reveal"
      ? "Escolha uma palavra"
      : "Arrisque uma resposta";
  const shareSummary = result?.correct
    ? `Acertei o desafio ${info.number} de Respostas sem Perguntas revelando ${order.length} de ${info.wordCount} palavras.`
    : `Não acertei o desafio ${info.number} de Respostas sem Perguntas. Consegue fazer melhor?`;

  return (
    <main className="room daily">
      {header}
      <div className="board">
        <section className="block panel">
          <div className="status">
            <h1 className="daily-title" aria-live="polite">
              {headline}
            </h1>
            {!result && (
              <div className="value block block-yellow">
                <b>{nextValue}</b>
                <small>{nextValue === 1 ? "ponto" : "pontos"}</small>
              </div>
            )}
          </div>
        </section>

        <section className="tiles" aria-label={`Pergunta com ${info.wordCount} palavras`}>
          {positions.map((position) => {
            const word = words[position] ?? fullWords?.[position];
            if (word) {
              return (
                <div
                  key={position}
                  className={`tile word block ${words[position] ? "block-mint" : "block-sky"} ${
                    order[order.length - 1] === position && !result ? "fresh" : ""
                  }`}
                >
                  {word}
                </div>
              );
            }
            return stage === "reveal" && !result ? (
              <button
                key={position}
                type="button"
                className="tile block block-yellow"
                aria-label={`Revelar palavra ${position + 1}`}
                disabled={busy}
                onClick={() => void reveal(position)}
              >
                {position + 1}
              </button>
            ) : (
              <div key={position} className="tile block locked">
                {position + 1}
              </div>
            );
          })}
        </section>

        {!result && stage === "guess" && (
          <form className="guess-form block panel" onSubmit={submit}>
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
            <button type="button" className="button block" disabled={busy} onClick={skipGuess}>
              {order.length >= info.wordCount ? "Ver resposta" : "Revelar outra"}
            </button>
          </form>
        )}

        {!result && order.length > 0 && stage === "reveal" && (
          <button type="button" className="button block" disabled={busy} onClick={() => void giveUp()}>
            Desistir e ver a resposta
          </button>
        )}

        {result && (
          <section className="block block-yellow panel stack">
            <div>
              <p>A resposta era</p>
              <p className="title reveal-answer">{result.answer}</p>
            </div>
            <p>
              {result.category && <strong>{result.category}: </strong>}
              {result.question}
            </p>
            <p>
              Você revelou {order.length} de {info.wordCount} palavras. Volte amanhã para um novo desafio.
            </p>
            <ShareButton
              image={{
                title: `Pergunta do dia ${info.number}`,
                headline: result.correct ? `${result.points} ${result.points === 1 ? "ponto" : "pontos"}` : "Não acertei",
                subtitle: `${order.length} de ${info.wordCount} palavras reveladas`,
                tiles: positions.map((position) => order.includes(position)),
              }}
              text={shareSummary}
              filename={`pergunta-do-dia-${info.number}.png`}
            />
          </section>
        )}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {attempts.length > 0 && (
          <section className="block panel">
            <h2 className="section-title">Suas tentativas</h2>
            <ul className="feed">
              {[...attempts].reverse().map((attempt, index) => (
                <li key={index} className={result?.correct && index === 0 ? "right" : ""}>
                  {attempt}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
