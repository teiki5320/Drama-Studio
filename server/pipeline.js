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
  buildKeurCookAdPrompt,
  buildKeurDecoAdPrompt,
  buildKeurbookAdPrompt,
  buildOptiledAdPrompt,
  buildEreaAdPrompt,
  buildKultivaAdPrompt,
  buildPalabreAdPrompt,
  KITCHEN_REFERENCE_PROMPT,
  RECIPE_IMAGE_STYLE,
  RECIPE_SECONDS,
  findHealthClaims,
  DRAMA_IMAGE_SUFFIX,
} from './claudegen.js';
import { copyRecipeImage, fetchRecipe, manualRecipe, recipeAsText } from './recipes.js';
import { tourAfrique, logoKeurCook } from './keurcook.js';
import { chargeArticles, logoKeurDeco, VUES } from './keurdeco.js';
import { composeMusic, composeSfx } from './music.js';
import { STUDIO_DIR } from './studio.js';
import { chargeLivres, logoKeurbook } from './keurbook.js';
import { chargeCultures, optiledRepo } from './optiled.js';
import { iconeErea, evenementsCelebres, fichiersFrise } from './erea.js';
import { cartesJouables, carteSerment, finsDuJeu, palais, fichiersPalabre, sonDeLaReponse, applique, JAUGES, palabreRepo } from './palabre.js';
import { chargeEspeces, aSemer, tamassi, fondPastel, iconeKultiva, REGIONS, MOIS } from './kultiva.js';
import { applyVoicePreset } from './voicepresets.js';
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

// maxScenes : 12 pour les dramas, chaînes et pubs ; une recette de 90 s
// compte jusqu'à 20 gestes (voir buildRecipePrompt) — les couper ferait
// disparaître la fin de la recette.
function normalizeEpisode(raw, number, maxScenes = 12) {
  const scenes = (raw.scenes || []).slice(0, maxScenes).map((s, i) => {
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
        ? s.ingredients.map((x) => String(x).trim().slice(0, 60)).filter(Boolean).slice(0, 12)
        : undefined,
      clip: s.clip === true ? true : undefined,
      // Pub « chiffres » : un vrai chiffre du site affiché en grand.
      stat:
        s.stat && typeof s.stat === 'object' && s.stat.valeur
          ? { valeur: String(s.stat.valeur).trim().slice(0, 16), label: String(s.stat.label || '').trim().slice(0, 50) }
          : undefined,
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
  // Plan muet (pub d'ambiance) : sa durée est fixée par le script.
  if (!(scene.lines || []).length && scene.fixedDuration) {
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
    k.error = e.message;
  }
  saveProject(project);
  // Sans référence, chaque geste aurait son propre plan de travail et ses
  // propres mains : on s'arrête AVANT de payer des images incohérentes.
  if (!k.image || !k.imageUrl) {
    throw new Error(
      "Le plan de travail de référence n'a pas pu être généré" +
        (k.error ? ` (${k.error})` : '') +
        ". Aucun geste n'a été lancé, pour ne pas payer des images qui ne se ressemblent pas. Relance dans un instant.",
    );
  }
  delete k.error;
}

// Prompt d'image d'une scène. Recette : le style « vue du dessus, mains
// africaines, même plan de travail » est garanti par le serveur — même si
// Claude l'a oublié ou si le prompt a été retouché à la main.
function sceneImagePrompt(project, scene) {
  const prompt = String(scene.imagePrompt || '').trim();
  if (project.mode !== 'recette' || prompt.includes(RECIPE_IMAGE_STYLE)) {
    return prompt;
  }
  return `${prompt.replace(/[\s.,;]+$/, '')}. ${RECIPE_IMAGE_STYLE}`;
}

// Options de génération d'une image de scène : références + leur nature.
function sceneImageOptions(project, scene, episode = null) {
  const modele = scene.memeQue && episode ? (episode.scenes || []).find((s) => s.id === scene.memeQue) : null;
  return {
    referenceUrls: modele && modele.imageUrl ? [modele.imageUrl] : sceneReferenceUrls(project, scene),
    referenceKind: project.mode === 'recette' ? 'kitchen' : 'faces',
  };
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

// Plans à animer en clip. Recette : ceux que Claude a marqués (vapeur, sauce
// qui mijote, plat qu'on sert), pas une répartition par position — la
// production ET la réparation suivent la même règle.
function wantedClipIndexes(project, scenes) {
  // Pub d'ambiance : tous les plans marqués « clip » sont animés.
  if (project.mode !== 'recette' && scenes.some((sc) => sc.clip && sc.fixedDuration)) {
    return scenes.map((sc, i) => (sc.clip ? i : -1)).filter((i) => i >= 0);
  }
  if (project.mode === 'recette') {
    return scenes
      .map((sc, i) => (sc.clip ? i : -1))
      .filter((i) => i >= 0)
      .slice(0, plannedVideoCount(project, scenes.length));
  }
  return plannedVideoIndexes(project, scenes.length);
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
      if (scene.image || dessineeParLeStudio(scene)) {
        continue;
      }
      update(`Épisode ${episode.number} — image ${i + 1}/${scenes.length}…`, i / scenes.length);
      const file = `e${episode.number}_${scene.id}_v${scene.version}.jpg`;
      try {
        const { ok, url, provider } = await generateImage(
          sceneImagePrompt(project, scene),
          path.join(dir, file),
          sceneImageOptions(project, scene, episode),
        );
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
    const wanted = wantedClipIndexes(project, scenes);
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
  // Pub d'ambiance : le mouvement est décrit par le script (rideau, vagues,
  // flamme de bougie, travelling lent) — une pièce sans personne.
  if (scene.motionPrompt) {
    return (
      `Bring this interior scene to life with slow, calm, satisfying motion: ${scene.motionPrompt}. ` +
      `Smooth slow cinematic camera movement, no people, no text. The room and its decor stay EXACTLY as in the source image. ` +
      `Scene: ${scene.imagePrompt}`
    );
  }
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
    effSeconds === 'auto' || scene.fixedDuration
      ? Math.max(5, Math.min(10, Math.round(scene.durationSec || 6)))
      : 5;
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
    // Dépôt GitHub de l'appli (« teiki5320/erea ») : relie la campagne à son
    // bouton dans l'onglet Publicité.
    repo: info.repo || '',
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
// une par recette prise dans Keur Cook.
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
// recette de Keur Cook), Claude en extrait la fiche et la découpe en gestes.
// Vidéo de recette explicative : l'ordre est garanti ici, quoi que Claude ait
// rendu — titre (photo du site), ingrédients, étapes numérotées 1, 2, 3…
// sans doublon, plat fini. Rien après : ni appel à l'action, ni accroche.
function structureRecipeEpisode(episode, recipe) {
  const blank = (kind, text, image, fields = {}) => ({
    id: '',
    location: '',
    screenshot: null,
    badge: null,
    lines: [{ speaker: 'narrator', text, audio: null, audioDurationSec: null }],
    characters: [],
    image: null,
    kenBurns: 'zoom-in',
    durationSec: 5,
    version: 0,
    kind,
    onScreen: '',
    ingredients: [],
    imagePrompt: `${image} ${RECIPE_IMAGE_STYLE}`,
    ...fields,
  });
  const kindOf = (sc) => (sc.kind === 'geste' ? 'etape' : sc.kind === 'hook' ? 'titre' : sc.kind);
  const scenes = (episode.scenes || []).map((sc) => ({ ...sc, kind: kindOf(sc) }));
  const pick = (kind) => scenes.find((sc) => sc.kind === kind);

  const titre =
    pick('titre') ||
    blank(
      'titre',
      [recipe.name, recipe.country ? `plat du ${recipe.country}` : '', recipe.servings ? `Pour ${recipe.servings}.` : '']
        .filter(Boolean)
        .join(', ')
        .replace(/, Pour/, '. Pour'),
      'The finished dish, beautifully plated, seen from directly above on the worktop.',
    );
  const ingredients =
    pick('ingredients') ||
    blank('ingredients', 'Voici les ingrédients.', 'All the raw ingredients neatly laid out on the worktop, seen from directly above.', {
      ingredients: (recipe.ingredients || []).slice(0, 12),
    });
  if (!(ingredients.ingredients || []).length) {
    ingredients.ingredients = (recipe.ingredients || []).slice(0, 12);
  }
  const etapes = scenes.filter((sc) => sc.kind === 'etape');
  etapes.forEach((sc, i) => {
    sc.stepNumber = i + 1;
  });
  const final =
    pick('final') ||
    blank('final', 'Bon appétit !', 'Two african hands placing the finished dish, beautifully plated, on the worktop, seen from directly above.', {
      onScreen: 'Bon appétit',
    });
  titre.onScreen = '';
  episode.scenes = [titre, ingredients, ...etapes, final].map((sc, i) => ({ ...sc, id: `s${i + 1}` }));
  episode.hook = '';
}

export async function createRecipeVideo(project, params, update) {
  if (project.mode !== 'recette') {
    throw new Error('Réservé aux projets Recettes.');
  }
  applyVoicePreset(project);
  const seconds = RECIPE_SECONDS.includes(params.seconds) ? params.seconds : project.targetSeconds || 60;
  const tone = params.tone || project.tone || 'chaleureux';

  // Deux entrées possibles : une recette du dépôt de Keur Cook, ou un texte
  // collé à la main.
  let texte = String(params.text || '').trim();
  let fiche = null;
  if (!texte && params.slug) {
    update('Lecture de la recette dans le dépôt de Keur Cook…');
    fiche = fetchRecipe(params.slug);
    texte = recipeAsText(fiche);
  }
  if (texte.length < 40) {
    throw new Error(
      'Colle la recette complète (ingrédients ET étapes) — le texte est trop court pour en faire une vidéo.',
    );
  }

  const number = (project.episodes || []).reduce((m, e) => Math.max(m, e.number), 0) + 1;
  update('Découpage de la recette en gestes par Claude…');
  const raw = await askClaudeForJson(buildRecipePrompt(project, texte, seconds));
  ensureUsage(project).claudeCalls += 1;

  const episode = normalizeEpisode(raw, number, 20);
  // Fiche de la recette : celle que Claude a lue dans le texte, complétée
  // par la fiche du dépôt quand la vidéo vient de Keur Cook.
  const r = raw.recipe && typeof raw.recipe === 'object' ? raw.recipe : {};
  const recipe = {
    slug: (fiche && fiche.slug) || '',
    url: (fiche && fiche.url) || '',
    name: String(r.name || raw.title || 'Recette').slice(0, 120),
    country: String(r.country || (fiche && fiche.country) || '').slice(0, 60),
    totalText: String(r.totalText || (fiche && fiche.totalText) || '').slice(0, 40),
    servings: String(r.servings || (fiche && fiche.servings) || '').slice(0, 40),
    description: (fiche && fiche.description) || '',
    photo: (fiche && fiche.photo) || '',
    ingredients: Array.isArray(r.ingredients)
      ? r.ingredients.map((x) => String(x).slice(0, 80)).slice(0, 25)
      : (fiche && fiche.ingredients) || [],
    steps: Array.isArray(r.steps)
      ? r.steps.map((x) => String(x).slice(0, 300)).slice(0, 20)
      : (fiche && fiche.steps) || [],
    source: fiche ? 'keurcook' : 'collée',
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
  structureRecipeEpisode(episode, recipe);

  // La photo du plat prise dans le dépôt de Keur Cook ouvre la vidéo (plan
  // titre, zoom lent) : c'est le vrai plat, sans crédit d'image.
  if (params.usePhoto !== false && recipe.photo) {
    const target = episode.scenes[0];
    const file = `e${number}_${target.id}_keurcook.webp`;
    try {
      update('Photo du plat (ouverture)…');
      copyRecipeImage(recipe.photo, path.join(assetsDir(project.id), file));
      target.image = file;
      target.imageUrl = null;
      target.fromSite = true;
      target.videoDisabled = true;
      delete target.clip;
    } catch (e) {
      console.error('Photo de Keur Cook :', e.message);
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
  // Le nom, le pays, la durée et l'accroche s'affichent sur le carton titre
  // et partent dans la légende TikTok (nom du fichier exporté).
  const r = episode.recipe || {};
  const head = [
    { where: 'le nom de la recette', text: r.name || episode.title || '' },
    { where: 'le pays de la recette', text: r.country || '' },
    { where: 'la durée affichée', text: r.totalText || '' },
    { where: "l'accroche (légende TikTok)", text: episode.hook || '' },
    { where: 'le carton final', text: episode.cta || '' },
  ];
  for (const piece of head) {
    const found = findHealthClaims(piece.text);
    if (found.length > 0) {
      throw new Error(
        `Allégation de santé interdite dans ${piece.where} : « ${found.join(', ')} ». ` +
          `Corrige le texte (on parle de goût, de texture et de tradition — jamais d'effets sur la santé), puis relance le rendu.`,
      );
    }
  }
  for (const [i, scene] of (episode.scenes || []).entries()) {
    const pieces = [
      ...(scene.lines || []).map((l) => ({ where: 'la narration', text: l.text })),
      { where: "le texte à l'écran", text: scene.onScreen || '' },
      { where: "l'incrustation", text: scene.badge || '' },
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
// ---------- Pub Keur Cook : « Tour d'Afrique » ----------
// Le pays suivant de la tournée (ou celui demandé), et la fin qui alterne :
// une pub sur deux renvoie vers la recette, l'autre vers l'ingrédient.
export function keurCookAdPlan(project) {
  const tour = tourAfrique();
  const state = project.kcTour || { done: [], count: 0 };
  const next = tour.find((e) => !state.done.includes(e.pays)) || tour[0] || null;
  return {
    next: next && { pays: next.pays, recette: next.recette.name, produit: next.produit.name },
    fin: state.count % 2 === 0 ? 'recette' : 'produit',
    pays: tour.map((e) => ({
      pays: e.pays,
      recette: e.recette.name,
      produit: e.produit.name,
      fait: state.done.includes(e.pays),
    })),
  };
}

export async function createKeurCookAd(project, { pays = '', seconds = 45 } = {}, update) {
  if (project.kind !== 'pub') {
    throw new Error('Réservé à la campagne de pub Keur Cook.');
  }
  applyVoicePreset(project);
  const tour = tourAfrique();
  const state = project.kcTour || (project.kcTour = { done: [], count: 0 });
  const entry =
    tour.find((e) => e.pays === pays) || tour.find((e) => !state.done.includes(e.pays)) || tour[0];
  if (!entry) {
    throw new Error('Aucun pays exploitable dans les recettes de Keur Cook.');
  }
  const fin = state.count % 2 === 0 ? 'recette' : 'produit';
  const secs = 45; // durée fixée (on ne la demande plus)
  const number = (project.episodes || []).reduce((m, e) => Math.max(m, e.number), 0) + 1;

  update(`Script de la pub « ${entry.pays} » par Claude…`);
  const raw = await askClaudeForJson(
    buildKeurCookAdPrompt({ pays: entry.pays, recette: entry.recette, produit: entry.produit, seconds: secs, fin }),
  );
  ensureUsage(project).claudeCalls += 1;
  const episode = normalizeEpisode(raw, number, 14);
  for (const sc of episode.scenes) {
    sc.characters = [];
    for (const l of sc.lines) {
      l.speaker = 'narrator';
    }
  }
  // Les vraies photos du site : le plat, le produit — et le plat encore pour
  // le plan de fin, avant le carton final au logo de Keur Cook.
  const dir = assetsDir(project.id);
  const realPhoto = (sc, src, tag) => {
    if (!src) {
      return;
    }
    const file = `e${number}_${sc.id}_${tag}.webp`;
    copyRecipeImage(src, path.join(dir, file));
    sc.image = file;
    sc.imageUrl = null;
    sc.imagePrompt = '';
    sc.fromSite = true;
    sc.videoDisabled = true;
  };
  for (const sc of episode.scenes) {
    if (sc.kind === 'plat' || sc.kind === 'fin') {
      realPhoto(sc, entry.recette.photo, 'plat');
    } else if (sc.kind === 'produit') {
      realPhoto(sc, entry.produit.photo, 'produit');
    }
  }
  const logo = logoKeurCook();
  if (logo && !project.ctaLogo) {
    project.ctaLogo = 'keurcook-logo.webp';
    copyRecipeImage(logo, path.join(dir, project.ctaLogo));
  }
  episode.topic = `${entry.pays} — ${entry.recette.name} + ${entry.produit.name}`;
  episode.title = raw.title || episode.topic;
  episode.cta = String(
    raw.cta || (fin === 'produit' ? 'Tout sur cet ingrédient sur keurcook.com' : 'La recette pas à pas sur keurcook.com'),
  ).slice(0, 80);
  episode.kcPays = entry.pays;
  episode.cliffhanger = '';
  project.episodes.push(episode);
  project.episodes.sort((a, b) => a.number - b.number);
  project.episodeCount = project.episodes.length;
  if (!state.done.includes(entry.pays)) {
    state.done.push(entry.pays);
  }
  if (state.done.length >= tour.length) {
    state.done = []; // tournée terminée : on repart pour un tour
  }
  state.count += 1;
  saveProject(project);
  return { number };
}

// ---------- Pub Keur Déco : ambiance, visite déco, avant / après ----------
export const KEURDECO_FORMATS = {
  ambiance: '🌅 Ambiance — une pièce face à une vue extraordinaire',
  visite: '🔍 Visite déco — zoom sur chaque objet',
  avant: '✨ Avant / après',
};

const articlesPublies = () => chargeArticles().filter((a) => a.publie);

export function keurDecoAdPlan(project) {
  const articles = articlesPublies();
  const state = project.kdTour || { done: [], count: 0 };
  const next = articles.find((a) => !state.done.includes(a.slug)) || articles[0] || null;
  return {
    formats: Object.entries(KEURDECO_FORMATS).map(([id, label]) => ({ id, label })),
    vues: VUES,
    nextVue: VUES[state.count % VUES.length],
    next: next && next.slug,
    articles: articles.map((a) => ({
      slug: a.slug,
      titre: a.titre,
      objets: a.objets.length,
      fait: state.done.includes(a.slug),
    })),
  };
}

export async function createKeurDecoAd(project, { format = 'ambiance', article = '', vue = '', seconds = 30 } = {}, update) {
  if (project.kind !== 'pub') {
    throw new Error('Réservé à la campagne de pub Keur Déco.');
  }
  applyVoicePreset(project);
  const articles = articlesPublies();
  const state = project.kdTour || (project.kdTour = { done: [], count: 0 });
  const a = articles.find((x) => x.slug === article) || articles.find((x) => !state.done.includes(x.slug)) || articles[0];
  if (!a) {
    throw new Error('Aucun article publié sur Keur Déco.');
  }
  const fmt = KEURDECO_FORMATS[format] ? format : 'ambiance';
  if (fmt !== 'ambiance' && a.objets.length < 2) {
    throw new Error(`L'article « ${a.titre} » n'a pas assez d'objets repérés sur sa photo pour ce format.`);
  }
  const laVue = vue || VUES[state.count % VUES.length];
  const secs = 30; // durée fixée (on ne la demande plus)
  const number = (project.episodes || []).reduce((m, e) => Math.max(m, e.number), 0) + 1;
  const dir = assetsDir(project.id);

  update(`Script de la pub « ${a.titre} » par Claude…`);
  const raw = await askClaudeForJson(buildKeurDecoAdPrompt({ format: fmt, article: a, vue: laVue, seconds: secs }));
  ensureUsage(project).claudeCalls += 1;

  const base = (i, extra) => ({
    id: `s${i + 1}`,
    location: '',
    screenshot: null,
    characters: [],
    image: null,
    imageUrl: null,
    kenBurns: KEN_BURNS_CYCLE[i % KEN_BURNS_CYCLE.length],
    durationSec: 6,
    version: 0,
    imagePrompt: '',
    lines: [],
    ...extra,
  });
  const lines = (sc) =>
    (Array.isArray(sc.lines) ? sc.lines : [])
      .filter((l) => l && l.text)
      .slice(0, 2)
      .map((l) => ({ speaker: 'narrator', text: String(l.text).trim(), audio: null, audioDurationSec: null }));
  const badge = (sc) => (typeof sc.badge === 'string' && sc.badge.trim() ? sc.badge.trim().slice(0, 60) : null);

  // La vraie photo de l'article, copiée une fois pour toute la vidéo.
  let photo = null;
  const photoDuSite = () => {
    if (!photo) {
      photo = `e${number}_keurdeco.jpg`;
      fs.copyFileSync(a.photo, path.join(dir, photo));
    }
    return { image: photo, fromSite: true, videoDisabled: true };
  };

  const episode = {
    number,
    title: String(raw.title || a.titre).slice(0, 120),
    locations: {},
    cliffhanger: '',
    status: 'script',
    renderedFile: null,
    topic: `${KEURDECO_FORMATS[fmt].split(' — ')[0]} — ${a.titre}${fmt === 'ambiance' ? ` (${laVue})` : ''}`,
    kdFormat: fmt,
    scenes: [],
  };

  if (fmt === 'ambiance') {
    const scenes = (Array.isArray(raw.scenes) ? raw.scenes : []).slice(0, 8);
    episode.scenes = scenes.map((sc, i) =>
      base(i, {
        badge: badge(sc),
        badgeStyle: 'doux',
        imagePrompt: String(sc.imagePrompt || '').trim(),
        motionPrompt: String(sc.motionPrompt || '').trim().slice(0, 300),
        clip: true,
        fixedDuration: true,
        durationSec: Math.max(5, Math.min(8, Math.round(secs / Math.max(1, scenes.length)))),
      }),
    );
    // Musique composée pour cette vidéo (la durée de la vidéo + le carton final).
    if (raw.music) {
      try {
        update('Composition de la musique par ElevenLabs…');
        const file = `e${number}_musique.mp3`;
        await composeMusic(String(raw.music).slice(0, 400), secs + 6, path.join(dir, file));
        episode.musicFile = file;
        episode.musicVolume = 0.75;
      } catch (e) {
        console.error('Musique Keur Déco :', e.message);
      }
    }
  } else {
    const objets = a.objets;
    episode.scenes = (Array.isArray(raw.scenes) ? raw.scenes : []).slice(0, 9).map((sc, i) => {
      const o = Number.isInteger(sc.objet) ? objets[sc.objet - 1] : null;
      if (sc.kind === 'avant') {
        return base(i, {
          badge: badge(sc) || 'Avant',
          lines: lines(sc),
          imagePrompt: `${String(raw.avant || '').trim()} Vertical 9:16 photograph, no people, no text, no logo, no watermark.`,
          videoDisabled: true,
        });
      }
      return base(i, {
        badge: badge(sc),
        lines: lines(sc),
        ...photoDuSite(),
        ...(o ? { focus: { x: o.x, y: o.y } } : {}),
      });
    });
  }
  if (!episode.scenes.length) {
    throw new Error('Claude n’a rendu aucun plan pour cette pub.');
  }

  const logo = logoKeurDeco();
  if (logo && !project.ctaLogo) {
    project.ctaLogo = `keurdeco-logo${path.extname(logo)}`;
    fs.copyFileSync(logo, path.join(dir, project.ctaLogo));
  }
  // Palette « Terre de Dakar » du site : sable, indigo, terracotta.
  project.ctaTheme = {
    bg: 'radial-gradient(ellipse at 50% 40%, #fbf6ee 0%, #efe2cf 80%)',
    ink: '#1E2A47',
    pill: '#A3472A',
    pillInk: '#ffffff',
  };
  episode.cta = `${String(raw.cta || "Toute l'idée déco sur keurdeco.com").slice(0, 70)}\nÉpinglez l'idée sur Pinterest`;

  project.episodes.push(episode);
  project.episodes.sort((x, y) => x.number - y.number);
  project.episodeCount = project.episodes.length;
  if (!state.done.includes(a.slug)) {
    state.done.push(a.slug);
  }
  if (state.done.length >= articles.length) {
    state.done = [];
  }
  state.count += 1;
  saveProject(project);
  return { number };
}

// ---------- Pub Keurbook : « Le livre en 30 s » ----------
export async function keurbookAdPlan(project) {
  const livres = await chargeLivres();
  const state = project.kbTour || { done: [] };
  const next = livres.find((l) => !state.done.includes(l.slug)) || livres[0] || null;
  return {
    next: next && next.slug,
    livres: livres.map((l) => ({
      slug: l.slug,
      titre: l.titre,
      auteur: l.auteur,
      pays: l.pays,
      fait: state.done.includes(l.slug),
    })),
  };
}

export async function createKeurbookAd(project, { livre = '' } = {}, update) {
  if (project.kind !== 'pub') {
    throw new Error('Réservé à la campagne de pub Keurbook.');
  }
  applyVoicePreset(project);
  const livres = await chargeLivres();
  const state = project.kbTour || (project.kbTour = { done: [] });
  const l = livres.find((x) => x.slug === livre) || livres.find((x) => !state.done.includes(x.slug)) || livres[0];
  if (!l) {
    throw new Error('Aucun livre lisible dans le dépôt de Keurbook.');
  }
  const secs = 30; // durée fixée (on ne la demande plus)
  const number = (project.episodes || []).reduce((m, e) => Math.max(m, e.number), 0) + 1;
  const dir = assetsDir(project.id);

  update(`Script de la pub « ${l.titre} » par Claude…`);
  const raw = await askClaudeForJson(buildKeurbookAdPrompt({ livre: l, seconds: secs }));
  ensureUsage(project).claudeCalls += 1;
  const episode = normalizeEpisode(raw, number, 8);
  // L'illustration Keurbook du livre (propriété du site) sur l'accroche, le
  // « pourquoi » et la fin ; les plans « histoire » sont générés.
  const illu = `e${number}_illustration.webp`;
  copyRecipeImage(l.illustration, path.join(dir, illu));
  const mouvements = { accroche: 'zoom-in', pourquoi: 'pan-up', fin: 'zoom-out' };
  for (const sc of episode.scenes) {
    sc.characters = [];
    for (const line of sc.lines) {
      line.speaker = 'narrator';
    }
    if (sc.kind !== 'histoire' || !sc.imagePrompt) {
      sc.image = illu;
      sc.imageUrl = null;
      sc.imagePrompt = '';
      sc.fromSite = true;
      sc.videoDisabled = true;
      sc.kenBurns = mouvements[sc.kind] || 'zoom-in';
    }
  }
  const logo = logoKeurbook();
  if (logo && !project.ctaLogo) {
    project.ctaLogo = `keurbook-logo${path.extname(logo)}`;
    copyRecipeImage(logo, path.join(dir, project.ctaLogo));
  }
  episode.topic = `${l.titre} — ${l.auteur}`;
  episode.title = raw.title || episode.topic;
  episode.cta = String(raw.cta || 'Ajoutez-le à votre pile à lire sur keurbook.com').slice(0, 80);
  episode.cliffhanger = '';
  project.episodes.push(episode);
  project.episodes.sort((a, b) => a.number - b.number);
  project.episodeCount = project.episodes.length;
  if (!state.done.includes(l.slug)) {
    state.done.push(l.slug);
  }
  if (state.done.length >= livres.length) {
    state.done = [];
  }
  saveProject(project);
  return { number };
}

// ---------- Pub OptiLED : « Le calcul en 30 s », « Time-lapse » ----------
export const OPTILED_FORMATS = {
  calcul: '🔢 Le calcul en 30 s — les vrais chiffres du site',
  timelapse: '🌱 Time-lapse — la plante pousse sous les LED',
};

export async function optiledAdPlan(project) {
  const cultures = await chargeCultures();
  const state = project.opTour || { done: [] };
  const next = cultures.find((c) => !state.done.includes(c.id)) || cultures[0] || null;
  return {
    formats: Object.entries(OPTILED_FORMATS).map(([id, label]) => ({ id, label })),
    next: next && next.id,
    cultures: cultures.map((c) => ({
      id: c.id,
      nom: c.nom,
      resume: `${c.puissanceW} W · ${c.barres} barre${c.barres > 1 ? 's' : ''} · ${c.heures} h/jour`,
      fait: state.done.includes(c.id),
    })),
  };
}

export async function createOptiledAd(project, { format = 'calcul', culture = '' } = {}, update) {
  if (project.kind !== 'pub') {
    throw new Error('Réservé à la campagne de pub OptiLED.');
  }
  applyVoicePreset(project);
  const cultures = await chargeCultures();
  const state = project.opTour || (project.opTour = { done: [] });
  const c = cultures.find((x) => x.id === culture) || cultures.find((x) => !state.done.includes(x.id)) || cultures[0];
  if (!c) {
    throw new Error("Aucune culture lisible dans le dépôt d'OptiLED.");
  }
  const fmt = OPTILED_FORMATS[format] ? format : 'calcul';
  const secs = 30; // durée fixée (on ne la demande plus)
  const number = (project.episodes || []).reduce((m, e) => Math.max(m, e.number), 0) + 1;
  const dir = assetsDir(project.id);

  update(`Script de la pub « ${c.nom} » par Claude…`);
  const raw = await askClaudeForJson(buildOptiledAdPrompt({ format: fmt, culture: c, seconds: secs }));
  ensureUsage(project).claudeCalls += 1;

  let episode;
  if (fmt === 'timelapse') {
    const scenes = (Array.isArray(raw.scenes) ? raw.scenes : []).slice(0, 8);
    episode = {
      number,
      title: String(raw.title || c.nom).slice(0, 120),
      locations: {},
      cliffhanger: '',
      status: 'script',
      renderedFile: null,
      scenes: scenes.map((sc, i) => ({
        id: `s${i + 1}`,
        location: '',
        screenshot: null,
        characters: [],
        image: null,
        imageUrl: null,
        kenBurns: 'zoom-in',
        version: 0,
        lines: [],
        badge: typeof sc.badge === 'string' && sc.badge.trim() ? sc.badge.trim().slice(0, 60) : null,
        badgeStyle: 'doux',
        imagePrompt: String(sc.imagePrompt || '').trim(),
        motionPrompt: String(sc.motionPrompt || '').trim().slice(0, 300),
        clip: true,
        fixedDuration: true,
        durationSec: Math.max(5, Math.min(8, Math.round(secs / Math.max(1, scenes.length)))),
      })),
    };
    if (raw.music) {
      try {
        update('Composition de la musique par ElevenLabs…');
        const file = `e${number}_musique.mp3`;
        await composeMusic(String(raw.music).slice(0, 400), secs + 6, path.join(dir, file));
        episode.musicFile = file;
        episode.musicVolume = 0.75;
      } catch (e) {
        console.error('Musique OptiLED :', e.message);
      }
    }
  } else {
    episode = normalizeEpisode(raw, number, 8);
    const photo = `e${number}_culture.webp`;
    copyRecipeImage(c.photo, path.join(dir, photo));
    for (const sc of episode.scenes) {
      sc.characters = [];
      for (const l of sc.lines) {
        l.speaker = 'narrator';
      }
      if (sc.kind !== 'chiffre' || !sc.imagePrompt) {
        sc.image = photo;
        sc.imageUrl = null;
        sc.imagePrompt = '';
        sc.fromSite = true;
        sc.videoDisabled = true;
      }
    }
  }
  if (!episode.scenes.length) {
    throw new Error('Claude n’a rendu aucun plan pour cette pub.');
  }
  if (!project.ctaLogo) {
    const logo = path.join(optiledRepo(), 'public', 'favicon.svg');
    if (fs.existsSync(logo)) {
      project.ctaLogo = 'optiled-logo.svg';
      fs.copyFileSync(logo, path.join(dir, project.ctaLogo));
    }
  }
  // Thème « Crépuscule » du site : nuit violette, ambre.
  project.ctaTheme = {
    bg: 'radial-gradient(ellipse at 50% 40%, #3a2140 0%, #1b1322 80%)',
    ink: '#f6ecf0',
    pill: '#f7c07a',
    pillInk: '#1b1322',
    withName: true,
  };
  episode.topic = `${OPTILED_FORMATS[fmt].split(' — ')[0]} — ${c.nom}`;
  episode.cta = String(raw.cta || 'Calculez votre éclairage gratuitement sur optiled.fr').slice(0, 80);
  project.episodes.push(episode);
  project.episodes.sort((a, b) => a.number - b.number);
  project.episodeCount = project.episodes.length;
  if (!state.done.includes(c.id)) {
    state.done.push(c.id);
  }
  if (state.done.length >= cultures.length) {
    state.done = [];
  }
  saveProject(project);
  return { number };
}

// ---------- Pub Erea : l'anachronisme ----------
export function ereaAdPlan(project) {
  const deja = (project.ereaTour && project.ereaTour.deja) || [];
  return { deja };
}

export async function createEreaAd(project, { personnage = '' } = {}, update) {
  if (project.kind !== 'pub') {
    throw new Error('Réservé à la campagne de pub Erea.');
  }
  applyVoicePreset(project);
  const state = project.ereaTour || (project.ereaTour = { deja: [] });
  const number = (project.episodes || []).reduce((m, e) => Math.max(m, e.number), 0) + 1;
  const dir = assetsDir(project.id);

  update('Claude imagine l’anachronisme…');
  const raw = await askClaudeForJson(
    buildEreaAdPrompt({ personnage: String(personnage || '').trim(), deja: state.deja.slice(-30), idees: evenementsCelebres(40) }),
  );
  ensureUsage(project).claudeCalls += 1;
  const an = (v, d) => (Number.isFinite(Number(v)) ? Math.max(-3000, Math.min(2026, Math.round(Number(v)))) : d);
  const anneePerso = an(raw.anneePersonnage, 1805);
  let anneeFrise = an(raw.anneeFrise, -52);
  if (Math.abs(anneeFrise - anneePerso) < 300) {
    anneeFrise = anneePerso > 0 ? -52 : 1900; // une vraie mauvaise époque
  }
  const nom = String(raw.personnage || personnage || 'Napoléon Bonaparte').slice(0, 60);
  const visuel = String(raw.visuel || '').trim();
  const line = (t) => (t ? [{ speaker: 'narrator', text: String(t).trim().slice(0, 200), audio: null, audioDurationSec: null }] : []);

  const base = (i, extra) => ({
    id: `s${i + 1}`,
    location: '',
    screenshot: null,
    characters: [],
    image: null,
    imageUrl: null,
    kenBurns: 'zoom-in',
    durationSec: 5,
    version: 0,
    imagePrompt: '',
    lines: [],
    ...extra,
  });
  // Les images et polices de l'appli, copiées une fois dans le projet : la
  // frise de la pub est dessinée exactement comme dans le jeu.
  const src = fichiersFrise();
  const copie = (p, nom) => {
    if (!p) {
      return null;
    }
    const dest = path.join(dir, nom);
    if (!fs.existsSync(dest)) {
      fs.copyFileSync(p, dest);
    }
    return nom;
  };
  const friseAssets = {
    sons: { tic: copie(src.sons.tic, 'erea-tic.wav'), tac: copie(src.sons.tac, 'erea-tac.wav') },
    bg: src.bg.map((p, i) => copie(p, `erea-bg-${i}.webp`)),
    anim: src.anim.map((p, i) => copie(p, `erea-anim-${i}.webp`)),
    fonts: {
      baloo: copie(src.fonts.baloo, 'erea-baloo2.ttf'),
      nunito: copie(src.fonts.nunito, 'erea-nunito.ttf'),
      nunitoBlack: copie(src.fonts.nunitoBlack, 'erea-nunito-black.ttf'),
    },
  };
  // Bruitages de la marque, composés une fois par projet (quelques centimes).
  const bruitage = async (nom, prompt, sec) => {
    const f = path.join(dir, nom);
    if (!fs.existsSync(f)) {
      try {
        await composeSfx(prompt, sec, f);
      } catch (e) {
        console.error(`Bruitage ${nom} :`, e.message);
        return null;
      }
    }
    return nom;
  };
  update('Bruitages « le temps qui bugue »…');
  const sonBug = await bruitage('erea-bug.mp3', 'short harsh digital glitch, time distortion, vhs tape rewind stutter, electric crackle', 0.8);
  const sonLogo = await bruitage('erea-logo.mp3', 'quick magical whoosh with a soft bright chime, logo reveal', 1.2);
  const icone = iconeErea();
  if (icone && !project.ctaLogo) {
    project.ctaLogo = `erea-icone${path.extname(icone)}`;
    fs.copyFileSync(icone, path.join(dir, project.ctaLogo));
  }
  // Écran de fin : le logo sans fond (studio/erea-logo-transparent.png), si
  // on l'a ; l'intro garde l'icône de l'appli.
  const sansFond = path.join(STUDIO_DIR, 'erea-logo-transparent.png');
  const logoIntro = icone ? `erea-icone${path.extname(icone)}` : null;
  if (fs.existsSync(sansFond)) {
    fs.copyFileSync(sansFond, path.join(dir, 'erea-logo.png'));
    project.ctaLogo = 'erea-logo.png';
  }
  // Deux voix : l'historien posé (Nicolas), puis le narrateur qui panique (Léo).
  project.voixRoles = {
    historien: { voice: 'aQROLel5sQbj1vuIVi6B', settings: { stability: 0.7, similarity_boost: 0.8, style: 0.25, speed: 0.92 } },
    panique: { voice: 'AfbuxQ9DVtS4azaxN1W7', settings: { stability: 0.22, similarity_boost: 0.8, style: 0.8, speed: 1.12 } },
  };
  const role = (who, t) => (t ? [{ speaker: who, text: String(t).trim().slice(0, 220), audio: null, audioDurationSec: null }] : []);
  const hi = raw.historien || {};
  const ca = raw.catastrophe || {};
  const bug = (at) => (sonBug ? [{ file: sonBug, at, volume: 0.9 }] : []);
  const scenes = [
    // 1. Le logo, une seconde.
    base(0, {
      ereaLogo: { icone: logoIntro, fonts: friseAssets.fonts },
      durationSec: 1.3,
      fixedDuration: true,
      videoDisabled: true,
      sfx: sonLogo ? [{ file: sonLogo, at: 0, volume: 0.8 }] : [],
    }),
    // 2. L'historien : le vrai moment, dans sa vraie époque.
    base(1, {
      coupeNette: true,
      imagePrompt: `${String(hi.imagePrompt || '').trim()} The character: ${visuel}`,
      motionPrompt: String(hi.motionPrompt || '').trim().slice(0, 300),
      clip: true,
      fixedDuration: true,
      durationSec: 7,
      historien: { nom, moment: String(raw.moment || anneePerso).slice(0, 50), fonts: friseAssets.fonts },
      // Le bug, précédé de petits grésillements de plus en plus forts.
      sfx: sonBug
        ? [
            ...[
              [0.42, 0.12, 0.08],
              [0.58, 0.18, 0.1],
              [0.7, 0.25, 0.12],
              [0.78, 0.35, 0.14],
              [0.84, 0.5, 0.18],
            ].map(([frac, volume, dur]) => ({ file: sonBug, frac, volume, dur })),
            { file: sonBug, frac: 0.9, volume: 0.9 },
          ]
        : [],
      lines: role('historien', hi.voix),
    }),
    // 3. Le bug du temps : les deux époques se déchirent.
    base(2, {
      coupeNette: true,
      bascule: { de: 's2', vers: 's4' },
      durationSec: 1.1,
      fixedDuration: true,
      videoDisabled: true,
      sfx: bug(0),
    }),
    // 4. La catastrophe : même personnage, mauvaise époque, le narrateur panique.
    base(3, {
      coupeNette: true,
      memeQue: 's2',
      imagePrompt: `${String(ca.imagePrompt || '').trim()} The character (same person as in the reference image, in full action, never panicked): ${visuel}`,
      motionPrompt: String(ca.motionPrompt || '').trim().slice(0, 300),
      clip: true,
      fixedDuration: true,
      durationSec: 7,
      catastrophe: { ecran: String(ca.ecran || '').slice(0, 50), fonts: friseAssets.fonts },
      sfx: [...bug(0)],
      lines: role('panique', ca.voix),
    }),
    // 5. La frise du jeu remet l'événement à sa vraie place.
    base(4, {
      frise: { depart: anneeFrise, arrivee: anneePerso, ...friseAssets },
      lines: line(raw.frise),
      durationSec: 5,
      fixedDuration: true,
      videoDisabled: true,
    }),
  ];
  const episode = {
    number,
    title: String(raw.title || `${nom} — mauvaise époque`).slice(0, 120),
    topic: `${nom} (${String(raw.moment || anneePerso)}) → ${String(raw.epoqueFrise || anneeFrise)}`,
    locations: {},
    cliffhanger: '',
    status: 'script',
    renderedFile: null,
    scenes,
    cta: String(raw.cta || 'Joue gratuitement à Erea').slice(0, 60),
  };
  // Couleurs du jeu : parchemin et ocre de l'âge du bronze.
  project.ctaTheme = {
    bg: 'radial-gradient(ellipse at 50% 40%, #fff8e8 0%, #f2e2bf 80%)',
    ink: '#2b2118',
    pill: '#a97b36',
    pillInk: '#ffffff',
    withName: true,
  };
  project.episodes.push(episode);
  project.episodes.sort((a, b) => a.number - b.number);
  project.episodeCount = project.episodes.length;
  state.deja.push(nom);
  saveProject(project);
  return { number };
}

// ---------- Pub Kultiva ----------
export const KULTIVA_FORMATS = {
  mois: '📅 Que semer ce mois-ci ?',
  assiette: "🍽️ De la graine à l'assiette",
  famille: '👨‍👩‍👧 Au jardin en famille',
  timelapse: '🌱 Time-lapse — la plante pousse',
};
const moisCourant = () => Number(new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris', month: 'numeric' }));

export function kultivaAdPlan(project) {
  const mois = moisCourant();
  const state = project.kuTour || { used: {} };
  return {
    formats: Object.entries(KULTIVA_FORMATS).map(([id, label]) => ({ id, label })),
    regions: Object.entries(REGIONS).map(([id, label]) => ({ id, label })),
    mois: MOIS[mois - 1],
    especes: chargeEspeces().map((e) => ({
      id: e.id,
      nom: e.nom,
      emoji: e.emoji,
      france: (e.regions.france?.sowing_months || []).includes(mois),
      west_africa: (e.regions.west_africa?.sowing_months || []).includes(mois),
      fait: Object.values(state.used || {}).some((l) => l.includes(e.id)),
    })),
  };
}

export async function createKultivaAd(project, { format = 'mois', region = 'france', espece = '' } = {}, update) {
  if (project.kind !== 'pub') {
    throw new Error('Réservé à la campagne de pub Kultiva.');
  }
  applyVoicePreset(project);
  const fmt = KULTIVA_FORMATS[format] ? format : 'mois';
  const reg = REGIONS[region] ? region : 'france';
  const state = project.kuTour || (project.kuTour = { used: {} });
  const used = state.used[reg] || (state.used[reg] = []);
  const mois = moisCourant();
  const secs = 30; // durée fixée (on ne la demande plus)
  const number = (project.episodes || []).reduce((m, e) => Math.max(m, e.number), 0) + 1;
  const dir = assetsDir(project.id);
  const copie = (src, nom) => {
    if (!src) {
      return null;
    }
    const dest = path.join(dir, nom);
    if (!fs.existsSync(dest)) {
      fs.copyFileSync(src, dest);
    }
    return nom;
  };
  const melange = (l) => [...l].sort(() => Math.random() - 0.5);
  const toutes = chargeEspeces();
  let especes = [];
  let e = null;
  if (fmt === 'mois') {
    const dispo = aSemer(reg, mois);
    especes = [...melange(dispo.filter((x) => !used.includes(x.id))), ...melange(dispo.filter((x) => used.includes(x.id)))].slice(0, 3);
    if (especes.length === 0) {
      throw new Error(`Rien à semer en ${MOIS[mois - 1]} dans le calendrier de Kultiva (${REGIONS[reg]}).`);
    }
  } else {
    e =
      toutes.find((x) => x.id === espece) ||
      toutes.find((x) => (x.regions[reg]?.sowing_months || []).includes(mois) && !used.includes(x.id)) ||
      toutes.find((x) => !used.includes(x.id)) ||
      toutes[0];
  }

  update('Script de la pub Kultiva par Claude…');
  const raw = await askClaudeForJson(
    buildKultivaAdPrompt({ format: fmt, region: reg, mois: MOIS[mois - 1], especes, espece: e, seconds: secs }),
  );
  ensureUsage(project).claudeCalls += 1;
  const fond = copie(fondPastel('morning'), 'kultiva-fond.png');
  const tama = tamassi();
  const tamaFile = (i) => copie(tama[Math.min(tama.length - 1, i)], `kultiva-tamassi-${i}.png`);
  const surFond = { image: fond, fromSite: true, videoDisabled: true, kenBurns: 'zoom-in' };

  let episode;
  if (fmt === 'timelapse') {
    const scenes = (Array.isArray(raw.scenes) ? raw.scenes : []).slice(0, 8);
    episode = {
      number,
      title: String(raw.title || 'Time-lapse Kultiva').slice(0, 120),
      locations: {},
      cliffhanger: '',
      status: 'script',
      renderedFile: null,
      scenes: scenes.map((sc, i) => ({
        id: `s${i + 1}`,
        location: '',
        screenshot: null,
        characters: [],
        image: null,
        imageUrl: null,
        kenBurns: 'zoom-in',
        version: 0,
        lines: [],
        badge: typeof sc.badge === 'string' && sc.badge.trim() ? sc.badge.trim().slice(0, 60) : null,
        badgeStyle: 'doux',
        imagePrompt: String(sc.imagePrompt || '').trim(),
        motionPrompt: String(sc.motionPrompt || '').trim().slice(0, 300),
        clip: true,
        fixedDuration: true,
        durationSec: Math.max(5, Math.min(8, Math.round(secs / Math.max(1, scenes.length)))),
      })),
    };
    if (raw.music) {
      try {
        update('Composition de la musique par ElevenLabs…');
        const file = `e${number}_musique.mp3`;
        await composeMusic(String(raw.music).slice(0, 400), secs + 6, path.join(dir, file));
        episode.musicFile = file;
        episode.musicVolume = 0.75;
      } catch (err) {
        console.error('Musique Kultiva :', err.message);
      }
    }
  } else {
    episode = normalizeEpisode(raw, number, 8);
    for (const sc of episode.scenes) {
      sc.characters = [];
      for (const l of sc.lines) {
        l.speaker = 'narrator';
      }
    }
    if (fmt === 'mois') {
      // Tout en illustrations de l'appli : aucune image générée.
      episode.scenes.forEach((sc, i) => {
        const k = (raw.scenes || [])[i] || {};
        Object.assign(sc, surFond, { imagePrompt: '' });
        if (k.kind === 'legume' && Number.isInteger(k.legume) && especes[k.legume - 1]) {
          const x = especes[k.legume - 1];
          sc.sticker = copie(x.illustration, `kultiva-${x.id}.png`);
        } else {
          sc.sticker = tamaFile(k.kind === 'fin' ? 10 : 2);
          sc.stickerSize = 0.85;
        }
      });
    } else if (fmt === 'famille') {
      episode.scenes.forEach((sc, i) => {
        if ((raw.scenes || [])[i]?.tamassi) {
          sc.sticker = tamaFile(4);
          sc.stickerSize = 0.45;
          sc.stickerY = 560;
        }
      });
    }
  }
  if (!episode.scenes.length) {
    throw new Error('Claude n’a rendu aucun plan pour cette pub.');
  }
  if (!project.ctaLogo) {
    project.ctaLogo = copie(iconeKultiva(), 'kultiva-icone.png');
  }
  // Pastels de l'appli : menthe, crème, rose.
  project.ctaTheme = {
    bg: 'radial-gradient(ellipse at 50% 40%, #fbfff9 0%, #dcf2e6 80%)',
    ink: '#3d5a4c',
    pill: '#ff8fab',
    pillInk: '#ffffff',
    withName: true,
  };
  const sujet = fmt === 'mois' ? especes.map((x) => x.nom).join(', ') : e.nom;
  episode.topic = `${KULTIVA_FORMATS[fmt]} — ${sujet} (${REGIONS[reg]})`;
  episode.title = String(raw.title || episode.topic).slice(0, 120);
  episode.cta = String(raw.cta || 'Ton potager dans ta poche').slice(0, 70);
  project.episodes.push(episode);
  project.episodes.sort((a, b) => a.number - b.number);
  project.episodeCount = project.episodes.length;
  for (const x of fmt === 'mois' ? especes : [e]) {
    if (!used.includes(x.id)) {
      used.push(x.id);
    }
  }
  saveProject(project);
  return { number };
}

// ---------- Pub Palabre ----------
export const PALABRE_FORMATS = {
  question: '🤔 Et vous, que feriez-vous ?',
  mandat: '⏱️ 100 jours en 30 secondes',
  palais: '🏛️ Le palais',
};

export function palabreAdPlan(project) {
  const state = project.paTour || { cartes: [] };
  return {
    formats: Object.entries(PALABRE_FORMATS).map(([id, label]) => ({ id, label })),
    cartes: cartesJouables()
      .filter((c) => !c.texte.includes('{nom}') && c.id !== carteSerment().id)
      .map((c) => ({
        id: c.id,
        titre: c.titrePersonnage,
        resume: (() => {
          const t = c.texte.replaceAll('{titre}', 'Monsieur le Président');
          return `${t.slice(0, 70)}${t.length > 70 ? '…' : ''}`;
        })(),
        gauche: c.gauche.libelle,
        droite: c.droite.libelle,
        fait: (state.cartes || []).includes(c.id),
      })),
  };
}

export async function createPalabreAd(project, { format = 'question', carte: carteId = '' } = {}, update) {
  if (project.kind !== 'pub') {
    throw new Error('Réservé à la campagne de pub Palabre.');
  }
  applyVoicePreset(project);
  const fmt = PALABRE_FORMATS[format] ? format : 'question';
  const state = project.paTour || (project.paTour = { cartes: [] });
  const number = (project.episodes || []).reduce((m, e) => Math.max(m, e.number), 0) + 1;
  const dir = assetsDir(project.id);
  const copie = (src, nom) => {
    if (!src) {
      return null;
    }
    const dest = path.join(dir, nom);
    if (!fs.existsSync(dest)) {
      fs.copyFileSync(src, dest);
    }
    return nom;
  };
  const f = fichiersPalabre();
  const fonts = {
    titre: copie(f.fonts.titre, 'palabre-bricolage-extrabold.ttf'),
    titreBold: copie(f.fonts.titreBold, 'palabre-bricolage-bold.ttf'),
    corps: copie(f.fonts.corps, 'palabre-publicsans.ttf'),
    corpsSemi: copie(f.fonts.corpsSemi, 'palabre-publicsans-semibold.ttf'),
    corpsBold: copie(f.fonts.corpsBold, 'palabre-publicsans-bold.ttf'),
  };
  const son = (nom) => copie(f.sons[nom], `palabre-son-${nom}.mp3`);
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const melange = (l) => [...l].sort(() => Math.random() - 0.5);
  // Le titre que les cartes donnent au joueur ({titre}).
  const titreJoueur = Math.random() < 0.5 ? 'Monsieur le Président' : 'Madame la Présidente';
  const habille = (t) => t.replaceAll('{titre}', titreJoueur);
  const vueCarte = (c) => ({
    portrait: copie(c.portrait, `palabre-${path.basename(c.portrait)}`),
    titre: c.titrePersonnage,
    texte: habille(c.texte),
    gauche: { libelle: c.gauche.libelle, effets: c.gauche.effets || {}, style: c.gauche.style || 0 },
    droite: { libelle: c.droite.libelle, effets: c.droite.effets || {}, style: c.droite.style || 0 },
  });
  const pool = cartesJouables().filter((c) => !c.texte.includes('{nom}') && c.id !== carteSerment().id);
  const neuves = (l) => [...melange(l.filter((c) => !state.cartes.includes(c.id))), ...melange(l.filter((c) => state.cartes.includes(c.id)))];

  // Les plans : chaque plan = un écran du jeu + la consigne de voix.
  const plans = [];
  const plan = (id, decrit, consigne, scene) => plans.push({ id, decrit, consigne, scene });
  const SWIPE = 0.3; // début du geste dans un plan « on glisse »
  const swipe = (base, cote) => ({
    palabre: { ...base, geste: cote, debut: SWIPE },
    durationSec: SWIPE + 1.76 + 0.5,
    sfx: [{ file: son(sonDeLaReponse(base.carte[cote].effets)), at: SWIPE + 1.5 + 0.26 }],
  });
  let musique = f.musiqueBureau;
  let cartesUtilisees = [];

  if (fmt === 'question') {
    const c = pool.find((x) => x.id === carteId) || neuves(pool)[0];
    cartesUtilisees = [c.id];
    // Une partie en cours, une jauge au bord : la décision pèse.
    const jauges = { peuple: rnd(35, 65), armee: rnd(35, 65), caisses: rnd(35, 65), presse: rnd(35, 65) };
    const touchee = Object.keys({ ...c.gauche.effets, ...c.droite.effets })[0] || 'peuple';
    jauges[touchee] = Math.random() < 0.5 ? rnd(16, 22) : rnd(78, 84);
    const jour = rnd(14, 78);
    const base = { ecran: 'carte', jour, mandat: 1, style: rnd(40, 60), jauges, carte: vueCarte(c) };
    const effetsTxt = (r) =>
      Object.entries(r.effets || {})
        .map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`)
        .join(', ');
    plan('carte', `la carte du jour ${jour} : « ${c.titrePersonnage} » dit « ${habille(c.texte)} »`, "accroche (vous êtes président), puis l'enjeu de la carte, 26 mots maximum", {
      palabre: { ...base, geste: null },
      durationSec: 4,
    });
    plan(
      'question',
      `le joueur hésite, la carte penche à gauche (« ${c.gauche.libelle} ») puis à droite (« ${c.droite.libelle} »)`,
      `demande au spectateur ce qu'il ferait, cite les deux réponses, invite à répondre en commentaire, 20 mots maximum`,
      { palabre: { ...base, geste: 'hesite', debut: 0.3 }, durationSec: 4.2 },
    );
    plan('gauche', `il glisse à gauche : « ${c.gauche.libelle} » (effets : ${effetsTxt(c.gauche)})`, 'très court, 6 mots maximum (ex. « Vous auditez. »)', swipe(base, 'gauche'));
    plan(
      'journal_gauche',
      `la radio du lendemain : « ${c.gauche.journal} »`,
      'la conséquence, sèche et ironique, inspirée du journal, 16 mots maximum',
      { palabre: { ecran: 'quotidien', jour: jour + 1, ligne: c.gauche.journal }, durationSec: 3.5 },
    );
    plan('droite', `on rembobine, il glisse à droite : « ${c.droite.libelle} » (effets : ${effetsTxt(c.droite)})`, 'très court, 8 mots maximum (ex. « Ou bien… vous laissez faire. »)', swipe(base, 'droite'));
    plan(
      'journal_droite',
      `la radio du lendemain : « ${c.droite.journal} »`,
      'la conséquence, sèche et ironique, inspirée du journal, 16 mots maximum',
      { palabre: { ecran: 'quotidien', jour: jour + 1, ligne: c.droite.journal }, durationSec: 3.5 },
    );
  } else if (fmt === 'mandat') {
    // La fin d'abord : réélu, ou renversé par une jauge au bout.
    const fins = finsDuJeu();
    const reelu = Math.random() < 0.4;
    let fin;
    let derniere;
    let coteFinal;
    const choisies = neuves(pool);
    if (!reelu) {
      // Une carte dont une réponse pousse une jauge vers son bord.
      for (const c of choisies) {
        for (const cote of ['gauche', 'droite']) {
          for (const [j, v] of Object.entries(c[cote].effets || {})) {
            const ff = fins.find((x) => x.jauge === j && x.vers_le_haut === v > 0);
            if (!fin && ff && Math.abs(v) >= 6) {
              fin = ff;
              derniere = c;
              coteFinal = cote;
            }
          }
        }
        if (fin) {
          break;
        }
      }
    }
    if (!fin) {
      fin = fins.find((x) => x.id === 'election_gagnee');
      derniere = choisies[0];
      coteFinal = Math.random() < 0.5 ? 'gauche' : 'droite';
    }
    const jaugeFin = fin.jauge;
    const milieu = choisies.filter((c) => c.id !== derniere.id && c.personnage !== derniere.personnage);
    const vues = [];
    for (const c of milieu) {
      if (vues.length < 2 && !vues.some((v) => v.personnage === c.personnage)) {
        vues.push(c);
      }
    }
    const jours = fin.jauge ? [1, rnd(12, 20), rnd(30, 42), rnd(52, 66)] : [1, rnd(18, 30), rnd(44, 60), 99];
    const serment = carteSerment();
    const suite = [serment, ...vues, derniere];
    cartesUtilisees = suite.slice(1).map((c) => c.id);
    // Les jauges dérivent vers le bord fatal (ou restent tenues si réélu).
    let jauges = { peuple: 50, armee: 50, caisses: 50, presse: 50 };
    const bord = (fin.vers_le_haut ? 100 : 0);
    const vEffet = jaugeFin ? derniere[coteFinal].effets[jaugeFin] : 0;
    const avantFin = jaugeFin ? Math.max(0, Math.min(100, bord - vEffet)) : null;
    suite.forEach((c, i) => {
      const cote = i === suite.length - 1 ? coteFinal : Math.random() < 0.5 ? 'gauche' : 'droite';
      if (i > 0) {
        // Le temps passe entre deux cartes montrées.
        const k = i / (suite.length - 1);
        for (const j of JAUGES) {
          jauges[j] = Math.max(8, Math.min(92, jauges[j] + rnd(-9, 9)));
        }
        if (jaugeFin) {
          jauges[jaugeFin] = Math.round(50 + (avantFin - 50) * k);
        }
      }
      const base = { ecran: 'carte', jour: jours[i], mandat: 1, style: 50, jauges: { ...jauges }, carte: vueCarte(c) };
      plan(
        `jour${jours[i]}`,
        `jour ${jours[i]} : « ${c.titrePersonnage} » dit « ${habille(c.texte)} » ; le joueur répond « ${c[cote].libelle} »${i === suite.length - 1 && jaugeFin ? ` — et la jauge ${jaugeFin} touche le bord` : ''}`,
        i === 0 ? 'accroche : un mandat entier en trente secondes, puis le serment, 16 mots maximum' : 'une phrase sèche sur ce jour-là, 12 mots maximum',
        swipe(base, cote),
      );
      plans[plans.length - 1].scene.durationSec = SWIPE + 1.76 + 0.3;
      jauges = applique(jauges, c[cote].effets);
    });
    const joursTenus = jaugeFin ? jours[jours.length - 1] : 100;
    plan('fin', `l'écran de fin : « ${fin.titre} » — ${fin.texte} (tenu ${joursTenus} jours)`, 'le dénouement, sobre, 14 mots maximum', {
      palabre: {
        ecran: 'fin',
        fin: { gagnee: !jaugeFin, titre: fin.titre, texte: fin.texte, image: copie(fin.image, `palabre-fin-${path.basename(fin.image)}`), jours: joursTenus },
      },
      durationSec: 4.5,
      sfx: [{ file: son(jaugeFin ? 'battu' : 'reelu'), at: 0.2 }],
    });
  } else {
    // Le palais : le balcon, puis trois pièces qui s'enrichissent.
    const pieces = palais();
    let caisses = rnd(58, 72);
    const carteMur = copie(path.join(palabreRepo(), 'assets/images/palais/carte/jour.jpg'), 'palabre-carte-jour.jpg');
    const imgs = (e, id) => e.images.map((src, k) => copie(src, `palabre-${id}-${path.basename(path.dirname(src))}-${path.basename(src)}`.replace(/-pieces-/, '-')));
    const balcon = pieces.find((p) => p.id === 'balcon');
    if (balcon) {
      const e = balcon.etapes[0];
      plan('balcon', `le balcon du palais, l'avenue en bas (« ${e.nom} »)`, "accroche : vous êtes président, et le palais s'achète avec l'argent de l'État, 18 mots maximum", {
        palabre: {
          ecran: 'palais',
          piece: { id: 'balcon', nom: balcon.nom },
          etapes: [{ nom: e.nom, images: imgs(e, 'balcon') }],
          caisses,
          resume: `${balcon.objets.length} objets · à partir de ${Math.min(...balcon.objets.map((o) => o.prix))}`,
        },
        durationSec: 4,
      });
    }
    for (const id of ['bureau', 'garage', 'piscine']) {
      const p = pieces.find((x) => x.id === id);
      if (!p || p.etapes.length < 2) {
        continue;
      }
      const o = melange(p.objets)[0];
      const avant = p.etapes[0];
      const apres = p.etapes[rnd(1, p.etapes.length - 1)];
      plan(
        id,
        `${p.nom} : « ${avant.nom} », on achète « ${o.nom} » (${o.prix} points de caisses : « ${o.description} »), la pièce devient « ${apres.nom} »`,
        "l'achat, avec l'ironie de la description, 18 mots maximum",
        {
          palabre: {
            ecran: 'palais',
            piece: { id, nom: p.nom },
            etapes: [
              { nom: avant.nom, images: imgs(avant, id) },
              { nom: apres.nom, images: imgs(apres, id) },
            ],
            objet: { nom: o.nom, description: o.description, prix: o.prix },
            caisses,
            achat: 2.2,
            carteMur: id === 'bureau' ? carteMur : null,
          },
          durationSec: 5,
          sfx: [{ file: son('caisses'), at: 2.2 }],
        },
      );
      caisses -= o.prix;
    }
  }

  update('Voix off de la pub par Claude…');
  const raw = await askClaudeForJson(buildPalabreAdPrompt({ format: fmt, plans }));
  ensureUsage(project).claudeCalls += 1;
  const voix = raw.voix || {};
  const scenes = plans.map((p, i) => ({
    id: `s${i + 1}`,
    location: '',
    screenshot: null,
    characters: [],
    image: null,
    imageUrl: null,
    kenBurns: 'zoom-in',
    version: 0,
    imagePrompt: '',
    videoDisabled: true,
    palabreFonts: fonts,
    ...p.scene,
    lines:
      typeof voix[p.id] === 'string' && voix[p.id].trim()
        ? [{ speaker: 'narrator', text: voix[p.id].trim().slice(0, 300), audio: null, audioDurationSec: null }]
        : [],
  }));
  const episode = {
    number,
    title: String(raw.title || PALABRE_FORMATS[fmt]).slice(0, 120),
    topic: PALABRE_FORMATS[fmt],
    locations: {},
    cliffhanger: '',
    status: 'script',
    renderedFile: null,
    scenes,
    cta: String(raw.cta || 'Cent jours. Tiendrez-vous ?').slice(0, 60),
  };
  if (musique) {
    episode.musicFile = copie(musique, 'palabre-musique-bureau.mp3');
    episode.musicVolume = fmt === 'palais' ? 0.5 : 0.28;
  }
  if (!project.ctaLogo && f.logo) {
    project.ctaLogo = copie(f.logo, `palabre-logo${path.extname(f.logo)}`);
  }
  // Nuit et or, les couleurs du jeu.
  project.ctaTheme = {
    bg: 'radial-gradient(ellipse at 50% 0%, #241F2C 0%, #14131A 62%)',
    ink: '#F6EFE4',
    pill: '#E9B44C',
    pillInk: '#14131A',
    withName: true,
  };
  project.episodes.push(episode);
  project.episodes.sort((a, b) => a.number - b.number);
  project.episodeCount = project.episodes.length;
  for (const id of cartesUtilisees) {
    if (!state.cartes.includes(id)) {
      state.cartes.push(id);
    }
  }
  saveProject(project);
  return { number };
}

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

// Écrans dessinés par le studio lui-même (frise d'Erea, écrans de Palabre) :
// aucune image à générer, donc aucun crédit dépensé.
const dessineeParLeStudio = (scene) => Boolean(scene.frise || scene.palabre || scene.ereaLogo || scene.slogan || scene.bascule);

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
  await ensureKitchenReference(project, update);

  // 1. Images manquantes ou en erreur
  if (provider !== 'manual') {
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      if ((scene.image && !scene.imageError) || dessineeParLeStudio(scene)) {
        continue;
      }
      update(`Image de la scène ${i + 1}…`);
      scene.version += 1;
      const file = `e${episode.number}_${scene.id}_v${scene.version}.jpg`;
      try {
        const { ok, url, provider: used } = await generateImage(
          sceneImagePrompt(project, scene),
          path.join(dir, file),
          sceneImageOptions(project, scene, episode),
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
    const wanted = wantedClipIndexes(project, scenes);
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
  await ensureKitchenReference(project, update);
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    // Recette : la photo du plat venue de Keur Cook est gratuite et fidèle — on la garde.
    if ((scene.fromSite && scene.image) || dessineeParLeStudio(scene)) {
      continue;
    }
    update(`Image ${i + 1}/${scenes.length}…`, i / scenes.length);
    scene.version += 1;
    const file = `e${episode.number}_${scene.id}_v${scene.version}.jpg`;
    try {
      const { ok, url, provider } = await generateImage(
        sceneImagePrompt(project, scene),
        path.join(dir, file),
        sceneImageOptions(project, scene, episode),
      );
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
  await ensureKitchenReference(project, update);
  scene.version += 1;
  const file = `e${episode.number}_${scene.id}_v${scene.version}.jpg`;
  const { ok, url, provider } = await generateImage(
    sceneImagePrompt(project, scene),
    path.join(assetsDir(project.id), file),
    sceneImageOptions(project, scene, episode),
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
