// ---------- Voix par format ----------
// De vraies voix françaises (bibliothèque ElevenLabs, adoptées dans le
// compte) et leurs réglages : stabilité, expressivité (style), débit (speed).
// Appliquées une seule fois par projet : changer la voix ensuite reste libre.
export const VOICE_PRESETS = {
  // Recettes : calme et pédagogique, au vouvoiement, débit posé.
  recette: {
    narratorVoice: 'tMyQcCxfGDdIt7wJ2RQw', // Marie Alice
    voiceSettings: { stability: 0.6, similarity_boost: 0.8, style: 0.15, speed: 0.95 },
  },
  // Pub Keur Cook : TikTok, tutoiement, énergie.
  'teiki5320/keurcook': {
    narratorVoice: 'FvmvwvObRqIHojkEGh5N', // Adina
    voiceSettings: { stability: 0.38, similarity_boost: 0.8, style: 0.45, speed: 1.05 },
  },
  // Pub Keur Déco : douce et inspirante, au vouvoiement.
  'teiki5320/keurdeco': {
    narratorVoice: '6vTyAgAT8PncODBcLjRf', // Claire
    voiceSettings: { stability: 0.6, similarity_boost: 0.8, style: 0.25, speed: 0.93 },
  },
  // Pub Keurbook : posée et littéraire, au vouvoiement.
  'teiki5320/keurbook': {
    narratorVoice: 'aQROLel5sQbj1vuIVi6B', // Nicolas (narrateur parisien)
    voiceSettings: { stability: 0.55, similarity_boost: 0.8, style: 0.25, speed: 0.97 },
  },
  // Pub OptiLED : astuce dynamique, au tutoiement.
  'teiki5320/optiled': {
    narratorVoice: 'AfbuxQ9DVtS4azaxN1W7', // Léo
    voiceSettings: { stability: 0.4, similarity_boost: 0.8, style: 0.4, speed: 1.05 },
  },
  // Pub Erea : dynamique et amusée, au tutoiement.
  'teiki5320/erea': {
    narratorVoice: 'AfbuxQ9DVtS4azaxN1W7', // Léo
    voiceSettings: { stability: 0.38, similarity_boost: 0.8, style: 0.45, speed: 1.05 },
  },
  // Pub Palabre : narrateur posé, sobre et sec, au vouvoiement.
  'teiki5320/palabre': {
    narratorVoice: 'aQROLel5sQbj1vuIVi6B', // Nicolas (narrateur parisien)
    voiceSettings: { stability: 0.6, similarity_boost: 0.8, style: 0.2, speed: 0.98 },
  },
  // Pub Kultiva : jeune et joyeuse, esprit kawaii, au tutoiement.
  'teiki5320/kultiva': {
    narratorVoice: 'FvmvwvObRqIHojkEGh5N', // Adina
    voiceSettings: { stability: 0.4, similarity_boost: 0.8, style: 0.4, speed: 1.02 },
  },
};

export function applyVoicePreset(project) {
  if (project.voiceSettings) {
    return false;
  }
  const key = project.mode === 'recette' ? 'recette' : String(project.repo || '').toLowerCase();
  const preset = VOICE_PRESETS[key];
  if (!preset) {
    return false;
  }
  project.narratorVoice = preset.narratorVoice;
  project.voiceSettings = { ...preset.voiceSettings };
  return true;
}
