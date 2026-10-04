import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ---------- Les recettes de Keur Cook, lues dans son dépôt ----------
// Les 46 recettes du site vivent dans `src/lib/demo/recipes*.ts`, en données
// typées : quantités, unités, étapes dans l'ordre, photo du plat. On les lit
// DIRECTEMENT dans le clone local — rien à interroger en ligne, et on récupère
// les consignes complètes que la page publiée n'expose pas.
//
// Emplacement réglable : KEURCOOK_REPO dans .env.

const FICHIERS = [
  // L'ordre reproduit celui de `demoRecipes` dans recipes.ts.
  ['src/lib/demo/recipes.ts', 'const seeds'],
  ['src/lib/demo/recipes-ouest.ts', 'export const recipesAfriqueOuest'],
  ['src/lib/demo/recipes-centre.ts', 'export const recipesAfriqueCentrale'],
  ['src/lib/demo/recipes-est-australe.ts', 'export const recipesAfriqueEstAustrale'],
  ['src/lib/demo/recipes-douceurs.ts', 'export const recipesDouceurs'],
];

const CANDIDATS = [
  path.join(os.homedir(), 'Dev/apps/keurcook'),
  path.join(os.homedir(), 'Dev/apps/alohash'), // ancien nom du dossier
];

function estDepot(dir) {
  return Boolean(dir) && fs.existsSync(path.join(dir, FICHIERS[0][0]));
}

// Chemin du clone local de keurcook, ou null s'il est introuvable.
export function keurcookRepo() {
  const regle = String(process.env.KEURCOOK_REPO || '').trim();
  if (regle) {
    const abs = path.resolve(regle.replace(/^~(?=\/|$)/, os.homedir()));
    return estDepot(abs) ? abs : null;
  }
  return CANDIDATS.find(estDepot) || null;
}

export function exigeDepot() {
  const dir = keurcookRepo();
  if (!dir) {
    throw new Error(
      "Le dépôt de Keur Cook est introuvable. Clone-le dans ~/Dev/apps/keurcook, " +
        'ou indique son chemin dans .env avec KEURCOOK_REPO.',
    );
  }
  return dir;
}

// Extrait le tableau littéral qui suit un marqueur, en comptant les crochets
// et en ignorant ceux qui sont à l'intérieur d'une chaîne.
function litteralApres(source, marqueur, fichier) {
  const depart = source.indexOf(marqueur);
  if (depart < 0) {
    throw new Error(`${fichier} : « ${marqueur} » introuvable.`);
  }
  // On part du signe « = » : le crochet de l'annotation de type
  // (`: RecipeSeed[]`) se trouve AVANT lui et ne doit pas être pris.
  const egal = source.indexOf('=', depart);
  const ouvre = egal < 0 ? -1 : source.indexOf('[', egal);
  if (ouvre < 0) {
    throw new Error(`${fichier} : aucun tableau après « ${marqueur} ».`);
  }
  let profondeur = 0;
  let chaine = null;
  for (let i = ouvre; i < source.length; i++) {
    const c = source[i];
    if (chaine) {
      if (c === '\\') {
        i++;
      } else if (c === chaine) {
        chaine = null;
      }
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      chaine = c;
      continue;
    }
    if (c === '[') {
      profondeur++;
    } else if (c === ']') {
      profondeur--;
      if (profondeur === 0) {
        return source.slice(ouvre, i + 1);
      }
    }
  }
  throw new Error(`${fichier} : le tableau de « ${marqueur} » n'est pas refermé.`);
}

// Le littéral ne doit contenir QUE des données. S'il contient du code, on
// refuse de l'évaluer plutôt que d'exécuter quelque chose d'inattendu.
const CODE_INTERDIT =
  /\b(?:require|process|globalThis|global|eval|Function|import|fetch|child_process|constructor|__proto__)\b|\$\{|=>/;

function donneesDe(litteral, fichier) {
  if (CODE_INTERDIT.test(litteral)) {
    throw new Error(`${fichier} : le fichier contient du code, pas seulement des recettes.`);
  }
  try {
    // eslint-disable-next-line no-new-func
    return new Function(`"use strict"; return (${litteral});`)();
  } catch (e) {
    throw new Error(`${fichier} : recettes illisibles (${e.message}).`);
  }
}

// Code pays → nom lisible, pris dans src/lib/countries.ts.
function chargePays(dir) {
  const f = path.join(dir, 'src/lib/countries.ts');
  const pays = new Map();
  if (!fs.existsSync(f)) {
    return pays;
  }
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/code:\s*"([A-Z]{2})"[\s\S]{0,200}?name:\s*"([^"]+)"/g)) {
    pays.set(m[1], m[2]);
  }
  return pays;
}

// Les fichiers ne changent qu'à la main : on relit seulement si l'un d'eux a
// bougé (date de modification).
let cache = null;

function signature(dir) {
  return FICHIERS.map(([rel]) => {
    try {
      return String(fs.statSync(path.join(dir, rel)).mtimeMs);
    } catch {
      return '0';
    }
  }).join('|');
}

// Toutes les recettes du dépôt, dans l'ordre du site.
export function chargeRecettes() {
  const dir = exigeDepot();
  const sig = `${dir}#${signature(dir)}`;
  if (cache && cache.sig === sig) {
    return cache.recettes;
  }
  const pays = chargePays(dir);
  const recettes = [];
  for (const [rel, marqueur] of FICHIERS) {
    const src = fs.readFileSync(path.join(dir, rel), 'utf8');
    const brut = donneesDe(litteralApres(src, marqueur, rel), rel);
    if (!Array.isArray(brut)) {
      throw new Error(`${rel} : « ${marqueur} » n'est pas une liste.`);
    }
    for (const r of brut) {
      if (!r || !r.slug || !Array.isArray(r.steps)) {
        continue;
      }
      const photo = path.join(dir, 'public/recipes', `${r.slug}.webp`);
      recettes.push({
        slug: String(r.slug),
        name: String(r.name || r.slug),
        country: pays.get(r.countryCode) || '',
        countryCode: String(r.countryCode || ''),
        region: r.region || '',
        course: r.course || '',
        shortDescription: String(r.shortDescription || ''),
        story: String(r.story || ''),
        prepMinutes: Number(r.prepMinutes) || 0,
        cookMinutes: Number(r.cookMinutes) || 0,
        servings: Number(r.servings) || 0,
        difficulty: Number(r.difficulty) || 0,
        ingredients: (Array.isArray(r.ingredients) ? r.ingredients : []).map((i) => ({
          quantity: i[0] ?? null,
          unit: i[1] ?? null,
          name: String(i[2] || ''),
          productSlug: i[3] ? String(i[3]) : null,
        })),
        steps: r.steps.map((s) => String(s)),
        tips: Array.isArray(r.tips) ? r.tips.map(String) : [],
        tags: Array.isArray(r.tags) ? r.tags.map(String) : [],
        photo: fs.existsSync(photo) ? photo : '',
      });
    }
  }
  if (recettes.length === 0) {
    throw new Error("Le dépôt de Keur Cook n'a livré aucune recette.");
  }
  cache = { sig, recettes };
  return recettes;
}

export function trouveRecette(slug) {
  const r = chargeRecettes().find((x) => x.slug === String(slug || '').trim());
  if (!r) {
    throw new Error(`Recette « ${slug} » introuvable dans le dépôt de Keur Cook.`);
  }
  return r;
}

// ---------- Produits rares (boutique) ----------
// Deux sources : catalog.ts (graines « seeds », la catégorie passe par un
// appel cat("…")) et catalog-nouveautes.ts. Photo : public/products/<slug>.webp.
const PRODUITS = [
  ['src/lib/demo/catalog.ts', 'const seeds'],
  ['src/lib/demo/catalog-nouveautes.ts', 'export const nouveauxProduits'],
];

let cacheProduits = null;

export function chargeProduits() {
  const dir = exigeDepot();
  const sig = PRODUITS.map(([rel]) => {
    try {
      return String(fs.statSync(path.join(dir, rel)).mtimeMs);
    } catch {
      return '0';
    }
  }).join('|');
  if (cacheProduits && cacheProduits.sig === sig) {
    return cacheProduits.produits;
  }
  const produits = [];
  for (const [rel, marqueur] of PRODUITS) {
    const f = path.join(dir, rel);
    if (!fs.existsSync(f)) {
      continue;
    }
    const litteral = litteralApres(fs.readFileSync(f, 'utf8'), marqueur, rel);
    if (CODE_INTERDIT.test(litteral)) {
      throw new Error(`${rel} : le fichier contient du code, pas seulement des produits.`);
    }
    let brut;
    try {
      // cat("epices") → "epices" : seul appel autorisé dans ces données.
      // eslint-disable-next-line no-new-func
      brut = new Function('cat', `"use strict"; return (${litteral});`)((x) => String(x));
    } catch (e) {
      throw new Error(`${rel} : produits illisibles (${e.message}).`);
    }
    for (const p of Array.isArray(brut) ? brut : []) {
      if (!p || !p.slug) {
        continue;
      }
      const photo = path.join(dir, 'public/products', `${p.slug}.webp`);
      produits.push({
        slug: String(p.slug),
        name: String(p.name || p.slug),
        originCountry: p.originCountry ? String(p.originCountry) : '',
        originRegion: p.originRegion ? String(p.originRegion) : '',
        shortDescription: String(p.shortDescription || ''),
        description: String(p.description || ''),
        usageTips: p.usageTips ? String(p.usageTips) : '',
        photo: fs.existsSync(photo) ? photo : '',
      });
    }
  }
  cacheProduits = { sig, produits };
  return produits;
}

// Logo de Keur Cook (fin des pubs).
export function logoKeurCook() {
  const dir = exigeDepot();
  for (const rel of ['public/brand/keurcook-logo.webp', 'public/brand/keurcook-embleme.webp']) {
    const f = path.join(dir, rel);
    if (fs.existsSync(f)) {
      return f;
    }
  }
  return '';
}

// ---------- « Tour d'Afrique » : une pub par pays ----------
// Pour chaque pays : son plat emblématique (une recette du site avec photo,
// de préférence celle qui utilise un produit rare de la boutique) et
// l'ingrédient secret (ce produit rare, avec sa photo). Ordre : celui du site.
export function tourAfrique() {
  const produits = new Map(chargeProduits().filter((p) => p.photo).map((p) => [p.slug, p]));
  // Tous les couples (plat, produit rare) possibles, pays par pays.
  const candidats = new Map();
  for (const r of chargeRecettes()) {
    if (!r.country || !r.photo) {
      continue;
    }
    for (const i of r.ingredients) {
      const prod = produits.get(i.productSlug);
      if (prod) {
        if (!candidats.has(r.country)) {
          candidats.set(r.country, { code: r.countryCode, couples: [] });
        }
        candidats.get(r.country).couples.push({ recette: r, produit: prod });
      }
    }
  }
  // Un pays après l'autre, on prend de préférence un produit encore jamais
  // montré : chaque pub fait découvrir un ingrédient différent.
  const vus = new Set();
  const tour = [];
  for (const [pays, { code, couples }] of candidats) {
    const choix = couples.find((c) => !vus.has(c.produit.slug)) || couples[0];
    vus.add(choix.produit.slug);
    tour.push({ pays, code, recette: choix.recette, produit: choix.produit });
  }
  return tour;
}
