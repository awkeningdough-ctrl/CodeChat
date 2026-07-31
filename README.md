# CodeChat — free, code-based E2E encrypted chat (no client download)

## What this is
A single Node server that:
- Serves the chat webpage (`public/`) to anyone who visits your URL — no download, no install, just a browser.
- Runs a WebSocket relay that assigns each visitor a random 6-character
  code (e.g. `VTT4VP`) and forwards encrypted messages between two codes.
- Never sees plaintext — all messages are encrypted in-browser with
  ECDH (P-256) + AES-GCM before they're ever sent. The server only ever
  relays ciphertext blobs.

There is **no remote-control / shell feature** in this version — pure chat only.

## Run locally first (optional, to test)
```
npm install
npm start
```
Then open http://localhost:3000 in two different browser tabs (or two
devices on the same network pointed at your machine's local IP) — each
gets a code, paste one into the other's "peer code" field, click Connect,
and chat.

## Deploy to Render (free tier)
1. Push this folder to a new GitHub repo.
2. Go to https://dashboard.render.com → New → Web Service → connect that repo.
3. Render should auto-detect Node. Set:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Instance Type: Free
4. Deploy. Render gives you a URL like `https://yourapp.onrender.com` —
   that's what you share with clients. They just open it in a browser.

Notes on the free tier:
- The service "sleeps" after ~15 minutes with no traffic and takes
  30-60 seconds to wake up on the next visit. Fine for occasional use
  with a handful of people; annoying if you want it always-instant.
- DDoS protection (network-level) is included automatically on Render's
  free tier — no setup needed.
- 5 people chatting at once is trivial load for the free tier's resources.

## How codes work
- Whoever connects gets a fresh random code — it's not a chosen username,
  it's a session identifier. It changes every time you reconnect/refresh.
- To chat: person A shares their code with person B (any way — text,
  Discord, whatever). Person B pastes it into "Peer code to chat with"
  and clicks Connect. This triggers a key exchange; once it says "secure
  channel established," messages are end-to-end encrypted.




my url is codechat-bmr9.onrender.com - this is my official chatting url.
