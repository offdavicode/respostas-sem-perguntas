import { connection } from "next/server";
import { isCorrectAnswer } from "@/lib/game/answers";
import { dailyKey, dailyNumber, dailyQuestion } from "@/lib/game/daily";
import { GameError, questionWords } from "@/lib/game/engine";
import { QUESTIONS } from "@/lib/game/questions";
import { CATEGORIES, type Question } from "@/lib/game/types";
import { readJson, respond } from "@/lib/server/http";

function today(): { key: string; question: Question; words: string[] } {
  const key = dailyKey(Date.now());
  const question = dailyQuestion(key, QUESTIONS);
  return { key, question, words: questionWords(question) };
}

function readRevealed(raw: unknown, total: number): number[] {
  const positions = Array.isArray(raw) ? raw.map(Number) : [];
  const valid = positions.every((p) => Number.isInteger(p) && p >= 0 && p < total);
  if (!valid || new Set(positions).size !== positions.length) {
    throw new GameError("Palavras inválidas.");
  }
  return positions;
}

function outcome(question: Question, correct: boolean, finished: boolean, revealCount: number, total: number) {
  return {
    correct,
    finished,
    points: correct ? Math.max(1, total - revealCount + 1) : 0,
    answer: finished ? question.answer : null,
    question: finished ? question.text : null,
    category: finished ? (CATEGORIES.find((c) => c.id === question.category)?.label ?? null) : null,
  };
}

export async function GET() {
  await connection();
  return respond(async () => {
    const { key, words } = today();
    return { key, number: dailyNumber(key), wordCount: words.length };
  });
}

export async function POST(request: Request) {
  return respond(async () => {
    const body = await readJson(request);
    const { key, question, words } = today();
    if (body.key !== key) throw new GameError("O desafio mudou. Recarregue a página.");

    if (body.action === "reveal") {
      const position = Number(body.position);
      if (!Number.isInteger(position) || position < 0 || position >= words.length) {
        throw new GameError("Palavra inválida.");
      }
      return { position, word: words[position] };
    }

    const revealed = readRevealed(body.revealed, words.length);
    if (body.action === "give-up") {
      return outcome(question, false, true, revealed.length, words.length);
    }
    if (body.action === "guess") {
      if (revealed.length === 0) throw new GameError("Revele uma palavra antes de responder.");
      const text = String(body.text ?? "").trim().slice(0, 60);
      if (!text) throw new GameError("Digite uma resposta.");
      const correct = isCorrectAnswer(text, question.answer);
      const finished = correct || revealed.length >= words.length;
      return outcome(question, correct, finished, revealed.length, words.length);
    }
    throw new GameError("Ação inválida.");
  });
}
