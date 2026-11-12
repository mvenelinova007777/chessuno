import { CARD_COLOURS, DECK } from './constants.js';

let nextCardId = 0;

/**
 * Build a fresh, ordered deck from DECK (see constants.js).
 * Every card gets a unique id plus a cosmetic colour.
 */
export function buildDeck() {
  const cards = [];
  let colourIndex = 0;

  const push = (card) => {
    cards.push({
      id: `c${nextCardId++}`,
      colour: CARD_COLOURS[colourIndex % CARD_COLOURS.length],
      ...card,
    });
    colourIndex += 1;
  };

  for (const { value, copies } of DECK.numbers) {
    for (let i = 0; i < copies; i += 1) push({ kind: 'number', value });
  }
  for (const { kind, copies } of DECK.specials) {
    for (let i = 0; i < copies; i += 1) push({ kind, value: null });
  }

  return cards;
}

/** In-place Fisher-Yates shuffle (returns the same array). */
export function shuffle(array, rng = Math.random) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * The draw pile plus the pile of already-played cards.
 * When the draw pile runs dry the played cards are reshuffled back in.
 */
export class Deck {
  constructor(rng = Math.random) {
    this.rng = rng;
    this.drawPile = shuffle(buildDeck(), rng);
    this.discardPile = [];
  }

  get remaining() {
    return this.drawPile.length;
  }

  /** Draw the top card, reshuffling the discard pile if needed. */
  draw() {
    if (this.drawPile.length === 0) {
      if (this.discardPile.length === 0) return null; // 51 cards: unreachable in a real game
      this.drawPile = shuffle(this.discardPile, this.rng);
      this.discardPile = [];
    }
    return this.drawPile.pop();
  }

  /** Move a played card to the discard pile. */
  discard(card) {
    if (card) this.discardPile.push(card);
  }
}
