// --- Connection to the relay server --------------------------------------
const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${proto}//${location.host}`);
let myCode = null;

// per-peer crypto state
const peers = {}; // peerCode -> { keyPair, sharedKey }

const el = (id) => document.getElementById(id);

// ── UI Helpers ──
function setStatus(state) {
  const dot = el('statusDot');
  dot.classList.remove('live', 'down');
  if (state) dot.classList.add(state);
}

function setShield(status, text) {
  const badge = el('shieldBadge');
  const txt = el('shieldText');
  txt.textContent = text;
  if (status === 'secure') badge.classList.add('secure');
  else badge.classList.remove('secure');
}

function setCryptoProgress(pct) {
  el('cryptoBar').style.width = pct + '%';
}

// ── Code Cell Sync ──
function syncCells(inputId) {
  const input = el(inputId);
  const container = input.closest('.input-cells') || input.closest('.code-display');
  const cells = container.querySelectorAll('.cell, .code-cell');
  const val = input.value.toUpperCase();

  cells.forEach((c, i) => {
    const ch = val[i] || '';
    c.textContent = ch;
    if (c.classList.contains('cell')) {
      c.classList.toggle('filled', !!ch);
      c.classList.toggle('cursor', i === val.length && document.activeElement === input);
    }
  });
}

// Peer input listeners
el('peerIdField').addEventListener('input', () => syncCells('peerIdField'));
el('peerIdField').addEventListener('focus', () => {
  el('peerIdBox').classList.add('focused');
  el('peerEntry').classList.add('active');
  syncCells('peerIdField');
});
el('peerIdField').addEventListener('blur', () => {
  el('peerIdBox').classList.remove('focused');
  el('peerEntry').classList.remove('active');
  syncCells('peerIdField');
});

// ── Copy to Clipboard ──
el('copyBtn').addEventListener('click', async () => {
  if (!myCode) return;
  try {
    await navigator.clipboard.writeText(myCode);
    const btn = el('copyBtn');
    const original = btn.textContent;
    btn.textContent = 'COPIED';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = original;
      btn.classList.remove('copied');
    }, 1500);
  } catch (e) {
    // Fallback: select text
    el('myIdField')?.select();
  }
});

// ── WebSocket ──
ws.addEventListener('open', () => {
  setStatus('live');
});

ws.addEventListener('close', () => {
  setStatus('down');
  el('myIdBadge').textContent = 'disconnected';
  appendLine('system', 'Connection to relay lost');
  setShield('idle', 'OFFLINE');
  setCryptoProgress(0);
});

ws.addEventListener('message', async (ev) => {
  const msg = JSON.parse(ev.data);

  if (msg.type === 'ready') {
    myCode = msg.code;
    setStatus('live');
    el('myIdBadge').textContent = `channel ${myCode}`;
    // Fill the display cells
    const display = el('myIdBox');
    display.querySelectorAll('.code-cell').forEach((c, i) => {
      c.textContent = myCode[i] || '-';
    });
    setShield('idle', 'READY');
    setCryptoProgress(15);
  }

  if (msg.type === 'chat') {
    await handleIncomingChat(msg.from, msg.ciphertext);
  }

  if (msg.type === 'chat_error') {
    appendLine('system', `Couldn't reach ${msg.to} — check the code`);
  }
});

// ── Transcript Rendering ──
function timestamp() {
  const d = new Date();
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function appendLine(cls, text) {
  const container = el('messages');
  const empty = el('chatEmpty');
  if (empty && !empty.classList.contains('hidden')) {
    empty.classList.add('hidden');
  }

  const msg = document.createElement('div');
  msg.className = `msg ${cls}`;

  const ts = timestamp();
  const isSystem = cls === 'system';

  msg.innerHTML = `
    <div class="msg-bubble">
      ${isSystem ? `<span style="opacity:0.6;margin-right:6px;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align:middle;">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
      </span>` : ''}
      ${escapeHtml(text)}
    </div>
    <div class="msg-meta">${ts}Z · ${cls === 'mine' ? 'encrypted out' : cls === 'theirs' ? 'encrypted in' : 'system'}</div>
  `;

  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ── Key Exchange + E2E Chat ──
async function ensureKeyPair() {
  return crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
}

el('connectBtn').addEventListener('click', async () => {
  const peerCode = el('peerIdField').value.trim().toUpperCase();
  if (!peerCode || peerCode.length !== 6) {
    appendLine('system', 'Enter a valid 6-character peer code');
    return;
  }

  const btn = el('connectBtn');
  btn.disabled = true;
  btn.textContent = 'HANDSHAKING…';
  btn.classList.add('connecting');
  setShield('idle', 'EXCHANGING KEYS');
  setCryptoProgress(40);

  try {
    const keyPair = await ensureKeyPair();
    const rawPub = await crypto.subtle.exportKey('raw', keyPair.publicKey);
    peers[peerCode] = { keyPair, sharedKey: null };

    ws.send(JSON.stringify({
      type: 'send_chat',
      to: peerCode,
      ciphertext: JSON.stringify({ kind: 'handshake', pub: Array.from(new Uint8Array(rawPub)) })
    }));

    appendLine('system', `Opening secure channel with ${peerCode}…`);
  } catch (e) {
    appendLine('system', 'Key generation failed');
    btn.disabled = false;
    btn.textContent = 'INITIATE HANDSHAKE';
    btn.classList.remove('connecting');
  }
});

async function handleIncomingChat(from, ciphertextRaw) {
  let payload;
  try { payload = JSON.parse(ciphertextRaw); } catch { return; }

  if (payload.kind === 'handshake') {
    setCryptoProgress(60);
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

    if (!el('peerIdField').value) {
      el('peerIdField').value = from;
      syncCells('peerIdField');
    }

    setCryptoProgress(100);
    setShield('secure', 'E2E SECURE');
    appendLine('system', `Secure channel established with ${from}`);

    const btn = el('connectBtn');
    btn.disabled = false;
    btn.textContent = 'HANDSHAKE COMPLETE';
    setTimeout(() => {
      btn.textContent = 'INITIATE HANDSHAKE';
      btn.classList.remove('connecting');
    }, 2000);
    return;
  }

  if (payload.kind === 'msg') {
    const peer = peers[from];
    if (!peer || !peer.sharedKey) return;

    const iv = new Uint8Array(payload.iv);
    const data = new Uint8Array(payload.data);
    try {
      const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, peer.sharedKey, data);
      appendLine('theirs', new TextDecoder().decode(plainBuf));
    } catch {
      appendLine('system', 'Failed to decrypt message — possible tampering');
    }
  }
}

// ── Sending ──
el('sendBtn').addEventListener('click', sendMessage);
el('msgInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) sendMessage();
});

async function sendMessage() {
  const peerCode = el('peerIdField').value.trim().toUpperCase();
  const text = el('msgInput').value.trim();
  if (!peerCode || !text) return;

  const peer = peers[peerCode];
  if (!peer || !peer.sharedKey) {
    appendLine('system', 'No secure channel — initiate handshake first');
    return;
  }

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    peer.sharedKey,
    new TextEncoder().encode(text)
  );

  ws.send(JSON.stringify({
    type: 'send_chat',
    to: peerCode,
    ciphertext: JSON.stringify({ kind: 'msg', iv: Array.from(iv), data: Array.from(new Uint8Array(data)) })
  }));

  appendLine('mine', text);
  el('msgInput').value = '';
  el('msgInput').focus();
}

// ── Clock ──
function tickClock() {
  const d = new Date();
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  el('clock').textContent = `${hh}:${mm}:${ss}Z`;
}
tickClock();
setInterval(tickClock, 1000);
