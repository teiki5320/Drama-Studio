// ---------- Comptes & adresses : le récapitulatif de l'harmonisation ----------
// Le tableau « avant → après » des sites, adresses mail et comptes (passage
// sous toakeur.com). Rangé dans studio/comptes.json (hors dépôt). Une ligne
// « à faire » cochée prend son résultat (apres) et rejoint sa section (vers).
// Aucun mot de passe ni aucune clé ici.

import fs from 'node:fs';
import path from 'node:path';
import { STUDIO_DIR } from './studio.js';

const FICHIER = path.join(STUDIO_DIR, 'comptes.json');
export const ETATS = ['a_faire', 'fait', 'garde', 'impossible'];

function lire() {
  try {
    const d = JSON.parse(fs.readFileSync(FICHIER, 'utf8'));
    return Array.isArray(d.sections) ? d : { sections: [] };
  } catch {
    return { sections: [] };
  }
}

function ecrire(d) {
  const tmp = `${FICHIER}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(d, null, 2));
  fs.renameSync(tmp, FICHIER);
}

export function comptes() {
  return lire();
}

export function changerEtat(id, etat) {
  if (!ETATS.includes(etat)) {
    throw new Error('État inconnu.');
  }
  const d = lire();
  const ligne = d.sections.flatMap((s) => s.lignes).find((l) => l.id === id);
  if (!ligne) {
    throw new Error('Ligne introuvable.');
  }
  ligne.etat = etat;
  ligne.le = etat === 'fait' ? new Date().toISOString().slice(0, 10) : undefined;
  if (etat === 'fait' && ligne.vers) {
    const cible = d.sections.find((s) => s.titre === ligne.vers);
    if (cible) {
      for (const s of d.sections) s.lignes = s.lignes.filter((l) => l !== ligne);
      cible.lignes.push(ligne);
    }
    ligne.resultat = ligne.resultat || ligne.apres;
    delete ligne.quand;
    delete ligne.vers;
  }
  ecrire(d);
  return d;
}
