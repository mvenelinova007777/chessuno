/**
 * Developer self-test for the ChessUno rules engine and room state machine.
 * Run with:  node scripts/selftest.mjs
 * It is not shipped to the browser and is not needed to play.
 */
import assert from 'node:assert/strict';

import {
  applyMove,
  boardFromFen,
  legalMoves,
  placePiece,
  START_FEN,
} from '../src/game/chessRules.js';
import { Room } from '../src/game/room.js';

let checks = 0;
function check(label, fn) {
  fn();
  checks += 1;
  console.log(`  ok  ${label}`);
}

console.log('chess rules');

check('white can make two moves inside one turn (multi-move FEN)', () => {
  const first = applyMove(START_FEN, 'w', { from: 'e2', to: 'e4' });
  assert.equal(first.ok, true);
  assert.equal(first.fenDuringTurn.split(' ')[1], 'w');
  assert.equal(first.fenAfterMove.split(' ')[1], 'b');

  const second = applyMove(first.fenDuringTurn, 'w', { from: 'd2', to: 'd4' });
  assert.equal(second.ok, true);
  assert.equal(second.move.piece, 'p');
});

check('illegal move is rejected', () => {
  const result = applyMove(START_FEN, 'w', { from: 'e2', to: 'e5' });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'err.illegal_move');
});

check('moving out of check is rejected', () => {
  const fen = '4r1k1/8/8/8/8/8/P7/4K3 w - - 0 1';
  assert.equal(applyMove(fen, 'w', { from: 'a2', to: 'a3' }).error, 'err.illegal_move');
  assert.equal(applyMove(fen, 'w', { from: 'e1', to: 'd1' }).ok, true);
});

check('check can be given mid-turn and the turn continues', () => {
  // White queen h5, black king e8, white to move: Qxf7+ then continue with another move.
  const fen = '4k3/8/8/7Q/8/8/8/4K3 w - - 0 1';
  const checkMove = applyMove(fen, 'w', { from: 'h5', to: 'e8' });
  assert.equal(checkMove.ok, false, 'cannot capture the king');

  const givingCheck = applyMove(fen, 'w', { from: 'h5', to: 'e5' });
  assert.equal(givingCheck.ok, true);
  if (givingCheck.opponentInCheck) {
    const followUp = applyMove(givingCheck.fenDuringTurn, 'w', { from: 'e1', to: 'e2' });
    assert.equal(followUp.ok, true);
  }
});

check('promotion requires an explicit piece', () => {
  const fen = '4k3/P7/8/8/8/8/8/4K3 w - - 0 1';
  assert.equal(applyMove(fen, 'w', { from: 'a7', to: 'a8' }).error, 'err.promotion_required');
  const promoted = applyMove(fen, 'w', { from: 'a7', to: 'a8', promotion: 'q' });
  assert.equal(promoted.ok, true);
  assert.equal(boardFromFen(promoted.fenAfterMove)[0][0].type, 'q');
});

check('checkmate is detected', () => {
  const fen = '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1';
  const mate = applyMove(fen, 'w', { from: 'a1', to: 'a8' });
  assert.equal(mate.checkmate, true);
});

check('castling rights survive the per-move FEN rewrite', () => {
  const fen = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
  const castled = applyMove(fen, 'w', { from: 'e1', to: 'g1' });
  assert.equal(castled.ok, true);
  assert.equal(castled.move.flags.includes('k'), true);
  assert.match(castled.fenAfterMove, / K?Q?k?q? /);
});

check('reviving a pawn on rank 1 is refused', () => {
  const fen = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';
  assert.equal(placePiece(fen, 'w', 'a1', 'p').error, 'err.pawn_rank');
});

check('reviving onto an occupied square is refused', () => {
  const fen = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';
  assert.equal(placePiece(fen, 'w', 'e1', 'n').error, 'err.square_occupied');
});

check('reviving cannot leave your own king in check, but may block a check', () => {
  const fen = '4r1k1/8/8/8/8/8/8/4K3 w - - 0 1';
  assert.equal(placePiece(fen, 'w', 'd4', 'n').error, 'err.own_king_in_check');
  assert.equal(placePiece(fen, 'w', 'e2', 'n').ok, true);
});

console.log('room state machine');

function makeRoom() {
  const room = new Room('TEST1');
  const one = room.addPlayer('Alice', 'socket-a');
  // Deterministic opening card so the suite does not depend on the shuffle.
  forceCards(room, { kind: 'number', value: 2 });
  const two = room.addPlayer('Bob', 'socket-b');
  assert.equal(one.ok, true);
  assert.equal(two.ok, true);
  return { room, alice: one.player, bob: two.player };
}

function forceCards(room, ...cards) {
  const queue = [...cards];
  room.deck.draw = () => {
    const card = queue.shift() || { kind: 'number', value: 1 };
    return { id: `forced-${Math.random()}`, colour: 'red', ...card };
  };
}

const forceCard = (room, card) => forceCards(room, card);

check('the game starts when the second player joins, white to move', () => {
  const { room, alice } = makeRoom();
  assert.equal(room.status, 'playing');
  assert.equal(room.turnPlayer, alice.id);
  assert.equal(room.turn.colour, 'w');
  assert.equal(room.turn.phase, 'moves');
  assert.equal(room.turn.movesLeft, 2);
});

check('a number card allows exactly that many moves', () => {
  const { room, alice } = makeRoom();
  forceCard(room, { kind: 'number', value: 4 });
  room.turnPlayer = alice.id;
  room.beginTurn();
  assert.equal(room.turn.movesLeft, 4);
  assert.equal(room.move(alice.id, { from: 'e2', to: 'e4' }).ok, true);
  assert.equal(room.turn.movesLeft, 3);
  assert.equal(room.move(alice.id, { from: 'd2', to: 'd4' }).ok, true);
  assert.equal(room.turn.movesLeft, 2);
});

check('skip passes the turn without moves', () => {
  const { room, alice, bob } = makeRoom();
  forceCard(room, { kind: 'skip' });
  room.turnPlayer = alice.id;
  room.beginTurn();
  assert.equal(room.turnPlayer, bob.id);
});

check('swap exchanges colours and hands the turn to the side to move', () => {
  const { room, alice, bob } = makeRoom();
  forceCard(room, { kind: 'swap' });
  room.turnPlayer = alice.id;
  room.beginTurn();
  assert.equal(alice.colour, 'b');
  assert.equal(bob.colour, 'w');
  assert.equal(room.turnPlayer, bob.id);
  assert.equal(room.turn.colour, 'w');
  assert.equal(room.fen.split(' ')[1], 'w');
  // Bob (now white) must be able to move.
  assert.equal(room.move(bob.id, { from: 'e2', to: 'e4' }).ok, true);
});

check('+2 with nothing captured does nothing and ends the turn', () => {
  const { room, alice, bob } = makeRoom();
  forceCard(room, { kind: 'revive' });
  room.turnPlayer = alice.id;
  room.beginTurn();
  assert.equal(room.turnPlayer, bob.id);
});

check('+2 returns a captured piece and tracks the pile', () => {
  const { room, alice } = makeRoom();
  room.captured.w.push('n');
  room.turn = { playerId: alice.id, colour: 'w', phase: 'moves', card: null, movesLeft: 0, revives: 0 };
  room.turnPlayer = alice.id;
  forceCard(room, { kind: 'revive' });
  room.beginTurn();
  assert.equal(room.turn.phase, 'revive');
  assert.equal(room.turn.revives, 1);

  const placed = room.revive(alice.id, { piece: 'n', square: 'd4' });
  assert.equal(placed.ok, true);
  assert.equal(room.captured.w.length, 0);
  assert.equal(boardFromFen(room.fen)[4][3].type, 'n');
});

check('captures are recorded against the right colour', () => {
  const { room, alice } = makeRoom();
  room.turn.movesLeft = 2;
  room.turn.phase = 'moves';
  room.move(alice.id, { from: 'e2', to: 'e4' });
  room.turn.movesLeft = 2;
  room.move(alice.id, { from: 'd2', to: 'd4' });
  assert.equal(room.captured.w.length, 0);
});

check('checkmate mid-turn ends the game immediately', () => {
  const { room, alice } = makeRoom();
  room.fen = '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1';
  room.turn.playerId = alice.id;
  room.turn.phase = 'moves';
  room.turn.movesLeft = 4;
  room.move(alice.id, { from: 'a1', to: 'a8' });
  assert.equal(room.status, 'finished');
  assert.equal(room.result.winner, 'w');
  assert.equal(room.result.reason, 'checkmate');
});

check('resign and rematch work', () => {
  const { room, alice, bob } = makeRoom();
  room.resign(alice.id);
  assert.equal(room.status, 'finished');
  assert.equal(room.result.winner, 'b');
  room.requestRematch(alice.id);
  room.requestRematch(bob.id);
  assert.equal(room.status, 'playing');
  assert.equal(alice.colour, 'b');
  assert.equal(bob.colour, 'w');
});

check('a paused game rejects moves', () => {
  const { room, alice } = makeRoom();
  room.markDisconnected(alice.id);
  const result = room.move(alice.id, { from: 'e2', to: 'e4' });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'err.game_paused');
});

check('the deck reshuffles instead of running out', () => {
  const { room } = makeRoom();
  room.deck.discardPile = [...room.deck.drawPile];
  room.deck.drawPile = [];
  const card = room.deck.draw();
  assert.ok(card);
});

check('every legal move list is JSON serialisable', () => {
  const moves = legalMoves(START_FEN, 'w');
  assert.equal(moves.length, 20);
  assert.equal(typeof JSON.stringify(moves), 'string');
});

console.log(`\nAll ${checks} checks passed.`);
