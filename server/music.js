// ---------- Musique composée par ElevenLabs ----------
// Les pubs d'ambiance (sans voix) ont leur propre musique, composée pour la
// vidéo à partir d'une description (instrumentale, durée exacte).

import fs from 'node:fs';

export async function composeMusic(prompt, seconds, outPath) {
  const key = (process.env.ELEVENLABS_API_KEY || '').trim();
  if (!key) {
    throw new Error('ELEVENLABS_API_KEY absente du .env : la musique ne peut pas être composée.');
  }
  const ms = Math.round(Math.max(10, Math.min(120, seconds)) * 1000);
  const res = await fetch('https://api.elevenlabs.io/v1/music', {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: `${prompt}, instrumental, no vocals`, music_length_ms: ms }),
    signal: AbortSignal.timeout(240000),
  });
  if (!res.ok) {
    const txt = (await res.text().catch(() => '')).slice(0, 200);
    throw new Error(`ElevenLabs n'a pas composé la musique (${res.status}) ${txt}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 10000) {
    throw new Error('ElevenLabs a renvoyé une musique vide.');
  }
  fs.writeFileSync(outPath, buf);
  return outPath;
}
