// ---------- Comptes des réseaux sociaux (Planning) ----------
// Plusieurs comptes par réseau (TikTok, YouTube, Pinterest). Un compte peut
// être « proposé » pour certaines applis (dépôts) : le Planning le coche
// d'office quand on place une vidéo de ces applis ; un compte sans appli
// cochée sert de repli. Rangé dans studio/reseaux.json (hors dépôt).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { STUDIO_DIR } from './studio.js';

export const RESEAUX = ['tiktok', 'youtube', 'pinterest'];
const LIBELLES = { tiktok: 'TikTok', youtube: 'YouTube', pinterest: 'Pinterest' };
const FICHIER = path.join(STUDIO_DIR, 'reseaux.json');

function lire() {
  try {
    const d = JSON.parse(fs.readFileSync(FICHIER, 'utf8'));
    return Array.isArray(d) ? d : [];
  } catch {
    return [];
  }
}

function ecrire(liste) {
  const tmp = `${FICHIER}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(liste, null, 2));
  fs.renameSync(tmp, FICHIER);
}

const propre = (c) => ({
  id: c.id,
  reseau: c.reseau,
  nom: String(c.nom || ''),
  applis: Array.isArray(c.applis) ? c.applis.map(String) : [],
});

// Rangés par réseau, dans l'ordre d'ajout.
export function listeComptes() {
  return lire()
    .map(propre)
    .map((c, i) => [c, i])
    .sort(([a, i], [b, j]) => RESEAUX.indexOf(a.reseau) - RESEAUX.indexOf(b.reseau) || i - j)
    .map(([c]) => c);
}

function nomValide(nom) {
  const n = String(nom || '').trim();
  if (n.length < 1 || n.length > 60) {
    throw new Error('Donne un nom de compte (60 caractères au plus).');
  }
  return n;
}

const applisValides = (applis) =>
  [...new Set((Array.isArray(applis) ? applis : []).map((a) => String(a).toLowerCase()).filter((a) => /^[\w.-]{1,40}$/.test(a)))];

export function ajouterCompte({ reseau, nom, applis }) {
  if (!RESEAUX.includes(reseau)) {
    throw new Error('Réseau inconnu.');
  }
  const n = nomValide(nom);
  const liste = lire();
  if (liste.some((c) => c.reseau === reseau && c.nom.toLowerCase() === n.toLowerCase())) {
    throw new Error('Ce compte existe déjà.');
  }
  const c = { id: `cpt_${crypto.randomBytes(5).toString('hex')}`, reseau, nom: n, applis: applisValides(applis) };
  liste.push(c);
  ecrire(liste);
  return propre(c);
}

export function modifierCompte(id, { nom, applis }) {
  const liste = lire();
  const c = liste.find((x) => x.id === id);
  if (!c) {
    throw new Error('Compte introuvable.');
  }
  if (nom !== undefined) {
    c.nom = nomValide(nom);
  }
  if (applis !== undefined) {
    c.applis = applisValides(applis);
  }
  ecrire(liste);
  return propre(c);
}

export function retirerCompte(id) {
  ecrire(lire().filter((c) => c.id !== id));
}

// Premier compte du réseau, créé au besoin (conversion de l'ancien planning).
export function compteParDefaut(reseau) {
  const existant = lire().find((c) => c.reseau === reseau);
  return existant ? propre(existant) : ajouterCompte({ reseau, nom: LIBELLES[reseau] || reseau });
}

// Comptes cochés d'office pour une vidéo de cette appli.
export function comptesProposes(depot) {
  const liste = listeComptes();
  const pour = liste.filter((c) => c.applis.includes(String(depot || '').toLowerCase()));
  return (pour.length ? pour : liste.filter((c) => !c.applis.length)).map((c) => c.id);
}
