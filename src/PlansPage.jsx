// Retoucher une vidéo plan par plan : refaire l'image, le clip ou la voix
// d'un seul plan, puis refaire le montage (gratuit). Rien d'autre.
import React, { useEffect, useState } from 'react';
import { api, followJob } from './api.js';

// Écrans dessinés par le studio (frise, jeu, logo…) : pas d'image à refaire.
const dessine = (sc) => Boolean(sc.frise || sc.palabre || sc.ereaLogo || sc.slogan);

export function PlansPage({ projectId }) {
  const [project, setProject] = useState(null);
  const [numero, setNumero] = useState(null);
  const [occupe, setOccupe] = useState(null); // « s3:image », « montage »…
  const [etape, setEtape] = useState('');
  const [error, setError] = useState('');

  const load = () =>
    api
      .getProject(projectId)
      .then((p) => {
        setProject(p);
        setNumero((n) => n ?? [...(p.episodes || [])].sort((a, b) => b.number - a.number)[0]?.number ?? null);
      })
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, [projectId]);

  if (!project) {
    return <div className="clay-content clay-muted">{error || 'Chargement…'}</div>;
  }
  const episodes = [...(project.episodes || [])].sort((a, b) => b.number - a.number);
  const ep = episodes.find((e) => e.number === numero) || episodes[0];
  if (!ep) {
    return <div className="clay-content clay-muted">Aucune vidéo.</div>;
  }

  const lance = (cle, appel) => {
    setError('');
    setOccupe(cle);
    setEtape('');
    appel()
      .then(({ jobId }) => followJob(jobId, (j) => setEtape(j.step || '')))
      .then(load)
      .catch((e) => setError(e.message))
      .finally(() => {
        setOccupe(null);
        setEtape('');
      });
  };
  const bouton = (cle, libelle, appel, titre) => (
    <button className="clay-btn ghost small" disabled={Boolean(occupe)} title={titre} onClick={() => lance(cle, appel)}>
      {occupe === cle ? '⏳' : libelle}
    </button>
  );
  const fichier = (f) => `/files/${project.id}/${f}?v=${encodeURIComponent(project.updatedAt || '')}`;

  return (
    <div className="clay-content">
      {episodes.length > 1 && (
        <select className="rp-input" style={{ maxWidth: 520, marginBottom: 14 }} value={ep.number} onChange={(e) => setNumero(Number(e.target.value))}>
          {episodes.map((e) => (
            <option key={e.number} value={e.number}>
              {e.topic || e.title}
            </option>
          ))}
        </select>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {(ep.scenes || []).map((sc, i) => {
          const texte = (sc.lines || []).map((l) => l.text).join(' ');
          return (
            <div key={sc.id} className="clay-block" style={{ display: 'flex', gap: 14, alignItems: 'center', padding: 12 }}>
              <div
                style={{
                  width: 64,
                  height: 114,
                  borderRadius: 10,
                  overflow: 'hidden',
                  flex: 'none',
                  background: 'var(--clay-soft, #e9e1d6)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 26,
                }}
              >
                {sc.image ? <img src={fichier(sc.image)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : dessine(sc) ? '🎨' : '…'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>
                  Plan {i + 1}
                  {sc.video ? ' · 🎬' : ''}
                  {sc.imageError || sc.videoError ? ' · ⚠️' : ''}
                </b>
                {texte ? <div className="clay-muted small" style={{ marginTop: 4 }}>{texte.length > 140 ? `${texte.slice(0, 140)}…` : texte}</div> : null}
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  {!dessine(sc) && !sc.fromSite
                    ? bouton(`${sc.id}:image`, '🖼️ Refaire l’image', () => api.regenImage(project.id, ep.number, sc.id), 'Nouvelle image (crédits OpenArt)')
                    : null}
                  {sc.video || sc.clip
                    ? bouton(`${sc.id}:clip`, '🎬 Refaire le clip', () => api.regenVideo(project.id, ep.number, sc.id), 'Nouveau clip vidéo (crédits OpenArt)')
                    : null}
                  {(sc.lines || []).length
                    ? bouton(`${sc.id}:voix`, '🎙️ Refaire la voix', () => api.regenAudio(project.id, ep.number, sc.id), 'Nouvelle voix (ElevenLabs)')
                    : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 16, flexWrap: 'wrap' }}>
        <button className="clay-btn" disabled={Boolean(occupe)} onClick={() => lance('montage', () => api.renderEpisode(project.id, ep.number))}>
          {occupe === 'montage' ? '⏳ Montage…' : '🎞️ Refaire le montage'}
        </button>
        {occupe && etape ? <span className="clay-muted small">{etape}</span> : null}
      </div>
      {error && <p className="error small">{error}</p>}
    </div>
  );
}
