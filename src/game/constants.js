/**
 * ChessUno constants.
 *
 * Everything a designer might want to tune lives here, at the top of the codebase.
 */

/* -------------------------------------------------------------------------- */
/*  Deck composition                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Balancing rationale (see README for the long version):
 *  - A turn budget of "1" is the baseline chess experience, so 1s are the most
 *    common card. Copy counts fall off quickly as the number grows: a "6" or
 *    "7" in the opening can win material for free, so those are rare.
 *  - The 40 numeric cards have an average budget of ~3.2 moves, but the 11
 *    special cards (5 skip, 3 swap, 3 revive) remove moves entirely, so the
 *    real average action per turn is a little over 2 moves. That keeps games
 *    recognisably chess-like while still feeling like UNO.
 *  - 51 cards total: enough variety that a 2-player game rarely reshuffles
 *    twice, short enough that cards cycle back within a game.
 */
export const DECK = {
  numbers: [
    { value: 1, copies: 10 },
    { value: 2, copies: 9 },
    { value: 3, copies: 7 },
    { value: 4, copies: 5 },
    { value: 5, copies: 3 },
    { value: 6, copies: 2 },
    { value: 7, copies: 2 },
    { value: 8, copies: 1 },
    { value: 9, copies: 1 },
  ],
  specials: [
    { kind: 'skip', copies: 5 },
    { kind: 'swap', copies: 3 },
    { kind: 'revive', copies: 3 },
  ],
};

/** Purely cosmetic UNO colours, cycled over the deck. */
export const CARD_COLOURS = ['red', 'yellow', 'green', 'blue'];

/** How many pieces a "+2" (revive) card may bring back. */
export const REVIVE_BUDGET = 2;

/* -------------------------------------------------------------------------- */
/*  Rooms                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Room-code alphabet: no O/0 and no I/1, so codes cannot be mistyped.
 * 32 symbols ^ 5 = 33.5 million codes.
 */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 5;

/** Grace period after a disconnect before the opponent wins by abandonment. */
export const RECONNECT_GRACE_MS = 60_000;

/** How often the server sweeps abandoned rooms. */
export const CLEANUP_INTERVAL_MS = 60_000;

/** An empty / waiting room with nobody connected is dropped after this. */
export const EMPTY_ROOM_TTL_MS = 2 * 60 * 60 * 1000;

/** A finished room with nobody connected is dropped after this. */
export const FINISHED_ROOM_TTL_MS = 30 * 60 * 1000;

/* -------------------------------------------------------------------------- */
/*  Limits                                                                    */
/* -------------------------------------------------------------------------- */

export const MAX_NICKNAME_LENGTH = 16;

/** Simple per-socket token bucket, protects every handler from flooding. */
export const SOCKET_RATE_LIMIT = { max: 25, windowMs: 1000 };

/** Max number of items kept in the in-room activity feed. */
export const FEED_LENGTH = 6;

/** Emoji reactions a client may send. Anything else is ignored. */
export const EMOTES = ['👍', '😂', '🔥', '😱', '🤝', '🎉'];

/** Soft cap on concurrent rooms (in-memory, so keep it sane on 512 MB). */
export const MAX_ROOMS = 5000;
