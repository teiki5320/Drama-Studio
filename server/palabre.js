// ---------- Palabre : les cartes, les fins et le palais du jeu ----------
// Tout vient du dépôt du jeu (assets/contenu/*.json, assets/images, polices,
// sons) : les pubs montrent les vraies cartes, avec leurs vrais effets.
// Jamais la chambre ni les romances (jeu classé adulte).
// Dépôt : PALABRE_REPO (défaut ~/Dev/apps/palabre).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function palabreRepo() {
  const raw = (process.env.PALABRE_REPO || '').trim();
  const dir = raw ? (raw.startsWith('~/') ? path.join(os.homedir(), raw.slice(2)) : raw) : path.join(os.homedir(), 'Dev', 'apps', 'palabre');
  if (!fs.existsSync(path.join(dir, 'assets', 'contenu', 'cartes.json'))) {
    throw new Error('Le dépôt de Palabre est introuvable (~/Dev/apps/palabre, ou PALABRE_REPO dans .env).');
  }
  return dir;
}

const a = (rel) => path.join(palabreRepo(), 'assets', rel);
const lit = (f) => JSON.parse(fs.readFileSync(a(`contenu/${f}`), 'utf8'));
const existe = (rel) => (fs.existsSync(a(rel)) ? a(rel) : null);

// Les personnages des romances : jamais dans une pub.
const ROMANCE = new Set(['epouse', 'epoux']);

// Les cartes qui tiennent seules (ni condition ni chaîne), avec un lendemain
// des deux côtés et un portrait.
export function cartesJouables() {
  const perso = Object.fromEntries(lit('personnages.json').map((p) => [p.id, p]));
  return lit('cartes.json')
    .filter((c) => !c.conditions && !c.chaine && c.gauche?.journal && c.droite?.journal && !ROMANCE.has(c.personnage))
    .map((c) => ({
      id: c.id,
      personnage: c.personnage,
      titrePersonnage: perso[c.personnage]?.titre || '',
      nomPersonnage: perso[c.personnage]?.nom || '',
      portrait: existe(`images/personnages/${c.personnage}_${c.humeur || 'neutre'}.jpg`),
      texte: c.texte,
      gauche: c.gauche,
      droite: c.droite,
    }))
    .filter((c) => c.portrait);
}

// La carte du serment : le jour 1 de tous les mandats.
export function carteSerment() {
  const c = lit('cartes.json').find((x) => x.ouverture);
  const perso = lit('personnages.json').find((p) => p.id === c.personnage);
  return {
    id: c.id,
    personnage: c.personnage,
    titrePersonnage: perso?.titre || '',
    portrait: existe(`images/personnages/${c.personnage}_${c.humeur || 'neutre'}.jpg`),
    texte: c.texte,
    gauche: c.gauche,
    droite: c.droite,
  };
}

export function finsDuJeu() {
  return lit('fins.json')
    .filter((f) => !f.drapeaux_requis)
    .map((f) => ({ ...f, image: existe(`images/${f.image}`) }))
    .filter((f) => f.image);
}

// Les pièces du palais montrées dans les pubs, de la plus nue à la plus
// riche (noms et plaques de lib/moteur/decor.dart). Les objets achetés
// viennent d'objets.json.
export function palais() {
  const objets = lit('objets.json').filter((o) => o.piece !== 'chambre');
  const plaques = (dossier, n = 6) =>
    Array.from({ length: n }, (_, i) => existe(`images/palais/${dossier}/k${i + 1}.jpg`)).filter(Boolean);
  const pieces = [
    {
      id: 'balcon',
      nom: 'Le balcon',
      etapes: [
        { nom: "L'avenue ordinaire", images: plaques('balcon/jour/ordinaire') },
        { nom: 'Le défilé', images: plaques('balcon/jour/defile') },
        { nom: 'La liesse', images: plaques('balcon/nuit/liesse') },
      ],
    },
    {
      id: 'bureau',
      nom: 'Le bureau',
      etapes: [
        { nom: 'Le bureau de travail', images: [existe('images/palais/pieces/bureau_base.jpg')] },
        { nom: 'La porte ouverte', images: [existe('images/palais/pieces/bureau_ouvert.jpg')] },
        { nom: 'Le palais du chef', images: [existe('images/palais/pieces/bureau_chef.jpg')] },
      ],
    },
    {
      id: 'garage',
      nom: 'La cour des voitures',
      etapes: [
        { nom: 'La voiture de fonction', images: [existe('images/palais/pieces/garage_base.jpg')] },
        { nom: 'La sportive', images: [existe('images/palais/pieces/garage_deux.jpg')] },
        { nom: 'Le 4×4 noir', images: [existe('images/palais/pieces/garage_trois.jpg')] },
        { nom: 'Le parc', images: [existe('images/palais/pieces/garage_parc.jpg')] },
      ],
    },
    {
      id: 'piscine',
      nom: 'La piscine',
      etapes: [
        { nom: 'Le bassin vidé', images: [existe('images/palais/pieces/piscine_vide.jpg')] },
        { nom: "L'eau claire", images: [existe('images/palais/pieces/piscine_base.jpg')] },
        { nom: 'Le dimanche du quartier', images: plaques('pieces/piscine_quartier') },
      ],
    },
  ];
  for (const p of pieces) {
    p.etapes = p.etapes.filter((e) => e.images.length && e.images.every(Boolean));
    p.objets = objets.filter((o) => o.piece === p.id);
  }
  return pieces.filter((p) => p.etapes.length);
}

export function fichiersPalabre() {
  return {
    fonts: {
      titre: existe('polices/BricolageGrotesque-ExtraBold.ttf'),
      titreBold: existe('polices/BricolageGrotesque-Bold.ttf'),
      corps: existe('polices/PublicSans-Regular.ttf'),
      corpsSemi: existe('polices/PublicSans-SemiBold.ttf'),
      corpsBold: existe('polices/PublicSans-Bold.ttf'),
    },
    sons: Object.fromEntries(['decision', 'mieux', 'mal', 'caisses', 'reelu', 'battu'].map((s) => [s, existe(`sons/${s}.mp3`)])),
    musiqueBureau: existe('sons/fond/musique_bureau.mp3'),
    ambianceBalcon: existe('sons/fond/balcon_ordinaire.mp3'),
    logo: existe('icone/marque.png') || existe('icone/logo.png'),
  };
}

// Le son d'une réponse, comme le jeu (lib/moteur/sons.dart, seuil 12).
export function sonDeLaReponse(effets) {
  let extreme = 0;
  for (const v of Object.values(effets || {})) {
    if (Math.abs(v) > Math.abs(extreme) || (Math.abs(v) === Math.abs(extreme) && v < extreme)) {
      extreme = v;
    }
  }
  return extreme >= 12 ? 'mieux' : extreme <= -12 ? 'mal' : 'decision';
}

export const JAUGES = ['peuple', 'armee', 'caisses', 'presse'];

export function applique(jauges, effets) {
  const r = { ...jauges };
  for (const j of JAUGES) {
    r[j] = Math.max(0, Math.min(100, r[j] + Math.max(-20, Math.min(20, effets?.[j] || 0))));
  }
  return r;
}
