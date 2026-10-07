// ---------- Audience des sites, lue chez Cloudflare ----------
// Une clé Cloudflare EN LECTURE SEULE (collée dans Réglages) rangée dans
// studio/cloudflare.json — jamais dans le dépôt. Deux sources :
//  - Web Analytics (le petit code de mesure) : visites, pages, pays, sources ;
//  - à défaut, les statistiques de la zone (domaine chez Cloudflare).

import fs from 'node:fs';
import path from 'node:path';
import { STUDIO_DIR } from './studio.js';

const FICHIER = path.join(STUDIO_DIR, 'cloudflare.json');
const API = 'https://api.cloudflare.com/client/v4';

function lire() {
  try {
    return JSON.parse(fs.readFileSync(FICHIER, 'utf8'));
  } catch {
    return {};
  }
}

export function etatCloudflare() {
  return { configure: Boolean(lire().token) };
}

export function enregistrerCle(token) {
  const t = String(token || '').trim();
  if (t.length < 30 || /\s/.test(t)) {
    throw new Error('Clé Cloudflare invalide.');
  }
  fs.writeFileSync(FICHIER, JSON.stringify({ token: t }, null, 2), { mode: 0o600 });
  cache.clear();
}

export function oublierCle() {
  fs.rmSync(FICHIER, { force: true });
  cache.clear();
}

async function rest(chemin) {
  const res = await fetch(`${API}${chemin}`, { headers: { Authorization: `Bearer ${lire().token}` } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.success === false) {
    const msg = j.errors?.[0]?.message || res.status;
    throw new Error(`Cloudflare a refusé (${chemin.split('?')[0]}) : ${msg}`);
  }
  return j.result;
}

async function graphql(query, variables) {
  const res = await fetch(`${API}/graphql`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${lire().token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const j = await res.json().catch(() => ({}));
  if (j.errors?.length) {
    throw new Error(`Cloudflare : ${j.errors[0].message}`);
  }
  return j.data;
}

const RUM = `query ($acc: String!, $tag: String!, $debut: Date!) {
  viewer { accounts(filter: {accountTag: $acc}) {
    parJour: rumPageloadEventsAdaptiveGroups(limit: 400, filter: {siteTag: $tag, date_geq: $debut}, orderBy: [date_ASC]) { count sum { visits } dimensions { date } }
    pages: rumPageloadEventsAdaptiveGroups(limit: 15, filter: {siteTag: $tag, date_geq: $debut}, orderBy: [count_DESC]) { count dimensions { requestPath } }
    pays: rumPageloadEventsAdaptiveGroups(limit: 10, filter: {siteTag: $tag, date_geq: $debut}, orderBy: [count_DESC]) { count dimensions { countryName } }
    sources: rumPageloadEventsAdaptiveGroups(limit: 10, filter: {siteTag: $tag, date_geq: $debut}, orderBy: [count_DESC]) { count dimensions { refererHost } }
  } }
}`;

const ZONE = `query ($zone: String!, $debut: Date!) {
  viewer { zones(filter: {zoneTag: $zone}) {
    httpRequests1dGroups(limit: 400, filter: {date_geq: $debut}, orderBy: [date_ASC]) {
      dimensions { date }
      sum { pageViews countryMap { clientCountryName requests } }
      uniq { uniques }
    }
  } }
}`;

const PAYS = new Intl.DisplayNames(['fr'], { type: 'region' });
const nomPays = (code) => {
  try {
    return code && code.length === 2 ? PAYS.of(code) : code || '—';
  } catch {
    return code || '—';
  }
};

async function siteRum(acc, s, debut) {
  const d = await graphql(RUM, { acc, tag: s.site_tag, debut });
  const a = d.viewer.accounts[0] || {};
  return {
    nom: s.host || s.ruleset?.zone_name || s.site_tag,
    source: 'Web Analytics',
    jours: (a.parJour || []).map((g) => ({ date: g.dimensions.date, visiteurs: g.sum.visits, vues: g.count })),
    pages: (a.pages || []).map((g) => ({ nom: g.dimensions.requestPath || '/', vues: g.count })),
    pays: (a.pays || []).map((g) => ({ nom: nomPays(g.dimensions.countryName), vues: g.count })),
    sources: (a.sources || []).map((g) => ({ nom: g.dimensions.refererHost || 'Accès direct', vues: g.count })),
  };
}

async function siteZone(z, debut) {
  const d = await graphql(ZONE, { zone: z.id, debut });
  const groupes = d.viewer.zones[0]?.httpRequests1dGroups || [];
  const pays = new Map();
  for (const g of groupes) {
    for (const c of g.sum.countryMap || []) {
      pays.set(c.clientCountryName, (pays.get(c.clientCountryName) || 0) + c.requests);
    }
  }
  return {
    nom: z.name,
    source: 'Domaine',
    jours: groupes.map((g) => ({ date: g.dimensions.date, visiteurs: g.uniq.uniques, vues: g.sum.pageViews })),
    pages: [],
    pays: [...pays.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([c, n]) => ({ nom: nomPays(c), vues: n })),
    sources: [],
  };
}

// Tous les sites, sur la période (en jours). Gardé 10 minutes en mémoire.
const cache = new Map();
export async function audience(jours = 30) {
  if (!lire().token) {
    return { configure: false, sites: [] };
  }
  const n = [7, 30, 90].includes(Number(jours)) ? Number(jours) : 30;
  const deja = cache.get(n);
  if (deja && Date.now() - deja.at < 10 * 60 * 1000) {
    return deja.data;
  }
  const debutD = new Date(Date.now() - (n - 1) * 86400000);
  const debut = debutD.toISOString().slice(0, 10);
  const comptes = await rest('/accounts?per_page=5');
  const acc = comptes[0]?.id;
  const sites = [];
  const erreurs = [];
  const couverts = new Set();
  let rum = [];
  try {
    rum = acc ? await rest(`/accounts/${acc}/rum/site_info/list?per_page=50`) : [];
  } catch (e) {
    erreurs.push(e.message);
  }
  for (const s of rum || []) {
    try {
      const site = await siteRum(acc, s, debut);
      sites.push(site);
      couverts.add(String(site.nom).replace(/^www\./, ''));
    } catch (e) {
      erreurs.push(`${s.host || s.site_tag} : ${e.message}`);
    }
  }
  let zones = [];
  try {
    zones = await rest('/zones?per_page=50');
  } catch (e) {
    erreurs.push(e.message);
  }
  for (const z of zones || []) {
    if (couverts.has(z.name)) {
      continue;
    }
    try {
      const site = await siteZone(z, debut);
      if (site.jours.length) sites.push(site);
    } catch (e) {
      erreurs.push(`${z.name} : ${e.message}`);
    }
  }
  sites.sort((a, b) => total(b) - total(a));
  const data = { configure: true, jours: n, debut, sites, erreurs };
  cache.set(n, { at: Date.now(), data });
  return data;
}

const total = (s) => s.jours.reduce((t, j) => t + (j.visiteurs || 0), 0);
