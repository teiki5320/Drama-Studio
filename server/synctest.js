import fs from 'node:fs';
import path from 'node:path';
import { STUDIO_DIR } from './studio.js';
import { generateImage, currentProvider } from './images.js';
import { openartGenerateVideo } from './openart.js';
import { synthesize } from './tts.js';
import { lipsyncVideo, makeTalkingClip, isTalkingModel, lipsyncModel } from './lipsync.js';

// « Test synchro » : un SEUL mini-clip de bout en bout — portrait, clip vidéo,
// voix, lèvres synchronisées — pour vérifier que toute la chaîne fonctionne
// sans produire un épisode entier. Les fichiers sont gardés dans studio/ :
// une relance ne refait que ce qui manque (donc, en général, seulement la
// synchro fal.ai — l'étape qu'on veut justement tester et retester).

const FACE = path.join(STUDIO_DIR, 'synctest_face.jpg');
const CLIP = path.join(STUDIO_DIR, 'synctest_clip.mp4');
const RESULT = path.join(STUDIO_DIR, 'synctest_result.mp4');
const META = path.join(STUDIO_DIR, 'synctest.json');
const VOICE_BASE = path.join(STUDIO_DIR, 'synctest_voice');

const TEST_LINE =
  'Bonjour ! Je suis le test de Drama Studio. Si mes lèvres bougent en même temps que ma voix, tout fonctionne parfaitement.';

const PORTRAIT_PROMPT =
  'Waist-up portrait of a friendly charismatic african man in his thirties wearing a colorful ' +
  'patterned shirt, facing camera, mouth closed, plain warm background, soft cinematic light. ' +
  'Photorealistic, cinematic film still, 9:16 vertical. ' +
  'Clean photograph ONLY: no text, no letters, no logo, no watermark.';

const MOTION_PROMPT =
  'Bring this portrait to life with subtle realistic motion: he breathes, blinks and makes tiny ' +
  'natural head movements, gentle slow camera push-in. CRITICAL: mouth stays CLOSED and still, ' +
  'absolutely NO lip movement (the lips are animated separately). Face, clothing and background ' +
  'stay EXACTLY as in the source image.';

function loadMeta() {
  try {
    return JSON.parse(fs.readFileSync(META, 'utf8'));
  } catch {
    return {};
  }
}

function saveMeta(meta) {
  fs.writeFileSync(META, JSON.stringify(meta, null, 2));
}

function voicePath(meta) {
  return meta.voiceFile ? path.join(STUDIO_DIR, meta.voiceFile) : null;
}

// État des 4 étapes, pour l'affichage de la carte de test.
export function lipsyncTestStatus() {
  const meta = loadMeta();
  const vp = voicePath(meta);
  const result = fs.existsSync(RESULT);
  return {
    face: fs.existsSync(FACE),
    clip: fs.existsSync(CLIP),
    voice: Boolean(vp && fs.existsSync(vp)),
    result,
    resultUrl: result ? `/studio/synctest_result.mp4?t=${fs.statSync(RESULT).mtimeMs}` : null,
    lastSuccess: meta.lastSuccess || null,
    lastModel: meta.lastModel || null,
  };
}

// Efface UNIQUEMENT le dernier résultat (clip synchronisé + trace du moteur) —
// le portrait, le clip et la voix restent en cache pour le prochain essai.
export function clearLipsyncTestResult() {
  fs.rmSync(RESULT, { force: true });
  const meta = loadMeta();
  delete meta.lastSuccess;
  delete meta.lastModel;
  saveMeta(meta);
  return lipsyncTestStatus();
}

// Traduit les messages réseau bruts et signe l'erreur du nom de l'étape —
// pour savoir EXACTEMENT où la chaîne casse.
function stepError(label, e) {
  const msg = String(e?.message || e).replace(
    /The operation was aborted due to timeout/gi,
    'délai réseau dépassé (opération interrompue)',
  );
  return new Error(`${label} : ${msg}`);
}

// Génère le portrait de test s'il manque (partagé entre le test complet et
// le test OpenArt Director, qui n'a besoin QUE du portrait).
async function ensureFace(meta, update, label = 'Étape 1 (portrait)') {
  if (fs.existsSync(FACE) && meta.imageUrl) {
    return;
  }
  if (currentProvider() === 'manual') {
    throw new Error(
      "Le test a besoin d'un fournisseur d'images automatique (IMAGE_PROVIDER=openart dans .env).",
    );
  }
  try {
    const { ok, url } = await generateImage(PORTRAIT_PROMPT, FACE, {});
    if (!ok) {
      throw new Error("l'image n'a pas pu être générée");
    }
    meta.imageUrl = url || null;
  } catch (e) {
    throw stepError(label, e);
  }
  saveMeta(meta);
}

// ---------- Test OpenArt Director ----------
// La nouvelle méthode recommandée : un mini-clip parlé fabriqué DANS Director
// (openart.ai) à partir du portrait de test + de cette consigne, pour juger
// la voix française et la synchro AVANT de dépenser sur un épisode entier.

const DIRECTOR_TEST_TEXT = [
  "Fais UNE seule vidéo verticale 9:16 d'environ 10 secondes, en 480p, à partir du portrait joint.",
  "L'homme du portrait regarde la caméra et dit EN FRANÇAIS, avec une voix d'homme naturelle et grave et les lèvres parfaitement synchronisées :",
  `« ${TEST_LINE} »`,
  'Garde EXACTEMENT le visage du portrait. Pas de musique, pas de sous-titres.',
].join('\n');

export function directorTestKit() {
  const face = fs.existsSync(FACE);
  return {
    face,
    faceUrl: face ? `/studio/synctest_face.jpg?t=${fs.statSync(FACE).mtimeMs}` : null,
    text: DIRECTOR_TEST_TEXT,
  };
}

export async function prepareDirectorTest(update) {
  const meta = loadMeta();
  update('Portrait du personnage de test…', 0.2);
  await ensureFace(meta, update, 'Portrait');
  return directorTestKit();
}

export async function runLipsyncTest({ fresh = false, model = '' } = {}, update) {
  if (fresh) {
    const meta = loadMeta();
    const vp = voicePath(meta);
    for (const f of [FACE, CLIP, RESULT, META, vp].filter(Boolean)) {
      fs.rmSync(f, { force: true });
    }
  }
  const meta = loadMeta();

  // 1. Portrait du personnage de test
  update('1/4 — Portrait du personnage de test…', 0.05);
  await ensureFace(meta, update);

  // Modèle « avatar » (OmniHuman) : image + voix suffisent — pas de clip.
  const talking = isTalkingModel(model || undefined);

  // 2. Clip vidéo (image-to-video OpenArt, 5 s) — inutile en mode avatar
  if (!talking && !fs.existsSync(CLIP)) {
    update('2/4 — Clip vidéo de test (plusieurs minutes)…', 0.25);
    try {
      const { buffer } = await openartGenerateVideo({
        prompt: MOTION_PROMPT,
        imageUrl: meta.imageUrl,
        referenceUrls: [],
        durationSec: 5,
      });
      fs.writeFileSync(CLIP, buffer);
    } catch (e) {
      throw stepError('Étape 2 (clip vidéo)', e);
    }
  }

  // 3. Voix de test
  const vp = voicePath(meta);
  if (!vp || !fs.existsSync(vp)) {
    update('3/4 — Voix de test…', 0.55);
    try {
      const r = await synthesize({
        text: TEST_LINE,
        elevenVoice: 'onwK4e9ZLuTAKqWW03F9', // Daniel — grave et posé
        outBase: VOICE_BASE,
      });
      meta.voiceFile = path.basename(r.file);
    } catch (e) {
      throw stepError('Étape 3 (voix)', e);
    }
    saveMeta(meta);
  }

  // 4. Synchro labiale (toujours relancée : c'est elle qu'on teste)
  update('4/4 — Synchronisation des lèvres…', 0.7);
  fs.rmSync(RESULT, { force: true });
  try {
  if (talking) {
    await makeTalkingClip({
      imagePath: FACE,
      imageUrl: meta.imageUrl || null,
      audioPath: voicePath(meta),
      outPath: RESULT,
      update: (step) => update(`4/4 — ${step}`, 0.85),
      model: model || undefined,
    });
  } else {
    await lipsyncVideo({
      videoPath: CLIP,
      audioPath: voicePath(meta),
      outPath: RESULT,
      update: (step) => update(`4/4 — ${step}`, 0.85),
      model: model || undefined,
    });
  }
  } catch (e) {
    throw stepError(`Étape 4 (synchro — ${model || lipsyncModel()})`, e);
  }
  meta.lastSuccess = new Date().toISOString();
  meta.lastModel = model || lipsyncModel();
  saveMeta(meta);
  return lipsyncTestStatus();
}
