// Constantes et calculs de durée partagés entre le Player (aperçu) et le rendu final.

import { sceneShots, shotEffectiveSec } from '../../shared/catalog.js';

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;
export const TRANSITION_FRAMES = 12;
// Carton « À suivre » : assez long pour lire le cliffhanger tranquillement.
export const OUTRO_SECONDS = 5.5;
// Carton final d'une pub : nom de l'appli + appel à l'action.
export const CTA_SECONDS = 3.5;

export const LINE_START_DELAY = 0.5; // secondes avant la première réplique d'une scène
export const LINE_GAP = 0.35; // pause entre deux répliques

// Délai (s) entre la coupe d'un plan et le départ de sa réplique.
export const SHOT_AUDIO_DELAY = 0.25;

export function sceneFrames(scene) {
  // Scène storyboardée : la durée = la somme de ses plans (la voix de
  // chaque plan a le dernier mot sur sa durée cible).
  const shots = sceneShots(scene);
  if (shots.length > 0) {
    const total = shots.reduce((sum, sh) => sum + shotEffectiveSec(sh, scene), 0);
    return Math.max(FPS, Math.round(total * FPS));
  }
  return Math.max(FPS, Math.round((scene.durationSec || 5) * FPS));
}

// Position de départ (frames, relatives à la scène) de chaque plan.
export function shotOffsets(scene) {
  const offsets = [];
  let t = 0;
  for (const sh of sceneShots(scene)) {
    offsets.push(Math.round(t * FPS));
    t += shotEffectiveSec(sh, scene);
  }
  return offsets;
}

// Position de départ (en frames, relatives à la scène) de chaque réplique audio.
export function lineOffsets(scene) {
  const offsets = [];
  let t = LINE_START_DELAY;
  for (const line of scene.lines || []) {
    offsets.push(Math.round(t * FPS));
    t += (line.audioDurationSec || 2) + LINE_GAP;
  }
  return offsets;
}

// Durée (frames) de l'outro personnel de l'auteur (vidéo ou image de marque).
export function outroClipFrames(studio) {
  if (!studio || !studio.outro) {
    return 0;
  }
  return Math.max(FPS, Math.round((studio.outroDurationSec || 4) * FPS));
}

// noOutroCard (chaînes) : la vidéo se termine sans carton « À suivre » —
// directement sur l'outro perso s'il existe.
export function episodeDurationInFrames(episode, studio, noOutroCard = false, cta = '') {
  const scenes = episode?.scenes || [];
  if (scenes.length === 0) {
    return FPS * 3;
  }
  const scenesTotal = scenes.reduce((sum, sc) => sum + sceneFrames(sc), 0);
  // Drama : carton « À suivre ». Pub : carton d'appel à l'action.
  const card = noOutroCard
    ? cta
      ? Math.round(CTA_SECONDS * FPS)
      : 0
    : Math.round(OUTRO_SECONDS * FPS);
  const clip = outroClipFrames(studio);
  // TransitionSeries : un fondu par coupe — entre les scènes, puis vers
  // chaque élément de fin présent (carton et/ou outro perso).
  const cuts = scenes.length - 1 + (card > 0 ? 1 : 0) + (clip > 0 ? 1 : 0);
  return scenesTotal + card + clip - TRANSITION_FRAMES * cuts;
}
