/**
 * All chess-rule work is delegated to chess.js. This module is the thin,
 * auditable layer between chess.js and the ChessUno rules.
 *
 * IMPORTANT DESIGN NOTE
 * A ChessUno turn is a *budget of several chess moves by the same side*.
 * FEN stores whose turn it is, so a move is validated by loading the current
 * FEN with the turn forced to the mover's colour. Within a turn the stored FEN
 * keeps that colour on move (`fenDuringTurn`); when the turn ends, the FEN is
 * flipped back to the opponent (`fenAfterMove`). Castling rights, en-passant
 * square and the halfmove clock all live in the FEN, so nothing is lost.
 */
import { Chess } from 'chess.js';

export const START_FEN = new Chess().fen();
export const PROMOTION_PIECES = ['q', 'r', 'b', 'n'];
export const REVIVABLE_PIECES = ['p', 'n', 'b', 'r', 'q'];

export function otherColour(colour) {
  return colour === 'w' ? 'b' : 'w';
}

export function isSquare(value) {
  return typeof value === 'string' && /^[a-h][1-8]$/.test(value);
}

/** Return the same FEN with the active colour replaced. */
export function fenWithTurn(fen, colour) {
  const parts = fen.split(' ');
  parts[1] = colour;
  return parts.join(' ');
}

/** Parse the placement field of a FEN into an 8x8 array (row 0 = rank 8). */
export function boardFromFen(fen) {
  const rows = String(fen).split(' ')[0].split('/');
  const board = [];

  for (const row of rows) {
    const line = [];
    for (const character of row) {
      if (character >= '1' && character <= '8') {
        for (let i = 0; i < Number(character); i += 1) line.push(null);
      } else if ('pnbrqkPNBRQK'.includes(character)) {
        line.push({
          type: character.toLowerCase(),
          color: character === character.toUpperCase() ? 'w' : 'b',
        });
      }
    }
    while (line.length < 8) line.push(null);
    board.push(line.slice(0, 8));
  }
  while (board.length < 8) board.push(new Array(8).fill(null));
  return board;
}

/** Turn an 8x8 piece array back into a FEN placement field. */
export function placementFromBoard(board) {
  return board
    .map((row) => {
      let out = '';
      let empty = 0;
      for (const square of row) {
        if (!square) {
          empty += 1;
          continue;
        }
        if (empty) {
          out += empty;
          empty = 0;
        }
        out += square.color === 'w' ? square.type.toUpperCase() : square.type;
      }
      if (empty) out += empty;
      return out;
    })
    .join('/');
}

/** 'e4' -> { r: 4, c: 4 } */
export function squareToRC(square) {
  return { r: 8 - Number(square[1]), c: square.charCodeAt(0) - 97 };
}

export function rcToSquare(r, c) {
  return `${'abcdefgh'[c]}${8 - r}`;
}

/** Every legal move for `colour` as a plain, JSON-safe list. */
export function legalMoves(fen, colour) {
  try {
    const game = new Chess(fenWithTurn(fen, colour));
    return game.moves({ verbose: true }).map((move) => ({
      from: move.from,
      to: move.to,
      promotion: move.promotion || null,
      capture: Boolean(move.captured),
      flags: move.flags,
    }));
  } catch {
    return [];
  }
}

export function isInCheck(fen, colour) {
  try {
    return new Chess(fenWithTurn(fen, colour)).isCheck();
  } catch {
    return false;
  }
}

/**
 * Validate and apply one chess move for `colour`.
 * Never trusts the client: the move must be in chess.js' legal move list.
 */
export function applyMove(fen, colour, input) {
  const from = input?.from;
  const to = input?.to;
  let promotion = typeof input?.promotion === 'string' ? input.promotion.toLowerCase() : null;

  if (!isSquare(from) || !isSquare(to) || from === to) {
    return { ok: false, error: 'err.illegal_move' };
  }

  const board = boardFromFen(fen);
  const source = board[squareToRC(from).r][squareToRC(from).c];
  if (!source || source.color !== colour) return { ok: false, error: 'err.illegal_move' };

  const target = board[squareToRC(to).r][squareToRC(to).c];
  // A king can never be captured: with multi-move turns a checked king is not
  // allowed to simply be taken, the check must be answered on the next turn.
  if (target && target.type === 'k') return { ok: false, error: 'err.illegal_move' };

  const lastRank = colour === 'w' ? 0 : 7;
  const needsPromotion = source.type === 'p' && squareToRC(to).r === lastRank;
  if (needsPromotion) {
    if (!PROMOTION_PIECES.includes(promotion)) return { ok: false, error: 'err.promotion_required' };
  } else {
    promotion = null;
  }

  const game = new Chess(fenWithTurn(fen, colour));
  let applied;
  try {
    applied = game.move({ from, to, promotion: promotion || undefined });
  } catch {
    return { ok: false, error: 'err.illegal_move' };
  }
  if (!applied) return { ok: false, error: 'err.illegal_move' };

  const fenAfterMove = game.fen(); // side to move is now the opponent
  const opponent = otherColour(colour);
  const opponentHasMoves = game.moves().length > 0;
  const opponentInCheck = game.isCheck();

  return {
    ok: true,
    fenAfterMove,
    fenDuringTurn: fenWithTurn(fenAfterMove, colour),
    move: {
      from: applied.from,
      to: applied.to,
      piece: applied.piece,
      colour,
      promotion: applied.promotion || null,
      captured: applied.captured || null,
      san: applied.san,
      flags: applied.flags,
    },
    // Only pieces the mover just took are added to the opponent's "lost" pile.
    removed: applied.captured ? [{ colour: opponent, type: applied.captured }] : [],
    opponentHasMoves,
    opponentInCheck,
    checkmate: !opponentHasMoves && opponentInCheck,
    stalemate: !opponentHasMoves && !opponentInCheck,
  };
}

/**
 * Put a captured piece back on the board (the "+2" / revive card).
 * The piece may only appear on an empty square, never as a pawn on rank 1/8,
 * and never in a way that leaves the reviving player's own king in check.
 */
export function placePiece(fen, colour, square, type) {
  if (!isSquare(square)) return { ok: false, error: 'err.bad_square' };
  if (!REVIVABLE_PIECES.includes(type)) return { ok: false, error: 'err.bad_piece' };

  const board = boardFromFen(fen);
  const { r, c } = squareToRC(square);
  if (board[r][c]) return { ok: false, error: 'err.square_occupied' };
  if (type === 'p' && (r === 0 || r === 7)) return { ok: false, error: 'err.pawn_rank' };

  const nextBoard = board.map((row) => row.slice());
  nextBoard[r][c] = { type, color: colour };

  const parts = fen.split(' ');
  const newFen = [
    placementFromBoard(nextBoard),
    parts[1] || colour,
    parts[2] || '-',
    parts[3] || '-',
    parts[4] || '0',
    parts[5] || '1',
  ].join(' ');

  try {
    const probe = new Chess(fenWithTurn(newFen, colour));
    if (probe.isCheck()) return { ok: false, error: 'err.own_king_in_check' };
  } catch {
    return { ok: false, error: 'err.illegal_position' };
  }

  return { ok: true, fen: newFen };
}

/** Halfmove clock from a FEN (used for the 50-move rule). */
export function halfmoveClock(fen) {
  return Number(fen.split(' ')[4]) || 0;
}

/** Position key for threefold repetition: placement + turn + rights + ep. */
export function repetitionKey(fen) {
  const [placement, turn, castling, ep] = fen.split(' ');
  return `${placement} ${turn} ${castling} ${ep}`;
}

/**
 * K vs K, K + single minor vs K, K + bishop vs K + bishop on the same colour.
 * (Kept intentionally conservative: K+2N is *not* automatically a draw.)
 */
export function isInsufficientMaterial(fen) {
  const board = boardFromFen(fen);
  const pieces = [];
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      const piece = board[r][c];
      if (piece && piece.type !== 'k') pieces.push({ ...piece, r, c });
    }
  }

  if (pieces.length === 0) return true;
  if (pieces.length === 1) return pieces[0].type === 'b' || pieces[0].type === 'n';
  if (pieces.length === 2 && pieces.every((p) => p.type === 'b')) {
    const [a, b] = pieces;
    return (a.r + a.c) % 2 === (b.r + b.c) % 2;
  }
  return false;
}
