// KI-Anbindung für das Import-Cockpit auf Netlify.
// Benötigt die Umgebungsvariable ANTHROPIC_API_KEY (Netlify → Project configuration →
// Environment variables). Optional: ANTHROPIC_MODEL (Standard: claude-sonnet-5-5).
// Antwortet als Text-Stream, damit lange Antworten nicht an Zeitlimits scheitern.

export const config = { path: "/api/sample" };

const MAX_CHARS = 120000;   // Obergrenze für die Eingabe (Regeln + Daten + Verlauf)
const MAX_TOKENS = 1500;
const JSON_SYSTEM =
  "Antworte ausschließlich mit einem einzigen gültigen JSON-Objekt, ohne Text davor oder danach und ohne Code-Block.";

function clean(messages) {
  if (!Array.isArray(messages)) return [];
  const out = [];
  for (const m of messages.slice(-14)) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") continue;
    const content = m.content.trim();
    if (!content) continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += "\n\n" + content; // gleiche Rolle zusammenfassen
    else out.push({ role: m.role, content });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

export default async (req) => {
  const key = Netlify.env.get("ANTHROPIC_API_KEY");

  if (req.method === "GET") return Response.json({ ok: !!key }, { headers: { "cache-control": "no-store" } });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!key) return new Response("KI nicht eingerichtet", { status: 503 });

  // Nur Aufrufe von der eigenen Seite annehmen
  const origin = req.headers.get("origin");
  if (origin) {
    try { if (new URL(origin).host !== new URL(req.url).host) return new Response("Forbidden", { status: 403 }); }
    catch { return new Response("Forbidden", { status: 403 }); }
  }

  let body;
  try { body = await req.json(); } catch { return new Response("Bad request", { status: 400 }); }
  const messages = clean(body && body.messages);
  if (!messages.length) return new Response("Bad request", { status: 400 });
  if (JSON.stringify(messages).length > MAX_CHARS) return new Response("Too large", { status: 413 });

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: Netlify.env.get("ANTHROPIC_MODEL") || "claude-sonnet-5-5",
      max_tokens: MAX_TOKENS,
      stream: true,
      ...(body.json ? { system: JSON_SYSTEM } : {}),
      messages,
    }),
    signal: req.signal,
  }).catch(() => null);

  if (!upstream) return new Response("Upstream nicht erreichbar", { status: 502 });
  if (upstream.status === 429 || upstream.status === 529) return new Response("Rate limited", { status: 429 });
  if (!upstream.ok || !upstream.body) {
    console.error("Anthropic API", upstream.status, await upstream.text().catch(() => ""));
    return new Response("Upstream error", { status: 502 });
  }

  // SSE der API in reinen Text umwandeln
  const enc = new TextEncoder(), dec = new TextDecoder();
  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body.getReader();
      let buf = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, i).trim();
            buf = buf.slice(i + 1);
            if (!line.startsWith("data:")) continue;
            let ev;
            try { ev = JSON.parse(line.slice(5)); } catch { continue; }
            if (ev.type === "content_block_delta" && ev.delta && ev.delta.type === "text_delta") {
              controller.enqueue(enc.encode(ev.delta.text));
            }
          }
        }
      } catch (e) {
        console.error("Stream abgebrochen", e);
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
};
