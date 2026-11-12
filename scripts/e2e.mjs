/**
 * End-to-end check: boots the real server on a spare port and plays with two
 * Socket.IO clients (create, join, state, move, disconnect, rejoin, validation).
 *
 * Run with:  npm run test:e2e
 * Requires socket.io-client (a devDependency).
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { io } from 'socket.io-client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3999;
const URL = `http://localhost:${PORT}`;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const once = (socket, event, timeout = 5000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeout);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

const server = spawn(process.execPath, ['server.js'], {
  cwd: path.join(__dirname, '..'),
  env: { ...process.env, PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', (chunk) => process.stdout.write(`[server] ${chunk}`));
server.stderr.on('data', (chunk) => process.stderr.write(`[server] ${chunk}`));

let failures = 0;
function check(label, fn) {
  try {
    fn();
    console.log(`  ok  ${label}`);
  } catch (error) {
    failures += 1;
    console.error(`  FAIL ${label}: ${error.message}`);
  }
}

async function main() {
  // Wait for the HTTP server to answer.
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${URL}/healthz`);
      if (response.ok) break;
    } catch {
      /* not up yet */
    }
    await wait(250);
  }

  const health = await (await fetch(`${URL}/healthz`)).json();
  check('health endpoint answers', () => assert.equal(health.ok, true));

  for (const asset of ['/', '/css/styles.css', '/js/app.js', '/socket.io/socket.io.esm.min.js']) {
    const response = await fetch(`${URL}${asset}`);
    check(`serves ${asset}`, () => assert.equal(response.status, 200));
  }
  const html = await (await fetch(`${URL}/`)).text();
  check('index.html contains the lobby', () => assert.match(html, /btn-create/));

  const alice = io(URL, { transports: ['websocket'] });
  await once(alice, 'connect');
  const sessionAPromise = once(alice, 'session');
  const stateAPromise = once(alice, 'room:state');
  alice.emit('room:create', { nickname: 'Alice' });
  const sessionA = await sessionAPromise;
  const stateA = await stateAPromise;

  check('room code is 5 safe characters', () => {
    assert.equal(sessionA.code.length, 5);
    assert.match(sessionA.code, /^[A-HJ-NP-Z2-9]{5}$/);
  });
  check('creator waits with white', () => {
    assert.equal(stateA.status, 'waiting');
    assert.equal(stateA.you.colour, 'w');
    assert.equal(stateA.players.length, 1);
  });

  const bob = io(URL, { transports: ['websocket'] });
  await once(bob, 'connect');
  const sessionBPromise = once(bob, 'session');
  const stateBPromise = once(bob, 'room:state');
  const startedAPromise = once(alice, 'room:state');
  bob.emit('room:join', { code: sessionA.code.toLowerCase(), nickname: 'Bob' });
  const sessionB = await sessionBPromise;
  const stateB = await stateBPromise;
  const startedA = await startedAPromise;

  check('joining starts the game immediately', () => {
    assert.equal(startedA.status, 'playing');
    assert.equal(sessionB.code, sessionA.code);
    assert.equal(stateB.you.colour, 'b');
  });

  check('the white player received legal moves', () => {
    assert.ok(Array.isArray(startedA.legalMoves));
    assert.equal(startedA.legalMoves.length > 0, true);
  });

  check('the black player receives no legal moves on white’s turn', () => {
    assert.equal(stateB.legalMoves.length, 0);
  });

  check('player names are kept', () => {
    assert.equal(startedA.players.find((p) => p.isYou).name, 'Alice');
    assert.equal(startedA.players.find((p) => !p.isYou).name, 'Bob');
  });

  // A move from black out of turn must be refused.
  const errorPromise = once(bob, 'room:error');
  bob.emit('game:move', { from: 'e7', to: 'e5' });
  const error = await errorPromise;
  check('out-of-turn move is refused by the server', () => {
    assert.equal(error.error, 'err.not_your_turn');
  });

  // Rate limiting: flood and expect at least one rejection.
  let limited = 0;
  bob.on('room:error', (payload) => {
    if (payload.error === 'err.rate_limited') limited += 1;
  });
  for (let i = 0; i < 40; i += 1) bob.emit('game:move', { from: 'a7', to: 'a6' });
  await wait(400);
  check('flooding is rate limited', () => assert.equal(limited > 0, true));

  // Reconnect flow.
  const tokenB = sessionB.token;
  const code = sessionA.code;
  const pausedPromise = once(alice, 'room:state');
  bob.disconnect();
  const pausedState = await pausedPromise;
  check('opponent sees the pause', () => {
    assert.equal(pausedState.status, 'playing');
    assert.equal(
      pausedState.players.some((player) => !player.connected),
      true,
    );
  });

  const bob2 = io(URL, { transports: ['websocket'] });
  await once(bob2, 'connect');
  const resumedPromise = once(bob2, 'room:state');
  bob2.emit('room:rejoin', { code, token: tokenB });
  const resumed = await resumedPromise;
  check('rejoin with the session token restores the same player', () => {
    assert.equal(resumed.you.name, 'Bob');
    assert.equal(resumed.you.colour, 'b');
    assert.equal(resumed.players.every((player) => player.connected), true);
  });

  const invalid = io(URL, { transports: ['websocket'] });
  await once(invalid, 'connect');
  invalid.emit('room:rejoin', { code, token: 'not-a-real-token' });
  const badToken = await once(invalid, 'room:error');
  check('a forged token is rejected', () => assert.equal(badToken.error, 'err.invalid_token'));

  alice.close();
  bob2.close();
  invalid.close();
  server.kill();

  console.log(failures === 0 ? '\nEnd-to-end checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  server.kill();
  process.exit(1);
});
