import { setTimeout as delay } from 'node:timers/promises';

// ---------- Recettes Alohash ----------
// Chaque fiche du site porte un bloc <script type="application/ld+json"> de
// type schema.org « Recipe ». On le lit côté serveur pour remplir la recette
// (nom, pays, temps, ingrédients, étapes) sans rien saisir à la main.
// La base est réglable : RECIPE_SITE_URL dans .env.

const DEFAULT_SITE = 'https://teiki5320.github.io/alohash';

export function recipeSiteUrl() {
  return (process.env.RECIPE_SITE_URL || DEFAULT_SITE).trim().replace(/\/+$/, '');
}

async function fetchText(url, { timeoutMs = 20000, label = 'la page' } = {}) {
  if (!/^https?:\/\//i.test(url)) {
    throw new Error('Adresse invalide (elle doit commencer par http:// ou https://).');
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'DramaStudio/1.0 (recettes)' },
    });
    if (!res.ok) {
      throw new Error(`${label} a répondu ${res.status}.`);
    }
    return await res.text();
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error(`${label} n'a pas répondu à temps (${Math.round(timeoutMs / 1000)} s).`);
    }
    throw new Error(`${label} est injoignable : ${e.message}`);
  } finally {
    clearTimeout(timer);
  }
}

// Jolie étiquette à partir du slug : « poulet-yassa » → « Poulet yassa ».
function labelFromSlug(slug) {
  const s = slug.replace(/-/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Liste des recettes du site : les URL du sitemap qui contiennent /recette/.
export async function listRecipes() {
  const base = recipeSiteUrl();
  const xml = await fetchText(`${base}/sitemap.xml`, { label: 'Le sitemap du site' });
  const urls = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
  const seen = new Set();
  const recipes = [];
  for (const url of urls) {
    const m = url.match(/\/recette\/([^/?#]+)\/?$/);
    if (!m || seen.has(m[1])) {
      continue;
    }
    seen.add(m[1]);
    recipes.push({ slug: m[1], url: url.replace(/\/?$/, '/'), label: labelFromSlug(m[1]) });
  }
  recipes.sort((a, b) => a.label.localeCompare(b.label, 'fr'));
  return { base, recipes };
}

// « PT1H55M » → 115 minutes.
export function isoDurationToMinutes(iso) {
  const m = String(iso || '').match(/^P(?:([\d.]+)D)?T?(?:([\d.]+)H)?(?:([\d.]+)M)?/i);
  if (!m) {
    return 0;
  }
  return Math.round((Number(m[1] || 0) * 24 + Number(m[2] || 0)) * 60 + Number(m[3] || 0));
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

// Aplatit @graph / tableaux et retrouve le premier objet de type Recipe.
function findRecipeNode(data) {
  const stack = Array.isArray(data) ? [...data] : [data];
  while (stack.length > 0) {
    const node = stack.shift();
    if (!node || typeof node !== 'object') {
      continue;
    }
    if (Array.isArray(node['@graph'])) {
      stack.push(...node['@graph']);
    }
    const type = node['@type'];
    const types = Array.isArray(type) ? type : [type];
    if (types.includes('Recipe')) {
      return node;
    }
  }
  return null;
}

function stripHtml(s) {
  return String(s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// Étapes : HowToStep, HowToSection (avec itemListElement), ou simple texte.
function flattenInstructions(raw) {
  const out = [];
  const walk = (node) => {
    if (!node) {
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node === 'string') {
      const t = stripHtml(node);
      if (t) {
        out.push(t);
      }
      return;
    }
    if (typeof node === 'object') {
      if (Array.isArray(node.itemListElement)) {
        walk(node.itemListElement);
        return;
      }
      const t = stripHtml(node.text || node.name);
      if (t) {
        out.push(t);
      }
    }
  };
  walk(raw);
  return out;
}

function firstImage(img) {
  if (!img) {
    return '';
  }
  if (typeof img === 'string') {
    return img;
  }
  if (Array.isArray(img)) {
    return firstImage(img[0]);
  }
  if (typeof img === 'object') {
    return firstImage(img.url || img.contentUrl);
  }
  return '';
}

export function normalizeRecipe(node, url) {
  const prep = isoDurationToMinutes(node.prepTime);
  const cook = isoDurationToMinutes(node.cookTime);
  const total = isoDurationToMinutes(node.totalTime) || prep + cook;
  const ingredients = (Array.isArray(node.recipeIngredient) ? node.recipeIngredient : [])
    .map(stripHtml)
    .filter(Boolean)
    .slice(0, 25);
  const steps = flattenInstructions(node.recipeInstructions).slice(0, 15);
  if (ingredients.length === 0 || steps.length === 0) {
    throw new Error("La fiche ne contient ni ingrédients ni étapes exploitables.");
  }
  return {
    url: url || '',
    name: stripHtml(node.name) || 'Recette',
    description: stripHtml(node.description),
    image: firstImage(node.image),
    country: stripHtml(node.recipeCuisine),
    category: stripHtml(node.recipeCategory),
    servings: stripHtml(node.recipeYield),
    prepMin: prep,
    cookMin: cook,
    totalMin: total,
    totalText: minutesToText(total),
    ingredients,
    steps,
  };
}

// Importe une recette depuis l'URL de sa fiche.
export async function fetchRecipe(url) {
  const html = await fetchText(url, { label: 'La fiche recette' });
  const blocks = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)];
  if (blocks.length === 0) {
    throw new Error("Cette page ne contient pas de fiche recette lisible (bloc JSON-LD absent).");
  }
  for (const b of blocks) {
    let data;
    try {
      data = JSON.parse(b[1].trim());
    } catch {
      continue;
    }
    const node = findRecipeNode(data);
    if (node) {
      return normalizeRecipe(node, url);
    }
  }
  throw new Error("Aucune recette (schema.org Recipe) trouvée sur cette page.");
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
    url: '',
    name: String(name).trim().slice(0, 120),
    description: String(description || '').trim().slice(0, 300),
    image: '',
    country: String(country || '').trim().slice(0, 60),
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

// Télécharge la photo du plat fini (celle du JSON-LD) pour l'utiliser telle
// quelle dans la vidéo — aucune génération d'image, donc aucun crédit.
export async function downloadRecipeImage(url, outPath) {
  if (!/^https?:\/\//i.test(url)) {
    throw new Error('Photo du plat : adresse invalide.');
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) {
      throw new Error(`la photo a répondu ${res.status}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1000) {
      throw new Error('photo vide ou illisible');
    }
    const fs = await import('node:fs');
    fs.writeFileSync(outPath, buf);
    return buf.length;
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error('Photo du plat : délai dépassé.');
    }
    throw new Error(`Photo du plat : ${e.message}`);
  } finally {
    clearTimeout(timer);
  }
}

export { delay };
