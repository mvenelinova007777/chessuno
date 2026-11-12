# ChessUno

A two-player, real-time web game: **chess, but every turn begins with an UNO card**
that decides what you may do with your pieces. No accounts, no email, no database —
open the site, share a five-letter code, play.

- Server-authoritative: every move and card action is validated on the server.
- Reconnect support for 60 seconds using a token in `localStorage` (still no account).
- English and Bulgarian UI, responsive desktop/mobile, sound effects, no build step.
- One dependency chain (`express`, `socket.io`, `chess.js`) and a 100% free host.

Full beginner instructions (install → GitHub → Render) live in **[START-HERE.md](START-HERE.md)**.

---

## Architecture

```
Browser (plain ES modules)                 Node.js server
┌──────────────────────────┐   Socket.IO   ┌───────────────────────────────┐
│ app.js    screens, render│◀─────────────▶│ server.js  Express + Socket.IO│
│ board.js  board, d&d     │   events +    │  ├─ rooms Map<code, Room>     │
│ i18n.js   EN/BG          │   snapshots   │  ├─ rate limiting, rejoin,    │
│ sounds.js WebAudio       │               │  │  cleanup, room codes       │
└──────────────────────────┘               │  └─ src/game/                 │
                                           │      room.js       state machine
                                           │      chessRules.js chess.js layer
                                           │      deck.js       draw/reshuffle
                                           │      constants.js  tunables
                                           └───────────────────────────────┘
```

**Why this stack (and no build step):** the client is plain HTML/CSS/ES modules, so
there is nothing to compile and no `dist/` folder to get wrong. Express serves the
files and Socket.IO runs on the same HTTP server, which means **one free web service**
hosts everything and one URL is enough (no CORS, no separate socket host). `chess.js`
is used **only on the server**, so the browser never decides legality and the client
payload stays small — the server sends the board and the legal move list.

**Client trust model.** The browser sends intents only: `{from, to, promotion}`,
`game:revive {piece, square}`, `game:endTurn`, `game:resign`, `game:offerDraw`,
`game:drawResponse`, `game:rematch`, `chat:emote {emote}`. The server re-validates
every one against its own authoritative state and broadcasts a full snapshot. An
opponent never receives the other player's legal-move list.

**State ownership.** Rooms live in memory (`Map<code, Room>`). When the process
restarts (or a free host sleeps), rooms are gone by design — the README's deploy
notes explain this. Nothing personal is stored anywhere.

---

## Rules

### Chess
Complete standard rules via `chess.js`: piece movement, captures, check, checkmate,
stalemate, castling, en passant, promotion (the player picks the piece), insufficient
material, threefold repetition and the 50-move rule. White moves first. Each player
sees the board from their own side.

Threefold repetition is tracked by the room itself (a position key of placement +
side to move + castling + en-passant square), so it still works after a `+2`
placement rebuilds the FEN.

### Cards — one deck per game, drawn automatically at the start of every turn

The drawn card is public: both players see it, and the last five cards stay visible.

| Card | Effect |
| --- | --- |
| **1–9** (40 cards) | That many *individual* chess moves this turn. They may be split across pieces. Each single move must be legal, including not leaving your own king in check. "End turn" stops early. |
| **Skip** ✋ (5 cards) | The turn is lost immediately. |
| **Swap** ⇄ (3 cards) | You and your opponent exchange colours. The pieces stay put. |
| **+2** (3 cards) | Return up to 2 of your own captured pieces (never a king) to empty squares. No pawns on rank 1/8, and the placement may not leave your own king in check. Nothing captured → the card does nothing and the turn ends. |

No wild cards, no +4.

### Deck composition and balance

`src/game/constants.js`:

```js
numbers:  1×10, 2×9, 3×7, 4×5, 5×3, 6×2, 7×2, 8×1, 9×1   // 40 cards
specials: skip×5, swap×3, revive×3                        // 11 cards
```

Reasoning:

- **"1" is the baseline chess turn**, so it is the most common card. Copies fall off
  fast as the number grows: a free 7-move turn in the opening can win material for
  nothing, so 7–9 together make up only 4 of 51 cards.
- **Average numeric budget is ~3.2 moves**, but skip/swap/+2 remove moves entirely,
  so the real average action per turn is a little over 2. In practice games still
  feel like chess, with occasional explosive turns — which is the point of the mix.
- **51 cards** means a game rarely reshuffles twice, and the good cards come back
  within a game. When the draw pile empties, the discard pile is reshuffled in.
- Specials are deliberately rare enough to be memorable: 5 skips, 3 swaps, 3 +2s.
  `+2` is the strongest card when material has been traded, so it is the rarest
  number-wise.

### Turn flow (state machine)

Documented in `src/game/room.js`:

```
waiting ──second player joins──▶ playing ──mate/draw/resign/abandon──▶ finished
   ▲                                ▲                                    │
   └──────────── rematch (colours swapped) ◀────────────────────────────┘

turn:  1. beginTurn   side-to-move is checked for mate/stalemate, draws a card
       2. card effect: moves budget | skip | swap | +2
       3. player acts (moves / placements), each validated individually
       4. turn ends when the budget is spent, no legal action remains,
          or "End turn" — then passTurn + the other player's beginTurn
```

Skip, swap and "+2 with nothing to return" end the turn immediately, so the turn
loop is iterative (a deck of only skips cannot blow the stack); a safety valve
aborts after 16 automatic turns in a row.

### Two rule decisions, explained

**Swap (colour exchange).** The swap card is drawn at the *start* of a turn, before
any chess move, so the chess side-to-move is still the card user's old colour. The
card flips which *player* controls which side, then the turn passes to the opponent —
who, after the flip, controls exactly the side that was to move. The resulting
position is a legal chess position and normal alternation continues.

*Worked example:* Alice (white) draws Swap. Alice becomes black, Bob becomes white,
and Bob moves white next. A swap on the very first turn therefore works normally.

**Mid-turn positions.** A player may give check and keep moving (the spec allows it).
Each move is validated by loading the current FEN with the side to move forced to the
mover's colour; the FEN keeps castling rights, the en-passant square and the
halfmove clock, so nothing is lost between moves. Capturing a king is rejected
outright, and if the opponent is left with **no legal moves** the game ends on the
spot: checkmate if they are in check, stalemate otherwise.

### Edge cases handled explicitly

- **King in check at turn start** → every move offered is one that answers the check
  (`chess.js` generates only legal moves), so a multi-move card cannot ignore it.
- **Checkmate/stalemate in the middle of a multi-move turn** → the game ends
  immediately (mate) or is scored as a draw (stalemate), before the budget is spent.
- **Number card with no legal moves** → the turn ends automatically.
- **`+2` with nothing captured** → message in the activity feed, turn ends.
- **`+2` placement rules** → empty square, own piece type, no pawn on rank 1/8, own
  king not in check (blocking a check with the returned piece *is* allowed).
- **Swap at the start of the game** → second player moves white, see above.
- **Deck exhaustion** → discard pile reshuffled into the draw pile.
- **Disconnect** → game pauses, 60-second grace, then the online player wins.
- **Both players gone** → room deleted by the sweeper (2 h for waiting rooms,
  30 min for finished ones).

---

## File tree

```
.
├── server.js                 Express + Socket.IO, room registry, rate limits, cleanup
├── package.json              express, socket.io, chess.js (+ socket.io-client for tests)
├── .gitignore
├── README.md                 this file
├── START-HERE.md             beginner install/GitHub/Render walkthrough
├── src/
│   └── game/
│       ├── constants.js      deck composition, timers, limits — tune here
│       ├── deck.js           deck build, Fisher-Yates shuffle, reshuffle-on-empty
│       ├── chessRules.js     chess.js wrapper: moves, promotion, revive, draws
│       ├── room.js           room + turn state machine, validation, snapshots
│       └── sanitize.js       nickname cleaning, random nicknames
├── public/
│   ├── index.html            lobby, waiting room, game screen, modals
│   ├── css/styles.css        responsive theme, dark + light, UNO cards, board
│   └── js/
│       ├── app.js            socket wiring, screens, rendering, modals, toasts
│       ├── board.js          board render, click-to-move, pointer drag & drop
│       ├── i18n.js           EN/BG dictionaries + tiny t() helper
│       └── sounds.js         WebAudio sound effects (no audio files)
└── scripts/
    ├── selftest.mjs          rules + state machine tests (no server needed)
    └── e2e.mjs               two real socket clients against a real server
```

---

## Run locally

```bash
npm install
npm start
```

Open <http://localhost:3000>, create a room, then open it again in a second tab
(or an incognito window) and join with the code.

`npm run dev` restarts automatically when a server file changes.
`PORT=8080 npm start` uses another port (on Windows: `set PORT=8080 && npm start`).

### Tests

```bash
npm test         # 22 checks: rules engine + room state machine
npm run test:e2e # boots a server on :3999, plays with two socket clients
```

`npm run test:e2e` covers: room code format, joining, legal-move delivery, out-of-turn
rejection, rate limiting, disconnect pause, token rejoin, forged-token rejection, and
that every static asset (including Socket.IO's client) is served.

### Manual test checklist (2 browsers or 1 normal + 1 incognito)

1. Create a room → code is 5 characters, copy buttons work, invite link opens the
   join form with the code filled in.
2. Join with the code → both boards appear, white at the bottom for white, flipped
   for black.
3. Draw a `4` → make four moves (spread across pieces), counter drops, "End turn".
4. Draw a `4` and press "End turn" after one move → turn passes.
5. Draw Skip → turn passes with no moves.
6. Draw Swap → both boards flip, the other player is on move, colours in the strips
   change.
7. Draw `+2` after a capture → dropdown lists only your captured pieces; place one;
   no pawns on rank 1/8; own-king-in-check placement refused.
8. Draw `+2` with nothing captured → message, turn passes.
9. Checkmate with a multi-move card → game ends immediately, result modal appears,
   Rematch swaps colours.
10. Close one tab → the other shows "disconnected" with a countdown; reopen the same
    tab within 60 s → play continues. Wait 60 s → the online player wins.
11. Draw offer → accept/decline works. Resign works.
12. Switch to BG → every visible label changes, including the rules modal.

---

## Deployment (free)

Full beginner steps: **[START-HERE.md](START-HERE.md)**. Short version:

- **Host:** Render, free Web Service, `npm install` / `npm start`, no card, HTTPS URL
  `https://your-name.onrender.com`.
- **Why Render and not the alternatives (status as of late 2026):**
  - *Render* — 750 instance-hours/month, 512 MB, sleeps after 15 min without inbound
    traffic, ~1 min cold start, no card. WebSocket messages count as traffic, so an
    open game keeps it awake. **This is the recommendation.**
  - *Railway* — no permanent free tier: a $5 / 30-day trial, then a $1/month credit
    that runs out.
  - *Fly.io* — no free tier since Oct 2024.
  - *Glitch* — project hosting shut down in July 2025.
  - *Koyeb* — one small free service, but a card is required ($29 pre-authorisation).
- **Cold starts:** unavoidable on free hosting. Warn your friend that the first visit
  can take ~60 s. Keeping the tab open keeps the service awake; opening it before you
  play is enough. (A paid instance, or a paid uptime pinger, removes it — neither is
  necessary for two friends playing.)
- **Room lifetime vs sleep:** rooms are in memory. If the service sleeps with no
  players connected and restarts, old room codes stop existing; create a new room.
- **Custom domain:** Render → Settings → Custom Domains → add the CNAME at your
  registrar. The certificate is automatic. The domain purchase is the only cost.

---

## Security & privacy

- No accounts, no cookies, no database. `localStorage` holds only: the reconnect
  token + room code, the nickname, the language and the sound preference.
- Nicknames are stripped of control characters, angle brackets, quotes, slashes and
  backticks; capped at 16 characters; rendered with `textContent` only.
- Every socket handler is wrapped in a per-socket token bucket (25 events/second),
  payload validation and a try/catch that never leaks stack traces to the client.
- Move legality, card drawing, turn order, colours, captures and draw offers are all
  decided server-side. `chess.js` is never shipped to the browser.
- Room codes are 5 characters from a 32-symbol alphabet (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789` —
  no `O/0`, no `I/1`), i.e. ~33.5 million codes, and rooms are tiny in memory.
- No personal data is stored; disconnecting and letting the room expire erases
  everything about it.

---

## Credits

Chess rules: [chess.js](https://github.com/jhlywa/chess.js). Images: none — the
pieces are Unicode glyphs and the sounds are synthesised in the browser.
