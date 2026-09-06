// Catalogue partagé entre le front et le serveur (source unique).

export const STYLES = [
  { id: 'argent', emoji: '💰', label: 'Argent' },
  { id: 'heritage', emoji: '🏛️', label: 'Héritage' },
  { id: 'romance', emoji: '❤️', label: 'Romance' },
  { id: 'trahison', emoji: '🗡️', label: 'Trahison' },
  { id: 'famille', emoji: '👨‍👩‍👧', label: 'Famille' },
  { id: 'mariage', emoji: '💍', label: 'Mariage & belle-famille' },
  { id: 'mystique', emoji: '🔮', label: 'Mystique' },
  { id: 'vengeance', emoji: '⚡', label: 'Vengeance' },
  { id: 'pouvoir', emoji: '👑', label: 'Ambition & pouvoir' },
  { id: 'secrets', emoji: '🤫', label: 'Secrets' },
  { id: 'village', emoji: '🏙️', label: 'Village vs Ville' },
  { id: 'jalousie', emoji: '😤', label: 'Jalousie' },
  { id: 'polygamie', emoji: '👩‍❤️‍👨', label: 'Co-épouses' },
  { id: 'paternite', emoji: '🤰', label: 'Paternité cachée' },
  { id: 'foi', emoji: '🙏', label: 'Foi & miracles' },
  { id: 'tradition', emoji: '👵', label: 'Tradition vs modernité' },
  { id: 'diaspora', emoji: '✈️', label: 'Diaspora' },
  { id: 'richesse', emoji: '🚗', label: 'Nouveaux riches' },
  { id: 'celebrite', emoji: '🎤', label: 'Célébrité & réseaux' },
  { id: 'dette', emoji: '💸', label: 'Dettes & tontine' },
];

export const MAX_STYLES = 3;

export const EPISODE_COUNT = 10;

// Catalogue des voix ElevenLabs (multilingues — parlent français naturellement).
// Les descriptions servent au casting automatique par Claude ET au menu manuel.
export const VOICES = [
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', gender: 'homme', desc: 'grave et posé, 40-60 ans — patriarche, notable, narrateur' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian', gender: 'homme', desc: 'profond et mûr, 40-55 ans — homme d\'affaires, autorité' },
  { id: 'cjVigY5qzO86Huf0OWal', name: 'Eric', gender: 'homme', desc: 'chaleureux, 35-50 ans — père de famille, confident' },
  { id: 'bIHbv24MWmeRgasZH58o', name: 'Will', gender: 'homme', desc: 'jeune et énergique, 20-35 ans — fils, amoureux, ambitieux' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', gender: 'homme', desc: 'rocailleux, âgé, 55-75 ans — ancien, sage du village' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', gender: 'homme', desc: 'jeune adulte posé, 25-35 ans — sérieux, réfléchi' },
  { id: 'pqHfZKP75CvOlQylNhV4', name: 'Bill', gender: 'homme', desc: 'voix âgée et douce, 60 ans et plus — grand-père' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura', gender: 'femme', desc: 'vive et pétillante, 20-35 ans — jeune femme moderne' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', gender: 'femme', desc: 'posée et claire, 30-45 ans — femme de tête' },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', gender: 'femme', desc: 'mûre et chaleureuse, 45-65 ans — matriarche, tante' },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica', gender: 'femme', desc: 'jeune et expressive, 20-30 ans — étudiante, petite sœur' },
];
// Retirées : Charlotte (XB0fDUnXU5powFXDhCwa) et Rachel (21m00Tcm4TlvDq8ikWAM) —
// voix « library » refusées par l'API ElevenLabs sur les plans gratuits (HTTP 402).
// Sarah (EXAVITQu4vr4xnSDxMaL) — écartée à l'écoute (accent non français).

export function voiceById(id) {
  return VOICES.find((v) => v.id === id) || null;
}

// Nombre de scènes animées en clip vidéo par épisode (réglable par drama).
export const DEFAULT_VIDEO_SCENES = 3;
export const MAX_VIDEO_SCENES = 8;

// Nombre de clips vidéo prévus pour un épisode : le réglage du drama s'il
// existe, sinon TOUTES les scènes en Format long (style DramaWave), sinon 3.
export function plannedVideoCount(project, sceneCount) {
  if (Number.isInteger(project?.videoScenes)) {
    return Math.min(project.videoScenes, sceneCount);
  }
  return project?.mode === 'long' ? sceneCount : Math.min(DEFAULT_VIDEO_SCENES, sceneCount);
}

export function plannedVideoIndexes(project, sceneCount) {
  return videoSceneIndexes(sceneCount, plannedVideoCount(project, sceneCount));
}

// La synchro labiale (fal.ai) fait partie du Format long — et reste active
// sur les anciens dramas « Version Synchro ».
export function wantsLipsync(project) {
  return project?.mode === 'long' || project?.mode === 'synchro';
}

// Une scène n'est synchronisable que si UN SEUL personnage y parle : le
// modèle de lip-sync anime un visage sur une voix — plusieurs interlocuteurs
// (ou un plan large de groupe) déforment les visages. Retourne l'id du
// personnage qui parle, ou null (narrateur seul, ou plusieurs voix).
export function lipsyncSpeaker(scene) {
  const speakers = new Set(
    (scene?.lines || []).map((l) => l.speaker).filter((s) => s && s !== 'narrator'),
  );
  return speakers.size === 1 ? [...speakers][0] : null;
}

// Scènes animées en clip vidéo (image-to-video), réparties uniformément :
// 1 → la première ; 2 → première + dernière ; 3 → première, milieu, dernière…
// Les autres scènes restent en images animées Ken Burns.
export function videoSceneIndexes(sceneCount, count = DEFAULT_VIDEO_SCENES) {
  if (!sceneCount || sceneCount < 1 || !count || count < 1) {
    return [];
  }
  const n = Math.min(count, sceneCount);
  if (n === 1) {
    return [0];
  }
  const set = new Set();
  for (let i = 0; i < n; i++) {
    set.add(Math.round((i * (sceneCount - 1)) / (n - 1)));
  }
  return [...set].sort((a, b) => a - b);
}

// ---------- Légende TikTok (titre + hashtags) ----------
// Le nom du fichier MP4 exporté = cette légende : TikTok pré-remplit la
// description avec le nom du fichier, il n'y a plus qu'à publier.

function tagSlug(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export function tiktokHashtags(project) {
  const tags = [];
  const push = (t) => {
    const v = tagSlug(t);
    if (v && v.length > 1 && !tags.includes(v)) {
      tags.push(v);
    }
  };
  // 1. Hashtags proposés par Claude à l'écriture de la série (s'ils existent)
  for (const t of project.hashtags || []) {
    push(t);
  }
  // 2. Le titre de la série + ses styles
  push(project.title);
  for (const id of project.styles || []) {
    const st = STYLES.find((x) => x.id === id);
    if (st) {
      push(st.label);
    }
  }
  // 3. Le socle qui marche pour tous les micro-dramas
  for (const t of ['drama', 'dramaafricain', 'serieafricaine', 'miniserie', 'storytime', 'pourtoi', 'fyp', 'afrique']) {
    push(t);
  }
  return tags.slice(0, 12).map((t) => `#${t}`);
}

export function tiktokCaption(project, episode) {
  // Vidéo de chaîne : pas de numéro d'épisode, le titre suffit.
  if (project.mode === 'chaine') {
    return `${episode.title || `Vidéo ${episode.number}`} ${tiktokHashtags(project).join(' ')}`;
  }
  const title = episode.title ? ` — ${episode.title}` : '';
  return `Épisode ${episode.number}${title} ${tiktokHashtags(project).join(' ')}`;
}

export const SPEAKER_COLORS = [
  '#f2c14e',
  '#e07a5f',
  '#81b29a',
  '#7bdff2',
  '#c77dff',
  '#ef476f',
];

export function styleLabel(id) {
  const s = STYLES.find((x) => x.id === id);
  return s ? s.label : id;
}
