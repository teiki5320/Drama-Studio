import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { Scene } from './Scene.jsx';
import {
  FPS,
  TRANSITION_FRAMES,
  OUTRO_SECONDS,
  sceneFrames,
  outroClipFrames,
  episodeDurationInFrames,
} from './timing.js';

const Outro = ({ title, cliffhanger }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = interpolate(frame, [0, 0.5 * fps], [0, 1], {
    extrapolateRight: 'clamp',
  });
  // Le cliffhanger s'affiche d'abord, « À suivre… » arrive ensuite.
  const suivreOpacity = interpolate(frame, [1.4 * fps, 2 * fps], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill
      style={{
        background: 'radial-gradient(ellipse at 50% 35%, #241a0c 0%, #090705 75%)',
        alignItems: 'center',
        justifyContent: 'center',
        opacity,
        padding: 80,
      }}
    >
      {cliffhanger ? (
        <div
          style={{
            fontFamily: 'Georgia, serif',
            fontStyle: 'italic',
            color: '#e8dcb8',
            fontSize: 46,
            textAlign: 'center',
            lineHeight: 1.4,
            marginBottom: 70,
          }}
        >
          « {cliffhanger} »
        </div>
      ) : null}
      <div
        style={{
          fontFamily: 'Georgia, serif',
          fontWeight: 700,
          color: '#d4af37',
          fontSize: 72,
          letterSpacing: 10,
          textTransform: 'uppercase',
          opacity: suivreOpacity,
        }}
      >
        À suivre…
      </div>
      <div
        style={{
          fontFamily: 'Helvetica, Arial, sans-serif',
          color: '#7d6f4d',
          fontSize: 32,
          marginTop: 40,
          letterSpacing: 3,
        }}
      >
        {title}
      </div>
    </AbsoluteFill>
  );
};

export const Episode = ({ episode, characters, assetBase, musicFile, seriesTitle, studio, studioBase, noOutroCard }) => {
  const scenes = episode?.scenes || [];

  if (scenes.length === 0) {
    return (
      <AbsoluteFill style={{ backgroundColor: '#0c0a08', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#9c8a5a', fontSize: 48, fontFamily: 'Georgia, serif' }}>Épisode vide</div>
      </AbsoluteFill>
    );
  }

  const clipFrames = outroClipFrames(studio);
  // Fin du contenu principal (scènes + carton éventuel) — l'outro perso vient après.
  const mainFrames = episodeDurationInFrames(episode, null, noOutroCard);

  const transition = (key) => (
    <TransitionSeries.Transition
      key={key}
      presentation={fade()}
      timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
    />
  );

  const seriesChildren = [];
  scenes.forEach((scene, i) => {
    seriesChildren.push(
      <TransitionSeries.Sequence key={`scene-${i}`} durationInFrames={sceneFrames(scene)}>
        <Scene
          scene={scene}
          characters={characters}
          assetBase={assetBase}
          isFirst={i === 0}
          episodeTitle={episode.title}
          episodeNumber={episode.number}
        />
      </TransitionSeries.Sequence>,
    );
    if (i < scenes.length - 1) {
      seriesChildren.push(transition(`tr-${i}`));
    }
  });
  // Éléments de fin : carton « À suivre » (dramas), puis outro perso (vidéo/image).
  if (!noOutroCard) {
    seriesChildren.push(
      transition('tr-outro-card'),
      <TransitionSeries.Sequence key="outro-card" durationInFrames={Math.round(OUTRO_SECONDS * FPS)}>
        <Outro title={seriesTitle} cliffhanger={episode.cliffhanger} />
      </TransitionSeries.Sequence>,
    );
  }
  if (clipFrames > 0) {
    seriesChildren.push(
      transition('tr-outro-clip'),
      <TransitionSeries.Sequence key="outro-clip" durationInFrames={clipFrames}>
        {studio.outroIsVideo ? (
          <OffthreadVideo
            src={`${studioBase}/${studio.outro}`}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <Img
            src={`${studioBase}/${studio.outro}`}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}
      </TransitionSeries.Sequence>,
    );
  }

  return (
    <AbsoluteFill style={{ backgroundColor: '#0c0a08' }}>
      {musicFile ? (
        // Si l'outro perso est une vidéo (avec son propre son), la musique s'arrête avant.
        studio?.outroIsVideo && clipFrames > 0 ? (
          <Sequence from={0} durationInFrames={mainFrames} layout="none">
            <Audio src={`${assetBase}/${musicFile}`} loop volume={0.12} />
          </Sequence>
        ) : (
          <Audio src={`${assetBase}/${musicFile}`} loop volume={0.12} />
        )
      ) : null}
      <TransitionSeries>{seriesChildren}</TransitionSeries>

      {/* Sticker de l'auteur, en haut à droite (pas pendant son outro). */}
      {studio?.sticker ? (
        <Sequence from={0} durationInFrames={clipFrames > 0 ? mainFrames : undefined}>
          <AbsoluteFill style={{ alignItems: 'flex-end', justifyContent: 'flex-start', padding: 36 }}>
            <Img
              src={`${studioBase}/${studio.sticker}`}
              style={{ width: 200, opacity: 0.92 }}
            />
          </AbsoluteFill>
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};
