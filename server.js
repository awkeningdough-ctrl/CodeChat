/**
 * CodeChat server — enhanced with global chat, typing indicators, active user list, and stickers.
 * 1. Serves the browser chat UI (public/index.html + app.js) as static files.
 * 2. Runs a WebSocket relay: assigns each connecting browser a short code,
 *    forwards encrypted chat messages between two browsers by code.
 * 3. Global chat: broadcasts plaintext messages to all connected clients.
 * 4. Typing indicators: forwards typing events between peers and globally.
 * 5. Active users: broadcasts the list of connected user codes on connect/disconnect.
 *
 * The server NEVER sees plaintext E2E messages -- only opaque ciphertext blobs.
 */

const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// code -> ws
const clients = new Map();

function genCode() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 6 }, () => alphabet[crypto.randomInt(alphabet.length)]).join('');
  } while (clients.has(code));
  return code;
}

function broadcastUserList() {
  const codes = Array.from(clients.keys());
  const payload = JSON.stringify({ type: 'user_list', users: codes });
  for (const [, ws] of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

function broadcastGlobal(msgObj, excludeCode) {
  const payload = JSON.stringify(msgObj);
  for (const [code, ws] of clients) {
    if (code !== excludeCode && ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

wss.on('connection', (ws) => {
  const code = genCode();
  clients.set(code, ws);
  ws.send(JSON.stringify({ type: 'ready', code }));
  broadcastUserList();

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    // E2E peer-to-peer chat (encrypted)
    if (msg.type === 'send_chat' && typeof msg.to === 'string') {
      const peer = clients.get(msg.to.toUpperCase());
      if (peer && peer.readyState === WebSocket.OPEN) {
        peer.send(JSON.stringify({ type: 'chat', from: code, ciphertext: msg.ciphertext }));
      } else {
        ws.send(JSON.stringify({ type: 'chat_error', reason: 'peer_not_found', to: msg.to }));
      }
    }

    // Typing indicator for peer-to-peer
    if (msg.type === 'typing' && typeof msg.to === 'string') {
      const peer = clients.get(msg.to.toUpperCase());
      if (peer && peer.readyState === WebSocket.OPEN) {
        peer.send(JSON.stringify({ type: 'typing', from: code }));
      }
    }

    // Global chat (plaintext, everyone sees it)
    if (msg.type === 'global_chat' && typeof msg.text === 'string') {
      broadcastGlobal({ type: 'global_chat', from: code, text: msg.text }, code);
    }

    // Global typing indicator
    if (msg.type === 'global_typing') {
      broadcastGlobal({ type: 'global_typing', from: code }, code);
    }
  });

  ws.on('close', () => {
    clients.delete(code);
    broadcastUserList();
  });
});

server.listen(PORT, () => {
  console.log(`CodeChat listening on port ${PORT}`);
});
