import fs from 'node:fs';
import path from 'node:path';
import { STUDIO_DIR } from './studio.js';
import { generateImage, currentProvider } from './images.js';
import { openartGenerateVideo } from './openart.js';
import { synthesize } from './tts.js';
import { lipsyncVideo } from './lipsync.js';

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
  'Photorealistic, cinematic film still, 9:16 vertical.';

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
  if (!fs.existsSync(FACE) || !meta.imageUrl) {
    if (currentProvider() === 'manual') {
      throw new Error(
        "Le test a besoin d'un fournisseur d'images automatique (IMAGE_PROVIDER=openart dans .env).",
      );
    }
    update('1/4 — Portrait du personnage de test…', 0.05);
    const { ok, url } = await generateImage(PORTRAIT_PROMPT, FACE, {});
    if (!ok) {
      throw new Error("Étape 1 (portrait) : l'image n'a pas pu être générée.");
    }
    meta.imageUrl = url || null;
    saveMeta(meta);
  }

  // 2. Clip vidéo (image-to-video OpenArt, 5 s)
  if (!fs.existsSync(CLIP)) {
    update('2/4 — Clip vidéo de test (plusieurs minutes)…', 0.25);
    const { buffer } = await openartGenerateVideo({
      prompt: MOTION_PROMPT,
      imageUrl: meta.imageUrl,
      referenceUrls: [],
      durationSec: 5,
    });
    fs.writeFileSync(CLIP, buffer);
  }

  // 3. Voix de test
  const vp = voicePath(meta);
  if (!vp || !fs.existsSync(vp)) {
    update('3/4 — Voix de test…', 0.55);
    const r = await synthesize({
      text: TEST_LINE,
      elevenVoice: 'onwK4e9ZLuTAKqWW03F9', // Daniel — grave et posé
      outBase: VOICE_BASE,
    });
    meta.voiceFile = path.basename(r.file);
    saveMeta(meta);
  }

  // 4. Synchro labiale (toujours relancée : c'est elle qu'on teste)
  update('4/4 — Synchronisation des lèvres (fal.ai)…', 0.7);
  fs.rmSync(RESULT, { force: true });
  await lipsyncVideo({
    videoPath: CLIP,
    audioPath: voicePath(meta),
    outPath: RESULT,
    update: (step) => update(`4/4 — ${step}`, 0.85),
    model: model || undefined,
  });
  meta.lastSuccess = new Date().toISOString();
  meta.lastModel = model || process.env.FAL_LIPSYNC_MODEL || 'fal-ai/sync-lipsync';
  saveMeta(meta);
  return lipsyncTestStatus();
}
