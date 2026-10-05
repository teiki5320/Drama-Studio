// Planning des réseaux sociaux, façon Buffer en très simple : les vidéos
// validées de toutes les applis à gauche, la semaine à droite. On touche une
// vidéo, puis un jour, on choisit les réseaux. Le jour venu : copier la
// légende, publier, cocher le réseau.
import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { surLeMac } from './VideoSave.jsx';

const RESEAUX = [
  ['tiktok', 'TikTok'],
  ['youtube', 'YouTube'],
  ['pinterest', 'Pinterest'],
];

// Une couleur par appli (fond, encre).
const COULEURS = {
  erea: ['#FAEEDA', '#633806'],
  palabre: ['#EEEDFE', '#3C3489'],
  kultiva: ['#E1F5EE', '#085041'],
  kultivaprix: ['#EAF3DE', '#27500A'],
  keurcook: ['#FAECE7', '#712B13'],
  recettes: ['#FBEAF0', '#72243E'],
  keurdeco: ['#F1EFE8', '#444441'],
  keurbook: ['#E6F1FB', '#0C447C'],
  optiled: ['#FAEEDA', '#412402'],
};
const teinte = (v) => COULEURS[v?.depot] || ['#F1EFE8', '#2C2C2A'];

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function lundi(d) {
  const x = new Date(d);
  x.setHours(12, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function Vignette({ v, h = 64 }) {
  const [fond] = teinte(v);
  return v?.vignette ? (
    <img src={v.vignette} style={{ width: h * 0.5625, height: h, objectFit: 'cover', borderRadius: 8, flex: 'none' }} />
  ) : (
    <div style={{ width: h * 0.5625, height: h, borderRadius: 8, background: fond, flex: 'none' }} />
  );
}

export function PlanningPage() {
  const [data, setData] = useState(null);
  const [debut, setDebut] = useState(() => lundi(new Date()));
  const [choisie, setChoisie] = useState(null); // vidéo à placer
  const [jour, setJour] = useState(null); // jour choisi → choix des réseaux
  const [reseaux, setReseaux] = useState([]);
  const [ouverte, setOuverte] = useState(null); // entrée du planning ouverte
  const [error, setError] = useState('');

  const load = () =>
    api
      .planning()
      .then(setData)
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  if (!data) {
    return <div className="clay-content clay-muted">{error || 'Chargement…'}</div>;
  }
  const jours = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(debut);
    d.setDate(d.getDate() + i);
    return d;
  });
  const aujourdhui = iso(new Date());
  const semaine = (n) => {
    const d = new Date(debut);
    d.setDate(d.getDate() + 7 * n);
    setDebut(d);
  };
  const placer = () => {
    if (!reseaux.length) {
      setError('Choisis au moins un réseau.');
      return;
    }
    api
      .placerPlanning({ projectId: choisie.projectId, number: choisie.number, date: jour, reseaux })
      .then(() => {
        setChoisie(null);
        setJour(null);
        setReseaux([]);
        setError('');
        return load();
      })
      .catch((e) => setError(e.message));
  };
  const action = (p) => p.then(load).catch((e) => setError(e.message));
  const fin = jours[6];

  return (
    <div className="clay-content">
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 260px) minmax(0, 1fr)', gap: 18, alignItems: 'start' }} className="planning">
        {/* À placer */}
        <div className="clay-block" style={{ padding: 14 }}>
          <h3 style={{ marginTop: 0 }}>À placer · {data.aPlacer.length}</h3>
          {data.aPlacer.length === 0 && <p className="clay-muted small">Les vidéos validées arrivent ici.</p>}
          {data.aPlacer.map((v) => {
            const [fond, encre] = teinte(v);
            const sel = choisie && choisie.projectId === v.projectId && choisie.number === v.number;
            return (
              <div
                key={`${v.projectId}:${v.number}`}
                onClick={() => setChoisie(sel ? null : v)}
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  padding: 8,
                  marginBottom: 8,
                  borderRadius: 12,
                  cursor: 'pointer',
                  background: fond,
                  outline: sel ? `3px solid ${encre}` : 'none',
                }}
              >
                <Vignette v={v} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: encre }}>{v.appli}</div>
                  <div style={{ fontSize: 13, color: encre, lineHeight: 1.3 }}>{v.titre}</div>
                </div>
              </div>
            );
          })}
          {choisie && <p className="clay-muted small">Touche maintenant un jour de la semaine.</p>}
        </div>

        {/* La semaine */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <button className="clay-btn ghost small" onClick={() => semaine(-1)}>
              ‹
            </button>
            <b>
              Du {debut.getDate()} {MOIS[debut.getMonth()]} au {fin.getDate()} {MOIS[fin.getMonth()]}
            </b>
            <button className="clay-btn ghost small" onClick={() => semaine(1)}>
              ›
            </button>
            <button className="clay-btn ghost small" onClick={() => setDebut(lundi(new Date()))}>
              Aujourd'hui
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 8 }}>
            {jours.map((d, i) => {
              const j = iso(d);
              const du = data.entrees.filter((e) => e.date === j);
              return (
                <div
                  key={j}
                  className="clay-block"
                  onClick={() => choisie && (setJour(j), setReseaux([]), setError(''))}
                  style={{
                    padding: 8,
                    minHeight: 260,
                    cursor: choisie ? 'copy' : 'default',
                    outline: j === aujourdhui ? '2px solid var(--clay-accent, #d97757)' : choisie ? '2px dashed var(--clay-line, #ccc)' : 'none',
                  }}
                >
                  <div className="clay-muted small" style={{ fontWeight: 700 }}>
                    {JOURS[i]} {d.getDate()}
                  </div>
                  {du.map((e) => {
                    const [fond, encre] = teinte(e.video);
                    return (
                      <div
                        key={e.id}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setOuverte(ouverte === e.id ? null : e.id);
                        }}
                        style={{ background: fond, color: encre, borderRadius: 10, padding: 6, marginTop: 8, cursor: 'pointer', fontSize: 12 }}
                      >
                        {e.video.vignette ? (
                          <img src={e.video.vignette} style={{ width: '100%', height: 90, objectFit: 'cover', borderRadius: 7, display: 'block' }} />
                        ) : null}
                        <div style={{ fontWeight: 700, marginTop: 5 }}>{e.video.appli}</div>
                        <div style={{ lineHeight: 1.25, overflowWrap: 'anywhere' }}>{e.video.titre}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                          {RESEAUX.filter(([r]) => e.reseaux[r]).map(([r, nom]) => (
                            <button
                              key={r}
                              title={e.reseaux[r].publie ? 'Publiée — toucher pour annuler' : 'Toucher une fois publiée'}
                              onClick={(ev) => {
                                ev.stopPropagation();
                                action(api.modifierPlanning(e.id, { publie: { reseau: r, fait: !e.reseaux[r].publie } }));
                              }}
                              style={{
                                fontSize: 11,
                                borderRadius: 6,
                                padding: '2px 6px',
                                cursor: 'pointer',
                                border: `1px solid ${encre}`,
                                background: e.reseaux[r].publie ? encre : 'transparent',
                                color: e.reseaux[r].publie ? fond : encre,
                              }}
                            >
                              {e.reseaux[r].publie ? '✓ ' : ''}
                              {nom}
                            </button>
                          ))}
                        </div>
                        {ouverte === e.id && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }} onClick={(ev) => ev.stopPropagation()}>
                            <button className="clay-btn ghost small" onClick={() => navigator.clipboard?.writeText(e.video.legende)}>
                              📋 Légende
                            </button>
                            {surLeMac() ? (
                              <a className="clay-btn ghost small" href={e.video.video} target="_blank" rel="noreferrer">
                                ▶︎ Voir
                              </a>
                            ) : (
                              <a className="clay-btn ghost small" href={`${e.video.video}?dl=1&name=${encodeURIComponent(e.video.legende.slice(0, 120) + '.mp4')}`}>
                                ⬇️
                              </a>
                            )}
                            <button className="clay-btn ghost small" onClick={() => action(api.retirerPlanning(e.id))}>
                              ✕ Retirer
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Choix des réseaux pour la vidéo posée */}
          {choisie && jour && (
            <div className="clay-block" style={{ marginTop: 14, padding: 14, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <b>
                {choisie.titre} → {jour.split('-').reverse().join('/')}
              </b>
              {RESEAUX.map(([r, nom]) => (
                <label key={r} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={reseaux.includes(r)}
                    onChange={(e) => setReseaux((l) => (e.target.checked ? [...l, r] : l.filter((x) => x !== r)))}
                  />
                  {nom}
                </label>
              ))}
              <button className="clay-btn" onClick={placer}>
                📅 Placer
              </button>
              <button className="clay-btn ghost small" onClick={() => setJour(null)}>
                Annuler
              </button>
            </div>
          )}
          {error && <p className="error small">{error}</p>}
        </div>
      </div>
    </div>
  );
}
