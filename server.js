/**
 * ChessUno server.
 *
 * - Express serves the static client (no build step).
 * - Socket.IO carries every game message in real time.
 * - Rooms live in memory: no database, no accounts, nothing personal stored.
 *
 * Security model: clients only ever send *intents* (a move, "end turn", a
 * placement). Every intent is re-validated in Room before any state changes,
 * and the full authoritative state is pushed back to both players.
 */
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';
import { Server } from 'socket.io';

import {
  CLEANUP_INTERVAL_MS,
  EMOTES,
  EMPTY_ROOM_TTL_MS,
  FINISHED_ROOM_TTL_MS,
  MAX_ROOMS,
  RECONNECT_GRACE_MS,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  SOCKET_RATE_LIMIT,
} from './src/game/constants.js';
import { Room } from './src/game/room.js';
import { randomNickname, sanitizeNickname } from './src/game/sanitize.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT) || 3000;

/* -------------------------------------------------------------------------- */
/*  HTTP                                                                      */
/* -------------------------------------------------------------------------- */

const app = express();
app.disable('x-powered-by');

app.get('/healthz', (req, res) => {
  res.json({ ok: true, rooms: rooms.size, uptime: Math.round(process.uptime()) });
});

app.use(
  express.static(publicDir, {
    extensions: ['html'],
    etag: true,
    setHeaders(res, filePath) {
      // The HTML shell and i18n bundle change together with the JS; keep it fresh.
      if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    },
  }),
);

// SPA-ish fallback: any unknown path returns the lobby, so invite links work.
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 1e4,
  pingInterval: 25_000,
  pingTimeout: 20_000,
});

/* -------------------------------------------------------------------------- */
/*  Room registry                                                             */
/* -------------------------------------------------------------------------- */

/** @type {Map<string, Room>} */
const rooms = new Map();
/** @type {Map<string, NodeJS.Timeout>} key: `${code}:${sessionId}` */
const abandonTimers = new Map();

function generateCode() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    let code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
      code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
    }
    if (!rooms.has(code)) return code;
  }
  return `${Date.now().toString(36).toUpperCase().slice(-ROOM_CODE_LENGTH)}`;
}

function normalizeCode(raw) {
  if (typeof raw !== 'string') return '';
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, ROOM_CODE_LENGTH);
}

function timerKey(code, sessionId) {
  return `${code}:${sessionId}`;
}

function clearAbandonTimer(code, sessionId) {
  const key = timerKey(code, sessionId);
  const timer = abandonTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    abandonTimers.delete(key);
  }
}

/** Push events, then a personalised snapshot to every connected player. */
function broadcast(room) {
  const events = room.takeEvents();
  if (events.length) io.to(room.code).emit('game:event', events);
  for (const player of room.players) {
    if (player.socketId && player.connected) {
      io.to(player.socketId).emit('room:state', room.snapshotFor(player.id));
    }
  }
}

function scheduleAbandon(room, sessionId) {
  clearAbandonTimer(room.code, sessionId);
  const timer = setTimeout(() => {
    abandonTimers.delete(timerKey(room.code, sessionId));
    const live = rooms.get(room.code);
    if (!live) return;
    const player = live.getPlayer(sessionId);
    if (!player || player.connected) return;
    live.abandon(sessionId);
    broadcast(live);
    if (live.players.every((p) => !p.connected) && live.players.length === 0) rooms.delete(live.code);
  }, RECONNECT_GRACE_MS);
  abandonTimers.set(timerKey(room.code, sessionId), timer);
}

/** Remove a socket from whatever room it was in, marking the player offline. */
function detachFromRoom(socket, room) {
  const sessionId = socket.data.sessionId;
  if (!room || !sessionId) return;
  const player = room.getPlayer(sessionId);
  if (player && player.socketId === socket.id) {
    room.markDisconnected(sessionId);
    broadcast(room);
    scheduleAbandon(room, sessionId);
  }
  socket.leave(room.code);
  socket.data.code = null;
  socket.data.sessionId = null;
}

/** Per-socket token bucket: cheap protection against event flooding. */
function allowEvent(socket) {
  const now = Date.now();
  if (!socket.data.bucket) socket.data.bucket = { start: now, count: 0 };
  const bucket = socket.data.bucket;
  if (now - bucket.start > SOCKET_RATE_LIMIT.windowMs) {
    bucket.start = now;
    bucket.count = 0;
  }
  bucket.count += 1;
  return bucket.count <= SOCKET_RATE_LIMIT.max;
}

/* -------------------------------------------------------------------------- */
/*  Socket API                                                                */
/* -------------------------------------------------------------------------- */

io.on('connection', (socket) => {
  socket.data.code = null;
  socket.data.sessionId = null;

  const fail = (error) => socket.emit('room:error', { error });

  /** Wrap every handler: rate limit, payload sanity, never crash the server. */
  const on = (event, handler) => {
    socket.on(event, (payload) => {
      if (!allowEvent(socket)) {
        fail('err.rate_limited');
        return;
      }
      try {
        handler(payload && typeof payload === 'object' ? payload : {});
      } catch (error) {
        console.error(`[socket] ${event} failed:`, error);
        fail('err.server');
      }
    });
  };

  /** Resolve the caller's room, or emit an error and return null. */
  const currentRoom = () => {
    const room = rooms.get(socket.data.code);
    if (!room) {
      fail('err.room_not_found');
      return null;
    }
    return room;
  };

  const afterAction = (room, result) => {
    if (!result.ok) {
      fail(result.error);
      return;
    }
    broadcast(room);
  };

  on('room:create', (payload) => {
    const existing = rooms.get(socket.data.code);
    if (existing) detachFromRoom(socket, existing);

    if (rooms.size >= MAX_ROOMS) {
      fail('err.server_busy');
      return;
    }

    const name = sanitizeNickname(payload.nickname) || randomNickname();
    const room = new Room(generateCode());
    rooms.set(room.code, room);

    const added = room.addPlayer(name, socket.id);
    if (!added.ok) {
      rooms.delete(room.code);
      fail(added.error);
      return;
    }

    socket.data.code = room.code;
    socket.data.sessionId = added.player.id;
    socket.join(room.code);
    socket.emit('session', {
      code: room.code,
      token: added.player.token,
      playerId: added.player.id,
      name: added.player.name,
    });
    broadcast(room);
  });

  on('room:join', (payload) => {
    const code = normalizeCode(payload.code);
    const room = rooms.get(code);
    if (!room) return fail('err.room_not_found');
    if (room.players.length >= 2) return fail('err.room_full');

    const existing = rooms.get(socket.data.code);
    if (existing && existing !== room) detachFromRoom(socket, existing);

    const name = sanitizeNickname(payload.nickname) || randomNickname();
    const added = room.addPlayer(name, socket.id);
    if (!added.ok) return fail(added.error);

    socket.data.code = room.code;
    socket.data.sessionId = added.player.id;
    socket.join(room.code);
    socket.emit('session', {
      code: room.code,
      token: added.player.token,
      playerId: added.player.id,
      name: added.player.name,
    });
    broadcast(room);
  });

  on('room:rejoin', (payload) => {
    const code = normalizeCode(payload.code);
    const room = rooms.get(code);
    if (!room) return fail('err.room_not_found');

    const player = room.getPlayerByToken(payload.token);
    if (!player) return fail('err.invalid_token');

    // A second tab replacing the first one: retire the stale socket politely.
    if (player.socketId && player.socketId !== socket.id) {
      const stale = io.sockets.sockets.get(player.socketId);
      if (stale) {
        stale.emit('session:replaced');
        stale.disconnect(true);
      }
    }

    clearAbandonTimer(room.code, player.id);
    const existing = rooms.get(socket.data.code);
    if (existing && existing !== room) detachFromRoom(socket, existing);

    socket.data.code = room.code;
    socket.data.sessionId = player.id;
    socket.join(room.code);
    room.markConnected(player.id, socket.id);

    socket.emit('session', {
      code: room.code,
      token: player.token,
      playerId: player.id,
      name: player.name,
    });
    broadcast(room);
  });

  on('room:leave', () => {
    const room = rooms.get(socket.data.code);
    if (!room) return;
    detachFromRoom(socket, room);
    socket.emit('room:left');
  });

  on('game:move', (payload) => {
    const room = currentRoom();
    if (!room) return;
    afterAction(
      room,
      room.move(socket.data.sessionId, { from: payload.from, to: payload.to, promotion: payload.promotion }),
    );
  });

  on('game:revive', (payload) => {
    const room = currentRoom();
    if (!room) return;
    afterAction(room, room.revive(socket.data.sessionId, { piece: payload.piece, square: payload.square }));
  });

  on('game:endTurn', () => {
    const room = currentRoom();
    if (!room) return;
    afterAction(room, room.endTurnByPlayer(socket.data.sessionId));
  });

  on('game:resign', () => {
    const room = currentRoom();
    if (!room) return;
    afterAction(room, room.resign(socket.data.sessionId));
  });

  on('game:offerDraw', () => {
    const room = currentRoom();
    if (!room) return;
    afterAction(room, room.offerDraw(socket.data.sessionId));
  });

  on('game:drawResponse', (payload) => {
    const room = currentRoom();
    if (!room) return;
    afterAction(room, room.respondDraw(socket.data.sessionId, payload.accept === true));
  });

  on('game:rematch', () => {
    const room = currentRoom();
    if (!room) return;
    afterAction(room, room.requestRematch(socket.data.sessionId));
  });

  on('chat:emote', (payload) => {
    const room = currentRoom();
    if (!room) return;
    if (!EMOTES.includes(payload.emote)) return;
    const player = room.getPlayer(socket.data.sessionId);
    if (!player) return;
    io.to(room.code).emit('chat:emote', { name: player.name, emote: payload.emote });
  });

  socket.on('disconnect', () => {
    const room = rooms.get(socket.data.code);
    if (!room) return;
    detachFromRoom(socket, room);
  });
});

/* -------------------------------------------------------------------------- */
/*  Housekeeping                                                              */
/* -------------------------------------------------------------------------- */

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const anyConnected = room.players.some((player) => player.connected);
    if (anyConnected) continue;

    const ttl = room.status === 'finished' ? FINISHED_ROOM_TTL_MS : EMPTY_ROOM_TTL_MS;
    const lastActive = Math.max(room.updatedAt, room.createdAt);
    const expired = now - lastActive > ttl;
    const empty = room.players.length === 0;

    if (empty || expired) {
      for (const player of room.players) clearAbandonTimer(code, player.id);
      rooms.delete(code);
    }
  }
}, CLEANUP_INTERVAL_MS).unref();

server.listen(PORT, () => {
  console.log(`ChessUno listening on http://localhost:${PORT}`);
});

// Keep the process alive on unexpected async errors instead of dropping rooms.
process.on('unhandledRejection', (error) => {
  console.error('[unhandledRejection]', error);
});
