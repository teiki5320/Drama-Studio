import React from 'react';
import {
  AbsoluteFill,
  OffthreadVideo,
  Sequence,
  Audio,
  interpolate,
  Easing,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { SafeImg } from './SafeImg.jsx';
import { EreaFrise, EreaQuestion } from './EreaFrise.jsx';
import { PalabreJeu } from './PalabreJeu.jsx';
import { EreaLogoIntro, EreaRevelation, EreaSlogan, EreaHistorien, EreaBascule, EreaCatastrophe } from './EreaPub.jsx';
import { Clip, mouvementImage } from './Clip.jsx';
import { FPS, SHOT_AUDIO_DELAY, sceneFrames, lineOffsets, shotOffsets, shotDurations } from './timing.js';

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

// Incrustation d'une pub : situe le plan d'un coup d'œil (« Rome, -52 »).
// Elle apparaît en fondu dès le début du plan, en haut de l'image.
const SceneBadge = ({ text }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = interpolate(frame, [0, 0.35 * fps], [0, 1], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-start', paddingTop: 140, opacity }}>
      <div
        style={{
          fontFamily: 'Helvetica, Arial, sans-serif',
          fontWeight: 800,
          fontSize: 54,
          letterSpacing: 4,
          textTransform: 'uppercase',
          color: '#ffffff',
          background: 'rgba(0,0,0,0.55)',
          border: '3px solid rgba(255,255,255,0.85)',
          borderRadius: 14,
          padding: '14px 34px',
          textShadow: '0 3px 18px rgba(0,0,0,0.9)',
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

// Pub Erea : fichiers de l'appli (décors, personnages, polices) copiés dans
// le projet → adresses complètes.
const ereaAssets = (o, base) => ({
  sons: o.sons ? { tic: o.sons.tic ? `${base}/${o.sons.tic}` : null, tac: o.sons.tac ? `${base}/${o.sons.tac}` : null } : null,
  bg: (o.bg || []).map((f) => (f ? `${base}/${f}` : null)),
  anim: (o.anim || []).map((f) => (f ? `${base}/${f}` : null)),
  fonts: o.fonts
    ? { baloo: `${base}/${o.fonts.baloo}`, nunito: `${base}/${o.fonts.nunito}`, nunitoBlack: `${base}/${o.fonts.nunitoBlack}` }
    : null,
});

// Pub Palabre : fichiers du jeu copiés dans le projet → adresses complètes.
const palabreUrls = (jeu, base) => {
  const u = (f) => (f ? `${base}/${f}` : null);
  return {
    ...jeu,
    carte: jeu.carte ? { ...jeu.carte, portrait: u(jeu.carte.portrait) } : undefined,
    fin: jeu.fin ? { ...jeu.fin, image: u(jeu.fin.image) } : undefined,
    etapes: (jeu.etapes || []).map((e) => ({ ...e, images: (e.images || []).map(u) })),
    carteMur: u(jeu.carteMur),
  };
};
const palabreFonts = (f, base) => (f ? Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v ? `${base}/${v}` : null])) : null);

// Illustration détourée de l'appli (légume, Tamassi…) posée sur le fond,
// avec un léger rebond kawaii.
const Sticker = ({ src, size = 0.62, y = 0 }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const pop = interpolate(frame, [0, 0.45 * fps], [0.6, 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.back(1.8)) });
  const bob = Math.sin((frame / fps) * Math.PI * 1.2) * 14;
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <SafeImg
        src={src}
        style={{ width: width * size, transform: `translateY(${y + bob}px) scale(${pop})`, filter: 'drop-shadow(0 18px 30px rgba(80,60,40,0.25))' }}
      />
    </AbsoluteFill>
  );
};

// Pub « chiffres » (OptiLED) : un vrai chiffre du site, en très grand, qui
// compte jusqu'à sa valeur (« 25 W »), et ce qu'il veut dire dessous.
const StatOverlay = ({ valeur, label }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const m = String(valeur || '').match(/^(\d+(?:[.,]\d+)?)(.*)$/);
  const p = interpolate(frame, [0.2 * fps, 1.2 * fps], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const shown = m
    ? `${(Number(m[1].replace(',', '.')) * p).toFixed(m[1].includes(',') || m[1].includes('.') ? 1 : 0).replace('.', ',')}${m[2]}`
    : valeur;
  const pop = interpolate(frame, [0, 0.35 * fps], [0.8, 1], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', background: 'rgba(15,8,20,0.45)' }}>
      <div
        style={{
          fontFamily: 'Helvetica, Arial, sans-serif',
          fontWeight: 900,
          fontSize: 230,
          color: '#f7c07a',
          lineHeight: 1,
          transform: `scale(${pop})`,
          textShadow: '0 10px 50px rgba(0,0,0,0.85)',
        }}
      >
        {shown}
      </div>
      {label ? (
        <div
          style={{
            marginTop: 26,
            fontFamily: 'Helvetica, Arial, sans-serif',
            fontWeight: 800,
            fontSize: 58,
            color: '#ffffff',
            textAlign: 'center',
            padding: '0 80px',
            textShadow: '0 4px 24px rgba(0,0,0,0.9)',
          }}
        >
          {label}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

// Pub d'ambiance : quelques mots élégants, en fondu, au tiers bas de l'image.
const SoftCaption = ({ text }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const opacity = interpolate(
    frame,
    [0.5 * fps, 1.4 * fps, Math.max(1.5 * fps, durationInFrames - 1.2 * fps), Math.max(1.6 * fps, durationInFrames - 0.3 * fps)],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 260, opacity }}>
      <div
        style={{
          fontFamily: 'Georgia, serif',
          fontStyle: 'italic',
          fontSize: 62,
          color: '#fff8ec',
          textAlign: 'center',
          padding: '0 90px',
          lineHeight: 1.25,
          textShadow: '0 4px 30px rgba(0,0,0,0.85)',
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

// Image fixe d'un plan : zoom lent 1,00 → 1,06 sur la durée du plan.
const ShotStill = ({ src, durationInFrames, index = 0 }) => {
  const frame = useCurrentFrame();
  const p = Math.min(1, frame / Math.max(1, durationInFrames));
  return (
    <SafeImg
      src={src}
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        transform: mouvementImage(index, p),
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
  const durations = shotDurations(scene);

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
            <Clip src={`${assetBase}/${sh.video}`} clipSec={sh.videoDurationSec} planFrames={durations[i]} />
          ) : sh.image ? (
            <ShotStill src={`${assetBase}/${sh.image}`} durationInFrames={durations[i]} index={i} />
          ) : scene.image ? (
            <SafeImg
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
          // Bornée à son plan : une réplique trop longue ne déborde pas sur la
          // voix du plan suivant.
          <Sequence
            key={`shot-audio-${i}`}
            from={offsets[i] + delay}
            durationInFrames={Math.max(1, durations[i] - delay)}
            layout="none"
          >
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
  // Visite déco : la caméra part de la pièce entière et zoome lentement sur un
  // objet précis de la photo (position en % de l'image).
  const focus = scene.focus && Number.isFinite(scene.focus.x) ? scene.focus : null;
  const focusScale = focus ? interpolate(progress, [0, 1], [1.15, 1.9], { easing: Easing.inOut(Easing.cubic) }) : 1;
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

  // Voix et bruitages d'un écran dessiné par le studio.
  const pistes = (
    <>
      {(scene.sfx || []).map((x, i) => (
        <Sequence
          key={`sfx-${i}`}
          from={x.frac != null ? Math.round(x.frac * total) : Math.round((x.at || 0) * fps)}
          durationInFrames={x.dur ? Math.max(1, Math.round(x.dur * fps)) : undefined}
          layout="none"
        >
          <Audio src={`${assetBase}/${x.file}`} volume={x.volume ?? 0.8} />
        </Sequence>
      ))}
      {lines.map((line, i) =>
        line.audio ? (
          <Sequence key={`v-${i}`} from={offsets[i]} layout="none">
            <Audio src={`${assetBase}/${line.audio}`} />
          </Sequence>
        ) : null,
      )}
    </>
  );
  const ereaFonts = (o) => (o && o.fonts ? ereaAssets(o, assetBase).fonts : null);

  // Pub Erea « temps qui bug » : logo, révélation, phrase choc.
  if (scene.ereaLogo) {
    return (
      <AbsoluteFill>
        <EreaLogoIntro icone={scene.ereaLogo.icone ? `${assetBase}/${scene.ereaLogo.icone}` : null} fonts={ereaFonts(scene.ereaLogo)} />
        {pistes}
      </AbsoluteFill>
    );
  }
  if (scene.revelation) {
    return (
      <AbsoluteFill>
        <EreaRevelation
          image={scene.image ? `${assetBase}/${scene.image}` : null}
          video={scene.video ? `${assetBase}/${scene.video}` : null}
          clipSec={scene.videoDurationSec}
          focus={scene.revelation.focus}
          zoomDe={scene.revelation.zoomDe}
          bugs={scene.revelation.bugs}
          legende={scene.revelation.legende}
          fonts={ereaFonts(scene.revelation)}
          planFrames={total}
        />
        {pistes}
      </AbsoluteFill>
    );
  }
  if (scene.historien) {
    return (
      <AbsoluteFill>
        <EreaHistorien
          video={scene.video ? `${assetBase}/${scene.video}` : null}
          image={scene.image ? `${assetBase}/${scene.image}` : null}
          clipSec={scene.videoDurationSec}
          nom={scene.historien.nom}
          moment={scene.historien.moment}
          fonts={ereaFonts(scene.historien)}
          planFrames={total}
        />
        {pistes}
      </AbsoluteFill>
    );
  }
  if (scene.bascule) {
    return (
      <AbsoluteFill>
        <EreaBascule
          de={scene.bascule.imgDe ? `${assetBase}/${scene.bascule.imgDe}` : null}
          vers={scene.bascule.imgVers ? `${assetBase}/${scene.bascule.imgVers}` : null}
        />
        {pistes}
      </AbsoluteFill>
    );
  }
  if (scene.catastrophe) {
    return (
      <AbsoluteFill>
        <EreaCatastrophe
          video={scene.video ? `${assetBase}/${scene.video}` : null}
          image={scene.image ? `${assetBase}/${scene.image}` : null}
          clipSec={scene.videoDurationSec}
          ecran={scene.catastrophe.ecran}
          fonts={ereaFonts(scene.catastrophe)}
          planFrames={total}
        />
        {pistes}
      </AbsoluteFill>
    );
  }
  if (scene.slogan) {
    return (
      <AbsoluteFill>
        <EreaSlogan texte={scene.slogan.texte} fonts={ereaFonts(scene.slogan)} />
        {pistes}
      </AbsoluteFill>
    );
  }

  // Pub Palabre : un écran du jeu, avec ses sons.
  if (scene.palabre) {
    return (
      <AbsoluteFill>
        <PalabreJeu jeu={palabreUrls(scene.palabre, assetBase)} fonts={palabreFonts(scene.palabreFonts, assetBase)} />
        {(scene.sfx || []).map((x, i) => (
          <Sequence
          key={`sfx-${i}`}
          from={x.frac != null ? Math.round(x.frac * total) : Math.round((x.at || 0) * fps)}
          durationInFrames={x.dur ? Math.max(1, Math.round(x.dur * fps)) : undefined}
          layout="none"
        >
            <Audio src={`${assetBase}/${x.file}`} volume={x.volume ?? 0.8} />
          </Sequence>
        ))}
        {lines.map((line, i) =>
          line.audio ? (
            <Sequence key={`pa-${i}`} from={offsets[i]} layout="none">
              <Audio src={`${assetBase}/${line.audio}`} />
            </Sequence>
          ) : null,
        )}
      </AbsoluteFill>
    );
  }

  // Pub Erea : la frise du jeu qui défile jusqu'à la (mauvaise) époque.
  if (scene.frise) {
    return (
      <AbsoluteFill>
        <EreaFrise depart={scene.frise.depart} arrivee={scene.frise.arrivee} assets={ereaAssets(scene.frise, assetBase)} />
        {lines.map((line, i) =>
          line.audio ? (
            <Sequence key={`fa-${i}`} from={offsets[i]} layout="none">
              <Audio src={`${assetBase}/${line.audio}`} />
            </Sequence>
          ) : null,
        )}
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ backgroundColor: '#0c0a08', overflow: 'hidden' }}>
      {scene.video ? (
        // Clip vidéo généré par OpenArt (muet : voix off et musique par-dessus).
        <Clip src={`${assetBase}/${scene.video}`} clipSec={scene.videoDurationSec} planFrames={total} />
      ) : scene.image ? (
        <SafeImg
          src={`${assetBase}/${scene.image}`}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            ...(focus
              ? {
                  objectPosition: `${focus.x}% ${focus.y}%`,
                  transformOrigin: `${focus.x}% ${focus.y}%`,
                  transform: `scale(${focusScale})`,
                }
              : { transform: `scale(${move.scale}) translate(${move.x}%, ${move.y}%)` }),
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
        </AbsoluteFill>
      )}

      {/* Dégradé de lisibilité pour les sous-titres */}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.35) 18%, rgba(0,0,0,0) 34%)',
        }}
      />

      {/* Pub : incrustation qui situe le plan (lieu, année) */}
      {scene.stat && scene.stat.valeur ? <StatOverlay valeur={scene.stat.valeur} label={scene.stat.label} /> : null}
      {scene.sticker ? <Sticker src={`${assetBase}/${scene.sticker}`} size={scene.stickerSize || 0.62} y={scene.stickerY || 0} /> : null}
      {scene.question ? (
        <EreaQuestion titre={scene.question.titre} texte={scene.question.texte} fonts={ereaAssets(scene.question, assetBase).fonts} />
      ) : null}
      {scene.badge ? (
        scene.badgeStyle === 'doux' ? <SoftCaption text={scene.badge} /> : <SceneBadge text={scene.badge} />
      ) : null}

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
