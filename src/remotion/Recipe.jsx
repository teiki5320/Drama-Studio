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
import { FPS, TRANSITION_FRAMES, sceneFrames, lineOffsets, outroClipFrames } from './timing.js';

// ---------- Vidéo de recette ----------
// Même squelette que les dramas (scènes enchaînées, voix off, musique,
// marque de l'auteur) mais avec l'habillage d'une vidéo de cuisine :
// titre du plat, liste d'ingrédients qui s'affiche ligne à ligne, numéro
// d'étape en gros, barre de progression, carte de fin alohash.fr.

const GOLD = '#f2b544';
const CREAM = '#fff6e6';

// Durée totale d'une recette : ses scènes, moins les fondus, plus l'outro
// personnelle éventuelle. (Pas de carton « À suivre » : la recette finit
// sur son appel à l'action.)
export function recipeDurationInFrames(episode, studio) {
  const scenes = episode?.scenes || [];
  if (scenes.length === 0) {
    return FPS * 3;
  }
  const total = scenes.reduce((sum, sc) => sum + sceneFrames(sc), 0);
  const clip = outroClipFrames(studio);
  const cuts = scenes.length - 1 + (clip > 0 ? 1 : 0);
  return total + clip - TRANSITION_FRAMES * cuts;
}

const Fond = ({ scene, assetBase, durationInFrames }) => {
  const frame = useCurrentFrame();
  const p = Math.min(1, frame / Math.max(1, durationInFrames));
  if (scene.video) {
    return (
      <OffthreadVideo
        src={`${assetBase}/${scene.video}`}
        muted
        pauseWhenBuffering
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    );
  }
  if (scene.image) {
    return (
      <Img
        src={`${assetBase}/${scene.image}`}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: `scale(${1.03 + 0.07 * p})`,
        }}
      />
    );
  }
  return (
    <AbsoluteFill
      style={{
        background: 'linear-gradient(160deg, #3b1d0a 0%, #120a05 70%)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 80,
      }}
    >
      <div style={{ color: '#c49a5a', fontSize: 44, fontFamily: 'Helvetica, Arial, sans-serif' }}>
        Image manquante
      </div>
    </AbsoluteFill>
  );
};

// Bandeau titre : nom du plat, pays et temps total.
const CarteTitre = ({ recipe, title }) => {
  const frame = useCurrentFrame() - TRANSITION_FRAMES;
  const { fps } = useVideoConfig();
  if (frame < 0) {
    return null;
  }
  const y = interpolate(frame, [0, 0.5 * fps], [40, 0], { extrapolateRight: 'clamp' });
  const opacity = interpolate(frame, [0, 0.4 * fps], [0, 1], { extrapolateRight: 'clamp' });
  const infos = [recipe?.country, recipe?.totalText].filter(Boolean).join(' · ');
  return (
    <AbsoluteFill
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        opacity,
        transform: `translateY(${y}px)`,
        padding: 70,
      }}
    >
      <div
        style={{
          fontFamily: 'Georgia, serif',
          fontWeight: 700,
          color: '#ffffff',
          fontSize: 92,
          textAlign: 'center',
          lineHeight: 1.1,
          textShadow: '0 6px 34px rgba(0,0,0,0.95)',
        }}
      >
        {recipe?.name || title}
      </div>
      {infos ? (
        <div
          style={{
            marginTop: 30,
            padding: '14px 40px',
            borderRadius: 999,
            background: GOLD,
            color: '#2a1705',
            fontFamily: 'Helvetica, Arial, sans-serif',
            fontWeight: 800,
            fontSize: 42,
            letterSpacing: 2,
            textTransform: 'uppercase',
          }}
        >
          {infos}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

// Liste d'ingrédients : une ligne apparaît toutes les ~0,45 s.
const ListeIngredients = ({ items }) => {
  const frame = useCurrentFrame() - TRANSITION_FRAMES;
  const { fps } = useVideoConfig();
  if (frame < 0) {
    return null;
  }
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', padding: '0 90px' }}>
      <div
        style={{
          width: '100%',
          background: 'rgba(12,8,5,0.72)',
          borderRadius: 26,
          padding: '38px 44px',
          border: `3px solid ${GOLD}`,
        }}
      >
        <div
          style={{
            fontFamily: 'Helvetica, Arial, sans-serif',
            fontWeight: 800,
            fontSize: 38,
            letterSpacing: 5,
            textTransform: 'uppercase',
            color: GOLD,
            marginBottom: 26,
          }}
        >
          Ingrédients
        </div>
        {items.map((it, i) => {
          const start = i * 0.45 * fps;
          const opacity = interpolate(frame, [start, start + 0.3 * fps], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          const x = interpolate(frame, [start, start + 0.3 * fps], [-26, 0], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          return (
            <div
              key={i}
              style={{
                opacity,
                transform: `translateX(${x}px)`,
                fontFamily: 'Helvetica, Arial, sans-serif',
                fontWeight: 700,
                fontSize: 46,
                color: CREAM,
                lineHeight: 1.45,
                display: 'flex',
                gap: 18,
              }}
            >
              <span style={{ color: GOLD }}>•</span>
              <span>{it}</span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// Numéro d'étape en gros (01, 02…) + résumé de l'étape.
const Etape = ({ numero, texte }) => {
  const frame = useCurrentFrame() - TRANSITION_FRAMES;
  const { fps } = useVideoConfig();
  if (frame < 0) {
    return null;
  }
  const opacity = interpolate(frame, [0, 0.3 * fps], [0, 1], { extrapolateRight: 'clamp' });
  const scale = interpolate(frame, [0, 0.45 * fps], [0.86, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill style={{ alignItems: 'flex-start', justifyContent: 'flex-start', padding: 90, opacity }}>
      <div
        style={{
          fontFamily: 'Georgia, serif',
          fontWeight: 700,
          fontSize: 150,
          color: GOLD,
          lineHeight: 1,
          transform: `scale(${scale})`,
          transformOrigin: 'left top',
          textShadow: '0 6px 30px rgba(0,0,0,0.9)',
        }}
      >
        {String(numero).padStart(2, '0')}
      </div>
      {texte ? (
        <div
          style={{
            marginTop: 18,
            maxWidth: 760,
            fontFamily: 'Helvetica, Arial, sans-serif',
            fontWeight: 800,
            fontSize: 54,
            color: '#ffffff',
            lineHeight: 1.22,
            textShadow: '0 4px 22px rgba(0,0,0,0.95)',
          }}
        >
          {texte}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

// Texte à l'écran simple (accroche, plat fini) — gros, contrasté, zone sûre.
const TexteEcran = ({ texte, position = 'bas' }) => {
  const frame = useCurrentFrame() - TRANSITION_FRAMES;
  const { fps } = useVideoConfig();
  if (frame < 0) {
    return null;
  }
  const opacity = interpolate(frame, [0, 0.3 * fps], [0, 1], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill
      style={{
        alignItems: 'center',
        justifyContent: position === 'haut' ? 'flex-start' : 'center',
        paddingLeft: 80,
        paddingRight: 80,
        paddingTop: position === 'haut' ? 260 : 0,
        opacity,
      }}
    >
      <div
        style={{
          fontFamily: 'Helvetica, Arial, sans-serif',
          fontWeight: 900,
          fontSize: 76,
          color: '#ffffff',
          textAlign: 'center',
          lineHeight: 1.18,
          textShadow: '0 6px 30px rgba(0,0,0,0.95)',
        }}
      >
        {texte}
      </div>
    </AbsoluteFill>
  );
};

// Carte de fin : l'adresse du site.
const CarteFin = ({ texte }) => {
  const frame = useCurrentFrame() - TRANSITION_FRAMES;
  const { fps } = useVideoConfig();
  if (frame < 0) {
    return null;
  }
  const opacity = interpolate(frame, [0, 0.4 * fps], [0, 1], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 340, opacity }}>
      <div
        style={{
          padding: '26px 56px',
          borderRadius: 999,
          background: CREAM,
          color: '#2a1705',
          fontFamily: 'Helvetica, Arial, sans-serif',
          fontWeight: 900,
          fontSize: 58,
          letterSpacing: 1,
          textAlign: 'center',
        }}
      >
        {texte}
      </div>
    </AbsoluteFill>
  );
};

// Barre de progression de la recette, tout en bas.
const Progression = ({ total }) => {
  const frame = useCurrentFrame();
  const p = Math.min(1, frame / Math.max(1, total));
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end' }}>
      <div style={{ height: 10, width: '100%', background: 'rgba(255,255,255,0.18)' }}>
        <div style={{ height: '100%', width: `${p * 100}%`, background: GOLD }} />
      </div>
    </AbsoluteFill>
  );
};

const PlanRecette = ({ scene, recipe, episodeTitle, assetBase, durationInFrames }) => {
  const frame = useCurrentFrame();
  const offsets = lineOffsets(scene);
  const lines = scene.lines || [];
  const kind = scene.kind || 'etape';

  // Sous-titre : la narration en cours (lisibilité en lecture muette).
  let active = -1;
  lines.forEach((l, i) => {
    const start = offsets[i];
    const end = start + Math.round(((l.audioDurationSec || 2) + 0.3) * FPS);
    if (frame >= start && frame < end) {
      active = i;
    }
  });

  return (
    <AbsoluteFill style={{ backgroundColor: '#0c0a08', overflow: 'hidden' }}>
      <Fond scene={scene} assetBase={assetBase} durationInFrames={durationInFrames} />

      <AbsoluteFill
        style={{
          background:
            'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.35) 22%, rgba(0,0,0,0.15) 50%, rgba(0,0,0,0.45) 100%)',
        }}
      />

      {kind === 'titre' ? <CarteTitre recipe={recipe} title={episodeTitle} /> : null}
      {kind === 'ingredients' && (scene.ingredients || []).length > 0 ? (
        <ListeIngredients items={scene.ingredients} />
      ) : null}
      {kind === 'etape' ? <Etape numero={scene.stepNumber || 1} texte={scene.onScreen} /> : null}
      {(kind === 'hook' || kind === 'final') && scene.onScreen ? (
        <TexteEcran texte={scene.onScreen} position="haut" />
      ) : null}
      {kind === 'cta' ? <CarteFin texte={scene.onScreen || 'alohash.fr'} /> : null}

      {/* Voix off */}
      {lines.map((line, i) =>
        line.audio ? (
          <Sequence key={`a-${i}-${line.audio}`} from={offsets[i]} layout="none">
            <Audio src={`${assetBase}/${line.audio}`} />
          </Sequence>
        ) : null,
      )}

      {/* Sous-titre de la narration */}
      {active >= 0 ? (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 160 }}>
          <div
            style={{
              maxWidth: 880,
              textAlign: 'center',
              fontFamily: 'Helvetica, Arial, sans-serif',
              fontWeight: 700,
              fontSize: 44,
              lineHeight: 1.3,
              color: CREAM,
              textShadow: '0 3px 18px rgba(0,0,0,0.95)',
              padding: '0 40px',
            }}
          >
            {lines[active].text}
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};

export const Recipe = ({ episode, assetBase, musicFile, studio, studioBase }) => {
  const scenes = episode?.scenes || [];
  if (scenes.length === 0) {
    return (
      <AbsoluteFill style={{ backgroundColor: '#0c0a08', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#c49a5a', fontSize: 48, fontFamily: 'Georgia, serif' }}>Recette vide</div>
      </AbsoluteFill>
    );
  }
  const recipe = episode.recipe || null;
  const clipFrames = outroClipFrames(studio);
  const mainFrames = recipeDurationInFrames(episode, null);

  const transition = (key) => (
    <TransitionSeries.Transition
      key={key}
      presentation={fade()}
      timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
    />
  );

  const children = [];
  scenes.forEach((scene, i) => {
    const frames = sceneFrames(scene);
    children.push(
      <TransitionSeries.Sequence key={`sc-${i}`} durationInFrames={frames}>
        <PlanRecette
          scene={scene}
          recipe={recipe}
          episodeTitle={episode.title}
          assetBase={assetBase}
          durationInFrames={frames}
        />
      </TransitionSeries.Sequence>,
    );
    if (i < scenes.length - 1) {
      children.push(transition(`tr-${i}`));
    }
  });
  if (clipFrames > 0) {
    children.push(
      transition('tr-outro'),
      <TransitionSeries.Sequence key="outro" durationInFrames={clipFrames}>
        {studio.outroIsVideo ? (
          <OffthreadVideo
            src={`${studioBase}/${studio.outro}`}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <Img src={`${studioBase}/${studio.outro}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        )}
      </TransitionSeries.Sequence>,
    );
  }

  return (
    <AbsoluteFill style={{ backgroundColor: '#0c0a08' }}>
      {musicFile ? (
        studio?.outroIsVideo && clipFrames > 0 ? (
          <Sequence from={0} durationInFrames={mainFrames} layout="none">
            <Audio src={`${assetBase}/${musicFile}`} loop volume={0.1} />
          </Sequence>
        ) : (
          <Audio src={`${assetBase}/${musicFile}`} loop volume={0.1} />
        )
      ) : null}

      <TransitionSeries>{children}</TransitionSeries>

      {/* Barre de progression de la recette (pas pendant l'outro perso) */}
      <Sequence from={0} durationInFrames={mainFrames}>
        <Progression total={mainFrames} />
      </Sequence>

      {studio?.sticker ? (
        <Sequence from={0} durationInFrames={clipFrames > 0 ? mainFrames : undefined}>
          <AbsoluteFill style={{ alignItems: 'flex-end', justifyContent: 'flex-start', padding: 36 }}>
            <Img src={`${studioBase}/${studio.sticker}`} style={{ width: 200, opacity: 0.92 }} />
          </AbsoluteFill>
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};
