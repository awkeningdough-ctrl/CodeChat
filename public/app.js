// --- Connection to the relay server --------------------------------------
const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${proto}//${location.host}`);
let myCode = null;

// per-peer crypto state
const peers = {}; // peerCode -> { keyPair, sharedKey }

// App state
let chatMode = 'peer';
let peerCode = '';
let typingTimeout = null;
let isRecording = false;
let unreadPeer = 0;
let unreadGlobal = 0;

// Message store
const messages = [];
const messageMap = new Map(); // id -> message data

// Voice recording state
let mediaRecorder = null;
let audioChunks = [];
let recordingTimer = null;
let recordingSeconds = 0;
let audioContext = null;
let analyser = null;
let microphoneStream = null;
let animationId = null;

// Active audio players
const activePlayers = new Map(); // url -> { audio, btn, bar, timeEl }

const el = (id) => document.getElementById(id);

// ── Constants ──
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

const REACTION_EMOJIS = ['👍','❤️','😂','😮','😢','🔥','👏','🎉'];

// ── Helpers ──
function generateId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

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

function timestamp() {
  const d = new Date();
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getMetaLabel(m) {
  if (m.cls === 'mine') return 'encrypted out';
  if (m.cls === 'theirs') return 'encrypted in';
  if (m.cls === 'global') return 'global in';
  if (m.cls === 'global mine') return 'global out';
  if (m.cls === 'system') return 'system';
  return '';
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
    btn.textContent = 'COPIED';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'COPY'; btn.classList.remove('copied'); }, 1500);
  } catch (e) {
    // silent fail
  }
});

// ── Chat Mode Tabs ──
function setChatMode(mode) {
  chatMode = mode;
  el('tabPeer').classList.toggle('active', mode === 'peer');
  el('tabGlobal').classList.toggle('active', mode === 'global');
  el('msgInput').placeholder = mode === 'peer' ? 'Type a secure message…' : 'Type a global message…';
  if (mode === 'peer') { unreadPeer = 0; el('peerBadge').style.display = 'none'; }
  else { unreadGlobal = 0; el('globalBadge').style.display = 'none'; }
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

document.addEventListener('click', (e) => {
  if (!e.target.closest('.sticker-picker') && !e.target.closest('.sticker-btn')) {
    el('stickerPicker').classList.remove('visible');
    el('stickerBtn').classList.remove('active');
  }
});

// ── Message Store & Rendering ──
function addMessage(mode, cls, text, opts = {}) {
  if (mode === 'global' && text && text.startsWith('__STICKER__:')) {
    opts.sticker = text.replace('__STICKER__:', '');
    text = '';
  }
  const id = opts.id || generateId();
  const m = { id, mode, cls, text, ts: timestamp(), reactions: [], ...opts };
  messages.push(m);
  messageMap.set(id, m);

  if (mode === chatMode) {
    el('chatEmpty').classList.add('hidden');
    appendMessageToDOM(m);
  } else {
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

function renderMessages() {
  activePlayers.forEach(p => { try { p.audio.pause(); } catch {} });
  activePlayers.clear();
  const container = el('messages');
  container.innerHTML = '';
  const filtered = messages.filter(m => m.mode === chatMode);
  if (filtered.length === 0) { updateEmptyState(); return; }
  el('chatEmpty').classList.add('hidden');
  filtered.forEach(m => appendMessageToDOM(m));
  container.scrollTop = container.scrollHeight;
}

function appendMessageToDOM(m) {
  const container = el('messages');
  const msg = document.createElement('div');
  msg.className = `msg ${m.cls}`;
  msg.dataset.id = m.id;

  const isSystem = m.cls === 'system';
  const isSticker = !!m.sticker;
  const isImage = !!m.imageUrl;
  const isVoice = !!m.voiceUrl;

  let bubbleContent = '';
  if (isSticker) {
    const sticker = STICKERS.find(s => s.id === m.sticker);
    bubbleContent = sticker ? `<div class="msg-sticker">${sticker.svg}</div>` : '[sticker]';
  } else if (isImage) {
    bubbleContent = `<img class="msg-image" src="${m.imageUrl}" alt="${escapeHtml(m.name || 'image')}" loading="lazy">`;
  } else if (isVoice) {
    bubbleContent = `
      <div class="msg-voice">
        <button class="voice-play" data-url="${m.voiceUrl}" data-dur="${m.duration || 0}">
          <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </button>
        <div class="voice-track"><div class="voice-progress"></div></div>
        <span class="voice-time">${formatTime(m.duration || 0)}</span>
      </div>
    `;
  } else {
    bubbleContent = escapeHtml(m.text);
  }

  let senderHtml = '';
  if (chatMode === 'global' && !isSystem) {
    const senderLabel = (m.cls === 'mine' || m.cls === 'global mine') ? 'You' : m.from;
    senderHtml = `<div class="msg-sender">${escapeHtml(senderLabel)}</div>`;
  }

  msg.innerHTML = `
    ${senderHtml}
    <div class="msg-bubble">${bubbleContent}</div>
    <div class="msg-meta">${m.ts}Z · ${getMetaLabel(m)}</div>
  `;

  if (m.reactions && m.reactions.length > 0) {
    const bar = document.createElement('div');
    bar.className = 'msg-reaction-bar';
    bar.innerHTML = m.reactions.map(r => `<span class="reaction-chip">${r}</span>`).join('');
    msg.appendChild(bar);
  }

  if (!isSystem && chatMode === 'peer') {
    const trigger = document.createElement('button');
    trigger.className = 'msg-reaction-trigger';
    trigger.innerHTML = '+';
    trigger.title = 'Add reaction';
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      showInlineReactions(msg, m.id);
    });
    msg.appendChild(trigger);
  }

  if (isImage) {
    const img = msg.querySelector('.msg-image');
    img.addEventListener('click', () => window.open(m.imageUrl, '_blank'));
  }

  if (isVoice) {
    const playBtn = msg.querySelector('.voice-play');
    const bar = msg.querySelector('.voice-progress');
    const timeEl = msg.querySelector('.voice-time');
    playBtn.addEventListener('click', () => toggleVoice(m.voiceUrl, playBtn, bar, timeEl));
  }

  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
}

function updateMessageReactions(m) {
  const msgEl = document.querySelector(`.msg[data-id="${m.id}"]`);
  if (!msgEl) return;
  let bar = msgEl.querySelector('.msg-reaction-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'msg-reaction-bar';
    msgEl.appendChild(bar);
  }
  if (!m.reactions || m.reactions.length === 0) {
    bar.remove();
    return;
  }
  bar.innerHTML = m.reactions.map(r => `<span class="reaction-chip">${r}</span>`).join('');
}

function showInlineReactions(msgEl, msgId) {
  const existing = msgEl.querySelector('.inline-reactions');
  if (existing) { existing.remove(); return; }
  const row = document.createElement('div');
  row.className = 'inline-reactions';
  row.innerHTML = REACTION_EMOJIS.map(e => `<span class="inline-emoji" data-emoji="${e}">${e}</span>`).join('');
  row.querySelectorAll('.inline-emoji').forEach(span => {
    span.addEventListener('click', () => {
      sendReaction(msgId, span.dataset.emoji);
      row.remove();
    });
  });
  msgEl.appendChild(row);
  setTimeout(() => { if (row.parentNode) row.remove(); }, 5000);
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

function appendLine(cls, text) {
  addMessage('peer', cls, text);
}

// ── Typing Indicator ──
let typingHideTimeout = null;

function showTyping(from) {
  const indicator = el('typingIndicator');
  el('typingText').textContent = `${from} is typing`;
  indicator.classList.add('visible');
}

function hideTyping() {
  el('typingIndicator').classList.remove('visible');
}

function handleTyping(from) {
  showTyping(from);
  if (typingHideTimeout) clearTimeout(typingHideTimeout);
  typingHideTimeout = setTimeout(hideTyping, 3000);
}

// ── Voice Player ──
function toggleVoice(url, btn, bar, timeEl) {
  if (activePlayers.has(url)) {
    const player = activePlayers.get(url);
    if (player.audio.paused) {
      player.audio.play();
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
    } else {
      player.audio.pause();
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
    }
  } else {
    const audio = new Audio(url);
    const player = { audio, btn, bar, timeEl };
    activePlayers.set(url, player);

    audio.addEventListener('timeupdate', () => {
      if (!isNaN(audio.duration)) {
        const pct = (audio.currentTime / audio.duration) * 100;
        bar.style.width = pct + '%';
        timeEl.textContent = formatTime(audio.currentTime) + ' / ' + formatTime(audio.duration);
      }
    });
    audio.addEventListener('ended', () => {
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
      bar.style.width = '0%';
      if (!isNaN(audio.duration)) timeEl.textContent = formatTime(audio.duration);
      activePlayers.delete(url);
    });
    audio.addEventListener('error', () => {
      timeEl.textContent = 'Error';
      activePlayers.delete(url);
    });
    audio.play().catch(() => {
      timeEl.textContent = 'Error';
      activePlayers.delete(url);
    });
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
  }
}

// ── WebSocket ──
ws.addEventListener('open', () => setStatus('live'));

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
    el('myIdBox').querySelectorAll('.code-cell').forEach((c, i) => { c.textContent = myCode[i] || '-'; });
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
    if (chatMode === 'peer') handleTyping(msg.from);
  }

  if (msg.type === 'global_chat') {
    addMessage('global', msg.from === myCode ? 'global mine' : 'global', msg.text, { from: msg.from });
  }

  if (msg.type === 'global_typing') {
    if (chatMode === 'global' && msg.from !== myCode) handleTyping(msg.from);
  }
});

// ── Key Exchange ──
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
    setTimeout(() => { btn.textContent = 'INITIATE HANDSHAKE'; btn.classList.remove('connecting'); }, 2000);
    return;
  }

  const peer = peers[from];
  if (!peer || !peer.sharedKey) return;

  const iv = new Uint8Array(payload.iv);
  const data = new Uint8Array(payload.data);
  let plainBuf;
  try {
    plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, peer.sharedKey, data);
  } catch {
    appendLine('system', 'Failed to decrypt message — possible tampering');
    return;
  }

  const plainText = new TextDecoder().decode(plainBuf);
  let inner;
  try { inner = JSON.parse(plainText); } catch {
    // Fallback for legacy raw text messages
    if (payload.kind === 'msg') {
      addMessage('peer', 'theirs', plainText, { id: generateId() });
    }
    return;
  }

  if (payload.kind === 'msg') {
    addMessage('peer', 'theirs', inner.text, { id: inner.id });
  } else if (payload.kind === 'sticker') {
    addMessage('peer', 'theirs', '', { sticker: inner.stickerId, id: inner.id });
  } else if (payload.kind === 'image') {
    const bytes = new Uint8Array(inner.data);
    const blob = new Blob([bytes], { type: inner.type });
    const url = URL.createObjectURL(blob);
    addMessage('peer', 'theirs', '', { imageUrl: url, name: inner.name, id: inner.id });
  } else if (payload.kind === 'voice') {
    const bytes = new Uint8Array(inner.data);
    const blob = new Blob([bytes], { type: 'audio/webm' });
    const url = URL.createObjectURL(blob);
    addMessage('peer', 'theirs', '', { voiceUrl: url, duration: inner.duration, id: inner.id });
  } else if (payload.kind === 'reaction') {
    const targetMsg = messageMap.get(inner.targetId);
    if (targetMsg) {
      if (!targetMsg.reactions) targetMsg.reactions = [];
      if (!targetMsg.reactions.includes(inner.emoji)) {
        targetMsg.reactions.push(inner.emoji);
        if (targetMsg.mode === chatMode) updateMessageReactions(targetMsg);
      }
    }
  }
}

// ── Sending ──
el('sendBtn').addEventListener('click', sendMessage);
el('msgInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) sendMessage();
});

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

    const id = generateId();
    const inner = JSON.stringify({ kind: 'msg', id, text });
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      peer.sharedKey,
      new TextEncoder().encode(inner)
    );

    ws.send(JSON.stringify({
      type: 'send_chat',
      to: targetCode,
      ciphertext: JSON.stringify({ kind: 'msg', iv: Array.from(iv), data: Array.from(new Uint8Array(data)) })
    }));

    addMessage('peer', 'mine', text, { id });
  } else {
    ws.send(JSON.stringify({ type: 'global_chat', text }));
    addMessage('global', 'global mine', text, { from: myCode });
  }

  el('msgInput').value = '';
  el('msgInput').focus();
}

async function sendSticker(stickerId) {
  if (chatMode === 'peer') {
    const targetCode = el('peerIdField').value.trim().toUpperCase();
    if (!targetCode) { appendLine('system', 'Enter a peer code first'); return; }
    const peer = peers[targetCode];
    if (!peer || !peer.sharedKey) { appendLine('system', 'No secure channel'); return; }

    const id = generateId();
    const inner = JSON.stringify({ kind: 'sticker', id, stickerId });
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      peer.sharedKey,
      new TextEncoder().encode(inner)
    );

    ws.send(JSON.stringify({
      type: 'send_chat',
      to: targetCode,
      ciphertext: JSON.stringify({ kind: 'sticker', iv: Array.from(iv), data: Array.from(new Uint8Array(data)) })
    }));

    addMessage('peer', 'mine', '', { sticker: stickerId, id });
  } else {
    ws.send(JSON.stringify({ type: 'global_chat', text: `__STICKER__:${stickerId}` }));
    addMessage('global', 'global mine', `__STICKER__:${stickerId}`, { from: myCode });
  }
}

// ── Image Sharing ──
el('imageBtn').addEventListener('click', () => {
  if (chatMode !== 'peer') {
    appendLine('system', 'Images can only be sent in peer mode (E2E encrypted)');
    return;
  }
  el('imageInput').click();
});

el('imageInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  await sendImage(file);
  e.target.value = '';
});

async function sendImage(file) {
  const targetCode = el('peerIdField').value.trim().toUpperCase();
  if (!targetCode) { appendLine('system', 'Enter a peer code first'); return; }
  const peer = peers[targetCode];
  if (!peer || !peer.sharedKey) { appendLine('system', 'No secure channel'); return; }
  if (file.size > 2 * 1024 * 1024) { appendLine('system', 'Image too large (max 2MB)'); return; }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const id = generateId();
  const inner = JSON.stringify({
    kind: 'image', id, name: file.name, type: file.type,
    data: Array.from(bytes)
  });

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    peer.sharedKey,
    new TextEncoder().encode(inner)
  );

  ws.send(JSON.stringify({
    type: 'send_chat',
    to: targetCode,
    ciphertext: JSON.stringify({
      kind: 'image',
      iv: Array.from(iv),
      data: Array.from(new Uint8Array(encrypted))
    })
  }));

  const blob = new Blob([bytes], { type: file.type });
  const url = URL.createObjectURL(blob);
  addMessage('peer', 'mine', '', { imageUrl: url, name: file.name, id });
}

// ── Voice Notes ──
el('voiceBtn').addEventListener('click', () => {
  if (chatMode !== 'peer') {
    appendLine('system', 'Voice notes can only be sent in peer mode (E2E encrypted)');
    return;
  }
  if (isRecording) { stopRecording(); }
  else { startRecording(); }
});

el('recCancel').addEventListener('click', cancelRecording);
el('recStop').addEventListener('click', stopRecording);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && isRecording) cancelRecording();
});

async function startRecording() {
  const targetCode = el('peerIdField').value.trim().toUpperCase();
  if (!targetCode) { appendLine('system', 'Enter a peer code first'); return; }
  const peer = peers[targetCode];
  if (!peer || !peer.sharedKey) { appendLine('system', 'No secure channel'); return; }

  try {
    microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    appendLine('system', 'Microphone access denied');
    return;
  }

  audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(microphoneStream);
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 64;
  source.connect(analyser);

  mediaRecorder = new MediaRecorder(microphoneStream, { mimeType: 'audio/webm;codecs=opus' });
  audioChunks = [];
  recordingSeconds = 0;
  isRecording = true;

  mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };
  mediaRecorder.onstop = async () => {
    const blob = new Blob(audioChunks, { type: 'audio/webm' });
    await sendVoiceNote(blob, recordingSeconds);
    cleanupRecording();
  };

  mediaRecorder.start(100);
  el('recordingOverlay').classList.add('visible');
  el('voiceBtn').classList.add('recording');
  recordingTimer = setInterval(() => {
    recordingSeconds++;
    el('recTimer').textContent = formatTime(recordingSeconds);
  }, 1000);
  startVisualizer();
}

function stopRecording() {
  if (!isRecording) return;
  isRecording = false;
  clearInterval(recordingTimer);
  stopVisualizer();
  el('recordingOverlay').classList.remove('visible');
  el('voiceBtn').classList.remove('recording');
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  if (microphoneStream) microphoneStream.getTracks().forEach(t => t.stop());
  if (audioContext) audioContext.close();
}

function cancelRecording() {
  if (!isRecording) return;
  isRecording = false;
  clearInterval(recordingTimer);
  stopVisualizer();
  el('recordingOverlay').classList.remove('visible');
  el('voiceBtn').classList.remove('recording');
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.onstop = () => cleanupRecording();
    mediaRecorder.stop();
  }
  if (microphoneStream) microphoneStream.getTracks().forEach(t => t.stop());
  if (audioContext) audioContext.close();
  audioChunks = [];
}

function cleanupRecording() {
  mediaRecorder = null;
  microphoneStream = null;
  audioContext = null;
  analyser = null;
  audioChunks = [];
  isRecording = false;
}

async function sendVoiceNote(blob, duration) {
  const targetCode = el('peerIdField').value.trim().toUpperCase();
  const peer = peers[targetCode];
  if (!peer || !peer.sharedKey) return;

  const bytes = new Uint8Array(await blob.arrayBuffer());
  const id = generateId();
  const inner = JSON.stringify({ kind: 'voice', id, duration, data: Array.from(bytes) });

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    peer.sharedKey,
    new TextEncoder().encode(inner)
  );

  ws.send(JSON.stringify({
    type: 'send_chat',
    to: targetCode,
    ciphertext: JSON.stringify({
      kind: 'voice',
      iv: Array.from(iv),
      data: Array.from(new Uint8Array(encrypted))
    })
  }));

  const url = URL.createObjectURL(blob);
  addMessage('peer', 'mine', '', { voiceUrl: url, duration, id });
}

// ── Visualizer ──
function startVisualizer() {
  const bars = document.querySelectorAll('.rec-bar');
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  function draw() {
    animationId = requestAnimationFrame(draw);
    analyser.getByteFrequencyData(dataArray);
    bars.forEach((bar, i) => {
      const idx = Math.floor(i * (bufferLength / bars.length));
      const value = dataArray[idx] || 0;
      const height = Math.max(4, (value / 255) * 32);
      bar.style.height = height + 'px';
    });
  }
  draw();
}

function stopVisualizer() {
  if (animationId) cancelAnimationFrame(animationId);
  animationId = null;
  document.querySelectorAll('.rec-bar').forEach(bar => { bar.style.height = '4px'; });
}

// ── Reactions ──
async function sendReaction(targetId, emoji) {
  const targetCode = el('peerIdField').value.trim().toUpperCase();
  if (!targetCode) return;
  const peer = peers[targetCode];
  if (!peer || !peer.sharedKey) return;

  const inner = JSON.stringify({ kind: 'reaction', targetId, emoji });
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    peer.sharedKey,
    new TextEncoder().encode(inner)
  );

  ws.send(JSON.stringify({
    type: 'send_chat',
    to: targetCode,
    ciphertext: JSON.stringify({
      kind: 'reaction',
      iv: Array.from(iv),
      data: Array.from(new Uint8Array(encrypted))
    })
  }));

  const myMsg = messageMap.get(targetId);
  if (myMsg) {
    if (!myMsg.reactions) myMsg.reactions = [];
    if (!myMsg.reactions.includes(emoji)) {
      myMsg.reactions.push(emoji);
      updateMessageReactions(myMsg);
    }
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
