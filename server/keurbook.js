// ---------- Keurbook : les livres du site, lus dans son dépôt ----------
// Les données sont du TypeScript qui assemble plusieurs fichiers
// (src/lib/demo/index.ts → allBooks, allAuthors) : on les compile avec esbuild
// (déjà installé avec Vite) dans un fichier temporaire, puis on l'importe.
// Recompilé seulement quand un fichier de données change.
// Dépôt : KEURBOOK_REPO (défaut ~/Dev/apps/Keurbook).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function keurbookRepo() {
  const raw = (process.env.KEURBOOK_REPO || '').trim();
  const candidats = raw
    ? [raw.startsWith('~/') ? path.join(os.homedir(), raw.slice(2)) : raw]
    : [path.join(os.homedir(), 'Dev', 'apps', 'Keurbook'), path.join(os.homedir(), 'Dev', 'apps', 'keurbook')];
  const dir = candidats.find((d) => fs.existsSync(path.join(d, 'src', 'lib', 'demo', 'index.ts')));
  if (!dir) {
    throw new Error('Le dépôt de Keurbook est introuvable (~/Dev/apps/Keurbook, ou KEURBOOK_REPO dans .env).');
  }
  return dir;
}

function signature(dir) {
  const demo = path.join(dir, 'src', 'lib', 'demo');
  return fs
    .readdirSync(demo)
    .map((f) => `${f}:${fs.statSync(path.join(demo, f)).mtimeMs}`)
    .join('|');
}

function chargePays(dir) {
  const f = path.join(dir, 'src/lib/countries.ts');
  const pays = new Map();
  if (fs.existsSync(f)) {
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/code:\s*"([A-Z]{2})"[\s\S]{0,200}?name:\s*"([^"]+)"/g)) {
      pays.set(m[1], m[2]);
    }
  }
  return pays;
}

let cache = null;

export async function chargeLivres() {
  const dir = keurbookRepo();
  const sig = signature(dir);
  if (cache && cache.sig === sig) {
    return cache.livres;
  }
  const { build } = await import('esbuild');
  const out = path.join(os.tmpdir(), `keurbook-data-${Date.now()}.mjs`);
  await build({
    entryPoints: [path.join(dir, 'src/lib/demo/index.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: out,
    logLevel: 'error',
  });
  const data = await import(pathToFileURL(out).href);
  fs.rmSync(out, { force: true });
  const pays = chargePays(dir);
  const auteurs = new Map((data.allAuthors || []).map((a) => [a.slug, a]));
  const livres = [];
  for (const b of data.allBooks || []) {
    if (b.isPublished === false) {
      continue;
    }
    const illustration = path.join(dir, 'public', 'illustrations', `${b.slug}.webp`);
    if (!fs.existsSync(illustration)) {
      continue;
    }
    const contrib = (b.contributors || []).find((c) => c.authorSlug) || (b.contributors || [])[0] || {};
    const a = auteurs.get(contrib.authorSlug) || null;
    livres.push({
      slug: b.slug,
      titre: b.title,
      kind: b.kind,
      auteur: (b.contributors || []).map((c) => c.name).join(', '),
      pays: a ? pays.get(a.countryCode) || '' : '',
      annee: b.year || null,
      genre: b.genre || '',
      themes: b.themes || [],
      resume: b.summary || '',
      raisons: b.whyRead || [],
      prix: (b.awards || []).map((x) => `${x.name}${x.year ? ` (${x.year})` : ''}`),
      featured: Boolean(b.featured),
      illustration,
    });
  }
  // Les incontournables (mis en avant par le site) passent en premier.
  livres.sort((x, y) => Number(y.featured) - Number(x.featured));
  cache = { sig, livres };
  return livres;
}

export function logoKeurbook() {
  const dir = keurbookRepo();
  for (const rel of ['public/brand/keurbook-logo-nuit.webp', 'public/brand/keurbook-logo.png']) {
    const f = path.join(dir, rel);
    if (fs.existsSync(f)) {
      return f;
    }
  }
  return '';
}
