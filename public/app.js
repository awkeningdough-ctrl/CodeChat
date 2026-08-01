// ── Config ──
const SOUND_ENABLED_KEY = 'codechat_sound';
let soundEnabled = localStorage.getItem(SOUND_ENABLED_KEY) !== 'false';

// ── Audio Context ──
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function ensureAudio() {
  if (!audioCtx) audioCtx = new AudioCtx();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playTone(freq, type = 'sine', duration = 0.1, vol = 0.05) {
  if (!soundEnabled || !audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  gain.gain.setValueAtTime(vol, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

function sfx(name) {
  ensureAudio();
  switch (name) {
    case 'connect': playTone(880, 'sine', 0.15, 0.04); setTimeout(() => playTone(1100, 'sine', 0.2, 0.04), 120); break;
    case 'message': playTone(1200, 'sine', 0.08, 0.03); break;
    case 'error': playTone(200, 'sawtooth', 0.3, 0.03); break;
    case 'typing': playTone(600, 'sine', 0.05, 0.02); break;
    case 'secure': playTone(523, 'sine', 0.1, 0.04); setTimeout(() => playTone(659, 'sine', 0.1, 0.04), 100); setTimeout(() => playTone(784, 'sine', 0.2, 0.04), 200); break;
    case 'click': playTone(1000, 'sine', 0.05, 0.02); break;
  }
}

// ── DOM Helpers ──
const el = (id) => document.getElementById(id);

// ── WebSocket ──
const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${proto}//${location.host}`);
let myCode = null;
let currentPeer = null;
let globalOpen = false;
let typingTimeout = null;
let globalTypingTimeout = null;

// per-peer crypto state
const peers = {};

// ── UI State ──
function setStatus(state) {
  const dot = el('statusDot');
  const txt = el('statusText');
  dot.classList.remove('live', 'down');
  if (state) dot.classList.add(state);
  if (state === 'live') txt.textContent = 'Connected';
  else if (state === 'down') txt.textContent = 'Disconnected';
  else txt.textContent = 'Connecting...';
}

function setShield(status, text) {
  const badge = el('shieldBadge');
  const txt = el('shieldText');
  txt.textContent = text;
  badge.classList.toggle('secure', status === 'secure');
}

function setCryptoProgress(pct) {
  el('cryptoBar').style.width = pct + '%';
}

function setPeerConnected(peerCode) {
  currentPeer = peerCode;
  el('peerAvatar').textContent = peerCode ? peerCode[0] : '?';
  el('peerAvatar').classList.toggle('connected', !!peerCode);
  el('peerName').textContent = peerCode ? `Channel ${peerCode}` : 'No Peer Connected';
  el('peerStatus').textContent = peerCode ? 'E2E Encrypted' : 'Waiting for handshake...';
  el('peerStatus').classList.toggle('secure', !!peerCode);
  el('connectionPanel').classList.toggle('connected', !!peerCode);
}

// ── Code Cells ──
function syncCells(inputId) {
  const input = el(inputId);
  const container = input.closest('.peer-entry')?.querySelector('.input-cells') || input.closest('.code-display');
  if (!container) return;
  const cells = container.querySelectorAll('.cell, .code-cell span');
  const val = input.value.toUpperCase();
  cells.forEach((c, i) => {
    const ch = val[i] || '';
    if (c.tagName === 'SPAN') {
      c.textContent = ch || '-';
      c.style.animation = ch ? 'popIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)' : 'none';
    } else {
      c.textContent = ch;
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
  ensureAudio();
  sfx('click');
  try {
    await navigator.clipboard.writeText(myCode);
    showToast('Code copied to clipboard', 'success');
    const btn = el('copyBtn');
    const original = btn.innerHTML;
    btn.innerHTML = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg><span>Copied!</span>`;
    btn.classList.add('copied');
    setTimeout(() => { btn.innerHTML = original; btn.classList.remove('copied'); }, 1500);
  } catch (e) {
    el('peerIdField')?.select();
  }
});

// ── Toast ──
function showToast(text, type = 'info') {
  const container = el('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = text;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// ── WebSocket ──
ws.addEventListener('open', () => {
  setStatus('live');
  sfx('connect');
});

ws.addEventListener('close', () => {
  setStatus('down');
  el('myIdBadge').textContent = 'disconnected';
  appendLine('system', 'Connection to relay lost');
  setShield('idle', 'OFFLINE');
  setCryptoProgress(0);
  setPeerConnected(null);
  sfx('error');
});

ws.addEventListener('message', async (ev) => {
  const msg = JSON.parse(ev.data);

  if (msg.type === 'ready') {
    myCode = msg.code;
    setStatus('live');
    el('myIdBadge').textContent = `channel ${myCode}`;
    const display = el('myIdBox');
    display.querySelectorAll('.code-cell span').forEach((c, i) => {
      c.textContent = myCode[i] || '-';
    });
    setShield('idle', 'READY');
    setCryptoProgress(15);
    sfx('connect');
  }

  if (msg.type === 'chat') {
    await handleIncomingChat(msg.from, msg.ciphertext);
  }

  if (msg.type === 'chat_error') {
    showToast(`Couldn't reach ${msg.to} — check the code`, 'error');
    appendLine('system', `Couldn't reach ${msg.to} — check the code`);
    sfx('error');
    const btn = el('connectBtn');
    btn.disabled = false;
    btn.querySelector('.btn-text').textContent = 'Initiate Handshake';
    btn.classList.remove('connecting');
  }

  if (msg.type === 'user_list') {
    updateUserList(msg.users || []);
  }

  if (msg.type === 'global_chat') {
    appendGlobalMessage(msg.from, msg.text);
    if (globalOpen) sfx('message');
    else {
      el('globalIndicator').style.background = 'var(--accent-yellow)';
      el('globalIndicator').style.boxShadow = '0 0 8px var(--accent-yellow)';
    }
  }

  if (msg.type === 'typing') {
    showTypingIndicator();
  }

  if (msg.type === 'global_typing') {
    showGlobalTyping();
  }
});

// ── Active Users ──
function updateUserList(users) {
  const list = el('activeUsers');
  const count = el('userCount');
  count.textContent = users.length;
  if (users.length === 0) {
    list.innerHTML = '<li class="empty-state">No one online</li>';
    return;
  }
  list.innerHTML = users.map(code =>
    `<li data-code="${code}" ${code === myCode ? 'style="opacity:0.5;pointer-events:none;"' : ''}>
      <span>${code}</span>
      ${code === myCode ? '<span style="font-size:0.65rem;color:var(--text-muted)">you</span>' : ''}
    </li>`
  ).join('');
  list.querySelectorAll('li[data-code]').forEach(li => {
    li.addEventListener('click', () => {
      const code = li.dataset.code;
      if (code === myCode) return;
      el('peerIdField').value = code;
      syncCells('peerIdField');
      showToast(`Selected ${code} — click Initiate to connect`, 'info');
      sfx('click');
    });
  });
}

// ── Transcript Rendering ──
function timestamp() {
  const d = new Date();
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function appendLine(cls, text, name = null) {
  const container = el('messages');
  const empty = el('chatEmpty');
  if (empty && !empty.classList.contains('hidden')) empty.classList.add('hidden');

  const msg = document.createElement('div');
  msg.className = `msg ${cls}`;
  const ts = timestamp();
  const isSystem = cls === 'system';
  const displayName = name || (cls === 'mine' ? myCode : cls === 'theirs' ? currentPeer : 'system');

  msg.innerHTML = `
    <div class="msg-header">
      <span class="msg-name">${escapeHtml(displayName || '???')}</span>
      <span class="msg-time">${ts}Z</span>
    </div>
    <div class="msg-body">${escapeHtml(text)}</div>
    ${!isSystem ? `<div class="msg-footer">
      <svg class="lock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
      <span>${cls === 'mine' ? 'encrypted out' : 'encrypted in'}</span>
    </div>` : ''}
  `;
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
}

function appendGlobalMessage(from, text) {
  const container = el('globalMessages');
  const msg = document.createElement('div');
  msg.className = 'msg global-msg';
  const ts = timestamp();
  msg.innerHTML = `
    <div class="msg-header">
      <span class="msg-name">${escapeHtml(from)}</span>
      <span class="msg-time">${ts}Z</span>
    </div>
    <div class="msg-body">${escapeHtml(text)}</div>
  `;
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ── Typing Indicators ──
function showTypingIndicator() {
  const indicator = el('typingIndicator');
  indicator.classList.add('visible');
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => indicator.classList.remove('visible'), 3000);
}

function showGlobalTyping() {
  const indicator = el('globalTypingIndicator');
  indicator.classList.add('visible');
  clearTimeout(globalTypingTimeout);
  globalTypingTimeout = setTimeout(() => indicator.classList.remove('visible'), 3000);
}

// ── Key Exchange + E2E Chat ──
async function ensureKeyPair() {
  return crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
}

el('connectBtn').addEventListener('click', async () => {
  const peerCode = el('peerIdField').value.trim().toUpperCase();
  if (!peerCode || peerCode.length !== 6) {
    showToast('Enter a valid 6-character peer code', 'error');
    return;
  }
  if (peerCode === myCode) {
    showToast('You cannot connect to yourself', 'error');
    return;
  }

  const btn = el('connectBtn');
  btn.disabled = true;
  btn.querySelector('.btn-text').textContent = 'Handshaking...';
  btn.classList.add('connecting');
  setShield('idle', 'EXCHANGING KEYS');
  setCryptoProgress(40);
  el('handshakeVisual').classList.add('active');
  sfx('click');

  try {
    const keyPair = await ensureKeyPair();
    const rawPub = await crypto.subtle.exportKey('raw', keyPair.publicKey);
    peers[peerCode] = { keyPair, sharedKey: null };
    ws.send(JSON.stringify({
      type: 'send_chat',
      to: peerCode,
      ciphertext: JSON.stringify({ kind: 'handshake', pub: Array.from(new Uint8Array(rawPub)) })
    }));
    appendLine('system', `Opening secure channel with ${peerCode}...`);
  } catch (e) {
    showToast('Key generation failed', 'error');
    btn.disabled = false;
    btn.querySelector('.btn-text').textContent = 'Initiate Handshake';
    btn.classList.remove('connecting');
    el('handshakeVisual').classList.remove('active');
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
    setPeerConnected(from);
    appendLine('system', `Secure channel established with ${from}`);
    sfx('secure');

    const btn = el('connectBtn');
    btn.disabled = false;
    btn.querySelector('.btn-text').textContent = 'Handshake Complete';
    setTimeout(() => {
      btn.querySelector('.btn-text').textContent = 'Initiate Handshake';
      btn.classList.remove('connecting');
      el('handshakeVisual').classList.remove('active');
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
      appendLine('theirs', new TextDecoder().decode(plainBuf), from);
      sfx('message');
    } catch {
      appendLine('system', 'Failed to decrypt — possible tampering');
      sfx('error');
    }
  }
}

// ── Sending ──
el('sendBtn').addEventListener('click', sendMessage);
el('msgInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
  if (currentPeer) {
    ws.send(JSON.stringify({ type: 'typing', to: currentPeer }));
  }
});

async function sendMessage() {
  const peerCode = el('peerIdField').value.trim().toUpperCase();
  const text = el('msgInput').value.trim();
  if (!peerCode || !text) return;

  const peer = peers[peerCode];
  if (!peer || !peer.sharedKey) {
    showToast('No secure channel — initiate handshake first', 'error');
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

  appendLine('mine', text, myCode);
  el('msgInput').value = '';
  el('msgInput').style.height = 'auto';
  el('msgInput').focus();
  sfx('click');
}

// ── Global Chat ──
el('globalToggle').addEventListener('click', () => {
  globalOpen = !globalOpen;
  el('globalPanel').classList.toggle('open', globalOpen);
  el('globalIndicator').style.background = '';
  el('globalIndicator').style.boxShadow = '';
  sfx('click');
});

el('closeGlobal').addEventListener('click', () => {
  globalOpen = false;
  el('globalPanel').classList.remove('open');
  sfx('click');
});

el('globalSendBtn').addEventListener('click', sendGlobalMessage);
el('globalInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    sendGlobalMessage();
  }
  ws.send(JSON.stringify({ type: 'global_typing' }));
});

function sendGlobalMessage() {
  const text = el('globalInput').value.trim();
  if (!text) return;
  ws.send(JSON.stringify({ type: 'global_chat', text }));
  appendGlobalMessage(myCode, text);
  el('globalInput').value = '';
  sfx('click');
}

// ── Disconnect ──
el('disconnectPeer').addEventListener('click', disconnectPeer);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') disconnectPeer();
});

function disconnectPeer() {
  if (!currentPeer) return;
  delete peers[currentPeer];
  setPeerConnected(null);
  setShield('idle', 'READY');
  setCryptoProgress(15);
  el('peerIdField').value = '';
  syncCells('peerIdField');
  appendLine('system', `Disconnected from peer`);
  sfx('click');
}

// ── Sound Toggle ──
function updateSoundUI() {
  const btn = el('soundToggle');
  const ind = el('soundIndicator');
  btn.classList.toggle('active', soundEnabled);
  ind.classList.toggle('on', soundEnabled);
}
updateSoundUI();

el('soundToggle').addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  localStorage.setItem(SOUND_ENABLED_KEY, soundEnabled);
  updateSoundUI();
  ensureAudio();
  sfx('click');
});

// ── Sidebar Mobile ──
el('sidebarOpen').addEventListener('click', () => {
  el('sidebar').classList.add('open');
  sfx('click');
});

el('sidebarClose').addEventListener('click', () => {
  el('sidebar').classList.remove('open');
  sfx('click');
});

// Close sidebar when clicking outside on mobile
document.addEventListener('click', (e) => {
  if (window.innerWidth > 900) return;
  const sidebar = el('sidebar');
  if (!sidebar.contains(e.target) && !el('sidebarOpen').contains(e.target)) {
    sidebar.classList.remove('open');
  }
});

// ── Auto-resize textarea ──
el('msgInput').addEventListener('input', function() {
  this.style.height = 'auto';
  this.style.height = Math.min(this.scrollHeight, 120) + 'px';
});

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

// ── Background Canvas Animation ──
(function initBg() {
  const canvas = el('bgCanvas');
  const ctx = canvas.getContext('2d');
  let particles = [];
  const PARTICLE_COUNT = 60;
  const CONNECTION_DIST = 120;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  class Particle {
    constructor() {
      this.x = Math.random() * canvas.width;
      this.y = Math.random() * canvas.height;
      this.vx = (Math.random() - 0.5) * 0.4;
      this.vy = (Math.random() - 0.5) * 0.4;
      this.radius = Math.random() * 1.5 + 0.5;
    }
    update() {
      this.x += this.vx;
      this.y += this.vy;
      if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
      if (this.y < 0 || this.y > canvas.height) this.vy *= -1;
    }
    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 240, 255, 0.35)';
      ctx.fill();
    }
  }

  for (let i = 0; i < PARTICLE_COUNT; i++) particles.push(new Particle());

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => { p.update(); p.draw(); });
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < CONNECTION_DIST) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(0, 240, 255, ${0.12 * (1 - dist / CONNECTION_DIST)})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(animate);
  }
  animate();
})();
