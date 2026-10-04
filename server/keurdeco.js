// ---------- Keur Déco : les articles du site, lus dans son dépôt ----------
// Chaque article (contenu/articles/*.md) a une grande photo d'ambiance
// (contenu/images/<image>.jpg, paysage HD) et ses objets repérés sur la photo
// (hotspots : produit, x %, y %). Les noms des objets viennent de
// src/data/produits.json. Dépôt : KEURDECO_REPO (défaut ~/Dev/apps/keurdeco).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function keurdecoRepo() {
  const dir = (process.env.KEURDECO_REPO || '').trim() || path.join(os.homedir(), 'Dev', 'apps', 'keurdeco');
  const resolved = dir.startsWith('~/') ? path.join(os.homedir(), dir.slice(2)) : dir;
  if (!fs.existsSync(path.join(resolved, 'contenu', 'articles'))) {
    throw new Error(
      'Le dépôt de Keur Déco est introuvable. Clone-le dans ~/Dev/apps/keurdeco, ou indique son chemin dans .env avec KEURDECO_REPO.',
    );
  }
  return resolved;
}

const unquote = (v) => String(v).trim().replace(/^["']|["']$/g, '');

// Petit lecteur de l'en-tête YAML des articles : « clé: valeur », listes
// « [a, b] » ou « - élément », et objets en ligne « - { produit: x, x: 50 } ».
function enTete(src) {
  const m = src.match(/^---\n([\s\S]*?)\n---/);
  if (!m) {
    return {};
  }
  const out = {};
  let cle = null;
  for (const ligne of m[1].split('\n')) {
    const item = ligne.match(/^\s+-\s+(.*)$/);
    if (item && cle) {
      const v = item[1].trim();
      const obj = v.match(/^\{(.*)\}$/);
      out[cle].push(
        obj
          ? Object.fromEntries(
              obj[1].split(',').map((kv) => {
                const [k, ...rest] = kv.split(':');
                const val = unquote(rest.join(':'));
                return [k.trim(), /^-?\d+(\.\d+)?$/.test(val) ? Number(val) : val];
              }),
            )
          : unquote(v),
      );
      continue;
    }
    const kv = ligne.match(/^([\w-]+):\s*(.*)$/);
    if (!kv) {
      continue;
    }
    cle = kv[1];
    const v = kv[2].trim();
    if (v === '') {
      out[cle] = [];
    } else if (/^\[.*\]$/.test(v)) {
      out[cle] = v
        .slice(1, -1)
        .split(',')
        .map(unquote)
        .filter(Boolean);
    } else {
      out[cle] = unquote(v);
    }
  }
  return out;
}

let cache = null;

export function chargeArticles() {
  const dir = keurdecoRepo();
  const artDir = path.join(dir, 'contenu', 'articles');
  const fichiers = fs.readdirSync(artDir).filter((f) => f.endsWith('.md')).sort();
  const sig = fichiers.map((f) => `${f}:${fs.statSync(path.join(artDir, f)).mtimeMs}`).join('|');
  if (cache && cache.sig === sig) {
    return cache.articles;
  }
  let noms = new Map();
  try {
    const produits = JSON.parse(fs.readFileSync(path.join(dir, 'src/data/produits.json'), 'utf8'));
    noms = new Map((Array.isArray(produits) ? produits : Object.values(produits)).map((p) => [p.id, p.nom]));
  } catch {
    // sans la liste des produits, on garde leurs identifiants
  }
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const articles = [];
  for (const f of fichiers) {
    const h = enTete(fs.readFileSync(path.join(artDir, f), 'utf8'));
    const photo = h.image ? path.join(dir, 'contenu', 'images', `${h.image}.jpg`) : '';
    if (!h.titre || !photo || !fs.existsSync(photo)) {
      continue;
    }
    articles.push({
      slug: f.replace(/\.md$/, ''),
      titre: h.titre,
      description: h.description || '',
      type: h.type || '',
      publie: !h.publie_le || h.publie_le <= aujourdhui,
      pieces: h.pieces || [],
      matieres: h.matieres || [],
      imageAlt: h.image_alt || '',
      photo,
      objets: (h.hotspots || [])
        .filter((p) => p && p.produit && Number.isFinite(p.x) && Number.isFinite(p.y))
        .map((p) => ({ id: p.produit, nom: noms.get(p.produit) || p.produit, x: p.x, y: p.y })),
    });
  }
  cache = { sig, articles };
  return articles;
}

export function logoKeurDeco() {
  const dir = keurdecoRepo();
  for (const rel of ['assets/marque/logo-transparent.png', 'public/images/marque/logo.png', 'assets/marque/logo-fond-blanc.png']) {
    const f = path.join(dir, rel);
    if (fs.existsSync(f)) {
      return f;
    }
  }
  return '';
}

// Les vues « extraordinaires » du format Ambiance.
export const VUES = [
  "l'océan au coucher du soleil",
  'un lac de montagne au petit matin',
  'la savane et ses acacias à l’heure dorée',
  'les dunes du désert sous les étoiles',
  'une forêt tropicale après la pluie',
  'un fleuve africain au crépuscule',
  'une plage de sable blanc et ses cocotiers',
  'les chutes d’eau dans la brume',
];
