# Respostas sem Perguntas

A browser-based multiplayer word game in which the question stays hidden. Players only know how many words it has. They reveal one word at a time and try to give the right answer before everyone else. The fewer words revealed, the more points the answer is worth.

The game interface and its question bank are in Brazilian Portuguese.

## Contents

- [How to play](#how-to-play)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Running locally](#running-locally)
- [Testing](#testing)
- [Deployment](#deployment)
- [Environment variables](#environment-variables)
- [Architecture](#architecture)
- [API](#api)
- [Project structure](#project-structure)
- [Question bank](#question-bank)
- [Known limitations](#known-limitations)

## How to play

1. One person creates a room, configures the match and shares the 4-letter code or the link.
2. Other players join with a nickname and a customizable character. No account is needed.
3. The host picks a game mode and starts the match.
4. For each question, players reveal words and try to guess the answer.
5. The highest score wins. Ties share the victory.

### Game modes

| | Turns mode | Simultaneous mode |
|---|---|---|
| Who reveals | The current player | Players take turns |
| Who answers | Only the current player | Everyone, without seeing other answers |
| Time | 15, 30, 45 or 60 s per turn (default: 30 s) | 15 s to pick a word and 20 s to answer |
| Attempts | One per turn, with the option to pass | One per revealed word |
| Who scores | Whoever gets it right | Only the first player to send the right answer |
| What others see | Wrong attempts, right away | A board with answers and times when the reveal ends |

When time runs out:

- In Turns mode, the player loses the turn. If no word was chosen, nothing is revealed.
- In Simultaneous mode, a random word is revealed if nobody picks one in time.

### Scoring

Points start at the number of words in the question and drop with each reveal. For a 10-word question, a right answer is worth 10 points on the first reveal, 9 on the second, 8 on the third, and so on.

Wrong answers cost nothing. If every word is revealed and nobody gets it right, the answer is shown and nobody scores.

### Answer checking

Each question has a single right answer, with no list of alternatives. The comparison ignores accents, case, punctuation and leading articles, so "o Brasil" matches "Brasil". Small typos are accepted depending on the answer length:

| Answer | Typos accepted |
|---|---|
| Up to 3 characters, or containing digits | 0 |
| 4 to 7 characters | 1 |
| 8 characters or more | 2 |

### Contesting an answer

When a question ends, a player can contest one of their own rejected answers. The other connected players then have 20 seconds to vote. If most votes accept it, the player receives the points the attempt would have been worth. Ties and missing votes count as a rejection, and the player who already scored keeps those points. Each player can contest once per question.

### Daily question

The daily challenge at `/desafio` needs no room. Everyone gets the same question on the same day, and the day changes at midnight in the Sao Paulo time zone. Progress is saved in the browser, and the result can be shared as an image that does not reveal the words.

### Chat and reactions

Players can talk in the room chat with messages of up to 200 characters, and send quick reactions during the match. A room keeps its 60 most recent messages.

While a question is open, a message containing the answer is hidden from other players. The author still sees their own text as usual, so the chat cannot be used to test guesses for free. Once the question ends, the answer can be mentioned freely.

## Features

- Rooms with a 4-letter code and a link, for 2 to 8 players.
- Matches of 3, 5 or 10 questions, with a category filter.
- Questions that do not repeat within a room while others are available.
- Customizable characters: color, background, head, eyes, mouth and hat.
- Room chat and quick reactions.
- Player voting to accept an answer the checker rejected.
- A daily question that everyone can play without a room.
- A shareable result image, for both the final scoreboard and the daily question.
- A profanity filter for nicknames, chat messages and public attempts.
- Host controls to remove a player.
- Rejoining a match after a disconnect, in the same browser.
- Disconnected players have their turn skipped until they return.
- Players who join mid-match start on the next question.
- If the host leaves or disconnects, the longest-connected player takes over.
- Sound effects generated in the browser, with a mute button.
- Installable as an app on phones and computers.
- Layout adapted to both phones and computers.

## Tech stack

- [Next.js](https://nextjs.org) 16 with the App Router, React 19 and TypeScript.
- [Supabase](https://supabase.com): Postgres stores the rooms and Realtime Broadcast announces changes.
- [Vercel](https://vercel.com) for hosting.
- [Vitest](https://vitest.dev) for tests.
- Custom CSS, with no component library. The Bungee and Bricolage Grotesque fonts are loaded through `next/font`.

## Running locally

Requirements: Node.js 24, or any version supported by Next.js 16, and npm.

```bash
npm install
```

```bash
npm run dev
```

The game opens at http://localhost:3000.

Without environment variables, rooms are kept in server memory and disappear when the server restarts. This mode is meant for development only.

To test with more than one player on the same machine, use a private window or another browser, because the session is stored in `localStorage`.

### Commands

| Command | Description |
|---|---|
| `npm run dev` | Starts the development server |
| `npm run build` | Creates the production build |
| `npm run start` | Starts the production server |
| `npm run lint` | Runs ESLint |
| `npm test` | Runs the automated tests |

## Testing

```bash
npm test
```

The tests cover the rules of both modes, answer checking, what each player is allowed to see, the chat, reactions, player removal, contests, the profanity filter, characters, the daily question and the validity of the question bank.

This script plays complete matches through the API, in both modes, against a running server. The default address is `http://localhost:3000`, and another one can be passed as an argument:

```bash
node scripts/simulate.mjs http://localhost:3000
```

## Deployment

### 1. Supabase

1. Create a project on [Supabase](https://supabase.com).
2. Open the SQL Editor and run the contents of [supabase/schema.sql](supabase/schema.sql).
3. Copy the project URL and the keys from Project Settings > API.

### 2. Vercel

1. Import this repository on [Vercel](https://vercel.com).
2. Set the variables from the next section and deploy.
3. In Settings > Functions, choose the region closest to the Supabase project, then redeploy.

On Vercel, the server refuses to run without the Supabase variables, because each instance would have its own memory and rooms would be lost.

## Environment variables

To develop against Supabase, copy [.env.example](.env.example) to `.env.local` and fill in the values. `.env` files are kept out of the repository, except for the example.

| Variable | Used by | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Server and browser | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser | Public key, used only to receive Realtime notifications |
| `SUPABASE_SERVICE_ROLE_KEY` | Server | Secret key with full database access. Never give it the `NEXT_PUBLIC` prefix |

## Architecture

The server is the only authority over the game. The browser sends actions and receives a filtered view of the state, with no tokens, no hidden words and no answer before the question ends.

```text
Browser                         Server (Next.js)                  Supabase
    |                                  |                              |
    |-- POST /action ----------------->|-- read room ---------------->|
    |                                  |-- apply rules                |
    |                                  |-- write if version matches ->|
    |<-- filtered state ---------------|                              |
    |                                  |-- "room changed" notice ---->|
    |<------------- Realtime Broadcast (version number only) ---------|
    |-- GET /state ------------------->|                              |
    |<-- filtered state ---------------|                              |
```

Main decisions:

- **One row per room.** The room state lives in a JSONB column with a version number. A write only succeeds if the version has not changed since the read. On a conflict, the operation is retried.
- **Questions outside the database.** The question bank lives in server code and is never sent to the browser in full.
- **No direct database access from the browser.** Tables have Row Level Security enabled and no policies. Only the server reaches the data, using the secret key.
- **Realtime notices carry no game data.** They only say that a room changed, and the browser then fetches the new state.
- **Polling as a fallback.** The browser checks the state every 8 s with Realtime connected and every 2 s without it. This also records presence: a player counts as disconnected after 30 s without contact.
- **Deadlines without a background process.** The server stores the deadline of each stage and applies expired deadlines whenever it receives a read or an action.
- **Time measured on the server.** Simultaneous mode records the answer time when the request arrives, which prevents tampering on the player's device.
- **Automatic cleanup.** Rooms with no activity for more than 24 hours are removed when a new room is created.

## API

Routes that require a player use the token received when creating or joining a room, sent in the `x-player-token` header.

| Method and route | Body | Description |
|---|---|---|
| `POST /api/rooms` | `{ name, avatar, deviceId }` | Creates a room and returns the host session |
| `GET /api/rooms/[code]` | | Tells whether the room exists, its phase and player count |
| `POST /api/rooms/[code]` | `{ name, avatar, deviceId }` | Joins the room and returns the player session |
| `GET /api/rooms/[code]/state` | | Returns the state visible to the player and records presence |
| `POST /api/rooms/[code]/action` | Action | Applies an action and returns the new state |
| `GET /api/daily` | | Returns the daily question number and word count |
| `POST /api/daily` | `{ key, action, ... }` | Reveals a word, checks a guess or gives up on the daily question |

Accepted room actions:

| Action | Who can use it |
|---|---|
| `{ type: "configure", config }` | Host, before starting |
| `{ type: "start" }` | Host, with at least 2 connected players |
| `{ type: "reveal", position }` | Current player |
| `{ type: "guess", text }` | Current player or, in Simultaneous mode, everyone |
| `{ type: "pass" }` | Current player, in Turns mode, after revealing |
| `{ type: "leave" }` | Any player |
| `{ type: "back-to-lobby" }` | Host, when the match ends |
| `{ type: "chat", text }` | Any player |
| `{ type: "react", reaction }` | Any player |
| `{ type: "kick", playerId }` | Host |
| `{ type: "contest", attemptIndex }` | Author of a rejected attempt, when the question ends |
| `{ type: "vote", accept }` | Other connected players, during a contest |

On errors, the response has an `error` field with a message in Portuguese. A removed player receives status 403.

## Project structure

```text
public/
  icons/              App icons
  sw.js               Service worker used for installation
scripts/
  simulate.mjs        Complete matches through the API
src/
  app/
    api/              API routes
    desafio/          Daily question page
    sala/[code]/      Room page
    globals.css       Visual system
    layout.tsx        Fonts and metadata
    manifest.ts       App manifest
    page.tsx          Home page
  components/         Home, room, match, daily question and result screens
  lib/
    client/           API calls, session, sounds, result image and room syncing
    game/             Rules, answer checking, characters, filter and question bank
    server/           Rooms, presence and storage
supabase/
  schema.sql          Database tables
```

The rules in `src/lib/game` do not depend on the interface or the database, so they can be tested in isolation.

## Question bank

There are 295 questions in Portuguese, in [src/lib/game/questions.ts](src/lib/game/questions.ts):

| Category | Questions |
|---|---|
| Geografia | 30 |
| História | 32 |
| Ciências | 37 |
| Cultura Pop | 33 |
| Esportes | 35 |
| Brasil | 31 |
| Música | 32 |
| Cinema | 32 |
| Games | 33 |

To add a question, include a `[question, answer]` pair in the desired category and follow these rules:

- The answer must be unique, short and unambiguous.
- For people, ask for the last name to avoid name variations.
- Avoid answers that are small numbers, because "8" and "oito" are not equivalent.
- The answer cannot appear as a word in its own question. The tests check this rule.

## Known limitations

- The Supabase integration and Realtime notifications are not covered by the automated tests, which use in-memory rooms.
- On the free plan, Supabase [pauses projects after 7 days of low activity](https://supabase.com/docs/guides/platform/free-plan-pausing). To bring one back, use "Resume project" in the Supabase dashboard.
- The Supabase free plan [allows 200 concurrent connections](https://supabase.com/docs/guides/realtime/limits), which is about 25 full rooms.
- Rejoining a match depends on `localStorage`, so it does not work from another device or browser.
- Player removal is tied to a browser identifier. Someone removed can come back using a private window or another device.
- The profanity filter uses a word list. It catches common variations but not every way of writing a word, and it can flag legitimate words.
- The chat hides answers written in full, but it does not stop indirect hints or answers written in other ways.
- The daily question is checked on the server, but its score is not protected against tampering, since there is no leaderboard.
- Questions eventually repeat across rooms, because the bank is fixed.
