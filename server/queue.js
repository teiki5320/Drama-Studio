// ---------- File d'attente de production ----------
// On y ajoute « une pub Erea sur tel angle », « la recette du mafé en 60 s »…
// et le studio les fabrique l'une après l'autre, jusqu'au MP4 rangé dans
// iCloud : script, images, clips, voix, montage. Une seule à la fois — les
// crédits et la machine ne sont jamais sollicités deux fois en parallèle.
//
// La file survit à un redémarrage (studio/queue.json). Une vidéo coupée en
// plein travail par un redémarrage n'est PAS relancée d'office : ce qui était
// fait reste dans le projet, « Réparer » puis « Monter » terminent le travail
// sans repayer.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { STUDIO_DIR } from './studio.js';
import { startJob } from './jobs.js';
import { loadProject } from './projects.js';
import {
  createChannelVideo,
  createRecipeVideo,
  createKeurCookAd,
  keurCookAdPlan,
  createKeurDecoAd,
  KEURDECO_FORMATS,
  createKeurbookAd,
  createOptiledAd,
  OPTILED_FORMATS,
  createKultivaAd,
  KULTIVA_FORMATS,
  createPalabreAd,
  PALABRE_FORMATS,
  createEreaAd,
  produceEpisode,
  retryFailedAssets,
} from './pipeline.js';
import { renderEpisode } from './render.js';

const FILE = path.join(STUDIO_DIR, 'queue.json');
const KEEP_FINISHED = 30;

let items = load();
let running = false;

// Une ligne dont le script est écrit porte le vrai sujet de sa vidéo.
function avecSujet(it) {
  if (it.number == null) {
    return it;
  }
  try {
    const e = loadProject(it.projectId)?.episodes?.find((x) => x.number === it.number);
    if (e) {
      return { ...it, label: `${String(it.label).split(' — ')[0]} — ${String(e.topic || e.title).slice(0, 90)}` };
    }
  } catch {
    // Projet supprimé : on garde l'ancien titre.
  }
  return it;
}

function load() {
  try {
    const list = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return (Array.isArray(list) ? list : []).map(avecSujet).map((it) =>
      it.status === 'running'
        ? {
            ...it,
            status: 'error',
            error:
              'Interrompue par un redémarrage du studio — ouvre le projet, « Réparer » puis « Monter le MP4 » terminent sans repayer.',
          }
        : it,
    );
  } catch {
    return [];
  }
}

function save() {
  // Les plus anciennes vidéos terminées sortent de la liste.
  const finished = items.filter((it) => it.status === 'done' || it.status === 'error');
  if (finished.length > KEEP_FINISHED) {
    const drop = new Set(finished.slice(0, finished.length - KEEP_FINISHED).map((it) => it.id));
    items = items.filter((it) => !drop.has(it.id));
  }
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(items, null, 2));
  fs.renameSync(tmp, FILE);
}

export function listQueue() {
  return items;
}

// item : { kind: 'pub', projectId, angle } ou
//        { kind: 'recette', projectId, slug, seconds, label }
export function addToQueue(raw) {
  const project = loadProject(raw.projectId);
  if (!project) {
    throw new Error('Projet introuvable');
  }
  let item;
  if (raw.kind === 'pub' || raw.kind === 'chaine') {
    // Pub d'une appli, ou vidéo d'une chaîne : même fabrication (un sujet →
    // un script → la vidéo), seul le libellé change.
    if (project.mode !== 'chaine') {
      throw new Error('Ce projet n’est ni une campagne de pub ni une chaîne.');
    }
    const isPub = project.kind === 'pub';
    const angle = String(raw.angle || '').trim().slice(0, 300);
    if (angle.length < 5) {
      throw new Error(isPub ? 'Choisis un angle pour la pub.' : 'Donne le sujet de la vidéo.');
    }
    item = {
      kind: isPub ? 'pub' : 'chaine',
      angle,
      label: `${isPub ? 'Pub' : 'Vidéo'} ${project.title} — « ${angle.slice(0, 70)} »`,
    };
  } else if (raw.kind === 'keurcook') {
    // Pub Keur Cook « Tour d'Afrique » : le pays suivant, ou celui choisi.
    if (project.kind !== 'pub') {
      throw new Error('Ce projet n’est pas une campagne de pub.');
    }
    const plan = keurCookAdPlan(project);
    const pays = String(raw.pays || '').trim() || (plan.next && plan.next.pays) || '';
    if (!pays) {
      throw new Error('Aucun pays disponible pour la pub Keur Cook.');
    }
    const seconds = Number(raw.seconds) === 60 ? 60 : 45;
    item = { kind: 'keurcook', pays, seconds, label: `Pub Keur Cook — ${pays}, ${seconds} s` };
  } else if (raw.kind === 'keurdeco') {
    // Pub Keur Déco : ambiance, visite déco ou avant / après.
    if (project.kind !== 'pub') {
      throw new Error('Ce projet n’est pas une campagne de pub.');
    }
    const format = KEURDECO_FORMATS[raw.format] ? raw.format : 'ambiance';
    const seconds = Number(raw.seconds) === 45 ? 45 : 30;
    item = {
      kind: 'keurdeco',
      format,
      article: String(raw.article || '').slice(0, 120),
      vue: String(raw.vue || '').slice(0, 120),
      seconds,
      label: `Pub Keur Déco — ${KEURDECO_FORMATS[format].split(' — ')[0]}, ${seconds} s`,
    };
  } else if (raw.kind === 'keurbook') {
    // Pub Keurbook : « Le livre en 30 s ».
    if (project.kind !== 'pub') {
      throw new Error('Ce projet n’est pas une campagne de pub.');
    }
    const livre = String(raw.livre || '').trim().slice(0, 120);
    item = { kind: 'keurbook', livre, label: `Pub Keurbook — ${String(raw.label || livre || 'prochain livre').slice(0, 70)}` };
  } else if (raw.kind === 'optiled') {
    // Pub OptiLED : le calcul en 30 s, ou le time-lapse.
    if (project.kind !== 'pub') {
      throw new Error('Ce projet n’est pas une campagne de pub.');
    }
    const format = OPTILED_FORMATS[raw.format] ? raw.format : 'calcul';
    const culture = String(raw.culture || '').trim().slice(0, 60);
    item = {
      kind: 'optiled',
      format,
      culture,
      label: `Pub OptiLED — ${OPTILED_FORMATS[format].split(' — ')[0]}${raw.label ? `, ${String(raw.label).slice(0, 40)}` : ''}`,
    };
  } else if (raw.kind === 'palabre') {
    // Pub Palabre : la question, le mandat en accéléré, ou le palais.
    if (project.kind !== 'pub') {
      throw new Error('Ce projet n’est pas une campagne de pub.');
    }
    const format = PALABRE_FORMATS[raw.format] ? raw.format : 'question';
    const carte = format === 'question' ? String(raw.carte || '').trim().slice(0, 80) : '';
    item = {
      kind: 'palabre',
      format,
      carte,
      label: `Pub Palabre — ${PALABRE_FORMATS[format].replace(/^\S+\s/, '')}${raw.label ? `, ${String(raw.label).slice(0, 40)}` : ''}`,
    };
  } else if (raw.kind === 'kultiva') {
    // Pub Kultiva : semis du mois, graine → assiette, famille, time-lapse.
    if (project.kind !== 'pub') {
      throw new Error('Ce projet n’est pas une campagne de pub.');
    }
    const format = KULTIVA_FORMATS[raw.format] ? raw.format : 'mois';
    const region = raw.region === 'west_africa' ? 'west_africa' : 'france';
    const espece = format === 'mois' ? '' : String(raw.espece || '').trim().slice(0, 60);
    item = {
      kind: 'kultiva',
      format,
      region,
      espece,
      label: `Pub Kultiva — ${KULTIVA_FORMATS[format].replace(/^\S+\s/, '')}${raw.label ? `, ${String(raw.label).slice(0, 40)}` : ''}`,
    };
  } else if (raw.kind === 'erea') {
    // Pub Erea : l'anachronisme (personnage imposé ou choisi par Claude).
    if (project.kind !== 'pub') {
      throw new Error('Ce projet n’est pas une campagne de pub.');
    }
    const personnage = String(raw.personnage || '').trim().slice(0, 60);
    item = { kind: 'erea', personnage, label: `Pub Erea — ${personnage || 'anachronisme surprise'}` };
  } else if (raw.kind === 'recette') {
    if (project.mode !== 'recette') {
      throw new Error('Ce projet n’est pas un atelier de recettes.');
    }
    const slug = String(raw.slug || '').trim();
    if (!/^[a-z0-9-]{2,80}$/.test(slug)) {
      throw new Error('Choisis une recette.');
    }
    const seconds = [45, 60, 90].includes(Number(raw.seconds)) ? Number(raw.seconds) : 60;
    const name = String(raw.label || slug).slice(0, 80);
    item = { kind: 'recette', slug, seconds, label: `Recette — ${name}, ${seconds} s` };
  } else {
    throw new Error('Type de vidéo inconnu.');
  }
  // Tant que le script n'est pas écrit, on ne connaît pas encore le sujet :
  // un numéro distingue les vidéos en attente d'une même appli.
  const deja = (project.episodes || []).length + items.filter((x) => x.projectId === project.id && x.status !== 'done').length;
  item.label = `${item.label} · n° ${deja + 1}`;
  const full = {
    id: `q_${crypto.randomBytes(5).toString('hex')}`,
    projectId: project.id,
    projectTitle: project.title,
    status: 'waiting',
    step: '',
    progress: null,
    error: null,
    number: null,
    jobId: null,
    createdAt: new Date().toISOString(),
    ...item,
  };
  items.push(full);
  save();
  kick();
  return full;
}

// Retire une vidéo pas encore commencée, ou une ligne terminée.
export function removeFromQueue(id) {
  const it = items.find((x) => x.id === id);
  if (!it) {
    return;
  }
  if (it.status === 'running') {
    throw new Error('Cette vidéo est en cours de fabrication : elle ne peut plus être retirée.');
  }
  items = items.filter((x) => x.id !== id);
  save();
}

async function produceItem(it, update) {
  const p = loadProject(it.projectId);
  if (!p) {
    throw new Error('Projet introuvable (supprimé ?)');
  }
  const step = (label, from, to) => (msg, prog) =>
    update(`${label} — ${msg}`, prog == null ? from : from + (to - from) * prog);

  // 1. Script
  const { number } =
    it.kind === 'erea'
      ? await createEreaAd(p, { personnage: it.personnage }, step('Script', 0, 0.05))
      : it.kind === 'palabre'
      ? await createPalabreAd(p, { format: it.format, carte: it.carte }, step('Script', 0, 0.05))
      : it.kind === 'kultiva'
      ? await createKultivaAd(p, { format: it.format, region: it.region, espece: it.espece }, step('Script', 0, 0.05))
      : it.kind === 'optiled'
      ? await createOptiledAd(p, { format: it.format, culture: it.culture }, step('Script', 0, 0.05))
      : it.kind === 'keurbook'
      ? await createKeurbookAd(p, { livre: it.livre }, step('Script', 0, 0.05))
      : it.kind === 'keurdeco'
      ? await createKeurDecoAd(
          p,
          { format: it.format, article: it.article, vue: it.vue, seconds: it.seconds },
          step('Script', 0, 0.05),
        )
      : it.kind === 'keurcook'
      ? await createKeurCookAd(p, { pays: it.pays, seconds: it.seconds }, step('Script', 0, 0.05))
      : it.kind === 'pub' || it.kind === 'chaine'
      ? await createChannelVideo(p, it.angle, step('Script', 0, 0.05))
      : await createRecipeVideo(
          p,
          { slug: it.slug, text: '', seconds: it.seconds, tone: p.tone || 'chaleureux', usePhoto: true },
          step('Découpage', 0, 0.05),
        );
  it.number = number;
  // Le script est écrit : la ligne prend le vrai sujet de la vidéo.
  const fait = loadProject(it.projectId)?.episodes?.find((e) => e.number === number);
  if (fait) {
    const avant = String(it.label).split(' — ')[0];
    it.label = `${avant} — ${String(fait.topic || fait.title).slice(0, 90)}`;
  }
  save();

  // 2. Images, clips, voix
  await produceEpisode(p, number, step('Fabrication', 0.05, 0.8));

  // 2 bis. Réparation automatique : une image ou une voix ratée est refaite
  // une fois avant le montage (l'existant n'est pas repayé). Si elle rate
  // encore, on monte quand même : le plan reste sur fond sombre.
  const ep = p.episodes.find((e) => e.number === number);
  const missing = (ep.scenes || []).some(
    (sc) => (!sc.image && !sc.videoDisabled) || sc.imageError || sc.videoError || (sc.lines || []).some((l) => !l.audio),
  );
  if (missing) {
    try {
      await retryFailedAssets(p, ep, step('Réparation', 0.8, 0.85));
    } catch (e) {
      console.error(`File d'attente — réparation incomplète (${it.label}) :`, e.message);
    }
  }

  // 3. Montage, puis rangement dans iCloud
  const r = await renderEpisode(p, ep, step('Montage', 0.85, 1));
  return { number, ...r };
}

function kick() {
  if (running) {
    return;
  }
  const next = items.find((it) => it.status === 'waiting');
  if (!next) {
    return;
  }
  running = true;
  next.status = 'running';
  next.step = 'Démarrage…';
  save();
  const job = startJob(
    next.label,
    (update) =>
      produceItem(next, (msg, prog) => {
        update(msg, prog);
        next.step = msg;
        next.progress = prog;
      }),
    { projectId: next.projectId },
  );
  next.jobId = job.id;
  // Le job vit sa vie ; on regarde régulièrement s'il est fini.
  const timer = setInterval(() => {
    if (job.status === 'running') {
      return;
    }
    clearInterval(timer);
    next.status = job.status === 'done' ? 'done' : 'error';
    next.error = job.error;
    next.step = job.status === 'done' ? 'Prête — rangée dans iCloud' : 'Échec';
    next.progress = job.status === 'done' ? 1 : next.progress;
    next.exportedTo = job.result?.exportedTo || null;
    running = false;
    save();
    kick();
  }, 2000);
}

// Au démarrage du serveur : reprend la file là où elle en était.
export function startQueue() {
  save();
  kick();
}
