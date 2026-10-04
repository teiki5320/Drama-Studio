// Clip vidéo (muet) qui couvre TOUT son plan, sans jamais se figer :
// plus court que le plan, il est d'abord ralenti (jusqu'à 0,6× — au-delà,
// le ralenti se voit), puis rejoué en fondu enchaîné s'il manque encore du
// temps. Un lent zoom continu par-dessus garde l'image vivante.
import React from 'react';
import { AbsoluteFill, OffthreadVideo, Sequence, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

const FONDU = 10; // images de fondu entre deux lectures

const Lecture = ({ src, rate, fondu }) => {
  const frame = useCurrentFrame();
  const opacity = fondu ? interpolate(frame, [0, FONDU], [0, 1], { extrapolateRight: 'clamp' }) : 1;
  return (
    <AbsoluteFill style={{ opacity }}>
      <OffthreadVideo src={src} muted pauseWhenBuffering playbackRate={rate} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </AbsoluteFill>
  );
};

export const Clip = ({ src, clipSec, planFrames, zoom = [1, 1.08] }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const planSec = planFrames / fps;
  const rate = clipSec && clipSec < planSec ? Math.max(0.6, clipSec / planSec) : 1;
  // Durée utile d'une lecture à cette vitesse (on s'arrête juste avant la fin).
  const lecture = clipSec ? Math.max(FONDU * 2, Math.floor((clipSec / rate) * fps) - 2) : planFrames;
  const departs = [0];
  while (clipSec && departs[departs.length - 1] + lecture < planFrames) {
    departs.push(departs[departs.length - 1] + lecture - FONDU);
  }
  const z = interpolate(frame, [0, Math.max(1, planFrames)], zoom, { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ transform: `scale(${z})`, backgroundColor: '#000' }}>
      {departs.map((d, i) => (
        <Sequence key={i} from={d} durationInFrames={i < departs.length - 1 ? lecture : undefined} layout="none">
          <AbsoluteFill>
            <Lecture src={src} rate={rate} fondu={i > 0} />
          </AbsoluteFill>
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

// Mouvement de caméra d'une image fixe : varie d'un plan à l'autre (zoom
// avant, arrière, travelling) et reste bien visible.
export function mouvementImage(index, p) {
  const e = p * p * (3 - 2 * p); // départ et arrivée en douceur
  switch (index % 4) {
    case 0:
      return `scale(${1.04 + 0.16 * e})`;
    case 1:
      return `scale(${1.2 - 0.14 * e}) translateX(${-2 + 4 * e}%)`;
    case 2:
      return `scale(${1.16}) translateX(${3 - 6 * e}%) translateY(${-1 + 2 * e}%)`;
    default:
      return `scale(${1.06 + 0.14 * e}) translateY(${2 - 4 * e}%)`;
  }
}
