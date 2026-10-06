// ---------- Planning des réseaux sociaux ----------
// Les vidéos VALIDÉES de toutes les applis arrivent « à placer » ; on les
// pose sur un jour, avec les réseaux choisis (TikTok, YouTube, Pinterest).
// Publication manuelle pour l'instant : on coche « publié » réseau par
// réseau. Rangé dans studio/planning.json.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { STUDIO_DIR } from './studio.js';
import { listProjects, loadProject } from './projects.js';
import { tiktokCaption } from '../shared/catalog.js';
import { appLook } from '../src/apps.js';

export const RESEAUX = ['tiktok', 'youtube', 'pinterest'];
const FICHIER = path.join(STUDIO_DIR, 'planning.json');

function lire() {
  try {
    const d = JSON.parse(fs.readFileSync(FICHIER, 'utf8'));
    return Array.isArray(d) ? d : [];
  } catch {
    return [];
  }
}

function ecrire(entrees) {
  const tmp = `${FICHIER}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(entrees, null, 2));
  fs.renameSync(tmp, FICHIER);
}

// Une vidéo du Studio, telle que le planning l'affiche.
function fiche(p, ep) {
  const depot = String(p.repo || '').split('/').pop().toLowerCase();
  const nomAppli = p.mode === 'recette' ? 'Recettes Keur Cook' : p.kind === 'pub' ? appLook(depot, p.title).name : p.title;
  const vignette = (ep.scenes || []).find((s) => s.image && !s.image.startsWith('erea-'))?.image || null;
  return {
    projectId: p.id,
    number: ep.number,
    appli: nomAppli,
    depot: p.mode === 'recette' ? 'recettes' : depot,
    titre: String(ep.title || ep.topic || `Vidéo ${ep.number}`),
    vignette: vignette ? `/files/${p.id}/${vignette}` : null,
    video: `/files/${p.id}/${ep.renderedFile}`,
    legende: tiktokCaption(p, ep),
  };
}

// Toutes les vidéos validées, à jour (une vidéo supprimée ou remise « à
// valider » sort du planning toute seule).
function videosValidees() {
  const out = new Map();
  for (const s of listProjects()) {
    const p = loadProject(s.id);
    if (!p || !(p.kind === 'pub' || p.mode === 'recette' || p.mode === 'chaine')) {
      continue;
    }
    for (const ep of p.episodes || []) {
      if (ep.renderedFile && ep.validation === 'validee') {
        out.set(`${p.id}:${ep.number}`, fiche(p, ep));
      }
    }
  }
  return out;
}

export function planning() {
  const videos = videosValidees();
  const entrees = lire();
  const valides = entrees.filter((e) => videos.has(`${e.projectId}:${e.number}`));
  if (valides.length !== entrees.length) {
    ecrire(valides);
  }
  const placees = new Set(valides.map((e) => `${e.projectId}:${e.number}`));
  return {
    aPlacer: [...videos.entries()].filter(([k]) => !placees.has(k)).map(([, v]) => v),
    entrees: valides.map((e) => ({ ...e, video: videos.get(`${e.projectId}:${e.number}`) })),
  };
}

const jourValide = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));

export function placer({ projectId, number, date, reseaux }) {
  const videos = videosValidees();
  if (!videos.has(`${projectId}:${Number(number)}`)) {
    throw new Error('Seule une vidéo validée peut aller au planning.');
  }
  if (!jourValide(date)) {
    throw new Error('Jour invalide.');
  }
  const choisis = (reseaux || []).filter((r) => RESEAUX.includes(r));
  if (!choisis.length) {
    throw new Error('Choisis au moins un réseau.');
  }
  const entrees = lire().filter((e) => !(e.projectId === projectId && e.number === Number(number)));
  const e = {
    id: `pl_${crypto.randomBytes(5).toString('hex')}`,
    projectId,
    number: Number(number),
    date,
    reseaux: Object.fromEntries(choisis.map((r) => [r, { publie: false }])),
  };
  entrees.push(e);
  ecrire(entrees);
  return e;
}

export function modifier(id, { date, publie }) {
  const entrees = lire();
  const e = entrees.find((x) => x.id === id);
  if (!e) {
    throw new Error('Introuvable dans le planning.');
  }
  if (date !== undefined) {
    if (!jourValide(date)) {
      throw new Error('Jour invalide.');
    }
    e.date = date;
  }
  if (publie && RESEAUX.includes(publie.reseau) && e.reseaux[publie.reseau]) {
    e.reseaux[publie.reseau].publie = Boolean(publie.fait);
  }
  ecrire(entrees);
  return e;
}

export function retirer(id) {
  ecrire(lire().filter((e) => e.id !== id));
}

// Une entrée du planning et sa vidéo (pour la publier).
export function entree(id) {
  return lire().find((e) => e.id === id) || null;
}

// Publiée sur un réseau par le Studio : coche + lien.
export function noterPublication(id, reseau, infos) {
  const entrees = lire();
  const e = entrees.find((x) => x.id === id);
  if (!e || !e.reseaux[reseau]) {
    return;
  }
  e.reseaux[reseau] = { ...e.reseaux[reseau], publie: true, ...infos };
  ecrire(entrees);
}
