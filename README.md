# ◢◣ NOVA//KITSUNE

A futuristic hybrid of an **AI companion app** and a **prompt-to-image studio**:
forge a character, build up "sync" with them in chat, and they send you holo-snaps
mid-conversation. Or take the controls yourself in the Prompt Studio.

All content is kept SFW (all-ages), enforced both client- and server-side.

## Features

| | |
|---|---|
| **Discover** | Companion cards with generated avatars, archetypes, traits and a sync meter. |
| **Forge** | Create companions: name, archetype, up to 4 traits, visual style, aura hue, humanoid or kitsune form, backstory. Live avatar preview. |
| **Chat** | Streaming in-character replies from Claude. Companions can drop `[[imagine: …]]` tags that render as inline images (📸 selfie / 🎨 imagine shortcuts). Sync level rises as you talk. |
| **Studio** | Prompt + negative prompt, quick tag chips (subject / lighting / mood / camera / color), 8 style presets, aspect ratio, batch 1/2/4, detail slider, seed + lock, ✨ AI prompt enhancer, 🎲 surprise me. |
| **Gallery** | Save renders from the Studio or chat; lightbox with metadata, remix, PNG download, delete. |

Images come from **Holo-Diffusion**, a local, deterministic procedural renderer
(`public/engine.js`): the same prompt + style + seed always produces the same image,
so the gallery stores parameters rather than pixels. It reads subject keywords
(fox, portrait, city, planet, landscape, creature) and color words from the prompt.
Swap `renderArt` for a real image-model API if you have one.

## Run

```bash
npm install
ANTHROPIC_API_KEY=sk-ant-... npm start   # full AI companions + enhancer
# or just: npm start                      # offline simulation mode, no key needed
```

Open http://localhost:3000.

| Env var | Default | |
|---|---|---|
| `ANTHROPIC_API_KEY` | – | Enables Claude. Without it, chat and the enhancer use offline fallbacks. |
| `KITSUNE_MODEL` | `claude-opus-5-5` | Model for chat + prompt enhancer. |
| `PORT` | `3000` | |

## Architecture

```
server.js        Express: static files + /api/status, /api/chat (SSE stream), /api/enhance (structured output)
public/
  index.html     App shell (Discover / Chat / Studio / Gallery, Forge + Lightbox dialogs)
  styles.css     Neon glassmorphism theme, responsive (bottom nav on mobile)
  app.js         State (localStorage), views, chat streaming, studio controls
  engine.js      Holo-Diffusion procedural image renderer
```

- The API key stays on the server; the browser only talks to `/api/*`.
- Chat uses the Anthropic SDK's streaming API with low effort (snappy replies) and
  server-side refusal fallbacks enabled; replies stream to the browser over SSE.
- The prompt enhancer uses structured outputs (`zodOutputFormat`) to return
  `{ prompt, negative, tags }`.
- Companions, chat history and gallery are saved in the browser's localStorage.
