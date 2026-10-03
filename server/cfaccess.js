// ---------- Accès depuis l'iPad : Cloudflare Access ----------
// Le studio reste lié à ce Mac (127.0.0.1). Un tunnel Cloudflare le rend
// joignable à une adresse publique (PUBLIC_HOST, ex. studio.keurcook.com),
// et Cloudflare Access n'y laisse entrer qu'après un code reçu par e-mail.
// Double sécurité : chaque requête arrivant par cette adresse doit porter le
// badge signé par Cloudflare (en-tête Cf-Access-Jwt-Assertion), vérifié ici.
//
// .env : PUBLIC_HOST, CF_ACCESS_TEAM (le « xxx » de xxx.cloudflareaccess.com)
// et, si possible, CF_ACCESS_AUD (« Application Audience (AUD) Tag » de
// l'application). Sans AUD, seuls les badges signés pour l'équipe sont
// acceptés — et l'AUD vu passe dans le journal du serveur, prêt à être noté.

import crypto from 'node:crypto';

const CERTS_TTL_MS = 60 * 60 * 1000;
let certsCache = { team: null, at: 0, keys: [] };
let loggedAud = false;

export function publicHost() {
  return String(process.env.PUBLIC_HOST || '').trim().toLowerCase();
}

function accessConfig() {
  const team = String(process.env.CF_ACCESS_TEAM || '')
    .trim()
    .toLowerCase()
    .replace(/\.cloudflareaccess\.com$/, '');
  const aud = String(process.env.CF_ACCESS_AUD || '').trim();
  return team ? { team, aud, issuer: `https://${team}.cloudflareaccess.com` } : null;
}

async function signingKeys(cfg, { fresh = false } = {}) {
  if (!fresh && certsCache.team === cfg.team && Date.now() - certsCache.at < CERTS_TTL_MS) {
    return certsCache.keys;
  }
  const res = await fetch(`${cfg.issuer}/cdn-cgi/access/certs`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    throw new Error(`clés Cloudflare illisibles (${res.status})`);
  }
  const { keys = [] } = await res.json();
  certsCache = { team: cfg.team, at: Date.now(), keys };
  return keys;
}

const b64url = (s) => Buffer.from(s, 'base64url');

// Vérifie le badge Cloudflare : signature RS256, audience, émetteur, validité.
export async function verifyAccessToken(token) {
  const cfg = accessConfig();
  if (!cfg) {
    throw new Error('Cloudflare Access non configuré (CF_ACCESS_TEAM)');
  }
  const parts = String(token || '').split('.');
  if (parts.length !== 3) {
    throw new Error('badge absent');
  }
  const header = JSON.parse(b64url(parts[0]).toString('utf8'));
  const payload = JSON.parse(b64url(parts[1]).toString('utf8'));
  if (header.alg !== 'RS256') {
    throw new Error('algorithme refusé');
  }
  let jwk = (await signingKeys(cfg)).find((k) => k.kid === header.kid);
  if (!jwk) {
    // Cloudflare fait tourner ses clés : on recharge une fois.
    jwk = (await signingKeys(cfg, { fresh: true })).find((k) => k.kid === header.kid);
  }
  if (!jwk) {
    throw new Error('clé de signature inconnue');
  }
  const ok = crypto.verify(
    'RSA-SHA256',
    Buffer.from(`${parts[0]}.${parts[1]}`),
    crypto.createPublicKey({ key: jwk, format: 'jwk' }),
    b64url(parts[2]),
  );
  if (!ok) {
    throw new Error('signature invalide');
  }
  const now = Math.floor(Date.now() / 1000);
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (cfg.aud && !auds.includes(cfg.aud)) {
    throw new Error('badge destiné à une autre application');
  }
  if (!cfg.aud && !loggedAud) {
    loggedAud = true;
    console.log(`  🔑 Cloudflare Access : AUD de l'application = ${auds.join(', ')} (à mettre dans CF_ACCESS_AUD)`);
  }
  if (payload.iss !== cfg.issuer) {
    throw new Error('émetteur inconnu');
  }
  if (typeof payload.exp !== 'number' || payload.exp < now - 30) {
    throw new Error('badge expiré');
  }
  return payload;
}
