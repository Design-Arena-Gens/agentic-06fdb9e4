import { put } from "@vercel/blob";

export const maxDuration = 60;
export const runtime = "nodejs";

const OPENAI_URL = "https://api.openai.com/v1/audio/speech";

async function ttsOpenAI({ text, voice }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "tts-1",
      input: text,
      voice: voice || "alloy",
      format: "mp3",
    }),
  });
  if (!res.ok) throw new Error(`OpenAI TTS failed: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  return new Blob([arrayBuffer], { type: "audio/mpeg" });
}

async function ttsElevenLabs({ text, voice }) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return null;
  const defaultVoiceId = "21m00Tcm4TlvDq8ikWAM"; // Rachel
  const voiceId = voice?.startsWith("elevenlabs/") ? voice.split("/")[1] : defaultVoiceId;
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      "Accept": "audio/mpeg",
    },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`ElevenLabs TTS failed: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  return new Blob([arrayBuffer], { type: "audio/mpeg" });
}

export async function POST(req) {
  try {
    const { text, voice } = await req.json();
    if (!text || !text.trim()) return new Response(JSON.stringify({ error: "Missing text" }), { status: 400 });

    let blob = null;
    // Prefer ElevenLabs for richer voices if configured
    try { blob = await ttsElevenLabs({ text, voice }); } catch (e) { /* fallback */ }
    if (!blob) { blob = await ttsOpenAI({ text, voice }); }
    if (!blob) return new Response(JSON.stringify({ error: "No TTS provider configured" }), { status: 400 });

    const filename = `tts-${Date.now()}.mp3`;
    const { url } = await put(filename, blob, { access: "public", addRandomSuffix: true, token: process.env.BLOB_READ_WRITE_TOKEN });

    return new Response(JSON.stringify({ audioUrl: url }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
