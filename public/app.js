// --- Connection to the relay server -----------------------------------
const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${proto}//${location.host}`);
let myCode = null;

// per-peer crypto state
const peers = {}; // peerCode -> { keyPair, sharedKey }

const el = (id) => document.getElementById(id);

ws.addEventListener('open', () => {});
ws.addEventListener('close', () => appendMessage('(disconnected from server)', 'system'));

ws.addEventListener('message', async (ev) => {
  const msg = JSON.parse(ev.data);

  if (msg.type === 'ready') {
    myCode = msg.code;
    el('myIdBadge').textContent = `(${myCode})`;
    el('myIdField').value = myCode;
  }

  if (msg.type === 'chat') {
    await handleIncomingChat(msg.from, msg.ciphertext);
  }

  if (msg.type === 'chat_error') {
    appendMessage(`(couldn't reach ${msg.to} — check the code)`, 'system');
  }
});

function appendMessage(text, cls) {
  const div = document.createElement('div');
  div.className = `msg ${cls}`;
  div.textContent = text;
  el('messages').appendChild(div);
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
  appendMessage(`(starting a secure connection with ${peerCode}…)`, 'system');
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
    if (!el('peerIdField').value) el('peerIdField').value = from;
    appendMessage(`(secure channel established with ${from})`, 'system');
    return;
  }

  if (payload.kind === 'msg') {
    const peer = peers[from];
    if (!peer || !peer.sharedKey) return;
    const iv = new Uint8Array(payload.iv);
    const data = new Uint8Array(payload.data);
    try {
      const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, peer.sharedKey, data);
      appendMessage(new TextDecoder().decode(plainBuf), 'theirs');
    } catch {
      appendMessage('(failed to decrypt message)', 'system');
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
    appendMessage('(no secure channel yet — click Connect first and wait for it to establish)', 'system');
    return;
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, peer.sharedKey, new TextEncoder().encode(text));
  ws.send(JSON.stringify({
    type: 'send_chat',
    to: peerCode,
    ciphertext: JSON.stringify({ kind: 'msg', iv: Array.from(iv), data: Array.from(new Uint8Array(data)) })
  }));
  appendMessage(text, 'mine');
  el('msgInput').value = '';
}
