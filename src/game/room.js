/**
 * A single ChessUno room. The server is the single source of truth: every
 * action arrives as an *intent* from a client, is validated here, and only
 * then mutates state.
 *
 * ── Room state machine ──────────────────────────────────────────────────────
 *   waiting  ──(second player joins)──▶ playing ──(mate/draw/resign/abandon)──▶ finished
 *        ▲                                  ▲                                     │
 *        └──────────────── rematch (colours swapped) ◀────────────────────────────┘
 *
 * ── Turn state machine (only while `playing`) ───────────────────────────────
 *   1. beginTurn()      side to move is asked for a card
 *   2. draw card        server-side random, the card is public information
 *   3. apply the card:
 *        number  -> phase 'moves',   movesLeft = value
 *        skip    -> phase 'skip',    turn ends immediately
 *        swap    -> phase 'swap',    players change colour, turn ends immediately
 *        revive  -> phase 'revive',  revives = min(2, captured pieces)
 *   4. the player acts (moves / placements) until the budget is spent,
 *      no legal action remains, or they press "End turn"
 *   5. endTurn()        turn passes to the other player, FEN is flipped
 *
 * ── Colour swap decision ────────────────────────────────────────────────────
 * The swap card flips which side each *player* controls; the pieces on the
 * board never move. Because the card is drawn at the very start of a turn, the
 * chess side-to-move is still the card user's old colour. The turn is then
 * passed to the opponent — who, after the swap, controls exactly that side.
 * The result is a legal chess position and normal alternation continues.
 *
 * ── +2 (revive) decision ────────────────────────────────────────────────────
 * Revived pieces are only taken from `captured[colour]`, i.e. pieces of the
 * colour the player currently controls that were actually captured. Kings are
 * never captured, so they can never come back. Placement is re-validated as a
 * FEN load, which is why the halfmove clock survives.
 */
import { randomBytes, randomUUID } from 'node:crypto';

import { FEED_LENGTH, RECONNECT_GRACE_MS, REVIVE_BUDGET } from './constants.js';
import { Deck } from './deck.js';
import {
  START_FEN,
  applyMove,
  boardFromFen,
  fenWithTurn,
  halfmoveClock,
  isInCheck,
  isInsufficientMaterial,
  legalMoves,
  otherColour,
  placePiece,
  repetitionKey,
} from './chessRules.js';

const PIECE_NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen' };

export class Room {
  constructor(code) {
    this.code = code;
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
    this.players = []; // { id, token, name, colour, socketId, connected, disconnectedAt }
    this.events = []; // transient client events, drained on every broadcast
    this.status = 'waiting';
    this.resetMatch();
    this.beginGame(); // no-op until two players are present
  }

  touch() {
    this.updatedAt = Date.now();
  }

  /* ------------------------------------------------------------------------ */
  /*  Players                                                                 */
  /* ------------------------------------------------------------------------ */

  getPlayer(sessionId) {
    return this.players.find((player) => player.id === sessionId) || null;
  }

  getPlayerByToken(token) {
    if (typeof token !== 'string' || !token) return null;
    return this.players.find((player) => player.token === token) || null;
  }

  otherPlayer(sessionId) {
    return this.players.find((player) => player.id !== sessionId) || null;
  }

  addPlayer(name, socketId) {
    if (this.players.length >= 2) return { ok: false, error: 'err.room_full' };
    if (this.status !== 'waiting') return { ok: false, error: 'err.game_started' };

    const player = {
      id: randomUUID(),
      token: randomBytes(24).toString('hex'),
      name,
      colour: this.players.length === 0 ? 'w' : 'b',
      socketId,
      connected: true,
      disconnectedAt: null,
    };
    this.players.push(player);
    this.touch();

    if (this.players.length === 2) this.beginGame();
    return { ok: true, player };
  }

  markConnected(sessionId, socketId) {
    const player = this.getPlayer(sessionId);
    if (!player) return null;
    player.socketId = socketId;
    player.connected = true;
    player.disconnectedAt = null;
    this.touch();
    this.events.push({ type: 'player:reconnected', player: player.name });
    return player;
  }

  markDisconnected(sessionId) {
    const player = this.getPlayer(sessionId);
    if (!player) return null;
    player.socketId = null;
    player.connected = false;
    player.disconnectedAt = Date.now();
    this.touch();
    this.events.push({ type: 'player:disconnected', player: player.name });
    return player;
  }

  /* ------------------------------------------------------------------------ */
  /*  Match lifecycle                                                         */
  /* ------------------------------------------------------------------------ */

  resetMatch() {
    this.fen = START_FEN;
    this.deck = new Deck();
    this.lastPlayed = [];
    this.feed = [];
    this.captured = { w: [], b: [] };
    this.turn = null;
    this.turnPlayer = null;
    this.lastMove = null;
    this.result = null;
    this.drawOfferBy = null;
    this.rematchVotes = new Set();
    this.moveCount = 0;
    this.repetition = new Map([[repetitionKey(START_FEN), 1]]);
    this.status = 'waiting';
    if (!this.events) this.events = [];
    this.events.push({ type: 'match:reset' });
  }

  beginGame() {
    if (this.players.length < 2) return;
    this.status = 'playing';
    const white = this.players.find((player) => player.colour === 'w') || this.players[0];
    this.turnPlayer = white.id;
    this.fen = fenWithTurn(START_FEN, white.colour);
    this.events.push({ type: 'match:start' });
    this.beginTurn();
  }

  /**
   * Start a player's turn: check for mate/stalemate, then draw their card.
   * Skip / swap / "+2 with nothing to return" end the turn immediately, so the
   * whole sequence is a loop rather than recursion (a deck of only Skip cards
   * would otherwise overflow the stack). The loop cap is a safety valve only.
   */
  beginTurn() {
    if (this.status !== 'playing') return;

    for (let guard = 0; guard < 16; guard += 1) {
      if (this.status !== 'playing') return;

      const player = this.getPlayer(this.turnPlayer);
      if (!player) {
        this.finish({ winner: null, reason: 'aborted' });
        return;
      }

      const colour = player.colour;
      this.fen = fenWithTurn(this.fen, colour);
      this.turn = { playerId: player.id, colour, phase: 'none', card: null, movesLeft: 0, revives: 0 };

      // The side to move may already be mated/stalemated.
      if (this.evaluateTerminal(colour)) return;

      const card = this.deck.draw();
      if (!card) {
        this.finish({ winner: null, reason: 'deck_exhausted' });
        return;
      }

      this.deck.discard(card);
      this.turn.card = card;
      this.lastPlayed.push(card);
      if (this.lastPlayed.length > FEED_LENGTH) this.lastPlayed.shift();
      this.events.push({ type: 'card:drawn', player: player.name, colour, card });
      this.touch();

      if (card.kind === 'number') {
        this.turn.phase = 'moves';
        this.turn.movesLeft = card.value;
        this.pushFeed({ type: 'draw', player: player.name, card });
        if (!legalMoves(this.fen, colour).length) {
          if (this.passTurn('no_legal_moves')) continue;
          return;
        }
        return;
      }

      if (card.kind === 'skip') {
        this.turn.phase = 'skip';
        this.pushFeed({ type: 'skip', player: player.name });
        if (this.passTurn('skip')) continue;
        return;
      }

      if (card.kind === 'swap') {
        this.turn.phase = 'swap';
        this.swapColours();
        this.pushFeed({ type: 'swap', player: player.name });
        if (this.passTurn('swap')) continue;
        return;
      }

      if (card.kind === 'revive') {
        this.turn.phase = 'revive';
        this.turn.revives = Math.min(REVIVE_BUDGET, this.captured[colour].length);
        this.pushFeed({ type: 'revive', player: player.name, count: this.turn.revives });
        if (this.turn.revives === 0) {
          if (this.passTurn('no_captured')) continue;
          return;
        }
        return;
      }
    }

    // Sixteen automatic turn changes in a row: treat as an aborted game.
    this.finish({ winner: null, reason: 'aborted' });
  }

  swapColours() {
    for (const player of this.players) {
      player.colour = otherColour(player.colour);
    }
  }

  /** The clock stops while someone is reconnecting. */
  isPaused() {
    return this.status === 'playing' && this.players.some((player) => !player.connected);
  }

  pushFeed(entry) {
    this.feed.push(entry);
    if (this.feed.length > FEED_LENGTH) this.feed.shift();
  }

  /** Mate / stalemate / automatic draws for the side to move. */
  evaluateTerminal(colour) {
    if (!legalMoves(this.fen, colour).length) {
      const inCheck = isInCheck(this.fen, colour);
      this.finish(
        inCheck
          ? { winner: otherColour(colour), reason: 'checkmate' }
          : { winner: null, reason: 'stalemate' },
      );
      return true;
    }
    if (halfmoveClock(this.fen) >= 100) {
      this.finish({ winner: null, reason: 'fifty_moves' });
      return true;
    }
    if (isInsufficientMaterial(this.fen)) {
      this.finish({ winner: null, reason: 'insufficient_material' });
      return true;
    }
    if ((this.repetition.get(repetitionKey(this.fen)) || 0) >= 3) {
      this.finish({ winner: null, reason: 'threefold_repetition' });
      return true;
    }
    return false;
  }

  bumpRepetition(fen) {
    const key = repetitionKey(fen);
    this.repetition.set(key, (this.repetition.get(key) || 0) + 1);
  }

  finish(result) {
    if (this.status === 'finished') return;
    this.status = 'finished';
    this.result = { ...result, finishedAt: Date.now() };
    this.turn = null;
    this.drawOfferBy = null;
    this.pushFeed({ type: 'over', result: this.result });
    this.events.push({ type: 'game:over', result: this.result });
    this.touch();
  }

  /** Hand the move to the other player without starting their turn. */
  passTurn(reason = 'manual') {
    if (this.status !== 'playing' || !this.turn) return false;
    const player = this.getPlayer(this.turn.playerId);
    const opponent = player ? this.otherPlayer(player.id) : null;
    this.turn = null;
    this.drawOfferBy = null;

    if (!player || !opponent) {
      this.finish({ winner: player ? player.colour : null, reason: 'abandoned' });
      return false;
    }

    this.turnPlayer = opponent.id;
    // Normal alternation, or (after a swap) still the same chess side to move.
    this.fen = fenWithTurn(this.fen, opponent.colour);
    this.events.push({ type: 'turn:end', reason, nextPlayer: opponent.name });
    this.touch();
    return true;
  }

  endTurn(reason = 'manual') {
    if (this.status !== 'playing' || !this.turn) return;
    if (this.passTurn(reason)) this.beginTurn();
  }

  /* ------------------------------------------------------------------------ */
  /*  Player actions (all validated)                                          */
  /* ------------------------------------------------------------------------ */

  move(sessionId, input) {
    if (this.status !== 'playing') return { ok: false, error: 'err.game_not_active' };
    if (this.isPaused()) return { ok: false, error: 'err.game_paused' };
    if (!this.turn || this.turn.playerId !== sessionId) return { ok: false, error: 'err.not_your_turn' };
    if (this.turn.phase !== 'moves') return { ok: false, error: 'err.no_moves_left' };
    if (this.turn.movesLeft <= 0) return { ok: false, error: 'err.no_moves_left' };

    const player = this.getPlayer(sessionId);
    if (!player) return { ok: false, error: 'err.not_in_room' };

    const colour = player.colour;
    const result = applyMove(this.fen, colour, input);
    if (!result.ok) return result;

    this.turn.movesLeft -= 1;
    this.fen = result.fenDuringTurn;
    this.lastMove = { from: result.move.from, to: result.move.to, piece: result.move.piece };
    this.moveCount += 1;
    for (const removed of result.removed) this.captured[removed.colour].push(removed.type);
    this.bumpRepetition(result.fenAfterMove);
    this.touch();

    this.events.push({ type: 'move', move: result.move, movesLeft: this.turn.movesLeft });

    // Checkmate/stalemate delivered mid-turn ends the game at once.
    if (result.checkmate) {
      this.finish({ winner: colour, reason: 'checkmate' });
      return { ok: true };
    }
    if (result.stalemate) {
      this.finish({ winner: null, reason: 'stalemate' });
      return { ok: true };
    }
    if (result.opponentInCheck) {
      this.events.push({ type: 'check', player: player.name });
      this.pushFeed({ type: 'check', player: player.name });
    }

    if (this.turn.movesLeft <= 0) {
      this.endTurn('budget_used');
    } else if (!legalMoves(this.fen, colour).length) {
      this.endTurn('no_legal_moves');
    }
    return { ok: true };
  }

  revive(sessionId, input) {
    if (this.status !== 'playing') return { ok: false, error: 'err.game_not_active' };
    if (this.isPaused()) return { ok: false, error: 'err.game_paused' };
    if (!this.turn || this.turn.playerId !== sessionId) return { ok: false, error: 'err.not_your_turn' };
    if (this.turn.phase !== 'revive') return { ok: false, error: 'err.no_revives_left' };
    if (this.turn.revives <= 0) return { ok: false, error: 'err.no_revives_left' };

    const player = this.getPlayer(sessionId);
    if (!player) return { ok: false, error: 'err.not_in_room' };

    const type = typeof input?.piece === 'string' ? input.piece.toLowerCase() : null;
    const square = input?.square;
    const colour = player.colour;
    const lost = this.captured[colour];
    const index = lost.indexOf(type);
    if (index === -1) return { ok: false, error: 'err.piece_not_captured' };

    const result = placePiece(this.fen, colour, square, type);
    if (!result.ok) return result;

    lost.splice(index, 1);
    this.fen = result.fen;
    this.turn.revives -= 1;
    this.events.push({
      type: 'revive',
      player: player.name,
      colour,
      piece: type,
      pieceName: PIECE_NAMES[type] || type,
      square,
      revivesLeft: this.turn.revives,
    });
    this.pushFeed({ type: 'revived', player: player.name, piece: type, square });
    this.touch();

    if (this.turn.revives <= 0 || this.captured[colour].length === 0) {
      this.endTurn('revive_done');
    }
    return { ok: true };
  }

  endTurnByPlayer(sessionId) {
    if (this.status !== 'playing') return { ok: false, error: 'err.game_not_active' };
    if (this.isPaused()) return { ok: false, error: 'err.game_paused' };
    if (!this.turn || this.turn.playerId !== sessionId) return { ok: false, error: 'err.not_your_turn' };
    this.endTurn('manual');
    return { ok: true };
  }

  resign(sessionId) {
    if (this.status !== 'playing') return { ok: false, error: 'err.game_not_active' };
    const player = this.getPlayer(sessionId);
    if (!player) return { ok: false, error: 'err.not_in_room' };
    const winner = otherColour(player.colour);
    this.pushFeed({ type: 'resign', player: player.name });
    this.finish({ winner, reason: 'resign' });
    return { ok: true };
  }

  offerDraw(sessionId) {
    if (this.status !== 'playing') return { ok: false, error: 'err.game_not_active' };
    const player = this.getPlayer(sessionId);
    if (!player) return { ok: false, error: 'err.not_in_room' };
    if (this.drawOfferBy === sessionId) return { ok: true };
    this.drawOfferBy = sessionId;
    this.events.push({ type: 'draw:offered', player: player.name });
    this.touch();
    return { ok: true };
  }

  respondDraw(sessionId, accept) {
    if (this.status !== 'playing') return { ok: false, error: 'err.game_not_active' };
    if (!this.drawOfferBy || this.drawOfferBy === sessionId) {
      return { ok: false, error: 'err.no_draw_offer' };
    }
    const player = this.getPlayer(sessionId);
    if (!player) return { ok: false, error: 'err.not_in_room' };

    if (accept === true) {
      this.pushFeed({ type: 'draw-agreed', player: player.name });
      this.finish({ winner: null, reason: 'agreement' });
    } else {
      this.drawOfferBy = null;
      this.events.push({ type: 'draw:declined', player: player.name });
      this.touch();
    }
    return { ok: true };
  }

  requestRematch(sessionId) {
    if (this.status !== 'finished') return { ok: false, error: 'err.game_active' };
    const player = this.getPlayer(sessionId);
    if (!player) return { ok: false, error: 'err.not_in_room' };

    this.rematchVotes.add(sessionId);
    this.events.push({ type: 'rematch:vote', player: player.name });

    const connected = this.players.filter((p) => p.connected).length;
    if (this.rematchVotes.size >= Math.min(2, connected) && this.players.length === 2) {
      // Rematch always swaps colours.
      this.swapColours();
      this.resetMatch();
      this.events.push({ type: 'rematch:start', colours: this.players.map((p) => ({ name: p.name, colour: p.colour })) });
      this.beginGame();
    }
    this.touch();
    return { ok: true };
  }

  /** Called when a disconnected player's grace period runs out. */
  abandon(sessionId) {
    const player = this.getPlayer(sessionId);
    if (!player) return;
    if (this.status === 'waiting') {
      this.players = this.players.filter((p) => p.id !== sessionId);
      this.touch();
      return;
    }
    if (this.status === 'playing') {
      this.pushFeed({ type: 'abandon', player: player.name });
      this.finish({ winner: otherColour(player.colour), reason: 'abandoned' });
    }
  }

  /* ------------------------------------------------------------------------ */
  /*  Serialisation                                                           */
  /* ------------------------------------------------------------------------ */

  /**
   * Personalised snapshot. `isYou` flags and legal moves are only ever sent to
   * the owning socket; the opponent never receives information they could use
   * to act for the other player.
   */
  snapshotFor(sessionId) {
    const me = this.getPlayer(sessionId);
    const active = this.turn ? this.getPlayer(this.turn.playerId) : null;
    const turnColour = active ? active.colour : null;

    const legal =
      me && active && active.id === me.id && this.turn?.phase === 'moves' ? legalMoves(this.fen, me.colour) : [];

    const reviveChoices = me ? [...new Set(this.captured[me.colour])] : [];

    return {
      code: this.code,
      status: this.status,
      createdAt: this.createdAt,
      you: me
        ? { id: me.id, name: me.name, colour: me.colour, connected: me.connected }
        : null,
      players: this.players.map((player) => ({
        id: player.id,
        name: player.name,
        colour: player.colour,
        connected: player.connected,
        isYou: player.id === sessionId,
        disconnectedIn: player.connected
          ? 0
          : Math.max(
              0,
              Math.ceil(((player.disconnectedAt || Date.now()) + RECONNECT_GRACE_MS - Date.now()) / 1000),
            ),
        lostPieces: [...this.captured[player.colour]],
      })),
      board: boardFromFen(this.fen),
      fen: this.fen,
      sideToMove: turnColour,
      turn: this.turn
        ? {
            playerId: this.turn.playerId,
            name: active ? active.name : '',
            colour: this.turn.colour,
            isYou: Boolean(me && this.turn.playerId === me.id),
            card: this.turn.card,
            phase: this.turn.phase,
            movesLeft: this.turn.movesLeft,
            revives: this.turn.revives,
          }
        : null,
      legalMoves: legal,
      inCheck: turnColour ? isInCheck(this.fen, turnColour) : false,
      captured: { w: [...this.captured.w], b: [...this.captured.b] },
      reviveChoices,
      deckCount: this.deck.remaining,
      lastPlayed: this.lastPlayed.slice(-5),
      lastMove: this.lastMove,
      moveCount: this.moveCount,
      feed: this.feed.slice(-FEED_LENGTH),
      result: this.result,
      drawOfferBy: this.drawOfferBy
        ? this.players.find((p) => p.id === this.drawOfferBy)?.name || null
        : null,
      youOfferedDraw: this.drawOfferBy === sessionId,
      rematchYouVoted: this.rematchVotes.has(sessionId),
      rematchOtherVoted: this.players.some((p) => p.id !== sessionId && this.rematchVotes.has(p.id)),
    };
  }

  /** Drain transient events for a single broadcast. */
  takeEvents() {
    const events = this.events;
    this.events = [];
    return events;
  }

  isAbandoned(now = Date.now()) {
    const anyConnected = this.players.some((player) => player.connected);
    return !anyConnected && now - this.updatedAt > 5 * 60 * 1000;
  }
}
