import fs from 'node:fs';

import { chargeRecettes, keurcookRepo, trouveRecette } from './keurcook.js';

// ---------- Recettes Keur Cook ----------
// La source est le DÉPÔT de Keur Cook, lu sur le disque : quantités, unités,
// étapes dans l'ordre et photo du plat y sont complètes, là où la page
// publiée n'en expose qu'une partie. Voir server/keurcook.js.

export const RECIPE_SITE = 'keurcook.com';

export function recipeUrl(slug) {
  return `https://${RECIPE_SITE}/recette/${slug}`;
}

export function minutesToText(min) {
  if (!min) {
    return '';
  }
  const h = Math.floor(min / 60);
  const r = min % 60;
  if (h && r) {
    return `${h} h ${String(r).padStart(2, '0')}`;
  }
  if (h) {
    return `${h} h`;
  }
  return `${r} min`;
}

// « de » s'élide devant une voyelle : « 3 gousses d'ail », « 200 g de farine ».
function de(nom) {
  return /^[aàâeéèêëiîïoôuûüyh]/i.test(nom.normalize('NFC')) ? `d'${nom}` : `de ${nom}`;
}

// [200, « g », « farine »] → « 200 g de farine » ; [2, null, « oignons »] →
// « 2 oignons » ; [null, null, « sel »] → « sel ».
export function ingredientEnTexte({ quantity, unit, name }) {
  const q = quantity === null || quantity === undefined ? '' : String(quantity);
  if (!q) {
    return name;
  }
  return unit ? `${q} ${unit} ${de(name)}` : `${q} ${name}`;
}

// Mise en forme commune : ce que la suite de la chaîne (Claude, le montage,
// la vidéo) reçoit, quelle que soit l'origine de la recette.
function normalise(r) {
  const total = r.prepMinutes + r.cookMinutes;
  return {
    slug: r.slug,
    url: recipeUrl(r.slug),
    name: r.name,
    description: r.shortDescription,
    story: r.story,
    tips: r.tips,
    photo: r.photo, // fichier local, jamais une adresse à télécharger
    country: r.country,
    region: r.region,
    category: r.course,
    servings: r.servings ? `${r.servings} personnes` : '',
    prepMin: r.prepMinutes,
    cookMin: r.cookMinutes,
    totalMin: total,
    totalText: minutesToText(total),
    ingredients: r.ingredients.map(ingredientEnTexte).filter(Boolean).slice(0, 25),
    steps: r.steps.filter(Boolean).slice(0, 15),
  };
}

// Liste pour le menu déroulant du studio.
export function listRecipes() {
  const recettes = chargeRecettes();
  return {
    base: keurcookRepo(),
    site: RECIPE_SITE,
    recipes: recettes.map((r) => ({
      slug: r.slug,
      label: r.country ? `${r.name} — ${r.country}` : r.name,
      country: r.country,
      course: r.course,
    })),
  };
}

// La recette choisie, complète.
export function fetchRecipe(slug) {
  const r = normalise(trouveRecette(slug));
  if (r.ingredients.length === 0 || r.steps.length === 0) {
    throw new Error(`La recette « ${r.name} » n'a ni ingrédients ni étapes exploitables.`);
  }
  return r;
}

// Le texte que lit Claude : la recette telle qu'elle est écrite dans le dépôt.
export function recipeAsText(r) {
  return [
    r.name,
    r.country ? `Pays : ${r.country}${r.region ? ` (${r.region})` : ''}` : '',
    r.totalText ? `Temps total : ${r.totalText}` : '',
    r.servings ? `Pour : ${r.servings}` : '',
    r.description ? `En deux mots : ${r.description}` : '',
    'Ingrédients :',
    ...r.ingredients.map((i) => `- ${i}`),
    'Étapes :',
    ...r.steps.map((st, i) => `${i + 1}. ${st}`),
  ]
    .filter(Boolean)
    .join('\n');
}

// Repli manuel : l'auteur colle nom, pays, ingrédients et étapes.
export function manualRecipe({ name, country, ingredients, steps, description, totalMin }) {
  const list = (s) =>
    String(s || '')
      .split(/\r?\n/)
      .map((x) => x.replace(/^[-•*\d.)\s]+/, '').trim())
      .filter(Boolean);
  const ing = list(ingredients).slice(0, 25);
  const st = list(steps).slice(0, 15);
  if (!String(name || '').trim()) {
    throw new Error('Donne le nom du plat.');
  }
  if (ing.length < 2) {
    throw new Error('Il faut au moins deux ingrédients (un par ligne).');
  }
  if (st.length < 2) {
    throw new Error('Il faut au moins deux étapes (une par ligne).');
  }
  const total = Number(totalMin) || 0;
  return {
    slug: '',
    url: '',
    name: String(name).trim().slice(0, 120),
    description: String(description || '').trim().slice(0, 300),
    story: '',
    tips: [],
    photo: '',
    country: String(country || '').trim().slice(0, 60),
    region: '',
    category: '',
    servings: '',
    prepMin: 0,
    cookMin: 0,
    totalMin: total,
    totalText: minutesToText(total),
    ingredients: ing,
    steps: st,
  };
}

// La photo du plat vient du dépôt : on la recopie telle quelle dans le projet.
// Aucune génération, donc aucun crédit d'image consommé.
export function copyRecipeImage(source, outPath) {
  if (!source || !fs.existsSync(source)) {
    throw new Error('Photo du plat : fichier introuvable dans le dépôt de Keur Cook.');
  }
  const taille = fs.statSync(source).size;
  if (taille < 1000) {
    throw new Error('Photo du plat : fichier vide ou illisible.');
  }
  fs.copyFileSync(source, outPath);
  return taille;
}
