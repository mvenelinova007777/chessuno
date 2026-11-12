import { MAX_NICKNAME_LENGTH } from './constants.js';

const ADJECTIVES = ['Swift', 'Quiet', 'Clever', 'Brave', 'Lucky', 'Cosmic', 'Silent', 'Royal', 'Rapid', 'Golden'];
const ANIMALS = ['Knight', 'Rook', 'Pawn', 'Fox', 'Owl', 'Tiger', 'Comet', 'Wolf', 'Falcon', 'Panda'];

/**
 * Nicknames are public text, so they are aggressively normalised:
 * control characters, angle brackets and quotes are removed, whitespace is
 * collapsed and the result is length-capped. The client only ever renders
 * names with textContent, so this is belt and braces.
 */
export function sanitizeNickname(raw) {
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    .replace(/[\u0000-\u001F\u007F<>"'`\\/]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  return [...cleaned].slice(0, MAX_NICKNAME_LENGTH).join('');
}

/** Nickname used when the player leaves the field empty. */
export function randomNickname() {
  const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  return `${adjective}${animal}${Math.floor(Math.random() * 90 + 10)}`;
}
