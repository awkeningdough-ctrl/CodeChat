// --- Connection to the relay server -----------------------------------
const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${proto}//${location.host}`);
let myCode = null;

// per-peer crypto state
const peers = {}; // peerCode -> { keyPair, sharedKey }

const el = (id) => document.getElementById(id);

// Keeps the visual per-character cells in sync with an input's actual value,
// whether the value changed from typing or was set programmatically.
function syncCells(inputId) {
  const input = el(inputId);
  const cells = document.querySelectorAll(`.cells[data-target="${inputId}"] .cell`);
  const val = input.value.toUpperCase();
  cells.forEach((c, i) => { c.textContent = val[i] || ''; });
}
el('peerIdField').addEventListener('input', () => syncCells('peerIdField'));
el('peerIdField').addEventListener('focus', () => el('peerIdBox').classList.add('focused'));
el('peerIdField').addEventListener('blur', () => el('peerIdBox').classList.remove('focused'));

function setStatus(state) {
  const dot = el('statusDot');
  dot.classList.remove('live', 'down');
  if (state) dot.classList.add(state);
}

ws.addEventListener('open', () => {});
ws.addEventListener('close', () => {
  setStatus('down');
  el('myIdBadge').textContent = 'disconnected';
  appendLine('system', '--', 'connection to relay lost');
});

ws.addEventListener('message', async (ev) => {
  const msg = JSON.parse(ev.data);

  if (msg.type === 'ready') {
    myCode = msg.code;
    setStatus('live');
    el('myIdBadge').textContent = `channel ${myCode} open`;
    el('myIdField').value = myCode;
    syncCells('myIdField');
  }

  if (msg.type === 'chat') {
    await handleIncomingChat(msg.from, msg.ciphertext);
  }

  if (msg.type === 'chat_error') {
    appendLine('system', '--', `couldn't reach ${msg.to} — check the code`);
  }
});

// --- Transcript rendering ------------------------------------------------
function timestamp() {
  const d = new Date();
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}${mm}Z`;
}

function appendLine(cls, marker, text) {
  const row = document.createElement('div');
  row.className = `line ${cls}`;
  row.innerHTML = `<span class="ts">${timestamp()}</span><span class="marker">${marker}</span><span class="body"></span>`;
  row.querySelector('.body').textContent = text;
  el('messages').appendChild(row);
  el('messages').scrollTop = el('messages').scrollHeight;
}

// --- Key exchange + E2E chat (ECDH P-256 + AES-GCM, all in-browser) -----
async function ensureKeyPair() {
  return crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
}

el('connectBtn').addEventListener('click', async () => {
  const peerCode = el('peerIdField').value.trim().toUpperCase();
  if (!peerCode) return;
  const keyPair = await ensureKeyPair();
  const rawPub = await crypto.subtle.exportKey('raw', keyPair.publicKey);
  peers[peerCode] = { keyPair, sharedKey: null };
  ws.send(JSON.stringify({
    type: 'send_chat',
    to: peerCode,
    ciphertext: JSON.stringify({ kind: 'handshake', pub: Array.from(new Uint8Array(rawPub)) })
  }));
  appendLine('system', '--', `opening secure channel with ${peerCode}…`);
});

async function handleIncomingChat(from, ciphertextRaw) {
  let payload;
  try { payload = JSON.parse(ciphertextRaw); } catch { return; }

  if (payload.kind === 'handshake') {
    const theirRaw = new Uint8Array(payload.pub).buffer;
    const theirKey = await crypto.subtle.importKey('raw', theirRaw, { name: 'ECDH', namedCurve: 'P-256' }, true, []);

    let peer = peers[from];
    if (!peer) {
      const keyPair = await ensureKeyPair();
      peer = peers[from] = { keyPair, sharedKey: null };
      const rawPub = await crypto.subtle.exportKey('raw', peer.keyPair.publicKey);
      ws.send(JSON.stringify({
        type: 'send_chat',
        to: from,
        ciphertext: JSON.stringify({ kind: 'handshake', pub: Array.from(new Uint8Array(rawPub)) })
      }));
    }

    peer.sharedKey = await crypto.subtle.deriveKey(
      { name: 'ECDH', public: theirKey },
      peer.keyPair.privateKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    if (!el('peerIdField').value) { el('peerIdField').value = from; syncCells('peerIdField'); }
    appendLine('system', '--', `secure channel established with ${from}`);
    return;
  }

  if (payload.kind === 'msg') {
    const peer = peers[from];
    if (!peer || !peer.sharedKey) return;
    const iv = new Uint8Array(payload.iv);
    const data = new Uint8Array(payload.data);
    try {
      const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, peer.sharedKey, data);
      appendLine('theirs', '<<', new TextDecoder().decode(plainBuf));
    } catch {
      appendLine('system', '--', 'failed to decrypt message');
    }
  }
}

el('sendBtn').addEventListener('click', sendMessage);
el('msgInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });

async function sendMessage() {
  const peerCode = el('peerIdField').value.trim().toUpperCase();
  const text = el('msgInput').value;
  if (!peerCode || !text) return;
  const peer = peers[peerCode];
  if (!peer || !peer.sharedKey) {
    appendLine('system', '--', 'no secure channel yet — click Connect first and wait for it to establish');
    return;
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, peer.sharedKey, new TextEncoder().encode(text));
  ws.send(JSON.stringify({
    type: 'send_chat',
    to: peerCode,
    ciphertext: JSON.stringify({ kind: 'msg', iv: Array.from(iv), data: Array.from(new Uint8Array(data)) })
  }));
  appendLine('mine', '>>', text);
  el('msgInput').value = '';
}

// --- Station clock ---------------------------------------------------------
function tickClock() {
  const d = new Date();
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  el('clock').textContent = `${hh}:${mm}:${ss}Z`;
}
tickClock();
setInterval(tickClock, 1000);
