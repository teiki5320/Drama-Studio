import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { ROOT } from './config.js';
import { audioDurationSec } from './tts.js';

// « Ma marque » : sticker (logo) et outro (vidéo/image de fin) de l'auteur,
// communs à tous les dramas. Fichiers stockés dans <racine>/studio/.
export const STUDIO_DIR = path.join(ROOT, 'studio');
fs.mkdirSync(STUDIO_DIR, { recursive: true });

const META = path.join(STUDIO_DIR, 'studio.json');

export function loadStudio() {
  try {
    return JSON.parse(fs.readFileSync(META, 'utf8'));
  } catch {
    return {};
  }
}

function persist(s) {
  fs.writeFileSync(META, JSON.stringify(s, null, 2));
  return s;
}

function removeFile(name) {
  if (name) {
    fs.rmSync(path.join(STUDIO_DIR, name), { force: true });
  }
}

export function saveSticker(base64Data) {
  const m = base64Data.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/);
  if (!m) {
    throw new Error('Format attendu : image PNG, JPG ou WebP (PNG transparent recommandé).');
  }
  const ext = m[1] === 'png' ? 'png' : m[1] === 'webp' ? 'webp' : 'jpg';
  const s = loadStudio();
  removeFile(s.sticker);
  s.sticker = `sticker_${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(STUDIO_DIR, s.sticker), Buffer.from(m[2], 'base64'));
  return persist(s);
}

export function removeSticker() {
  const s = loadStudio();
  removeFile(s.sticker);
  s.sticker = null;
  return persist(s);
}

// ffmpeg embarqué par Remotion (compositor-<plateforme>), présent après npm install.
export function findFfmpeg() {
  const dir = path.join(ROOT, 'node_modules', '@remotion');
  try {
    for (const entry of fs.readdirSync(dir)) {
      if (entry.startsWith('compositor-')) {
        const bin = path.join(dir, entry, 'ffmpeg');
        if (fs.existsSync(bin)) {
          return bin;
        }
      }
    }
  } catch {
    // node_modules absent — repli plus bas
  }
  return null;
}

// music-metadata lit mal les MP4 sans piste audio : ffmpeg fait référence.
function videoDurationSec(file) {
  return new Promise((resolve, reject) => {
    const bin = findFfmpeg();
    if (!bin) {
      reject(new Error('ffmpeg introuvable'));
      return;
    }
    execFile(bin, ['-i', file], { timeout: 30000 }, (err, stdout, stderr) => {
      // `ffmpeg -i` sans sortie termine en erreur : la durée est sur stderr.
      const m = String(stderr || '').match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (!m) {
        reject(new Error('durée illisible'));
        return;
      }
      resolve(Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]));
    });
  });
}

// L'outro peut être une vidéo (MP4/MOV) ou une image fixe. Sa durée réelle est
// mesurée pour caler la fin de l'épisode (bornée pour éviter les erreurs d'envoi).
export async function saveOutro(base64Data) {
  const m = base64Data.match(
    /^data:(video\/(?:mp4|quicktime)|image\/(?:png|jpe?g|webp));base64,(.+)$/,
  );
  if (!m) {
    throw new Error('Format attendu : vidéo MP4/MOV ou image PNG/JPG/WebP.');
  }
  const mime = m[1];
  const isVideo = mime.startsWith('video/');
  const ext = isVideo
    ? mime.includes('quicktime')
      ? 'mov'
      : 'mp4'
    : mime.includes('png')
      ? 'png'
      : mime.includes('webp')
        ? 'webp'
        : 'jpg';
  const s = loadStudio();
  removeFile(s.outro);
  s.outro = `outro_${Date.now()}.${ext}`;
  s.outroIsVideo = isVideo;
  const full = path.join(STUDIO_DIR, s.outro);
  fs.writeFileSync(full, Buffer.from(m[2], 'base64'));
  if (isVideo) {
    let dur;
    try {
      dur = await videoDurationSec(full);
    } catch {
      try {
        dur = await audioDurationSec(full);
      } catch {
        dur = 4;
      }
    }
    s.outroDurationSec = Math.min(15, Math.max(1, dur));
  } else {
    s.outroDurationSec = 3.5;
  }
  return persist(s);
}

// Outro propre à une chaîne (mêmes formats que l'outro globale) — le fichier
// vit dans le dossier studio, référencé par le projet de la chaîne.
export async function saveChannelOutro(projectId, base64Data) {
  const m = base64Data.match(
    /^data:(video\/(?:mp4|quicktime)|image\/(?:png|jpe?g|webp));base64,(.+)$/,
  );
  if (!m) {
    throw new Error('Format attendu : vidéo MP4/MOV ou image PNG/JPG/WebP.');
  }
  const mime = m[1];
  const isVideo = mime.startsWith('video/');
  const ext = isVideo
    ? mime.includes('quicktime')
      ? 'mov'
      : 'mp4'
    : mime.includes('png')
      ? 'png'
      : mime.includes('webp')
        ? 'webp'
        : 'jpg';
  const file = `chaine_${projectId}_outro_${Date.now()}.${ext}`;
  const full = path.join(STUDIO_DIR, file);
  fs.writeFileSync(full, Buffer.from(m[2], 'base64'));
  let durationSec = 3.5;
  if (isVideo) {
    try {
      durationSec = Math.min(15, Math.max(1, await videoDurationSec(full)));
    } catch {
      try {
        durationSec = Math.min(15, Math.max(1, await audioDurationSec(full)));
      } catch {
        durationSec = 4;
      }
    }
  }
  return { file, isVideo, durationSec };
}

export function removeChannelOutroFile(file) {
  removeFile(file);
}

export function removeOutro() {
  const s = loadStudio();
  removeFile(s.outro);
  s.outro = null;
  s.outroIsVideo = false;
  s.outroDurationSec = 0;
  return persist(s);
}
