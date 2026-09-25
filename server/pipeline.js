import path from 'node:path';
import fs from 'node:fs';
import {
  SPEAKER_COLORS,
  EPISODE_COUNT,
  plannedVideoCount,
  plannedVideoIndexes,
  wantsLipsync,
  lipsyncSpeaker,
  episodeHasShots,
  sceneShots,
  shotKey,
  plannedShotKeys,
  shotEffectiveSec,
} from '../shared/catalog.js';
import { generateStoryboard } from './storyboard.js';
import { VIDEO_SCENES } from './config.js';
import { openartGenerateVideo } from './openart.js';
import {
  buildSceneVoiceTrack,
  lipsyncVideo,
  makeTalkingClip,
  isTalkingModel,
} from './lipsync.js';
import { renderEpisode } from './render.js';
import {
  askClaudeForJson,
  buildSeriesPrompt,
  buildCustomSeriesPrompt,
  buildEpisodePrompt,
  buildNewFacePrompt,
  drawVariety,
  leadAdjectives,
  seriesFormat,
  formatFor,
  buildChannelPrompt,
  buildTopicsPrompt,
  buildChannelVideoPrompt,
  buildAdPrompt,
  buildAdVideoPrompt,
  buildRecipePrompt,
  KITCHEN_REFERENCE_PROMPT,
  RECIPE_SECONDS,
  findHealthClaims,
  DRAMA_IMAGE_SUFFIX,
} from './claudegen.js';
import { fetchRecipe, manualRecipe, downloadRecipeImage } from './recipes.js';
import { generateImage, currentProvider } from './images.js';
import { assignVoices, synthesize, voiceFor, isCatalogVoice } from './tts.js';
import {
  newId,
  createProjectDirs,
  saveProject,
  assetsDir,
  findEpisode,
  listProjects,
  loadProject,
} from './projects.js';
import { LINE_START_DELAY, LINE_GAP } from '../src/remotion/timing.js';

const KEN_BURNS_CYCLE = ['zoom-in', 'pan-right', 'zoom-out', 'pan-left', 'zoom-in', 'pan-up'];

// Compteur de consommation du projet (crédits/appels par service).
export function ensureUsage(project) {
  if (!project.usage) {
    project.usage = {
      claudeCalls: 0,
      openartImages: 0,
      openartVideos: 0,
      pollinationsImages: 0,
      falImages: 0,
      elevenClips: 0,
      elevenChars: 0,
      edgeClips: 0,
      sayClips: 0,
      falLipsyncs: 0,
    };
  }
  return project.usage;
}

function countImage(project, provider) {
  const u = ensureUsage(project);
  if (provider === 'openart') u.openartImages += 1;
  else if (provider === 'fal') u.falImages += 1;
  else if (provider === 'pollinations') u.pollinationsImages += 1;
}

function countVideo(project) {
  const u = ensureUsage(project);
  u.openartVideos = (u.openartVideos || 0) + 1;
}

function countVoice(project, result) {
  const u = ensureUsage(project);
  if (result.engine === 'elevenlabs') {
    u.elevenClips += 1;
    u.elevenChars += result.chars;
  } else if (result.engine === 'edge') {
    u.edgeClips += 1;
  } else {
    u.sayClips += 1;
  }
}

const MIN_SCENE_SEC = 3.5;
const MAX_SCENE_SEC = 16;

function normalizeEpisode(raw, number) {
  const scenes = (raw.scenes || []).slice(0, 12).map((s, i) => {
    const lines = (s.lines || [])
      .filter((l) => l && l.text)
      .slice(0, 3)
      .map((l) => ({
        speaker: l.speaker || 'narrator',
        text: String(l.text).trim(),
        audio: null,
        audioDurationSec: null,
      }));
    // Personnages visibles : fournis par Claude, sinon déduits des répliques.
    const characters = Array.isArray(s.characters)
      ? s.characters.filter((c) => typeof c === 'string')
      : [...new Set(lines.map((l) => l.speaker).filter((sp) => sp !== 'narrator'))];
    return {
      id: `s${i + 1}`,
      location: String(s.location || '').trim(),
      // Pub : numéro de la capture d'écran à afficher (résolu en fichier ci-après).
      screenshot: Number.isInteger(s.screenshot) ? s.screenshot : null,
      // Pub : incrustation courte qui situe le plan (« Rome, -52 »).
      badge: typeof s.badge === 'string' && s.badge.trim() ? s.badge.trim().slice(0, 40) : null,
      // Recette : rôle du plan, texte à l'écran, numéro d'étape, liste d'ingrédients.
      kind: typeof s.kind === 'string' ? s.kind.trim().slice(0, 20) : undefined,
      // Recette : le geste filmé sur ce plan (« casser les œufs dans le bol »).
      gesture: typeof s.gesture === 'string' ? s.gesture.trim().slice(0, 80) : undefined,
      onScreen: typeof s.onScreen === 'string' ? s.onScreen.trim().slice(0, 80) : undefined,
      stepNumber: Number.isInteger(s.stepNumber) ? s.stepNumber : undefined,
      ingredients: Array.isArray(s.ingredients)
        ? s.ingredients.map((x) => String(x).trim().slice(0, 60)).filter(Boolean).slice(0, 8)
        : undefined,
      clip: s.clip === true ? true : undefined,
      lines,
      characters,
      imagePrompt: String(s.imagePrompt || '').trim(),
      image: null,
      kenBurns: KEN_BURNS_CYCLE[i % KEN_BURNS_CYCLE.length],
      durationSec: 6,
      version: 0,
    };
  });
  // Fiches des lieux : { "nom du lieu": "description visuelle stable (EN)" } —
  // la clé de la cohérence des décors (et du Kit Director, comme le casting).
  const locations =
    raw.locations && typeof raw.locations === 'object' && !Array.isArray(raw.locations)
      ? Object.fromEntries(
          Object.entries(raw.locations)
            .filter(([, v]) => typeof v === 'string' && v.trim())
            .slice(0, 12)
            .map(([k, v]) => [String(k).trim(), v.trim()]),
        )
      : {};
  return {
    number,
    title: raw.title || `Épisode ${number}`,
    locations,
    scenes,
    cliffhanger: raw.cliffhanger || '',
    status: 'script',
    renderedFile: null,
  };
}

function recomputeSceneDuration(scene) {
  // Scène storyboardée : la durée = la somme de ses plans (durée cible de
  // chaque plan, allongée si sa réplique dépasse — la voix a le dernier mot).
  const shots = sceneShots(scene);
  if (shots.length > 0) {
    scene.durationSec = Math.round(
      shots.reduce((sum, sh) => sum + shotEffectiveSec(sh, scene), 0),
    );
    return;
  }
  const spoken = (scene.lines || []).reduce(
    (sum, l) => sum + (l.audioDurationSec || 2) + LINE_GAP,
    0,
  );
  scene.durationSec = Math.min(
    MAX_SCENE_SEC,
    Math.max(MIN_SCENE_SEC, LINE_START_DELAY + spoken + 0.9),
  );
}

// Atelier de recettes : UNE image de référence du plan de travail vu du
// dessus, avec les mains. Elle est passée en référence à TOUS les plans —
// c'est elle qui garde le même bois, les mêmes mains et la même vaisselle
// du premier au dernier geste.
export async function ensureKitchenReference(project, update) {
  if (project.mode !== 'recette' || currentProvider() !== 'openart') {
    return;
  }
  const k = project.kitchen || (project.kitchen = { image: null, imageUrl: null, version: 0 });
  if (k.image && k.imageUrl) {
    return;
  }
  update('Plan de travail de référence (vue du dessus, mains)…', 0.02);
  k.version = (k.version || 0) + 1;
  const file = `kitchen_v${k.version}.jpg`;
  try {
    const { ok, url, provider } = await generateImage(
      KITCHEN_REFERENCE_PROMPT,
      path.join(assetsDir(project.id), file),
      {},
    );
    if (ok) {
      k.image = file;
      k.imageUrl = url;
      countImage(project, provider);
    }
  } catch (e) {
    console.error('Plan de travail de référence :', e.message);
  }
  saveProject(project);
}

// Références de visages : URLs des portraits des personnages visibles dans la
// scène — et, pour une recette, le plan de travail de référence.
function sceneReferenceUrls(project, scene) {
  if (project.mode === 'recette') {
    return project.kitchen && project.kitchen.imageUrl ? [project.kitchen.imageUrl] : [];
  }
  return (scene.characters || [])
    .map((id) => (project.characters || []).find((c) => c.id === id))
    .filter((c) => c && c.portraitUrl)
    .map((c) => c.portraitUrl);
}

// Références d'un PLAN : portraits de TOUS les personnages du plan (par nom
// exact) + l'image de référence de son lieu.
function shotReferenceUrls(project, shot) {
  const urls = [];
  for (const name of shot.characters || []) {
    const c = (project.characters || []).find((x) => x.name === name);
    if (c && c.portraitUrl) {
      urls.push(c.portraitUrl);
    }
  }
  const loc = findLocation(project, shot.location);
  if (loc && loc.imageUrl) {
    urls.push(loc.imageUrl);
  }
  return urls;
}

// Prompt image d'un plan : ce qu'on voit + rappel des tenues des personnages
// présents + style de la série. Ni mouvement (motionDesc) ni dialogue.
function shotImagePrompt(project, shot) {
  const outfits = (shot.characters || [])
    .map((name) => {
      const c = (project.characters || []).find((x) => x.name === name);
      return c ? `${c.name}: ${c.visual}` : null;
    })
    .filter(Boolean)
    .join('. ');
  return (
    `${shot.visualDesc}` +
    (outfits ? `. Characters present (KEEP their exact look and outfit): ${outfits}` : '') +
    `. ${DRAMA_IMAGE_SUFFIX}`
  );
}

// Génère (ou régénère) l'image d'un plan, références visages + lieu comprises.
export async function generateShotImage(project, episode, scene, shot) {
  shot.version = (shot.version || 0) + 1;
  const file = `e${episode.number}_${scene.id}_p${shot.idx}_v${shot.version}.jpg`;
  const { ok, url, provider } = await generateImage(
    shotImagePrompt(project, shot),
    path.join(assetsDir(project.id), file),
    { referenceUrls: shotReferenceUrls(project, shot) },
  );
  if (!ok) {
    throw new Error("l'image n'a pas pu être générée");
  }
  shot.image = file;
  shot.imageUrl = url || null;
  shot.video = null;
  shot.lipsynced = false;
  delete shot.imageError;
  countImage(project, provider);
  if (episode.status === 'done') {
    episode.status = 'ready';
  }
  saveProject(project);
  return file;
}

// Avec OpenArt : crée d'abord un portrait de référence par personnage,
// réutilisé ensuite dans toutes les scènes pour garder les mêmes visages.
export async function ensureCharacterPortraits(project, update) {
  if (currentProvider() !== 'openart') {
    return;
  }
  const dir = assetsDir(project.id);
  const chars = project.characters || [];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (c.portrait && c.portraitUrl) {
      continue;
    }
    update(`Portrait de référence ${i + 1}/${chars.length} — ${c.name}…`, i / chars.length);
    c.portraitVersion = (c.portraitVersion || 0) + 1;
    const file = `char_${c.id}_v${c.portraitVersion}.jpg`;
    // La star (premier personnage) a droit à un vrai portrait glamour de
    // télénovela ; les autres gardent un portrait neutre de référence.
    // IMPORTANT : aucune mention de « magazine », « cover » ou de marques —
    // le générateur les prend au mot et écrit un titre d'affiche SUR l'image.
    const prompt =
      i === 0
        ? `Glamorous lead ${c.gender === 'femme' ? 'actress' : 'actor'} reference portrait for a ` +
          `premium vertical drama series, waist-up, facing camera, ` +
          `confident captivating gaze, soft subtle smile, flattering cinematic beauty lighting, ` +
          `flawless elegant styling, plain warm background: ${c.visual}. ` +
          `Professional studio photography, photorealistic, cinematic film still, 9:16 vertical. ` +
          `Clean photograph ONLY: absolutely no text, no letters, no words, no title, no logo, ` +
          `no watermark, no poster graphics anywhere in the image.`
        : `Character reference portrait, waist-up, facing camera, neutral expression, ` +
          `plain warm background, soft natural light: ${c.visual}. ` +
          `Photorealistic, cinematic film still, 9:16 vertical. ` +
          `Clean photograph ONLY: no text, no letters, no logo, no watermark.`;
    const { ok, url, provider } = await generateImage(prompt, path.join(dir, file), {});
    if (ok) {
      c.portrait = file;
      c.portraitUrl = url;
      countImage(project, provider);
    }
    saveProject(project);
  }
}

// Nom de fichier sûr pour un lieu (accents et espaces retirés).
function locationSlug(name) {
  return (
    String(name)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/gi, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase()
      .slice(0, 40) || 'lieu'
  );
}

// Décors de référence au niveau PROJET (même mécanique que les portraits) :
// une image par lieu, générée UNE fois par série puis réutilisée comme
// référence dans tous les plans qui s'y déroulent. Les descriptions texte
// restent dans episode.locations ; project.locations porte les images.
export async function ensureLocationImages(project, update) {
  if (currentProvider() !== 'openart') {
    return;
  }
  const locs = project.locations || (project.locations = []);
  for (const ep of project.episodes || []) {
    for (const [name, visual] of Object.entries(ep.locations || {})) {
      if (name && visual && !locs.find((l) => l.name === name)) {
        locs.push({ name, visual, image: null, imageUrl: null, version: 0 });
      }
    }
  }
  const dir = assetsDir(project.id);
  for (let i = 0; i < locs.length; i++) {
    const l = locs[i];
    if (l.image && l.imageUrl) {
      continue;
    }
    update(`Décor de référence ${i + 1}/${locs.length} — ${l.name}…`, i / locs.length);
    l.version = (l.version || 0) + 1;
    const file = `loc_${locationSlug(l.name)}_v${l.version}.jpg`;
    const prompt =
      `Location reference plate for a drama series, completely empty of people: ${l.visual}. ` +
      `Photorealistic, cinematic film still, 9:16 vertical. ` +
      `Clean photograph ONLY: no text, no letters, no logo, no watermark.`;
    try {
      const { ok, url, provider } = await generateImage(prompt, path.join(dir, file), {});
      if (ok) {
        l.image = file;
        l.imageUrl = url;
        countImage(project, provider);
      }
    } catch (e) {
      console.error(`Décor ${l.name} :`, e.message);
    }
    saveProject(project);
  }
}

export function findLocation(project, name) {
  return (project.locations || []).find((l) => l.name === name) || null;
}

// Regénère le décor avec la même description (variation légère).
export async function regenerateLocationImage(project, index, update) {
  const l = (project.locations || [])[index];
  if (!l) {
    throw new Error('Lieu introuvable');
  }
  l.image = null;
  l.imageUrl = null;
  saveProject(project);
  await ensureLocationImages(project, update);
  if (!l.image) {
    throw new Error("Le décor n'a pas pu être généré.");
  }
}

// « ✨ Nouveau décor » : Claude réécrit la description (guidée par les
// consignes), puis l'image de référence est régénérée.
export async function newLocationLook(project, index, instructions, update) {
  const l = (project.locations || [])[index];
  if (!l) {
    throw new Error('Lieu introuvable');
  }
  update('Réécriture du décor par Claude…');
  const data = await askClaudeForJson(
    `Décor d'une mini-série verticale « ${project.title} » (${project.setting}).\n` +
      `Lieu : ${l.name}. Description actuelle (EN) : ${l.visual}\n` +
      (instructions ? `Consignes de l'auteur : ${instructions}\n` : '') +
      `Réécris ce décor (même lieu, autre apparence/ambiance, guidée par les consignes).\n` +
      `Réponds UNIQUEMENT avec un objet JSON valide : {"visual": "description visuelle EN ANGLAIS, très détaillée et STABLE du décor (architecture, mobilier, lumière, ambiance)"}`,
  );
  ensureUsage(project).claudeCalls += 1;
  if (!data.visual) {
    throw new Error("Claude n'a pas fourni de description.");
  }
  l.visual = String(data.visual);
  l.image = null;
  l.imageUrl = null;
  saveProject(project);
  await ensureLocationImages(project, update);
}

async function generateEpisodeAssets(project, episode, update) {
  const dir = assetsDir(project.id);
  const provider = currentProvider();
  const scenes = episode.scenes || [];

  // 0. Portraits + décors de référence (OpenArt) — visages et lieux constants.
  await ensureCharacterPortraits(project, update);
  await ensureLocationImages(project, update);
  await ensureKitchenReference(project, update);

  // 0 bis. Storyboard : découpage des scènes en plans (dramas uniquement,
  // UN appel Claude, aucun appel payant). Sans storyboard (anciens épisodes,
  // chaînes), toute la suite garde le comportement « une scène = une image ».
  if (project.mode !== 'chaine' && project.mode !== 'recette' && !episodeHasShots(episode)) {
    await generateStoryboard(project, episode, update);
  }

  const hasShots = episodeHasShots(episode);

  // 1. Images — une par PLAN quand l'épisode est storyboardé, sinon une par
  // scène (anciens épisodes, chaînes) : comportement historique conservé.
  if (provider !== 'manual' && hasShots) {
    const all = [];
    for (const scene of scenes) {
      for (const shot of sceneShots(scene)) {
        all.push({ scene, shot });
      }
    }
    for (let i = 0; i < all.length; i++) {
      const { scene, shot } = all[i];
      if (shot.image) {
        continue;
      }
      update(`Épisode ${episode.number} — image du plan ${i + 1}/${all.length}…`, i / all.length);
      try {
        await generateShotImage(project, episode, scene, shot);
      } catch (e) {
        console.error(`Image plan ${scene.id}#${shot.idx} :`, e.message);
        shot.imageError = e.message;
      }
      saveProject(project);
    }
  } else if (provider !== 'manual') {
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      if (scene.image) {
        continue;
      }
      update(`Épisode ${episode.number} — image ${i + 1}/${scenes.length}…`, i / scenes.length);
      const file = `e${episode.number}_${scene.id}_v${scene.version}.jpg`;
      try {
        const { ok, url, provider } = await generateImage(scene.imagePrompt, path.join(dir, file), {
          referenceUrls: sceneReferenceUrls(project, scene),
        });
        if (ok) {
          scene.image = file;
          scene.imageUrl = url || null;
          countImage(project, provider);
        }
      } catch (e) {
        console.error(`Image scène ${scene.id} :`, e.message);
        scene.imageError = e.message;
      }
      saveProject(project);
    }
  }

  // 2. Voix (Edge TTS, puis voix macOS en secours)
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    update(`Épisode ${episode.number} — voix ${i + 1}/${scenes.length}…`, i / scenes.length);
    for (let j = 0; j < scene.lines.length; j++) {
      const line = scene.lines[j];
      if (line.audio) {
        continue;
      }
      const base = `e${episode.number}_${scene.id}_l${j}_v${scene.version}`;
      try {
        const result = await synthesize({
          text: line.text,
          ...voiceFor(project, line.speaker),
          outBase: path.join(dir, base),
        });
        line.audio = path.basename(result.file);
        line.audioDurationSec = result.durationSec;
        line.audioEngine = result.engine;
        // ElevenLabs attendu mais moteur de secours utilisé (crédits épuisés ?)
        line.audioFallback =
          Boolean(process.env.ELEVENLABS_API_KEY) && result.engine !== 'elevenlabs'
            ? true
            : undefined;
        countVoice(project, result);
        delete line.audioError;
      } catch (e) {
        console.error(`Voix scène ${scene.id} ligne ${j} :`, e.message);
        line.audioError = e.message;
        line.audioDurationSec = Math.max(1.5, line.text.split(/\s+/).length * 0.42);
      }
    }
    recomputeSceneDuration(scene);
    saveProject(project);
  }

  // 3. Clips vidéo (OpenArt). Épisode storyboardé : un clip par PLAN animé
  // retenu (priorité réplique → cliffhanger → ordre, plafond = « Plans
  // animés/épisode »). Après les voix, pour caler la durée sur la réplique.
  if (provider === 'openart' && VIDEO_SCENES && hasShots) {
    const planned = plannedShotKeys(project, episode);
    const flat = [];
    scenes.forEach((scene, si) => {
      for (const shot of sceneShots(scene)) {
        if (planned.has(shotKey(si, shot))) {
          flat.push({ scene, shot });
        }
      }
    });
    for (let k = 0; k < flat.length; k++) {
      const { scene, shot } = flat[k];
      if (shot.video || shot.videoDisabled || !shot.image) {
        continue;
      }
      const line = shot.lineIndex != null ? (scene.lines || [])[shot.lineIndex] : null;
      const spoken = Boolean(line && line.speaker !== 'narrator');
      // Modèle « avatar » : le plan parlé est généré directement image + voix
      // par la synchro — pas de clip OpenArt à payer.
      const talking = spoken && isTalkingModel();
      if (!talking) {
        update(
          `Épisode ${episode.number} — clip du plan ${k + 1}/${flat.length} (plusieurs minutes)…`,
          k / flat.length,
        );
        try {
          await generateShotVideo(project, episode, scene, shot);
        } catch (e) {
          console.error(`Clip plan ${scene.id}#${shot.idx} :`, e.message);
          shot.videoError = e.message;
          saveProject(project);
        }
      }
      // Lèvres calées sur LA réplique du plan (un seul parleur par
      // construction — plus besoin de la piste voix mixée de la scène).
      if (spoken && (shot.video || talking) && !shot.lipsynced) {
        update(
          `Épisode ${episode.number} — synchro labiale du plan ${k + 1}/${flat.length}…`,
          k / flat.length,
        );
        try {
          await lipsyncShot(project, episode, scene, shot, () => {});
        } catch (e) {
          console.error(`Synchro plan ${scene.id}#${shot.idx} :`, e.message);
          shot.lipsyncError = e.message;
          saveProject(project);
        }
      }
    }
  } else if (provider === 'openart' && VIDEO_SCENES) {
    // Recette : les plans animés sont ceux que Claude a marqués (vapeur, sauce
    // qui mijote, plat qu'on sert), pas une répartition par position.
    const wanted =
      project.mode === 'recette'
        ? scenes
            .map((sc, i) => (sc.clip ? i : -1))
            .filter((i) => i >= 0)
            .slice(0, plannedVideoCount(project, scenes.length))
        : plannedVideoIndexes(project, scenes.length);
    for (let k = 0; k < wanted.length; k++) {
      const scene = scenes[wanted[k]];
      if (scene.video || scene.videoDisabled || !scene.image) {
        continue;
      }
      // Modèle « avatar » (OmniHuman) : les scènes parlées sont générées
      // directement image + voix par la synchro — pas de clip OpenArt à payer.
      const talking = wantsLipsync(project) && lipsyncSpeaker(scene) && isTalkingModel();
      if (!talking) {
        update(
          `Épisode ${episode.number} — vidéo ${k + 1}/${wanted.length} (scène ${wanted[k] + 1}, plusieurs minutes)…`,
          k / wanted.length,
        );
        try {
          await generateSceneVideo(project, episode, scene, () => {});
        } catch (e) {
          console.error(`Vidéo scène ${scene.id} :`, e.message);
          scene.videoError = e.message;
          saveProject(project);
        }
      }
      // Lèvres animées sur la voix, dans la foulée — seulement quand un
      // personnage parle (narrateur seul = bouches fermées, rien à caler).
      if (wantsLipsync(project) && lipsyncSpeaker(scene) && (scene.video || talking) && !scene.lipsynced) {
        update(
          `Épisode ${episode.number} — synchro labiale ${k + 1}/${wanted.length} (scène ${wanted[k] + 1})…`,
          k / wanted.length,
        );
        try {
          await lipsyncSceneVideo(project, episode, scene, () => {});
        } catch (e) {
          console.error(`Synchro scène ${scene.id} :`, e.message);
          scene.lipsyncError = e.message;
          saveProject(project);
        }
      }
    }
  }

  episode.status = 'ready';
  saveProject(project);
}

// Prompt de mouvement pour l'image-to-video : on anime l'image existante,
// gestes naturels et caméra discrète, sans changer visages ni décor.
// IMPORTANT : bouches immobiles — la voix off n'est pas synchronisée,
// des lèvres qui bougent au hasard casseraient l'illusion.
function videoMotionPrompt(scene) {
  return (
    `Bring this scene to life with subtle, realistic motion: characters breathe, ` +
    `blink and make small natural gestures; gentle slow cinematic camera push-in. ` +
    `CRITICAL: nobody speaks — mouths stay CLOSED and still, absolutely NO lip ` +
    `movement or talking (the voice-over is added separately and is not lip-synced). ` +
    `Faces, clothing and background stay EXACTLY as in the source image. ` +
    `Scene: ${scene.imagePrompt}`
  );
}

// Prompt de mouvement d'un PLAN : le mouvement décidé au storyboard +
// l'ambiance — sans redescription du décor (l'image source le porte déjà).
function shotMotionPrompt(shot) {
  return (
    `Bring this shot to life with subtle, realistic motion: ` +
    `${shot.motionDesc || 'characters breathe, blink and make small natural gestures; gentle slow camera push-in'}. ` +
    (shot.ambience ? `Ambience: ${shot.ambience}. ` : '') +
    `Vertical 9:16 framing. CRITICAL: nobody speaks — mouths stay CLOSED and still ` +
    `(the voice is added separately). Faces, clothing and background stay EXACTLY as in the source image.`
  );
}

// Génère (ou régénère) le clip vidéo d'un PLAN. Durée générée = la plus
// courte durée supportée par le moteur (5 s, sinon 10 s) qui couvre la
// réplique du plan (+0,5 s) ; le montage coupe ensuite à la durée du plan.
export async function generateShotVideo(project, episode, scene, shot) {
  if (currentProvider() !== 'openart') {
    throw new Error('Les clips vidéo nécessitent IMAGE_PROVIDER=openart dans .env');
  }
  if (!shot.image) {
    throw new Error("Génère d'abord l'image du plan.");
  }
  delete shot.videoDisabled;
  const line = shot.lineIndex != null ? (scene.lines || [])[shot.lineIndex] : null;
  const voiceSec = line && line.audioDurationSec ? line.audioDurationSec + 0.5 : 0;
  const durationSec = voiceSec > 5 ? 10 : 5;
  const { buffer } = await openartGenerateVideo({
    prompt: shotMotionPrompt(shot),
    imageUrl: shot.imageUrl || null,
    referenceUrls: shot.imageUrl ? [] : shotReferenceUrls(project, shot),
    durationSec,
  });
  shot.videoVersion = (shot.videoVersion || 0) + 1;
  const file = `e${episode.number}_${scene.id}_p${shot.idx}_vid${shot.videoVersion}.mp4`;
  fs.writeFileSync(path.join(assetsDir(project.id), file), buffer);
  shot.video = file;
  shot.lipsynced = false;
  delete shot.videoError;
  countVideo(project);
  if (episode.status === 'done') {
    episode.status = 'ready';
  }
  saveProject(project);
  return file;
}

// Recette : le mouvement d'un plan culinaire — vapeur, sauce qui mijote,
// geste de la main. Aucun visage, aucune bouche qui parle.
function recipeMotionPrompt(scene) {
  return (
    `Bring this food shot to life with subtle, appetising motion: rising steam, ` +
    `simmering sauce, slow stirring or pouring, gentle cinematic camera push-in. ` +
    `Hands may move naturally but NO FACE is ever visible and nobody speaks. ` +
    `Food, cookware, colours and background stay EXACTLY as in the source image. ` +
    `Shot: ${scene.imagePrompt}`
  );
}

// Génère (ou régénère) le clip vidéo d'une scène via OpenArt.
export async function generateSceneVideo(project, episode, scene, update) {
  if (currentProvider() !== 'openart') {
    throw new Error('Les clips vidéo nécessitent IMAGE_PROVIDER=openart dans .env');
  }
  delete scene.videoDisabled;
  update('Génération du clip vidéo par OpenArt (plusieurs minutes)…');
  // Mode éco : durée minimale facturée (5 s), le clip gèle ensuite sur sa
  // dernière image. Format long : « Adaptée » par défaut — le clip couvre la
  // scène (5-10 s), l'image ne se fige plus pendant que la voix continue.
  const effSeconds = project.videoSeconds || (project.mode === 'long' ? 'auto' : 'eco');
  const durationSec =
    effSeconds === 'auto' ? Math.max(5, Math.min(10, Math.round(scene.durationSec || 6))) : 5;
  const { buffer } = await openartGenerateVideo({
    prompt: project.mode === 'recette' ? recipeMotionPrompt(scene) : videoMotionPrompt(scene),
    imageUrl: scene.imageUrl || null,
    referenceUrls: scene.imageUrl ? [] : sceneReferenceUrls(project, scene),
    durationSec,
  });
  scene.videoVersion = (scene.videoVersion || 0) + 1;
  const file = `e${episode.number}_${scene.id}_vid${scene.videoVersion}.mp4`;
  fs.writeFileSync(path.join(assetsDir(project.id), file), buffer);
  scene.video = file;
  // Nouveau clip = lèvres plus synchronisées.
  scene.lipsynced = false;
  delete scene.videoError;
  countVideo(project);
  if (episode.status === 'done') {
    episode.status = 'ready';
  }
  saveProject(project);
  return file;
}

// Synchro labiale d'un PLAN : les lèvres sont calées sur LA réplique du plan
// (via lineIndex) — un seul parleur par construction. Le clip synchronisé
// remplace le clip muet ; la voix d'origine joue par-dessus au montage.
export async function lipsyncShot(project, episode, scene, shot, update) {
  const line = shot.lineIndex != null ? (scene.lines || [])[shot.lineIndex] : null;
  if (!line || line.speaker === 'narrator') {
    throw new Error("Ce plan n'a pas de réplique de personnage à synchroniser.");
  }
  if (!line.audio) {
    throw new Error("Génère d'abord la voix de la réplique.");
  }
  const talking = isTalkingModel();
  if (!talking && !shot.video) {
    throw new Error("Génère d'abord le clip du plan.");
  }
  if (talking && !shot.image) {
    throw new Error("Génère d'abord l'image du plan.");
  }
  const dir = assetsDir(project.id);
  shot.videoVersion = (shot.videoVersion || 0) + 1;
  const out = `e${episode.number}_${scene.id}_p${shot.idx}_sync${shot.videoVersion}.mp4`;
  if (talking) {
    await makeTalkingClip({
      imagePath: path.join(dir, shot.image),
      imageUrl: shot.imageUrl || null,
      audioPath: path.join(dir, line.audio),
      outPath: path.join(dir, out),
      update,
    });
  } else {
    await lipsyncVideo({
      videoPath: path.join(dir, shot.video),
      audioPath: path.join(dir, line.audio),
      outPath: path.join(dir, out),
      update,
    });
  }
  shot.video = out;
  shot.lipsynced = true;
  delete shot.lipsyncError;
  ensureUsage(project).falLipsyncs = (ensureUsage(project).falLipsyncs || 0) + 1;
  if (episode.status === 'done') {
    episode.status = 'ready';
  }
  saveProject(project);
  return out;
}

// Anime les lèvres du clip sur la piste voix de la scène (fal.ai) — Format
// long et anciens dramas Version Synchro. Le clip synchronisé remplace le
// clip muet ; la voix ElevenLabs d'origine joue par-dessus dans le montage.
export async function lipsyncSceneVideo(project, episode, scene, update) {
  if (!wantsLipsync(project)) {
    throw new Error('La synchro labiale est réservée aux dramas séries (tout vidéo).');
  }
  if (!lipsyncSpeaker(scene)) {
    throw new Error(
      'Synchro réservée aux scènes où UN SEUL personnage parle (gros plan) — ici : narrateur seul, ' +
        'ou plusieurs interlocuteurs (le lip-sync déformerait les visages).',
    );
  }
  const talking = isTalkingModel();
  if (!talking && !scene.video) {
    throw new Error("Génère d'abord le clip vidéo de la scène.");
  }
  if (talking && !scene.image) {
    throw new Error("Génère d'abord l'image de la scène.");
  }
  const dir = assetsDir(project.id);
  update('Préparation de la piste voix de la scène…');
  const track = path.join(dir, `e${episode.number}_${scene.id}_voicetrack.mp3`);
  await buildSceneVoiceTrack(project, scene, track);
  scene.videoVersion = (scene.videoVersion || 0) + 1;
  const out = `e${episode.number}_${scene.id}_sync${scene.videoVersion}.mp4`;
  if (talking) {
    // Modèle « avatar » : la vidéo parlante est générée depuis l'image de la
    // scène + la voix (visage entier cohérent, durée = durée des paroles).
    await makeTalkingClip({
      imagePath: path.join(dir, scene.image),
      imageUrl: scene.imageUrl || null,
      audioPath: track,
      outPath: path.join(dir, out),
      update,
    });
  } else {
    await lipsyncVideo({
      videoPath: path.join(dir, scene.video),
      audioPath: track,
      outPath: path.join(dir, out),
      update,
    });
  }
  fs.rmSync(track, { force: true });
  scene.video = out;
  scene.lipsynced = true;
  delete scene.lipsyncError;
  ensureUsage(project).falLipsyncs = (ensureUsage(project).falLipsyncs || 0) + 1;
  if (episode.status === 'done') {
    episode.status = 'ready';
  }
  saveProject(project);
  return out;
}

// Retire le clip vidéo d'une scène : retour à l'image fixe (Ken Burns).
// videoDisabled empêche la production automatique de le régénérer.
export function removeSceneVideo(project, episode, scene) {
  scene.video = null;
  scene.videoDisabled = true;
  delete scene.videoError;
  if (episode.status === 'done') {
    episode.status = 'ready';
  }
  saveProject(project);
}

function mapCharacters(data) {
  return assignVoices(
    (data.characters || []).map((c, i) => ({
      id: c.id || `perso${i + 1}`,
      name: c.name || `Personnage ${i + 1}`,
      gender: c.gender || 'homme',
      age: c.age || 30,
      role: c.role || '',
      visual: c.visual || '',
      // casting vocal proposé par Claude (validé contre le catalogue)
      elevenVoice: isCatalogVoice(c.voice) ? c.voice : undefined,
      color: SPEAKER_COLORS[i % SPEAKER_COLORS.length],
    })),
  );
}

// Prénoms et contextes des dramas existants — interdits pour la prochaine
// série, afin que chaque histoire change vraiment (noms, pays, univers).
function usedNamesAndPlaces() {
  const names = new Set();
  const places = [];
  try {
    for (const summary of listProjects()) {
      const p = loadProject(summary.id);
      if (!p) {
        continue;
      }
      for (const c of p.characters || []) {
        const first = String(c.name || '').trim().split(/\s+/)[0];
        if (first) {
          names.add(first);
        }
      }
      if (p.setting) {
        places.push(`${p.title} : ${String(p.setting).slice(0, 70)}`);
      }
    }
  } catch {
    // la collecte ne doit jamais bloquer une création
  }
  return { names: [...names].slice(0, 40), places: places.slice(0, 10) };
}

// Garantie : le personnage principal (premier de la liste) porte toujours les
// adjectifs imposés dans sa description — et les prompts de scènes qui la
// recopient mot pour mot sont mis à jour en même temps pour rester cohérents.
function ensureLeadAdjectives(project) {
  const c = (project.characters || [])[0];
  if (!c || !c.visual) {
    return;
  }
  const low = c.visual.toLowerCase();
  const missing = leadAdjectives(c.gender).filter((a) => !low.includes(a));
  if (missing.length === 0) {
    return;
  }
  const oldVisual = c.visual;
  c.visual = `${missing.join(', ')}, ${oldVisual}`;
  for (const ep of project.episodes || []) {
    for (const s of ep.scenes || []) {
      if (s.imagePrompt && s.imagePrompt.includes(oldVisual)) {
        s.imagePrompt = s.imagePrompt.split(oldVisual).join(c.visual);
      }
    }
  }
}

export async function createProject({ styles, theme, mode, episodeCount, episodeSeconds }, update) {
  update('Écriture du scénario par Claude (1 à 3 minutes)…');
  const safeMode = ['synchro', 'long'].includes(mode) ? mode : 'normal';
  const format = seriesFormat({ mode: safeMode, episodeCount, episodeSeconds });
  const data = await askClaudeForJson(
    buildSeriesPrompt(styles, theme, drawVariety(), usedNamesAndPlaces(), format),
  );

  const id = newId();
  createProjectDirs(id);

  const project = {
    id,
    mode: safeMode,
    episodeCount: format.count,
    // Durée d'un épisode (Format long : choisie à la création, 90 s défaut).
    episodeSeconds: format.long ? format.seconds : undefined,
    // Format long : pas de réglage stocké → toutes les scènes en vidéo
    // (plannedVideoCount), lèvres synchronisées. Ajustable dans le drama.
    title: data.title || 'Drama sans titre',
    logline: data.logline || '',
    setting: data.setting || '',
    styles,
    theme: theme || '',
    characters: mapCharacters(data),
    episodeSummaries: (data.episodeSummaries || []).map((s, i) => ({
      number: s.number || i + 1,
      title: s.title || `Épisode ${i + 1}`,
      summary: s.summary || '',
    })),
    hashtags: Array.isArray(data.hashtags) ? data.hashtags.slice(0, 12).map(String) : [],
    trope: data.trope || '',
    secret: data.secret || '',
    antagonist: data.antagonist || '',
    musicFile: null,
    episodes: [],
    createdAt: new Date().toISOString(),
  };
  ensureUsage(project).claudeCalls += 1;

  const ep1raw = data.episode1 || (Array.isArray(data.episodes) ? data.episodes[0] : null);
  if (!ep1raw) {
    throw new Error("Claude n'a pas fourni l'épisode 1.");
  }
  project.episodes.push(normalizeEpisode(ep1raw, 1));
  ensureLeadAdjectives(project);
  // Parcours par étapes : le scénario doit être validé avant toute production.
  project.stage = 'script_review';
  saveProject(project);
  return { projectId: id };
}

// Mode « mon script » : l'auteur fournit son histoire via le formulaire guidé ;
// Claude la structure fidèlement dans le même format que les séries générées.
export async function createCustomProject(answers, update) {
  update("Mise en forme de ton script par Claude (1 à 3 minutes)…");
  const data = await askClaudeForJson(buildCustomSeriesPrompt(answers));

  const id = newId();
  createProjectDirs(id);

  const customMode = ['synchro', 'long'].includes(answers.mode) ? answers.mode : 'normal';
  const customFormat = seriesFormat(answers);
  const project = {
    id,
    mode: customMode,
    episodeCount: customFormat.count,
    episodeSeconds: customFormat.long ? customFormat.seconds : undefined,
    title: answers.title || data.title || 'Drama sans titre',
    logline: data.logline || '',
    setting: answers.setting || data.setting || '',
    styles: answers.styles || [],
    theme: '',
    custom: true,
    // Conservé pour régénérer le scénario et garder les épisodes 2 à 10 fidèles.
    customAnswers: answers,
    source: {
      script: answers.script,
      mustHappen: answers.mustHappen || '',
      fidelity: answers.fidelity || 'fidele',
    },
    characters: mapCharacters(data),
    episodeSummaries: (data.episodeSummaries || []).map((s, i) => ({
      number: s.number || i + 1,
      title: s.title || `Épisode ${i + 1}`,
      summary: s.summary || '',
    })),
    hashtags: Array.isArray(data.hashtags) ? data.hashtags.slice(0, 12).map(String) : [],
    trope: data.trope || '',
    secret: data.secret || '',
    antagonist: data.antagonist || '',
    musicFile: null,
    episodes: [],
    createdAt: new Date().toISOString(),
  };
  ensureUsage(project).claudeCalls += 1;

  const ep1raw = data.episode1 || (Array.isArray(data.episodes) ? data.episodes[0] : null);
  if (!ep1raw) {
    throw new Error("Claude n'a pas fourni l'épisode 1.");
  }
  project.episodes.push(normalizeEpisode(ep1raw, 1));
  ensureLeadAdjectives(project);
  project.stage = 'script_review';
  saveProject(project);
  return { projectId: id };
}

// ---------- Chaînes (vidéos 60-120 s, narrateur seul) ----------

// Crée une chaîne : identité + hashtags + 10 idées de sujets par Claude.
export async function createChannel(info, update) {
  update('Préparation de la chaîne par Claude (moins d\'une minute)…');
  const data = await askClaudeForJson(buildChannelPrompt(info));

  const id = newId();
  createProjectDirs(id);
  const project = {
    id,
    mode: 'chaine',
    title: info.title,
    logline: info.themeDesc || '',
    setting: '',
    genre: info.genre || '',
    themeDesc: info.themeDesc || '',
    visualStyle: info.visualStyle || 'photorealiste',
    targetSeconds: info.targetSeconds || 90,
    narratorVoice: isCatalogVoice(info.narratorVoice) ? info.narratorVoice : undefined,
    videoScenes: 1,
    styles: [],
    theme: '',
    characters: [],
    episodeSummaries: [],
    episodeCount: 0,
    hashtags: Array.isArray(data.hashtags) ? data.hashtags.slice(0, 12).map(String) : [],
    topicIdeas: Array.isArray(data.topics) ? data.topics.slice(0, 15).map(String) : [],
    musicFile: null,
    episodes: [],
    stage: 'production',
    createdAt: new Date().toISOString(),
  };
  ensureUsage(project).claudeCalls += 1;
  saveProject(project);
  return { projectId: id };
}

// ---------- Publicités d'applis ----------
// Une « pub » est techniquement une chaîne (mode 'chaine') marquée kind:'pub' :
// elle réutilise toute la mécanique des vidéos courtes à narrateur unique,
// avec ses propres prompts et ses captures d'écran d'appli.
export async function createAdProject(info, update) {
  update("Préparation de la campagne par Claude (moins d'une minute)…");
  const data = await askClaudeForJson(buildAdPrompt(info));

  const id = newId();
  createProjectDirs(id);
  const project = {
    id,
    mode: 'chaine',
    kind: 'pub',
    title: info.title,
    logline: info.pitch || '',
    setting: '',
    pitch: info.pitch || '',
    audience: info.audience || '',
    features: info.features || '',
    platform: info.platform || '',
    tone: info.tone || 'probleme',
    cta: info.cta || `Télécharge ${info.title}`,
    storeUrl: info.storeUrl || '',
    visualStyle: info.visualStyle || 'photorealiste',
    targetSeconds: info.targetSeconds || 30,
    narratorVoice: isCatalogVoice(info.narratorVoice) ? info.narratorVoice : undefined,
    videoScenes: 1,
    screenshots: [],
    styles: [],
    theme: '',
    characters: [],
    episodeSummaries: [],
    episodeCount: 0,
    hashtags: Array.isArray(data.hashtags) ? data.hashtags.slice(0, 12).map(String) : [],
    topicIdeas: Array.isArray(data.topics) ? data.topics.slice(0, 15).map(String) : [],
    musicFile: null,
    episodes: [],
    stage: 'production',
    createdAt: new Date().toISOString(),
  };
  ensureUsage(project).claudeCalls += 1;
  saveProject(project);
  return { projectId: id };
}

// Capture d'écran de l'appli : elle est insérée TELLE QUELLE dans les pubs
// (aucune génération d'image, donc aucun crédit).
export function saveScreenshot(project, base64Data, label) {
  const m = String(base64Data || '').match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/);
  if (!m) {
    throw new Error('Format attendu : capture PNG, JPEG ou WEBP.');
  }
  const ext = m[1] === 'png' ? 'png' : m[1] === 'webp' ? 'webp' : 'jpg';
  const list = project.screenshots || (project.screenshots = []);
  const file = `screenshot_${list.length + 1}_${Date.now().toString(36)}.${ext}`;
  fs.writeFileSync(path.join(assetsDir(project.id), file), Buffer.from(m[2], 'base64'));
  list.push({ file, label: String(label || '').slice(0, 80) });
  saveProject(project);
  return file;
}

export function removeScreenshot(project, index) {
  const list = project.screenshots || [];
  const s = list[index];
  if (!s) {
    throw new Error('Capture introuvable');
  }
  fs.rmSync(path.join(assetsDir(project.id), s.file), { force: true });
  list.splice(index, 1);
  saveProject(project);
}

// ---------- Recettes ----------
// Un projet « recette » est un atelier de cuisine : une identité fixe (voix du
// narrateur, style d'images, musique), dans lequel on enchaîne les vidéos —
// une par recette importée du site.
export async function createRecipeProject(info) {
  const id = newId();
  createProjectDirs(id);
  const project = {
    id,
    mode: 'recette',
    title: info.title,
    logline: info.themeDesc || 'Recettes africaines pas à pas',
    setting: '',
    themeDesc: info.themeDesc || '',
    siteUrl: info.siteUrl || '',
    visualStyle: 'photorealiste',
    targetSeconds: RECIPE_SECONDS.includes(info.targetSeconds) ? info.targetSeconds : 60,
    tone: info.tone || 'chaleureux',
    narratorVoice: isCatalogVoice(info.narratorVoice) ? info.narratorVoice : undefined,
    videoScenes: 3,
    styles: [],
    theme: '',
    characters: [],
    episodeSummaries: [],
    episodeCount: 0,
    hashtags: [],
    topicIdeas: [],
    musicFile: null,
    episodes: [],
    stage: 'production',
    createdAt: new Date().toISOString(),
  };
  saveProject(project);
  return { projectId: id };
}

// Écrit la vidéo d'une recette : l'auteur COLLE son texte (ou importe une
// fiche du site), Claude en extrait la recette et la découpe en gestes.
export async function createRecipeVideo(project, params, update) {
  if (project.mode !== 'recette') {
    throw new Error('Réservé aux projets Recettes.');
  }
  const seconds = RECIPE_SECONDS.includes(params.seconds) ? params.seconds : project.targetSeconds || 60;
  const tone = params.tone || project.tone || 'chaleureux';

  // Deux entrées possibles : le texte collé, ou une fiche du site.
  let texte = String(params.text || '').trim();
  let fiche = null;
  if (!texte && params.url) {
    update('Import de la fiche recette…');
    fiche = await fetchRecipe(params.url);
    texte = [
      fiche.name,
      fiche.country ? `Pays : ${fiche.country}` : '',
      fiche.totalText ? `Temps total : ${fiche.totalText}` : '',
      fiche.servings ? `Pour : ${fiche.servings}` : '',
      '',
      'Ingrédients :',
      ...fiche.ingredients.map((i) => `- ${i}`),
      '',
      'Étapes :',
      ...fiche.steps.map((st, i) => `${i + 1}. ${st}`),
    ]
      .filter((l) => l !== null && l !== undefined)
      .join('\n');
  }
  if (texte.length < 40) {
    throw new Error(
      'Colle la recette complète (ingrédients ET étapes) — le texte est trop court pour en faire une vidéo.',
    );
  }

  const number = (project.episodes || []).reduce((m, e) => Math.max(m, e.number), 0) + 1;
  update('Découpage de la recette en gestes par Claude…');
  const raw = await askClaudeForJson(buildRecipePrompt(project, texte, seconds, tone));
  ensureUsage(project).claudeCalls += 1;

  const episode = normalizeEpisode(raw, number);
  // Fiche de la recette : celle que Claude a lue dans le texte, complétée
  // par la fiche du site quand la vidéo vient d'une URL.
  const r = raw.recipe && typeof raw.recipe === 'object' ? raw.recipe : {};
  const recipe = {
    url: params.url || '',
    name: String(r.name || raw.title || 'Recette').slice(0, 120),
    country: String(r.country || (fiche && fiche.country) || '').slice(0, 60),
    totalText: String(r.totalText || (fiche && fiche.totalText) || '').slice(0, 40),
    servings: String(r.servings || (fiche && fiche.servings) || '').slice(0, 40),
    description: (fiche && fiche.description) || '',
    image: (fiche && fiche.image) || '',
    ingredients: Array.isArray(r.ingredients)
      ? r.ingredients.map((x) => String(x).slice(0, 80)).slice(0, 25)
      : (fiche && fiche.ingredients) || [],
    steps: Array.isArray(r.steps)
      ? r.steps.map((x) => String(x).slice(0, 300)).slice(0, 20)
      : (fiche && fiche.steps) || [],
    source: params.url ? 'site' : 'collée',
  };
  episode.title = recipe.name;
  episode.topic = recipe.name;
  episode.cliffhanger = '';
  episode.recipe = recipe;
  episode.hook = String(raw.hook || '').trim().slice(0, 140);
  episode.tone = tone;
  episode.targetSeconds = seconds;
  // Voix off uniquement : aucun personnage à l'image, aucune synchro labiale.
  for (const s of episode.scenes) {
    s.characters = [];
    for (const l of s.lines) {
      l.speaker = 'narrator';
    }
  }
  // Filet de sécurité : la vidéo se termine TOUJOURS sur le plat fini puis
  // l'appel à l'action — même si Claude les a oubliés en fin de liste.
  const povSuffix = (episode.scenes[0] && episode.scenes[0].imagePrompt) || '';
  const style = povSuffix.slice(povSuffix.indexOf('first-person POV')) || '';
  const addScene = (extra) => {
    const id = `s${episode.scenes.length + 1}`;
    episode.scenes.push({
      id,
      location: '',
      screenshot: null,
      badge: null,
      lines: [{ speaker: 'narrator', text: extra.text, audio: null, audioDurationSec: null }],
      characters: [],
      image: null,
      kenBurns: 'zoom-in',
      durationSec: 5,
      version: 0,
      ...extra.fields,
      imagePrompt: `${extra.image} ${style}`.trim(),
    });
  };
  if (!episode.scenes.some((sc) => sc.kind === 'final')) {
    addScene({
      text: `${recipe.name}, prêt à partager.`,
      image: 'Two african hands placing the finished dish, beautifully plated in a traditional bowl, on the worktop, seen from directly above.',
      fields: { kind: 'final', gesture: 'poser le plat fini sur le plan', onScreen: 'Et voilà' },
    });
  }
  if (!episode.scenes.some((sc) => sc.kind === 'cta')) {
    addScene({
      text: 'Recette complète et produits rares sur alohash.fr.',
      image: 'Two african hands sliding the finished dish towards the camera on the worktop, seen from directly above, warm inviting light.',
      fields: { kind: 'cta', gesture: 'présenter le plat à la caméra', onScreen: 'Recette complète sur alohash.fr' },
    });
  }

  // Fiche du site : sa photo peut servir telle quelle au plan du plat fini.
  if (params.useSiteImage !== false && recipe.image) {
    const target = [...episode.scenes].reverse().find((s) => s.kind === 'final') || episode.scenes[0];
    if (target) {
      const ext = (recipe.image.match(/\.(jpe?g|png|webp)(\?|$)/i) || [])[1] || 'jpg';
      const file = `e${number}_${target.id}_site.${ext.toLowerCase().replace('jpeg', 'jpg')}`;
      try {
        update('Récupération de la photo du plat…');
        await downloadRecipeImage(recipe.image, path.join(assetsDir(project.id), file));
        target.image = file;
        target.imageUrl = null;
        target.fromSite = true;
        target.videoDisabled = true;
        delete target.clip;
      } catch (e) {
        console.error('Photo du site :', e.message);
      }
    }
  }
  project.episodes.push(episode);
  project.episodes.sort((a, b) => a.number - b.number);
  project.episodeCount = project.episodes.length;
  saveProject(project);
  return { number };
}

// Garde-fou avant le rendu : aucune allégation de santé dans la narration ni
// dans le texte à l'écran. Bloque et nomme le mot fautif.
export function assertNoHealthClaims(episode) {
  for (const [i, scene] of (episode.scenes || []).entries()) {
    const pieces = [
      ...(scene.lines || []).map((l) => ({ where: 'la narration', text: l.text })),
      { where: "le texte à l'écran", text: scene.onScreen || '' },
      ...(scene.ingredients || []).map((x) => ({ where: 'la liste des ingrédients', text: x })),
    ];
    for (const piece of pieces) {
      const found = findHealthClaims(piece.text);
      if (found.length > 0) {
        throw new Error(
          `Allégation de santé interdite dans ${piece.where} du plan ${i + 1} : « ${found.join(', ')} ». ` +
            `Corrige le texte (on parle de goût, de texture et de tradition — jamais d'effets sur la santé), puis relance le rendu.`,
        );
      }
    }
  }
}

// Écrit le script d'une nouvelle vidéo de la chaîne sur un sujet donné.
export async function createChannelVideo(project, topic, update) {
  if (project.mode !== 'chaine') {
    throw new Error('Réservé aux chaînes.');
  }
  const number = (project.episodes || []).reduce((m, e) => Math.max(m, e.number), 0) + 1;
  update(`Écriture du script « ${topic.slice(0, 60)} » par Claude…`);
  const raw = await askClaudeForJson(
    project.kind === 'pub'
      ? buildAdVideoPrompt(project, topic, number)
      : buildChannelVideoPrompt(project, topic, number),
  );
  ensureUsage(project).claudeCalls += 1;
  const episode = normalizeEpisode(raw, number);
  // Voix off uniquement : le narrateur porte toutes les répliques.
  for (const s of episode.scenes) {
    for (const l of s.lines) {
      l.speaker = 'narrator';
    }
  }
  if (project.kind === 'pub') {
    // Figures de la pub : elles rejoignent le casting du projet et reçoivent
    // un portrait de référence (comme les personnages de drama) — c'est ce
    // qui garde le même visage d'un plan à l'autre et d'une pub à l'autre.
    const cast = project.characters || (project.characters = []);
    for (const f of Array.isArray(raw.figures) ? raw.figures.slice(0, 4) : []) {
      const id = String(f?.id || '').trim();
      if (!id || !f.visual || cast.find((c) => c.id === id)) {
        continue;
      }
      cast.push({
        id,
        name: String(f.name || id).slice(0, 60),
        gender: 'homme',
        age: 40,
        role: 'figure de pub',
        visual: String(f.visual),
        color: SPEAKER_COLORS[cast.length % SPEAKER_COLORS.length],
      });
    }
    const ids = new Set(cast.map((c) => c.id));
    for (const s of episode.scenes) {
      s.characters = (s.characters || []).filter((id) => ids.has(id));
    }
  } else {
    // Chaîne : aucun personnage à l'image.
    for (const s of episode.scenes) {
      s.characters = [];
    }
  }
  // Pub : une scène qui désigne une capture d'écran l'utilise TELLE QUELLE
  // (aucune génération d'image, donc aucun crédit) et n'est jamais animée.
  if (project.kind === 'pub') {
    const shots = project.screenshots || [];
    for (const s of episode.scenes) {
      const n = s.screenshot;
      if (Number.isInteger(n) && n >= 1 && n <= shots.length) {
        s.image = shots[n - 1].file;
        s.imageUrl = null;
        s.imagePrompt = '';
        s.videoDisabled = true;
      } else {
        s.screenshot = null;
      }
    }
  }
  episode.topic = topic;
  episode.cliffhanger = '';
  project.episodes.push(episode);
  project.episodes.sort((a, b) => a.number - b.number);
  project.episodeCount = project.episodes.length;
  // Le sujet consommé sort de la liste d'idées.
  project.topicIdeas = (project.topicIdeas || []).filter((t) => t !== topic);
  saveProject(project);
  return { number };
}

// 10 nouvelles idées de sujets pour la chaîne.
export async function suggestTopics(project, update) {
  update('Recherche de nouveaux sujets par Claude…');
  const data = await askClaudeForJson(buildTopicsPrompt(project));
  ensureUsage(project).claudeCalls += 1;
  const fresh = Array.isArray(data.topics) ? data.topics.slice(0, 10).map(String) : [];
  project.topicIdeas = [...fresh, ...(project.topicIdeas || [])].slice(0, 20);
  saveProject(project);
  return { topics: fresh };
}

// Réécrit entièrement la série (mêmes styles/thème — ou même script source
// pour un drama en mode « mon script ») tant que le scénario n'est pas validé.
export async function regenerateScript(project, update) {
  update('Nouvelle écriture du scénario par Claude (1 à 3 minutes)…');
  // Nouveau tirage au sort à chaque régénération : autre pays, autre univers,
  // autres noms (ceux du brouillon actuel sont inclus dans les interdits).
  const data = await askClaudeForJson(
    project.customAnswers
      ? buildCustomSeriesPrompt(project.customAnswers)
      : buildSeriesPrompt(
          project.styles,
          project.theme,
          drawVariety(),
          usedNamesAndPlaces(),
          formatFor(project),
        ),
  );
  ensureUsage(project).claudeCalls += 1;
  project.title = (project.customAnswers && project.customAnswers.title) || data.title || project.title;
  project.logline = data.logline || '';
  project.setting = (project.customAnswers && project.customAnswers.setting) || data.setting || '';
  project.characters = mapCharacters(data);
  project.episodeSummaries = (data.episodeSummaries || []).map((s, i) => ({
    number: s.number || i + 1,
    title: s.title || `Épisode ${i + 1}`,
    summary: s.summary || '',
  }));
  project.hashtags = Array.isArray(data.hashtags) ? data.hashtags.slice(0, 12).map(String) : [];
  project.trope = data.trope || '';
  project.secret = data.secret || '';
  project.antagonist = data.antagonist || '';
  const ep1raw = data.episode1 || (Array.isArray(data.episodes) ? data.episodes[0] : null);
  if (!ep1raw) {
    throw new Error("Claude n'a pas fourni l'épisode 1.");
  }
  project.episodes = [normalizeEpisode(ep1raw, 1)];
  ensureLeadAdjectives(project);
  project.stage = 'script_review';
  saveProject(project);
}

// Produit les épisodes restants dans l'ordre : scénario + images + voix +
// rendu MP4 pour chacun. `count` limite la fournée (« les 5 prochains ») ;
// sans limite, c'est toute la saison. Long (souvent > 1 h avec OpenArt) —
// la progression est détaillée épisode par épisode et l'interface peut
// raccrocher en cours de route.
export async function produceSeason(project, update, count) {
  const total = project.episodeCount || EPISODE_COUNT;
  const remaining = [];
  for (let n = 1; n <= total; n++) {
    const existing = findEpisode(project, n);
    if (!(existing && existing.status === 'done' && existing.renderedFile)) {
      remaining.push(n);
    }
  }
  const todo = Number.isInteger(count) && count > 0 ? remaining.slice(0, count) : remaining;
  if (todo.length === 0) {
    return { episodes: 0 };
  }
  let doneCount = 0;
  const failures = [];
  for (let k = 0; k < todo.length; k++) {
    const n = todo[k];
    const prefix = `Épisode ${n} (${k + 1}/${todo.length}) — `;
    try {
      await produceEpisode(project, n, (step, p) =>
        update(prefix + step, (k + (p || 0) * 0.7) / todo.length),
      );
      const ep = findEpisode(project, n);
      await renderEpisode(project, ep, (step, p) =>
        update(prefix + step, (k + 0.7 + (p || 0) * 0.3) / todo.length),
      );
      doneCount++;
    } catch (e) {
      console.error(`Production — épisode ${n} :`, e.message);
      failures.push(`épisode ${n} (${e.message.slice(0, 120)})`);
    }
  }
  if (failures.length > 0) {
    throw new Error(
      `${doneCount}/${todo.length} épisodes produits. En échec : ${failures.join(' ; ')}`,
    );
  }
  return { episodes: doneCount };
}

// Écrit le scénario de l'épisode s'il n'existe pas encore — SEULEMENT le
// texte (aucune image, voix ni vidéo). Utilisé par la production classique
// et par le Kit Director, qui n'a besoin que du scénario et des portraits.
export async function ensureEpisodeScript(project, number, update) {
  let episode = findEpisode(project, number);
  if (episode) {
    return episode;
  }
  if (project.mode === 'chaine') {
    throw new Error('Crée d\'abord la vidéo avec « ➕ Nouvelle vidéo » (il faut son sujet).');
  }
  update(`Écriture du scénario de l'épisode ${number} par Claude…`);
  const raw = await askClaudeForJson(buildEpisodePrompt(project, number));
  ensureUsage(project).claudeCalls += 1;
  episode = normalizeEpisode(raw, number);
  project.episodes.push(episode);
  project.episodes.sort((a, b) => a.number - b.number);
  saveProject(project);
  return episode;
}

export async function produceEpisode(project, number, update) {
  const episode = await ensureEpisodeScript(project, number, update);
  await generateEpisodeAssets(project, episode, update);
  return { number };
}

// « Réparer » : relance UNIQUEMENT ce qui a échoué ou manque dans l'épisode —
// images ratées, voix en erreur, et clips vidéo prévus mais absents (une
// scène qui aurait dû être une vidéo est régénérée aussi). Ne touche pas
// à ce qui est déjà bon : aucune re-consommation inutile de crédits.
export async function retryFailedAssets(project, episode, update) {
  const dir = assetsDir(project.id);
  const provider = currentProvider();
  const scenes = episode.scenes || [];
  const failures = [];

  await ensureCharacterPortraits(project, update);

  // 1. Images manquantes ou en erreur
  if (provider !== 'manual') {
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      if (scene.image && !scene.imageError) {
        continue;
      }
      update(`Image de la scène ${i + 1}…`);
      scene.version += 1;
      const file = `e${episode.number}_${scene.id}_v${scene.version}.jpg`;
      try {
        const { ok, url, provider: used } = await generateImage(
          scene.imagePrompt,
          path.join(dir, file),
          { referenceUrls: sceneReferenceUrls(project, scene) },
        );
        if (ok) {
          scene.image = file;
          scene.imageUrl = url || null;
          scene.video = null;
          countImage(project, used);
          delete scene.imageError;
        }
      } catch (e) {
        scene.imageError = e.message;
        failures.push(`image scène ${i + 1}`);
      }
      saveProject(project);
    }
  }

  // 2. Voix manquantes ou en erreur
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    let touched = false;
    for (let j = 0; j < scene.lines.length; j++) {
      const line = scene.lines[j];
      if (line.audio && !line.audioError) {
        continue;
      }
      update(`Voix de la scène ${i + 1}…`);
      scene.version += 1;
      const base = `e${episode.number}_${scene.id}_l${j}_v${scene.version}`;
      try {
        const result = await synthesize({
          text: line.text,
          ...voiceFor(project, line.speaker),
          outBase: path.join(dir, base),
        });
        line.audio = path.basename(result.file);
        line.audioDurationSec = result.durationSec;
        line.audioEngine = result.engine;
        countVoice(project, result);
        delete line.audioError;
        touched = true;
      } catch (e) {
        line.audioError = e.message;
        failures.push(`voix scène ${i + 1}`);
      }
    }
    if (touched) {
      recomputeSceneDuration(scene);
      if (wantsLipsync(project) && scene.video && scene.lipsynced) {
        scene.lipsynced = false;
      }
      saveProject(project);
    }
  }

  // 3. Clips vidéo prévus mais absents, ou en erreur (les scènes parlées en
  // mode « avatar » n'ont pas de clip OpenArt : leur vidéo vient de l'étape 4)
  if (provider === 'openart' && VIDEO_SCENES) {
    const wanted = plannedVideoIndexes(project, scenes.length);
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const expected = wanted.includes(i) || Boolean(scene.videoError);
      if (!expected || scene.videoDisabled || !scene.image) {
        continue;
      }
      if (wantsLipsync(project) && lipsyncSpeaker(scene) && isTalkingModel()) {
        continue;
      }
      if (scene.video && !scene.videoError) {
        continue;
      }
      update(`Clip vidéo de la scène ${i + 1} (plusieurs minutes)…`);
      try {
        await generateSceneVideo(project, episode, scene, () => {});
      } catch (e) {
        scene.videoError = e.message;
        failures.push(`vidéo scène ${i + 1}`);
        saveProject(project);
      }
    }
  }

  // 4. Synchros labiales manquantes ou en erreur (clips tout juste générés
  // inclus : generateSceneVideo remet lipsynced à false).
  if (wantsLipsync(project)) {
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const ready = isTalkingModel() ? Boolean(scene.image) : Boolean(scene.video);
      if (!ready || scene.videoDisabled || !lipsyncSpeaker(scene) || scene.lipsynced) {
        continue;
      }
      update(`Synchro labiale de la scène ${i + 1}…`);
      try {
        await lipsyncSceneVideo(project, episode, scene, () => {});
      } catch (e) {
        scene.lipsyncError = e.message;
        failures.push(`synchro scène ${i + 1}`);
        saveProject(project);
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(`Encore en échec : ${failures.join(', ')}. Le reste a été réparé.`);
  }
}

export async function regenerateAllImages(project, episode, update) {
  const dir = assetsDir(project.id);
  const scenes = episode.scenes || [];
  const failures = [];
  await ensureCharacterPortraits(project, update);
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    update(`Image ${i + 1}/${scenes.length}…`, i / scenes.length);
    scene.version += 1;
    const file = `e${episode.number}_${scene.id}_v${scene.version}.jpg`;
    try {
      const { ok, url, provider } = await generateImage(scene.imagePrompt, path.join(dir, file), {
        referenceUrls: sceneReferenceUrls(project, scene),
      });
      if (ok) {
        scene.image = file;
        scene.imageUrl = url || null;
        // La vidéo animait l'ancienne image : elle ne correspond plus.
        scene.video = null;
        countImage(project, provider);
        delete scene.imageError;
      }
    } catch (e) {
      scene.imageError = e.message;
      failures.push(`scène ${i + 1}`);
    }
    saveProject(project);
  }
  if (failures.length > 0) {
    throw new Error(`Images en échec : ${failures.join(', ')}. Les autres ont été régénérées.`);
  }
}

export async function regenerateSceneImage(project, episode, scene, update) {
  update('Génération de la nouvelle image…');
  await ensureCharacterPortraits(project, update);
  scene.version += 1;
  const file = `e${episode.number}_${scene.id}_v${scene.version}.jpg`;
  const { ok, url, provider } = await generateImage(
    scene.imagePrompt,
    path.join(assetsDir(project.id), file),
    { referenceUrls: sceneReferenceUrls(project, scene) },
  );
  if (ok) {
    scene.image = file;
    scene.imageUrl = url || null;
    scene.video = null;
    countImage(project, provider);
    delete scene.imageError;
  }
  saveProject(project);
}

// « Nouveau visage » : Claude réécrit la description physique (guidée par les
// instructions éventuelles), les prompts d'images existants sont mis à jour,
// puis le portrait de référence est régénéré.
export async function newCharacterFace(project, characterId, instructions, update) {
  const c = (project.characters || []).find((x) => x.id === characterId);
  if (!c) {
    throw new Error('Personnage introuvable');
  }
  const isLead = (project.characters || [])[0] === c;
  update(`Réécriture de ${c.name} par Claude…`);
  const data = await askClaudeForJson(
    buildNewFacePrompt(c, (instructions || '').slice(0, 300), isLead),
  );
  ensureUsage(project).claudeCalls += 1;
  let newVisual = String(data.visual || '').trim();
  if (!newVisual) {
    throw new Error("Claude n'a pas fourni de nouvelle description.");
  }
  // Le personnage principal garde toujours ses adjectifs imposés.
  if (isLead) {
    const low = newVisual.toLowerCase();
    const missing = leadAdjectives(c.gender).filter((a) => !low.includes(a));
    if (missing.length > 0) {
      newVisual = `${missing.join(', ')}, ${newVisual}`;
    }
  }
  const oldVisual = c.visual;
  c.visual = newVisual;
  // Les prompts de scènes recopient la description mot pour mot → remplacement direct.
  if (oldVisual) {
    for (const ep of project.episodes || []) {
      for (const s of ep.scenes || []) {
        if (s.imagePrompt && s.imagePrompt.includes(oldVisual)) {
          s.imagePrompt = s.imagePrompt.split(oldVisual).join(newVisual);
        }
      }
    }
  }
  c.portrait = null;
  c.portraitUrl = null;
  saveProject(project);
  await ensureCharacterPortraits(project, update);
}

// Extrait audio de pré-écoute d'une voix pour un personnage ou le narrateur
// (réplique réelle si possible).
export async function characterVoicePreview(project, characterId, elevenVoiceOverride) {
  const c = (project.characters || []).find((x) => x.id === characterId);
  if (!c && characterId !== 'narrator') {
    throw new Error('Personnage introuvable');
  }
  let line = null;
  for (const ep of project.episodes || []) {
    for (const s of ep.scenes || []) {
      const found = (s.lines || []).find((l) => l.speaker === characterId);
      if (found) {
        line = found.text;
        break;
      }
    }
    if (line) break;
  }
  const text =
    line ||
    (c ? `Je m'appelle ${c.name}. ${c.role}.` : `${project.title}. L'histoire commence ce soir.`);
  const v = voiceFor(project, characterId);
  const base = path.join(assetsDir(project.id), `preview_${characterId}_${Date.now()}`);
  const result = await synthesize({
    text,
    ...v,
    elevenVoice: elevenVoiceOverride || v.elevenVoice,
    outBase: base,
  });
  countVoice(project, result);
  saveProject(project);
  return path.basename(result.file);
}

// Refait le portrait de référence d'un personnage (les scènes suivantes l'utiliseront).
export async function regenerateCharacterPortrait(project, characterId, update) {
  const c = (project.characters || []).find((x) => x.id === characterId);
  if (!c) {
    throw new Error('Personnage introuvable');
  }
  c.portrait = null;
  c.portraitUrl = null;
  const before = currentProvider();
  if (before !== 'openart') {
    throw new Error("Les portraits de référence nécessitent IMAGE_PROVIDER=openart dans .env");
  }
  await ensureCharacterPortraits(project, update);
  if (!c.portrait) {
    throw new Error('Le portrait n\'a pas pu être généré.');
  }
}

export async function regenerateSceneAudio(project, episode, scene, update) {
  scene.version += 1;
  for (let j = 0; j < scene.lines.length; j++) {
    const line = scene.lines[j];
    update(`Voix ${j + 1}/${scene.lines.length}…`);
    const base = `e${episode.number}_${scene.id}_l${j}_v${scene.version}`;
    const result = await synthesize({
      text: line.text,
      ...voiceFor(project, line.speaker),
      outBase: path.join(assetsDir(project.id), base),
    });
    line.audio = path.basename(result.file);
    line.audioDurationSec = result.durationSec;
    line.audioEngine = result.engine;
    line.audioFallback =
      Boolean(process.env.ELEVENLABS_API_KEY) && result.engine !== 'elevenlabs'
        ? true
        : undefined;
    countVoice(project, result);
    delete line.audioError;
  }
  recomputeSceneDuration(scene);
  // Voix refaites → les lèvres du clip synchronisé ne correspondent plus.
  if (wantsLipsync(project) && scene.video && scene.lipsynced) {
    scene.lipsynced = false;
  }
  saveProject(project);
}

// Refait toutes les voix de l'épisode (après un changement de méthode ou des échecs).
export async function regenerateAllAudio(project, episode, update) {
  const scenes = episode.scenes || [];
  const failures = [];
  for (let i = 0; i < scenes.length; i++) {
    update(`Voix scène ${i + 1}/${scenes.length}…`, i / scenes.length);
    try {
      await regenerateSceneAudio(project, episode, scenes[i], () => {});
    } catch (e) {
      scenes[i].lines.forEach((l) => {
        if (!l.audio) {
          l.audioError = e.message;
        }
      });
      failures.push(`scène ${i + 1}`);
      saveProject(project);
    }
  }
  if (failures.length > 0) {
    throw new Error(`Voix en échec : ${failures.join(', ')}. Les autres ont été régénérées.`);
  }
}

export function saveUploadedImage(project, episode, scene, base64Data) {
  const m = base64Data.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/);
  if (!m) {
    throw new Error('Format attendu : data URL image/png, image/jpeg ou image/webp.');
  }
  const ext = m[1] === 'png' ? 'png' : m[1] === 'webp' ? 'webp' : 'jpg';
  scene.version += 1;
  const file = `e${episode.number}_${scene.id}_v${scene.version}.${ext}`;
  fs.writeFileSync(path.join(assetsDir(project.id), file), Buffer.from(m[2], 'base64'));
  scene.image = file;
  // Image importée à la main : pas d'URL distante, et l'ancienne vidéo ne correspond plus.
  scene.imageUrl = null;
  scene.video = null;
  delete scene.imageError;
  saveProject(project);
  return file;
}

export function saveUploadedMusic(project, base64Data) {
  const m = base64Data.match(/^data:audio\/(mpeg|mp3|wav|x-wav|m4a|mp4|aac);base64,(.+)$/);
  if (!m) {
    throw new Error('Format attendu : fichier audio MP3, WAV ou M4A.');
  }
  const ext = m[1].includes('wav') ? 'wav' : m[1] === 'm4a' || m[1] === 'mp4' || m[1] === 'aac' ? 'm4a' : 'mp3';
  const file = `music_${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(assetsDir(project.id), file), Buffer.from(m[2], 'base64'));
  project.musicFile = file;
  saveProject(project);
  return file;
}
