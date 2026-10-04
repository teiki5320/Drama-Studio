// Pub Palabre : les écrans du jeu, portés à l'identique depuis le code Flutter
// (lib/ecrans/theme.dart, partie_ecran.dart, carte_glissante.dart,
// quotidien_ecran.dart, cadran_du_jour.dart, fin_ecran.dart,
// palais_ecran.dart). Dessinés en points d'iPhone (390 de large) puis mis à
// l'échelle de la vidéo, comme la frise d'Erea.
import React, { useEffect, useState } from 'react';
import { AbsoluteFill, continueRender, delayRender, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { SafeImg } from './SafeImg.jsx';

// ---- theme.dart ----
const C = {
  nuit: '#14131A',
  nuitClair: '#1C1A23',
  encre: '#080709',
  or: '#E9B44C',
  creme: '#F6EFE4',
  cremeDoux: '#E3D9C9',
  aplat: '#26222E',
  bordure: 'rgba(255,255,255,0.18)',
  chair: '#C97B6A',
};
const rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
const TITRE = 'Bricolage';
const CORPS = 'PublicSans';
const T = {
  nomParcoursCourt: { fontFamily: TITRE, fontSize: 30, fontWeight: 800, lineHeight: 1.02, letterSpacing: -0.4, color: C.creme },
  surtitre: { fontFamily: CORPS, fontSize: 11, fontWeight: 700, letterSpacing: 1.8, color: C.or },
  sousTitre: { fontFamily: CORPS, fontSize: 14, lineHeight: 1.35, color: 'rgba(246,239,228,0.65)' },
  nomJauge: { fontFamily: CORPS, fontSize: 10, fontWeight: 700, letterSpacing: 1.0, color: 'rgba(246,239,228,0.6)' },
  deltaJauge: { fontFamily: CORPS, fontSize: 11, fontWeight: 700, color: C.or },
  jour: { fontFamily: TITRE, fontSize: 13, fontWeight: 700, letterSpacing: 2.6, color: C.creme },
  echeance: { fontFamily: CORPS, fontSize: 11, color: 'rgba(246,239,228,0.4)' },
  titrePersonnage: { fontFamily: CORPS, fontSize: 11, fontWeight: 800, letterSpacing: 1.8, color: C.or },
  texteCarte: { fontFamily: CORPS, fontSize: 18, lineHeight: 1.38, color: C.creme },
  texteQuotidien: { fontFamily: TITRE, fontSize: 22, lineHeight: 1.42, fontWeight: 700, color: C.creme },
  etiquette: { fontFamily: CORPS, fontSize: 15, fontWeight: 800, letterSpacing: 1.8, color: C.or },
  bouton: { fontFamily: CORPS, fontSize: 16, fontWeight: 700, color: C.nuit },
};

const LOGICAL_W = 390;
// Marges de l'iPhone (barre d'état, barre d'accueil).
const HAUT = 50;
const BAS = 20;

const JAUGES = [
  ['peuple', 'Peuple'],
  ['armee', 'Armée'],
  ['caisses', 'Caisses'],
  ['presse', 'Presse'],
];
const BAS_ALERTE = 15;
const HAUT_ALERTE = 85;

const easeOut = Easing.out(Easing.cubic);
const easeIn = Easing.in(Easing.cubic);
const easeInOut = Easing.inOut(Easing.cubic);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (t, a, b) => a + (b - a) * t;

// Polices du jeu, chargées avant le rendu.
function usePolices(fonts) {
  const [handle] = useState(() => (fonts ? delayRender('Polices Palabre') : null));
  useEffect(() => {
    if (!fonts) {
      return;
    }
    const faces = [
      [TITRE, fonts.titre, '800'],
      [TITRE, fonts.titreBold, '700'],
      [CORPS, fonts.corps, '400'],
      [CORPS, fonts.corpsSemi, '600'],
      [CORPS, fonts.corpsBold, '700'],
      [CORPS, fonts.corpsBold, '800'],
    ]
      .filter(([, url]) => url)
      .map(([nom, url, poids]) => new FontFace(nom, `url(${url})`, { weight: poids }));
    Promise.all(faces.map((f) => f.load().then((ff) => document.fonts.add(ff))))
      .catch(() => {})
      .finally(() => continueRender(handle));
  }, []);
}

// L'écran du téléphone, mis à l'échelle de la vidéo.
function Telephone({ children, fond = C.nuit }) {
  const { width, height } = useVideoConfig();
  const s = width / LOGICAL_W;
  return (
    <AbsoluteFill style={{ backgroundColor: fond, overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: LOGICAL_W,
          height: height / s,
          transform: `scale(${s})`,
          transformOrigin: '0 0',
          fontFamily: CORPS,
          color: C.creme,
        }}
      >
        {children}
      </div>
    </AbsoluteFill>
  );
}

// ---- carte_glissante.dart : le geste, rejoué image par image ----
// Renvoie le décalage (en fraction de la largeur de la carte), si la carte
// est partie, et le côté annoncé.
const SEUIL = 0.35;
const SEUIL_INTENTION = 0.08;
const RESISTANCE = 0.6;
const RETOUR = 0.22;
const SORTIE = 0.26;

function freine(dx) {
  if (Math.abs(dx) <= SEUIL) {
    return dx;
  }
  return (SEUIL + (Math.abs(dx) - SEUIL) * RESISTANCE) * Math.sign(dx);
}

function geste(t, mode, debut) {
  const repos = { dx: 0, sortie: 0, part: 0 };
  if (!mode || t < debut) {
    return repos;
  }
  const u = t - debut;
  if (mode === 'hesite') {
    // À gauche, retour, à droite, retour : le joueur qui hésite.
    const p = u % 3.4;
    const aller = (a, b, from, to, ease) => lerp(ease(clamp((p - a) / (b - a), 0, 1)), from, to);
    let dx = 0;
    if (p < 0.6) {
      dx = aller(0, 0.6, 0, -0.24, easeOut);
    } else if (p < 1.3) {
      dx = -0.24;
    } else if (p < 1.3 + RETOUR) {
      dx = aller(1.3, 1.3 + RETOUR, -0.24, 0, easeOut);
    } else if (p < 1.7) {
      dx = 0;
    } else if (p < 2.3) {
      dx = aller(1.7, 2.3, 0, 0.24, easeOut);
    } else if (p < 3.0) {
      dx = 0.24;
    } else if (p < 3.0 + RETOUR) {
      dx = aller(3.0, 3.0 + RETOUR, 0.24, 0, easeOut);
    }
    return { dx, sortie: 0, part: Math.abs(dx) };
  }
  const signe = mode === 'droite' ? 1 : -1;
  const tire = 0.46;
  if (u < 0.7) {
    const d = lerp(easeOut(u / 0.7), 0, tire) * signe;
    return { dx: freine(d), sortie: 0, part: Math.abs(d) };
  }
  if (u < 1.5) {
    return { dx: freine(tire * signe), sortie: 0, part: tire };
  }
  const k = clamp((u - 1.5) / SORTIE, 0, 1);
  const depart = freine(tire * signe);
  return { dx: lerp(easeIn(k), depart, 1.5 * signe), sortie: k, part: tire, partie: k >= 1 };
}

// ---- partie_ecran.dart : _Jauge ----
function Jauge({ nom, valeur, effet, pulsation }) {
  const concernee = effet != null;
  const alerte = valeur <= BAS_ALERTE || valeur >= HAUT_ALERTE;
  const aggrave = alerte && concernee && ((valeur >= HAUT_ALERTE && effet > 0) || (valeur <= BAS_ALERTE && effet < 0));
  const h = aggrave ? 10 : concernee ? 8 : 6;
  const couleurNom = concernee || alerte ? C.or : T.nomJauge.color;
  const remplissage = concernee ? C.or : alerte ? rgba(C.or, pulsation) : C.creme;
  const x = (v) => `${clamp(v, 0, 100)}%`;
  const apres = clamp(valeur + (effet || 0), 0, 100);
  const debut = concernee && effet < 0 ? apres : valeur;
  const fin = concernee && effet < 0 ? valeur : apres;
  const texte = (effet || 0) >= 0 ? `+${effet || 0}` : `−${-effet}`;
  return (
    <div style={{ flex: 1, padding: '0 5px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ ...T.nomJauge, color: couleurNom }}>{nom.toUpperCase()}</div>
      <div style={{ height: 4 }} />
      <div style={{ position: 'relative', height: 14, width: '100%' }}>
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: (14 - h) / 2,
            height: h,
            borderRadius: h / 2,
            background: 'rgba(255,255,255,0.14)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 0,
            width: x(valeur),
            top: (14 - h) / 2,
            height: h,
            borderRadius: h / 2,
            background: remplissage,
          }}
        />
        {concernee && fin > debut ? (
          <div
            style={{
              position: 'absolute',
              left: x(debut),
              width: `${fin - debut}%`,
              top: (14 - (aggrave ? 6 : 4)) / 2,
              height: aggrave ? 6 : 4,
              borderRadius: aggrave ? 4 : 2,
              background: aggrave ? C.or : rgba(C.or, 0.45),
            }}
          />
        ) : null}
        {concernee && effet < 0 ? (
          <div style={{ position: 'absolute', left: `calc(${x(valeur)} - 1px)`, top: 0, width: 2, height: 14, background: C.or }} />
        ) : null}
      </div>
      <div style={{ height: 3 }} />
      <div style={{ height: 16, opacity: concernee ? 1 : 0 }}>
        {aggrave ? (
          <span style={{ ...T.deltaJauge, color: C.creme, background: C.or, borderRadius: 4, padding: '1px 6px' }}>{texte}</span>
        ) : (
          <span style={T.deltaJauge}>{texte}</span>
        )}
      </div>
    </div>
  );
}

function LigneJauges({ jauges, effets, t }) {
  // Une pulsation de 1,4 s en aller-retour, commune aux jauges en danger.
  const p = (t % 2.8) / 1.4;
  const tri = p <= 1 ? p : 2 - p;
  const pulsation = 0.7 + 0.3 * easeInOut(tri);
  return (
    <div style={{ display: 'flex', padding: '10px 22px 0' }}>
      {JAUGES.map(([id, nom]) => (
        <Jauge key={id} nom={nom} valeur={jauges[id]} effet={effets ? effets[id] : undefined} pulsation={pulsation} />
      ))}
    </div>
  );
}

// ---- ciel.dart + cadran_du_jour.dart ----
function cielDe(jour) {
  const bloc = Math.floor((jour - 1) / 10);
  const dans = (jour - 1) % 10;
  const course = dans / 9;
  const nuit = bloc % 2 === 1;
  const rang = nuit ? Math.floor((bloc - 1) / 2) : 0;
  return { nuit, course, hauteur: Math.sin(Math.PI * course), phase: nuit ? 0.5 + 0.5 * (rang / 4) : 1 };
}

function Cadran({ jour }) {
  const ciel = cielDe(jour);
  const cote = 19;
  const astre = 9;
  const x = cote * (0.1 + (0.62 - 0.1) * ciel.course);
  const y = cote * (0.56 - (0.56 - 0.12) * ciel.hauteur);
  const force = 0.45 + 0.55 * ciel.hauteur;
  const lueur = `0 0 7px 1px ${rgba(ciel.nuit ? '#F6EFE4' : C.or, 0.45 * force)}`;
  return (
    <div
      style={{
        width: cote,
        height: cote,
        borderRadius: '50%',
        background: C.encre,
        border: `1px solid ${C.bordure}`,
        position: 'relative',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ position: 'absolute', left: x - 1, top: y - 1, width: astre, height: astre, borderRadius: '50%', boxShadow: lueur }}>
        {ciel.nuit ? (
          <div style={{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', position: 'relative' }}>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'radial-gradient(circle at 32% 30%, #FBF6EC 0%, #D8CFC0 62%, #A79C8C 100%)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                background: C.encre,
                transform: `translateX(${ciel.phase * 100}%)`,
              }}
            />
          </div>
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              borderRadius: '50%',
              background: `radial-gradient(circle at 32% 30%, #FFE7A8 0%, ${C.or} 62%, #C98B22 100%)`,
            }}
          />
        )}
      </div>
    </div>
  );
}

const Fleche = ({ size = 20, color = C.cremeDoux }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <path d="M10 6l-6 6 6 6M4 12h16" fill="none" stroke={color} strokeWidth="2" strokeLinecap="square" />
  </svg>
);
const Palais = ({ size = 20, color = C.cremeDoux }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <path
      d="M12 2L2 7v2h20V7L12 2zm0 2.26L17.53 7H6.47L12 4.26zM4 11h2v7H4zm5 0h2v7H9zm4 0h2v7h-2zm5 0h2v7h-2zM2 20h20v2H2z"
      fill={color}
    />
  </svg>
);

function LigneJour({ jour, mandat }) {
  return (
    <div style={{ padding: '0 4px 6px' }}>
      <div style={{ position: 'relative', height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={T.jour}>JOUR {jour}</span>
        <span style={{ width: 8 }} />
        <span style={T.echeance}>{mandat > 1 ? 'second mandat' : 'élection au jour 100'}</span>
        <span style={{ width: 9 }} />
        <Cadran jour={jour} />
        <div style={{ position: 'absolute', left: 14, top: 10 }}>
          <Fleche />
        </div>
        <div style={{ position: 'absolute', right: 14, top: 10 }}>
          <Palais />
        </div>
      </div>
    </div>
  );
}

// ---- _Carte ----
function Carte({ portrait, titre, texte }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: 24,
        boxShadow: '0 30px 60px rgba(0,0,0,0.6)',
        overflow: 'hidden',
        background: C.nuit,
      }}
    >
      {portrait ? (
        <SafeImg
          src={portrait}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 32.5%' }}
        />
      ) : (
        <div style={{ position: 'absolute', inset: 0, background: C.aplat }} />
      )}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: '120px 20px 24px',
          background: `linear-gradient(to bottom, rgba(8,7,9,0) 0%, ${rgba(C.encre, 0.95)} 55%)`,
        }}
      >
        <div style={T.titrePersonnage}>{(titre || '').toUpperCase()}</div>
        <div style={{ height: 8 }} />
        <div style={T.texteCarte}>{texte}</div>
      </div>
    </div>
  );
}

function Etiquette({ texte }) {
  return (
    <div
      style={{
        padding: '8px 14px',
        border: `3px solid ${C.or}`,
        borderRadius: 8,
        background: 'rgba(0,0,0,0.55)',
        ...T.etiquette,
        whiteSpace: 'nowrap',
      }}
    >
      {texte.toUpperCase()}
    </div>
  );
}

// ---- _AxeRegime ----
function AxeRegime({ style, vise }) {
  const apres = clamp(style + vise, 0, 100);
  const penche = vise !== 0;
  const debut = vise < 0 ? apres : style;
  const fin = vise < 0 ? style : apres;
  return (
    <div style={{ padding: '0 30px 34px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={vise < 0 ? { ...T.nomJauge, color: C.or } : T.nomJauge}>RÉPUBLIQUE</span>
        <span style={vise > 0 ? { ...T.nomJauge, color: C.or } : T.nomJauge}>DICTATURE</span>
      </div>
      <div style={{ height: 6 }} />
      <div style={{ position: 'relative', height: 14 }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 6, height: 2, borderRadius: 1, background: 'rgba(255,255,255,0.14)' }} />
        {penche && fin > debut ? (
          <div
            style={{
              position: 'absolute',
              left: `${debut}%`,
              width: `${fin - debut}%`,
              top: 5,
              height: 4,
              borderRadius: 2,
              background: rgba(C.or, 0.45),
            }}
          />
        ) : null}
        <div
          style={{
            position: 'absolute',
            left: `calc(${clamp(style, 0, 100)}% - 5px)`,
            top: penche ? 0 : 2,
            width: 10,
            height: penche ? 14 : 10,
            borderRadius: 5,
            background: penche ? C.or : C.creme,
          }}
        />
      </div>
    </div>
  );
}

// L'écran des cartes. `jeu` : jauges, jour, mandat, style (régime), carte
// {portrait, titre, texte, gauche, droite}, geste (null | 'hesite' |
// 'gauche' | 'droite') et debut (secondes).
export function EcranCarte({ jeu, t }) {
  const { carte } = jeu;
  const g = geste(t, jeu.geste, jeu.debut ?? 0.8);
  const intention = g.part >= SEUIL_INTENTION && !g.partie ? (g.dx > 0 ? 'droite' : 'gauche') : null;
  const reponse = intention ? carte[intention] : null;
  // Une fois la carte partie, les jauges prennent l'effet (300 ms).
  let jauges = jeu.jauges;
  let style = jeu.style ?? 50;
  if (g.partie && jeu.geste && jeu.geste !== 'hesite') {
    const r = carte[jeu.geste];
    const fin = (jeu.debut ?? 0.8) + 1.5 + SORTIE;
    const k = easeOut(clamp((t - fin) / 0.3, 0, 1));
    jauges = Object.fromEntries(
      JAUGES.map(([id]) => [id, lerp(k, jeu.jauges[id], clamp(jeu.jauges[id] + clamp(r.effets?.[id] || 0, -20, 20), 0, 100))]),
    );
    style = lerp(k, style, clamp(style + (r.style || 0), 0, 100));
  }
  const effets = reponse ? Object.fromEntries(Object.entries(reponse.effets || {}).map(([k, v]) => [k, clamp(v, -20, 20)])) : null;
  const doublure = easeOut(g.sortie);
  const L = LOGICAL_W - 44;
  const decalage = g.dx * L;
  const angle = clamp(g.dx, -1, 1) * 0.18;
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', paddingTop: HAUT, paddingBottom: BAS }}>
      <LigneJauges jauges={jauges} effets={effets} t={t} />
      <LigneJour jour={jeu.jour} mandat={jeu.mandat || 1} />
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 22, right: 22, top: 12, bottom: 24 }}>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              transform: `translateY(${10 * (1 - doublure)}px) scale(${0.96 + 0.04 * doublure})`,
              borderRadius: 24,
              background: C.nuitClair,
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          />
          {g.partie ? null : (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                transform: `translateX(${decalage}px) rotate(${angle}rad)`,
                transformOrigin: '50% 110%',
              }}
            >
              <Carte portrait={carte.portrait} titre={carte.titre} texte={carte.texte} />
              {intention ? (
                <div
                  style={{
                    position: 'absolute',
                    top: 18,
                    ...(g.dx > 0 ? { left: 18 } : { right: 18 }),
                    transform: `rotate(${-angle}rad)`,
                  }}
                >
                  <Etiquette texte={carte[intention].libelle} />
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
      <AxeRegime style={style} vise={reponse?.style || 0} />
    </div>
  );
}

// ---- quotidien_ecran.dart ----
export function EcranQuotidien({ jour, ligne, t, debut = 0.3 }) {
  const n = clamp(Math.floor((t - debut) / 0.009), 0, ligne.length);
  const fini = n >= ligne.length;
  const finiDepuis = fini ? t - debut - ligne.length * 0.009 : 0;
  const pastille = (() => {
    const p = (t % 3.2) / 1.6;
    return p <= 1 ? p : 2 - p;
  })();
  const onde = (t % 1.1) / 1.1;
  const vie = fini ? clamp(1 - finiDepuis / 0.22, 0, 1) : 1;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: `radial-gradient(circle at 50% 0%, #241F2C 0px, ${C.nuit} ${0.62 * 1.3 * LOGICAL_W}px)`,
        padding: `${HAUT + 22}px 28px ${BAS + 26}px`,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <span style={T.jour}>JOUR {jour}</span>
        <span style={{ flex: 1 }} />
        <span style={T.surtitre}>06 H 00</span>
      </div>
      <div style={{ height: 26 }} />
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: rgba(C.chair, 0.45 + 0.55 * pastille),
            boxShadow: `0 0 10px ${rgba(C.chair, 0.5 * pastille)}`,
          }}
        />
        <span style={{ width: 9 }} />
        <span style={T.surtitre}>RADIO NATIONALE · LE JOURNAL</span>
      </div>
      <div style={{ height: 18 }} />
      <div style={{ height: 46, display: 'flex', alignItems: 'center', gap: 3 }}>
        {Array.from({ length: 22 }, (_, i) => {
          const u = (onde + i / 22) % 1;
          const part = 0.12 + 0.88 * (u < 0.5 ? u * 2 : (1 - u) * 2);
          const h = lerp(vie, 4, 6 + 40 * part);
          return (
            <div
              key={i}
              style={{
                flex: 1,
                height: h,
                borderRadius: 2,
                background: `linear-gradient(to bottom, ${rgba(C.or, fini ? lerp(vie, 0.3, 0.95) : 0.95)}, ${rgba(C.or, 0.22)})`,
              }}
            />
          );
        })}
      </div>
      <div style={{ height: 4 }} />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
        <div style={T.texteQuotidien}>{ligne.slice(0, n)}</div>
      </div>
      <div style={{ textAlign: 'center', opacity: clamp(finiDepuis / 0.26, 0, 1), ...T.surtitre }}>TOUCHER POUR CONTINUER</div>
    </div>
  );
}

// ---- fin_ecran.dart ----
export function EcranFin({ fin, t }) {
  const gagnee = fin.gagnee;
  const apparait = interpolate(t, [0, 0.6], [0, 1], { extrapolateRight: 'clamp' });
  const bouton = (plein, texte) => (
    <div
      style={{
        height: plein ? 56 : 48,
        borderRadius: 14,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...(plein
          ? { background: C.or, ...T.bouton }
          : { border: '1px solid rgba(233,180,76,0.55)', ...T.bouton, color: C.or, fontSize: 15 }),
      }}
    >
      {texte}
    </div>
  );
  return (
    <div style={{ position: 'absolute', inset: 0, background: C.nuitClair }}>
      {fin.image ? (
        <SafeImg
          src={fin.image}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: `scale(${1 + 0.04 * clamp(t / 6, 0, 1)})`,
          }}
        />
      ) : null}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)' }} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          padding: `${HAUT}px 26px ${BAS + 26}px`,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          opacity: apparait,
        }}
      >
        <div style={{ ...T.surtitre, fontSize: 12, letterSpacing: 2.5 }}>{gagnee ? 'RÉÉLU' : 'FIN DU MANDAT'}</div>
        <div style={{ height: 10 }} />
        <div style={{ ...T.nomParcoursCourt, fontSize: 30, lineHeight: 1.1 }}>{fin.titre}</div>
        <div style={{ height: 14 }} />
        <div style={{ ...T.sousTitre, color: C.cremeDoux, fontSize: 16, lineHeight: 1.4 }}>{fin.texte}</div>
        <div style={{ height: 18 }} />
        <div style={{ ...T.sousTitre, fontSize: 15 }}>Vous avez tenu {fin.jours} jours.</div>
        <div style={{ height: 26 }} />
        {gagnee ? (
          <>
            {bouton(false, 'Reprendre ses fonctions')}
            <div style={{ height: 10 }} />
            {bouton(true, 'Continuer, deuxième mandat')}
          </>
        ) : (
          bouton(true, 'Reprendre ses fonctions')
        )}
      </div>
    </div>
  );
}

// ---- palais_ecran.dart ----
const PASSAGES = {
  bureau: [
    ['Le balcon', [0.0, 0.05, 0.26, 0.78]],
    ['Le couloir', [0.42, 0.23, 0.16, 0.4]],
    ['Le jardin', [0.76, 0.24, 0.24, 0.42]],
  ],
  piscine: [
    ['La cour', [0.04, 0.34, 0.2, 0.28]],
    ['Le palais', [0.68, 0.3, 0.22, 0.4]],
  ],
  garage: [['Le palais', [0.0, 0.1, 0.21, 0.66]]],
  balcon: [],
};
const ECRAN_DU_BUREAU = [0.6, 0.3, 0.13, 0.13];
const RATIO_PLAQUE = 3 / 2;

function regardDuTour(p) {
  const doux = (x) => x * x * (3 - 2 * x);
  const t = clamp(p, 0, 1);
  if (t < 0.28) {
    return 0.5 + (0.1 - 0.5) * doux(t / 0.28);
  }
  if (t < 0.72) {
    return 0.1 + (0.9 - 0.1) * doux((t - 0.28) / 0.44);
  }
  return 0.9 + (0.5 - 0.9) * doux((t - 0.72) / 0.28);
}

// Une étape du palais : ses plaques en fondu (8 s le cycle), le travelling
// et le tour du regard à l'entrée.
function Decor({ images, piece, t, H, carteMur }) {
  const tCycle = t / 8;
  const pas = images.length > 1 ? (images.length - 1) * 2 : 1;
  const ordre = images.length > 1 ? [...images, ...images.slice(1, -1).reverse()] : images;
  const phase = (tCycle % 1) * pas;
  const i = Math.floor(phase) % pas;
  const reste = phase - Math.floor(phase);
  const a = clamp((reste - 0.5) / 0.5, 0, 1);
  const zoom = 1.06 + 0.03 * Math.sin(tCycle * (8 / 26) * 2 * Math.PI);
  // Le regard rejoint sa cible sans à-coup : on rejoue le lissage.
  let regard = 0.5;
  const pasT = 1 / 30;
  for (let s = 0; s <= t; s += pasT) {
    const cible = s < 3.4 ? regardDuTour(s / 3.4) : 0.5;
    regard += (cible - regard) * 0.08;
  }
  const hP = H * zoom;
  const wP = hP * RATIO_PLAQUE;
  const gauche = (LOGICAL_W - wP) * regard;
  const haut = (H - hP) / 2;
  const plan = (src, op) => (
    <SafeImg src={src} style={{ position: 'absolute', left: gauche, top: haut, width: wP, height: hP, opacity: op, objectFit: 'cover' }} />
  );
  const souffle = 0.5 + 0.5 * Math.sin(tCycle * 2 * Math.PI);
  const zone = ([zx, zy, zw, zh]) => {
    const l = Math.max(0, gauche + zx * wP);
    const r = Math.min(LOGICAL_W, gauche + (zx + zw) * wP);
    const tp = Math.max(0, haut + zy * hP);
    const b = Math.min(H, haut + (zy + zh) * hP);
    return { left: l, top: tp, width: r - l, height: b - tp };
  };
  return (
    <>
      {plan(ordre[i], 1)}
      {a > 0 && ordre.length > 1 ? plan(ordre[(i + 1) % ordre.length], a) : null}
      {piece === 'bureau' && carteMur
        ? (() => {
            const r = zone(ECRAN_DU_BUREAU);
            if (r.width < 30 || r.height < 20) {
              return null;
            }
            return (
              <div
                style={{
                  position: 'absolute',
                  ...r,
                  border: `2px solid ${C.encre}`,
                  boxShadow: `0 0 14px 1px ${rgba(C.or, 0.1 + 0.16 * souffle)}, 0 4px 10px rgba(0,0,0,0.54)`,
                  overflow: 'hidden',
                }}
              >
                <SafeImg src={carteMur} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            );
          })()
        : null}
      {(PASSAGES[piece] || []).map(([nom, z]) => {
        const r = zone(z);
        if (r.width < 40 || r.height < 40) {
          return null;
        }
        return (
          <div
            key={nom}
            style={{
              position: 'absolute',
              ...r,
              border: `1.2px solid ${rgba(C.or, 0.18 + 0.22 * souffle)}`,
              borderRadius: 3,
              background: `linear-gradient(to bottom, ${rgba(C.or, 0)}, ${rgba(C.or, 0.05 + 0.07 * souffle)})`,
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
              boxSizing: 'border-box',
            }}
          >
            <div
              style={{
                marginBottom: 8,
                padding: '4px 9px',
                borderRadius: 3,
                background: rgba(C.encre, 0.62),
                ...T.nomJauge,
                color: C.creme,
                fontSize: 10,
                letterSpacing: 1.1,
                whiteSpace: 'nowrap',
              }}
            >
              {nom}
            </div>
          </div>
        );
      })}
    </>
  );
}

// `jeu` : piece {id, nom}, etapes [{nom, images[]}], objet {nom, description,
// prix} acheté à `achat` secondes (l'étape suivante apparaît alors),
// caisses (avant l'achat).
export function EcranPalais({ jeu, t }) {
  const { height, width } = useVideoConfig();
  const H = height / (width / LOGICAL_W);
  const etapes = jeu.etapes || [];
  const achat = jeu.achat ?? 2.4;
  const apres = t >= achat && etapes.length > 1;
  const fondu = etapes.length > 1 ? clamp((t - achat) / 0.42, 0, 1) : 0;
  const caisses = apres && jeu.objet ? jeu.caisses - jeu.objet.prix : jeu.caisses;
  const etapeVisible = apres ? etapes[etapes.length - 1] : etapes[0];
  const objet = jeu.objet;
  const ligne = objet ? (
    <div
      style={{
        marginBottom: 6,
        padding: '9px 12px',
        borderRadius: 6,
        background: rgba(C.nuitClair, 0.76),
        border: `1px solid ${apres ? C.bordure : C.or}`,
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ ...T.sousTitre, fontSize: 14, color: apres ? rgba(C.cremeDoux, 0.45) : C.creme }}>{objet.nom}</div>
        <div style={{ height: 1 }} />
        <div style={{ ...T.echeance, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {apres ? 'Au palais' : objet.description}
        </div>
      </div>
      <span style={{ width: 10 }} />
      <span style={{ ...T.deltaJauge, fontSize: 15, color: apres ? rgba(C.cremeDoux, 0.4) : C.or }}>{apres ? '—' : objet.prix}</span>
    </div>
  ) : null;
  return (
    <div style={{ position: 'absolute', inset: 0, background: C.nuit, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        <Decor images={etapes[0]?.images || []} piece={jeu.piece.id} t={t} H={H} carteMur={jeu.carteMur} />
      </div>
      {etapes.length > 1 ? (
        <div style={{ position: 'absolute', inset: 0, opacity: fondu }}>
          <Decor images={etapes[etapes.length - 1].images} piece={jeu.piece.id} t={Math.max(0, t - achat)} H={H} carteMur={jeu.carteMur} />
        </div>
      ) : null}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(to bottom, ${rgba(C.encre, 0.72)} 0%, ${rgba(C.encre, 0.1)} 28%, ${rgba(C.encre, 0.34)} 58%, ${rgba(C.encre, 0.88)} 100%)`,
        }}
      />
      <div style={{ position: 'absolute', inset: 0, paddingTop: HAUT, paddingBottom: BAS, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '4px 16px 0 8px', display: 'flex', alignItems: 'center' }}>
          <div style={{ width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Fleche />
          </div>
          <div style={{ flex: 1 }}>
            <div style={T.jour}>{jeu.piece.nom}</div>
            <div style={{ height: 2 }} />
            <div style={T.echeance}>{etapeVisible?.nom}</div>
          </div>
          <span style={{ ...T.nomParcoursCourt, fontSize: 20, color: C.or }}>{caisses}</span>
          <span style={{ width: 6 }} />
          <span style={T.nomJauge}>caisses</span>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ padding: '0 12px' }}>
          {ligne}
          <div
            style={{
              marginBottom: 4,
              padding: '11px 14px',
              borderRadius: 6,
              background: rgba(C.nuitClair, 0.82),
              border: `1px solid ${C.bordure}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              ...T.nomJauge,
              color: C.cremeDoux,
              fontSize: 11,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" style={{ marginRight: 8 }}>
              <path d={objet ? 'M7 10l5 5 5-5' : 'M7 14l5-5 5 5'} fill="none" stroke={C.or} strokeWidth="2.4" />
            </svg>
            {objet ? 'Fermer' : jeu.resume || ''}
          </div>
        </div>
        {jeu.piece.id === 'bureau' ? (
          <div style={{ height: 10 }} />
        ) : (
          <div style={{ padding: '10px 16px 14px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" style={{ marginRight: 8 }}>
              <path d="M19 7v4H5.83l3.58-3.59L8 6l-6 6 6 6 1.41-1.41L5.83 13H21V7z" fill={C.cremeDoux} />
            </svg>
            <span style={{ ...T.nomJauge, color: C.cremeDoux, fontSize: 11, letterSpacing: 1.2 }}>Revenir au bureau</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Point d'entrée : un écran du jeu, plein cadre.
export function PalabreJeu({ jeu, fonts }) {
  usePolices(fonts);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  return (
    <Telephone>
      {jeu.ecran === 'quotidien' ? (
        <EcranQuotidien jour={jeu.jour} ligne={jeu.ligne} t={t} debut={jeu.debut ?? 0.3} />
      ) : jeu.ecran === 'fin' ? (
        <EcranFin fin={jeu.fin} t={t} />
      ) : jeu.ecran === 'palais' ? (
        <EcranPalais jeu={jeu} t={t} />
      ) : (
        <EcranCarte jeu={jeu} t={t} />
      )}
    </Telephone>
  );
}
