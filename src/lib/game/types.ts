import type { Avatar } from "./avatar";

export type GameMode = "turns" | "simultaneous";

export const CATEGORIES = [
  { id: "geografia", label: "Geografia" },
  { id: "historia", label: "História" },
  { id: "ciencias", label: "Ciências" },
  { id: "cultura-pop", label: "Cultura Pop" },
  { id: "esportes", label: "Esportes" },
  { id: "brasil", label: "Brasil" },
  { id: "musica", label: "Música" },
  { id: "cinema", label: "Cinema" },
  { id: "games", label: "Games" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

export const REACTIONS = [
  { id: "boa", label: "Boa!" },
  { id: "haha", label: "Haha" },
  { id: "uau", label: "Uau" },
  { id: "quase", label: "Quase!" },
  { id: "ih", label: "Ih..." },
  { id: "socorro", label: "Socorro" },
] as const;

export type ReactionId = (typeof REACTIONS)[number]["id"];

export type Question = {
  id: string;
  category: CategoryId;
  text: string;
  answer: string;
};

export type RoomConfig = {
  mode: GameMode;
  questionCount: 3 | 5 | 10;
  turnSeconds: 15 | 30 | 45 | 60;
  categories: CategoryId[];
};

export type Player = {
  id: string;
  token: string;
  name: string;
  score: number;
  joinedAt: number;
  playsFromQuestion: number;
  avatar?: Avatar;
  deviceId?: string;
};

export type Attempt = {
  playerId: string;
  text: string;
  correct: boolean;
  revealCount: number;
  elapsedMs: number;
  at: number;
  contested?: boolean;
  accepted?: boolean;
};

export type Contest = {
  attemptIndex: number;
  votes: Record<string, boolean>;
};

export type Stage =
  | "reveal"
  | "guess"
  | "results"
  | "question-end";

export type Round = {
  questionId: string;
  revealed: number[];
  currentPlayerId: string;
  stage: Stage;
  stageStartedAt: number;
  deadline: number;
  attempts: Attempt[];
  winnerId: string | null;
  points: number;
  contest?: Contest | null;
};

export type Game = {
  questionIds: string[];
  questionIndex: number;
  round: Round;
};

export type Room = {
  code: string;
  createdAt: number;
  hostId: string;
  players: Player[];
  config: RoomConfig;
  phase: "lobby" | "playing" | "finished";
  usedQuestionIds: string[];
  game: Game | null;
  chat?: ChatMessage[];
  reactions?: Reaction[];
  kicked?: { token: string; deviceId?: string }[];
};

export type Reaction = {
  id: string;
  playerId: string;
  name: string;
  reaction: ReactionId;
  at: number;
};

export type ChatMessage = {
  id: string;
  playerId: string;
  name: string;
  text: string;
  at: number;
  hidden: boolean;
};

export type Action =
  | { type: "configure"; config: Partial<RoomConfig> }
  | { type: "start" }
  | { type: "reveal"; position: number }
  | { type: "guess"; text: string }
  | { type: "pass" }
  | { type: "leave" }
  | { type: "back-to-lobby" }
  | { type: "chat"; text: string }
  | { type: "react"; reaction: ReactionId }
  | { type: "kick"; playerId: string }
  | { type: "contest"; attemptIndex: number }
  | { type: "vote"; accept: boolean };

export type EngineContext = {
  now: number;
  online: Set<string>;
  getQuestion: (id: string) => Question;
  allQuestions: Question[];
  random?: () => number;
};

export type PublicAttempt = {
  playerId: string;
  text: string | null;
  correct: boolean | null;
  elapsedMs: number | null;
  revealCount: number;
  contested: boolean;
  accepted: boolean;
};

export type PublicContest = {
  playerId: string;
  text: string;
  points: number;
  votesFor: number;
  votesAgainst: number;
  voterCount: number;
  canVote: boolean;
  yourVote: boolean | null;
};

export type PublicPlayer = {
  id: string;
  name: string;
  score: number;
  online: boolean;
  playing: boolean;
  avatar: Avatar;
};

export type PublicReaction = {
  id: string;
  playerId: string;
  name: string;
  reaction: ReactionId;
  at: number;
};

export type PublicRound = {
  words: (string | null)[];
  revealedCount: number;
  lastRevealed: number | null;
  currentPlayerId: string;
  stage: Stage;
  deadline: number;
  stageDurationMs: number;
  value: number;
  attempts: PublicAttempt[];
  winnerId: string | null;
  points: number;
  answer: string | null;
  categoryId: CategoryId | null;
  questionText: string | null;
  contest: PublicContest | null;
};

export type PublicChatMessage = {
  id: string;
  playerId: string;
  name: string;
  text: string | null;
};

export type PublicState = {
  code: string;
  you: string;
  hostId: string;
  phase: Room["phase"];
  config: RoomConfig;
  players: PublicPlayer[];
  questionIndex: number;
  questionTotal: number;
  round: PublicRound | null;
  chat: PublicChatMessage[];
  reactions: PublicReaction[];
  serverNow: number;
};
