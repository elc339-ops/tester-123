import { renderArt, STYLES, RATIOS, hashString } from "./engine.js";

// ---------- Persistence ----------
const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem("nk:" + key);
      return v ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem("nk:" + key, JSON.stringify(value));
    } catch { /* storage full or blocked — app keeps working in memory */ }
  },
};

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 10);
const BLOCKLIST = /\b(nsfw|nude|nudity|naked|porn|explicit|sex|sexual|hentai|lewd|topless|gore)\b/i;

const ARCHETYPES = [
  "Fox-spirit netrunner", "Starship navigator", "Holo-artist", "Synthwave DJ",
  "Android botanist", "Rogue AI poet", "Cyber-samurai", "Dream cartographer",
];
const TRAITS = [
  "playful", "witty", "caring", "mysterious", "chaotic", "calm", "flirty-but-sweet",
  "nerdy", "brave", "sarcastic", "romantic", "curious", "stoic", "cheerful",
];

const DEFAULT_COMPANIONS = [
  { id: "nova", name: "Nova", archetype: "Fox-spirit netrunner", traits: ["playful", "witty", "curious"], style: "cyber-anime", hue: 0, form: "fox",
    backstory: "A nine-tailed data spirit who lives in the neon shrine servers under Neo-Kyoto and hacks moonlight into music.", sync: 12 },
  { id: "kai", name: "Kai", archetype: "Starship navigator", traits: ["calm", "brave", "caring"], style: "holo-chrome", hue: 0, form: "portrait",
    backstory: "Pilot of the long-haul freighter Aster Vane. Knows every quiet star route between here and Andromeda.", sync: 5 },
  { id: "lumen", name: "Lumen", archetype: "Holo-artist", traits: ["romantic", "curious", "cheerful"], style: "aurora", hue: 0, form: "portrait",
    backstory: "Paints with light in an orbital gallery. Collects the colors of every sunset they've never seen.", sync: 0 },
  { id: "echo", name: "Echo", archetype: "Synthwave DJ", traits: ["chaotic", "sarcastic", "cheerful"], style: "synthwave", hue: 0, form: "portrait",
    backstory: "Spins retro-futurist sets on pirate frequencies from a van parked on the edge of the grid.", sync: 0 },
];

const state = {
  companions: store.get("companions", DEFAULT_COMPANIONS),
  chats: store.get("chats", {}),
  gallery: store.get("gallery", []),
  activeId: store.get("active", "nova"),
  studio: { style: "neon-noir", ratio: "1:1", batch: 2 },
  busy: false,
};
const save = () => {
  store.set("companions", state.companions);
  store.set("chats", state.chats);
  store.set("gallery", state.gallery);
  store.set("active", state.activeId);
};

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 2200);
}

// ---------- Rendering helpers ----------
function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}
function avatarPrompt(c) {
  return c.form === "fox" ? `kitsune fox spirit ${c.name}` : `portrait of ${c.name}`;
}
function renderAvatar(canvas, c) {
  renderArt(canvas, { prompt: avatarPrompt(c), style: c.style, seed: c.seed ?? hashString(c.id), hue: c.hue, detail: 0.6 });
}
function sizeFor(ratio, long = 768) {
  const [a, b] = RATIOS[ratio] || [1, 1];
  return a >= b ? [long, Math.round((long * b) / a)] : [Math.round((long * a) / b), long];
}
function download(canvas, name) {
  canvas.toBlob((blob) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name.replace(/[^\w-]+/g, "_").slice(0, 40) + ".png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
}

// ---------- Navigation ----------
function go(view) {
  $$(".rail button").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  $$(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + view));
  if (view === "chat") renderChat();
  if (view === "gallery") renderGallery();
  if (view === "discover") renderCards();
}
$$(".rail button").forEach((b) => b.addEventListener("click", () => go(b.dataset.view)));
$$("[data-goto]").forEach((b) => b.addEventListener("click", () => go(b.dataset.goto)));

// ---------- Status ----------
fetch("/api/status")
  .then((r) => r.json())
  .then((s) => {
    $("#status").classList.toggle("online", s.online);
    $("#status-text").textContent = s.online ? `neural link: ${s.model}` : "offline sim mode";
  })
  .catch(() => ($("#status-text").textContent = "server unreachable"));

// ---------- Discover ----------
function renderCards() {
  const wrap = $("#companion-cards");
  wrap.innerHTML = "";
  state.companions.forEach((c) => {
    const card = document.createElement("div");
    card.className = "card glass";
    card.tabIndex = 0;
    const cv = makeCanvas(360, 360);
    renderAvatar(cv, c);
    card.append(cv);
    card.insertAdjacentHTML(
      "beforeend",
      `<div class="body"><h3></h3><div class="arch"></div><div class="traits"></div>
       <div class="sync"><i style="width:${c.sync || 0}%"></i></div></div>
       <button class="del" title="Delete companion" aria-label="Delete">✕</button>`,
    );
    $("h3", card).textContent = c.name;
    $(".arch", card).textContent = c.archetype;
    $(".traits", card).textContent = c.traits.join(" · ");
    const open = () => {
      state.activeId = c.id;
      save();
      go("chat");
    };
    card.addEventListener("click", open);
    card.addEventListener("keydown", (e) => e.key === "Enter" && open());
    $(".del", card).addEventListener("click", (e) => {
      e.stopPropagation();
      if (!confirm(`Take ${c.name} offline permanently?`)) return;
      state.companions = state.companions.filter((x) => x.id !== c.id);
      delete state.chats[c.id];
      if (state.activeId === c.id) state.activeId = state.companions[0]?.id;
      save();
      renderCards();
    });
    wrap.append(card);
  });
  const add = document.createElement("button");
  add.className = "card glass new";
  add.textContent = "＋ Forge new";
  add.addEventListener("click", openForge);
  wrap.append(add);
}

let heroTick = 0;
function animateHero() {
  const words = ["kitsune fox spirit", "neon city skyline", "cosmic planet", "portrait android", "aurora mountain valley"];
  const styles = Object.keys(STYLES);
  renderArt($("#hero-canvas"), { prompt: words[heroTick % words.length], style: styles[heroTick % styles.length], seed: heroTick, detail: 0.8 });
  heroTick++;
}
animateHero();
setInterval(animateHero, 4000);

// ---------- Forge ----------
const forge = { form: "portrait", traits: new Set() };
function populateForge() {
  $("#f-arch").innerHTML = ARCHETYPES.map((a) => `<option>${a}</option>`).join("");
  $("#f-style").innerHTML = Object.entries(STYLES).map(([k, s]) => `<option value="${k}">${s.label}</option>`).join("");
  $("#f-traits").innerHTML = "";
  TRAITS.forEach((t) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = t;
    b.addEventListener("click", () => {
      if (forge.traits.has(t)) forge.traits.delete(t);
      else if (forge.traits.size < 4) forge.traits.add(t);
      b.classList.toggle("on", forge.traits.has(t));
    });
    $("#f-traits").append(b);
  });
}
function forgeDraft() {
  return {
    id: "tmp",
    name: $("#f-name").value.trim() || "Unnamed",
    archetype: $("#f-arch").value,
    style: $("#f-style").value,
    hue: Number($("#f-hue").value),
    form: forge.form,
  };
}
function updateForgePreview() {
  const d = forgeDraft();
  renderArt($("#forge-preview"), { prompt: avatarPrompt(d), style: d.style, seed: hashString(d.name), hue: d.hue, detail: 0.6 });
}
function openForge() {
  forge.traits.clear();
  forge.form = "portrait";
  $("#forge-form").reset();
  populateForge();
  $$("#f-form button").forEach((b) => b.classList.toggle("on", b.dataset.v === "portrait"));
  updateForgePreview();
  $("#forge").showModal();
}
$("#forge-open").addEventListener("click", openForge);
["#f-name", "#f-arch", "#f-style", "#f-hue"].forEach((s) => $(s).addEventListener("input", updateForgePreview));
$$("#f-form button").forEach((b) =>
  b.addEventListener("click", () => {
    forge.form = b.dataset.v;
    $$("#f-form button").forEach((x) => x.classList.toggle("on", x === b));
    updateForgePreview();
  }),
);
$("#forge").addEventListener("close", () => {
  if ($("#forge").returnValue !== "save") return;
  const d = forgeDraft();
  const back = $("#f-back").value.trim();
  if (BLOCKLIST.test(d.name + " " + back)) return toast("Nova Kitsune is SFW-only.");
  const c = {
    ...d,
    id: uid(),
    traits: forge.traits.size ? [...forge.traits] : ["curious", "caring"],
    backstory: back,
    seed: hashString(d.name), // matches the forge preview
    sync: 0,
  };
  state.companions.push(c);
  state.activeId = c.id;
  save();
  toast(`${c.name} is online ✦`);
  go("chat");
});

// ---------- Chat ----------
const IMAGINE_RE = /\[\[imagine:\s*([^\]]+?)\s*\]\]/gi;
const active = () => state.companions.find((c) => c.id === state.activeId) || state.companions[0];

function greeting(c) {
  return `*${c.name} flickers into focus* Hey — ${c.name} here. ${c.archetype.toLowerCase()}, at your service. What's on your mind?`;
}

function chatImageParams(c, prompt) {
  let p = prompt;
  if (c.form === "fox" && new RegExp(`selfie|${c.name}`, "i").test(p)) p = "kitsune fox " + p;
  return { prompt: p, style: c.style, hue: c.hue, seed: hashString(prompt), detail: 0.75, ratio: "1:1", source: c.name };
}

function renderMessageBody(el, text, c, streaming) {
  el.innerHTML = "";
  let shown = streaming ? text.replace(/\[\[[^\]]*$/, "") : text;
  let last = 0;
  for (const m of shown.matchAll(IMAGINE_RE)) {
    el.append(document.createTextNode(shown.slice(last, m.index).replace(/\n$/, "")));
    const params = chatImageParams(c, m[1]);
    const cv = makeCanvas(512, 512);
    renderArt(cv, params);
    cv.title = m[1] + " — click to save";
    cv.addEventListener("click", () => {
      const item = addToGallery(params);
      openLightbox(item);
    });
    el.append(cv);
    last = m.index + m[0].length;
  }
  el.append(document.createTextNode(shown.slice(last).replace(/^\n/, "")));
  if (streaming) {
    const cur = document.createElement("span");
    cur.className = "typing";
    el.append(cur);
  }
}

function renderChat() {
  const c = active();
  if (!c) {
    $("#chat-head").innerHTML = "";
    $("#messages").innerHTML = `<div class="empty">Forge a companion to start chatting.</div>`;
    $("#chat-list").innerHTML = "";
    return;
  }
  // List
  const list = $("#chat-list");
  list.innerHTML = "";
  state.companions.forEach((x) => {
    const b = document.createElement("button");
    b.className = x.id === c.id ? "on" : "";
    const cv = makeCanvas(80, 80);
    renderAvatar(cv, x);
    const label = document.createElement("div");
    label.textContent = x.name;
    const sm = document.createElement("small");
    sm.textContent = x.archetype;
    label.append(sm);
    b.append(cv, label);
    b.addEventListener("click", () => {
      state.activeId = x.id;
      save();
      renderChat();
    });
    list.append(b);
  });
  // Head
  const head = $("#chat-head");
  head.innerHTML = "";
  const hcv = makeCanvas(80, 80);
  renderAvatar(hcv, c);
  const meta = document.createElement("div");
  meta.className = "meta";
  meta.innerHTML = `<h3></h3><div class="sync-label">SYNC ${c.sync || 0}%</div><div class="sync"><i style="width:${c.sync || 0}%"></i></div>`;
  $("h3", meta).textContent = c.name;
  const reset = document.createElement("button");
  reset.className = "btn ghost small";
  reset.textContent = "Reset memory";
  reset.addEventListener("click", () => {
    if (!confirm(`Wipe your chat with ${c.name}?`)) return;
    state.chats[c.id] = [];
    save();
    renderChat();
  });
  head.append(hcv, meta, reset);
  // Messages
  if (!state.chats[c.id]?.length) state.chats[c.id] = [{ role: "assistant", content: greeting(c) }];
  const box = $("#messages");
  box.innerHTML = "";
  state.chats[c.id].forEach((m) => {
    const el = document.createElement("div");
    el.className = "msg " + m.role;
    renderMessageBody(el, m.content, c, false);
    box.append(el);
  });
  box.scrollTop = box.scrollHeight;
}

async function sendMessage(text) {
  const c = active();
  if (!c || state.busy || !text.trim()) return;
  if (BLOCKLIST.test(text)) {
    toast(`${c.name} keeps it all-ages ✦`);
  }
  state.busy = true;
  const history = state.chats[c.id] || (state.chats[c.id] = []);
  history.push({ role: "user", content: text });
  c.sync = Math.min(100, (c.sync || 0) + 2);
  renderChat();

  const box = $("#messages");
  const el = document.createElement("div");
  el.className = "msg assistant";
  box.append(el);
  let reply = "";
  renderMessageBody(el, reply, c, true);

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companion: c, messages: history }),
    });
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const raw = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const ev = /^event: (\w+)/m.exec(raw)?.[1];
        const data = JSON.parse(/^data: (.*)$/m.exec(raw)?.[1] || "{}");
        if (ev === "delta") reply += data.text;
        if (ev === "error") reply += (reply ? "\n\n" : "") + `⚠ ${data.message}`;
      }
      renderMessageBody(el, reply, c, true);
      box.scrollTop = box.scrollHeight;
    }
  } catch {
    reply += "⚠ Signal lost. Is the server running?";
  }
  history.push({ role: "assistant", content: reply || "…" });
  state.busy = false;
  save();
  renderChat();
}

$("#composer").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("#chat-input");
  const v = input.value;
  input.value = "";
  sendMessage(v);
});
$("#btn-selfie").addEventListener("click", () => sendMessage("Send me a selfie? 📸"));
$("#btn-imagine").addEventListener("click", () => {
  const idea = prompt("What should they imagine for you?");
  if (idea) sendMessage(`Can you show me ${idea}?`);
});

// ---------- Studio ----------
const TAG_GROUPS = {
  Subject: ["kitsune fox", "android portrait", "neon city", "ringed planet", "mountain valley", "spirit dragon"],
  Lighting: ["neon rim light", "volumetric fog", "golden hour", "bioluminescent"],
  Mood: ["dreamy", "melancholic", "epic", "serene"],
  Camera: ["35mm", "wide angle", "macro", "bokeh"],
  Color: ["cyan", "pink", "gold", "purple", "emerald"],
};
const SURPRISES = [
  "a kitsune spirit hacker on a rain-soaked rooftop, neon city below",
  "ringed gas giant rising over a crystal desert, violet sky",
  "portrait of an android oracle with a holographic visor, bokeh",
  "bioluminescent koi spirit swirling through a midnight lake",
  "retro 80s grid sunset with chrome palm trees",
  "floating temple city in the clouds at golden hour",
];

function buildStudio() {
  const tg = $("#tag-groups");
  Object.entries(TAG_GROUPS).forEach(([grp, tags]) => {
    tg.insertAdjacentHTML("beforeend", `<div class="grp">${grp}</div>`);
    const row = document.createElement("div");
    row.className = "chips";
    tags.forEach((t) => {
      const b = document.createElement("button");
      b.className = "chip";
      b.textContent = t;
      b.addEventListener("click", () => {
        const p = $("#prompt");
        p.value = p.value.trim() ? `${p.value.trim().replace(/,$/, "")}, ${t}` : t;
      });
      row.append(b);
    });
    tg.append(row);
  });

  const st = $("#styles");
  Object.entries(STYLES).forEach(([k, s]) => {
    const b = document.createElement("button");
    b.className = "style-tile" + (k === state.studio.style ? " on" : "");
    const cv = makeCanvas(120, 120);
    renderArt(cv, { prompt: "orb", style: k, seed: 7, detail: 0.4 });
    const label = document.createElement("span");
    label.textContent = s.label;
    b.append(cv, label);
    b.addEventListener("click", () => {
      state.studio.style = k;
      $$(".style-tile").forEach((x) => x.classList.toggle("on", x === b));
    });
    st.append(b);
  });

  segmented($("#ratios"), Object.keys(RATIOS), state.studio.ratio, (v) => (state.studio.ratio = v));
  segmented($("#batch"), ["1", "2", "4"], String(state.studio.batch), (v) => (state.studio.batch = Number(v)));
  $("#detail").addEventListener("input", (e) => ($("#detail-val").textContent = e.target.value));
  $("#seed").value = Math.floor(Math.random() * 1e6);
}

function segmented(el, values, current, onPick) {
  values.forEach((v) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = v;
    b.className = v === current ? "on" : "";
    b.addEventListener("click", () => {
      $$("button", el).forEach((x) => x.classList.toggle("on", x === b));
      onPick(v);
    });
    el.append(b);
  });
}

function generate() {
  const promptText = $("#prompt").value.trim();
  if (!promptText) return toast("Type a prompt first ✦");
  if (BLOCKLIST.test(promptText)) return toast("Nova Kitsune is SFW-only.");
  const locked = $("#seed-lock").checked;
  let seed = Number($("#seed").value) || 0;
  if (!locked) {
    seed = Math.floor(Math.random() * 1e6);
    $("#seed").value = seed;
  }
  const out = $("#output");
  out.innerHTML = "";
  $("#output-empty").style.display = "none";
  const [w, h] = sizeFor(state.studio.ratio);
  for (let i = 0; i < state.studio.batch; i++) {
    const params = {
      prompt: promptText,
      negative: $("#negative").value.trim(),
      style: state.studio.style,
      seed: seed + i,
      detail: Number($("#detail").value) / 100,
      ratio: state.studio.ratio,
      source: "Studio",
    };
    const wrap = document.createElement("div");
    wrap.className = "render scanning";
    const cv = makeCanvas(w, h);
    wrap.append(cv);
    out.append(wrap);
    setTimeout(() => {
      renderArt(cv, params);
      setTimeout(() => wrap.classList.remove("scanning"), 900);
      const actions = document.createElement("div");
      actions.className = "actions";
      const mk = (label, fn) => {
        const b = document.createElement("button");
        b.className = "btn small";
        b.textContent = label;
        b.addEventListener("click", fn);
        actions.append(b);
      };
      mk("♥ Save", () => {
        addToGallery(params);
        toast("Saved to gallery");
      });
      mk("⬇", () => download(cv, params.prompt));
      mk("Seed " + params.seed, () => {
        $("#seed").value = params.seed;
        $("#seed-lock").checked = true;
        toast("Seed locked");
      });
      wrap.append(actions);
    }, 80 + i * 140);
  }
}

$("#generate").addEventListener("click", generate);
$("#prompt").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generate();
});
$("#randomize").addEventListener("click", () => {
  $("#prompt").value = SURPRISES[Math.floor(Math.random() * SURPRISES.length)];
  const keys = Object.keys(STYLES);
  const k = keys[Math.floor(Math.random() * keys.length)];
  state.studio.style = k;
  $$(".style-tile").forEach((x, i) => x.classList.toggle("on", keys[i] === k));
  generate();
});
$("#enhance").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  const p = $("#prompt").value.trim();
  if (!p) return toast("Type an idea to enhance");
  btn.disabled = true;
  btn.textContent = "✨ Enhancing…";
  try {
    const res = await fetch("/api/enhance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: p, style: STYLES[state.studio.style].label }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    $("#prompt").value = data.prompt;
    if (data.negative) $("#negative").value = data.negative;
    toast(data.offline ? "Enhanced (offline template)" : "Enhanced ✦ " + (data.tags || []).join(" · "));
  } catch (err) {
    toast(err.message || "Enhancer unavailable");
  }
  btn.disabled = false;
  btn.textContent = "✨ Enhance with AI";
});

// ---------- Gallery ----------
function addToGallery(params) {
  const item = { id: uid(), created: Date.now(), ...params };
  state.gallery.unshift(item);
  state.gallery = state.gallery.slice(0, 300);
  save();
  return item;
}

function renderGallery() {
  const g = $("#gallery");
  g.innerHTML = "";
  $("#gallery-count").textContent = state.gallery.length ? `· ${state.gallery.length}` : "";
  $("#gallery-empty").style.display = state.gallery.length ? "none" : "block";
  state.gallery.forEach((item) => {
    const fig = document.createElement("figure");
    const [w, h] = sizeFor(item.ratio, 360);
    const cv = makeCanvas(w, h);
    renderArt(cv, item);
    const cap = document.createElement("figcaption");
    cap.textContent = `${item.source ? item.source + " · " : ""}${item.prompt}`;
    fig.append(cv, cap);
    fig.addEventListener("click", () => openLightbox(item));
    g.append(fig);
  });
}

let lbItem = null;
function openLightbox(item) {
  lbItem = item;
  const [w, h] = sizeFor(item.ratio, 1024);
  const cv = $("#lb-canvas");
  cv.width = w;
  cv.height = h;
  renderArt(cv, item);
  const meta = $("#lb-meta");
  meta.innerHTML = "";
  [["Prompt", item.prompt], ["Negative", item.negative || "—"], ["Style", STYLES[item.style]?.label || item.style], ["Seed", item.seed], ["From", item.source || "Studio"]].forEach(
    ([k, v]) => {
      const d = document.createElement("div");
      const b = document.createElement("b");
      b.textContent = k + ": ";
      d.append(b, document.createTextNode(String(v)));
      meta.append(d);
    },
  );
  $("#lightbox").showModal();
}
$("#lb-close").addEventListener("click", () => $("#lightbox").close());
$("#lb-download").addEventListener("click", () => download($("#lb-canvas"), lbItem.prompt));
$("#lb-delete").addEventListener("click", () => {
  state.gallery = state.gallery.filter((x) => x.id !== lbItem.id);
  save();
  $("#lightbox").close();
  renderGallery();
});
$("#lb-remix").addEventListener("click", () => {
  $("#prompt").value = lbItem.prompt;
  $("#negative").value = lbItem.negative || "";
  $("#seed").value = lbItem.seed;
  $("#seed-lock").checked = true;
  state.studio.style = lbItem.style;
  const keys = Object.keys(STYLES);
  $$(".style-tile").forEach((x, i) => x.classList.toggle("on", keys[i] === lbItem.style));
  $("#lightbox").close();
  go("studio");
  generate();
});

// ---------- Boot ----------
buildStudio();
renderCards();
