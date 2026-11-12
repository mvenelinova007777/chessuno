/**
 * The chess board: rendering, click-to-move and pointer drag & drop.
 *
 * The board never decides legality — it only offers the moves the server sent
 * in `legalMoves` and reports the player's intent back to the app.
 */
const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const GLYPHS = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };

function rcOf(square) {
  return { r: 8 - Number(square[1]), c: square.charCodeAt(0) - 97 };
}

export class BoardView {
  constructor(root, { onMove, onPromotionNeeded, onEmptySquare }) {
    this.root = root;
    this.onMove = onMove;
    this.onPromotionNeeded = onPromotionNeeded;
    this.onEmptySquare = onEmptySquare;

    this.state = null;
    this.legal = [];
    this.orientation = 'w';
    this.selected = null;
    this.canPlay = false;
    this.drag = null;

    this.root.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointermove', this.handlePointerMove, { passive: true });
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('pointercancel', this.cancelDrag);
  }

  /* ------------------------------------------------------------------------ */
  /*  Rendering                                                               */
  /* ------------------------------------------------------------------------ */

  render(state) {
    this.state = state;
    this.orientation = state?.you?.colour === 'b' ? 'b' : 'w';
    this.legal = Array.isArray(state?.legalMoves) ? state.legalMoves : [];
    this.canPlay = Boolean(
      state?.status === 'playing' &&
        state.turn?.isYou &&
        state.turn.phase === 'moves' &&
        state.turn.movesLeft > 0 &&
        !this.isPaused(state),
    );
    if (!this.canPlay) this.selected = null;

    const board = state?.board;
    const lastMove = state?.lastMove;
    const kingSquare =
      state?.inCheck && board ? this.findKing(board, state.sideToMove) : null;

    const fragment = document.createDocumentFragment();
    this.root.dataset.orientation = this.orientation;

    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const r = this.orientation === 'w' ? row : 7 - row;
        const c = this.orientation === 'w' ? col : 7 - col;
        const square = `${FILES[c]}${8 - r}`;

        const cell = document.createElement('div');
        cell.className = `square ${(r + c) % 2 === 0 ? 'light' : 'dark'}`;
        cell.dataset.square = square;
        cell.setAttribute('role', 'gridcell');
        cell.setAttribute('aria-label', square);

        if (lastMove && (lastMove.from === square || lastMove.to === square)) {
          cell.classList.add('last-move');
        }
        if (this.selected === square) cell.classList.add('selected');
        if (kingSquare === square) cell.classList.add('in-check');

        const piece = board?.[r]?.[c] || null;
        const targets = this.legal.filter((move) => move.to === square);
        if (targets.length) cell.classList.add(piece ? 'capture-target' : 'move-target');

        if (piece) {
          const pieceElement = document.createElement('div');
          pieceElement.className = `piece ${piece.color === 'w' ? 'white' : 'black'}`;
          pieceElement.textContent = GLYPHS[piece.type] || '';
          pieceElement.draggable = false;
          cell.appendChild(pieceElement);
        }

        // Coordinate labels, drawn inside the board's border squares.
        if (col === 0) {
          const rank = document.createElement('span');
          rank.className = 'coord coord-rank';
          rank.textContent = String(r === 0 ? 8 : 8 - r);
          cell.appendChild(rank);
        }
        if (row === 7) {
          const file = document.createElement('span');
          file.className = 'coord coord-file';
          file.textContent = FILES[c];
          cell.appendChild(file);
        }

        fragment.appendChild(cell);
      }
    }

    this.root.replaceChildren(fragment);
  }

  isPaused(state) {
    return (state?.players || []).some((player) => !player.connected);
  }

  findKing(board, colour) {
    if (!colour) return null;
    for (let r = 0; r < 8; r += 1) {
      for (let c = 0; c < 8; c += 1) {
        const piece = board[r]?.[c];
        if (piece && piece.type === 'k' && piece.color === colour) return `${FILES[c]}${8 - r}`;
      }
    }
    return null;
  }

  /* ------------------------------------------------------------------------ */
  /*  Pointer interaction                                                     */
  /* ------------------------------------------------------------------------ */

  handlePointerDown = (event) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    const cell = event.target.closest?.('[data-square]');
    if (!cell) return;

    const state = this.state;
    if (!state) return;
    const square = cell.dataset.square;
    const { r, c } = rcOf(square);
    const piece = state.board?.[r]?.[c] || null;

    // Revive mode: clicking an empty square places the chosen piece.
    if (state.turn?.isYou && state.turn.phase === 'revive') {
      if (!piece && this.onEmptySquare) this.onEmptySquare(square);
      return;
    }

    if (!this.canPlay) return;

    if (this.selected) {
      if (this.selected === square) {
        this.selected = null;
        this.render(state);
        return;
      }
      if (this.matchesLegal(this.selected, square)) {
        this.attemptMove(this.selected, square);
        return;
      }
    }

    if (!piece || piece.color !== state.you?.colour) {
      this.selected = null;
      this.render(state);
      return;
    }

    this.selected = square;
    this.render(state);
    this.startDrag(event, { square, piece });
  };

  handlePointerMove = (event) => {
    const drag = this.drag;
    if (!drag) return;

    if (!drag.active) {
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (Math.hypot(dx, dy) < 6) return;
      drag.active = true;

      const ghost = document.createElement('div');
      ghost.className = `piece drag-ghost ${drag.colour === 'w' ? 'white' : 'black'}`;
      ghost.textContent = drag.glyph;
      document.body.appendChild(ghost);
      drag.ghost = ghost;

      this.root.classList.add('dragging');
      const fromCell = this.root.querySelector(`[data-square="${drag.from}"]`);
      fromCell?.classList.add('drag-source');
    }

    if (drag.ghost) {
      drag.ghost.style.transform = `translate(${event.clientX}px, ${event.clientY}px) translate(-50%, -50%) scale(1.15)`;
    }
  };

  handlePointerUp = (event) => {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    this.root.classList.remove('dragging');
    drag.ghost?.remove();
    this.root.querySelector('.drag-source')?.classList.remove('drag-source');

    if (!drag.active) return; // plain tap: selection already handled

    const element = document.elementFromPoint(event.clientX, event.clientY);
    const cell = element?.closest?.('[data-square]');
    if (!cell) return;
    const target = cell.dataset.square;
    if (target === drag.from) return;
    this.attemptMove(drag.from, target);
  };

  cancelDrag = () => {
    if (!this.drag) return;
    this.drag.ghost?.remove();
    this.drag = null;
    this.root.classList.remove('dragging');
    this.root.querySelector('.drag-source')?.classList.remove('drag-source');
  };

  startDrag(event, { square, piece }) {
    this.drag = {
      from: square,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      ghost: null,
      glyph: GLYPHS[piece.type] || '',
      colour: piece.color,
    };
  }

  matchesLegal(from, to) {
    return this.legal.some((move) => move.from === from && move.to === to);
  }

  attemptMove(from, to) {
    const targets = this.legal.filter((move) => move.from === from && move.to === to);
    if (!targets.length) {
      this.selected = null;
      this.render(this.state);
      return;
    }
    if (targets.some((move) => move.promotion)) {
      this.onPromotionNeeded(from, to);
      return;
    }
    this.selected = null;
    this.onMove(from, to, null);
  }
}
