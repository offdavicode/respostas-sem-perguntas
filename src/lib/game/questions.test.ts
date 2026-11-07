import { describe, expect, it } from "vitest";
import { isCorrectAnswer, normalizeAnswer } from "./answers";
import { QUESTIONS } from "./questions";
import { CATEGORIES } from "./types";

describe("banco de perguntas", () => {
  it("tem pelo menos 280 perguntas e 30 ou mais por categoria", () => {
    expect(QUESTIONS.length).toBeGreaterThanOrEqual(280);
    for (const { id } of CATEGORIES) {
      expect(QUESTIONS.filter((q) => q.category === id).length).toBeGreaterThanOrEqual(30);
    }
  });

  it("não repete perguntas", () => {
    const texts = QUESTIONS.map((q) => normalizeAnswer(q.text));
    expect(new Set(texts).size).toBe(texts.length);
  });

  it("toda resposta é curta, reconhecível e não aparece na própria pergunta", () => {
    for (const q of QUESTIONS) {
      expect(q.answer.split(" ").length, q.text).toBeLessThanOrEqual(4);
      expect(isCorrectAnswer(q.answer, q.answer), q.text).toBe(true);
      expect(normalizeAnswer(q.text).split(" "), q.text).not.toContain(normalizeAnswer(q.answer));
    }
  });
});
