/**
 * Tiny i18n helper. English is the source of truth; the Bulgarian dictionary
 * mirrors it key for key.
 *
 * Usage: t('game.turnLabel', { name: 'Buffy' })
 *        applyStatic(document)  -> fills every data-i18n* attribute
 */
const STORAGE_KEY = 'chessuno:lang';

const EN = {
  'ui.sound': 'Sound',
  'ui.help': 'How to play',
  'ui.close': 'Close',
  'ui.copy': 'Copy',

  'lobby.tagline': 'Chess, but every turn begins with an UNO card. Two players, one board, no sign-up.',
  'lobby.nickname': 'Nickname (optional)',
  'lobby.nicknamePlaceholder': 'e.g. Buffy',
  'lobby.random': 'Random',
  'lobby.create': 'Create room',
  'lobby.or': 'or',
  'lobby.joinTitle': 'Join with a room code',
  'lobby.codePlaceholder': 'ABC12',
  'lobby.join': 'Join room',
  'lobby.hint': 'No accounts, no email, no installs. Your nickname is only shown to your opponent.',
  'lobby.connection': 'Connected — ready to play',
  'lobby.feature1.title': 'Real chess rules',
  'lobby.feature1.text': 'Check, checkmate, castling, en passant, promotion and every draw rule are enforced by the server.',
  'lobby.feature2.title': 'One card per turn',
  'lobby.feature2.text': 'Draw a number card to get that many moves, or a Skip, a swap or a +2 that revives captured pieces.',
  'lobby.feature3.title': 'Instant, no signup',
  'lobby.feature3.text': 'Share a five-letter code or a link. The game starts as soon as your friend joins.',

  'waiting.title': 'Room created',
  'waiting.share': 'Send this code to your friend. The game starts the moment they join.',
  'waiting.copyCode': 'Copy code',
  'waiting.copyLink': 'Copy invite link',
  'waiting.waitingForOpponent': 'Waiting for your opponent…',
  'waiting.cancel': 'Back to lobby',

  'game.room': 'Room',
  'game.you': 'You',
  'game.opponent': 'Opponent',
  'game.white': 'White',
  'game.black': 'Black',
  'game.yourTurn': 'Your turn',
  'game.opponentTurn': "{name}'s turn",
  'game.waiting': 'Waiting…',
  'game.movesLeftOne': '1 move left',
  'game.movesLeft': '{n} moves left',
  'game.revivesLeft': '{n} piece(s) to return',
  'game.endTurn': 'End turn',
  'game.resign': 'Resign',
  'game.offerDraw': 'Offer draw',
  'game.drawPendingYou': 'Draw offered — waiting for your opponent',
  'game.drawPendingThem': '{name} offered a draw',
  'game.revive.title': 'Return a captured piece',
  'game.revive.hint': 'Pick one of your captured pieces, then click an empty square.',
  'game.revive.pick': 'Choose a piece',
  'game.revive.clickHint': 'Now click an empty square on the board.',
  'game.revive.status': '{n} left this turn',
  'game.deck': 'Draw pile',
  'game.discard': 'Last cards',
  'game.completedMoves': 'Moves played: {n}',
  'game.check': 'Check!',
  'game.checkHint': 'Your king is in check — you must answer it with your first move.',
  'game.paused': '{name} disconnected',
  'game.reconnectIn': 'Time to reconnect: {s}s',
  'game.reconnected': 'Back in the game.',
  'game.reconnecting': 'Reconnecting…',
  'game.emotes': 'Reactions',
  'game.feed': 'Activity',
  'game.inCheckBadge': 'in check',
  'game.log.empty': 'The board is set. Draw a card to begin.',
  'game.pieceCount': '{n} captured',

  'card.number': '{n}',
  'card.moves': 'moves',
  'card.skip': 'Skip',
  'card.swap': 'Swap',
  'card.revive': '+2',
  'card.skipLong': 'Skip — your turn is lost',
  'card.swapLong': 'Swap — colours are exchanged',
  'card.reviveLong': '+2 — return up to 2 captured pieces',
  'card.piece.p': 'Pawn',
  'card.piece.n': 'Knight',
  'card.piece.b': 'Bishop',
  'card.piece.r': 'Rook',
  'card.piece.q': 'Queen',

  'feed.draw': '{player} drew {card} — {n} moves',
  'feed.drawOne': '{player} drew {card} — 1 move',
  'feed.skip': '{player} drew Skip — turn passed',
  'feed.swap': '{player} drew Swap — colours exchanged',
  'feed.revive': '{player} drew +2 — {n} piece(s) to return',
  'feed.reviveNone': '{player} drew +2 — nothing to return',
  'feed.revived': '{player} returned a {piece} to {square}',
  'feed.check': '{player} gives check!',
  'feed.resign': '{player} resigned',
  'feed.drawAgreed': '{player} accepted the draw',
  'feed.over': 'Game over',
  'feed.abandon': '{player} left the game',
  'feed.rematch': 'Rematch — colours swapped',

  'result.youWin': 'You win!',
  'result.youLose': 'You lose',
  'result.draw': 'Draw',
  'result.checkmate': 'Checkmate',
  'result.stalemate': 'Stalemate — no legal moves',
  'result.resign': 'By resignation',
  'result.abandoned': 'Opponent left the game',
  'result.agreement': 'Draw by agreement',
  'result.fifty_moves': 'Draw by the 50-move rule',
  'result.threefold_repetition': 'Draw by threefold repetition',
  'result.insufficient_material': 'Draw by insufficient material',
  'result.aborted': 'The game was aborted',
  'result.deck_exhausted': 'The deck ran out of cards',
  'result.rematch': 'Rematch (swap colours)',
  'result.lobby': 'Back to lobby',
  'result.waitingOther': 'Waiting for your opponent to accept…',

  'draw.title': 'Draw offered',
  'draw.text': '{name} offers a draw. Do you accept?',
  'draw.accept': 'Accept',
  'draw.decline': 'Decline',
  'draw.declined': 'Draw declined — play on.',
  'game.resignConfirm': 'Resign this game?',
  'game.reviveDone': 'Returned a {piece} to {square}.',

  'promotion.title': 'Promote your pawn',

  'help.title': 'How to play ChessUno',
  'help.intro': 'ChessUno is chess with a twist: instead of one move per turn, you draw an UNO card and it tells you what you may do. Two players, white moves first.',
  'help.setupTitle': 'The board',
  'help.setup': 'The chess rules are complete and standard: legal moves, check, checkmate, stalemate, castling, en passant, promotion, threefold repetition, the 50-move rule and insufficient material (including pieces returned by a +2 card). White always moves first.',
  'help.cardsTitle': 'The cards',
  'help.number': 'A number card gives you that many chess moves this turn. You may split them across several pieces, and every single move must be legal. Press “End turn” when you are done.',
  'help.skip': 'Skip (✋): you lose the turn — no chess moves at all.',
  'help.swap': 'Swap (⇄): you and your opponent exchange colours. The pieces stay where they are, and your opponent moves next with the side that was about to move.',
  'help.revive': '+2: bring back up to two of your own captured pieces. Pick a piece, then click an empty square. Pawns cannot return to the first or last rank, and the placement may not leave your own king in check.',
  'help.turnTitle': 'Turn flow',
  'help.turn': 'Draw a card (it is public, your opponent sees it) → perform the card’s action → the turn passes. If you give check in the middle of a move budget, the turn continues, but you must end your turn with a legal position. Checkmate ends the game immediately, even mid-turn.',
  'help.edgeTitle': 'Tricky cases',
  'help.edge': 'If your king is in check when your turn starts, your first move must answer the check. If you run out of legal moves your turn ends by itself. A +2 with nothing captured simply ends the turn. A swap on the very first turn works normally: the second player then moves white.',
  'help.disconnectTitle': 'Disconnects',
  'help.disconnect': 'If someone loses connection the game pauses for 60 seconds. Reopen the same link on the same device to continue. After the minute, the player who is still online wins. Empty rooms are deleted automatically.',

  'footer.text': 'ChessUno — free to play, no account needed.',

  'err.room_not_found': 'That room does not exist (or was closed).',
  'err.room_full': 'That room already has two players.',
  'err.game_started': 'That game has already started.',
  'err.invalid_token': 'Your old session has expired.',
  'err.rate_limited': 'Slow down a little.',
  'err.server': 'Something went wrong. Try again.',
  'err.server_busy': 'The server is busy. Try again in a moment.',
  'err.not_your_turn': 'It is not your turn.',
  'err.no_moves_left': 'You have no moves left this turn.',
  'err.illegal_move': 'That move is not legal.',
  'err.promotion_required': 'Choose a piece to promote to.',
  'err.bad_square': 'That square does not exist.',
  'err.bad_piece': 'That piece cannot be returned.',
  'err.square_occupied': 'That square is occupied.',
  'err.pawn_rank': 'A pawn cannot stand on the first or last rank.',
  'err.own_king_in_check': 'That would leave your king in check.',
  'err.illegal_position': 'That placement is not allowed.',
  'err.game_not_active': 'The game is not running.',
  'err.game_active': 'The game is still running.',
  'err.not_in_room': 'You are not in this room.',
  'err.piece_not_captured': 'You have not lost that piece.',
  'err.no_revives_left': 'No returns left this turn.',
  'err.no_draw_offer': 'There is no draw offer to answer.',
  'err.game_paused': 'The game is paused while a player reconnects.',
  'err.connection': 'Connection lost — reconnecting…',
  'err.copied': 'Copied!',
  'err.copy_failed': 'Could not copy — select the code manually.',
  'err.session_replaced': 'This game was opened in another tab.',
  'err.rejoin_failed': 'Could not rejoin that game.',
  'err.join_code': 'Enter a 5-character room code.',
};

const BG = {
  'ui.sound': 'Звук',
  'ui.help': 'Как се играе',
  'ui.close': 'Затвори',
  'ui.copy': 'Копирай',

  'lobby.tagline': 'Шах, но всеки ход започва с карта от UNO. Двама играчи, една дъска, без регистрация.',
  'lobby.nickname': 'Прякор (по избор)',
  'lobby.nicknamePlaceholder': 'напр. Иван',
  'lobby.random': 'Случаен',
  'lobby.create': 'Създай стая',
  'lobby.or': 'или',
  'lobby.joinTitle': 'Влез с код на стая',
  'lobby.codePlaceholder': 'ABC12',
  'lobby.join': 'Влез в стая',
  'lobby.hint': 'Без профили, без имейл, без инсталации. Прякорът ти се вижда само от съперника.',
  'lobby.connection': 'Свързан — готов за игра',
  'lobby.feature1.title': 'Истински шахматни правила',
  'lobby.feature1.text': 'Шах, мат, рокада, вземане на пешка в минаване, произвеждане и всички равенства се проверяват на сървъра.',
  'lobby.feature2.title': 'Една карта на ход',
  'lobby.feature2.text': 'Числова карта ти дава толкова ходове, а Skip, Swap и +2 променят играта напълно.',
  'lobby.feature3.title': 'Веднага, без регистрация',
  'lobby.feature3.text': 'Сподели петзнаков код или линк. Играта започва веднага щом приятелят ти влезе.',

  'waiting.title': 'Стаята е създадена',
  'waiting.share': 'Изпрати този код на приятеля си. Играта започва веднага щом влезе.',
  'waiting.copyCode': 'Копирай кода',
  'waiting.copyLink': 'Копирай поканата',
  'waiting.waitingForOpponent': 'Чакаме съперника…',
  'waiting.cancel': 'Обратно към началото',

  'game.room': 'Стая',
  'game.you': 'Ти',
  'game.opponent': 'Съперник',
  'game.white': 'Бели',
  'game.black': 'Черни',
  'game.yourTurn': 'Твой ход',
  'game.opponentTurn': 'Ход на {name}',
  'game.waiting': 'Изчакай…',
  'game.movesLeftOne': 'Остава 1 ход',
  'game.movesLeft': 'Остават {n} хода',
  'game.revivesLeft': 'Остават {n} фигури за връщане',
  'game.endTurn': 'Край на хода',
  'game.resign': 'Предавам се',
  'game.offerDraw': 'Предложи равенство',
  'game.drawPendingYou': 'Предложи равенство — чакаме съперника',
  'game.drawPendingThem': '{name} предлага равенство',
  'game.revive.title': 'Върни взета фигура',
  'game.revive.hint': 'Избери една от взетите ти фигури и кликни на празно поле.',
  'game.revive.pick': 'Избери фигура',
  'game.revive.clickHint': 'Сега кликни на празно поле на дъската.',
  'game.revive.status': 'Остават {n} този ход',
  'game.deck': 'Тесте',
  'game.discard': 'Последни карти',
  'game.completedMoves': 'Изиграни хода: {n}',
  'game.check': 'Шах!',
  'game.checkHint': 'Царят ти е в шах — трябва да отговориш с първия си ход.',
  'game.paused': '{name} се разкачи',
  'game.reconnectIn': 'Време за връщане: {s}с',
  'game.reconnected': 'Отново в играта.',
  'game.reconnecting': 'Свързване…',
  'game.emotes': 'Реакции',
  'game.feed': 'Активност',
  'game.inCheckBadge': 'в шах',
  'game.log.empty': 'Дъската е готова. Изтегли карта, за да започнеш.',
  'game.pieceCount': 'взети: {n}',

  'card.number': '{n}',
  'card.moves': 'хода',
  'card.skip': 'Skip',
  'card.swap': 'Swap',
  'card.revive': '+2',
  'card.skipLong': 'Skip — губиш хода си',
  'card.swapLong': 'Swap — разменяте цветовете',
  'card.reviveLong': '+2 — върни до 2 взети фигури',
  'card.piece.p': 'Пешка',
  'card.piece.n': 'Кон',
  'card.piece.b': 'Офицер',
  'card.piece.r': 'Топ',
  'card.piece.q': 'Царица',

  'feed.draw': '{player} изтегли {card} — {n} хода',
  'feed.drawOne': '{player} изтегли {card} — 1 ход',
  'feed.skip': '{player} изтегли Skip — ходът мина',
  'feed.swap': '{player} изтегли Swap — разменихте цветовете',
  'feed.revive': '{player} изтегли +2 — {n} фигури за връщане',
  'feed.reviveNone': '{player} изтегли +2 — няма какво да върне',
  'feed.revived': '{player} върна {piece} на {square}',
  'feed.check': '{player} дава шах!',
  'feed.resign': '{player} се предаде',
  'feed.drawAgreed': '{player} прие равенството',
  'feed.over': 'Край на играта',
  'feed.abandon': '{player} напусна играта',
  'feed.rematch': 'Реванш — разменени цветове',

  'result.youWin': 'Печелиш!',
  'result.youLose': 'Губиш',
  'result.draw': 'Равенство',
  'result.checkmate': 'Мат',
  'result.stalemate': 'Пат — няма легален ход',
  'result.resign': 'С предаване',
  'result.abandoned': 'Съперникът напусна играта',
  'result.agreement': 'Равенство по споразумение',
  'result.fifty_moves': 'Равенство по правилото за 50 хода',
  'result.threefold_repetition': 'Равенство — трикратно повторение',
  'result.insufficient_material': 'Равенство — недостатъчен материал',
  'result.aborted': 'Играта беше прекъсната',
  'result.deck_exhausted': 'Картите свършиха',
  'result.rematch': 'Реванш (разменени цветове)',
  'result.lobby': 'Обратно към началото',
  'result.waitingOther': 'Чакаме съперникът да приеме…',

  'draw.title': 'Предложение за равенство',
  'draw.text': '{name} предлага равенство. Приемаш ли?',
  'draw.accept': 'Приемам',
  'draw.decline': 'Отказвам',
  'draw.declined': 'Равенството е отказано — играта продължава.',
  'game.resignConfirm': 'Да се предадеш ли?',
  'game.reviveDone': 'Върна {piece} на {square}.',

  'promotion.title': 'Произведи пешката си',

  'help.title': 'Как се играе ChessUno',
  'help.intro': 'ChessUno е шах с обрат: вместо един ход на ред, теглиш карта от UNO и тя определя какво можеш да правиш. Двама играчи, белите започват.',
  'help.setupTitle': 'Дъската',
  'help.setup': 'Шахматните правила са пълни и стандартни: легални ходове, шах, мат, пат, рокада, вземане в минаване, произвеждане, трикратно повторение, правилото за 50 хода и недостатъчен материал (включително фигури, върнати с +2). Белите винаги започват.',
  'help.cardsTitle': 'Картите',
  'help.number': 'Числова карта ти дава толкова шахматни хода този ход. Можеш да ги разпределиш между няколко фигури и всеки отделен ход трябва да е легален. Натисни „Край на хода“, когато си готов.',
  'help.skip': 'Skip (✋): губиш хода — без шахматни ходове.',
  'help.swap': 'Swap (⇄): разменяте цветовете със съперника. Фигурите остават по местата си, а съперникът играе следващия ход със страната, която беше на ход.',
  'help.revive': '+2: върни до две свои взети фигури. Избери фигура и кликни на празно поле. Пешки не могат да се връщат на първи или последен ред и не можеш да оставиш царя си в шах.',
  'help.turnTitle': 'Ред на хода',
  'help.turn': 'Теглиш карта (тя е публична, съперникът я вижда) → изпълняваш действието → ходът минава. Ако дадеш шах по средата на бюджета си, ходът продължава, но трябва да завършиш с легална позиция. Матът завършва играта веднага, дори по средата на хода.',
  'help.edgeTitle': 'Специални случаи',
  'help.edge': 'Ако царят ти е в шах в началото на хода, първият ти ход трябва да отговори на шаха. Ако нямаш легални ходове, ходът ти приключва автоматично. +2 без взети фигури просто приключва хода. Swap в самото начало работи нормално: вторият играч играе с белите.',
  'help.disconnectTitle': 'Прекъсване на връзката',
  'help.disconnect': 'Ако някой загуби връзка, играта спира за 60 секунди. Отвори същия линк на същото устройство, за да продължиш. След минутата играчът, който е още онлайн, печели. Празните стаи се изтриват автоматично.',

  'footer.text': 'ChessUno — безплатно, без регистрация.',

  'err.room_not_found': 'Такава стая не съществува (или е затворена).',
  'err.room_full': 'В тази стая вече има двама играчи.',
  'err.game_started': 'Играта вече е започнала.',
  'err.invalid_token': 'Старата сесия е изтекла.',
  'err.rate_limited': 'Малко по-бавно.',
  'err.server': 'Нещо се обърка. Опитай отново.',
  'err.server_busy': 'Сървърът е зает. Опитай след малко.',
  'err.not_your_turn': 'Не е твой ход.',
  'err.no_moves_left': 'Нямаш останали ходове този ход.',
  'err.illegal_move': 'Този ход не е легален.',
  'err.promotion_required': 'Избери фигура за произвеждане.',
  'err.bad_square': 'Такова поле няма.',
  'err.bad_piece': 'Тази фигура не може да се върне.',
  'err.square_occupied': 'Това поле е заето.',
  'err.pawn_rank': 'Пешка не може да стои на първи или последен ред.',
  'err.own_king_in_check': 'Така царят ти остава в шах.',
  'err.illegal_position': 'Тази позиция не е позволена.',
  'err.game_not_active': 'Играта не е активна.',
  'err.game_active': 'Играта още върви.',
  'err.not_in_room': 'Не си в тази стая.',
  'err.piece_not_captured': 'Не си губил такава фигура.',
  'err.no_revives_left': 'Няма останали връщания този ход.',
  'err.no_draw_offer': 'Няма предложение за равенство.',
  'err.game_paused': 'Играта е на пауза, докато играч се свързва отново.',
  'err.connection': 'Връзката е загубена — свързваме отново…',
  'err.copied': 'Копирано!',
  'err.copy_failed': 'Неуспешно копиране — маркирай кода ръчно.',
  'err.session_replaced': 'Играта беше отворена в друг раздел.',
  'err.rejoin_failed': 'Не успяхме да се върнем в тази игра.',
  'err.join_code': 'Въведи 5-знаков код на стая.',
};

const DICTIONARIES = { en: EN, bg: BG };

let current = 'en';
const listeners = new Set();

export function initLanguage() {
  let saved = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    saved = null;
  }
  current = saved === 'bg' ? 'bg' : 'en';
  document.documentElement.lang = current;
  return current;
}

export function getLanguage() {
  return current;
}

export function setLanguage(lang) {
  current = lang === 'bg' ? 'bg' : 'en';
  document.documentElement.lang = current;
  try {
    localStorage.setItem(STORAGE_KEY, current);
  } catch {
    /* private mode: no persistence, no problem */
  }
  listeners.forEach((listener) => listener(current));
}

export function onLanguageChange(listener) {
  listeners.add(listener);
}

export function t(key, vars) {
  const dictionary = DICTIONARIES[current] || EN;
  let text = dictionary[key] ?? EN[key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}

/** Fill every element carrying a data-i18n* attribute. */
export function applyStatic(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
    element.setAttribute('placeholder', t(element.dataset.i18nPlaceholder));
  });
  root.querySelectorAll('[data-i18n-title]').forEach((element) => {
    element.setAttribute('title', t(element.dataset.i18nTitle));
    element.setAttribute('aria-label', t(element.dataset.i18nTitle));
  });
}
