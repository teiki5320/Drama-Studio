import { addCustomVoice } from './tts.js';

// Bibliothèque de voix partagées ElevenLabs : recherche des meilleures voix
// NATIVEMENT françaises (pré-écoute gratuite via preview_url), puis adoption
// dans le compte de l'utilisateur (nécessaire pour les utiliser via l'API —
// réservé aux plans payants).

function apiKey() {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    throw new Error('ELEVENLABS_API_KEY absente du .env');
  }
  return key;
}

function frDesc(v) {
  const bits = [];
  if (v.age) bits.push(v.age === 'young' ? 'jeune' : v.age === 'old' ? 'âgé(e)' : v.age.replace('middle_aged', 'âge mûr').replace('middle-aged', 'âge mûr'));
  if (v.accent) bits.push(`accent ${v.accent}`);
  if (v.descriptive) bits.push(v.descriptive);
  if (v.use_case) bits.push(v.use_case.replace(/_/g, ' '));
  return `${bits.join(', ') || 'voix française'} — 🇫🇷 native`;
}

// Les voix FR les plus populaires de la bibliothèque, hommes et femmes.
export async function searchFrenchLibraryVoices() {
  const key = apiKey();
  const results = [];
  for (const gender of ['male', 'female']) {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/shared-voices?page_size=30&language=fr&gender=${gender}`,
      { headers: { 'xi-api-key': key }, signal: AbortSignal.timeout(30000) },
    );
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`Bibliothèque ElevenLabs : HTTP ${res.status} ${t.slice(0, 150)}`);
    }
    const data = await res.json();
    for (const v of data.voices || []) {
      results.push(v);
    }
  }
  const seen = new Set();
  return results
    .filter((v) => {
      if (!v.voice_id || seen.has(v.voice_id)) {
        return false;
      }
      seen.add(v.voice_id);
      return true;
    })
    .map((v) => ({
      voiceId: v.voice_id,
      publicOwnerId: v.public_owner_id,
      name: v.name,
      gender: v.gender === 'female' ? 'femme' : 'homme',
      desc: frDesc(v),
      previewUrl: v.preview_url || null,
      popularity: v.cloned_by_count || 0,
    }))
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, 40);
}

// Ajoute la voix au compte ElevenLabs de l'utilisateur puis au catalogue local.
export async function adoptLibraryVoice({ publicOwnerId, voiceId, name, gender, desc }) {
  const key = apiKey();
  const res = await fetch(
    `https://api.elevenlabs.io/v1/voices/add/${publicOwnerId}/${voiceId}`,
    {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_name: name }),
      signal: AbortSignal.timeout(30000),
    },
  );
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    // Déjà dans « My Voices » → pas une erreur, on l'ajoute juste au catalogue.
    if (!(res.status === 400 && /already|exist/i.test(t))) {
      if (res.status === 402 || /free/i.test(t)) {
        throw new Error(
          "ElevenLabs refuse l'ajout : les voix de la bibliothèque via l'API nécessitent un plan payant.",
        );
      }
      throw new Error(`Adoption impossible : HTTP ${res.status} ${t.slice(0, 150)}`);
    }
  }
  addCustomVoice({ id: voiceId, name, gender, desc, custom: true });
}
