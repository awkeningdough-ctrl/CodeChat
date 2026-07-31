// --- Connection to the relay server --------------------------------------
const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${proto}//${location.host}`);
let myCode = null;

// per-peer crypto state
const peers = {}; // peerCode -> { keyPair, sharedKey }

// App state
let chatMode = 'peer'; // 'peer' or 'global'
let peerCode = '';
let typingTimeout = null;
let isTyping = false;
let unreadPeer = 0;
let unreadGlobal = 0;

const el = (id) => document.getElementById(id);

// ── Built-in Stickers (SVG emoji-like, not GIFs) ──
const STICKERS = [
  { id: 'fire',    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="#ff6b35" stroke-width="2"><path d="M12 2c0 4-4 6-4 10 0 3 2 6 4 8 2-2 4-5 4-8 0-4-4-6-4-10z"/><path d="M12 14c-1 0-2 1-2 2s1 2 2 2 2-1 2-2-1-2-2-2z"/></svg>' },
  { id: 'heart',   svg: '<svg viewBox="0 0 24 24" fill="#ff4d6d" stroke="#ff4d6d" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>' },
  { id: 'rocket',  svg: '<svg viewBox="0 0 24 24" fill="none" stroke="#00f0ff" stroke-width="2"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>' },
  { id: 'star',    svg: '<svg viewBox="0 0 24 24" fill="#ffb800" stroke="#ffb800" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' },
  { id: 'skull',   svg: '<svg viewBox="0 0 24 24" fill="none" stroke="#e8eaf0" stroke-width="2"><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><path d="M8 20v2h8v-2"/><path d="M12 20V10"/><path d="M12 10a5 5 0 0 1 5-5 5 5 0 0 1 5 5v2a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-2z"/></svg>' },
  { id: 'ghost',   svg: '<svg viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="2"><path d="M9 10h.01"/><path d="M15 10h.01"/><path d="M12 2a8 8 0 0 0-8 8v12l3-3 3 3 3-3 3 3 3-3 3 3V10a8 8 0 0 0-8-8z"/></svg>' },
  { id: 'alien',   svg: '<svg viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2"><path d="M12 2a7 7 0 0 0-7 7c0 2.38 1.19 4.47 3 5.74V17a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2.26c1.81-1.27 3-3.36 3-5.74a7 7 0 0 0-7-7z"/><path d="M9 10h.01"/><path d="M15 10h.01"/></svg>' },
  { id: 'cool',    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="#00f0ff" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>' },
  { id: 'party',   svg: '<svg viewBox="0 0 24 24" fill="none" stroke="#f472b6" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>' },
  { id: 'zap',     svg: '<svg viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>' },
  { id: 'bug',     svg: '<svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><rect x="8" y="6" width="8" height="10" rx="4"/><path d="M15 9l3-3"/><path d="M9 9L6 6"/><path d="M15 13l3 3"/><path d="M9 13l-3 3"/></svg>' },
  { id: 'coffee',  svg: '<svg viewBox="0 0 24 24" fill="none" stroke="#d4a574" stroke-width="2"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>' },
  { id: 'moon',    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="#c4b5fd" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>' },
  { id: 'sun',     svg: '<svg viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>' },
  { id: 'lock',    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' },
  { id: 'key',     svg: '<svg viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>' },
];

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
    el('myIdField')?.select();
  }
});

// ── Chat Mode Tabs ──
function setChatMode(mode) {
  chatMode = mode;
  el('tabPeer').classList.toggle('active', mode === 'peer');
  el('tabGlobal').classList.toggle('active', mode === 'global');

  // Update placeholder
  const input = el('msgInput');
  if (mode === 'peer') {
    input.placeholder = 'Type a secure message…';
  } else {
    input.placeholder = 'Type a global message…';
  }

  // Clear unread badge
  if (mode === 'peer') {
    unreadPeer = 0;
    el('peerBadge').style.display = 'none';
  } else {
    unreadGlobal = 0;
    el('globalBadge').style.display = 'none';
  }

  // Re-render messages for current mode
  renderMessages();
  updateEmptyState();
}

el('tabPeer').addEventListener('click', () => setChatMode('peer'));
el('tabGlobal').addEventListener('click', () => setChatMode('global'));

// ── Active Users ──
let activeUsers = [];

function renderActiveUsers() {
  const container = el('activeUsers');
  if (!activeUsers.length) {
    container.innerHTML = '<div class="empty-users">No users online</div>';
    return;
  }
  container.innerHTML = activeUsers.map(code => {
    const isMe = code === myCode;
    return `<div class="user-item ${isMe ? 'me' : ''}" data-code="${code}">
      <span class="code">${code}</span>
      <span class="badge"></span>
    </div>`;
  }).join('');

  container.querySelectorAll('.user-item').forEach(item => {
    item.addEventListener('click', () => {
      const code = item.dataset.code;
      if (code === myCode) return;
      el('peerIdField').value = code;
      syncCells('peerIdField');
      setChatMode('peer');
    });
  });
}

// ── Sticker Picker ──
function initStickerPicker() {
  const picker = el('stickerPicker');
  picker.innerHTML = STICKERS.map(s =>
    `<div class="sticker-item" data-id="${s.id}">${s.svg}</div>`
  ).join('');

  picker.querySelectorAll('.sticker-item').forEach(item => {
    item.addEventListener('click', () => {
      sendSticker(item.dataset.id);
      picker.classList.remove('visible');
      el('stickerBtn').classList.remove('active');
    });
  });
}

el('stickerBtn').addEventListener('click', () => {
  const picker = el('stickerPicker');
  const btn = el('stickerBtn');
  const visible = picker.classList.contains('visible');
  picker.classList.toggle('visible', !visible);
  btn.classList.toggle('active', !visible);
});

// Close sticker picker on outside click
document.addEventListener('click', (e) => {
  if (!e.target.closest('.sticker-picker') && !e.target.closest('.sticker-btn')) {
    el('stickerPicker').classList.remove('visible');
    el('stickerBtn').classList.remove('active');
  }
});

// ── Message History ──
const messages = []; // { mode, cls, text, sticker, from, ts }

function renderMessages() {
  const container = el('messages');
  container.innerHTML = '';

  const filtered = messages.filter(m => m.mode === chatMode);
  if (filtered.length === 0) {
    updateEmptyState();
    return;
  }
  el('chatEmpty').classList.add('hidden');

  filtered.forEach(m => appendMessageToDOM(m));
  container.scrollTop = container.scrollHeight;
}

function appendMessageToDOM(m) {
  const container = el('messages');

  const msg = document.createElement('div');
  msg.className = `msg ${m.cls}`;

  const ts = m.ts;
  const isSystem = m.cls === 'system';
  const isSticker = !!m.sticker;

  let bubbleContent;
  if (isSticker) {
    const sticker = STICKERS.find(s => s.id === m.sticker);
    bubbleContent = sticker ? `<div style="width:64px;height:64px;display:flex;align-items:center;justify-content:center;">${sticker.svg}</div>` : '[sticker]';
  } else {
    bubbleContent = escapeHtml(m.text);
  }

  let senderHtml = '';
  if (chatMode === 'global' && !isSystem) {
    const senderLabel = m.cls === 'mine' || m.cls === 'global mine' ? 'You' : m.from;
    senderHtml = `<div class="msg-sender">${escapeHtml(senderLabel)}</div>`;
  }

  msg.innerHTML = `
    ${senderHtml}
    <div class="msg-bubble">${bubbleContent}</div>
    <div class="msg-meta">${ts}Z · ${m.cls === 'mine' ? 'encrypted out' : m.cls === 'theirs' ? 'encrypted in' : m.cls === 'global' ? 'global in' : m.cls === 'global mine' ? 'global out' : 'system'}</div>
  `;

  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
}

function addMessage(mode, cls, text, opts = {}) {
  // Handle global sticker text format
  if (mode === 'global' && text && text.startsWith('__STICKER__:')) {
    opts.sticker = text.replace('__STICKER__:', '');
    text = '';
  }
  const m = { mode, cls, text, ts: timestamp(), ...opts };
  messages.push(m);

  if (mode === chatMode) {
    el('chatEmpty').classList.add('hidden');
    appendMessageToDOM(m);
  } else {
    // Increment unread
    if (mode === 'peer') {
      unreadPeer++;
      const badge = el('peerBadge');
      badge.textContent = unreadPeer;
      badge.style.display = 'inline-block';
    } else {
      unreadGlobal++;
      const badge = el('globalBadge');
      badge.textContent = unreadGlobal;
      badge.style.display = 'inline-block';
    }
  }
}

function updateEmptyState() {
  const hasMessages = messages.some(m => m.mode === chatMode);
  if (hasMessages) {
    el('chatEmpty').classList.add('hidden');
  } else {
    el('chatEmpty').classList.remove('hidden');
    const title = el('chatEmpty').querySelector('.empty-title');
    const hint = el('chatEmpty').querySelector('.empty-hint');
    if (chatMode === 'peer') {
      title.textContent = 'Awaiting Secure Handshake';
      hint.textContent = 'Enter a peer code and initiate to begin E2E encryption.';
    } else {
      title.textContent = 'Global Chat';
      hint.textContent = 'Messages here are visible to everyone connected. No encryption.';
    }
  }
}

// ── Transcript Rendering (legacy compat) ──
function timestamp() {
  const d = new Date();
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function appendLine(cls, text) {
  addMessage('peer', cls, text);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ── Typing Indicator ──
function showTyping(from) {
  const indicator = el('typingIndicator');
  const text = el('typingText');
  text.textContent = `${from} is typing`;
  indicator.classList.add('visible');
}

function hideTyping() {
  el('typingIndicator').classList.remove('visible');
}

let typingHideTimeout = null;

function handleTyping(from) {
  showTyping(from);
  if (typingHideTimeout) clearTimeout(typingHideTimeout);
  typingHideTimeout = setTimeout(hideTyping, 3000);
}

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
    const display = el('myIdBox');
    display.querySelectorAll('.code-cell').forEach((c, i) => {
      c.textContent = myCode[i] || '-';
    });
    setShield('idle', 'READY');
    setCryptoProgress(15);
    initStickerPicker();
  }

  if (msg.type === 'user_list') {
    activeUsers = msg.users || [];
    renderActiveUsers();
  }

  if (msg.type === 'chat') {
    await handleIncomingChat(msg.from, msg.ciphertext);
  }

  if (msg.type === 'chat_error') {
    appendLine('system', `Couldn't reach ${msg.to} — check the code`);
  }

  if (msg.type === 'typing') {
    if (chatMode === 'peer') {
      handleTyping(msg.from);
    }
  }

  if (msg.type === 'global_chat') {
    addMessage('global', msg.from === myCode ? 'global mine' : 'global', msg.text, { from: msg.from });
  }

  if (msg.type === 'global_typing') {
    if (chatMode === 'global' && msg.from !== myCode) {
      handleTyping(msg.from);
    }
  }
});

// ── Key Exchange + E2E Chat ──
async function ensureKeyPair() {
  return crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
}

el('connectBtn').addEventListener('click', async () => {
  const targetCode = el('peerIdField').value.trim().toUpperCase();
  if (!targetCode || targetCode.length !== 6) {
    appendLine('system', 'Enter a valid 6-character peer code');
    return;
  }

  peerCode = targetCode;
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
    peerCode = from;

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

  if (payload.kind === 'sticker') {
    const peer = peers[from];
    if (!peer || !peer.sharedKey) return;

    const iv = new Uint8Array(payload.iv);
    const data = new Uint8Array(payload.data);
    try {
      const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, peer.sharedKey, data);
      const stickerId = new TextDecoder().decode(plainBuf);
      addMessage('peer', 'theirs', '', { sticker: stickerId });
    } catch {
      appendLine('system', 'Failed to decrypt sticker — possible tampering');
    }
  }
}

// ── Sending ──
el('sendBtn').addEventListener('click', sendMessage);
el('msgInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) sendMessage();
});

// Typing detection
el('msgInput').addEventListener('input', () => {
  if (chatMode === 'peer' && peerCode) {
    ws.send(JSON.stringify({ type: 'typing', to: peerCode }));
  } else if (chatMode === 'global') {
    ws.send(JSON.stringify({ type: 'global_typing' }));
  }
});

async function sendMessage() {
  const text = el('msgInput').value.trim();
  if (!text) return;

  if (chatMode === 'peer') {
    const targetCode = el('peerIdField').value.trim().toUpperCase();
    if (!targetCode) return;

    const peer = peers[targetCode];
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
      to: targetCode,
      ciphertext: JSON.stringify({ kind: 'msg', iv: Array.from(iv), data: Array.from(new Uint8Array(data)) })
    }));

    addMessage('peer', 'mine', text);
  } else {
    // Global chat (plaintext)
    ws.send(JSON.stringify({ type: 'global_chat', text }));
    addMessage('global', 'global mine', text, { from: myCode });
  }

  el('msgInput').value = '';
  el('msgInput').focus();
}

async function sendSticker(stickerId) {
  if (chatMode === 'peer') {
    const targetCode = el('peerIdField').value.trim().toUpperCase();
    if (!targetCode) {
      appendLine('system', 'Enter a peer code first');
      return;
    }
    const peer = peers[targetCode];
    if (!peer || !peer.sharedKey) {
      appendLine('system', 'No secure channel — initiate handshake first');
      return;
    }

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      peer.sharedKey,
      new TextEncoder().encode(stickerId)
    );

    ws.send(JSON.stringify({
      type: 'send_chat',
      to: targetCode,
      ciphertext: JSON.stringify({ kind: 'sticker', iv: Array.from(iv), data: Array.from(new Uint8Array(data)) })
    }));

    addMessage('peer', 'mine', '', { sticker: stickerId });
  } else {
    // Global sticker
    ws.send(JSON.stringify({ type: 'global_chat', text: `__STICKER__:${stickerId}` }));
    addMessage('global', 'global mine', `__STICKER__:${stickerId}`, { from: myCode });
  }
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
