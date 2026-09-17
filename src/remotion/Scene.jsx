import React from 'react';
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  Sequence,
  Audio,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { FPS, SHOT_AUDIO_DELAY, sceneFrames, lineOffsets, shotOffsets } from './timing.js';
import { shotEffectiveSec } from '../../shared/catalog.js';

const KEN_BURNS = {
  'zoom-in': (p) => ({ scale: 1.05 + 0.13 * p, x: 0, y: 0 }),
  'zoom-out': (p) => ({ scale: 1.18 - 0.13 * p, x: 0, y: 0 }),
  'pan-left': (p) => ({ scale: 1.14, x: 3 - 6 * p, y: 0 }),
  'pan-right': (p) => ({ scale: 1.14, x: -3 + 6 * p, y: 0 }),
  'pan-up': (p) => ({ scale: 1.14, x: 0, y: 3 - 6 * p }),
};

function activeLineIndex(frame, scene) {
  const offsets = lineOffsets(scene);
  const lines = scene.lines || [];
  let active = -1;
  for (let i = 0; i < lines.length; i++) {
    const start = offsets[i];
    const end = start + Math.round(((lines[i].audioDurationSec || 2) + 0.3) * FPS);
    if (frame >= start && frame < end) {
      active = i;
    }
  }
  return active;
}

// Image fixe d'un plan : zoom lent 1,00 → 1,06 sur la durée du plan.
const ShotStill = ({ src, durationInFrames }) => {
  const frame = useCurrentFrame();
  const p = Math.min(1, frame / Math.max(1, durationInFrames));
  return (
    <Img
      src={src}
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        transform: `scale(${1 + 0.06 * p})`,
      }}
    />
  );
};

// Scène storyboardée : coupes franches entre les plans, la réplique de
// chaque plan démarre juste après sa coupe, sous-titre pendant le plan.
const ShotsScene = ({ scene, characters, assetBase, isFirst, episodeTitle, episodeNumber }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const shots = scene.shots;
  const offsets = shotOffsets(scene);
  const lines = scene.lines || [];
  const delay = Math.round(SHOT_AUDIO_DELAY * FPS);
  const durations = shots.map((sh) => Math.round(shotEffectiveSec(sh, scene) * FPS));

  const charById = {};
  for (const c of characters || []) {
    charById[c.id] = c;
  }

  let active = -1;
  shots.forEach((sh, i) => {
    if (frame >= offsets[i] && frame < offsets[i] + durations[i]) {
      active = i;
    }
  });
  const activeLine =
    active >= 0 && shots[active].lineIndex != null ? lines[shots[active].lineIndex] : null;

  const titleOpacity = isFirst
    ? interpolate(frame, [0, 0.4 * fps, 2.2 * fps, 3 * fps], [0, 1, 1, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 0;

  return (
    <AbsoluteFill style={{ backgroundColor: '#0c0a08', overflow: 'hidden' }}>
      {shots.map((sh, i) => (
        <Sequence key={`shot-${i}`} from={offsets[i]} durationInFrames={durations[i]}>
          {sh.video ? (
            // Clip du plan (muet, coupé à la durée du plan par la Sequence).
            <OffthreadVideo
              src={`${assetBase}/${sh.video}`}
              muted
              pauseWhenBuffering
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : sh.image ? (
            <ShotStill src={`${assetBase}/${sh.image}`} durationInFrames={durations[i]} />
          ) : scene.image ? (
            <Img
              src={`${assetBase}/${scene.image}`}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <AbsoluteFill
              style={{
                background: 'linear-gradient(160deg, #2b1f10 0%, #0c0a08 70%)',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 80,
              }}
            >
              <div style={{ color: '#9c8a5a', fontSize: 40, fontFamily: 'Helvetica, Arial, sans-serif', textAlign: 'center' }}>
                Image du plan manquante
              </div>
            </AbsoluteFill>
          )}
        </Sequence>
      ))}

      {/* Dégradé de lisibilité pour les sous-titres */}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.35) 18%, rgba(0,0,0,0) 34%)',
        }}
      />

      {isFirst ? (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-start', paddingTop: 220, opacity: titleOpacity }}>
          <div style={{ fontFamily: 'Georgia, serif', color: '#f4e9c8', fontSize: 46, letterSpacing: 8, textTransform: 'uppercase' }}>
            Épisode {episodeNumber}
          </div>
          <div
            style={{
              fontFamily: 'Georgia, serif',
              fontWeight: 700,
              color: '#ffffff',
              fontSize: 76,
              marginTop: 18,
              padding: '0 60px',
              textAlign: 'center',
              textShadow: '0 4px 30px rgba(0,0,0,0.9)',
              lineHeight: 1.15,
            }}
          >
            {episodeTitle}
          </div>
        </AbsoluteFill>
      ) : null}

      {/* Voix : la réplique de chaque plan démarre juste après sa coupe */}
      {shots.map((sh, i) => {
        const line = sh.lineIndex != null ? lines[sh.lineIndex] : null;
        return line && line.audio ? (
          <Sequence key={`shot-audio-${i}`} from={offsets[i] + delay} layout="none">
            <Audio src={`${assetBase}/${line.audio}`} />
          </Sequence>
        ) : null;
      })}

      {/* Sous-titre : la réplique du plan actif */}
      {activeLine ? (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 150 }}>
          <div style={{ maxWidth: 900, textAlign: 'center', padding: '0 60px' }}>
            {activeLine.speaker !== 'narrator' && charById[activeLine.speaker] ? (
              <div
                style={{
                  fontFamily: 'Helvetica, Arial, sans-serif',
                  fontWeight: 800,
                  fontSize: 34,
                  letterSpacing: 4,
                  textTransform: 'uppercase',
                  color: charById[activeLine.speaker].color || '#f2c14e',
                  marginBottom: 14,
                  textShadow: '0 2px 12px rgba(0,0,0,0.9)',
                }}
              >
                {charById[activeLine.speaker].name}
              </div>
            ) : null}
            <div
              style={{
                fontFamily: 'Helvetica, Arial, sans-serif',
                fontWeight: 700,
                fontSize: 46,
                lineHeight: 1.3,
                color: activeLine.speaker === 'narrator' ? '#f4e9c8' : '#ffffff',
                fontStyle: activeLine.speaker === 'narrator' ? 'italic' : 'normal',
                textShadow: '0 3px 18px rgba(0,0,0,0.95)',
              }}
            >
              {activeLine.text}
            </div>
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};

export const Scene = ({ scene, characters, assetBase, isFirst, episodeTitle, episodeNumber }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Scène storyboardée : montage plan par plan (coupes franches).
  if (Array.isArray(scene.shots) && scene.shots.length > 0) {
    return (
      <ShotsScene
        scene={scene}
        characters={characters}
        assetBase={assetBase}
        isFirst={isFirst}
        episodeTitle={episodeTitle}
        episodeNumber={episodeNumber}
      />
    );
  }

  const total = sceneFrames(scene);
  const progress = Math.min(1, frame / total);

  const move = (KEN_BURNS[scene.kenBurns] || KEN_BURNS['zoom-in'])(progress);
  const offsets = lineOffsets(scene);
  const lines = scene.lines || [];
  const active = activeLineIndex(frame, scene);

  const charById = {};
  for (const c of characters || []) {
    charById[c.id] = c;
  }

  const titleOpacity = isFirst
    ? interpolate(frame, [0, 0.4 * fps, 2.2 * fps, 3 * fps], [0, 1, 1, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 0;

  return (
    <AbsoluteFill style={{ backgroundColor: '#0c0a08', overflow: 'hidden' }}>
      {scene.video ? (
        // Clip vidéo généré par OpenArt (muet : voix off et musique par-dessus).
        // Si la scène dure plus longtemps que le clip, la dernière image reste affichée.
        <OffthreadVideo
          src={`${assetBase}/${scene.video}`}
          muted
          pauseWhenBuffering
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : scene.image ? (
        <Img
          src={`${assetBase}/${scene.image}`}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: `scale(${move.scale}) translate(${move.x}%, ${move.y}%)`,
          }}
        />
      ) : (
        <AbsoluteFill
          style={{
            background: 'linear-gradient(160deg, #2b1f10 0%, #0c0a08 70%)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 80,
          }}
        >
          <div style={{ color: '#9c8a5a', fontSize: 44, fontFamily: 'Helvetica, Arial, sans-serif', textAlign: 'center', lineHeight: 1.4 }}>
            Image manquante
            <div style={{ fontSize: 28, marginTop: 30, color: '#6d6045' }}>{scene.imagePrompt}</div>
          </div>
        </AbsoluteFill>
      )}

      {/* Dégradé de lisibilité pour les sous-titres */}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.35) 18%, rgba(0,0,0,0) 34%)',
        }}
      />

      {/* Titre de l'épisode sur la première scène */}
      {isFirst ? (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-start', paddingTop: 220, opacity: titleOpacity }}>
          <div
            style={{
              fontFamily: 'Georgia, serif',
              color: '#f4e9c8',
              fontSize: 46,
              letterSpacing: 8,
              textTransform: 'uppercase',
            }}
          >
            Épisode {episodeNumber}
          </div>
          <div
            style={{
              fontFamily: 'Georgia, serif',
              fontWeight: 700,
              color: '#ffffff',
              fontSize: 76,
              marginTop: 18,
              padding: '0 60px',
              textAlign: 'center',
              textShadow: '0 4px 30px rgba(0,0,0,0.9)',
              lineHeight: 1.15,
            }}
          >
            {episodeTitle}
          </div>
        </AbsoluteFill>
      ) : null}

      {/* Pistes voix */}
      {lines.map((line, i) =>
        line.audio ? (
          <Sequence key={`audio-${i}-${line.audio}`} from={offsets[i]} layout="none">
            <Audio src={`${assetBase}/${line.audio}`} />
          </Sequence>
        ) : null,
      )}

      {/* Sous-titres */}
      {active >= 0 ? (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 150 }}>
          <div style={{ maxWidth: 900, textAlign: 'center', padding: '0 60px' }}>
            {lines[active].speaker !== 'narrator' && charById[lines[active].speaker] ? (
              <div
                style={{
                  fontFamily: 'Helvetica, Arial, sans-serif',
                  fontWeight: 800,
                  fontSize: 34,
                  letterSpacing: 4,
                  textTransform: 'uppercase',
                  color: charById[lines[active].speaker].color || '#f2c14e',
                  marginBottom: 14,
                  textShadow: '0 2px 12px rgba(0,0,0,0.9)',
                }}
              >
                {charById[lines[active].speaker].name}
              </div>
            ) : null}
            <div
              style={{
                fontFamily: 'Helvetica, Arial, sans-serif',
                fontWeight: 700,
                fontSize: 46,
                lineHeight: 1.3,
                color: lines[active].speaker === 'narrator' ? '#f4e9c8' : '#ffffff',
                fontStyle: lines[active].speaker === 'narrator' ? 'italic' : 'normal',
                textShadow: '0 3px 18px rgba(0,0,0,0.95)',
              }}
            >
              {lines[active].text}
            </div>
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
