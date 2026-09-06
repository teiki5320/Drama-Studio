import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fal } from '@fal-ai/client';
import { openartTalkingVideo } from './openart.js';
import { findFfmpeg } from './studio.js';
import { assetsDir } from './projects.js';
import { LINE_START_DELAY, LINE_GAP } from '../src/remotion/timing.js';

// Synchronisation labiale via fal.ai (Format long, et anciens dramas
// Version Synchro) : le clip vidéo de la scène + la piste voix (calée
// exactement comme dans Remotion) sont envoyés à un modèle de lip-sync, qui
// renvoie le clip avec les lèvres animées sur la voix. Le clip reste muet
// dans le montage : la voix ElevenLabs d'origine joue par-dessus, alignée.

const LIPSYNC_TIMEOUT_MS = 12 * 60 * 1000;

function ffmpegP(args) {
  return new Promise((resolve, reject) => {
    const bin = findFfmpeg();
    if (!bin) {
      reject(new Error('ffmpeg introuvable (npm install pas terminé ?)'));
      return;
    }
    execFile(bin, args, { timeout: 120000 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`ffmpeg : ${String(stderr || err.message).slice(-300)}`));
      } else {
        resolve();
      }
    });
  });
}

// Reconstitue la piste voix de la scène avec les MÊMES décalages que le
// montage Remotion (lineOffsets) — les lèvres tomberont pile sur la voix.
// Seules les répliques des PERSONNAGES entrent dans la piste : le narrateur
// reste en voix off (bouches fermées pendant qu'il parle), mais sa durée
// compte dans les décalages pour que tout reste calé.
export async function buildSceneVoiceTrack(project, scene, outPath) {
  const dir = assetsDir(project.id);
  const inputs = [];
  const delays = [];
  let t = LINE_START_DELAY;
  for (const line of scene.lines || []) {
    if (line.speaker && line.speaker !== 'narrator') {
      if (!line.audio) {
        throw new Error('Toutes les voix de la scène doivent être générées avant la synchro.');
      }
      inputs.push(path.join(dir, line.audio));
      delays.push(Math.round(t * 1000));
    }
    t += (line.audioDurationSec || 2) + LINE_GAP;
  }
  if (inputs.length === 0) {
    throw new Error('Aucune réplique de personnage dans cette scène.');
  }
  const args = [];
  for (const f of inputs) {
    args.push('-i', f);
  }
  const chains = inputs
    .map((_, i) => `[${i}]adelay=${delays[i]}|${delays[i]}[a${i}]`)
    .join(';');
  const mix =
    inputs.length === 1
      ? `${chains};[a0]apad=pad_dur=1[out]`
      : `${chains};${inputs.map((_, i) => `[a${i}]`).join('')}amix=inputs=${inputs.length}:normalize=0,apad=pad_dur=1[out]`;
  args.push('-filter_complex', mix, '-map', '[out]', '-c:a', 'libmp3lame', '-q:a', '4', '-y', outPath);
  await ffmpegP(args);
  return outPath;
}

const MIME = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/mp4',
  wav: 'audio/wav',
  aiff: 'audio/aiff',
  aif: 'audio/aiff',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

// Moteur de synchro par défaut : sync-lipsync v2 (3 $/min) — nettement plus
// propre que l'ancienne génération (bas de visage « détaché »). Override via
// FAL_LIPSYNC_MODEL (ex. fal-ai/sync-lipsync/v2/pro, ou un modèle « avatar »
// comme fal-ai/bytedance/omnihuman/v1.5).
export function lipsyncModel() {
  return process.env.FAL_LIPSYNC_MODEL || 'fal-ai/sync-lipsync/v2';
}

// Les modèles « avatar » ne retouchent pas un clip : ils GÉNÈRENT la vidéo
// parlante depuis l'image + la voix — visage entier cohérent, durée de la
// vidéo = durée de la voix. Deux familles : OmniHuman via fal (0,16 $/s) et
// « openart » (l'outil lip sync du MCP OpenArt, payé en crédits OpenArt).
export function isTalkingModel(model = lipsyncModel()) {
  return /omnihuman|^openart$/i.test(model || '');
}

function mimeFor(file) {
  return MIME[path.extname(file).slice(1).toLowerCase()] || 'application/octet-stream';
}

// Traduit les erreurs du client fal.ai en messages compréhensibles.
function falError(e) {
  const status = e?.status;
  let detail = '';
  try {
    detail = JSON.stringify(e?.body?.detail ?? e?.body ?? '').slice(0, 200);
  } catch {
    detail = '';
  }
  if (status === 401 || status === 403) {
    return new Error('fal.ai : clé invalide ou non autorisée (vérifie FAL_KEY dans .env).');
  }
  if (status === 402 || /balance|credit|exhausted/i.test(detail)) {
    return new Error('fal.ai : solde insuffisant — recharge ton compte sur fal.ai.');
  }
  if (status === 422) {
    return new Error(`fal.ai a refusé la demande (422) : ${detail || 'entrée invalide'}`);
  }
  return new Error(`fal.ai : ${e?.message || 'erreur inconnue'}${detail ? ` — ${detail}` : ''}`);
}

function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}

// Synchronise le clip d'une scène avec sa piste voix. Les fichiers sont
// d'abord téléversés sur le stockage fal.ai (les data-URI géants passaient
// mal : HTTP 422), puis le modèle tourne en file d'attente. Retourne le
// chemin du clip synchronisé (écrit dans outPath).
export async function lipsyncVideo({ videoPath, audioPath, outPath, update, model: modelOverride }) {
  const key = process.env.FAL_KEY;
  if (!key) {
    throw new Error(
      'La synchro labiale nécessite une clé fal.ai : ajoute FAL_KEY=... dans le fichier .env (https://fal.ai/dashboard/keys).',
    );
  }
  const model = modelOverride || lipsyncModel();
  // « bounce » : si la voix dure plus longtemps que le clip (5 s en mode
  // Éco), le clip se prolonge en aller-retour fluide au lieu d'être COUPÉ
  // à 5 s (l'ancien « cut_off » figeait l'image bouche ouverte en pleine
  // phrase). Réglable via FAL_LIPSYNC_SYNC_MODE (cut_off, loop, bounce…).
  const syncMode = process.env.FAL_LIPSYNC_SYNC_MODE || 'bounce';
  fal.config({ credentials: key });
  update('Envoi du clip et de la voix à fal.ai…');
  let videoUrl;
  let audioUrl;
  try {
    [videoUrl, audioUrl] = await Promise.all([
      fal.storage.upload(new Blob([fs.readFileSync(videoPath)], { type: mimeFor(videoPath) })),
      fal.storage.upload(new Blob([fs.readFileSync(audioPath)], { type: mimeFor(audioPath) })),
    ]);
  } catch (e) {
    throw falError(e);
  }
  update('Synchronisation des lèvres en cours…');
  let result;
  try {
    result = await withTimeout(
      fal.subscribe(model, {
        input: { video_url: videoUrl, audio_url: audioUrl, sync_mode: syncMode },
        onQueueUpdate: (s) => {
          if (s.status === 'IN_PROGRESS') {
            update('Synchronisation des lèvres en cours…');
          }
        },
      }),
      LIPSYNC_TIMEOUT_MS,
      'fal.ai : synchronisation trop longue (délai dépassé).',
    );
  } catch (e) {
    if (/délai dépassé/.test(e?.message || '')) {
      throw e;
    }
    throw falError(e);
  }
  await downloadResultVideo(result?.data || {}, outPath, update);
  return outPath;
}

async function downloadResultVideo(data, outPath, update) {
  const url =
    (data.video && data.video.url) ||
    data.video_url ||
    (typeof data.url === 'string' ? data.url : null);
  if (!url) {
    throw new Error(`fal.ai : pas de vidéo dans la réponse (${JSON.stringify(data).slice(0, 150)}).`);
  }
  update('Téléchargement du clip…');
  const dl = await fetch(url, { signal: AbortSignal.timeout(300000) });
  if (!dl.ok) {
    throw new Error(`fal.ai : téléchargement du clip impossible (HTTP ${dl.status}).`);
  }
  const buf = Buffer.from(await dl.arrayBuffer());
  if (buf.length < 20000) {
    throw new Error('fal.ai : clip invalide (fichier trop petit).');
  }
  fs.writeFileSync(outPath, buf);
}

// Héberge un fichier local sur le stockage fal.ai (URL publique) — sert de
// relais pour donner l'audio (et l'image si besoin) au MCP OpenArt.
async function uploadPublicFile(filePath) {
  const key = process.env.FAL_KEY;
  if (!key) {
    throw new Error(
      "Le lip-sync OpenArt a besoin d'héberger la voix : ajoute FAL_KEY=... dans .env (le stockage fal.ai sert de relais, sans frais notables).",
    );
  }
  fal.config({ credentials: key });
  try {
    return await fal.storage.upload(
      new Blob([fs.readFileSync(filePath)], { type: mimeFor(filePath) }),
    );
  } catch (e) {
    throw falError(e);
  }
}

// Point d'entrée unique des plans parlants : aiguille vers le MCP OpenArt
// (model === 'openart', crédits OpenArt) ou vers fal (OmniHuman…).
export async function makeTalkingClip({ imagePath, imageUrl, audioPath, outPath, update, model }) {
  const m = model || lipsyncModel();
  if (/^openart$/i.test(m)) {
    update("Envoi de la voix au relais d'hébergement…");
    const audioUrl = await uploadPublicFile(audioPath);
    const imgUrl = imageUrl || (await uploadPublicFile(imagePath));
    update('Lip-sync OpenArt (plusieurs minutes)…');
    const { buffer } = await openartTalkingVideo({ imageUrl: imgUrl, audioUrl });
    fs.writeFileSync(outPath, buffer);
    return outPath;
  }
  return talkingVideo({ imagePath, audioPath, outPath, update, model: m });
}

// Génération DIRECTE d'un plan parlant (modèles « avatar » type OmniHuman) :
// l'image de la scène + la piste voix suffisent — pas de clip OpenArt, pas
// de retouche de bouche. Le visage entier joue la réplique et la vidéo dure
// exactement le temps des paroles.
export async function talkingVideo({ imagePath, audioPath, outPath, update, model }) {
  const key = process.env.FAL_KEY;
  if (!key) {
    throw new Error(
      'La synchro labiale nécessite une clé fal.ai : ajoute FAL_KEY=... dans le fichier .env (https://fal.ai/dashboard/keys).',
    );
  }
  const m = model || lipsyncModel();
  fal.config({ credentials: key });
  update("Envoi de l'image et de la voix à fal.ai…");
  let imageUrl;
  let audioUrl;
  try {
    [imageUrl, audioUrl] = await Promise.all([
      fal.storage.upload(new Blob([fs.readFileSync(imagePath)], { type: mimeFor(imagePath) })),
      fal.storage.upload(new Blob([fs.readFileSync(audioPath)], { type: mimeFor(audioPath) })),
    ]);
  } catch (e) {
    throw falError(e);
  }
  update('Génération du plan parlant (plusieurs minutes)…');
  let result;
  try {
    result = await withTimeout(
      fal.subscribe(m, {
        input: {
          image_url: imageUrl,
          audio_url: audioUrl,
          prompt:
            'The person speaks the audio naturally with subtle believable gestures and expressions, ' +
            'facing camera. Keep the face, clothing, framing and background exactly as in the image.',
        },
        onQueueUpdate: (s) => {
          if (s.status === 'IN_PROGRESS') {
            update('Génération du plan parlant (plusieurs minutes)…');
          }
        },
      }),
      LIPSYNC_TIMEOUT_MS,
      'fal.ai : génération trop longue (délai dépassé).',
    );
  } catch (e) {
    if (/délai dépassé/.test(e?.message || '')) {
      throw e;
    }
    throw falError(e);
  }
  await downloadResultVideo(result?.data || {}, outPath, update);
  return outPath;
}
