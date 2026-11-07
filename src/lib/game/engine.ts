import { isCorrectAnswer, mentionsAnswer } from "./answers";
import { sanitizeAvatar } from "./avatar";
import { censorProfanity, isAllowedName } from "./profanity";
import type {
  Action,
  Attempt,
  EngineContext,
  Player,
  PublicContest,
  PublicState,
  Question,
  Room,
  RoomConfig,
  Round,
} from "./types";
import { CATEGORIES, REACTIONS } from "./types";

export const MAX_PLAYERS = 8;
export const MIN_PLAYERS = 2;
export const SIMULTANEOUS_CHOOSE_MS = 15_000;
export const SIMULTANEOUS_GUESS_MS = 20_000;
export const RESULTS_MS = 7_000;
export const QUESTION_END_MS = 10_000;
export const CONTEST_MS = 20_000;
export const REACTION_TTL_MS = 5_000;
export const REACTION_MIN_INTERVAL_MS = 800;
export const REACTION_HISTORY = 12;
export const GRACE_MS = 400;
export const ONLINE_WINDOW_MS = 30_000;
export const CHAT_MAX_LENGTH = 200;
export const CHAT_HISTORY = 60;
export const CHAT_MIN_INTERVAL_MS = 500;

export class GameError extends Error {}

export class KickedError extends GameError {}

export const DEFAULT_CONFIG: RoomConfig = {
  mode: "turns",
  questionCount: 5,
  turnSeconds: 30,
  categories: CATEGORIES.map((category) => category.id),
};

export function cleanName(raw: unknown): string {
  const name = String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, 16);
  if (!name) throw new GameError("Escolha um apelido.");
  if (!isAllowedName(name)) throw new GameError("Escolha outro apelido.");
  return name;
}

export function createRoom(code: string, host: Player, now: number): Room {
  return {
    code,
    createdAt: now,
    hostId: host.id,
    players: [host],
    config: { ...DEFAULT_CONFIG, categories: [...DEFAULT_CONFIG.categories] },
    phase: "lobby",
    usedQuestionIds: [],
    game: null,
    chat: [],
  };
}

export function addPlayer(room: Room, player: Player): void {
  const banned =
    !!player.deviceId && (room.kicked ?? []).some((entry) => entry.deviceId === player.deviceId);
  if (banned) throw new KickedError("Você foi removido desta sala pelo anfitrião.");
  if (room.players.length >= MAX_PLAYERS) throw new GameError("Esta sala está cheia.");
  const taken = room.players.some((p) => p.name.toLowerCase() === player.name.toLowerCase());
  if (taken) throw new GameError("Já existe alguém com esse apelido na sala.");
  player.playsFromQuestion = room.phase === "playing" && room.game ? room.game.questionIndex + 1 : 0;
  room.players.push(player);
}

export function questionWords(question: Question): string[] {
  return question.text.trim().split(/\s+/);
}

function isPlaying(room: Room, player: Player, online: Set<string>): boolean {
  const index = room.game?.questionIndex ?? 0;
  return online.has(player.id) && player.playsFromQuestion <= index;
}

function playingPlayers(room: Room, ctx: EngineContext): Player[] {
  return room.players.filter((player) => isPlaying(room, player, ctx.online));
}

function nextPlayerId(room: Room, afterId: string, ctx: EngineContext): string {
  const start = room.players.findIndex((p) => p.id === afterId);
  for (let step = 1; step <= room.players.length; step++) {
    const candidate = room.players[(Math.max(start, 0) + step) % room.players.length];
    if (candidate && isPlaying(room, candidate, ctx.online)) return candidate.id;
  }
  return room.players[0]?.id ?? afterId;
}

function pointsFor(question: Question, revealCount: number): number {
  return Math.max(1, questionWords(question).length - revealCount + 1);
}

function revealDeadline(room: Room, now: number): number {
  return room.config.mode === "turns"
    ? now + room.config.turnSeconds * 1000
    : now + SIMULTANEOUS_CHOOSE_MS;
}

function startTurn(room: Room, round: Round, playerId: string, now: number): void {
  round.currentPlayerId = playerId;
  round.stage = "reveal";
  round.stageStartedAt = now;
  round.deadline = revealDeadline(room, now);
}

function startQuestion(room: Room, index: number, ctx: EngineContext): void {
  const game = room.game!;
  game.questionIndex = index;
  const eligible = room.players.filter((p) => isPlaying(room, p, ctx.online));
  const pool = eligible.length ? eligible : room.players;
  const starter = pool[index % pool.length];
  const round: Round = {
    questionId: game.questionIds[index],
    revealed: [],
    currentPlayerId: starter.id,
    stage: "reveal",
    stageStartedAt: ctx.now,
    deadline: 0,
    attempts: [],
    winnerId: null,
    points: 0,
  };
  game.round = round;
  startTurn(room, round, starter.id, ctx.now);
}

function endQuestion(room: Room, round: Round, now: number): void {
  round.stage = "question-end";
  round.stageStartedAt = now;
  round.deadline = now + QUESTION_END_MS;
}

function award(room: Room, round: Round, attempt: Attempt, question: Question): void {
  round.winnerId = attempt.playerId;
  round.points = pointsFor(question, attempt.revealCount);
  const winner = room.players.find((p) => p.id === attempt.playerId);
  if (winner) winner.score += round.points;
}

function revealWord(room: Room, round: Round, position: number, ctx: EngineContext): void {
  round.revealed.push(position);
  round.stage = "guess";
  round.stageStartedAt = ctx.now;
  if (room.config.mode === "simultaneous") round.deadline = ctx.now + SIMULTANEOUS_GUESS_MS;
}

function endTurn(room: Room, round: Round, question: Question, ctx: EngineContext): void {
  if (round.revealed.length >= questionWords(question).length && round.stage === "guess") {
    endQuestion(room, round, ctx.now);
    return;
  }
  startTurn(room, round, nextPlayerId(room, round.currentPlayerId, ctx), ctx.now);
}

function closeSimultaneousGuess(room: Room, round: Round, question: Question, now: number): void {
  const current = round.attempts
    .filter((a) => a.revealCount === round.revealed.length)
    .sort((a, b) => a.at - b.at);
  const first = current.find((a) => a.correct);
  if (first) award(room, round, first, question);
  round.stage = "results";
  round.stageStartedAt = now;
  round.deadline = now + RESULTS_MS;
}

function chooseQuestions(room: Room, ctx: EngineContext): string[] {
  const random = ctx.random ?? Math.random;
  const pool = ctx.allQuestions.filter((q) => room.config.categories.includes(q.category));
  const shuffle = <T,>(items: T[]): T[] => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };
  const fresh = shuffle(pool.filter((q) => !room.usedQuestionIds.includes(q.id)));
  if (fresh.length >= room.config.questionCount) {
    return fresh.slice(0, room.config.questionCount).map((q) => q.id);
  }
  const reused = shuffle(pool.filter((q) => room.usedQuestionIds.includes(q.id)));
  room.usedQuestionIds = room.usedQuestionIds.filter((id) => !pool.some((q) => q.id === id));
  return [...fresh, ...reused].slice(0, room.config.questionCount).map((q) => q.id);
}

function contestVoters(room: Room, round: Round, ctx: EngineContext): Player[] {
  const author = round.contest ? round.attempts[round.contest.attemptIndex]?.playerId : null;
  return playingPlayers(room, ctx).filter((player) => player.id !== author);
}

function resolveContest(room: Room, round: Round, question: Question, now: number): void {
  const contest = round.contest;
  if (!contest) return;
  const votes = Object.values(contest.votes);
  const votesFor = votes.filter(Boolean).length;
  const attempt = round.attempts[contest.attemptIndex];
  const accepted = votesFor > votes.length - votesFor;
  if (attempt) {
    attempt.accepted = accepted;
    const author = room.players.find((player) => player.id === attempt.playerId);
    if (accepted && author) author.score += pointsFor(question, attempt.revealCount);
  }
  round.contest = null;
  round.stageStartedAt = now;
  round.deadline = now + QUESTION_END_MS;
}

function ensureHost(room: Room, ctx: EngineContext): boolean {
  if (ctx.online.has(room.hostId) && room.players.some((p) => p.id === room.hostId)) return false;
  const next = [...room.players]
    .sort((a, b) => a.joinedAt - b.joinedAt)
    .find((p) => ctx.online.has(p.id));
  if (!next || next.id === room.hostId) return false;
  room.hostId = next.id;
  return true;
}

function nextAfterTimedStage(room: Room, round: Round, question: Question, ctx: EngineContext): void {
  const game = room.game!;
  switch (round.stage) {
    case "reveal":
      if (room.config.mode === "turns") {
        endTurn(room, round, question, ctx);
      } else {
        const total = questionWords(question).length;
        const hidden = Array.from({ length: total }, (_, i) => i).filter(
          (i) => !round.revealed.includes(i),
        );
        const pick = hidden[Math.floor((ctx.random ?? Math.random)() * hidden.length)];
        revealWord(room, round, pick, ctx);
      }
      break;
    case "guess":
      if (room.config.mode === "turns") endTurn(room, round, question, ctx);
      else closeSimultaneousGuess(room, round, question, ctx.now);
      break;
    case "results":
      if (round.winnerId || round.revealed.length >= questionWords(question).length) {
        endQuestion(room, round, ctx.now);
      } else {
        startTurn(room, round, nextPlayerId(room, round.currentPlayerId, ctx), ctx.now);
      }
      break;
    case "question-end":
      if (game.questionIndex + 1 >= game.questionIds.length) room.phase = "finished";
      else startQuestion(room, game.questionIndex + 1, ctx);
      break;
  }
}

export function advance(room: Room, ctx: EngineContext): boolean {
  let changed = ensureHost(room, ctx);
  if (room.phase !== "playing" || !room.game) return changed;
  if (room.players.length === 0) return changed;

  for (let guard = 0; guard < 16; guard++) {
    const round = room.game.round;
    const question = ctx.getQuestion(round.questionId);
    const graceful = round.stage === "guess" ? GRACE_MS : 0;
    const expired = ctx.now >= round.deadline + graceful;
    if (round.stage === "question-end" && round.contest) {
      const contest = round.contest;
      const voters = contestVoters(room, round, ctx);
      const allVoted = voters.every((voter) => voter.id in contest.votes);
      if (!allVoted && !expired) return changed;
      resolveContest(room, round, question, ctx.now);
      return true;
    }
    const currentAway =
      (round.stage === "reveal" || (round.stage === "guess" && room.config.mode === "turns")) &&
      !ctx.online.has(round.currentPlayerId) &&
      playingPlayers(room, ctx).length > 0;
    const everyoneAnswered =
      room.config.mode === "simultaneous" &&
      round.stage === "guess" &&
      playingPlayers(room, ctx).length > 0 &&
      playingPlayers(room, ctx).every((p) =>
        round.attempts.some(
          (a) => a.playerId === p.id && a.revealCount === round.revealed.length,
        ),
      );

    if (everyoneAnswered) {
      closeSimultaneousGuess(room, round, question, ctx.now);
    } else if (currentAway && room.config.mode === "turns") {
      endTurn(room, round, question, ctx);
    } else if (currentAway) {
      startTurn(room, round, nextPlayerId(room, round.currentPlayerId, ctx), ctx.now);
    } else if (expired) {
      nextAfterTimedStage(room, round, question, ctx);
    } else {
      return changed;
    }
    changed = true;
    if (room.phase !== "playing") return true;
    if (!currentAway) return true;
  }
  return changed;
}

function requirePlaying(room: Room): Round {
  if (room.phase !== "playing" || !room.game) throw new GameError("A partida não está em andamento.");
  return room.game.round;
}

function configure(room: Room, patch: Partial<RoomConfig>): void {
  if (room.phase !== "lobby") throw new GameError("A partida já começou.");
  const next = { ...room.config };
  if (patch.mode === "turns" || patch.mode === "simultaneous") next.mode = patch.mode;
  if (patch.questionCount === 3 || patch.questionCount === 5 || patch.questionCount === 10) {
    next.questionCount = patch.questionCount;
  }
  if ([15, 30, 45, 60].includes(patch.turnSeconds as number)) {
    next.turnSeconds = patch.turnSeconds as RoomConfig["turnSeconds"];
  }
  if (Array.isArray(patch.categories)) {
    const valid = CATEGORIES.map((c) => c.id).filter((id) => patch.categories!.includes(id));
    if (valid.length === 0) throw new GameError("Mantenha pelo menos uma categoria.");
    next.categories = valid;
  }
  room.config = next;
}

function sendChat(room: Room, player: Player, rawText: unknown, ctx: EngineContext): void {
  const original = String(rawText ?? "").replace(/\s+/g, " ").trim().slice(0, CHAT_MAX_LENGTH);
  const text = censorProfanity(original);
  if (!text) throw new GameError("Escreva uma mensagem.");
  const chat = room.chat ?? [];
  const last = chat.findLast((message) => message.playerId === player.id);
  if (last && ctx.now - last.at < CHAT_MIN_INTERVAL_MS) {
    throw new GameError("Calma, espere um instante para enviar outra mensagem.");
  }
  const round = room.phase === "playing" ? room.game?.round : null;
  const hidden =
    !!round &&
    round.stage !== "question-end" &&
    mentionsAnswer(original, ctx.getQuestion(round.questionId).answer);
  chat.push({
    id: `${ctx.now}-${player.id}`,
    playerId: player.id,
    name: player.name,
    text,
    at: ctx.now,
    hidden,
  });
  room.chat = chat.slice(-CHAT_HISTORY);
}

function sendReaction(room: Room, player: Player, reaction: unknown, ctx: EngineContext): void {
  const option = REACTIONS.find((item) => item.id === reaction);
  if (!option) throw new GameError("Reação inválida.");
  const reactions = room.reactions ?? [];
  const last = reactions.findLast((item) => item.playerId === player.id);
  if (last && ctx.now - last.at < REACTION_MIN_INTERVAL_MS) {
    throw new GameError("Calma, espere um instante para reagir de novo.");
  }
  reactions.push({
    id: `${ctx.now}-${player.id}`,
    playerId: player.id,
    name: player.name,
    reaction: option.id,
    at: ctx.now,
  });
  room.reactions = reactions.slice(-REACTION_HISTORY);
}

function removePlayer(room: Room, playerId: string, ctx: EngineContext): void {
  const round = room.game?.round;
  const wasCurrent = room.phase === "playing" && round?.currentPlayerId === playerId;
  let successor: string | null = null;
  if (wasCurrent && round) {
    const stillHere = new Set([...ctx.online].filter((id) => id !== playerId));
    successor = nextPlayerId(room, playerId, { ...ctx, online: stillHere });
  }
  room.players = room.players.filter((p) => p.id !== playerId);
  ctx.online.delete(playerId);
  if (room.hostId === playerId) {
    const next = [...room.players].sort((a, b) => a.joinedAt - b.joinedAt);
    room.hostId = (next.find((p) => ctx.online.has(p.id)) ?? next[0])?.id ?? room.hostId;
  }
  if (!room.players.length || !round || room.phase !== "playing") return;
  if (wasCurrent && successor && (round.stage === "reveal" || room.config.mode === "turns")) {
    if (round.stage === "reveal" || round.stage === "guess") {
      const question = ctx.getQuestion(round.questionId);
      if (round.stage === "guess" && round.revealed.length >= questionWords(question).length) {
        endQuestion(room, round, ctx.now);
      } else {
        startTurn(room, round, successor, ctx.now);
      }
    }
  } else if (wasCurrent && successor) {
    round.currentPlayerId = successor;
  }
}

export function applyAction(
  room: Room,
  playerId: string,
  action: Action,
  ctx: EngineContext,
): void {
  const player = room.players.find((p) => p.id === playerId);
  if (!player) throw new GameError("Você não está nesta sala.");

  switch (action.type) {
    case "configure":
      if (room.hostId !== playerId) throw new GameError("Só o anfitrião pode configurar.");
      configure(room, action.config ?? {});
      return;

    case "start": {
      if (room.hostId !== playerId) throw new GameError("Só o anfitrião pode iniciar.");
      if (room.phase !== "lobby") throw new GameError("A partida já começou.");
      const ready = room.players.filter((p) => ctx.online.has(p.id));
      if (ready.length < MIN_PLAYERS) {
        throw new GameError(`São necessários pelo menos ${MIN_PLAYERS} jogadores conectados.`);
      }
      const questionIds = chooseQuestions(room, ctx);
      if (questionIds.length < room.config.questionCount) {
        throw new GameError("Não há perguntas suficientes nessas categorias.");
      }
      room.usedQuestionIds.push(...questionIds);
      for (const p of room.players) {
        p.score = 0;
        p.playsFromQuestion = 0;
      }
      room.phase = "playing";
      room.game = { questionIds, questionIndex: 0, round: null as unknown as Round };
      startQuestion(room, 0, ctx);
      return;
    }

    case "reveal": {
      const round = requirePlaying(room);
      if (round.currentPlayerId !== playerId) throw new GameError("Não é a sua vez.");
      if (round.stage !== "reveal") throw new GameError("Agora não é hora de revelar.");
      const total = questionWords(ctx.getQuestion(round.questionId)).length;
      const position = Number(action.position);
      if (!Number.isInteger(position) || position < 0 || position >= total) {
        throw new GameError("Palavra inválida.");
      }
      if (round.revealed.includes(position)) throw new GameError("Essa palavra já foi revelada.");
      revealWord(room, round, position, ctx);
      return;
    }

    case "guess": {
      const round = requirePlaying(room);
      if (round.stage !== "guess") throw new GameError("Agora não é hora de responder.");
      if (ctx.now > round.deadline + GRACE_MS) throw new GameError("O tempo acabou.");
      const text = String(action.text ?? "").trim().slice(0, 60);
      if (!text) throw new GameError("Digite uma resposta.");
      const question = ctx.getQuestion(round.questionId);
      if (room.config.mode === "turns" && round.currentPlayerId !== playerId) {
        throw new GameError("Não é a sua vez.");
      }
      if (player.playsFromQuestion > room.game!.questionIndex) {
        throw new GameError("Você entra na próxima pergunta.");
      }
      const revealCount = round.revealed.length;
      const already = round.attempts.some(
        (a) => a.playerId === playerId && a.revealCount === revealCount,
      );
      if (already) throw new GameError("Você já respondeu nesta revelação.");
      const attempt: Attempt = {
        playerId,
        text: censorProfanity(text),
        correct: isCorrectAnswer(text, question.answer),
        revealCount,
        elapsedMs: Math.max(0, ctx.now - round.stageStartedAt),
        at: ctx.now,
      };
      round.attempts.push(attempt);
      if (room.config.mode === "turns") {
        if (attempt.correct) {
          award(room, round, attempt, question);
          endQuestion(room, round, ctx.now);
        } else {
          endTurn(room, round, question, ctx);
        }
      }
      return;
    }

    case "pass": {
      const round = requirePlaying(room);
      if (room.config.mode !== "turns") throw new GameError("Neste modo não é possível passar.");
      if (round.currentPlayerId !== playerId) throw new GameError("Não é a sua vez.");
      if (round.stage !== "guess") throw new GameError("Revele uma palavra antes de passar.");
      endTurn(room, round, ctx.getQuestion(round.questionId), ctx);
      return;
    }

    case "leave":
      removePlayer(room, playerId, ctx);
      return;

    case "chat":
      sendChat(room, player, action.text, ctx);
      return;

    case "react":
      sendReaction(room, player, action.reaction, ctx);
      return;

    case "kick": {
      if (room.hostId !== playerId) throw new GameError("Só o anfitrião pode remover jogadores.");
      if (action.playerId === playerId) throw new GameError("Você não pode remover a si mesmo.");
      const target = room.players.find((p) => p.id === action.playerId);
      if (!target) throw new GameError("Esse jogador não está mais na sala.");
      room.kicked = [...(room.kicked ?? []), { token: target.token, deviceId: target.deviceId }];
      removePlayer(room, target.id, ctx);
      return;
    }

    case "contest": {
      const round = requirePlaying(room);
      if (round.stage !== "question-end") throw new GameError("Só é possível contestar ao fim da pergunta.");
      if (round.contest) throw new GameError("Já existe uma votação em andamento.");
      const attempt = round.attempts[Number(action.attemptIndex)];
      if (!attempt || attempt.playerId !== playerId) throw new GameError("Tentativa inválida.");
      if (attempt.correct) throw new GameError("Essa resposta já foi aceita.");
      if (round.attempts.some((a) => a.playerId === playerId && a.contested)) {
        throw new GameError("Você já contestou nesta pergunta.");
      }
      round.contest = { attemptIndex: Number(action.attemptIndex), votes: {} };
      if (contestVoters(room, round, ctx).length === 0) {
        round.contest = null;
        throw new GameError("Não há outros jogadores para votar.");
      }
      attempt.contested = true;
      round.stageStartedAt = ctx.now;
      round.deadline = ctx.now + CONTEST_MS;
      return;
    }

    case "vote": {
      const round = requirePlaying(room);
      if (!round.contest) throw new GameError("Não há votação em andamento.");
      if (!contestVoters(room, round, ctx).some((voter) => voter.id === playerId)) {
        throw new GameError("Você não pode votar nesta contestação.");
      }
      if (playerId in round.contest.votes) throw new GameError("Você já votou.");
      round.contest.votes[playerId] = action.accept === true;
      return;
    }

    case "back-to-lobby":
      if (room.hostId !== playerId) throw new GameError("Só o anfitrião pode voltar à sala.");
      if (room.phase !== "finished") throw new GameError("A partida ainda não acabou.");
      room.phase = "lobby";
      room.game = null;
      for (const p of room.players) {
        p.score = 0;
        p.playsFromQuestion = 0;
      }
      return;
  }
}

function publicContest(
  room: Room,
  round: Round,
  question: Question,
  playerId: string,
  ctx: Pick<EngineContext, "online">,
): PublicContest | null {
  const contest = round.contest;
  const attempt = contest ? round.attempts[contest.attemptIndex] : null;
  if (!contest || !attempt) return null;
  const index = room.game?.questionIndex ?? 0;
  const voters = room.players.filter(
    (p) => ctx.online.has(p.id) && p.playsFromQuestion <= index && p.id !== attempt.playerId,
  );
  const votes = Object.values(contest.votes);
  const yourVote = contest.votes[playerId];
  return {
    playerId: attempt.playerId,
    text: attempt.text,
    points: pointsFor(question, attempt.revealCount),
    votesFor: votes.filter(Boolean).length,
    votesAgainst: votes.filter((vote) => !vote).length,
    voterCount: voters.length,
    canVote: voters.some((voter) => voter.id === playerId) && yourVote === undefined,
    yourVote: yourVote ?? null,
  };
}

export function toPublicState(
  room: Room,
  playerId: string,
  ctx: Pick<EngineContext, "now" | "online" | "getQuestion">,
): PublicState {
  const game = room.game;
  const round = game?.round ?? null;
  const question = round ? ctx.getQuestion(round.questionId) : null;
  const words = question ? questionWords(question) : [];
  const open = round?.stage === "question-end" || (room.phase === "finished" && !!round);
  const hideCurrent = room.config.mode === "simultaneous" && round?.stage === "guess";

  return {
    code: room.code,
    you: playerId,
    hostId: room.hostId,
    phase: room.phase,
    config: room.config,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
      online: ctx.online.has(p.id),
      playing: p.playsFromQuestion <= (game?.questionIndex ?? 0),
      avatar: sanitizeAvatar(p.avatar),
    })),
    questionIndex: game?.questionIndex ?? 0,
    questionTotal: game?.questionIds.length ?? room.config.questionCount,
    serverNow: ctx.now,
    chat: (room.chat ?? []).map((message) => ({
      id: message.id,
      playerId: message.playerId,
      name: message.name,
      text: message.hidden && message.playerId !== playerId ? null : message.text,
    })),
    reactions: (room.reactions ?? [])
      .filter((item) => ctx.now - item.at < REACTION_TTL_MS)
      .map((item) => ({
        id: item.id,
        playerId: item.playerId,
        name: item.name,
        reaction: item.reaction,
        at: item.at,
      })),
    round:
      round && question
        ? {
            words: words.map((word, i) => (open || round.revealed.includes(i) ? word : null)),
            revealedCount: round.revealed.length,
            lastRevealed: round.revealed[round.revealed.length - 1] ?? null,
            currentPlayerId: round.currentPlayerId,
            stage: round.stage,
            deadline: round.deadline,
            stageDurationMs: Math.max(1, round.deadline - round.stageStartedAt),
            value: pointsFor(
              question,
              round.stage === "reveal" ? round.revealed.length + 1 : round.revealed.length,
            ),
            attempts: round.attempts.map((a) => {
              const hidden =
                hideCurrent && a.revealCount === round.revealed.length && a.playerId !== playerId;
              return {
                playerId: a.playerId,
                revealCount: a.revealCount,
                text: hidden ? null : a.text,
                correct:
                  hideCurrent && a.revealCount === round.revealed.length ? null : a.correct,
                elapsedMs:
                  hideCurrent && a.revealCount === round.revealed.length ? null : a.elapsedMs,
                contested: !!a.contested,
                accepted: !!a.accepted,
              };
            }),
            winnerId: round.winnerId,
            points: round.points,
            answer: open ? question.answer : null,
            categoryId: open ? question.category : null,
            questionText: open ? question.text : null,
            contest: publicContest(room, round, question, playerId, ctx),
          }
        : null,
  };
}
