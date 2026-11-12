/**
 * ChessUno client.
 *
 * The client is intentionally "dumb": it renders the snapshot the server sends
 * and reports player intents. All rules, legality and randomness are server-side.
 */
import { io } from '/socket.io/socket.io.esm.min.js';
import { applyStatic, getLanguage, initLanguage, onLanguageChange, setLanguage, t } from './i18n.js';
import { initSound, isSoundEnabled, setSoundEnabled, sounds, unlockAudio } from './sounds.js';
import { BoardView } from './board.js';

const SESSION_KEY = 'chessuno:session';
const NICKNAME_KEY = 'chessuno:nickname';
const EMOTES = ['👍', '😂', '🔥', '😱', '🤝', '🎉'];
const PROMOTION_GLYPHS = { q: '♛', r: '♜', b: '♝', n: '♞' };

const app = {
  socket: null,
  session: null,
  state: null,
  screen: 'lobby',
  board: null,
  resultKey: null,
  revivePiece: null,
  cardId: null,
  promo: null,
  rejoinPending: false,
  pausedTimer: null,
};

const $ = (id) => document.getElementById(id);

/* -------------------------------------------------------------------------- */
/*  Small DOM helpers                                                         */
/* -------------------------------------------------------------------------- */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function toast(message, kind = 'info') {
  const node = el('div', `toast ${kind}`, message);
  $('toasts').append(node);
  setTimeout(() => node.classList.add('out'), 2800);
  setTimeout(() => node.remove(), 3300);
}

function openModal(id) {
  $(id).classList.remove('hidden');
  document.body.classList.add('modal-open');
}

function closeModal(id) {
  $(id).classList.add('hidden');
  if (!document.querySelector('.modal:not(.hidden)')) document.body.classList.remove('modal-open');
}

function closeAllModals() {
  document.querySelectorAll('.modal').forEach((modal) => modal.classList.add('hidden'));
  document.body.classList.remove('modal-open');
}

/* -------------------------------------------------------------------------- */
/*  Startup                                                                   */
/* -------------------------------------------------------------------------- */

function init() {
  initLanguage();
  initSound();

  app.board = new BoardView($('board'), {
    onMove: (from, to, promotion) => send('game:move', { from, to, promotion }),
    onPromotionNeeded: (from, to) => openPromotion(from, to),
    onEmptySquare: (square) => placeRevived(square),
  });

  bindUi();
  applyLanguage();
  restoreNickname();
  readInviteLink();
  connectSocket();
  showScreen('lobby');
  setInterval(tickPause, 1000);
}

function bindUi() {
  $('btn-create').addEventListener('click', createRoom);
  $('btn-join').addEventListener('click', joinRoom);
  $('join-code').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') joinRoom();
  });
  $('nickname').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') createRoom();
  });
  $('join-code').addEventListener('input', () => {
    const input = $('join-code');
    input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
  });

  $('btn-random-name').addEventListener('click', () => {
    $('nickname').value = randomNickname();
  });

  $('btn-copy-code').addEventListener('click', () => {
    if (app.state) copyText(app.state.code);
  });
  $('btn-copy-link').addEventListener('click', () => {
    if (app.state) copyText(inviteLink(app.state.code));
  });
  $('btn-copy-room').addEventListener('click', () => {
    if (app.state) copyText(inviteLink(app.state.code));
  });
  $('btn-cancel-wait').addEventListener('click', goLobby);

  $('btn-end-turn').addEventListener('click', () => send('game:endTurn', {}));
  $('btn-resign').addEventListener('click', () => {
    if (window.confirm(t('game.resignConfirm'))) send('game:resign', {});
  });
  $('btn-offer-draw').addEventListener('click', () => send('game:offerDraw', {}));
  $('btn-accept-draw').addEventListener('click', () => {
    send('game:drawResponse', { accept: true });
    closeModal('modal-draw');
  });
  $('btn-decline-draw').addEventListener('click', () => {
    send('game:drawResponse', { accept: false });
    closeModal('modal-draw');
  });

  $('btn-rematch').addEventListener('click', () => {
    send('game:rematch', {});
    $('btn-rematch').disabled = true;
    $('btn-rematch').textContent = t('result.waitingOther');
  });
  $('btn-lobby').addEventListener('click', goLobby);

  $('revive-select').addEventListener('change', (event) => {
    app.revivePiece = event.target.value || null;
  });

  document.querySelectorAll('[data-close]').forEach((button) => {
    button.addEventListener('click', () => closeModal(button.dataset.close));
  });
  $('modal-help').addEventListener('click', (event) => {
    if (event.target.id === 'modal-help') closeModal('modal-help');
  });
  $('btn-help').addEventListener('click', () => openModal('modal-help'));

  $('btn-sound').addEventListener('click', () => {
    setSoundEnabled(!isSoundEnabled());
    updateSoundButton();
    unlockAudio();
    if (isSoundEnabled()) sounds.emote();
  });

  document.querySelectorAll('[data-lang]').forEach((button) => {
    button.addEventListener('click', () => setLanguage(button.dataset.lang));
  });

  document.addEventListener('pointerdown', unlockAudio, { once: true });

  // Emoji reactions
  const bar = $('emote-bar');
  EMOTES.forEach((emote) => {
    const button = el('button', 'emote-btn', emote);
    button.type = 'button';
    button.addEventListener('click', () => send('chat:emote', { emote }));
    bar.append(button);
  });

  onLanguageChange(() => {
    applyLanguage();
    render();
    if (app.screen === 'waiting') $('waiting-code').textContent = app.state?.code || '';
  });
}

function applyLanguage() {
  applyStatic();
  document.querySelectorAll('[data-lang]').forEach((button) => {
    button.classList.toggle('active', button.dataset.lang === getLanguage());
  });
  updateSoundButton();
}

function updateSoundButton() {
  $('btn-sound').classList.toggle('muted', !isSoundEnabled());
}

function randomNickname() {
  const adjectives = ['Swift', 'Quiet', 'Clever', 'Brave', 'Lucky', 'Cosmic', 'Silent', 'Royal'];
  const animals = ['Knight', 'Rook', 'Pawn', 'Fox', 'Owl', 'Tiger', 'Comet', 'Wolf'];
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  return `${adjective}${animal}${Math.floor(Math.random() * 90 + 10)}`;
}

function nicknameValue() {
  const value = $('nickname').value.trim();
  if (value) {
    try {
      localStorage.setItem(NICKNAME_KEY, value);
    } catch {
      /* ignore */
    }
  }
  return value;
}

function restoreNickname() {
  try {
    const saved = localStorage.getItem(NICKNAME_KEY);
    if (saved) $('nickname').value = saved;
  } catch {
    /* ignore */
  }
}

function readInviteLink() {
  const params = new URLSearchParams(window.location.search);
  const code = (params.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
  if (code) {
    $('join-code').value = code;
    const stored = readStoredSession();
    if (!stored || stored.code !== code) toast(t('waiting.share'), 'info');
  }
}

function inviteLink(code) {
  return `${window.location.origin}/?room=${code}`;
}

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.append(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    toast(t('err.copied'), 'success');
  } catch {
    toast(t('err.copy_failed'), 'warn');
  }
}

/* -------------------------------------------------------------------------- */
/*  Session storage (reconnect token only — no accounts)                      */
/* -------------------------------------------------------------------------- */

function storeSession(session) {
  try {
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ code: session.code, token: session.token, at: Date.now() }),
    );
  } catch {
    /* ignore */
  }
}

function readStoredSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.code || !parsed?.token) return null;
    if (Date.now() - (parsed.at || 0) > 6 * 60 * 60 * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearStoredSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/* -------------------------------------------------------------------------- */
/*  Sockets                                                                   */
/* -------------------------------------------------------------------------- */

function send(event, payload) {
  if (!app.socket || !app.socket.connected) {
    toast(t('err.connection'), 'warn');
    return false;
  }
  app.socket.emit(event, payload || {});
  return true;
}

function connectSocket() {
  const socket = io({
    reconnection: true,
    reconnectionDelay: 700,
    reconnectionDelayMax: 5000,
    timeout: 20000,
  });
  app.socket = socket;

  socket.on('connect', () => {
    $('connection-status').classList.add('online');
    const stored = readStoredSession();
    if (stored) {
      app.rejoinPending = true;
      socket.emit('room:rejoin', { code: stored.code, token: stored.token });
    }
  });

  socket.on('disconnect', () => {
    $('connection-status').classList.remove('online');
    if (app.screen === 'game') toast(t('err.connection'), 'warn');
  });

  socket.on('session', (session) => {
    app.session = session;
    app.rejoinPending = false;
    storeSession(session);
    $('waiting-code').textContent = session.code;
    document.title = `ChessUno · ${session.code}`;
  });

  socket.on('room:state', (state) => {
    app.state = state;
    if (state.status === 'waiting') showScreen('waiting');
    else showScreen('game');
    render();
  });

  socket.on('game:event', handleEvents);

  socket.on('room:error', ({ error }) => {
    const key = typeof error === 'string' ? error : 'err.server';
    if (app.rejoinPending) {
      app.rejoinPending = false;
      clearStoredSession();
      if (key === 'err.room_not_found' || key === 'err.invalid_token') return;
    }
    if (key === 'err.invalid_token') clearStoredSession();
    toast(t(key), 'warn');
  });

  socket.on('chat:emote', ({ name, emote }) => {
    showEmote(emote);
    sounds.emote();
    if (name) toast(`${name}: ${emote}`, 'info');
  });

  socket.on('session:replaced', () => {
    toast(t('err.session_replaced'), 'warn');
    clearStoredSession();
    goLobby(false);
  });
}

function createRoom() {
  if (!app.socket?.connected) {
    toast(t('err.connection'), 'warn');
    return;
  }
  app.session = null;
  app.state = null;
  app.socket.emit('room:create', { nickname: nicknameValue() });
}

function joinRoom() {
  const code = $('join-code').value.trim().toUpperCase();
  if (code.length < 4) {
    toast(t('err.join_code'), 'warn');
    return;
  }
  if (!app.socket?.connected) {
    toast(t('err.connection'), 'warn');
    return;
  }
  app.session = null;
  app.state = null;
  app.socket.emit('room:join', { code, nickname: nicknameValue() });
}

function goLobby(notifyServer = true) {
  if (notifyServer) send('room:leave', {});
  clearStoredSession();
  app.session = null;
  app.state = null;
  app.resultKey = null;
  app.cardId = null;
  app.revivePiece = null;
  closeAllModals();
  document.title = 'ChessUno — chess meets UNO, online for two';
  showScreen('lobby');
  if (window.location.search) window.history.replaceState(null, '', window.location.pathname);
}

/* -------------------------------------------------------------------------- */
/*  Server events                                                             */
/* -------------------------------------------------------------------------- */

function handleEvents(events) {
  if (!Array.isArray(events)) return;
  for (const event of events) {
    switch (event.type) {
      case 'card:drawn':
        sounds.card();
        break;
      case 'move':
        if (event.move?.captured) sounds.capture();
        else sounds.move();
        break;
      case 'check':
        sounds.check();
        toast(t('feed.check', { player: event.player }), 'check');
        break;
      case 'revive':
        sounds.revive();
        toast(
          t('game.reviveDone', {
            piece: t(`card.piece.${event.piece}`),
            square: event.square,
          }),
          'success',
        );
        break;
      case 'player:disconnected':
        toast(t('game.paused', { name: event.player }), 'warn');
        break;
      case 'player:reconnected':
        toast(t('game.reconnected'), 'success');
        break;
      case 'draw:offered':
        toast(t('game.drawPendingThem', { name: event.player }), 'info');
        break;
      case 'draw:declined':
        toast(t('draw.declined'), 'info');
        break;
      case 'rematch:vote':
        toast(t('result.waitingOther'), 'info');
        break;
      case 'game:over':
        break;
      default:
        break;
    }
  }
}

function showEmote(emote) {
  const layer = $('emote-layer');
  const node = el('span', 'floating-emote', emote);
  node.style.left = `${15 + Math.random() * 65}%`;
  layer.append(node);
  setTimeout(() => node.remove(), 2200);
}

/* -------------------------------------------------------------------------- */
/*  Screens & rendering                                                       */
/* -------------------------------------------------------------------------- */

function showScreen(name) {
  app.screen = name;
  $('screen-lobby').classList.toggle('hidden', name !== 'lobby');
  $('screen-waiting').classList.toggle('hidden', name !== 'waiting');
  $('screen-game').classList.toggle('hidden', name !== 'game');
}

function render() {
  const state = app.state;
  if (!state) return;

  $('waiting-code').textContent = state.code;
  $('room-code').textContent = state.code;

  app.board.render(state);
  renderPlayers(state);
  renderTurn(state);
  renderCards(state);
  renderRevive(state);
  renderFeed(state);
  renderControls(state);
  renderPause(state);
  renderResult(state);
  renderDrawOffer(state);

  if (app.promo && (!state.turn?.isYou || state.turn.phase !== 'moves')) {
    app.promo = null;
    closeModal('modal-promotion');
  }
}

function otherPlayer(state) {
  return (state.players || []).find((player) => !player.isYou) || null;
}

function renderPlayers(state) {
  renderStrip($('strip-opponent'), otherPlayer(state), state, false);
  renderStrip($('strip-you'), (state.players || []).find((p) => p.isYou) || null, state, true);
}

function renderStrip(container, player, state, isYouStrip) {
  container.replaceChildren();
  if (!player) {
    container.append(el('span', 'player-name', t('game.waiting')));
    return;
  }
  container.classList.toggle('turn-active', state.turn?.playerId === player.id);

  const main = el('div', 'player-main');
  const chip = el('span', `colour-chip ${player.colour}`, player.colour === 'w' ? '♔' : '♚');
  const info = el('div', 'player-info');
  const nameRow = el('div', 'player-name-row');
  nameRow.append(el('span', 'player-name', player.name));
  if (isYouStrip) nameRow.append(el('span', 'tag', t('game.you')));
  if (state.inCheck && state.sideToMove === player.colour) {
    nameRow.append(el('span', 'tag danger', t('game.inCheckBadge')));
  }

  const sub = el(
    'div',
    'player-sub',
    `${t(player.colour === 'w' ? 'game.white' : 'game.black')} · ${t('game.pieceCount', {
      n: (state.captured?.[player.colour === 'w' ? 'b' : 'w'] || []).length,
    })}`,
  );

  info.append(nameRow, sub);
  main.append(chip, info, el('span', `conn-dot ${player.connected ? 'online' : 'offline'}`));
  container.append(main);

  const captured = state.captured?.[player.colour === 'w' ? 'b' : 'w'] || [];
  if (captured.length) {
    const row = el('div', 'captured-row');
    const order = { q: 0, r: 1, b: 2, n: 3, p: 4 };
    [...captured]
      .sort((a, b) => (order[a] ?? 9) - (order[b] ?? 9))
      .forEach((type) => {
        const glyph = { q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }[type] || '';
        row.append(el('span', `captured-piece ${player.colour === 'w' ? 'black' : 'white'}`, glyph));
      });
    container.append(row);
  }
}

function renderTurn(state) {
  const bar = $('turn-bar');
  bar.replaceChildren();
  bar.className = 'turn-bar';

  if (state.status === 'finished') {
    bar.classList.add('finished');
    bar.append(el('div', 'turn-title', resultTitle(state)));
    if (state.result) bar.append(el('div', 'turn-sub', t(`result.${state.result.reason}`)));
    return;
  }

  const turn = state.turn;
  const isYou = Boolean(turn?.isYou);
  bar.classList.add(isYou ? 'your-turn' : 'their-turn');
  if (state.inCheck) bar.classList.add('in-check');

  bar.append(
    el('div', 'turn-title', isYou ? t('game.yourTurn') : t('game.opponentTurn', { name: turn?.name || '—' })),
  );

  const sub = el('div', 'turn-sub');
  if (turn?.phase === 'moves') {
    sub.textContent = t(turn.movesLeft === 1 ? 'game.movesLeftOne' : 'game.movesLeft', { n: turn.movesLeft });
  } else if (turn?.phase === 'revive') {
    sub.textContent = t('game.revivesLeft', { n: turn.revives });
  } else if (state.drawOfferBy) {
    sub.textContent = state.youOfferedDraw
      ? t('game.drawPendingYou')
      : t('game.drawPendingThem', { name: state.drawOfferBy });
  } else if (turn) {
    sub.textContent = `${t('game.completedMoves', { n: state.moveCount })}`;
  }
  bar.append(sub);

  if (state.inCheck && isYou) bar.append(el('div', 'check-hint', t('game.checkHint')));
}

function buildCard(card, size) {
  const node = el('div', `uno-card c-${card.colour} ${size || ''} kind-${card.kind}`);
  node.dataset.cardId = card.id;

  if (card.kind === 'number') {
    node.append(el('span', 'corner tl', card.value));
    node.append(el('span', 'card-face', card.value));
    node.append(el('span', 'corner br', card.value));
  } else {
    const face = card.kind === 'skip' ? '✋' : card.kind === 'swap' ? '⇄' : '+2';
    const label = card.kind === 'skip' ? t('card.skip') : card.kind === 'swap' ? t('card.swap') : t('card.revive');
    node.append(el('span', 'corner tl', label));
    node.append(el('span', 'card-face small', face));
    node.append(el('span', 'card-label', label));
    node.append(el('span', 'corner br', label));
  }
  return node;
}

function renderCards(state) {
  $('deck-count').textContent = String(state.deckCount ?? 0);

  const holder = $('played-card');
  holder.replaceChildren();
  const card = state.turn?.card || (state.lastPlayed || []).slice(-1)[0] || null;

  if (card) {
    const node = buildCard(card, 'large');
    if (state.turn?.card && card.id !== app.cardId) {
      app.cardId = card.id;
      node.classList.add('flip-in');
    }
    holder.append(node);
  } else {
    holder.append(el('div', 'uno-card empty large', '?'));
  }

  const budget = $('budget');
  budget.replaceChildren();
  if (!state.turn) return;

  if (state.turn.phase === 'moves') {
    budget.append(el('span', 'budget-number', state.turn.movesLeft));
    budget.append(el('span', 'budget-label', t('card.moves')));
  } else if (state.turn.phase === 'revive') {
    budget.append(el('span', 'budget-number', `+${state.turn.revives}`));
    budget.append(el('span', 'budget-label', t('card.revive')));
  }
}

function renderRevive(state) {
  const active = Boolean(
    state.status === 'playing' && state.turn?.isYou && state.turn.phase === 'revive' && state.turn.revives > 0,
  );
  $('revive-panel').classList.toggle('hidden', !active);
  if (!active) {
    app.revivePiece = null;
    return;
  }

  const select = $('revive-select');
  const choices = state.reviveChoices || [];
  const counts = {};
  for (const type of state.captured?.[state.you?.colour] || []) {
    counts[type] = (counts[type] || 0) + 1;
  }

  select.replaceChildren();
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = t('game.revive.pick');
  select.append(placeholder);

  for (const type of choices) {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = `${t(`card.piece.${type}`)}${counts[type] > 1 ? ` ×${counts[type]}` : ''}`;
    select.append(option);
  }

  if (app.revivePiece && choices.includes(app.revivePiece)) select.value = app.revivePiece;
  else {
    select.value = choices[0] || '';
    app.revivePiece = select.value || null;
  }

  $('revive-status').textContent = `${t('game.revive.status', {
    n: state.turn.revives,
  })} · ${t('game.revive.clickHint')}`;
}

function placeRevived(square) {
  if (!app.revivePiece) {
    toast(t('game.revive.pick'), 'warn');
    return;
  }
  send('game:revive', { piece: app.revivePiece, square });
}

function feedText(entry) {
  switch (entry.type) {
    case 'draw': {
      const n = entry.card?.value ?? 0;
      return t(n === 1 ? 'feed.drawOne' : 'feed.draw', {
        player: entry.player,
        card: String(n),
        n,
      });
    }
    case 'skip':
      return t('feed.skip', { player: entry.player });
    case 'swap':
      return t('feed.swap', { player: entry.player });
    case 'revive':
      return entry.count > 0
        ? t('feed.revive', { player: entry.player, n: entry.count })
        : t('feed.reviveNone', { player: entry.player });
    case 'revived':
      return t('feed.revived', {
        player: entry.player,
        piece: t(`card.piece.${entry.piece}`),
        square: entry.square,
      });
    case 'check':
      return t('feed.check', { player: entry.player });
    case 'resign':
      return t('feed.resign', { player: entry.player });
    case 'draw-agreed':
      return t('feed.drawAgreed', { player: entry.player });
    case 'abandon':
      return t('feed.abandon', { player: entry.player });
    case 'over':
      return t('feed.over');
    default:
      return '';
  }
}

function renderFeed(state) {
  const list = $('feed');
  list.replaceChildren();
  const feed = state.feed || [];
  if (!feed.length) {
    list.append(el('li', 'feed-empty', t('game.log.empty')));
    return;
  }
  feed.forEach((entry) => {
    const text = feedText(entry);
    if (text) list.append(el('li', `feed-item ${entry.type}`, text));
  });
  list.scrollTop = list.scrollHeight;
}

function renderControls(state) {
  const playing = state.status === 'playing';
  const canEnd = playing && state.turn?.isYou && (state.turn.phase === 'moves' || state.turn.phase === 'revive');
  $('btn-end-turn').disabled = !canEnd;
  $('btn-resign').disabled = !playing;
  $('btn-offer-draw').disabled = !playing || Boolean(state.drawOfferBy);

  const rematch = $('btn-rematch');
  rematch.disabled = state.rematchYouVoted;
  rematch.textContent = state.rematchYouVoted ? t('result.waitingOther') : t('result.rematch');
}

function renderPause(state) {
  const paused = (state.players || []).filter((player) => !player.connected);
  const banner = $('board-banner');
  if (!paused.length) {
    banner.classList.add('hidden');
    return;
  }
  banner.classList.remove('hidden');
  banner.replaceChildren(
    el('strong', '', t('game.paused', { name: paused[0].name })),
    el('span', '', t('game.reconnectIn', { s: paused[0].disconnectedIn })),
  );
}

function tickPause() {
  const state = app.state;
  if (!state || state.status !== 'playing') return;
  if (!(state.players || []).some((player) => !player.connected)) return;
  const now = Date.now();
  state.players.forEach((player) => {
    if (!player.connected && player.disconnectedIn > 0) player.disconnectedIn -= 1;
  });
  void now;
  renderPause(state);
}

function resultTitle(state) {
  if (!state.result) return t('game.waiting');
  if (!state.result.winner) return t('result.draw');
  return state.result.winner === state.you?.colour ? t('result.youWin') : t('result.youLose');
}

function renderResult(state) {
  if (state.status !== 'finished' || !state.result) {
    closeModal('modal-result');
    return;
  }
  const key = `${state.code}:${state.result.finishedAt}`;
  if (app.resultKey === key) return;
  app.resultKey = key;

  const won = state.result.winner && state.result.winner === state.you?.colour;
  const drew = !state.result.winner;

  $('result-emoji').textContent = drew ? '🤝' : won ? '🏆' : '😔';
  $('result-title').textContent = resultTitle(state);
  $('result-reason').textContent = t(`result.${state.result.reason}`);
  $('btn-rematch').disabled = false;

  if (drew) sounds.draw();
  else if (won) sounds.win();
  else sounds.lose();

  openModal('modal-result');
}

function renderDrawOffer(state) {
  if (state.status === 'playing' && state.drawOfferBy && !state.youOfferedDraw) {
    $('draw-text').textContent = t('draw.text', { name: state.drawOfferBy });
    openModal('modal-draw');
  } else {
    closeModal('modal-draw');
  }
}

/* -------------------------------------------------------------------------- */
/*  Promotion                                                                 */
/* -------------------------------------------------------------------------- */

function openPromotion(from, to) {
  app.promo = { from, to };
  const row = $('promo-row');
  row.replaceChildren();
  Object.entries(PROMOTION_GLYPHS).forEach(([piece, glyph]) => {
    const button = el('button', 'promo-btn', glyph);
    button.type = 'button';
    button.addEventListener('click', () => {
      const promo = app.promo;
      app.promo = null;
      closeModal('modal-promotion');
      if (promo) send('game:move', { from: promo.from, to: promo.to, promotion: piece });
    });
    row.append(button);
  });
  openModal('modal-promotion');
}

init();
