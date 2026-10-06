// ---------- YouTube : publication des Shorts depuis le Planning ----------
// Clés OAuth (projet Google Cloud « Studio ») et jeton de connexion rangés
// dans studio/youtube.json — jamais dans le dépôt (studio/ est ignoré).
// Tant que YouTube n'a pas audité l'appli, il met en privé les vidéos
// envoyées par l'API : il suffit alors de les passer en public dans YouTube
// Studio, en attendant l'audit.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { STUDIO_DIR } from './studio.js';

const FICHIER = path.join(STUDIO_DIR, 'youtube.json');
const SCOPES = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'];

function lire() {
  try {
    return JSON.parse(fs.readFileSync(FICHIER, 'utf8'));
  } catch {
    return {};
  }
}
function ecrire(c) {
  fs.writeFileSync(FICHIER, JSON.stringify(c, null, 2), { mode: 0o600 });
}

export function etatYoutube() {
  const c = lire();
  return { configure: Boolean(c.clientId && c.clientSecret), connecte: Boolean(c.refreshToken), chaine: c.chaine || null };
}

export function enregistrerCles({ clientId, clientSecret }) {
  const id = String(clientId || '').trim();
  const secret = String(clientSecret || '').trim();
  if (!/\.apps\.googleusercontent\.com$/.test(id) || secret.length < 10) {
    throw new Error('ID client ou code secret invalide (l’ID finit par .apps.googleusercontent.com).');
  }
  ecrire({ ...lire(), clientId: id, clientSecret: secret });
}

export function deconnecter() {
  const c = lire();
  delete c.refreshToken;
  delete c.chaine;
  ecrire(c);
}

// La connexion : Google renvoie sur la même adresse que celle d'où l'on vient
// (studio.keurcook.com depuis l'iPad, localhost sur le Mac).
const enCours = new Map();
export function urlConnexion(redirectUri) {
  const c = lire();
  if (!c.clientId) {
    throw new Error('Colle d’abord l’ID client et le code secret.');
  }
  const state = crypto.randomBytes(12).toString('hex');
  enCours.set(state, { redirectUri, at: Date.now() });
  const p = new URLSearchParams({
    client_id: c.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
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

export async function terminerConnexion(code, state) {
  const attente = enCours.get(state);
  enCours.delete(state);
  if (!attente || Date.now() - attente.at > 15 * 60 * 1000) {
    throw new Error('Connexion expirée : recommence depuis les Réglages.');
  }
  const c = lire();
  const t = await jeton({
    code,
    client_id: c.clientId,
    client_secret: c.clientSecret,
    redirect_uri: attente.redirectUri,
    grant_type: 'authorization_code',
  });
  if (!t.refresh_token) {
    throw new Error('Google n’a pas donné de jeton durable : recommence la connexion.');
  }
  c.refreshToken = t.refresh_token;
  try {
    const r = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
      headers: { Authorization: `Bearer ${t.access_token}` },
    });
    const j = await r.json();
    c.chaine = j.items && j.items[0] ? j.items[0].snippet.title : null;
  } catch {
    c.chaine = null;
  }
  ecrire(c);
  return c.chaine;
}

async function accessToken() {
  const c = lire();
  if (!c.refreshToken) {
    throw new Error('YouTube n’est pas connecté (Réglages → Connecter YouTube).');
  }
  const t = await jeton({
    client_id: c.clientId,
    client_secret: c.clientSecret,
    refresh_token: c.refreshToken,
    grant_type: 'refresh_token',
  });
  return t.access_token;
}

// Envoi en reprise (« resumable ») : une session, puis le fichier d'un bloc.
export async function publierShort(fichier, { titre, description }, update = () => {}) {
  const token = await accessToken();
  const taille = fs.statSync(fichier).size;
  update('Préparation de l’envoi à YouTube…', 0.05);
  const meta = {
    snippet: {
      title: String(titre || 'Vidéo').slice(0, 100),
      description: `${String(description || '').slice(0, 4800)}\n\n#Shorts`,
      categoryId: '22',
      defaultLanguage: 'fr',
    },
    status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
  };
  const s = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': 'video/mp4',
      'X-Upload-Content-Length': String(taille),
    },
    body: JSON.stringify(meta),
  });
  if (!s.ok) {
    const j = await s.json().catch(() => ({}));
    throw new Error(`YouTube a refusé l’envoi : ${j.error?.message || s.status}`);
  }
  const url = s.headers.get('location');
  update('Envoi de la vidéo à YouTube…', 0.2);
  const r = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(taille) },
    body: fs.readFileSync(fichier),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.id) {
    throw new Error(`L’envoi à YouTube a échoué : ${j.error?.message || r.status}`);
  }
  return { id: j.id, url: `https://youtube.com/shorts/${j.id}`, prive: j.status?.privacyStatus !== 'public' };
}
