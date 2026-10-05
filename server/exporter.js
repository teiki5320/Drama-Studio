import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { projectDir, listProjects, loadProject } from './projects.js';
import { tiktokCaption } from '../shared/catalog.js';
import { appLook } from '../src/apps.js';

// Dossier d'export des épisodes validés : Bureau/Dramas/<Titre du drama>/
// EXPORT_DIR dans .env pour changer, avec le raccourci EXPORT_DIR=icloud
// qui vise iCloud Drive → Dramas (synchronisé sur tous les appareils).
function resolveExportRoot() {
  const raw = (process.env.EXPORT_DIR || '').trim();
  if (raw.toLowerCase() === 'icloud') {
    return path.join(
      os.homedir(),
      'Library',
      'Mobile Documents',
      'com~apple~CloudDocs',
      'Dramas',
    );
  }
  // « ~ » ou « ~/… » = dossier personnel (les chemins iCloud s'écrivent
  // souvent ainsi). Le shell ne développe pas le tilde ici : à nous de le faire,
  // sinon on fabrique un dossier littéralement nommé « ~ ».
  // « ~ » seul viserait le dossier personnel lui-même (et les chaînes iraient
  // dans /Users) : on range alors dans ~/Dramas.
  if (raw === '~' || raw === '~/') {
    return path.join(os.homedir(), 'Dramas');
  }
  if (raw.startsWith('~/')) {
    return path.resolve(os.homedir(), raw.slice(2));
  }
  if (!raw) {
    return path.join(os.homedir(), 'Desktop', 'Dramas');
  }
  // Un chemin relatif viserait le dossier courant, c'est-à-dire le dépôt
  // lui-même : on le rattache au dossier personnel, jamais au code.
  // path.resolve retire aussi le « / » final (sinon « Dramas/ Synchro »).
  return path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(os.homedir(), raw);
}

export const EXPORT_ROOT = resolveExportRoot();
// Chaque version range ses dramas à part (ex. iCloud/Dramas Synchro, /Dramas Long).
export const EXPORT_ROOT_SYNCHRO = `${EXPORT_ROOT} Synchro`;
export const EXPORT_ROOT_LONG = `${EXPORT_ROOT} Long`;

// Pubs, recettes et chaînes : sur le Bureau (synchronisé avec iCloud),
// rangées comme les onglets du Studio :
//   Bureau/Publicité/<Appli>/            (Erea, Kultiva, Palabre…)
//   Bureau/Publicité/Keur Cook/Publicité
//   Bureau/Publicité/Keur Cook/Recettes
//   Bureau/Chaîne/<Chaîne>/
const BUREAU = path.join(os.homedir(), 'Desktop');
function dossierStudio(project) {
  if (!project) {
    return null;
  }
  if (project.mode === 'recette') {
    return path.join(BUREAU, 'Publicité', 'Keur Cook', 'Recettes');
  }
  if (project.kind === 'pub') {
    const depot = String(project.repo || '').split('/').pop().toLowerCase();
    if (depot === 'keurcook') {
      return path.join(BUREAU, 'Publicité', 'Keur Cook', 'Publicité');
    }
    return path.join(BUREAU, 'Publicité', sanitizeName(appLook(depot, project.title).name));
  }
  if (project.mode === 'chaine') {
    return path.join(BUREAU, 'Chaîne', sanitizeName(project.title));
  }
  return null;
}

export function exportRootFor(project) {
  const studio = dossierStudio(project);
  if (studio) {
    return studio;
  }
  if (project && project.mode === 'synchro') {
    return EXPORT_ROOT_SYNCHRO;
  }
  if (project && project.mode === 'long') {
    return EXPORT_ROOT_LONG;
  }
  // Chaîne et Recettes : un dossier au nom du projet, à côté de Dramas.
  if (project && (project.mode === 'chaine' || project.mode === 'recette')) {
    return path.join(path.dirname(EXPORT_ROOT), sanitizeName(project.title));
  }
  return EXPORT_ROOT;
}

export function sanitizeName(s) {
  return (
    String(s || '')
      .replace(/[\/\\:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || 'Drama'
  );
}

// Dossier d'export d'un drama (ex. iCloud Drive/Dramas/Ma Sœur, Mon Poison).
// Pour une chaîne, la racine EST déjà le dossier de la chaîne.
export function projectExportDir(project) {
  if (project && (project.mode === 'chaine' || project.mode === 'recette')) {
    return exportRootFor(project);
  }
  return path.join(exportRootFor(project), sanitizeName(project.title));
}

// Nom de fichier = légende TikTok (titre + hashtags) : TikTok pré-remplit la
// description avec le nom du fichier au moment de la publication.
function episodeFileName(project, episode) {
  const caption = tiktokCaption(project, episode)
    .replace(/[\/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  // Trop long : on coupe avant le dernier hashtag entier (jamais « #pourt »).
  let nom = caption;
  while (nom.length > 180 && nom.includes(' #')) {
    nom = nom.slice(0, nom.lastIndexOf(' #'));
  }
  return `${nom.slice(0, 180)}.mp4`;
}

// Copie le MP4 d'un épisode validé vers le dossier du drama sur le Bureau.
// Ne lève jamais : l'export ne doit pas faire échouer un rendu.
export function exportEpisode(project, episode) {
  try {
    if (!episode.renderedFile) {
      return null;
    }
    const src = path.join(projectDir(project.id), episode.renderedFile);
    if (!fs.existsSync(src)) {
      return null;
    }
    const dir = projectExportDir(project);
    fs.mkdirSync(dir, { recursive: true });
    // Supprime les anciens exports de CET épisode (ancien nom « Episode NN - … »
    // ou légende différente) pour éviter les doublons après renommage.
    // macOS peut refuser la LECTURE d'un dossier iCloud (EPERM) alors que la
    // copie passe : le nettoyage est optionnel, la copie reste prioritaire.
    try {
      const oldPrefix = `Episode ${String(episode.number).padStart(2, '0')}`;
      // Recette : le nom EXACT du plat suivi d'un séparateur de la légende
      // (« — » ou « # ») — sinon exporter « Poulet » effacerait « Poulet yassa ».
      const recipeName = sanitizeName((episode.recipe && episode.recipe.name) || episode.title || '');
      const newPrefixes =
        project.mode === 'recette'
          ? [`${recipeName} — `, `${recipeName} #`, `${recipeName}.mp4`]
          : [`Épisode ${episode.number} `];
      for (const f of fs.readdirSync(dir)) {
        if (f.endsWith('.mp4') && (f.startsWith(oldPrefix) || newPrefixes.some((x) => f.startsWith(x)))) {
          fs.rmSync(path.join(dir, f), { force: true });
        }
      }
    } catch {
      // dossier illisible (permissions iCloud) — d'éventuels doublons à l'ancien
      // nom peuvent rester, mais l'épisode est bien exporté.
    }
    const dest = path.join(dir, episodeFileName(project, episode));
    fs.copyFileSync(src, dest);
    // L'ancienne copie de CET épisode (autre nom ou autre dossier) disparaît :
    // une seule copie par vidéo, toujours au bon endroit.
    if (episode.exportedTo && episode.exportedTo !== dest && fs.existsSync(episode.exportedTo)) {
      try {
        fs.rmSync(episode.exportedTo, { force: true });
      } catch {
        // iCloud peut refuser : l'ancienne copie reste, sans gravité.
      }
    }
    return dest;
  } catch (e) {
    console.error('Export Bureau impossible :', e.message);
    return null;
  }
}

// Synchronise tous les épisodes validés de tous les dramas (au démarrage,
// pour rattraper ceux produits avant l'existence de l'export).
export function exportAllProjects() {
  let copied = 0;
  try {
    for (const summary of listProjects()) {
      const project = loadProject(summary.id);
      if (!project) {
        continue;
      }
      for (const episode of project.episodes || []) {
        if (exportEpisode(project, episode)) {
          copied++;
        }
      }
    }
  } catch (e) {
    console.error('Synchronisation Bureau/Dramas :', e.message);
  }
  return copied;
}
