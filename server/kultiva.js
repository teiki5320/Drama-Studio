// ---------- Kultiva : catalogue, calendrier et images kawaii de l'appli ----------
// kultiva-catalog.json : chaque espèce a ses mois de semis et de récolte en
// France et en Afrique de l'Ouest. Images de l'appli (propriété de Kultiva) :
// assets/images/vegetables/<id>.png (légumes détourés), creatures/Poussia/P1…
// (le Tamassi, étape par étape), backgrounds/*.png (fonds pastel),
// app_icon.png. Dépôt : KULTIVA_REPO (défaut ~/Dev/apps/kultiva).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function kultivaRepo() {
  const raw = (process.env.KULTIVA_REPO || '').trim();
  const dir = raw ? (raw.startsWith('~/') ? path.join(os.homedir(), raw.slice(2)) : raw) : path.join(os.homedir(), 'Dev', 'apps', 'kultiva');
  if (!fs.existsSync(path.join(dir, 'kultiva-catalog.json'))) {
    throw new Error('Le dépôt de Kultiva est introuvable (~/Dev/apps/kultiva, ou KULTIVA_REPO dans .env).');
  }
  return dir;
}

export const REGIONS = { france: 'France', west_africa: "Afrique de l'Ouest" };
export const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const img = (rel) => {
  const p = path.join(kultivaRepo(), 'assets', 'images', rel);
  return fs.existsSync(p) ? p : '';
};

export function chargeEspeces() {
  const c = JSON.parse(fs.readFileSync(path.join(kultivaRepo(), 'kultiva-catalog.json'), 'utf8'));
  const liste = Array.isArray(c) ? c : c.items || Object.values(c);
  return liste
    .filter((e) => e.kind === 'species' && e.regions)
    .map((e) => ({
      id: e.id,
      nom: e.name,
      emoji: e.emoji || '',
      description: e.description || '',
      note: e.note || '',
      semis: e.sowing_technique || '',
      profondeur: e.sowing_depth || '',
      exposition: e.exposure || '',
      arrosage: e.watering || '',
      regions: e.regions,
      illustration: img(`vegetables/${e.id}.png`),
    }))
    .filter((e) => e.illustration);
}

// Les espèces à semer tel mois dans telle région.
export function aSemer(region, mois) {
  return chargeEspeces().filter((e) => (e.regions?.[region]?.sowing_months || []).includes(mois));
}

// Le Tamassi, de l'œuf à sa forme finale (P1 → P11).
export function tamassi() {
  const dir = path.join(kultivaRepo(), 'assets', 'images', 'creatures', 'Poussia');
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir)
    .filter((f) => /^P\d+\.png$/i.test(f))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))
    .map((f) => path.join(dir, f));
}

export const fondPastel = (moment = 'morning') => img(`backgrounds/${moment}.png`);
export const iconeKultiva = () => img('app_icon.png');
