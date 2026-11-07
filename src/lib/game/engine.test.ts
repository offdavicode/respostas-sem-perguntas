import { describe, expect, it } from "vitest";
import { isCorrectAnswer, mentionsAnswer, normalizeAnswer } from "./answers";
import { avatarSvg, randomAvatar, sanitizeAvatar } from "./avatar";
import { dailyKey, dailyNumber, dailyQuestion } from "./daily";
import { censorProfanity } from "./profanity";
import { QUESTIONS } from "./questions";
import {
  CONTEST_MS,
  KickedError,
  QUESTION_END_MS,
  REACTION_TTL_MS,
  RESULTS_MS,
  SIMULTANEOUS_CHOOSE_MS,
  SIMULTANEOUS_GUESS_MS,
  addPlayer,
  advance,
  applyAction,
  cleanName,
  createRoom,
  toPublicState,
} from "./engine";
import type { EngineContext, Player, Question, Room } from "./types";

const questions: Question[] = [
  { id: "q1", category: "geografia", text: "Qual é a capital do Brasil?", answer: "Brasília" },
  { id: "q2", category: "geografia", text: "Maior oceano do mundo", answer: "Pacífico" },
  { id: "q3", category: "ciencias", text: "Planeta vermelho", answer: "Marte" },
];

function player(id: string, joinedAt = 0): Player {
  return { id, token: `t-${id}`, name: id, score: 0, joinedAt, playsFromQuestion: 0 };
}

function setup(mode: "turns" | "simultaneous" = "turns") {
  const room = createRoom("ABCD", player("ana", 1), 0);
  addPlayer(room, player("bia", 2));
  addPlayer(room, player("caio", 3));
  room.config.mode = mode;
  room.config.questionCount = 3;
  const ctx: EngineContext = {
    now: 1000,
    online: new Set(["ana", "bia", "caio"]),
    allQuestions: questions,
    getQuestion: (id) => questions.find((q) => q.id === id)!,
    random: () => 0.999,
  };
  applyAction(room, "ana", { type: "start" }, ctx);
  return { room, ctx };
}

const round = (room: Room) => room.game!.round;
const q = (room: Room, ctx: EngineContext) => ctx.getQuestion(round(room).questionId);

describe("correção de respostas", () => {
  it("ignora acentos, maiúsculas e artigos", () => {
    expect(isCorrectAnswer("BRASILIA", "Brasília")).toBe(true);
    expect(isCorrectAnswer("a Brasília", "Brasília")).toBe(true);
    expect(isCorrectAnswer("o Brasil", "Brasil")).toBe(true);
    expect(normalizeAnswer("  Ó  Pará! ")).toBe("para");
  });

  it("tolera pequenos erros de digitação conforme o tamanho", () => {
    expect(isCorrectAnswer("Brazilia", "Brasília")).toBe(true);
    expect(isCorrectAnswer("Marre", "Marte")).toBe(true);
    expect(isCorrectAnswer("Lua", "Sol")).toBe(false);
    expect(isCorrectAnswer("Oso", "Ouro")).toBe(false);
  });

  it("não aceita variações nem resposta vazia", () => {
    expect(isCorrectAnswer("Rio", "Rio de Janeiro")).toBe(false);
    expect(isCorrectAnswer("", "Marte")).toBe(false);
    expect(isCorrectAnswer("1950", "1958")).toBe(false);
  });
});

describe("Modo Turnos", () => {
  it("pontua pelo número de palavras reveladas e passa a vez ao errar", () => {
    const { room, ctx } = setup();
    const total = q(room, ctx).text.split(" ").length;
    expect(round(room).currentPlayerId).toBe("ana");

    applyAction(room, "ana", { type: "reveal", position: 0 }, ctx);
    applyAction(room, "ana", { type: "guess", text: "errado" }, ctx);
    expect(round(room).currentPlayerId).toBe("bia");
    expect(round(room).stage).toBe("reveal");

    applyAction(room, "bia", { type: "reveal", position: 1 }, ctx);
    applyAction(room, "bia", { type: "guess", text: q(room, ctx).answer }, ctx);
    expect(room.players.find((p) => p.id === "bia")!.score).toBe(total - 1);
    expect(round(room).stage).toBe("question-end");
  });

  it("só permite ação de quem está na vez e proíbe responder sem revelar", () => {
    const { room, ctx } = setup();
    expect(() => applyAction(room, "bia", { type: "reveal", position: 0 }, ctx)).toThrow();
    expect(() => applyAction(room, "ana", { type: "guess", text: "x" }, ctx)).toThrow();
    applyAction(room, "ana", { type: "reveal", position: 0 }, ctx);
    expect(() => applyAction(room, "ana", { type: "reveal", position: 1 }, ctx)).toThrow();
  });

  it("perde a vez sem revelar quando o tempo acaba", () => {
    const { room, ctx } = setup();
    ctx.now += room.config.turnSeconds * 1000 + 1;
    expect(advance(room, ctx)).toBe(true);
    expect(round(room).currentPlayerId).toBe("bia");
    expect(round(room).revealed).toHaveLength(0);
  });

  it("encerra sem pontos quando tudo foi revelado e ninguém acertou", () => {
    const { room, ctx } = setup();
    const total = q(room, ctx).text.split(" ").length;
    for (let i = 0; i < total; i++) {
      const id = round(room).currentPlayerId;
      applyAction(room, id, { type: "reveal", position: i }, ctx);
      applyAction(room, id, { type: "guess", text: "nada a ver" }, ctx);
    }
    expect(round(room).stage).toBe("question-end");
    expect(room.players.every((p) => p.score === 0)).toBe(true);
  });

  it("pula quem caiu e permite passar a vez", () => {
    const { room, ctx } = setup();
    applyAction(room, "ana", { type: "reveal", position: 0 }, ctx);
    applyAction(room, "ana", { type: "pass" }, ctx);
    expect(round(room).currentPlayerId).toBe("bia");
    ctx.online.delete("bia");
    advance(room, ctx);
    expect(round(room).currentPlayerId).toBe("caio");
  });

  it("mostra erros a todos e não vaza palavras ocultas", () => {
    const { room, ctx } = setup();
    applyAction(room, "ana", { type: "reveal", position: 0 }, ctx);
    applyAction(room, "ana", { type: "guess", text: "Paris" }, ctx);
    const view = toPublicState(room, "bia", ctx);
    expect(view.round!.attempts[0].text).toBe("Paris");
    expect(view.round!.words.filter(Boolean)).toHaveLength(1);
    expect(view.round!.answer).toBeNull();
    expect(view.round!.categoryId).toBeNull();
    expect(JSON.stringify(view)).not.toContain(q(room, ctx).answer);
    expect(JSON.stringify(view)).not.toContain("t-ana");
  });

  it("termina a partida depois da última pergunta", () => {
    const { room, ctx } = setup();
    for (let i = 0; i < 3; i++) {
      const id = round(room).currentPlayerId;
      applyAction(room, id, { type: "reveal", position: 0 }, ctx);
      applyAction(room, id, { type: "guess", text: q(room, ctx).answer }, ctx);
      ctx.now += QUESTION_END_MS + 1;
      advance(room, ctx);
    }
    expect(room.phase).toBe("finished");
    expect(new Set(room.game!.questionIds).size).toBe(3);
  });
});

describe("Modo Simultâneo", () => {
  function revealAll(room: Room, ctx: EngineContext) {
    applyAction(room, round(room).currentPlayerId, { type: "reveal", position: 0 }, ctx);
  }

  it("dá os pontos só ao primeiro acerto e registra o tempo de todos", () => {
    const { room, ctx } = setup("simultaneous");
    revealAll(room, ctx);
    const answer = q(room, ctx).answer;
    const total = q(room, ctx).text.split(" ").length;

    ctx.now += 3000;
    applyAction(room, "caio", { type: "guess", text: answer }, ctx);
    ctx.now += 1000;
    applyAction(room, "ana", { type: "guess", text: answer }, ctx);
    ctx.now += 500;
    applyAction(room, "bia", { type: "guess", text: "outra" }, ctx);
    advance(room, ctx);

    expect(round(room).stage).toBe("results");
    expect(round(room).winnerId).toBe("caio");
    expect(room.players.find((p) => p.id === "caio")!.score).toBe(total);
    expect(room.players.find((p) => p.id === "ana")!.score).toBe(0);
    const view = toPublicState(room, "ana", ctx);
    expect(view.round!.attempts.map((a) => a.elapsedMs)).toEqual([3000, 4000, 4500]);
  });

  it("esconde as respostas dos outros até o fim da revelação", () => {
    const { room, ctx } = setup("simultaneous");
    revealAll(room, ctx);
    applyAction(room, "caio", { type: "guess", text: q(room, ctx).answer }, ctx);
    const other = toPublicState(room, "ana", ctx).round!.attempts[0];
    expect(other.text).toBeNull();
    expect(other.correct).toBeNull();
    expect(other.elapsedMs).toBeNull();
    const own = toPublicState(room, "caio", ctx).round!.attempts[0];
    expect(own.text).toBe(q(room, ctx).answer);
    expect(own.correct).toBeNull();
  });

  it("aceita uma tentativa por revelação", () => {
    const { room, ctx } = setup("simultaneous");
    revealAll(room, ctx);
    applyAction(room, "ana", { type: "guess", text: "a" }, ctx);
    expect(() => applyAction(room, "ana", { type: "guess", text: "b" }, ctx)).toThrow();
  });

  it("revela ao acaso se o tempo de escolha acabar e avança o revezamento", () => {
    const { room, ctx } = setup("simultaneous");
    ctx.now += SIMULTANEOUS_CHOOSE_MS + 1;
    advance(room, ctx);
    expect(round(room).stage).toBe("guess");
    expect(round(room).revealed).toHaveLength(1);

    ctx.now += SIMULTANEOUS_GUESS_MS + 500;
    advance(room, ctx);
    expect(round(room).stage).toBe("results");
    expect(round(room).winnerId).toBeNull();

    ctx.now += RESULTS_MS + 1;
    advance(room, ctx);
    expect(round(room).stage).toBe("reveal");
    expect(round(room).currentPlayerId).toBe("bia");
  });

  it("vai para o fim da pergunta depois de um acerto", () => {
    const { room, ctx } = setup("simultaneous");
    revealAll(room, ctx);
    for (const id of ["ana", "bia", "caio"]) {
      applyAction(room, id, { type: "guess", text: q(room, ctx).answer }, ctx);
    }
    advance(room, ctx);
    ctx.now += RESULTS_MS + 1;
    advance(room, ctx);
    expect(round(room).stage).toBe("question-end");
    expect(toPublicState(room, "ana", ctx).round!.answer).toBe(q(room, ctx).answer);
  });
});

describe("Entradas e saídas", () => {
  it("quem chega durante a partida só joga na pergunta seguinte", () => {
    const { room, ctx } = setup("simultaneous");
    addPlayer(room, player("davi", 9));
    ctx.online.add("davi");
    applyAction(room, round(room).currentPlayerId, { type: "reveal", position: 0 }, ctx);
    expect(() => applyAction(room, "davi", { type: "guess", text: "x" }, ctx)).toThrow();
    for (const id of ["ana", "bia", "caio"]) {
      applyAction(room, id, { type: "guess", text: "x" }, ctx);
    }
    advance(room, ctx);
    expect(round(room).stage).toBe("results");
  });

  it("recusa sala cheia e apelido repetido", () => {
    const { room } = setup();
    expect(() => addPlayer(room, { ...player("x"), name: "ANA" })).toThrow();
    for (const id of ["d", "e", "f", "g", "h"]) addPlayer(room, player(id));
    expect(() => addPlayer(room, player("i"))).toThrow();
  });

  it("passa o anfitrião ao jogador mais antigo quando ele cai ou sai", () => {
    const { room, ctx } = setup();
    ctx.online.delete("ana");
    advance(room, ctx);
    expect(room.hostId).toBe("bia");

    applyAction(room, "bia", { type: "leave" }, ctx);
    expect(room.hostId).not.toBe("bia");
    expect(room.players.some((p) => p.id === "bia")).toBe(false);
  });

  it("não repete perguntas ao jogar de novo enquanto houver novas", () => {
    const { room, ctx } = setup();
    room.phase = "finished";
    const first = [...room.game!.questionIds];
    applyAction(room, room.hostId, { type: "back-to-lobby" }, ctx);
    room.config.questionCount = 3;
    applyAction(room, room.hostId, { type: "start" }, ctx);
    expect(room.game!.questionIds).toHaveLength(first.length);
  });
});

describe("Chat", () => {
  it("guarda mensagens, limpa o texto e aceita salas antigas sem chat", () => {
    const { room, ctx } = setup();
    delete room.chat;
    applyAction(room, "bia", { type: "chat", text: "  oi   gente " }, ctx);
    const view = toPublicState(room, "ana", ctx);
    expect(view.chat).toHaveLength(1);
    expect(view.chat[0]).toMatchObject({ name: "bia", text: "oi gente" });
    expect(JSON.stringify(view.chat)).not.toContain("t-bia");
  });

  it("recusa mensagem vazia e envio repetido em sequência", () => {
    const { room, ctx } = setup();
    expect(() => applyAction(room, "ana", { type: "chat", text: "   " }, ctx)).toThrow();
    applyAction(room, "ana", { type: "chat", text: "um" }, ctx);
    expect(() => applyAction(room, "ana", { type: "chat", text: "dois" }, ctx)).toThrow();
    ctx.now += 600;
    applyAction(room, "ana", { type: "chat", text: "dois" }, ctx);
    expect(room.chat).toHaveLength(2);
  });

  it("limita o tamanho da mensagem e o histórico", () => {
    const { room, ctx } = setup();
    for (let i = 0; i < 70; i++) {
      ctx.now += 600;
      applyAction(room, "ana", { type: "chat", text: "x".repeat(500) }, ctx);
    }
    expect(room.chat).toHaveLength(60);
    expect(room.chat![0].text).toHaveLength(200);
  });

  it("esconde dos outros a mensagem que entrega a resposta, sem avisar quem escreveu", () => {
    const { room, ctx } = setup();
    const answer = q(room, ctx).answer;
    applyAction(room, "ana", { type: "chat", text: `acho que é ${answer}!` }, ctx);
    expect(toPublicState(room, "bia", ctx).chat[0].text).toBeNull();
    expect(JSON.stringify(toPublicState(room, "bia", ctx).chat)).not.toContain(answer);
    const own = toPublicState(room, "ana", ctx).chat[0];
    expect(own.text).toContain(answer);
    expect(Object.keys(own)).not.toContain("hidden");
  });

  it("libera a resposta no chat quando a pergunta já acabou", () => {
    const { room, ctx } = setup();
    const answer = q(room, ctx).answer;
    applyAction(room, "ana", { type: "reveal", position: 0 }, ctx);
    applyAction(room, "ana", { type: "guess", text: answer }, ctx);
    applyAction(room, "bia", { type: "chat", text: `era ${answer} mesmo` }, ctx);
    expect(toPublicState(room, "ana", ctx).chat[0].text).toContain(answer);
  });

  it("não confunde palavras comuns com respostas curtas", () => {
    expect(mentionsAnswer("passei pela rua", "Pele")).toBe(false);
    expect(mentionsAnswer("é a PELE", "Pele")).toBe(true);
    expect(mentionsAnswer("sei lá, microscopio?", "Microscópio")).toBe(true);
    expect(mentionsAnswer("foi em buenos aires", "Buenos Aires")).toBe(true);
    expect(mentionsAnswer("buenos dias", "Buenos Aires")).toBe(false);
  });
});

describe("Filtro de palavrões", () => {
  it("censura palavras e variações, sem atingir palavras comuns", () => {
    expect(censorProfanity("que merda")).toBe("que *****");
    expect(censorProfanity("M3RD4 e P0RRA")).toBe("***** e *****");
    expect(censorProfanity("poooorra")).toBe("********");
    expect(censorProfanity("p u t a")).toBe("*******");
    expect(censorProfanity("fiz um curso de computação")).toBe("fiz um curso de computação");
    expect(censorProfanity("a capital é Brasília")).toBe("a capital é Brasília");
  });

  it("recusa apelidos ofensivos e aceita os comuns", () => {
    expect(() => cleanName("caralho123")).toThrow();
    expect(() => cleanName("P0rra")).toThrow();
    expect(cleanName("Ana Paula")).toBe("Ana Paula");
    expect(cleanName("Curitiba")).toBe("Curitiba");
  });

  it("censura o chat e as tentativas públicas", () => {
    const { room, ctx } = setup();
    applyAction(room, "ana", { type: "chat", text: "que merda" }, ctx);
    expect(toPublicState(room, "bia", ctx).chat[0].text).toBe("que *****");
    applyAction(room, "ana", { type: "reveal", position: 0 }, ctx);
    applyAction(room, "ana", { type: "guess", text: "merda" }, ctx);
    expect(toPublicState(room, "bia", ctx).round!.attempts[0].text).toBe("*****");
  });
});

describe("Reações", () => {
  it("aparecem por pouco tempo, com limite de envio e só com opções válidas", () => {
    const { room, ctx } = setup();
    applyAction(room, "ana", { type: "react", reaction: "boa" }, ctx);
    expect(toPublicState(room, "bia", ctx).reactions).toHaveLength(1);
    expect(() => applyAction(room, "ana", { type: "react", reaction: "uau" }, ctx)).toThrow();
    ctx.now += REACTION_TTL_MS + 1;
    expect(toPublicState(room, "bia", ctx).reactions).toHaveLength(0);
    expect(() =>
      applyAction(room, "ana", { type: "react", reaction: "xingamento" as never }, ctx),
    ).toThrow();
  });
});

describe("Expulsar jogador", () => {
  it("só o anfitrião remove, e a pessoa não volta pelo mesmo aparelho", () => {
    const { room, ctx } = setup();
    room.players.find((p) => p.id === "caio")!.deviceId = "aparelho-1";
    expect(() => applyAction(room, "bia", { type: "kick", playerId: "caio" }, ctx)).toThrow();
    expect(() => applyAction(room, "ana", { type: "kick", playerId: "ana" }, ctx)).toThrow();
    applyAction(room, "ana", { type: "kick", playerId: "caio" }, ctx);
    expect(room.players.some((p) => p.id === "caio")).toBe(false);
    expect(room.kicked![0].token).toBe("t-caio");
    expect(() => addPlayer(room, { ...player("novo"), deviceId: "aparelho-1" })).toThrow(KickedError);
    addPlayer(room, { ...player("novo"), deviceId: "aparelho-2" });
  });

  it("passa a vez quando o jogador da vez é removido", () => {
    const { room, ctx } = setup();
    applyAction(room, "ana", { type: "reveal", position: 0 }, ctx);
    applyAction(room, "ana", { type: "guess", text: "errada" }, ctx);
    expect(round(room).currentPlayerId).toBe("bia");
    applyAction(room, "ana", { type: "kick", playerId: "bia" }, ctx);
    expect(round(room).currentPlayerId).toBe("caio");
    expect(round(room).stage).toBe("reveal");
  });
});

describe("Contestar resposta", () => {
  function endWithWrongAttempt() {
    const { room, ctx } = setup();
    const total = q(room, ctx).text.split(" ").length;
    applyAction(room, "ana", { type: "reveal", position: 0 }, ctx);
    applyAction(room, "ana", { type: "guess", text: "quase certa" }, ctx);
    applyAction(room, "bia", { type: "reveal", position: 1 }, ctx);
    applyAction(room, "bia", { type: "guess", text: q(room, ctx).answer }, ctx);
    return { room, ctx, total };
  }

  it("dá os pontos da tentativa quando a maioria aceita", () => {
    const { room, ctx, total } = endWithWrongAttempt();
    applyAction(room, "ana", { type: "contest", attemptIndex: 0 }, ctx);
    expect(round(room).contest).toBeTruthy();
    applyAction(room, "bia", { type: "vote", accept: true }, ctx);
    expect(advance(room, ctx)).toBe(false);
    applyAction(room, "caio", { type: "vote", accept: true }, ctx);
    advance(room, ctx);
    expect(round(room).contest).toBeNull();
    expect(room.players.find((p) => p.id === "ana")!.score).toBe(total);
    expect(round(room).attempts[0].accepted).toBe(true);
    expect(round(room).stage).toBe("question-end");
  });

  it("não dá pontos em empate e não deixa contestar de novo", () => {
    const { room, ctx } = endWithWrongAttempt();
    applyAction(room, "ana", { type: "contest", attemptIndex: 0 }, ctx);
    applyAction(room, "bia", { type: "vote", accept: true }, ctx);
    applyAction(room, "caio", { type: "vote", accept: false }, ctx);
    advance(room, ctx);
    expect(room.players.find((p) => p.id === "ana")!.score).toBe(0);
    expect(round(room).attempts[0].accepted).toBe(false);
    expect(() => applyAction(room, "ana", { type: "contest", attemptIndex: 0 }, ctx)).toThrow();
  });

  it("segura o avanço durante a votação e encerra no prazo", () => {
    const { room, ctx } = endWithWrongAttempt();
    applyAction(room, "ana", { type: "contest", attemptIndex: 0 }, ctx);
    ctx.now += CONTEST_MS - 1;
    advance(room, ctx);
    expect(round(room).contest).toBeTruthy();
    ctx.now += 2;
    advance(room, ctx);
    expect(round(room).contest).toBeNull();
    expect(round(room).stage).toBe("question-end");
    expect(room.game!.questionIndex).toBe(0);
  });

  it("impede contestar tentativa alheia, correta, antes do fim ou votar em si", () => {
    const { room, ctx } = setup();
    applyAction(room, "ana", { type: "reveal", position: 0 }, ctx);
    applyAction(room, "ana", { type: "guess", text: "errada" }, ctx);
    expect(() => applyAction(room, "ana", { type: "contest", attemptIndex: 0 }, ctx)).toThrow();
    const ended = endWithWrongAttempt();
    expect(() => applyAction(ended.room, "bia", { type: "contest", attemptIndex: 0 }, ended.ctx)).toThrow();
    expect(() => applyAction(ended.room, "bia", { type: "contest", attemptIndex: 1 }, ended.ctx)).toThrow();
    applyAction(ended.room, "ana", { type: "contest", attemptIndex: 0 }, ended.ctx);
    expect(() => applyAction(ended.room, "ana", { type: "vote", accept: true }, ended.ctx)).toThrow();
    const view = toPublicState(ended.room, "bia", ended.ctx);
    expect(view.round!.contest!.canVote).toBe(true);
    expect(view.round!.contest!.voterCount).toBe(2);
  });
});

describe("Avatares", () => {
  it("descarta valores inválidos e gera imagem sem conteúdo injetado", () => {
    const avatar = sanitizeAvatar({ color: 999, hat: 2, eyes: "<script>", head: 1.5 });
    expect(avatar).toEqual({ color: 0, background: 0, head: 0, eyes: 0, mouth: 0, hat: 2 });
    expect(avatarSvg(avatar)).not.toContain("script");
    for (let i = 0; i < 40; i++) {
      const random = randomAvatar();
      expect(sanitizeAvatar(random)).toEqual(random);
      expect(avatarSvg(random)).toContain("<svg");
    }
  });

  it("aparece na visão pública mesmo em salas antigas", () => {
    const { room, ctx } = setup();
    delete room.players[0].avatar;
    expect(toPublicState(room, "ana", ctx).players[0].avatar).toEqual(sanitizeAvatar({}));
  });
});

describe("Pergunta do dia", () => {
  it("é igual para todos no mesmo dia e não repete tão cedo", () => {
    expect(dailyQuestion("2026-11-07", QUESTIONS).id).toBe(
      dailyQuestion("2026-11-07", [...QUESTIONS].reverse()).id,
    );
    const ids = new Set<string>();
    for (let day = 1; day <= 28; day++) {
      ids.add(dailyQuestion(`2026-11-${String(day).padStart(2, "0")}`, QUESTIONS).id);
    }
    expect(ids.size).toBe(28);
  });

  it("vira o dia pelo horário de Brasília", () => {
    expect(dailyKey(Date.UTC(2026, 10, 8, 2, 59))).toBe("2026-11-07");
    expect(dailyKey(Date.UTC(2026, 10, 8, 3, 1))).toBe("2026-11-08");
    expect(dailyNumber("2026-01-01")).toBe(1);
  });
});
