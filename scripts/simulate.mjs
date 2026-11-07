import assert from "node:assert/strict";

const BASE = process.argv[2] ?? "http://localhost:3000";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function call(path, { method = "GET", token, body } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "x-player-token": token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  return { ok: response.ok, status: response.status, data };
}

async function must(path, options) {
  const result = await call(path, options);
  assert.ok(result.ok, `${path}: ${JSON.stringify(result.data)}`);
  return result.data;
}

async function setupRoom(mode, names) {
  const host = await must("/api/rooms", { method: "POST", body: { name: names[0] } });
  const { code } = host;
  const players = [{ name: names[0], ...host }];
  for (const name of names.slice(1)) {
    const joined = await must(`/api/rooms/${code}`, { method: "POST", body: { name } });
    players.push({ name, ...joined });
  }
  const act = (player, body) =>
    must(`/api/rooms/${code}/action`, { method: "POST", token: player.token, body });
  const read = (player) => must(`/api/rooms/${code}/state`, { token: player.token });
  await act(players[0], { type: "configure", config: { mode, questionCount: 3 } });
  await act(players[0], { type: "start" });
  return { code, players, act, read };
}

async function waitForStage(room, stages, timeoutMs = 40_000) {
  const started = Date.now();
  for (;;) {
    const state = await room.read(room.players[0]);
    if (state.phase === "finished" || stages.includes(state.round?.stage)) return state;
    assert.ok(Date.now() - started < timeoutMs, `prazo esgotado esperando ${stages}`);
    await sleep(300);
  }
}

async function securityChecks(room) {
  const { code, players } = room;
  const anonymous = await call(`/api/rooms/${code}/state`);
  assert.equal(anonymous.ok, false, "estado sem token deve falhar");
  const state = await room.read(players[0]);
  const raw = JSON.stringify(state);
  for (const player of players) assert.ok(!raw.includes(player.token), "token vazou");
  assert.equal(state.round.answer, null, "resposta vazou");
  assert.equal(state.round.questionText, null, "pergunta vazou");
  assert.equal(state.round.categoryId, null, "categoria vazou");
  assert.ok(state.round.words.every((word) => word === null), "palavra oculta vazou");
  const late = await call(`/api/rooms/${code}/action`, {
    method: "POST",
    token: players[1].token,
    body: { type: "configure", config: { questionCount: 10 } },
  });
  assert.equal(late.ok, false, "só o anfitrião configura");
}

async function playTurns() {
  const room = await setupRoom("turns", ["Ana", "Bia", "Caio"]);
  await securityChecks(room);
  const byId = (id) => room.players.find((player) => player.playerId === id);
  let finished = false;
  let questions = 0;
  while (!finished) {
    let state = await room.read(room.players[0]);
    if (state.phase === "finished") break;
    if (state.round.stage === "question-end") {
      state = await waitForStage(room, ["reveal"]);
      if (state.phase === "finished") break;
    }
    questions++;
    const total = state.round.words.length;
    for (let position = 0; position < total; position++) {
      const current = byId((await room.read(room.players[0])).round.currentPlayerId);
      await room.act(current, { type: "reveal", position });
      await room.act(current, { type: "guess", text: "resposta impossível zzz" });
    }
    state = await room.read(room.players[0]);
    assert.equal(state.round.stage, "question-end");
    assert.ok(state.round.answer, "resposta deve abrir no fim");
    assert.ok(state.players.every((player) => player.score === 0));
    finished = questions >= 3;
    if (!finished) await waitForStage(room, ["reveal"]);
  }
  console.log(`Modo Turnos ok: ${questions} perguntas em ${room.code}`);
}

async function playSimultaneous() {
  const room = await setupRoom("simultaneous", ["Duda", "Enzo"]);
  const byId = (id) => room.players.find((player) => player.playerId === id);
  const [duda, enzo] = room.players;

  await room.act(enzo, { type: "chat", text: "boa sorte" });
  const withChat = await room.read(duda);
  assert.equal(withChat.chat.at(-1).text, "boa sorte");
  assert.equal(withChat.chat.at(-1).name, "Enzo");
  assert.ok(!JSON.stringify(withChat.chat).includes(enzo.token), "token vazou no chat");

  let state = await room.read(duda);
  await room.act(byId(state.round.currentPlayerId), { type: "reveal", position: 0 });
  await sleep(250);
  await room.act(duda, { type: "guess", text: "errada um" });
  const hidden = await room.read(enzo);
  const seen = hidden.round.attempts[0];
  assert.equal(seen.text, null, "resposta alheia deve ficar oculta");
  assert.equal(seen.elapsedMs, null, "tempo alheio deve ficar oculto");
  assert.ok(hidden.round.words.filter(Boolean).length === 1);

  const repeat = await call(`/api/rooms/${room.code}/action`, {
    method: "POST",
    token: duda.token,
    body: { type: "guess", text: "de novo" },
  });
  assert.equal(repeat.ok, false, "uma tentativa por revelação");

  await room.act(enzo, { type: "guess", text: "errada dois" });
  state = await room.read(duda);
  assert.equal(state.round.stage, "results");
  const [first, second] = state.round.attempts;
  assert.ok(first.elapsedMs >= 200, "tempo medido pelo servidor");
  assert.ok(second.elapsedMs >= first.elapsedMs);
  assert.equal(state.round.winnerId, null);
  console.log(`Quadro de tempos: ${first.elapsedMs} ms e ${second.elapsedMs} ms`);

  const chooser = state.round.currentPlayerId;
  state = await waitForStage(room, ["reveal"]);
  assert.notEqual(state.round.currentPlayerId, chooser, "revezamento");

  const again = await room.read(enzo);
  assert.equal(again.you, enzo.playerId);

  await room.act(duda, { type: "leave" });
  state = await room.read(enzo);
  assert.equal(state.hostId, enzo.playerId, "anfitrião deve passar adiante");
  assert.equal(state.players.length, 1);
  console.log(`Modo Simultâneo ok em ${room.code}`);
}

async function joinRules() {
  const missing = await call("/api/rooms/ZZZZ");
  assert.equal(missing.data.exists, false);
  const host = await must("/api/rooms", { method: "POST", body: { name: "Gui" } });
  const repeated = await call(`/api/rooms/${host.code}`, { method: "POST", body: { name: "gui" } });
  assert.equal(repeated.ok, false, "apelido repetido");
  const empty = await call("/api/rooms", { method: "POST", body: { name: "   " } });
  assert.equal(empty.ok, false, "apelido vazio");
  for (let i = 0; i < 7; i++) {
    await must(`/api/rooms/${host.code}`, { method: "POST", body: { name: `J${i}` } });
  }
  const full = await call(`/api/rooms/${host.code}`, { method: "POST", body: { name: "Extra" } });
  assert.equal(full.ok, false, "sala cheia");
  console.log("Regras de entrada ok");
}

await joinRules();
await playTurns();
await playSimultaneous();
console.log("Tudo certo.");
