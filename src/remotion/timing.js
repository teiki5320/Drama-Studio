// Constantes et calculs de durée partagés entre le Player (aperçu) et le rendu final.

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;
export const TRANSITION_FRAMES = 12;
// Carton « À suivre » : assez long pour lire le cliffhanger tranquillement.
export const OUTRO_SECONDS = 5.5;

export const LINE_START_DELAY = 0.5; // secondes avant la première réplique d'une scène
export const LINE_GAP = 0.35; // pause entre deux répliques

export function sceneFrames(scene) {
  return Math.max(FPS, Math.round((scene.durationSec || 5) * FPS));
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
export function episodeDurationInFrames(episode, studio, noOutroCard = false) {
  const scenes = episode?.scenes || [];
  if (scenes.length === 0) {
    return FPS * 3;
  }
  const scenesTotal = scenes.reduce((sum, sc) => sum + sceneFrames(sc), 0);
  const card = noOutroCard ? 0 : Math.round(OUTRO_SECONDS * FPS);
  const clip = outroClipFrames(studio);
  // TransitionSeries : un fondu par coupe — entre les scènes, puis vers
  // chaque élément de fin présent (carton et/ou outro perso).
  const cuts = scenes.length - 1 + (noOutroCard ? 0 : 1) + (clip > 0 ? 1 : 0);
  return scenesTotal + card + clip - TRANSITION_FRAMES * cuts;
}
