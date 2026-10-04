// ---------- OptiLED : les cultures et leurs vrais chiffres ----------
// Les chiffres des pubs sont ceux du site : on compile avec esbuild ses
// propres fonctions (build/pages-legumes.ts : exemple chiffré de chaque fiche
// culture, réglages par défaut du calculateur) et on les appelle ici.
// Photo de chaque culture : public/images/legumes/<id>.webp.
// Dépôt : OPTILED_REPO (défaut ~/Dev/apps/optiled).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function optiledRepo() {
  const raw = (process.env.OPTILED_REPO || '').trim();
  const dir = raw ? (raw.startsWith('~/') ? path.join(os.homedir(), raw.slice(2)) : raw) : path.join(os.homedir(), 'Dev', 'apps', 'optiled');
  if (!fs.existsSync(path.join(dir, 'build', 'pages-legumes.ts'))) {
    throw new Error("Le dépôt d'OptiLED est introuvable (~/Dev/apps/optiled, ou OPTILED_REPO dans .env).");
  }
  return dir;
}

let cache = null;

export async function chargeCultures() {
  const dir = optiledRepo();
  const sig = ['src/data/legumes.json', 'src/calc.ts', 'build/pages-legumes.ts']
    .map((f) => fs.statSync(path.join(dir, f)).mtimeMs)
    .join('|');
  if (cache && cache.sig === sig) {
    return cache.cultures;
  }
  const { build } = await import('esbuild');
  const out = path.join(os.tmpdir(), `optiled-data-${Date.now()}.mjs`);
  await build({
    stdin: {
      contents: `export { exempleCalcul, surfaceExemple, stadeLePlusExigeant } from './build/pages-legumes.ts';
export { chargerLegumes } from './build/fiches.ts';`,
      resolveDir: dir,
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: out,
    logLevel: 'error',
  });
  const m = await import(pathToFileURL(out).href);
  fs.rmSync(out, { force: true });
  const legumes = JSON.parse(fs.readFileSync(path.join(dir, 'src/data/legumes.json'), 'utf8')).legumes;
  const liste = Array.isArray(legumes) ? legumes : Object.values(legumes);
  const cultures = [];
  for (const l of liste) {
    const photo = path.join(dir, 'public', 'images', 'legumes', `${l.id}.webp`);
    if (!fs.existsSync(photo)) {
      continue;
    }
    try {
      const v = (x) => (x && typeof x === 'object' && 'valeur' in x ? x.valeur : x);
      const stade = l.stades?.floraison ? 'floraison' : 'croissance';
      const p = l.stades?.[stade] || l.stades?.croissance;
      const params = {
        ppfd: v(p.ppfd),
        photoperiode: v(p.photoperiode),
        hauteur_cm: v(p.hauteur_cm),
      };
      const surface = m.surfaceExemple(l);
      // exempleCalcul attend les paramètres du site tels quels (valeur + source).
      const r = m.exempleCalcul(p, surface);
      cultures.push({
        id: l.id,
        nom: l.nom,
        famille: l.famille,
        difficulte: v(l.difficulte),
        stade,
        surface: surface.nom,
        ppfd: params.ppfd,
        heures: params.photoperiode,
        dli: Math.round(r.dli * 10) / 10,
        puissanceW: Math.round(r.puissanceW),
        barres: r.barres.total,
        coutAnEur: r.coutAnEur == null ? null : Math.round(r.coutAnEur),
        photo,
      });
    } catch (e) {
      console.error(`OptiLED — ${l.id} :`, e.message);
    }
  }
  cache = { sig, cultures };
  return cultures;
}
