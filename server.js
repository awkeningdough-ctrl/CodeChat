/**
 * CodeChat server — a single Node process that:
 *   1. Serves the browser chat UI (public/index.html + app.js) as static files.
 *   2. Runs a WebSocket relay: assigns each connecting browser a short code,
 *      and forwards encrypted chat messages between two browsers by code.
 *
 * The server NEVER sees plaintext messages -- only opaque ciphertext blobs
 * (see public/app.js for the ECDH + AES-GCM handshake/encryption, all done
 * in-browser). There is no remote-shell / dev-console feature in this
 * version -- this is chat only.
 *
 * Deploy: this single service serves both the site and the websocket relay
 * on the same port, which is what a free Render web service expects.
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
  // 6-char code, unambiguous alphabet (no 0/O/1/I) so it's easy to read aloud/type
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 6 }, () => alphabet[crypto.randomInt(alphabet.length)]).join('');
  } while (clients.has(code));
  return code;
}

wss.on('connection', (ws) => {
  const code = genCode();
  clients.set(code, ws);
  ws.send(JSON.stringify({ type: 'ready', code }));

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === 'send_chat' && typeof msg.to === 'string') {
      const peer = clients.get(msg.to.toUpperCase());
      if (peer && peer.readyState === WebSocket.OPEN) {
        peer.send(JSON.stringify({ type: 'chat', from: code, ciphertext: msg.ciphertext }));
      } else {
        ws.send(JSON.stringify({ type: 'chat_error', reason: 'peer_not_found', to: msg.to }));
      }
    }
  });

  ws.on('close', () => {
    clients.delete(code);
  });
});

server.listen(PORT, () => {
  console.log(`CodeChat listening on port ${PORT}`);
});
