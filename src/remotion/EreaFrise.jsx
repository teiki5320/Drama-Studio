// Frise d'Erea pour les pubs : un portage FIDÈLE de l'écran de jeu de
// l'appli (erea_flutter/lib/ui/tape_widget.dart, era_theme.dart, era_art.dart,
// sticker_widgets.dart, game/guess_view.dart). Mêmes mesures, mêmes couleurs,
// mêmes images (décors d'époque en tuiles miroir avec parallaxe, personnage
// de chaque époque qui marche), mêmes polices (Baloo 2, Nunito).
//
// Tout est dessiné dans l'espace logique d'un iPhone (390 points de large),
// puis agrandi à 1080 px : la frise de la vidéo a les proportions du jeu.
import React, { useEffect, useState } from 'react';
import { AbsoluteFill, Audio, Easing, Sequence, continueRender, delayRender, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

// ---- timeline_scale.dart ----
const SEGMENTS = [
  [-3000, 0, 0.2],
  [0, 1500, 0.25],
  [1500, 1900, 0.25],
  [1900, 2026, 0.3],
];
const ERAS = [
  [-3000, -1200],
  [-1200, -500],
  [-500, 476],
  [476, 1492],
  [1492, 1789],
  [1789, 2026],
];
export function yearToFrac(y) {
  const v = Math.max(-3000, Math.min(2026, y));
  let acc = 0;
  for (const [from, to, w] of SEGMENTS) {
    if (v <= to) {
      return acc + (w * (v - from)) / (to - from);
    }
    acc += w;
  }
  return 1;
}
function fracToYear(f) {
  const v = Math.max(0, Math.min(1, f));
  let acc = 0;
  for (let i = 0; i < SEGMENTS.length; i++) {
    const [from, to, w] = SEGMENTS[i];
    if (v <= acc + w || i === SEGMENTS.length - 1) {
      return Math.max(-3000, Math.min(2026, Math.round(from + ((v - acc) / w) * (to - from))));
    }
    acc += w;
  }
  return 2026;
}
const formatYear = (y) => (y < 0 ? `${-y} av. J.-C.` : `${y}`);

// ---- era_theme.dart / era_art.dart ----
const THEMES = [
  { name: 'ÂGE DU BRONZE', tint: '#F9EAC9', ink: '#A97B36' },
  { name: 'ÂGE DU FER', tint: '#F2EDCF', ink: '#6E7A3A' },
  { name: 'ANTIQUITÉ', tint: '#E6DFF0', ink: '#7A5FA8' },
  { name: 'MOYEN ÂGE', tint: '#D8E6F5', ink: '#3F76B5' },
  { name: 'ÉPOQUE MODERNE', tint: '#FBE3C0', ink: '#C2822C' },
  { name: 'ÉPOQUE CONTEMPORAINE', tint: '#F9D9D4', ink: '#C9645A' },
];
// Personnages : nombre de vues de la planche, décalage vertical, taille de la planche (px).
const TRAVELERS = [
  { frames: 6, dy: 0, w: 1698, h: 305 },
  { frames: 6, dy: 0, w: 1986, h: 317 },
  { frames: 7, dy: 0, w: 2709, h: 217 },
  { frames: 5, dy: 0.26, w: 1270, h: 181 },
  { frames: 10, dy: 0.03, w: 2620, h: 300 },
  { frames: 5, dy: 0, w: 1295, h: 275 },
];
const BG_W = 1493;
const BG_H = 640;
const eraIndexAt = (year) => {
  for (let i = 0; i < ERAS.length; i++) {
    if (year <= ERAS[i][1]) {
      return i;
    }
  }
  return ERAS.length - 1;
};

// ---- sticker_widgets.dart ----
const INK = '#35406B';
const INK_SOFT = '#5F6890';
const CORAL = '#F25B4D';

const LOGICAL_W = 390; // largeur d'un iPhone, en points
const TAPE_W = 3200; // TapeWidget.tapeW
const TAPE_H = 282; // tapeHeightFor() sur iPhone (0,44 × ~640 pt disponibles)

// Polices de l'appli, chargées avant le rendu.
export function usePolicesErea(fonts) {
  return useFonts(fonts);
}
function useFonts(fonts) {
  const [handle] = useState(() => (fonts ? delayRender('Polices Erea') : null));
  useEffect(() => {
    if (!fonts) {
      return;
    }
    const faces = [
      new FontFace('Baloo2', `url(${fonts.baloo})`, { weight: '800' }),
      new FontFace('Nunito', `url(${fonts.nunito})`, { weight: '800' }),
      new FontFace('Nunito', `url(${fonts.nunitoBlack})`, { weight: '900' }),
    ];
    Promise.all(faces.map((f) => f.load().then((ff) => document.fonts.add(ff))))
      .catch(() => {})
      .finally(() => continueRender(handle));
  }, []);
}

// Le ruban : portage de _TapePainter.paint().
function Ruban({ frac, assets, facingLeft }) {
  const H = TAPE_H;
  const bigFont = Math.min(18, Math.max(13, H * 0.087));
  const smallFont = Math.min(14.5, Math.max(10.5, H * 0.07));
  const bandBottom = H * Math.min(0.84, Math.max(0.66, 1 - (bigFont * 1.5 + 10) / H));
  const px = (y) => yearToFrac(y) * TAPE_W;
  const visLeft = frac * TAPE_W - LOGICAL_W / 2;
  const visRight = visLeft + LOGICAL_W;
  const visible = (l, r, m = 8) => r >= visLeft - m && l <= visRight + m;
  const out = [];

  ERAS.forEach(([from, to], i) => {
    const bandLeft = px(from);
    const bandRight = px(to);
    if (!visible(bandLeft, bandRight)) {
      return;
    }
    const left = i === 0 ? Math.min(bandLeft, visLeft - 24) : bandLeft;
    const right = i === ERAS.length - 1 ? Math.max(bandRight, visRight + 24) : bandRight;
    const clipId = `era-${i}`;
    out.push(
      <clipPath key={`c${i}`} id={clipId}>
        <rect x={left} y={0} width={right - left} height={H} rx={16} />
      </clipPath>,
      <rect key={`b${i}`} x={left} y={0} width={right - left} height={H} rx={16} fill={THEMES[i].tint} />,
    );
    const inner = [];
    // Décor lointain en tuiles miroir alternées, parallaxe 0,60.
    if (assets.bg && assets.bg[i]) {
      const tileW = (bandBottom * BG_W) / BG_H;
      const period = tileW * 2;
      const phase = (((frac * TAPE_W * 0.6) % period) + period) % period;
      let x0 = bandLeft + phase - period;
      while (x0 > left) {
        x0 -= period;
      }
      let j = 0;
      for (let x = x0; x < right; x += tileW, j++) {
        if (!visible(x, x + tileW)) {
          continue;
        }
        inner.push(
          <image
            key={`t${i}-${j}`}
            href={assets.bg[i]}
            x={x}
            y={0}
            width={tileW}
            height={bandBottom}
            preserveAspectRatio="none"
            transform={j % 2 === 1 ? `translate(${2 * x + tileW} 0) scale(-1 1)` : undefined}
          />,
        );
      }
      // Voile clair en bas de bande (graduations lisibles).
      inner.push(<rect key={`v${i}`} x={left} y={bandBottom - 56} width={right - left} height={56} fill="url(#voile)" />);
    }
    // Le personnage de l'époque, qui marche (50 % de la vitesse du ruban).
    const spec = TRAVELERS[i];
    if (assets.anim && assets.anim[i]) {
      const fw = spec.w / spec.frames;
      const sprH = bandBottom * 0.4;
      const sprW = (sprH * fw) / spec.h;
      const bandW = bandRight - bandLeft;
      const n = Math.max(1, Math.floor(bandW / 640));
      const spacing = bandW / n;
      const drift = frac * TAPE_W * 0.5;
      const sprTop = bandBottom - sprH - 2 + sprH * spec.dy;
      for (let k = 0; k < n; k++) {
        const off = (((spacing * (k + 0.5) - drift) % bandW) + bandW) % bandW;
        const x = bandLeft + off - sprW / 2;
        if (!visible(x, x + sprW)) {
          continue;
        }
        let fi = (Math.floor((frac * TAPE_W) / 24) + k) % spec.frames;
        if (fi < 0) {
          fi += spec.frames;
        }
        inner.push(
          <g key={`p${i}-${k}`} transform={facingLeft ? `translate(${2 * x + sprW} 0) scale(-1 1)` : undefined}>
            <svg x={x} y={sprTop} width={sprW} height={sprH} viewBox={`${fi * fw} 0 ${fw} ${spec.h}`} preserveAspectRatio="none">
              <image href={assets.anim[i]} x={0} y={0} width={spec.w} height={spec.h} />
            </svg>
          </g>,
        );
      }
    }
    out.push(
      <g key={`g${i}`} clipPath={`url(#${clipId})`}>
        {inner}
      </g>,
    );
    // Pastilles du nom de l'époque (une par ~560 pt de bande).
    const bandW = bandRight - bandLeft;
    const n = Math.max(1, Math.floor(bandW / 560));
    const spacing = bandW / n;
    const label = THEMES[i].name;
    const lw = label.length * 8.1 + 1.5 * label.length;
    for (let k = 0; k < n; k++) {
      const cx = bandLeft + spacing * (k + 0.5);
      if (!visible(cx - lw / 2 - 7, cx + lw / 2 + 7)) {
        continue;
      }
      out.push(
        <g key={`l${i}-${k}`}>
          <rect x={cx - lw / 2 - 7} y={5} width={lw + 14} height={21} rx={10} fill="rgba(255,255,255,0.85)" />
          <text x={cx} y={20} textAnchor="middle" fontFamily="Nunito" fontWeight={800} fontSize={11} letterSpacing={1.5} fill={INK_SOFT}>
            {label}
          </text>
        </g>,
      );
    }
  });

  // Ligne de base.
  out.push(<line key="base" x1={visLeft} y1={bandBottom} x2={visRight} y2={bandBottom} stroke="rgba(53,64,107,0.55)" strokeWidth={3} />);

  // Graduations : [segment, mineure, moyenne, majeure].
  const plans = [
    [0, 100, 500, 1000],
    [1, 50, 250, 500],
    [2, 10, 50, 100],
    [3, 1, 5, 10],
  ];
  for (const [seg, minor, medium, major] of plans) {
    const [from, to] = SEGMENTS[seg];
    for (let y = from; y <= to; y += minor) {
      const x = px(y);
      if (x < visLeft - 4 || x > visRight + 4) {
        continue;
      }
      let h;
      let stroke;
      let w;
      if (y % major === 0) {
        h = H * 0.15;
        stroke = 'rgba(53,64,107,0.90)';
        w = 2.8;
      } else if (y % medium === 0) {
        h = H * 0.1;
        stroke = 'rgba(53,64,107,0.65)';
        w = 2.2;
      } else {
        h = H * 0.055;
        stroke = 'rgba(53,64,107,0.45)';
        w = 1.6;
      }
      out.push(<line key={`k${seg}-${y}`} x1={x} y1={bandBottom - h} x2={x} y2={bandBottom} stroke={stroke} strokeWidth={w} />);
    }
  }

  // Années sous la ligne.
  const big = [-3000, -2000, -1000, 0, 500, 1000, 1500, 1600, 1700, 1800, 1900, 1950, 2000, 2026];
  const small = [-2500, -1500, -500, 250, 750, 1250, 1550, 1650, 1750, 1850, 1910, 1920, 1930, 1940, 1960, 1970, 1980, 1990, 2010, 2020];
  const label = (y, size, color) => {
    const x = px(y);
    if (x < visLeft - 60 || x > visRight + 60) {
      return null;
    }
    return (
      <text key={`y${y}`} x={x} y={bandBottom + 6 + size} textAnchor="middle" fontFamily="Nunito" fontWeight={800} fontSize={size} fill={color}>
        {y < 0 ? `-${-y}` : y}
      </text>
    );
  };
  big.forEach((y) => out.push(label(y, bigFont, INK)));
  small.forEach((y) => out.push(label(y, smallFont, INK_SOFT)));

  return (
    <svg width={LOGICAL_W} height={H} viewBox={`${visLeft} 0 ${LOGICAL_W} ${H}`} style={{ display: 'block', overflow: 'hidden' }}>
      <defs>
        <linearGradient id="voile" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.75" />
        </linearGradient>
      </defs>
      {out}
    </svg>
  );
}

// Mini-carte des époques (MiniMap) avec son repère corail.
function MiniCarte({ frac }) {
  const stops = [];
  let from = 0;
  ERAS.forEach(([, to], i) => {
    const end = i === ERAS.length - 1 ? 1 : yearToFrac(to);
    stops.push(`${THEMES[i].tint} ${from * 100}%`, `${THEMES[i].tint} ${end * 100}%`);
    from = end;
  });
  return (
    <div style={{ position: 'relative', flex: 1, height: 44, display: 'flex', alignItems: 'center' }}>
      <div style={{ width: '100%', height: 12, borderRadius: 999, border: `1.5px solid ${INK}`, background: `linear-gradient(90deg, ${stops.join(', ')})` }} />
      <div style={{ position: 'absolute', left: `calc(${frac * 100}% - 2px)`, top: 12, width: 4, height: 20, borderRadius: 4, background: CORAL, boxShadow: '0 0 0 1px rgba(255,255,255,0.7)' }} />
    </div>
  );
}

const Bouton = ({ glyph }) => (
  <div style={{ width: 46, height: 46, borderRadius: 15, background: '#fff', boxShadow: '0 6px 14px rgba(53,64,107,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Baloo2', fontWeight: 800, fontSize: 26, color: INK }}>
    {glyph}
  </div>
);

// L'écran de jeu, frise au centre : la frise part de l'année du personnage,
// s'emballe, revient et se pose sur l'année d'arrivée.
export const EreaFrise = ({ depart, arrivee, assets = {} }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();
  useFonts(assets.fonts);
  const fA = yearToFrac(depart);
  const fB = yearToFrac(arrivee);
  const pos = (f) => {
    const t = Math.min(1, f / Math.max(1, durationInFrames - 0.9 * fps));
    const swing = interpolate(t, [0, 0.35, 0.6, 0.8, 1], [0, 1.25, 0.85, 1.05, 1], { easing: Easing.inOut(Easing.cubic) });
    return Math.max(0, Math.min(1, fA + (fB - fA) * swing));
  };
  const frac = pos(frame);
  const facingLeft = pos(frame + 1) > frac; // on avance dans le temps → ils marchent vers la gauche
  // Le cliquetis du jeu (tape_widget.dart) : un cran tous les 24 px de
  // ruban parcourus, jamais deux à moins de 55 ms, en alternant « tic » et
  // « tac » — il ralentit tout seul quand la frise freine.
  const crans = [];
  if (assets.sons && assets.sons.tic) {
    let parcouru = 0;
    let dernier = -1e9;
    for (let f = 1; f < durationInFrames; f++) {
      parcouru += Math.abs(pos(f) - pos(f - 1)) * TAPE_W;
      if (parcouru >= 24 && ((f - dernier) / fps) * 1000 >= 55) {
        parcouru = 0;
        dernier = f;
        crans.push(f);
      }
    }
  }
  const done = frame >= durationInFrames - 0.9 * fps;
  const annee = done ? arrivee : fracToYear(frac);
  const era = eraIndexAt(annee);
  const theme = THEMES[era];
  const scale = width / LOGICAL_W;
  const logicalH = height / scale;

  return (
    <AbsoluteFill style={{ background: theme.tint }}>
      {crans.map((f, i) => (
        <Sequence key={`cran-${f}`} from={f} durationInFrames={Math.round(0.12 * fps)} layout="none">
          <Audio src={i % 2 === 0 ? assets.sons.tic : assets.sons.tac || assets.sons.tic} volume={0.35} />
        </Sequence>
      ))}
      {/* Décor de l'époque en haut d'écran, presque invisible (EraBackdrop). */}
      {assets.bg && assets.bg[era] ? (
        <img
          src={assets.bg[era]}
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 200 * scale, objectFit: 'cover', objectPosition: '50% 34%', opacity: 0.3, filter: 'blur(4px)', WebkitMaskImage: 'linear-gradient(#000 0%, #000 23%, transparent 75%)' }}
        />
      ) : null}
      <div style={{ position: 'absolute', left: 0, top: 0, width: LOGICAL_W, height: logicalH, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: logicalH * 0.3, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {/* Pastille d'époque (EraPillPair, jeu : ombre douce sans bordure) */}
          <div style={{ height: 26, display: 'flex', alignItems: 'center' }}>
            <div style={{ padding: '2px 12px', background: '#fff', borderRadius: 999, boxShadow: '0 6px 16px rgba(53,64,107,0.12)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 9, height: 9, borderRadius: '50%', background: theme.tint, border: `1.5px solid ${theme.ink}`, boxSizing: 'border-box' }} />
              <span style={{ fontFamily: 'Nunito', fontWeight: 900, fontSize: 11, letterSpacing: 1.3, color: theme.ink }}>{theme.name}</span>
            </div>
          </div>
          <div style={{ height: 2 }} />
          {/* L'année */}
          <div style={{ height: 60, display: 'flex', alignItems: 'center', fontFamily: 'Baloo2', fontWeight: 800, fontSize: 56, lineHeight: 1.05, color: INK, fontVariantNumeric: 'tabular-nums' }}>
            {formatYear(annee)}
          </div>
          <div style={{ height: 8 }} />
          {/* La frise, plein bord, et son aiguille fixe */}
          <div style={{ position: 'relative', width: LOGICAL_W, height: TAPE_H }}>
            <Ruban frac={frac} assets={assets} facingLeft={facingLeft} />
            <div style={{ position: 'absolute', top: 0, left: LOGICAL_W / 2 - 2, width: 4, height: TAPE_H, borderRadius: 4, background: CORAL, boxShadow: '0 0 0 2px rgba(255,255,255,0.7)' }} />
          </div>
          <div style={{ height: 12 }} />
          {/* Réglage fin : − mini-carte + */}
          <div style={{ width: LOGICAL_W - 36, display: 'flex', alignItems: 'center', gap: 12 }}>
            <Bouton glyph="−" />
            <MiniCarte frac={frac} />
            <Bouton glyph="+" />
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Carte question, au style des cartes d'événement du jeu.
export const EreaQuestion = ({ titre, texte, fonts }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  useFonts(fonts);
  const y = interpolate(frame, [0, 0.5 * fps], [60, 0], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const opacity = interpolate(frame, [0, 0.35 * fps], [0, 1], { extrapolateRight: 'clamp' });
  const scale = width / LOGICAL_W;
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity }}>
      <div style={{ width: LOGICAL_W - 36, transform: `translateY(${y}px) scale(${scale})`, background: '#fff', borderRadius: 26, padding: '26px 22px 22px', boxShadow: '0 10px 26px rgba(53,64,107,0.12)', position: 'relative' }}>
        <div style={{ position: 'absolute', top: -10, left: 18, padding: '3px 12px', borderRadius: 999, background: '#9B7BF7', fontFamily: 'Nunito', fontWeight: 900, fontSize: 10.5, letterSpacing: 0.84, color: '#fff' }}>
          QUESTION
        </div>
        <div style={{ fontFamily: 'Baloo2', fontWeight: 800, fontSize: 24, lineHeight: 1.14, color: INK }}>{titre}</div>
        <div style={{ marginTop: 6, fontFamily: 'Nunito', fontWeight: 800, fontSize: 14, lineHeight: 1.45, color: INK_SOFT }}>{texte}</div>
      </div>
    </AbsoluteFill>
  );
};
