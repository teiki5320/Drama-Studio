import './config.js';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import os from 'node:os';
import { PORT, HOST, DIST_DIR } from './config.js';
import {
  EPISODE_COUNT,
  STYLES,
  MAX_STYLES,
  MAX_VIDEO_SCENES,
  wantsLipsync,
  lipsyncSpeaker,
} from '../shared/catalog.js';
import {
  listProjects,
  loadProject,
  saveProject,
  deleteProject,
  projectDir,
  rendersDir,
  findEpisode,
  findScene,
} from './projects.js';
import { startJob, getJob, activeJobFor, listActiveJobs } from './jobs.js';
import {
  createProject,
  createCustomProject,
  createChannel,
  createChannelVideo,
  suggestTopics,
  produceEpisode,
  produceSeason,
  regenerateScript,
  ensureCharacterPortraits,
  regenerateAllImages,
  regenerateAllAudio,
  retryFailedAssets,
  regenerateSceneImage,
  regenerateSceneAudio,
  generateSceneVideo,
  removeSceneVideo,
  lipsyncSceneVideo,
  regenerateCharacterPortrait,
  newCharacterFace,
  characterVoicePreview,
  saveUploadedImage,
  saveUploadedMusic,
} from './pipeline.js';
import { renderEpisode } from './render.js';
import { currentProvider } from './images.js';
import { ttsInfo, elevenBalance, isCatalogVoice, allVoices, removeCustomVoice } from './tts.js';
import { searchFrenchLibraryVoices, adoptLibraryVoice } from './elevenlib.js';
import { openartCredits } from './openart.js';
import { claudeBin } from './claudebin.js';
import { exportAllProjects, EXPORT_ROOT, exportRootFor, projectExportDir } from './exporter.js';
import { runLipsyncTest, lipsyncTestStatus } from './synctest.js';
import {
  STUDIO_DIR,
  loadStudio,
  saveSticker,
  removeSticker,
  saveOutro,
  removeOutro,
  saveChannelOutro,
  removeChannelOutroFile,
} from './studio.js';

const app = express();
app.use(express.json({ limit: '60mb' }));

// ---------- Santé ----------
app.get('/api/health', (req, res) => {
  execFile(claudeBin(), ['--version'], { timeout: 15000 }, (err, stdout) => {
    res.json({
      ok: true,
      claude: err ? null : String(stdout).trim(),
      imageProvider: currentProvider(),
      tts: ttsInfo(),
      episodeCount: EPISODE_COUNT,
      fal: Boolean(process.env.FAL_KEY),
    });
  });
});

// ---------- Soldes de crédits (ElevenLabs + OpenArt) ----------
let creditsCache = { at: 0, data: null };
app.get('/api/credits', async (req, res) => {
  if (creditsCache.data && Date.now() - creditsCache.at < 60000) {
    res.json(creditsCache.data);
    return;
  }
  const [elevenlabs, openart] = await Promise.all([
    elevenBalance().catch((e) => ({ error: e.message })),
    currentProvider() === 'openart'
      ? openartCredits().catch((e) => ({ error: e.message }))
      : Promise.resolve(null),
  ]);
  creditsCache = { at: Date.now(), data: { elevenlabs, openart } };
  res.json(creditsCache.data);
});

// ---------- Voix (catalogue + bibliothèque française ElevenLabs) ----------
app.get('/api/voices', (req, res) => {
  res.json(allVoices());
});

app.get('/api/voices/library', async (req, res) => {
  try {
    res.json(await searchFrenchLibraryVoices());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/voices/adopt', async (req, res) => {
  const b = req.body || {};
  const publicOwnerId = String(b.publicOwnerId || '').trim();
  const voiceId = String(b.voiceId || '').trim();
  const name = String(b.name || '').trim().slice(0, 60);
  const gender = b.gender === 'femme' ? 'femme' : 'homme';
  const desc = String(b.desc || '').trim().slice(0, 120);
  if (!publicOwnerId || !voiceId || !name) {
    res.status(400).json({ error: 'Voix incomplète (id, propriétaire ou nom manquant).' });
    return;
  }
  try {
    await adoptLibraryVoice({ publicOwnerId, voiceId, name, gender, desc });
    res.json(allVoices());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/voices/custom/:id', (req, res) => {
  removeCustomVoice(req.params.id);
  res.json(allVoices());
});

// ---------- Ma marque (sticker + outro, communs à tous les dramas) ----------
app.get('/api/studio', (req, res) => {
  res.json(loadStudio());
});

app.post('/api/studio/sticker', (req, res) => {
  try {
    res.json(saveSticker(req.body.data || ''));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/studio/sticker', (req, res) => {
  res.json(removeSticker());
});

app.post('/api/studio/outro', async (req, res) => {
  try {
    res.json(await saveOutro(req.body.data || ''));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/studio/outro', (req, res) => {
  res.json(removeOutro());
});

// Fichiers du studio (sticker/outro) — servis au Player et au rendu Remotion.
app.get('/studio/:file', (req, res) => {
  const target = path.resolve(STUDIO_DIR, req.params.file);
  if (!target.startsWith(path.resolve(STUDIO_DIR) + path.sep)) {
    res.status(403).end();
    return;
  }
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    res.status(404).end();
    return;
  }
  res.sendFile(target);
});

// ---------- Test synchro : un mini-clip de bout en bout ----------
app.get('/api/lipsync-test', (req, res) => {
  res.json(lipsyncTestStatus());
});

app.post('/api/lipsync-test', (req, res) => {
  const model = typeof req.body?.model === 'string' ? req.body.model.trim() : '';
  if (model && !/^[\w./-]{1,80}$/.test(model)) {
    res.status(400).json({ error: 'Nom de modèle fal.ai invalide.' });
    return;
  }
  const job = startJob('Test synchro labiale', (update) =>
    runLipsyncTest({ fresh: Boolean(req.body && req.body.fresh), model }, update),
  );
  res.json({ jobId: job.id });
});

// Toutes les productions en cours (panneau d'avancement de l'accueil).
app.get('/api/active-jobs', (req, res) => {
  res.json(
    listActiveJobs().map((j) => {
      const p = j.projectId ? loadProject(j.projectId) : null;
      return {
        id: j.id,
        projectId: j.projectId,
        label: j.label,
        step: j.step,
        progress: j.progress,
        startedAt: j.startedAt,
        projectTitle: p ? p.title : null,
        mode: p ? p.mode || 'normal' : 'normal',
      };
    }),
  );
});

// ---------- Projets ----------
app.get('/api/projects', (req, res) => {
  res.json(listProjects());
});

// Format long : saison de 30 à 60 épisodes (choix à la création).
function safeEpisodeCount(mode, raw) {
  if (mode !== 'long') {
    return undefined;
  }
  const v = Number(raw);
  return Number.isInteger(v) && v >= 30 && v <= 80 ? v : 40;
}

app.post('/api/projects', (req, res) => {
  const { styles, theme, mode, episodeCount } = req.body || {};
  if (!Array.isArray(styles) || styles.length < 1 || styles.length > 3) {
    res.status(400).json({ error: 'Choisis 1 à 3 styles.' });
    return;
  }
  const safeMode = ['synchro', 'long'].includes(mode) ? mode : 'normal';
  const job = startJob('Création du drama', (update) =>
    createProject(
      {
        styles,
        theme: (theme || '').slice(0, 500),
        mode: safeMode,
        episodeCount: safeEpisodeCount(safeMode, episodeCount),
      },
      update,
    ),
  );
  res.json({ jobId: job.id });
});

// Mode « mon script » : l'auteur fournit son histoire via le formulaire guidé.
app.post('/api/projects/custom', (req, res) => {
  const b = req.body || {};
  const script = String(b.script || '').trim();
  if (script.length < 30) {
    res.status(400).json({
      error: 'Raconte ton histoire (au moins quelques phrases) — c\'est la base de tout le drama.',
    });
    return;
  }
  const validStyle = (s) => STYLES.some((x) => x.id === s);
  const answers = {
    script: script.slice(0, 100000),
    title: String(b.title || '').trim().slice(0, 120),
    setting: String(b.setting || '').trim().slice(0, 300),
    charactersText: String(b.charactersText || '').trim().slice(0, 2000),
    styles: (Array.isArray(b.styles) ? b.styles : []).filter(validStyle).slice(0, MAX_STYLES),
    mustHappen: String(b.mustHappen || '').trim().slice(0, 1000),
    fidelity: b.fidelity === 'libre' ? 'libre' : 'fidele',
    mode: ['synchro', 'long'].includes(b.mode) ? b.mode : 'normal',
  };
  answers.episodeCount = safeEpisodeCount(answers.mode, b.episodeCount);
  const job = startJob('Création depuis ton script', (update) =>
    createCustomProject(answers, update),
  );
  res.json({ jobId: job.id });
});

// ---------- Chaînes (vidéos 60-120 s, narrateur seul) ----------
app.post('/api/projects/channel', (req, res) => {
  const b = req.body || {};
  const title = String(b.name || '').trim().slice(0, 80);
  if (title.length < 2) {
    res.status(400).json({ error: 'Donne un nom à ta chaîne.' });
    return;
  }
  const seconds = Number(b.targetSeconds);
  const info = {
    title,
    genre: String(b.genre || '').slice(0, 40),
    themeDesc: String(b.themeDesc || '').trim().slice(0, 300),
    visualStyle: String(b.visualStyle || 'photorealiste').slice(0, 30),
    targetSeconds: Number.isInteger(seconds) && seconds >= 60 && seconds <= 120 ? seconds : 90,
    narratorVoice: b.narratorVoice,
  };
  const job = startJob('Création de la chaîne', (update) => createChannel(info, update));
  res.json({ jobId: job.id });
});

app.post('/api/projects/:id/videos', (req, res) => {
  const p = loadProject(req.params.id);
  if (!p) {
    res.status(404).json({ error: 'Projet introuvable' });
    return;
  }
  const topic = String((req.body || {}).topic || '').trim().slice(0, 300);
  if (topic.length < 5) {
    res.status(400).json({ error: 'Donne le sujet de la vidéo (une phrase).' });
    return;
  }
  const job = startJob('Nouvelle vidéo', (update) => createChannelVideo(p, topic, update), {
    projectId: p.id,
  });
  res.json({ jobId: job.id });
});

app.post('/api/projects/:id/suggest-topics', (req, res) => {
  const p = loadProject(req.params.id);
  if (!p) {
    res.status(404).json({ error: 'Projet introuvable' });
    return;
  }
  const job = startJob('Idées de sujets', (update) => suggestTopics(p, update), {
    projectId: p.id,
  });
  res.json({ jobId: job.id });
});

app.post('/api/projects/:id/channel-outro', async (req, res) => {
  const p = loadProject(req.params.id);
  if (!p) {
    res.status(404).json({ error: 'Projet introuvable' });
    return;
  }
  try {
    const r = await saveChannelOutro(p.id, req.body.data || '');
    if (p.channelOutro) {
      removeChannelOutroFile(p.channelOutro);
    }
    p.channelOutro = r.file;
    p.channelOutroIsVideo = r.isVideo;
    p.channelOutroDurationSec = r.durationSec;
    saveProject(p);
    res.json(p);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/projects/:id/channel-outro', (req, res) => {
  const p = loadProject(req.params.id);
  if (!p) {
    res.status(404).json({ error: 'Projet introuvable' });
    return;
  }
  if (p.channelOutro) {
    removeChannelOutroFile(p.channelOutro);
  }
  p.channelOutro = null;
  p.channelOutroIsVideo = false;
  p.channelOutroDurationSec = 0;
  saveProject(p);
  res.json(p);
});

app.get('/api/projects/:id', (req, res) => {
  const p = loadProject(req.params.id);
  if (!p) {
    res.status(404).json({ error: 'Projet introuvable' });
    return;
  }
  res.json(p);
});

app.delete('/api/projects/:id', (req, res) => {
  deleteProject(req.params.id);
  res.json({ ok: true });
});

// Réglages du drama (nombre de clips vidéo par épisode…)
app.patch('/api/projects/:id', (req, res) => {
  const p = loadProject(req.params.id);
  if (!p) {
    res.status(404).json({ error: 'Projet introuvable' });
    return;
  }
  if (req.body.videoScenes !== undefined) {
    if (req.body.videoScenes === null) {
      // Retour au défaut : toutes les scènes en Format long, 3 sinon.
      delete p.videoScenes;
    } else {
      const v = Number(req.body.videoScenes);
      if (!Number.isInteger(v) || v < 0 || v > MAX_VIDEO_SCENES) {
        res.status(400).json({ error: `Nombre de vidéos invalide (0 à ${MAX_VIDEO_SCENES}).` });
        return;
      }
      p.videoScenes = v;
    }
  }
  if (req.body.narratorVoice !== undefined) {
    if (!isCatalogVoice(req.body.narratorVoice)) {
      res.status(400).json({ error: 'Voix du narrateur inconnue.' });
      return;
    }
    p.narratorVoice = req.body.narratorVoice;
  }
  if (req.body.videoSeconds !== undefined) {
    if (!['eco', 'auto'].includes(req.body.videoSeconds)) {
      res.status(400).json({ error: 'Durée de clips inconnue (eco ou auto).' });
      return;
    }
    p.videoSeconds = req.body.videoSeconds;
  }
  saveProject(p);
  res.json(p);
});

app.post('/api/projects/:id/music', (req, res) => {
  const p = loadProject(req.params.id);
  if (!p) {
    res.status(404).json({ error: 'Projet introuvable' });
    return;
  }
  try {
    const file = saveUploadedMusic(p, req.body.data || '');
    res.json({ ok: true, file });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ---------- Parcours par étapes : scénario → personnages → production ----------
app.post('/api/projects/:id/regen-script', (req, res) => {
  const p = loadProject(req.params.id);
  if (!p) {
    res.status(404).json({ error: 'Projet introuvable' });
    return;
  }
  const job = startJob('Nouveau scénario', (update) => regenerateScript(p, update), { projectId: p.id });
  res.json({ jobId: job.id });
});

app.post('/api/projects/:id/validate-script', (req, res) => {
  const p = loadProject(req.params.id);
  if (!p) {
    res.status(404).json({ error: 'Projet introuvable' });
    return;
  }
  if (currentProvider() === 'openart') {
    p.stage = 'characters_review';
    saveProject(p);
    const job = startJob('Portraits des personnages', (update) =>
      ensureCharacterPortraits(p, update),
    { projectId: p.id });
    res.json({ stage: p.stage, jobId: job.id });
  } else {
    p.stage = 'production';
    saveProject(p);
    const job = startJob('Production épisode 1', (update) => produceEpisode(p, 1, update), { projectId: p.id });
    res.json({ stage: p.stage, jobId: job.id });
  }
});

app.post('/api/projects/:id/portraits', (req, res) => {
  const p = loadProject(req.params.id);
  if (!p) {
    res.status(404).json({ error: 'Projet introuvable' });
    return;
  }
  const job = startJob('Portraits des personnages', (update) =>
    ensureCharacterPortraits(p, update),
  { projectId: p.id });
  res.json({ jobId: job.id });
});

app.post('/api/projects/:id/validate-characters', (req, res) => {
  const p = loadProject(req.params.id);
  if (!p) {
    res.status(404).json({ error: 'Projet introuvable' });
    return;
  }
  p.stage = 'production';
  saveProject(p);
  const job = startJob('Production épisode 1', (update) => produceEpisode(p, 1, update), { projectId: p.id });
  res.json({ stage: p.stage, jobId: job.id });
});

// Job en cours pour ce projet (permet de raccrocher après un rechargement)
app.get('/api/projects/:id/active-job', (req, res) => {
  res.json(activeJobFor(req.params.id));
});

// Production en chaîne des épisodes restants (script + images + voix + MP4
// par épisode). Sans `count` : toute la saison ; avec : les N prochains.
app.post('/api/projects/:id/produce-season', (req, res) => {
  const p = loadProject(req.params.id);
  if (!p) {
    res.status(404).json({ error: 'Projet introuvable' });
    return;
  }
  if (activeJobFor(p.id)) {
    res.status(409).json({ error: 'Une production est déjà en cours sur ce drama.' });
    return;
  }
  let count;
  if (req.body && req.body.count !== undefined) {
    const c = Number(req.body.count);
    if (!Number.isInteger(c) || c < 1 || c > 100) {
      res.status(400).json({ error: "Nombre d'épisodes invalide (1 à 100)." });
      return;
    }
    count = c;
  }
  const job = startJob(
    count ? `Production de ${count} épisodes` : 'Production de la saison',
    (update) => produceSeason(p, update, count),
    { projectId: p.id },
  );
  res.json({ jobId: job.id });
});

// Ouvre le dossier des épisodes exportés dans le Finder (Mac uniquement).
app.post('/api/projects/:id/open-folder', (req, res) => {
  const p = loadProject(req.params.id);
  if (!p) {
    res.status(404).json({ error: 'Projet introuvable' });
    return;
  }
  if (process.platform !== 'darwin') {
    res.status(400).json({ error: "L'ouverture du dossier n'est possible que sur Mac." });
    return;
  }
  const dramaDir = projectExportDir(p);
  const root = exportRootFor(p);
  const target = fs.existsSync(dramaDir) ? dramaDir : fs.existsSync(root) ? root : rendersDir(p.id);
  execFile('open', [target], (err) => {
    if (err) {
      res.status(500).json({ error: `Ouverture impossible : ${err.message}` });
    } else {
      res.json({ ok: true, dir: target });
    }
  });
});

// Archive .zip de tous les MP4 rendus
app.get('/api/projects/:id/season.zip', (req, res) => {
  const p = loadProject(req.params.id);
  if (!p) {
    res.status(404).json({ error: 'Projet introuvable' });
    return;
  }
  const dir = rendersDir(p.id);
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.mp4')) : [];
  if (files.length === 0) {
    res.status(404).json({ error: 'Aucun épisode MP4 rendu pour le moment.' });
    return;
  }
  const zipPath = path.join(dir, 'saison.zip');
  fs.rmSync(zipPath, { force: true });
  execFile(
    'zip',
    ['-j', zipPath, ...files.map((f) => path.join(dir, f))],
    { timeout: 120000 },
    (err) => {
      if (err) {
        res.status(500).json({ error: `Création du zip impossible : ${err.message}` });
        return;
      }
      res.download(zipPath, `${p.title} - saison complete.zip`);
    },
  );
});

app.post('/api/projects/:id/episodes/:n/regen-audio', (req, res) => {
  withEpisode(req, res, (p, ep) => {
    if (!ep) {
      res.status(404).json({ error: 'Épisode introuvable' });
      return;
    }
    const job = startJob(`Voix épisode ${ep.number}`, (update) =>
      regenerateAllAudio(p, ep, update),
    { projectId: p.id });
    res.json({ jobId: job.id });
  });
});

app.post('/api/projects/:id/characters/:charId/portrait', (req, res) => {
  const p = loadProject(req.params.id);
  if (!p) {
    res.status(404).json({ error: 'Projet introuvable' });
    return;
  }
  const job = startJob('Portrait de référence', (update) =>
    regenerateCharacterPortrait(p, req.params.charId, update),
  { projectId: p.id });
  res.json({ jobId: job.id });
});

// Changement de voix d'un personnage
app.patch('/api/projects/:id/characters/:charId', (req, res) => {
  const p = loadProject(req.params.id);
  const c = p && (p.characters || []).find((x) => x.id === req.params.charId);
  if (!p || !c) {
    res.status(404).json({ error: 'Personnage introuvable' });
    return;
  }
  if (typeof req.body.elevenVoice === 'string' && req.body.elevenVoice) {
    c.elevenVoice = req.body.elevenVoice;
  }
  saveProject(p);
  res.json(p);
});

// Pré-écoute d'une voix (réplique réelle du personnage)
app.post('/api/projects/:id/characters/:charId/voice-preview', (req, res) => {
  const p = loadProject(req.params.id);
  if (!p) {
    res.status(404).json({ error: 'Projet introuvable' });
    return;
  }
  characterVoicePreview(p, req.params.charId, req.body.elevenVoice)
    .then((file) => res.json({ file }))
    .catch((e) => res.status(500).json({ error: e.message }));
});

// « Nouveau visage » : réécriture de la description + nouveau portrait
app.post('/api/projects/:id/characters/:charId/new-face', (req, res) => {
  const p = loadProject(req.params.id);
  if (!p) {
    res.status(404).json({ error: 'Projet introuvable' });
    return;
  }
  const job = startJob('Nouveau visage', (update) =>
    newCharacterFace(p, req.params.charId, req.body.instructions, update),
  { projectId: p.id });
  res.json({ jobId: job.id });
});

// Rouvrir l'étape personnages sur un projet déjà en production
app.post('/api/projects/:id/review-characters', (req, res) => {
  const p = loadProject(req.params.id);
  if (!p) {
    res.status(404).json({ error: 'Projet introuvable' });
    return;
  }
  p.stage = 'characters_review';
  saveProject(p);
  res.json({ stage: p.stage });
});

// ---------- Épisodes ----------
function withEpisode(req, res, fn) {
  const p = loadProject(req.params.id);
  const ep = p && findEpisode(p, req.params.n);
  if (!p) {
    res.status(404).json({ error: 'Projet introuvable' });
    return;
  }
  fn(p, ep);
}

app.post('/api/projects/:id/episodes/:n/produce', (req, res) => {
  const p = loadProject(req.params.id);
  if (!p) {
    res.status(404).json({ error: 'Projet introuvable' });
    return;
  }
  const n = Number(req.params.n);
  const total = p.mode === 'chaine' ? (p.episodes || []).length : p.episodeCount || EPISODE_COUNT;
  if (!(n >= 1 && n <= total)) {
    res.status(400).json({ error: `Numéro d'épisode invalide (1 à ${total}).` });
    return;
  }
  const job = startJob(`Production épisode ${n}`, (update) => produceEpisode(p, n, update), { projectId: p.id });
  res.json({ jobId: job.id });
});

// Supprime un épisode (scénario + images + clips + voix + MP4) pour le
// refaire de zéro : il repasse en « à produire ». Sa copie exportée est
// retirée aussi ; une vidéo de chaîne rend son sujet aux idées.
app.delete('/api/projects/:id/episodes/:n', (req, res) => {
  withEpisode(req, res, (p, ep) => {
    if (!ep) {
      res.status(404).json({ error: 'Épisode introuvable' });
      return;
    }
    if (activeJobFor(p.id)) {
      res.status(409).json({ error: 'Une production est en cours sur ce drama — attends la fin.' });
      return;
    }
    const dir = projectDir(p.id);
    const assets = path.join(dir, 'assets');
    try {
      for (const f of fs.readdirSync(assets)) {
        if (f.startsWith(`e${ep.number}_`)) {
          fs.rmSync(path.join(assets, f), { force: true });
        }
      }
    } catch {
      // pas de dossier assets : rien à nettoyer
    }
    if (ep.renderedFile) {
      fs.rmSync(path.join(dir, ep.renderedFile), { force: true });
    }
    if (ep.exportedTo) {
      try {
        fs.rmSync(ep.exportedTo, { force: true });
      } catch {
        // dossier d'export indisponible (iCloud) : on n'insiste pas
      }
    }
    if (p.mode === 'chaine' && ep.topic) {
      p.topicIdeas = [ep.topic, ...(p.topicIdeas || []).filter((t) => t !== ep.topic)].slice(0, 20);
    }
    p.episodes = (p.episodes || []).filter((e) => e.number !== ep.number);
    if (p.mode === 'chaine') {
      p.episodeCount = p.episodes.length;
    }
    saveProject(p);
    res.json({ ok: true });
  });
});

// « Réparer » : relance uniquement les images/voix/vidéos ratées ou manquantes.
app.post('/api/projects/:id/episodes/:n/retry-assets', (req, res) => {
  withEpisode(req, res, (p, ep) => {
    if (!ep) {
      res.status(404).json({ error: 'Épisode introuvable' });
      return;
    }
    const job = startJob(`Réparation épisode ${ep.number}`, (update) =>
      retryFailedAssets(p, ep, update),
    { projectId: p.id });
    res.json({ jobId: job.id });
  });
});

app.post('/api/projects/:id/episodes/:n/regen-images', (req, res) => {
  withEpisode(req, res, (p, ep) => {
    if (!ep) {
      res.status(404).json({ error: 'Épisode introuvable' });
      return;
    }
    const job = startJob(`Images épisode ${ep.number}`, (update) =>
      regenerateAllImages(p, ep, update),
    { projectId: p.id });
    res.json({ jobId: job.id });
  });
});

app.post('/api/projects/:id/episodes/:n/render', (req, res) => {
  withEpisode(req, res, (p, ep) => {
    if (!ep) {
      res.status(404).json({ error: 'Épisode introuvable' });
      return;
    }
    const job = startJob(`Rendu épisode ${ep.number}`, (update) => renderEpisode(p, ep, update), { projectId: p.id });
    res.json({ jobId: job.id });
  });
});

// ---------- Scènes ----------
function withScene(req, res, fn) {
  const p = loadProject(req.params.id);
  const ep = p && findEpisode(p, req.params.n);
  const scene = ep && findScene(ep, req.params.sceneId);
  if (!p || !ep || !scene) {
    res.status(404).json({ error: 'Scène introuvable' });
    return;
  }
  fn(p, ep, scene);
}

app.patch('/api/projects/:id/episodes/:n/scenes/:sceneId', (req, res) => {
  withScene(req, res, (p, ep, scene) => {
    const { lines, imagePrompt, kenBurns, durationSec } = req.body || {};
    if (Array.isArray(lines)) {
      scene.lines = lines
        .filter((l) => l && typeof l.text === 'string' && l.text.trim())
        .slice(0, 4)
        .map((l, j) => {
          const prev = scene.lines[j];
          const unchanged = prev && prev.text === l.text.trim() && prev.speaker === (l.speaker || 'narrator');
          return {
            speaker: l.speaker || 'narrator',
            text: l.text.trim(),
            audio: unchanged ? prev.audio : null,
            audioDurationSec: unchanged ? prev.audioDurationSec : null,
          };
        });
    }
    if (typeof imagePrompt === 'string') {
      scene.imagePrompt = imagePrompt.trim();
    }
    if (typeof kenBurns === 'string') {
      scene.kenBurns = kenBurns;
    }
    if (typeof durationSec === 'number' && durationSec >= 2 && durationSec <= 20) {
      scene.durationSec = durationSec;
    }
    if (ep.status === 'done') {
      ep.status = 'ready';
    }
    saveProject(p);
    res.json(p);
  });
});

app.post('/api/projects/:id/episodes/:n/scenes/:sceneId/image', (req, res) => {
  withScene(req, res, (p, ep, scene) => {
    if (typeof req.body.imagePrompt === 'string' && req.body.imagePrompt.trim()) {
      scene.imagePrompt = req.body.imagePrompt.trim();
    }
    const job = startJob('Nouvelle image', (update) => regenerateSceneImage(p, ep, scene, update), { projectId: p.id });
    res.json({ jobId: job.id });
  });
});

// Clip vidéo d'une scène : génération (coûteuse en crédits) ou retour à l'image fixe.
// En Format long, la synchro labiale s'enchaîne automatiquement quand un
// personnage parle dans la scène.
app.post('/api/projects/:id/episodes/:n/scenes/:sceneId/video', (req, res) => {
  withScene(req, res, (p, ep, scene) => {
    const job = startJob('Clip vidéo de la scène', async (update) => {
      await generateSceneVideo(p, ep, scene, update);
      if (wantsLipsync(p) && lipsyncSpeaker(scene)) {
        await lipsyncSceneVideo(p, ep, scene, update);
      }
    }, { projectId: p.id });
    res.json({ jobId: job.id });
  });
});

// (Re)synchronise les lèvres du clip existant sur les voix de la scène.
app.post('/api/projects/:id/episodes/:n/scenes/:sceneId/lipsync', (req, res) => {
  withScene(req, res, (p, ep, scene) => {
    const job = startJob('Synchro labiale', (update) => lipsyncSceneVideo(p, ep, scene, update), {
      projectId: p.id,
    });
    res.json({ jobId: job.id });
  });
});

app.delete('/api/projects/:id/episodes/:n/scenes/:sceneId/video', (req, res) => {
  withScene(req, res, (p, ep, scene) => {
    removeSceneVideo(p, ep, scene);
    res.json(p);
  });
});

app.post('/api/projects/:id/episodes/:n/scenes/:sceneId/audio', (req, res) => {
  withScene(req, res, (p, ep, scene) => {
    const job = startJob('Nouvelles voix', (update) => regenerateSceneAudio(p, ep, scene, update), { projectId: p.id });
    res.json({ jobId: job.id });
  });
});

app.post('/api/projects/:id/episodes/:n/scenes/:sceneId/upload-image', (req, res) => {
  withScene(req, res, (p, ep, scene) => {
    try {
      const file = saveUploadedImage(p, ep, scene, req.body.data || '');
      res.json({ ok: true, file });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
});

// ---------- Jobs ----------
app.get('/api/jobs/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Job introuvable' });
    return;
  }
  res.json(job);
});

// ---------- Fichiers des projets (images, voix, rendus) ----------
app.get('/files/:id/*', (req, res) => {
  let dir;
  try {
    dir = projectDir(req.params.id);
  } catch {
    res.status(400).end();
    return;
  }
  const rel = req.params[0] || '';
  // `renders/<f>` est servi depuis le dossier des rendus, tout le reste depuis assets/.
  const base = rel.startsWith('renders/') ? path.join(dir, 'renders') : path.join(dir, 'assets');
  const target = rel.startsWith('renders/') ? path.join(dir, rel) : path.join(base, rel);
  const resolved = path.resolve(target);
  if (!resolved.startsWith(path.resolve(base) + path.sep)) {
    res.status(403).end();
    return;
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    res.status(404).end();
    return;
  }
  res.sendFile(resolved);
});

// ---------- Front (build Vite) ----------
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/files/')) {
      next();
      return;
    }
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

app.listen(PORT, HOST, () => {
  console.log('');
  console.log('  🎬 Drama Studio');
  console.log(`  → http://localhost:${PORT}`);
  // Accès distant activé (HOST=0.0.0.0) : affiche les adresses utilisables,
  // en signalant celle du réseau privé Tailscale (plage 100.x).
  if (HOST !== '127.0.0.1') {
    for (const list of Object.values(os.networkInterfaces())) {
      for (const iface of list || []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          const tailscale = iface.address.startsWith('100.');
          console.log(
            `  → http://${iface.address}:${PORT}${tailscale ? '  ← Tailscale (téléphone, autre ordi)' : ''}`,
          );
        }
      }
    }
  }
  if (!fs.existsSync(DIST_DIR)) {
    console.log('  (interface non construite : lance `npm run dev` ou `npm run build`)');
  }
  console.log('');
  // Synchronise les épisodes déjà validés vers Bureau/Dramas (rattrapage).
  setTimeout(() => {
    const copied = exportAllProjects();
    if (copied > 0) {
      console.log(`  📁 ${copied} épisode(s) synchronisé(s) dans ${EXPORT_ROOT}`);
    }
  }, 1500);
});
