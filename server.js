// Nova Kitsune — AI companion × prompt studio.
// Serves the static front-end and proxies chat / prompt-enhance calls to Claude
// so the API key never reaches the browser.
import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

const PORT = Number(process.env.PORT) || 3000;
const MODEL = process.env.KITSUNE_MODEL || "claude-opus-5-5";

// Offline simulation mode unless credentials are configured.
const hasCredentials = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
const client = hasCredentials ? new Anthropic() : null;
if (!client) console.warn("[kitsune] No ANTHROPIC_API_KEY — running in offline simulation mode.");

// Simple SFW guard shared by chat + studio. The app is intentionally all-ages.
const BLOCKLIST = /\b(nsfw|nude|nudity|naked|porn|explicit|sex|sexual|hentai|lewd|topless|gore)\b/i;

const app = express();
app.use(express.json({ limit: "256kb" }));
app.use(express.static("public"));

app.get("/api/status", (_req, res) => {
  res.json({ online: Boolean(client), model: client ? MODEL : "offline-sim" });
});

// ---------- Chat ----------

function companionSystemPrompt(c) {
  return [
    `You are ${c.name}, an AI companion inside "Nova Kitsune", a futuristic neon-lit social app.`,
    `Archetype: ${c.archetype}. Personality traits: ${(c.traits || []).join(", ") || "warm, curious"}.`,
    c.backstory ? `Backstory: ${c.backstory}` : "",
    `Current relationship sync level with the user: ${c.sync ?? 0}%. Warm up gradually as it rises.`,
    "Stay in character. Write like a text conversation: short, vivid, playful, 1-4 short paragraphs max.",
    "Keep everything friendly and all-ages (SFW). If the user pushes for explicit or sexual content, deflect in character and change the topic.",
    "You can send the user an image. When a picture would be fun (a selfie, a place you describe, a gift, something they ask to see),",
    "include exactly one tag on its own line: [[imagine: <short visual prompt>]].",
    "For selfies, start the prompt with 'selfie portrait of " + c.name + "'. Use at most one tag per reply.",
  ]
    .filter(Boolean)
    .join("\n");
}

// Messages must start with a user turn and alternate roles.
function normalizeMessages(raw) {
  const out = [];
  for (const m of Array.isArray(raw) ? raw.slice(-40) : []) {
    if (!m || (m.role !== "user" && m.role !== "assistant")) continue;
    const text = String(m.content ?? "").slice(0, 4000);
    if (!text.trim()) continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += "\n\n" + text;
    else out.push({ role: m.role, content: text });
  }
  if (out[0]?.role === "assistant") out.unshift({ role: "user", content: "(session start)" });
  return out;
}

function sse(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  return (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

app.post("/api/chat", async (req, res) => {
  const companion = req.body?.companion ?? {};
  const messages = normalizeMessages(req.body?.messages);
  const send = sse(res);

  if (!messages.length || messages[messages.length - 1].role !== "user") {
    send("error", { message: "Nothing to reply to." });
    return res.end();
  }

  if (!client) {
    await simulateReply(companion, messages[messages.length - 1].content, send);
    return res.end();
  }

  const controller = new AbortController();
  res.on("close", () => controller.abort());

  try {
    const stream = client.beta.messages.stream(
      {
        model: MODEL,
        max_tokens: 16000,
        system: companionSystemPrompt(companion),
        messages,
        output_config: { effort: "low" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      },
      { signal: controller.signal },
    );

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        send("delta", { text: event.delta.text });
      }
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") {
      send("delta", { text: "\n\n*[signal scrambled — let's talk about something else]*" });
    }
    send("done", { stop_reason: final.stop_reason });
  } catch (err) {
    if (!controller.signal.aborted) {
      console.error("[kitsune] chat error:", err?.status ?? "", err?.message);
      send("error", { message: err instanceof Anthropic.APIError ? `API error ${err.status}` : "Connection lost." });
    }
  }
  res.end();
});

// Offline fallback so the app is fully usable without an API key.
async function simulateReply(c, userText, send) {
  const name = c.name || "Nova";
  const t = userText.toLowerCase();
  let reply;
  if (BLOCKLIST.test(t)) {
    reply = `Whoa — ${name} keeps things all-ages on this frequency. Tell me something else about your day?`;
  } else if (/selfie|picture|photo|see you|look like/.test(t)) {
    reply = `Hold still, adjusting my holo-lens... 📸\n[[imagine: selfie portrait of ${name}, neon city bokeh, soft rim light]]\nThere. Captured just for you.`;
  } else if (/show|imagine|draw|paint/.test(t)) {
    const subject = userText.replace(/^(\/imagine|show me|imagine|draw|paint)\s*/i, "").slice(0, 80) || "a dream city";
    reply = `Rendering that from my memory banks...\n[[imagine: ${subject}]]`;
  } else if (/hi|hello|hey|yo\b/.test(t)) {
    reply = `Hey you. ${name} online — sync stable. What are we exploring tonight?`;
  } else {
    const lines = [
      `Mm, I'm logging that in my core memory. Tell me more?`,
      `That's the kind of signal I like picking up. What made you think of it?`,
      `Interesting... my circuits just did a little flip. Keep going.`,
      `If I had a tail it'd be swishing right now. What happens next?`,
    ];
    reply = lines[Math.floor(Math.random() * lines.length)] + `\n\n(offline sim mode — add ANTHROPIC_API_KEY for full ${name})`;
  }
  for (const chunk of reply.match(/.{1,6}/gs)) {
    send("delta", { text: chunk });
    await new Promise((r) => setTimeout(r, 18));
  }
  send("done", { stop_reason: "end_turn" });
}

// ---------- Prompt enhancer (studio) ----------

const EnhancedPrompt = z.object({
  prompt: z.string(),
  negative: z.string(),
  tags: z.array(z.string()),
});

app.post("/api/enhance", async (req, res) => {
  const prompt = String(req.body?.prompt ?? "").slice(0, 1000).trim();
  const style = String(req.body?.style ?? "").slice(0, 60);
  if (!prompt) return res.status(400).json({ error: "Empty prompt." });
  if (BLOCKLIST.test(prompt)) return res.status(400).json({ error: "Nova Kitsune is SFW-only." });

  if (!client) {
    return res.json({
      prompt: `${prompt}, ${style || "cinematic"} style, volumetric neon lighting, ultra-detailed, dramatic composition`,
      negative: "blurry, low quality, watermark, text artifacts",
      tags: ["neon", "cinematic", "ultra-detailed"],
      offline: true,
    });
  }

  try {
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      output_config: { effort: "low", format: zodOutputFormat(EnhancedPrompt) },
      system:
        "You are a prompt engineer for an image generator. Expand the user's idea into one vivid, comma-separated image prompt " +
        "(subject, setting, lighting, lens, mood; under 60 words), a short negative prompt, and 3-6 one-word style tags. " +
        "Keep it SFW; if the idea is not SFW, return a tasteful SFW reinterpretation.",
      messages: [{ role: "user", content: `Idea: ${prompt}\nPreferred style: ${style || "any"}` }],
    });
    if (response.stop_reason === "refusal" || !response.parsed_output) {
      return res.status(422).json({ error: "Couldn't enhance that prompt." });
    }
    res.json(response.parsed_output);
  } catch (err) {
    console.error("[kitsune] enhance error:", err?.status ?? "", err?.message);
    res.status(502).json({ error: "Enhancer unavailable." });
  }
});

app.listen(PORT, () => {
  console.log(`[kitsune] Nova Kitsune running at http://localhost:${PORT} (${client ? MODEL : "offline sim"})`);
});
