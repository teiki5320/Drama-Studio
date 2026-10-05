// Pub Erea, version « temps qui bug » :
// 1. le logo Erea, rapide ;
// 2. la révélation : la caméra part du visage du personnage, recule sur son
//    buste, puis dévoile la MAUVAISE époque autour de lui — le temps « bugue »
//    (aberration chromatique, déchirures, secousses, flash) ;
// 3. coupure nette : la phrase choc sur fond noir ;
// puis la frise du jeu (EreaFrise) et le carton final.
import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { SafeImg } from './SafeImg.jsx';
import { Clip } from './Clip.jsx';
import { usePolicesErea } from './EreaFrise.jsx';

const BALOO = "'Baloo2', 'Arial Rounded MT Bold', sans-serif";
const ENCRE = '#2b2118';
const OCRE = '#a97b36';

// Filtres SVG : un seul canal de couleur (rouge, vert, bleu).
export const FiltresCanaux = () => (
  <svg width="0" height="0" style={{ position: 'absolute' }}>
    <filter id="canal-r">
      <feColorMatrix type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" />
    </filter>
    <filter id="canal-g">
      <feColorMatrix type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" />
    </filter>
    <filter id="canal-b">
      <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" />
    </filter>
  </svg>
);

// Pseudo-hasard stable (même image → même valeur : le rendu est reproductible).
const hasard = (n) => {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

// Intensité du bug à l'instant t (0 = rien, 1 = plein bug).
export function intensiteBug(t, bugs, duree = 0.5) {
  let k = 0;
  for (const b of bugs || []) {
    const u = (t - b) / duree;
    if (u >= 0 && u <= 1) {
      // Attaque brutale, retombée en saccades.
      k = Math.max(k, u < 0.15 ? 1 : (1 - u) * (hasard(Math.floor(t * 30)) > 0.3 ? 1 : 0.35));
    }
  }
  return k;
}

// Un calque média + son bug : la scène en trois canaux décalés, des bandes
// déchirées, des lignes de balayage et un flash.
function AvecBug({ k, frame, children, rendu }) {
  if (k <= 0) {
    return children;
  }
  const dx = 26 * k;
  const secousse = (hasard(frame) - 0.5) * 40 * k;
  const bandes = Array.from({ length: 3 }, (_, i) => {
    const h = 30 + hasard(frame * 7 + i) * 120;
    const y = hasard(frame * 3 + i * 11) * 1920;
    const x = (hasard(frame * 5 + i) - 0.5) * 160 * k;
    return { h, y, x };
  });
  return (
    <AbsoluteFill style={{ transform: `translate(${secousse}px, ${secousse * 0.4}px) scale(${1 + 0.04 * k})`, background: '#000' }}>
      <AbsoluteFill style={{ filter: 'url(#canal-r)', transform: `translateX(${-dx}px)`, mixBlendMode: 'screen' }}>{rendu()}</AbsoluteFill>
      <AbsoluteFill style={{ filter: 'url(#canal-g)', mixBlendMode: 'screen' }}>{rendu()}</AbsoluteFill>
      <AbsoluteFill style={{ filter: 'url(#canal-b)', transform: `translateX(${dx}px)`, mixBlendMode: 'screen' }}>{rendu()}</AbsoluteFill>
      {bandes.map((b, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: b.y,
            height: b.h,
            overflow: 'hidden',
          }}
        >
          <div style={{ position: 'absolute', left: b.x, top: -b.y, width: '100%', height: 1920 }}>{rendu()}</div>
        </div>
      ))}
      <AbsoluteFill
        style={{
          background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.28) 0px, rgba(0,0,0,0.28) 2px, transparent 2px, transparent 6px)',
          opacity: k,
        }}
      />
      <AbsoluteFill style={{ background: '#fff', opacity: hasard(frame * 13) > 0.75 ? 0.5 * k : 0 }} />
    </AbsoluteFill>
  );
}

// ---- 1. Le logo Erea, rapide ----
export const EreaLogoIntro = ({ icone, fonts }) => {
  usePolicesErea(fonts);
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const t = frame / fps;
  const pop = interpolate(t, [0, 0.22, 0.38], [0.2, 1.18, 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const nom = interpolate(t, [0.25, 0.5], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  // Sortie : on fonce dans le logo.
  const fin = durationInFrames / fps;
  const sortie = interpolate(t, [fin - 0.3, fin], [1, 5], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.cubic) });
  const fondu = interpolate(t, [fin - 0.18, fin], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const reflet = interpolate(t, [0.35, 0.8], [-120, 220], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 42%, #fff8e8 0%, #f2e2bf 80%)', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', transform: `scale(${sortie})`, opacity: fondu }}>
        <div style={{ position: 'relative', width: 340, height: 340, transform: `scale(${pop})`, borderRadius: 76, overflow: 'hidden', boxShadow: '0 30px 70px rgba(80,50,10,0.35)' }}>
          {icone ? <SafeImg src={icone} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${reflet}%`,
              width: '40%',
              background: 'linear-gradient(100deg, transparent, rgba(255,255,255,0.55), transparent)',
            }}
          />
        </div>
        <div style={{ marginTop: 34, fontFamily: BALOO, fontWeight: 800, fontSize: 120, color: ENCRE, opacity: nom, transform: `translateY(${(1 - nom) * 30}px)` }}>
          Erea
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---- 2. La révélation ----
// image : l'image générée (personnage au premier plan, dans la mauvaise
// époque) ; video : son clip. La première partie se joue sur l'image (nette),
// la seconde sur le clip — le premier bug masque le passage de l'une à l'autre.
export const EreaRevelation = ({ image, video, clipSec, focus = { x: 50, y: 28 }, zoomDe = 2.1, bugs = [], legende = {}, fonts, planFrames }) => {
  usePolicesErea(fonts);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const dureeSec = planFrames / fps;
  // Les bugs sont donnés en fraction du plan : ils suivent la durée de la voix.
  bugs = (bugs || []).map((b) => (b <= 1 ? b * dureeSec : b));
  // La caméra recule sans s'arrêter : visage → buste → toute la scène.
  const p = Math.min(1, frame / Math.max(1, planFrames));
  const zoom = interpolate(p, [0, 0.4, 1], [zoomDe, 1 + (zoomDe - 1) * 0.35, 1], { easing: Easing.inOut(Easing.quad) });
  const bascule = bugs.length ? bugs[0] + 0.12 : dureeSec * 0.45; // passage image → clip
  const surClip = video && t >= bascule;
  const k = intensiteBug(t, bugs);
  const origine = `${focus.x}% ${focus.y}%`;
  const rendu = () => (
    <AbsoluteFill style={{ transform: `scale(${zoom})`, transformOrigin: origine }}>
      {surClip ? (
        <Clip src={video} clipSec={clipSec} planFrames={Math.max(1, planFrames - Math.round(bascule * fps))} zoom={[1, 1]} />
      ) : image ? (
        <SafeImg src={image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : null}
    </AbsoluteFill>
  );
  // Légende : qui et quand (dès le début), puis où il est VRAIMENT (au bug).
  const haut = interpolate(t, [0.15, 0.5], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const choc = bugs.length ? interpolate(t, [bugs[0], bugs[0] + 0.25], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 0;
  const tremble = k > 0 ? (hasard(frame * 3) - 0.5) * 18 : 0;
  const texte = (s, taille, couleur) => ({
    fontFamily: BALOO,
    fontWeight: 800,
    fontSize: taille,
    color: couleur,
    lineHeight: 1.05,
    textAlign: 'center',
    textShadow: k > 0 ? `${-8 * k}px 0 rgba(255,0,60,0.8), ${8 * k}px 0 rgba(0,220,255,0.8), 0 6px 30px rgba(0,0,0,0.9)` : '0 6px 30px rgba(0,0,0,0.9)',
  });
  return (
    <AbsoluteFill style={{ background: '#000', overflow: 'hidden' }}>
      <FiltresCanaux />
      <AvecBug k={k} frame={frame} rendu={rendu}>
        {rendu()}
      </AvecBug>
      <AbsoluteFill style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 26%, rgba(0,0,0,0) 62%, rgba(0,0,0,0.7) 100%)' }} />
      {legende.qui ? (
        <AbsoluteFill style={{ justifyContent: 'flex-start', alignItems: 'center', paddingTop: 170, opacity: haut }}>
          <div style={texte(legende.qui, 84, '#fff')}>{legende.qui}</div>
          {legende.quand ? <div style={{ ...texte(legende.quand, 52, '#f7d48a'), marginTop: 10 }}>{legende.quand}</div> : null}
        </AbsoluteFill>
      ) : null}
      {legende.ou ? (
        <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 330, opacity: choc }}>
          <div style={{ ...texte(legende.ou, 70, '#fff'), transform: `translateX(${tremble}px) scale(${1 + (1 - choc) * 0.4})`, maxWidth: 940 }}>{legende.ou}</div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};

// ---- 3. La phrase choc, sur fond noir, après une coupure nette ----
export const EreaSlogan = ({ texte, fonts }) => {
  usePolicesErea(fonts);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const k = intensiteBug(t, [0], 0.45);
  const entree = interpolate(t, [0, 0.12], [1.35, 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const tremble = k > 0 ? (hasard(frame * 5) - 0.5) * 30 * k : 0;
  const respire = 1 + 0.03 * Math.min(1, t / 2.5);
  return (
    <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 45%, #2a2016 0%, #0b0907 75%)', alignItems: 'center', justifyContent: 'center', padding: 80 }}>
      <div
        style={{
          fontFamily: BALOO,
          fontWeight: 800,
          fontSize: 108,
          lineHeight: 1.05,
          color: '#fff8e8',
          textAlign: 'center',
          transform: `translateX(${tremble}px) scale(${entree * respire})`,
          textShadow: `${-10 * k}px 0 rgba(255,0,60,0.85), ${10 * k}px 0 rgba(0,220,255,0.85)`,
          whiteSpace: 'pre-line',
        }}
      >
        {texte}
      </div>
      <div style={{ marginTop: 40, height: 8, width: interpolate(t, [0.3, 0.8], [0, 260], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }), borderRadius: 4, background: OCRE }} />
      <AbsoluteFill
        style={{
          background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.3) 0px, rgba(0,0,0,0.3) 2px, transparent 2px, transparent 6px)',
          opacity: k,
        }}
      />
    </AbsoluteFill>
  );
};
