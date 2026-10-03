import { spawn, execFile } from 'node:child_process';
import { claudeBin } from './claudebin.js';

// Génération d'images via le MCP officiel OpenArt (https://mcp.openart.ai/mcp),
// piloté par Claude Code en mode headless. Le MCP doit être enregistré sur la
// machine et authentifié une fois via `/mcp`.

const TIMEOUT_MS = 8 * 60 * 1000;
// Les vidéos prennent bien plus longtemps qu'une image (files d'attente des modèles).
const VIDEO_TIMEOUT_MS = 25 * 60 * 1000;

// Détecte le nom sous lequel le MCP OpenArt est enregistré (`claude mcp list`).
let mcpNamePromise = null;
function detectMcpName() {
  if (process.env.OPENART_MCP_NAME) {
    return Promise.resolve(process.env.OPENART_MCP_NAME);
  }
  if (!mcpNamePromise) {
    mcpNamePromise = new Promise((resolve, reject) => {
      execFile(claudeBin(), ['mcp', 'list'], { timeout: 60000 }, (err, stdout) => {
        const lines = String(stdout || '').split('\n');
        const hit = lines.find((l) => /openart/i.test(l));
        if (hit) {
          const name = hit.split(':')[0].trim();
          if (name) {
            resolve(name);
            return;
          }
        }
        reject(
          new Error(
            "Le MCP OpenArt n'est pas installé sur cette machine. Installe-le avec : " +
              'claude mcp add --transport http --scope user openart https://mcp.openart.ai/mcp ' +
              "puis authentifie-le via `claude` → /mcp → openart.",
          ),
        );
      });
    });
    mcpNamePromise.catch(() => {
      mcpNamePromise = null;
    });
  }
  return mcpNamePromise;
}

function buildInstruction(prompt, referenceUrls, referenceKind = 'faces') {
  const refs =
    referenceUrls.length > 0 && referenceKind === 'kitchen'
      ? `\n- IMPORTANT — cohérence du décor : utilise cette image comme référence (image-to-image / références externes d'OpenArt). Le plan de travail (même bois, même lumière, même vue du dessus), la vaisselle et les MAINS (même couleur de peau, mêmes mains africaines, aucun visage ni corps) doivent être IDENTIQUES à la référence ; seuls le geste et les aliments changent :\n${referenceUrls.map((u) => `  - ${u}`).join('\n')}`
      : referenceUrls.length > 0
      ? `\n- IMPORTANT — cohérence des visages : utilise ces images comme références de personnages (image-to-image / références externes d'OpenArt), les visages générés doivent être IDENTIQUES à ceux des références :\n${referenceUrls.map((u) => `  - ${u}`).join('\n')}`
      : '';
  return `Tu as accès aux outils MCP OpenArt. Génère UNE SEULE image via OpenArt :
- Prompt : ${prompt}
- Format : vertical 9:16 (par exemple 1080x1920).
- Choisis un modèle photoréaliste de qualité (Seedream, Nano Banana Pro ou équivalent disponible).${refs}
Attends la fin de la génération : tant qu'elle est en cours, revérifie son état avec les outils OpenArt — ne rends JAMAIS la main avant d'avoir le résultat. Puis réponds UNIQUEMENT avec l'URL directe du fichier image généré (une seule ligne, aucune autre phrase). Si la génération échoue, réponds "ERREUR: " suivi de la cause exacte.`;
}

function runClaudeSession(instruction, mcpName, timeoutMs = TIMEOUT_MS, resumeId = null) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      claudeBin(),
      [
        '-p',
        instruction,
        ...(resumeId ? ['--resume', resumeId] : []),
        '--output-format',
        'json',
        '--allowedTools',
        `mcp__${mcpName},mcp__${mcpName}__*`,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'], env: process.env },
    );
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('OpenArt : génération trop longue (délai dépassé).'));
    }, timeoutMs);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      let text = out;
      let sessionId = null;
      try {
        const envelope = JSON.parse(out);
        if (typeof envelope.result === 'string') {
          text = envelope.result;
        }
        sessionId = envelope.session_id || null;
      } catch {
        // stdout brut
      }
      if (code !== 0) {
        reject(new Error(`OpenArt via Claude a échoué (code ${code}) : ${(err || text).slice(0, 400)}`));
        return;
      }
      resolve({ text: text.trim(), sessionId });
    });
  });
}

async function runClaude(instruction, mcpName, timeoutMs = TIMEOUT_MS) {
  return (await runClaudeSession(instruction, mcpName, timeoutMs)).text;
}

// Il arrive que Claude rende la main pendant que la génération tourne encore
// chez OpenArt (« Still generating, I'll check again… ») : la génération est
// lancée — et payée. On reprend alors LA MÊME conversation pour récupérer le
// résultat, au lieu d'en relancer une nouvelle qui serait payée deux fois.
const PENDING_FOLLOW_UP =
  "Ta réponse ne contient pas encore l'URL du résultat. Ne lance SURTOUT PAS de nouvelle " +
  "génération : vérifie l'état de celle que tu as déjà lancée avec les outils OpenArt " +
  '(revérifie autant de fois qu\'il le faut jusqu\'à ce qu\'elle soit terminée), puis réponds ' +
  "UNIQUEMENT avec l'URL directe du fichier final — ou « ERREUR: » suivi de la cause exacte.";
const MAX_FOLLOW_UPS = 5;

const hasUrl = (text) => /https?:\/\/\S+/.test(text);

async function askOpenArt(instruction, mcpName, timeoutMs) {
  let r = await runClaudeSession(instruction, mcpName, timeoutMs);
  for (let k = 0; k < MAX_FOLLOW_UPS && r.sessionId; k++) {
    if (hasUrl(r.text) || /^ERREUR\s*:/i.test(r.text)) {
      break;
    }
    r = await runClaudeSession(PENDING_FOLLOW_UP, mcpName, timeoutMs, r.sessionId);
  }
  return r.text;
}

// Erreur après laquelle on ne relance PAS de génération : le résultat existe
// (ou la génération tourne encore) chez OpenArt, une relance serait payée deux fois.
function noRegenerate(message) {
  const e = new Error(message);
  e.noRegenerate = true;
  return e;
}

async function downloadFile(url, { minBytes = 5000, timeoutMs = 120000, label = "l'image" } = {}) {
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    throw new Error(
      `Téléchargement de ${label} OpenArt : ${
        /abort/i.test(String(e)) ? `délai dépassé (${Math.round(timeoutMs / 1000)} s)` : e.message
      }`,
    );
  }
  if (!res.ok) {
    throw new Error(`Téléchargement de ${label} OpenArt : HTTP ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < minBytes) {
    throw new Error(`L'URL OpenArt ne renvoie pas ${label === "l'image" ? 'une image valide' : 'une vidéo valide'}.`);
  }
  return buf;
}

const downloadImage = (url) => downloadFile(url, { label: "l'image" });

// Solde de crédits OpenArt via le MCP (mis en cache 10 min — chaque
// consultation coûte un appel Claude headless).
let creditsCache = { at: 0, value: null };
const CREDITS_TTL_MS = 10 * 60 * 1000;

export async function openartCredits() {
  if (Date.now() - creditsCache.at < CREDITS_TTL_MS) {
    return creditsCache.value;
  }
  const mcpName = await detectMcpName();
  const text = await runClaude(
    `Tu as accès aux outils MCP OpenArt. Consulte le SOLDE DE CRÉDITS restant de mon compte OpenArt (cherche un outil de type account / credits / balance / profile). Réponds UNIQUEMENT avec un objet JSON : {"credits": nombre} — ou "ERREUR: cause précise" si aucun outil ne permet de le savoir.`,
    mcpName,
  );
  let value;
  if (/^ERREUR/i.test(text.trim())) {
    value = { error: text.trim().replace(/^ERREUR\s*:\s*/i, '').slice(0, 200) };
  } else {
    const m = text.match(/\{[^{}]*"credits"[^{}]*\}/);
    if (!m) {
      value = { error: 'solde illisible' };
    } else {
      try {
        value = { credits: Number(JSON.parse(m[0]).credits) };
      } catch {
        value = { error: 'solde illisible' };
      }
    }
  }
  creditsCache = { at: Date.now(), value };
  return value;
}

// Retourne { buffer, url } — l'URL sert de référence de visage pour les scènes suivantes.
export async function openartGenerate({ prompt, referenceUrls = [], referenceKind = 'faces' }) {
  const mcpName = await detectMcpName();
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await askOpenArt(
        buildInstruction(prompt, referenceUrls, referenceKind),
        mcpName,
        TIMEOUT_MS,
      );
      if (/^ERREUR\s*:/i.test(text)) {
        const cause = text.replace(/^ERREUR\s*:/i, '').trim();
        if (/credit|crédit/i.test(cause)) {
          throw new Error(`OpenArt : crédits insuffisants — ${cause}`);
        }
        if (/auth|connect|login|token/i.test(cause)) {
          throw new Error(
            `OpenArt : problème d'authentification MCP — relance \`claude\`, tape /mcp, et reconnecte "${mcpName}". (${cause})`,
          );
        }
        throw new Error(`OpenArt : ${cause}`);
      }
      const urls = [...text.matchAll(/https?:\/\/[^\s"'<>)\]]+/g)].map((m) => m[0]);
      if (urls.length === 0) {
        throw noRegenerate(
          `OpenArt : aucune URL d'image dans la réponse (« ${text.slice(0, 200)} »). Rien n'a été relancé — « Réparer » réessaiera.`,
        );
      }
      // Essaie de la dernière URL vers la première (la dernière est la réponse finale).
      for (let i = urls.length - 1; i >= 0; i--) {
        // Une image de référence recopiée dans la réponse n'est pas le résultat.
        if (referenceUrls.includes(urls[i])) {
          continue;
        }
        try {
          const buffer = await downloadImage(urls[i]);
          return { buffer, url: urls[i] };
        } catch (e) {
          lastErr = e;
        }
      }
      throw noRegenerate((lastErr && lastErr.message) || 'OpenArt : aucune URL téléchargeable.');
    } catch (e) {
      lastErr = e;
      // Crédits, authentification, résultat déjà payé ou délai dépassé (la
      // génération continue chez OpenArt) : réessayer ne servirait qu'à payer deux fois.
      if (e.noRegenerate || /crédit|authentification|délai dépassé/.test(e.message)) {
        throw e;
      }
    }
  }
  throw lastErr;
}

function buildVideoInstruction({ prompt, imageUrl, referenceUrls, durationSec }) {
  const source = imageUrl
    ? `\n- IMPORTANT — image-to-video : anime EXACTEMENT cette image (utilise-la comme image de départ / première frame, les visages et le décor doivent rester IDENTIQUES) :\n  ${imageUrl}`
    : referenceUrls.length > 0
      ? `\n- IMPORTANT — cohérence des visages : utilise ces portraits comme références de personnages, les visages doivent être IDENTIQUES à ceux des références :\n${referenceUrls.map((u) => `  - ${u}`).join('\n')}`
      : '';
  return `Tu as accès aux outils MCP OpenArt. Génère UN SEUL clip VIDÉO via OpenArt :
- Prompt : ${prompt}
- Format : vertical 9:16 (par exemple 1080x1920).
- Durée cible : ${durationSec} secondes — choisis l'option de durée disponible la plus proche, et en cas de doute la PLUS COURTE (maîtrise des crédits).${source}
- Modèle : ${
    process.env.OPENART_VIDEO_MODEL
      ? `utilise EXACTEMENT le modèle "${process.env.OPENART_VIDEO_MODEL}".`
      : `utilise un modèle image-to-video ÉCONOMIQUE (Wan, Seedance standard ou Fast, PixVerse standard, Kling standard). INTERDICTION ABSOLUE d'utiliser une version Pro / Master / Premium / Omni ou tout modèle coûtant plus d'environ 60 crédits par clip — vérifie le coût avant de lancer, et en cas de doute prends le MOINS CHER qui accepte une image de référence.`
  }
- RÈGLE ABSOLUE : personne ne parle dans le clip. Bouches FERMÉES et immobiles, aucun mouvement de lèvres (la voix off est ajoutée séparément, sans synchronisation labiale). Reformule le prompt si nécessaire pour que le modèle le respecte.
Attends la fin de la génération — cela peut prendre plusieurs minutes, patiente et vérifie le statut si nécessaire. Puis réponds UNIQUEMENT avec l'URL directe du fichier vidéo généré (.mp4, une seule ligne, aucune autre phrase). Si la génération échoue, réponds "ERREUR: " suivi de la cause exacte.`;
}

// Lip-sync via OpenArt : anime une image pour qu'elle PARLE un audio donné
// (outil talking character / lip sync du MCP — OmniHuman, InfiniteTalk,
// Kling… payés en crédits OpenArt). Retourne { buffer, url }.
function buildLipsyncInstruction({ imageUrl, audioUrl }) {
  return `Tu as accès aux outils MCP OpenArt. Fais PARLER un personnage via l'outil de LIP SYNC / talking character / talking avatar d'OpenArt :
- Image source (à animer — visage, cadrage et décor doivent rester IDENTIQUES) : ${imageUrl}
- Fichier audio de la voix (le personnage articule EXACTEMENT cet audio) : ${audioUrl}
- Format : vertical 9:16. La vidéo dure la durée de l'audio.
- Modèle : choisis un modèle de lip sync ÉCONOMIQUE et réaliste (OmniHuman, InfiniteTalk, Kling lip sync ou équivalent) — vérifie le coût avant de lancer, en cas de doute prends le MOINS CHER. Versions Pro / Premium interdites.
Attends la fin de la génération — cela peut prendre plusieurs minutes, patiente et vérifie le statut si nécessaire. Puis réponds UNIQUEMENT avec l'URL directe du fichier vidéo généré (.mp4, une seule ligne, aucune autre phrase). Si ce MCP n'a AUCUN outil de lip sync, ou si la génération échoue, réponds "ERREUR: " suivi de la cause exacte.`;
}

export async function openartTalkingVideo({ imageUrl, audioUrl }) {
  const mcpName = await detectMcpName();
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await runClaude(
        buildLipsyncInstruction({ imageUrl, audioUrl }),
        mcpName,
        VIDEO_TIMEOUT_MS,
      );
      if (/^ERREUR\s*:/i.test(text)) {
        const cause = text.replace(/^ERREUR\s*:/i, '').trim();
        if (/credit|crédit/i.test(cause)) {
          throw new Error(`OpenArt : crédits insuffisants — ${cause}`);
        }
        if (/auth|connect|login|token/i.test(cause)) {
          throw new Error(
            `OpenArt : problème d'authentification MCP — relance \`claude\`, tape /mcp, et reconnecte "${mcpName}". (${cause})`,
          );
        }
        throw new Error(`OpenArt lip-sync : ${cause}`);
      }
      const urls = [...text.matchAll(/https?:\/\/[^\s"'<>)\]]+/g)].map((m) => m[0]);
      const candidates = urls.filter((u) => u !== imageUrl && u !== audioUrl);
      if (candidates.length === 0) {
        throw new Error(`OpenArt lip-sync : aucune URL de vidéo dans la réponse (« ${text.slice(0, 200)} »).`);
      }
      for (let i = candidates.length - 1; i >= 0; i--) {
        try {
          const buffer = await downloadFile(candidates[i], {
            minBytes: 50000,
            timeoutMs: 480000,
            label: 'la vidéo',
          });
          return { buffer, url: candidates[i] };
        } catch (e) {
          lastErr = e;
        }
      }
      throw lastErr || new Error('OpenArt lip-sync : aucune URL de vidéo téléchargeable.');
    } catch (e) {
      lastErr = e;
      if (/crédit|authentification|AUCUN outil/.test(e.message)) {
        throw e;
      }
    }
  }
  throw lastErr;
}

// Génère un clip vidéo (image-to-video de préférence). Retourne { buffer, url }.
export async function openartGenerateVideo({
  prompt,
  imageUrl = null,
  referenceUrls = [],
  durationSec = 5,
}) {
  const mcpName = await detectMcpName();
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await askOpenArt(
        buildVideoInstruction({ prompt, imageUrl, referenceUrls, durationSec }),
        mcpName,
        VIDEO_TIMEOUT_MS,
      );
      if (/^ERREUR\s*:/i.test(text)) {
        const cause = text.replace(/^ERREUR\s*:/i, '').trim();
        if (/credit|crédit/i.test(cause)) {
          throw new Error(`OpenArt : crédits insuffisants — ${cause}`);
        }
        if (/auth|connect|login|token/i.test(cause)) {
          throw new Error(
            `OpenArt : problème d'authentification MCP — relance \`claude\`, tape /mcp, et reconnecte "${mcpName}". (${cause})`,
          );
        }
        throw new Error(`OpenArt : ${cause}`);
      }
      const urls = [...text.matchAll(/https?:\/\/[^\s"'<>)\]]+/g)].map((m) => m[0]);
      if (urls.length === 0) {
        throw noRegenerate(
          `OpenArt : aucune URL de vidéo dans la réponse (« ${text.slice(0, 200)} »). Rien n'a été relancé — « Réparer » réessaiera.`,
        );
      }
      for (let i = urls.length - 1; i >= 0; i--) {
        // On ne re-télécharge pas l'image source si le modèle l'a recopiée dans sa réponse.
        if (urls[i] === imageUrl) {
          continue;
        }
        try {
          const buffer = await downloadFile(urls[i], {
            minBytes: 50000,
            timeoutMs: 300000,
            label: 'la vidéo',
          });
          return { buffer, url: urls[i] };
        } catch (e) {
          lastErr = e;
        }
      }
      throw noRegenerate((lastErr && lastErr.message) || 'OpenArt : aucune URL de vidéo téléchargeable.');
    } catch (e) {
      lastErr = e;
      if (e.noRegenerate || /crédit|authentification|délai dépassé/.test(e.message)) {
        throw e;
      }
    }
  }
  throw lastErr;
}
