// ---------- Site internet → fiche d'appli ----------
// L'onglet Publicité peut partir d'un site (keurcook.com…) au lieu d'un dépôt
// GitHub : on lit la page d'accueil, on n'en garde que le texte, et Claude
// remplit la fiche avec. Seules les adresses publiques sont lues — jamais
// ce Mac ni le réseau local.

import dns from 'node:dns/promises';
import net from 'node:net';

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 20000;

// Adresses privées, locales ou réservées : interdites.
function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) {
    return isPrivateAddress(v6.slice(7));
  }
  return v6 === '::1' || v6 === '::' || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6);
}

export function normalizeSiteUrl(raw) {
  let s = String(raw || '').trim();
  if (!s) {
    throw new Error('Colle l’adresse du site.');
  }
  if (!/^https?:\/\//i.test(s)) {
    s = `https://${s}`;
  }
  let u;
  try {
    u = new URL(s);
  } catch {
    throw new Error('Adresse de site invalide.');
  }
  if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) {
    throw new Error('Adresse de site invalide.');
  }
  return u;
}

async function assertPublicHost(u) {
  const addrs = await dns.lookup(u.hostname, { all: true }).catch(() => []);
  if (addrs.length === 0) {
    throw new Error(`Le site ${u.hostname} est introuvable.`);
  }
  if (addrs.some((a) => isPrivateAddress(a.address))) {
    throw new Error('Seuls les sites publics peuvent être lus.');
  }
}

async function readLimited(res) {
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    size += value.length;
    chunks.push(value);
    if (size >= MAX_BYTES) {
      await reader.cancel();
      break;
    }
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function fetchHtml(startUrl) {
  let u = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(u);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(u, {
        redirect: 'manual',
        signal: ctrl.signal,
        headers: { 'User-Agent': 'DramaStudio/1.0 (publicite)', Accept: 'text/html' },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        u = new URL(res.headers.get('location'), u);
        if (!/^https?:$/.test(u.protocol)) {
          throw new Error('Redirection vers une adresse non web.');
        }
        continue;
      }
      if (!res.ok) {
        throw new Error(`Le site a répondu ${res.status}.`);
      }
      return { url: u, html: await readLimited(res) };
    } catch (e) {
      if (e.name === 'AbortError') {
        throw new Error('Le site n’a pas répondu à temps.');
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('Trop de redirections.');
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decode(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

function meta(html, name) {
  const re = new RegExp(
    `<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["']`,
    'i',
  );
  const m = html.match(re);
  return m ? decode(m[1] || m[2]).trim() : '';
}

// Tout ce qu'on peut tirer de la page d'accueil, en texte brut.
export async function fetchSiteBrief(rawUrl, { textChars = 9000 } = {}) {
  const { url, html } = await fetchHtml(normalizeSiteUrl(rawUrl));
  const title = decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').trim();
  const text = decode(
    html
      .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<\/(p|div|h[1-6]|li|section|article|br|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
  const host = url.hostname.replace(/^www\./, '');
  return {
    url: url.href,
    host,
    title: title.slice(0, 200),
    description: (meta(html, 'description') || meta(html, 'og:description')).slice(0, 500),
    siteName: (meta(html, 'og:site_name') || '').slice(0, 100),
    text: text.slice(0, textChars),
  };
}
