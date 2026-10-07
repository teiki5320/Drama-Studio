// Planning des réseaux sociaux : une ligne par compte (TikTok, YouTube,
// Pinterest…), une colonne par jour. Une publication = une vidéo sur un
// compte, un jour. On glisse une vidéo « à placer » sur une case (ou on la
// touche, puis ＋) ; une vignette se glisse vers une autre case. La fiche à
// droite garde la légende, la vidéo et les actions. L'onglet « Publier »
// déroule le travail du jour, vidéo par vidéo.
import React, { useEffect, useRef, useState } from 'react';
import { api, copyText, followJob } from './api.js';
import { surLeMac } from './VideoSave.jsx';

const RESEAUX = [
  ['tiktok', 'TikTok', 'TT'],
  ['youtube', 'YouTube', 'YT'],
  ['pinterest', 'Pinterest', 'Pin'],
];
const NOM_RESEAU = Object.fromEntries(RESEAUX.map(([k, n]) => [k, n]));
const COURT = Object.fromEntries(RESEAUX.map(([k, , c]) => [k, c]));

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
const depuisIso = (s) => new Date(`${s}T12:00:00`);
const decaler = (s, n) => {
  const d = depuisIso(s);
  d.setDate(d.getDate() + n);
  return iso(d);
};
function lundi(d) {
  const x = new Date(d);
  x.setHours(12, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const jourCourt = (d) => `${JOURS[(d.getDay() + 6) % 7]} ${d.getDate()}`;
const cle = (x) => `${x.projectId}:${x.number}`;
const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;

// Réseaux repliés et comptes masqués : retenus sur l'appareil.
const RANGEMENT = 'drama-studio.planning';
function lireRangement() {
  try {
    return JSON.parse(localStorage.getItem(RANGEMENT)) || {};
  } catch {
    return {};
  }
}

const COLS = '140px repeat(7, minmax(0, 1fr))';
const pastille = (bg, color) => ({ fontSize: 12, fontWeight: 800, padding: '3px 10px', borderRadius: 999, background: bg, color, whiteSpace: 'nowrap' });
const petitBouton = { border: 'none', borderRadius: 10, padding: '6px 10px', background: 'var(--carte-2)', color: 'var(--texte)', fontWeight: 800, fontSize: 12, cursor: 'pointer' };

function Apercu({ v, w, h }) {
  const [fond, encre] = teinte(v);
  return v?.vignette ? (
    <img src={v.vignette} style={{ width: w, height: h, objectFit: 'cover', borderRadius: 14, flex: 'none', display: 'block' }} />
  ) : (
    <div style={{ width: w, height: h, borderRadius: 14, flex: 'none', background: `repeating-linear-gradient(135deg, rgba(0,0,0,0.06) 0 7px, rgba(0,0,0,0) 7px 14px) ${fond}`, color: encre }} />
  );
}

export function PlanningPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [vue, setVue] = useState('semaine');
  const [debut, setDebut] = useState(() => lundi(new Date()));
  const [sel, setSel] = useState(null); // vidéo à placer (clé), en attente d'une case
  const [fiche, setFiche] = useState(null); // vidéo ouverte dans la fiche (clé)
  const [over, setOver] = useState(null); // case survolée pendant un glisser
  const [rangement, setRangement] = useState(lireRangement);
  const [apercu, setApercu] = useState(null); // remplissage automatique proposé
  const [annulables, setAnnulables] = useState(null); // ids posés par le remplissage
  const [envoi, setEnvoi] = useState(null);
  const [cur, setCur] = useState(0);
  const drag = useRef(null);

  const load = () =>
    api
      .planning()
      .then((d) => {
        setData(d);
        setError('');
      })
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(RANGEMENT, JSON.stringify(rangement));
    } catch {
      // préférence non retenue : sans gravité
    }
  }, [rangement]);

  if (!data) {
    return <div className="clay-content clay-muted">{error || 'Chargement…'}</div>;
  }

  const act = (p) => p.then(load).catch((e) => setError(e.message));
  const aujourdhui = iso(new Date());
  const { comptes, aPlacer, publications } = data;
  const compteDe = Object.fromEntries(comptes.map((c) => [c.id, c]));
  const ordre = Object.fromEntries(comptes.map((c, i) => [c.id, i]));
  const videos = new Map();
  aPlacer.forEach((v) => videos.set(cle(v), v));
  publications.forEach((p) => videos.set(cle(p), p.video));
  const pubsDe = (k) => publications.filter((p) => cle(p) === k).sort((a, b) => ordre[a.compte] - ordre[b.compte]);
  const dejaSur = (k, compte) => publications.some((p) => cle(p) === k && p.compte === compte);
  const enRetard = (p) => p.date < aujourdhui && !p.publie;
  const jours = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(debut);
    d.setDate(d.getDate() + i);
    return d;
  });
  const [premier, dernier] = [iso(jours[0]), iso(jours[6])];
  const dansSemaine = (p) => p.date >= premier && p.date <= dernier;
  const semaine = (n) => {
    const d = new Date(debut);
    d.setDate(d.getDate() + 7 * n);
    setDebut(d);
  };
  // Publication directe : seulement le compte YouTube qui porte le nom de la
  // chaîne connectée dans les Réglages.
  const direct = (p) => {
    const c = compteDe[p.compte];
    return c?.reseau === 'youtube' && data.youtube && c.nom.toLowerCase() === String(data.youtube).toLowerCase();
  };

  const placer = (k, compte, date) => {
    const v = videos.get(k);
    if (!v || dejaSur(k, compte)) {
      return;
    }
    setFiche(k);
    setSel(k);
    act(api.placerPlanning({ projectId: v.projectId, number: v.number, comptes: [compte], date }));
  };
  const deplacer = (id, compte, date) => {
    const p = publications.find((x) => x.id === id);
    if (!p || (p.compte === compte && p.date === date) || (p.compte !== compte && dejaSur(cle(p), compte))) {
      return;
    }
    setFiche(cle(p));
    act(api.modifierPlanning(id, { compte, date }));
  };
  const deposer = (compte, date) => {
    const d = drag.current;
    drag.current = null;
    setOver(null);
    if (d?.type === 'video') {
      placer(d.cle, compte, date);
    } else if (d?.type === 'pub') {
      deplacer(d.id, compte, date);
    }
  };
  const finGlisser = () => {
    drag.current = null;
    setOver(null);
  };
  const basculer = (p) => act(api.modifierPlanning(p.id, { publie: !p.publie }));
  const publierYoutube = (p) => {
    setEnvoi(p.id);
    api
      .publierYoutube(p.id)
      .then(({ jobId }) => followJob(jobId))
      .then(load)
      .catch((e) => setError(e.message))
      .finally(() => setEnvoi(null));
  };
  const lienTelechargement = (v) =>
    surLeMac() ? v.video : `${v.video}?dl=1&name=${encodeURIComponent(v.legende.slice(0, 120) + '.mp4')}`;

  // ---------- Remplissage automatique ----------
  const proposerRemplissage = () =>
    apercu ? setApercu(null) : api.remplirPlanning(false).then(setApercu).catch((e) => setError(e.message));
  const appliquerRemplissage = () =>
    api
      .remplirPlanning(true)
      .then((l) => {
        setAnnulables(l.map((p) => p.id));
        setApercu(null);
        setSel(null);
        return load();
      })
      .catch((e) => setError(e.message));
  const annulerRemplissage = () => {
    const ids = annulables || [];
    setAnnulables(null);
    act(Promise.all(ids.map((id) => api.retirerPlanning(id))));
  };
  const apercuParVideo = [];
  (apercu || []).forEach((p) => {
    const k = cle(p);
    let g = apercuParVideo.find((x) => x.k === k);
    if (!g) {
      g = { k, v: videos.get(k), lignes: [] };
      apercuParVideo.push(g);
    }
    const c = compteDe[p.compte];
    g.lignes.push(`${COURT[c?.reseau] || ''} ${c?.nom || '?'} · ${jourCourt(depuisIso(p.date)).toLowerCase()}`);
  });

  // ---------- Vignette d'une publication dans la grille ----------
  const vignette = (p) => {
    const v = p.video;
    const [fond, encre] = teinte(v);
    return (
      <div
        key={p.id}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', p.id);
          drag.current = { type: 'pub', id: p.id };
        }}
        onDragEnd={finGlisser}
        onClick={() => setFiche(cle(p))}
        title={v.titre}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          borderRadius: 8,
          padding: '5px 5px 5px 7px',
          cursor: 'grab',
          background: fond,
          color: encre,
          opacity: p.publie ? 0.6 : 1,
          outline: fiche === cle(p) ? '2px solid var(--accent)' : 'none',
          outlineOffset: 1,
        }}
      >
        {enRetard(p) && <span style={{ fontSize: 9, fontWeight: 800, color: '#c1523f', letterSpacing: 0.3 }}>EN RETARD</span>}
        <span style={{ fontSize: 11, fontWeight: 700, lineHeight: 1.2, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{v.titre}</span>
        <button
          title={p.publie ? 'Publiée — toucher pour annuler' : 'Toucher une fois publiée'}
          onClick={(e) => {
            e.stopPropagation();
            basculer(p);
          }}
          style={{ alignSelf: 'flex-end', width: 24, height: 24, borderRadius: 7, border: `1.5px solid ${encre}`, background: p.publie ? encre : 'transparent', color: p.publie ? fond : encre, fontSize: 12, fontWeight: 800, cursor: 'pointer', padding: 0, lineHeight: 1 }}
        >
          {p.publie ? '✓' : ''}
        </button>
      </div>
    );
  };

  // ---------- Fiche de la vidéo ouverte ----------
  const fv = fiche && videos.get(fiche);
  const fps = fv ? pubsDe(fiche) : [];
  const ficheJsx = fv && (
    <aside
      style={{ position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 10, width: 360, maxWidth: '92%', boxSizing: 'border-box', background: 'var(--side)', borderRadius: '28px 0 0 28px', boxShadow: 'var(--clay)', padding: 20, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={pastille(teinte(fv)[0], teinte(fv)[1])}>{fv.appli}</span>
        <div style={{ flex: 1 }} />
        <button className="clay-pill" style={{ width: 34, height: 34, fontSize: 14 }} title="Fermer" onClick={() => (setFiche(null), setSel(null))}>
          ✕
        </button>
      </div>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <Apercu v={fv} w={90} h={160} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <b style={{ fontSize: 18, lineHeight: 1.25 }}>{fv.titre}</b>
          <span className="clay-muted small">
            {!fps.length
              ? 'Pas encore placée'
              : `${pluriel(fps.length, 'compte')} · ${fps.some((p) => !p.publie) ? `${fps.filter((p) => !p.publie).length} à publier` : 'tout est publié'}`}
          </span>
          <a className="clay-btn ghost small" style={{ alignSelf: 'flex-start' }} href={lienTelechargement(fv)} target={surLeMac() ? '_blank' : undefined} rel="noreferrer">
            {surLeMac() ? '▶︎ Voir' : '⬇️ Vidéo'}
          </a>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <b style={{ flex: 1, fontSize: 14 }}>Légende</b>
          <button className="clay-btn small" onClick={() => copyText(fv.legende)}>
            📋 Copier
          </button>
        </div>
        <div style={{ background: 'var(--carte)', borderRadius: 14, padding: '10px 12px', fontSize: 13, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{fv.legende}</div>
      </div>
      {fps.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <b style={{ fontSize: 14 }}>Publications</b>
          {fps.map((p) => {
            const c = compteDe[p.compte];
            const retard = enRetard(p);
            return (
              <div key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--carte)', borderRadius: 14, padding: '8px 8px 8px 12px', boxShadow: 'var(--clay-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                    <span className="clay-muted" style={{ fontSize: 11, fontWeight: 800 }}>{NOM_RESEAU[c.reseau]}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.nom}>{c.nom}</span>
                  </div>
                  <span className={`clay-state ${p.publie ? 'ok' : retard ? 'ko' : 'run'}`}>{p.publie ? '✓ Publiée' : retard ? 'En retard' : 'À publier'}</span>
                  <button title="Retirer ce compte" onClick={() => act(api.retirerPlanning(p.id))} style={{ ...petitBouton, background: 'transparent', color: 'var(--c-muted)' }}>
                    ✕
                  </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', background: 'var(--carte-2)', borderRadius: 10 }}>
                    <button style={{ ...petitBouton, background: 'transparent' }} onClick={() => deplacer(p.id, p.compte, decaler(p.date, -1))}>
                      ‹
                    </button>
                    <span style={{ fontSize: 12, fontWeight: 800, minWidth: 48, textAlign: 'center' }}>{jourCourt(depuisIso(p.date))}</span>
                    <button style={{ ...petitBouton, background: 'transparent' }} onClick={() => deplacer(p.id, p.compte, decaler(p.date, 1))}>
                      ›
                    </button>
                  </div>
                  <div style={{ flex: 1 }} />
                  {p.url && (
                    <a className="clay-btn ghost small" href={p.url} target="_blank" rel="noreferrer">
                      Voir{p.prive ? ' (privée)' : ''}
                    </a>
                  )}
                  {!p.publie && direct(p) ? (
                    <button className="clay-btn small" disabled={envoi === p.id} onClick={() => publierYoutube(p)}>
                      {envoi === p.id ? '⏳ Envoi…' : '▶️ Publier'}
                    </button>
                  ) : (
                    <button className={`clay-btn small${p.publie ? ' ghost' : ''}`} onClick={() => basculer(p)}>
                      {p.publie ? 'Annuler' : '✓ Fait'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {comptes.some((c) => !dejaSur(fiche, c.id)) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="clay-muted small" style={{ fontWeight: 800 }}>
            {fps.length ? `Ajouter un compte (${jourCourt(depuisIso(fps[0].date)).toLowerCase()})` : 'Placer aujourd’hui sur… (ou touche ＋ dans la grille)'}
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {comptes
              .filter((c) => !dejaSur(fiche, c.id))
              .sort((a, b) => Number(fv.proposes?.includes(b.id)) - Number(fv.proposes?.includes(a.id)))
              .map((c) => (
                <button key={c.id} style={petitBouton} onClick={() => placer(fiche, c.id, fps[0]?.date || aujourdhui)}>
                  ＋ {COURT[c.reseau]} {c.nom}
                  {fv.proposes?.includes(c.id) ? ' ★' : ''}
                </button>
              ))}
          </div>
        </div>
      )}
      {fps.length > 0 && (
        <button className="clay-btn ghost small" style={{ alignSelf: 'flex-start' }} onClick={() => act(api.retirerVideoPlanning(fv.projectId, fv.number))}>
          ✕ Retirer du planning
        </button>
      )}
    </aside>
  );

  // ---------- Onglet Publier : le travail du jour ----------
  const aFaire = [];
  publications
    .filter((p) => p.date === aujourdhui || enRetard(p))
    .forEach((p) => {
      const k = cle(p);
      let g = aFaire.find((x) => x.k === k);
      if (!g) {
        g = { k, v: p.video, pubs: [] };
        aFaire.push(g);
      }
      g.pubs.push(p);
    });
  aFaire.forEach((g) => g.pubs.sort((a, b) => ordre[a.compte] - ordre[b.compte]));
  aFaire.sort((a, b) => Number(b.pubs.some(enRetard)) - Number(a.pubs.some(enRetard)));
  const restant = publications.filter((p) => p.date <= aujourdhui && !p.publie).length;
  const total = aFaire.reduce((n, g) => n + g.pubs.length, 0);
  const faits = aFaire.reduce((n, g) => n + g.pubs.filter((p) => p.publie).length, 0);
  const iCur = Math.min(cur, Math.max(aFaire.length - 1, 0));
  const courant = aFaire[iCur];

  const onglet = (id, libelle, badge) => (
    <button
      onClick={() => setVue(id)}
      style={{ border: 'none', padding: '8px 14px', borderRadius: 10, fontWeight: 800, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, background: vue === id ? 'var(--accent)' : 'transparent', color: vue === id ? 'var(--accent-ink)' : 'var(--c-muted)' }}
    >
      {libelle}
      {badge ? <span style={pastille('var(--run-tint)', 'var(--run)')}>{badge}</span> : null}
    </button>
  );

  return (
    <div className="clay-content" style={{ maxWidth: 'none', padding: 0, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '16px 28px 0' }}>
        <div style={{ display: 'flex', background: 'var(--carte)', borderRadius: 14, padding: 4, gap: 4, boxShadow: 'var(--clay-sm)' }}>
          {onglet('semaine', '🗓️ Semaine')}
          {onglet('publier', '🚀 Publier', restant)}
        </div>
        {error && <span className="error small">{error}</span>}
      </div>

      {vue === 'semaine' ? (
        <div style={{ padding: '14px 28px 40px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* À placer */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <b>À placer</b>
            <span className="clay-state run">{aPlacer.length}</span>
            <div style={{ flex: 1 }} />
            {aPlacer.length > 0 && comptes.length > 0 && (
              <button className={`clay-btn small${apercu ? ' ghost' : ''}`} onClick={proposerRemplissage}>
                ✨ Remplir automatiquement
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '4px 2px 6px', minHeight: 58 }}>
            {aPlacer.length === 0 && <span className="clay-muted small" style={{ alignSelf: 'center' }}>Tout est placé. Les vidéos validées arrivent ici.</span>}
            {aPlacer.map((v) => {
              const k = cle(v);
              const [fond, encre] = teinte(v);
              return (
                <div
                  key={k}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', k);
                    drag.current = { type: 'video', cle: k };
                  }}
                  onDragEnd={finGlisser}
                  onClick={() => (setSel(sel === k ? null : k), setFiche(k))}
                  style={{ flex: '0 0 180px', display: 'flex', gap: 8, alignItems: 'center', padding: 7, borderRadius: 12, background: fond, color: encre, cursor: 'grab', outline: sel === k ? '3px solid var(--accent)' : 'none', outlineOffset: 2 }}
                >
                  <Apercu v={v} w={24} h={42} />
                  <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: 11, fontWeight: 800 }}>{v.appli}</span>
                    <span style={{ fontSize: 12, lineHeight: 1.25, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{v.titre}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {apercu && (
            <div className="clay-block" style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <b>Aperçu du remplissage</b>
                <span className="clay-muted small">1 vidéo maximum par compte et par jour, dès aujourd'hui, sur les comptes proposés pour chaque appli (Réglages).</span>
              </div>
              {apercuParVideo.length === 0 ? (
                <span className="clay-muted small">Aucun compte proposé pour ces applis : coche-les dans Réglages → Comptes des réseaux.</span>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
                  {apercuParVideo.map((g) => (
                    <div key={g.k} style={{ display: 'flex', gap: 10, alignItems: 'center', background: 'var(--carte-2)', borderRadius: 12, padding: '8px 10px' }}>
                      <span style={{ width: 8, height: 34, borderRadius: 999, background: teinte(g.v)[0], flex: 'none' }} />
                      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.25 }}>{g.v?.titre}</span>
                        <span className="clay-muted" style={{ fontSize: 11, lineHeight: 1.35 }}>{g.lignes.join('  ·  ')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                {apercuParVideo.length > 0 && (
                  <button className="clay-btn" onClick={appliquerRemplissage}>
                    Appliquer
                  </button>
                )}
                <button className="clay-btn ghost" onClick={() => setApercu(null)}>
                  Fermer
                </button>
              </div>
            </div>
          )}

          {/* Aide + semaine */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: 'var(--carte)', borderRadius: 14, padding: '8px 8px 8px 14px', boxShadow: 'var(--clay-sm)' }}>
            <span style={{ flex: '1 1 260px', fontSize: 13 }}>
              {sel
                ? pubsDe(sel).length
                  ? `« ${videos.get(sel)?.titre} » : ajoute d'autres comptes avec ＋, ou glisse ses vignettes pour changer de jour.`
                  : `« ${videos.get(sel)?.titre} » : touche ＋ sur le compte et le jour voulus, ou glisse-la.`
                : 'Glisse une vidéo sur une case compte × jour, ou touche-la puis ＋. Touche une vignette pour ouvrir sa fiche.'}
            </span>
            {sel && (
              <button className="clay-btn small" onClick={() => setSel(null)}>
                Terminé
              </button>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button style={petitBouton} onClick={() => semaine(-1)}>
                ‹
              </button>
              <b style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                {jours[0].getDate()} – {jours[6].getDate()} {MOIS[jours[6].getMonth()]}
              </b>
              <button style={petitBouton} onClick={() => semaine(1)}>
                ›
              </button>
              <button style={petitBouton} onClick={() => setDebut(lundi(new Date()))}>
                Aujourd'hui
              </button>
            </div>
          </div>

          {comptes.some((c) => rangement.masques?.[c.id]) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span className="clay-muted small" style={{ fontWeight: 800 }}>Comptes masqués :</span>
              {comptes
                .filter((c) => rangement.masques?.[c.id])
                .map((c) => (
                  <button key={c.id} style={{ ...petitBouton, borderRadius: 999 }} onClick={() => setRangement((x) => ({ ...x, masques: { ...x.masques, [c.id]: false } }))}>
                    {COURT[c.reseau]} {c.nom} · afficher
                  </button>
                ))}
            </div>
          )}

          {comptes.length === 0 ? (
            <div className="clay-block" style={{ margin: 0 }}>
              <b>Aucun compte pour l'instant.</b>
              <p className="clay-muted small" style={{ marginBottom: 0 }}>
                Ajoute tes comptes TikTok, YouTube et Pinterest dans <a href="#/reglages">Réglages → Comptes des réseaux</a> : chacun aura sa ligne ici.
              </p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: 880, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 4, position: 'sticky', top: 0, background: 'var(--fond)', zIndex: 2, padding: '4px 0' }}>
                  <span />
                  {jours.map((d) => {
                    const j = iso(d);
                    return (
                      <span key={j} style={{ fontSize: 12, fontWeight: 800, padding: '4px 6px', color: j === aujourdhui ? 'var(--accent)' : j < aujourdhui ? 'var(--c-muted)' : 'var(--texte)' }}>
                        {jourCourt(d)}
                        {j === aujourdhui ? ' · auj.' : ''}
                      </span>
                    );
                  })}
                </div>
                {RESEAUX.map(([r, nom]) => {
                  const tous = comptes.filter((c) => c.reseau === r);
                  if (!tous.length) {
                    return null;
                  }
                  const replie = Boolean(rangement.replies?.[r]);
                  const n = publications.filter((p) => compteDe[p.compte]?.reseau === r && dansSemaine(p)).length;
                  return (
                    <React.Fragment key={r}>
                      <button
                        onClick={() => setRangement((x) => ({ ...x, replies: { ...x.replies, [r]: !replie } }))}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', cursor: 'pointer', padding: '10px 2px 2px', textAlign: 'left', color: 'var(--c-muted)', fontSize: 12 }}
                      >
                        <span style={{ width: 12 }}>{replie ? '▸' : '▾'}</span>
                        <span style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--texte)' }}>{nom}</span>
                        <span>
                          {pluriel(tous.length, 'compte')} · {pluriel(n, 'publication')}
                        </span>
                      </button>
                      {replie ? (
                        <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 4 }}>
                          <div className="clay-muted" style={{ display: 'flex', alignItems: 'center', padding: '0 10px', background: 'var(--side)', borderRadius: 10, height: 30, fontSize: 12, fontWeight: 700 }}>
                            Replié
                          </div>
                          {jours.map((d) => {
                            const j = iso(d);
                            const c = publications.filter((p) => p.date === j && compteDe[p.compte]?.reseau === r).length;
                            return (
                              <div key={j} className="clay-muted" style={{ height: 30, borderRadius: 10, background: 'var(--carte)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>
                                {c || ''}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        tous
                          .filter((c) => !rangement.masques?.[c.id])
                          .map((c) => (
                            <div key={c.id} style={{ display: 'grid', gridTemplateColumns: COLS, gap: 4 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 6px 6px 10px', background: 'var(--side)', borderRadius: 12, minHeight: 60, boxSizing: 'border-box' }}>
                                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                                  <b style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.nom}>
                                    {c.nom}
                                  </b>
                                  <span className="clay-muted" style={{ fontSize: 11 }}>
                                    {publications.filter((p) => p.compte === c.id && dansSemaine(p)).length} cette semaine
                                  </span>
                                </div>
                                <button title="Masquer ce compte" onClick={() => setRangement((x) => ({ ...x, masques: { ...x.masques, [c.id]: true } }))} style={{ ...petitBouton, background: 'transparent', color: 'var(--c-muted)', padding: '4px 6px' }}>
                                  ✕
                                </button>
                              </div>
                              {jours.map((d) => {
                                const j = iso(d);
                                const k = `${c.id}|${j}`;
                                const ici = publications.filter((p) => p.compte === c.id && p.date === j);
                                return (
                                  <div
                                    key={j}
                                    onDragOver={(e) => {
                                      e.preventDefault();
                                      if (over !== k) {
                                        setOver(k);
                                      }
                                    }}
                                    onDrop={(e) => {
                                      e.preventDefault();
                                      deposer(c.id, j);
                                    }}
                                    style={{ background: j === aujourdhui ? 'var(--carte-2)' : 'var(--carte)', borderRadius: 12, padding: 5, display: 'flex', flexDirection: 'column', gap: 4, minHeight: 60, boxSizing: 'border-box', outline: over === k ? '2px solid var(--accent)' : ici.length > 1 ? '2px solid var(--ko)' : 'none' }}
                                  >
                                    {ici.map(vignette)}
                                    {sel && !dejaSur(sel, c.id) && (
                                      <button onClick={() => placer(sel, c.id, j)} style={{ flex: 1, minHeight: 28, border: '2px dashed var(--accent)', borderRadius: 8, background: 'transparent', color: 'var(--accent)', fontWeight: 800, cursor: 'pointer' }}>
                                        ＋
                                      </button>
                                    )}
                                    {ici.length > 1 && <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--ko)' }}>{ici.length} le même jour</span>}
                                  </div>
                                );
                              })}
                            </div>
                          ))
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          )}
          {ficheJsx}
        </div>
      ) : (
        <div className="planning-publier" style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 290px) minmax(0, 1fr)', minHeight: 'calc(100vh - 160px)' }}>
          <div style={{ padding: '20px 16px 20px 28px', display: 'flex', flexDirection: 'column', gap: 10, borderRight: '1px solid var(--ligne)' }}>
            <b>À publier aujourd'hui</b>
            <div style={{ height: 10, borderRadius: 999, background: 'var(--carte-2)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 999, background: 'var(--ok)', width: `${total ? Math.round((faits / total) * 100) : 0}%` }} />
            </div>
            <span className="clay-muted small">
              {faits} / {total} publications faites
            </span>
            {aFaire.length === 0 && <span className="clay-muted small">Rien à publier aujourd'hui.</span>}
            {aFaire.map((g, i) => {
              const n = g.pubs.filter((p) => p.publie).length;
              const fini = n === g.pubs.length;
              const retard = g.pubs.some(enRetard);
              return (
                <div
                  key={g.k}
                  onClick={() => setCur(i)}
                  style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 8, borderRadius: 14, cursor: 'pointer', background: i === iCur ? 'var(--carte-2)' : 'transparent', boxShadow: i === iCur ? 'var(--clay-sm)' : 'none' }}
                >
                  <span style={{ width: 8, height: 40, borderRadius: 999, background: teinte(g.v)[0], flex: 'none' }} />
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: retard ? 'var(--ko)' : 'var(--c-muted)' }}>
                      {retard ? `En retard · ${jourCourt(depuisIso(g.pubs.map((p) => p.date).sort()[0])).toLowerCase()}` : "Aujourd'hui"}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.25 }}>{g.v.titre}</span>
                  </div>
                  <span className={`clay-state ${fini ? 'ok' : 'run'}`}>{fini ? '✓' : `${n}/${g.pubs.length}`}</span>
                </div>
              );
            })}
          </div>
          <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 18 }}>
            {courant && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span className="clay-muted small" style={{ fontWeight: 800 }}>
                    {iCur + 1} sur {aFaire.length}
                  </span>
                  <span style={pastille(teinte(courant.v)[0], teinte(courant.v)[1])}>{courant.v.appli}</span>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                    <button className="clay-btn ghost" onClick={() => setCur((iCur - 1 + aFaire.length) % aFaire.length)}>
                      ← Précédente
                    </button>
                    <button className="clay-btn" onClick={() => setCur((iCur + 1) % aFaire.length)}>
                      Suivante →
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28, alignItems: 'flex-start' }}>
                  {surLeMac() ? (
                    <video src={courant.v.video} controls playsInline style={{ width: 200, aspectRatio: '9 / 16', borderRadius: 24, background: '#000', boxShadow: 'var(--clay)', flex: 'none' }} />
                  ) : (
                    <Apercu v={courant.v} w={200} h={356} />
                  )}
                  <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
                    <b style={{ fontSize: 26, lineHeight: 1.2 }}>{courant.v.titre}</b>
                    <div className="clay-block" style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <span style={{ fontSize: 15, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{courant.v.legende}</span>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button className="clay-btn" onClick={() => copyText(courant.v.legende)}>
                          📋 Copier la légende
                        </button>
                        <a className="clay-btn ghost" href={lienTelechargement(courant.v)} target={surLeMac() ? '_blank' : undefined} rel="noreferrer">
                          ⬇️ Télécharger la vidéo
                        </a>
                      </div>
                    </div>
                    <b>Comptes</b>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {courant.pubs.map((p) => {
                        const c = compteDe[p.compte];
                        return (
                          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, borderRadius: 16, padding: '8px 10px 8px 8px', background: p.publie ? 'var(--ok-tint)' : 'var(--carte-2)' }}>
                            <button
                              onClick={() => basculer(p)}
                              title={p.publie ? 'Publiée — toucher pour annuler' : 'Toucher une fois publiée'}
                              style={{ width: 44, height: 44, flex: 'none', borderRadius: 12, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 20, color: 'var(--accent-ink)', background: p.publie ? 'var(--ok)' : 'var(--carte)', boxShadow: 'var(--clay-sm)' }}
                            >
                              {p.publie ? '✓' : ''}
                            </button>
                            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontSize: 11, fontWeight: 800, color: enRetard(p) ? 'var(--ko)' : 'var(--c-muted)' }}>
                                {NOM_RESEAU[c.reseau]}
                                {enRetard(p) ? ' · en retard' : ''}
                              </span>
                              <span style={{ fontSize: 15, fontWeight: 700 }}>{c.nom}</span>
                            </div>
                            {!p.publie && direct(p) && (
                              <button className="clay-btn small" disabled={envoi === p.id} onClick={() => publierYoutube(p)}>
                                {envoi === p.id ? '⏳ Envoi…' : '▶️ Publier sur YouTube'}
                              </button>
                            )}
                            {p.url && (
                              <a className="clay-btn ghost small" href={p.url} target="_blank" rel="noreferrer">
                                Voir{p.prive ? ' (privée)' : ''}
                              </a>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {annulables && (
        <div style={{ position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--carte)', borderRadius: 16, padding: '10px 10px 10px 16px', boxShadow: 'var(--clay)', zIndex: 20 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ok)' }}>✓ {pluriel(annulables.length, 'publication')} placées</span>
          <button className="clay-btn ghost small" onClick={annulerRemplissage}>
            ↶ Annuler
          </button>
          <button className="clay-btn ghost small" onClick={() => setAnnulables(null)}>
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
