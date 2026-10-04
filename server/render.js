import path from 'node:path';
import { ROOT, PORT } from './config.js';
import { rendersDir, saveProject } from './projects.js';
import { exportEpisode } from './exporter.js';
import fs from 'node:fs';
import { loadStudio, videoDurationSec } from './studio.js';
import { assetsDir } from './projects.js';
import { assertNoHealthClaims } from './pipeline.js';

let bundlePromise = null;

async function getBundle() {
  if (!bundlePromise) {
    bundlePromise = (async () => {
      const { bundle } = await import('@remotion/bundler');
      return bundle({
        entryPoint: path.join(ROOT, 'src', 'remotion', 'index.jsx'),
        onProgress: () => {},
      });
    })();
    bundlePromise.catch(() => {
      bundlePromise = null;
    });
  }
  return bundlePromise;
}

export function buildEpisodeProps(project, episode, assetBase, studioBase) {
  // Marque de l'auteur (sticker + outro) — une chaîne peut avoir sa propre outro.
  const studio = loadStudio();
  // Recette explicative : on finit sur le plat fini, aucune outro après.
  if (project.mode === 'recette') {
    studio.outro = null;
  }
  if (project.noSticker) {
    studio.sticker = null;
  }
  if (project.channelOutro) {
    studio.outro = project.channelOutro;
    studio.outroIsVideo = Boolean(project.channelOutroIsVideo);
    studio.outroDurationSec = project.channelOutroDurationSec || 4;
  }
  return {
    episode: {
      number: episode.number,
      title: episode.title,
      cliffhanger: episode.cliffhanger,
      scenes: episode.scenes,
      recipe: episode.recipe || null,
    },
    characters: project.characters,
    assetBase,
    // Une vidéo peut avoir sa propre musique (pub d'ambiance composée pour elle).
    musicFile: episode.musicFile || project.musicFile,
    musicVolume: typeof episode.musicVolume === 'number' ? episode.musicVolume : undefined,
    seriesTitle: project.title,
    studio,
    studioBase: studioBase || '',
    // Chaîne : la vidéo se termine sans carton « À suivre ».
    noOutroCard: project.mode === 'chaine',
    // Pub : carton final « nom de l'appli + appel à l'action » — la phrase peut
    // changer d'une pub à l'autre (Keur Cook alterne recette / ingrédient),
    // avec le logo de l'appli s'il existe.
    cta: project.kind === 'pub' ? episode.cta || project.cta || '' : '',
    ctaLogo: project.kind === 'pub' && project.ctaLogo ? `${assetBase}/${project.ctaLogo}` : '',
    ctaTheme: project.kind === 'pub' && project.ctaTheme ? project.ctaTheme : undefined,
  };
}

export async function renderEpisode(project, episode, update) {
  // Recette, et pubs Keur Cook (un site alimentaire) : aucune allégation de
  // santé ne doit partir au rendu.
  if (project.mode === 'recette' || String(project.repo || '').toLowerCase() === 'teiki5320/keurcook') {
    assertNoHealthClaims(episode);
  }
  update('Préparation du moteur de rendu…');
  // Durée réelle de chaque clip : un clip plus court que son plan est ralenti
  // pour le couvrir, au lieu de se figer sur sa dernière image.
  for (const scene of episode.scenes || []) {
    for (const o of [scene, ...(Array.isArray(scene.shots) ? scene.shots : [])]) {
      if (o.video && o.videoDurationFor !== o.video) {
        const f = path.join(assetsDir(project.id), o.video);
        if (fs.existsSync(f)) {
          try {
            o.videoDurationSec = await videoDurationSec(f);
            o.videoDurationFor = o.video;
          } catch {
            // Durée inconnue : le clip se joue à vitesse normale.
          }
        }
      }
    }
  }
  saveProject(project);
  const serveUrl = await getBundle();

  const { renderMedia, selectComposition } = await import('@remotion/renderer');
  const inputProps = buildEpisodeProps(
    project,
    episode,
    `http://127.0.0.1:${PORT}/files/${project.id}`,
    `http://127.0.0.1:${PORT}/studio`,
  );

  update('Analyse de la composition…');
  const composition = await selectComposition({
    serveUrl,
    // Les recettes ont leur propre composition (titres, ingrédients, étapes).
    id: project.mode === 'recette' ? 'Recipe' : 'Episode',
    inputProps,
    browserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE || undefined,
  });

  const outName = `episode-${episode.number}.mp4`;
  const outputLocation = path.join(rendersDir(project.id), outName);

  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    outputLocation,
    inputProps,
    browserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE || undefined,
    onProgress: ({ progress }) => {
      update(`Rendu de la vidéo… ${Math.round(progress * 100)} %`, progress);
    },
  });

  episode.renderedFile = `renders/${outName}`;
  episode.status = 'done';
  saveProject(project);

  update('Copie dans Bureau/Dramas…');
  const exported = exportEpisode(project, episode);
  if (exported) {
    episode.exportedTo = exported;
    saveProject(project);
  }

  return { file: episode.renderedFile, exportedTo: exported };
}
