// ---------- Indexation des sites sur Google (Search Console) ----------
// Chaque matin, le Studio lit le plan de chaque site, demande à Google
// l'état de chaque page (API d'inspection d'URL, ~2000 par jour et par
// site) et en tire une liste de problèmes en français, chacun avec sa
// solution. Jean valide : le Studio renvoie lui-même le plan du site à
// Google, ou confie la correction du code à Claude.
//
// Google n'autorise pas un programme à « Demander l'indexation » d'une page
// ordinaire (l'API Indexing est réservée aux offres d'emploi) : pour une page
// urgente, le Studio donne le lien direct vers la page de Google.
//
// Connexion Google (même projet « Studio » que YouTube) et résultats rangés
// dans studio/ — jamais dans le dépôt.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { STUDIO_DIR } from './studio.js';

const CONNEXION = path.join(STUDIO_DIR, 'searchconsole.json');
const ETAT = path.join(STUDIO_DIR, 'indexation.json');
const CLES = path.join(STUDIO_DIR, 'youtube.json');
const SCOPE = 'https://www.googleapis.com/auth/webmasters';
const PAR_PASSAGE = 250; // pages vérifiées par site et par passage

// Le dépôt local de chaque site, pour les corrections confiées à Claude.
const DEPOTS = {
  'keurcook.com': 'keurcook',
  'keurbook.com': 'Keurbook',
  'keurdeco.com': 'keurdeco',
  'optiled.fr': 'optiled',
};
const DEV = path.join(os.homedir(), 'Dev/apps');

const lireJson = (f, defaut) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return defaut;
  }
};
const ecrireJson = (f, d, mode) => {
  const tmp = `${f}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(d, null, 2), mode ? { mode } : undefined);
  fs.renameSync(tmp, f);
};
const lireEtat = () => lireJson(ETAT, { sites: {} });

// ---------- Connexion Google ----------
const enCours = new Map();
export const estConnexionIndexation = (state) => enCours.has(state);

export function urlConnexionIndexation(redirectUri) {
  const c = lireJson(CLES, {});
  if (!c.clientId) {
    throw new Error('Il faut d’abord les clés Google (Réglages → YouTube).');
  }
  const state = crypto.randomBytes(12).toString('hex');
  enCours.set(state, { redirectUri, at: Date.now() });
  const p = new URLSearchParams({
    client_id: c.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent select_account',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

async function jeton(params) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Google a refusé : ${j.error_description || j.error || res.status}`);
  }
  return j;
}

export async function terminerConnexionIndexation(code, state) {
  const attente = enCours.get(state);
  enCours.delete(state);
  if (!attente || Date.now() - attente.at > 15 * 60 * 1000) {
    throw new Error('Connexion expirée : recommence depuis l’onglet Indexation.');
  }
  const c = lireJson(CLES, {});
  const t = await jeton({ code, client_id: c.clientId, client_secret: c.clientSecret, redirect_uri: attente.redirectUri, grant_type: 'authorization_code' });
  if (!t.refresh_token) {
    throw new Error('Google n’a pas donné de jeton durable : recommence la connexion.');
  }
  ecrireJson(CONNEXION, { refreshToken: t.refresh_token }, 0o600);
}

export function deconnecterIndexation() {
  fs.rmSync(CONNEXION, { force: true });
}

let acces = null;
async function accessToken() {
  if (acces && acces.fin > Date.now() + 60000) {
    return acces.token;
  }
  const { refreshToken } = lireJson(CONNEXION, {});
  if (!refreshToken) {
    throw new Error('Search Console n’est pas connecté.');
  }
  const c = lireJson(CLES, {});
  const t = await jeton({ client_id: c.clientId, client_secret: c.clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' });
  acces = { token: t.access_token, fin: Date.now() + (t.expires_in || 3600) * 1000 };
  return acces.token;
}

async function google(url, { method = 'GET', body } = {}) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${await accessToken()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await res.text();
  const j = txt ? JSON.parse(txt) : {};
  if (!res.ok) {
    const msg = j.error?.message || res.status;
    if (/has not been used|is disabled/i.test(String(msg))) {
      throw new Error('L’API Google Search Console n’est pas activée dans le projet Google « Studio ».');
    }
    throw new Error(`Google : ${msg}`);
  }
  return j;
}

const WM = 'https://www.googleapis.com/webmasters/v3';
const enc = encodeURIComponent;

// ---------- Plans des sites ----------
const domaineDe = (propriete) => propriete.replace(/^sc-domain:/, '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');

async function urlsDuPlan(plan, profondeur = 0) {
  const res = await fetch(plan, { redirect: 'follow' });
  if (!res.ok) {
    return [];
  }
  const xml = await res.text();
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, '&'));
  if (/<sitemapindex/i.test(xml) && profondeur < 2) {
    const toutes = [];
    for (const l of locs) {
      toutes.push(...(await urlsDuPlan(l, profondeur + 1)));
    }
    return toutes;
  }
  return locs;
}

async function plansDuSite(domaine) {
  const res = await fetch(`https://${domaine}/robots.txt`, { redirect: 'follow' }).catch(() => null);
  const txt = res && res.ok ? await res.text() : '';
  const plans = [...txt.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]);
  return plans.length ? plans : [`https://${domaine}/sitemap.xml`];
}

// ---------- Passage : vérifier les pages ----------
async function inspecter(propriete, url) {
  const j = await google('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
    method: 'POST',
    body: { inspectionUrl: url, siteUrl: propriete, languageCode: 'en-US' },
  });
  const r = j.inspectionResult?.indexStatusResult || {};
  return {
    verdict: r.verdict || 'VERDICT_UNSPECIFIED',
    couverture: r.coverageState || '',
    robots: r.robotsTxtState || '',
    indexation: r.indexingState || '',
    recuperation: r.pageFetchState || '',
    canonG: r.googleCanonical || '',
    canonU: r.userCanonical || '',
    dernierCrawl: r.lastCrawlTime || null,
    verifie: new Date().toISOString(),
  };
}

const ilYa = (iso) => (iso ? (Date.now() - new Date(iso).getTime()) / 86400000 : Infinity);

// Les pages à vérifier en priorité : jamais vues, puis à problème, puis le
// reste de temps en temps.
function aVerifier(pages) {
  const score = ([, p]) => {
    if (!p.verifie) return 0;
    if (p.aRevoir && new Date(p.aRevoir) <= new Date()) return 1;
    if (p.verdict !== 'PASS' && ilYa(p.verifie) > 2) return 2;
    if (ilYa(p.verifie) > 14) return 3;
    return 9;
  };
  return Object.entries(pages)
    .map((e) => [e, score(e)])
    .filter(([, s]) => s < 9)
    .sort((a, b) => a[1] - b[1])
    .slice(0, PAR_PASSAGE)
    .map(([[url]]) => url);
}

export async function passage(update = () => {}) {
  const liste = await google(`${WM}/sites`);
  const proprietes = (liste.siteEntry || []).filter((s) => s.permissionLevel !== 'siteUnverifiedUser').map((s) => s.siteUrl);
  if (!proprietes.length) {
    throw new Error('Aucun site dans Search Console pour ce compte Google.');
  }
  const etat = lireEtat();
  let n = 0;
  for (const propriete of proprietes) {
    const domaine = domaineDe(propriete);
    const site = etat.sites[propriete] || { domaine, pages: {} };
    site.domaine = domaine;
    update(`${domaine} : lecture du plan du site…`, n / proprietes.length);
    try {
      site.sitemaps = ((await google(`${WM}/sites/${enc(propriete)}/sitemaps`)).sitemap || []).map((s) => ({
        chemin: s.path,
        erreurs: Number(s.errors || 0),
        alertes: Number(s.warnings || 0),
        envoye: s.lastSubmitted || null,
        lu: s.lastDownloaded || null,
        enAttente: Boolean(s.isPending),
      }));
      const urls = new Set();
      for (const plan of await plansDuSite(domaine)) {
        for (const u of await urlsDuPlan(plan)) {
          urls.add(u);
        }
      }
      site.plans = await plansDuSite(domaine);
      if (urls.size) {
        for (const u of Object.keys(site.pages)) {
          if (!urls.has(u)) delete site.pages[u];
        }
        for (const u of urls) site.pages[u] = site.pages[u] || {};
      }
      const lot = aVerifier(site.pages);
      let i = 0;
      for (const u of lot) {
        update(`${domaine} : vérification des pages (${++i}/${lot.length})…`, (n + i / lot.length) / proprietes.length);
        try {
          site.pages[u] = { ...(await inspecter(propriete, u)), aRevoir: undefined };
        } catch (e) {
          if (/quota/i.test(e.message)) break;
          site.erreur = e.message;
        }
        await new Promise((r) => setTimeout(r, 120));
      }
      site.erreur = undefined;
    } catch (e) {
      site.erreur = e.message;
    }
    site.dernierPassage = new Date().toISOString();
    etat.sites[propriete] = site;
    ecrireJson(ETAT, etat);
    n++;
  }
  etat.dernierPassage = new Date().toISOString();
  ecrireJson(ETAT, etat);
  return { sites: proprietes.length };
}

// ---------- Les problèmes, en français ----------
const lienGoogle = (propriete, url) => `https://search.google.com/search-console/inspect?resource_id=${enc(propriete)}&id=${enc(url)}`;

const FAMILLES = [
  {
    cle: 'inconnue',
    test: (p) => /unknown to Google/i.test(p.couverture),
    titre: 'Pages que Google ne connaît pas encore',
    explication: 'Elles sont dans le plan du site, mais Google n’est pas encore passé les voir.',
    solution: 'Renvoyer le plan du site à Google. Pour une page urgente : « Demander l’indexation ».',
    action: 'plan',
    gravite: 1,
  },
  {
    cle: 'decouverte',
    test: (p) => /Discovered/i.test(p.couverture),
    titre: 'Pages trouvées, pas encore visitées',
    explication: 'Google les a repérées mais attend pour les visiter. Courant pour un site jeune.',
    solution: 'Renvoyer le plan du site à Google. Pour une page urgente : « Demander l’indexation ».',
    action: 'plan',
    gravite: 1,
  },
  {
    cle: 'exploree',
    test: (p) => /Crawled/i.test(p.couverture),
    titre: 'Pages visitées mais pas retenues',
    explication: 'Google les a lues mais les juge trop proches d’autres pages ou trop pauvres.',
    solution: 'Claude enrichit ces pages (texte propre à chaque page, titre et description uniques, liens depuis les autres pages).',
    action: 'claude',
    gravite: 2,
  },
  {
    cle: 'introuvable',
    test: (p) => /NOT_FOUND|SOFT_404/.test(p.recuperation) || /404/.test(p.couverture),
    titre: 'Pages cassées dans le plan du site',
    explication: 'Google tombe sur une page vide ou introuvable.',
    solution: 'Claude répare la page ou la retire du plan du site.',
    action: 'claude',
    gravite: 3,
  },
  {
    cle: 'serveur',
    test: (p) => /SERVER_ERROR|ACCESS_DENIED|ACCESS_FORBIDDEN|INTERNAL_CRAWL_ERROR/.test(p.recuperation),
    titre: 'Pages en erreur',
    explication: 'Le site a répondu par une erreur quand Google est passé.',
    solution: 'Claude cherche la cause et corrige.',
    action: 'claude',
    gravite: 3,
  },
  {
    cle: 'redirection',
    test: (p) => /REDIRECT/.test(p.recuperation) || /redirect/i.test(p.couverture),
    titre: 'Adresses qui redirigent ailleurs',
    explication: 'Le plan du site donne une adresse qui renvoie vers une autre (par exemple sans « www »).',
    solution: 'Claude met les adresses finales dans le plan du site.',
    action: 'claude',
    gravite: 2,
  },
  {
    cle: 'bloquee',
    test: (p) => p.robots === 'DISALLOWED' || /BLOCKED/.test(p.indexation) || /noindex|blocked/i.test(p.couverture),
    titre: 'Pages interdites à Google',
    explication: 'Une consigne du site (robots.txt ou « noindex ») empêche Google de les garder.',
    solution: 'Claude retire le blocage (ou retire la page du plan si le blocage est voulu).',
    action: 'claude',
    gravite: 3,
  },
  {
    cle: 'doublon',
    test: (p) => /Duplicate|Alternate page/i.test(p.couverture),
    titre: 'Pages vues comme des doublons',
    explication: 'Google pense que ces pages copient une autre page et garde l’autre.',
    solution: 'Claude rend chaque page unique, ou indique clairement la page principale.',
    action: 'claude',
    gravite: 2,
  },
];

function famille(p) {
  if (!p.verifie || p.verdict === 'PASS') return null;
  return FAMILLES.find((f) => f.test(p)) || {
    cle: 'autre',
    titre: 'Autres pages non indexées',
    explication: 'Google ne les a pas gardées.',
    solution: 'Claude regarde au cas par cas.',
    action: 'claude',
    gravite: 1,
  };
}

function problemesDuSite(propriete, site, ignores) {
  const groupes = new Map();
  for (const [url, p] of Object.entries(site.pages || {})) {
    const f = famille(p);
    if (!f) continue;
    const g = groupes.get(f.cle) || { ...f, test: undefined, urls: [] };
    g.urls.push({ url, google: lienGoogle(propriete, url), detail: p.couverture });
    groupes.set(f.cle, g);
  }
  const liste = [...groupes.values()];
  for (const s of site.sitemaps || []) {
    if (s.erreurs > 0) {
      liste.push({
        cle: `plan-erreurs:${s.chemin}`,
        titre: 'Le plan du site a des erreurs',
        explication: `Google signale ${s.erreurs} erreur(s) dans ${s.chemin}.`,
        solution: 'Claude corrige le plan du site, puis le Studio le renvoie à Google.',
        action: 'claude',
        gravite: 3,
        urls: [],
      });
    } else if (ilYa(s.lu) > 7) {
      liste.push({
        cle: `plan-vieux:${s.chemin}`,
        titre: 'Google n’a pas relu le plan du site depuis longtemps',
        explication: s.lu ? `Dernière lecture le ${s.lu.slice(0, 10).split('-').reverse().join('/')}.` : 'Google ne l’a jamais lu.',
        solution: 'Renvoyer le plan du site à Google.',
        action: 'plan',
        gravite: 1,
        urls: [],
      });
    }
  }
  if (!(site.sitemaps || []).length && (site.plans || []).length) {
    liste.push({
      cle: 'plan-absent',
      titre: 'Le plan du site n’a jamais été donné à Google',
      explication: 'Sans lui, Google trouve les pages beaucoup plus lentement.',
      solution: 'Envoyer le plan du site à Google.',
      action: 'plan',
      gravite: 2,
      urls: [],
    });
  }
  return liste
    .map((g) => ({ ...g, id: `${propriete}|${g.cle}`, corrige: ignores[`${propriete}|${g.cle}`] || null }))
    .sort((a, b) => b.gravite - a.gravite || b.urls.length - a.urls.length);
}

export function etatIndexation() {
  const connecte = Boolean(lireJson(CONNEXION, {}).refreshToken);
  const etat = lireEtat();
  const suivis = etat.suivis || {};
  const sites = Object.entries(etat.sites).map(([propriete, s]) => {
    const pages = Object.values(s.pages || {});
    return {
      propriete,
      domaine: s.domaine,
      total: pages.length,
      verifiees: pages.filter((p) => p.verifie).length,
      indexees: pages.filter((p) => p.verdict === 'PASS').length,
      sitemaps: s.sitemaps || [],
      erreur: s.erreur || null,
      dernierPassage: s.dernierPassage || null,
      problemes: problemesDuSite(propriete, s, suivis),
      depot: Boolean(depotDe(s.domaine)),
    };
  });
  return { connecte, configure: Boolean(lireJson(CLES, {}).clientId), dernierPassage: etat.dernierPassage || null, sites };
}

export function depotDe(domaine) {
  const nom = DEPOTS[domaine];
  const d = nom && path.join(DEV, nom);
  return d && fs.existsSync(d) ? d : null;
}

// ---------- Corriger ----------
export async function renvoyerPlans(propriete) {
  const etat = lireEtat();
  const site = etat.sites[propriete];
  if (!site) throw new Error('Site inconnu.');
  const plans = (site.plans || []).length ? site.plans : await plansDuSite(site.domaine);
  for (const plan of plans) {
    await google(`${WM}/sites/${enc(propriete)}/sitemaps/${enc(plan)}`, { method: 'PUT' });
  }
  return plans;
}

// La consigne donnée à Claude pour un problème.
export function consigneClaude(probleme, domaine) {
  const exemples = probleme.urls.slice(0, 40).map((u) => `- ${u.url}${u.detail ? ` (${u.detail})` : ''}`).join('\n');
  return `Tu travailles en autonomie sur le site ${domaine} (ce dépôt). Lis d'abord le CLAUDE.md du dépôt s'il existe et respecte ses règles.

Google Search Console signale ce problème d'indexation :
« ${probleme.titre} » — ${probleme.explication}
${exemples ? `Pages concernées (${probleme.urls.length} au total) :\n${exemples}\n` : ''}
Correction attendue : ${probleme.solution}

Règles :
1. git checkout main && git pull --ff-only avant tout.
2. Corrige la cause à la source (gabarits, génération du plan du site, métadonnées), pas page par page à la main quand un gabarit est en cause.
3. N'invente aucun fait ; ne supprime pas de contenu utile ; ne touche pas aux liens d'affiliation.
4. Vérifie que le site se construit (la commande de build du dépôt, si elle existe).
5. Commit en français sur main (message clair, finissant par « Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com> »), puis git push.
6. Termine par un compte rendu de 3 lignes maximum, en français simple, sans jargon : ce que tu as changé.`;
}

export function trouverProbleme(id) {
  const [propriete] = id.split('|');
  const p = etatIndexation().sites.find((s) => s.propriete === propriete);
  const prob = p && p.problemes.find((x) => x.id === id);
  if (!prob) throw new Error('Problème introuvable (déjà réglé ?).');
  return { site: p, probleme: prob };
}

// Noté « corrigé » : on garde le compte rendu, et Google revérifie ces
// pages au prochain passage qui suit 3 jours.
export function noterCorrection(id, compteRendu) {
  const etat = lireEtat();
  etat.suivis = etat.suivis || {};
  etat.suivis[id] = { le: new Date().toISOString(), compteRendu: String(compteRendu || '').slice(-1500) };
  const [propriete] = id.split('|');
  const site = etat.sites[propriete];
  if (site) {
    const { probleme } = trouverProbleme(id);
    const revoir = new Date(Date.now() + 3 * 86400000).toISOString();
    for (const u of probleme.urls) {
      if (site.pages[u.url]) site.pages[u.url].aRevoir = revoir;
    }
  }
  ecrireJson(ETAT, etat);
}

// Un passage par jour, à partir de 7 h, quand le Studio est allumé.
export function passageDuJour() {
  const { connecte } = etatIndexation();
  const dernier = lireEtat().dernierPassage;
  const maintenant = new Date();
  return connecte && maintenant.getHours() >= 7 && (!dernier || new Date(dernier).toDateString() !== maintenant.toDateString());
}
