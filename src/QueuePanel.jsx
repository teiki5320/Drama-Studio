// File d'attente de production : ce qui est en cours, en attente ou prêt.
// projectId : n'afficher que les vidéos d'un projet (page d'une appli).
import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { lienVideo, surLeMac } from './VideoSave.jsx';

const STATES = {
  running: { cls: 'run', text: 'en cours' },
  waiting: { cls: 'att', text: 'en attente' },
  done: { cls: 'ok', text: 'prête ✓ iCloud' },
  error: { cls: 'ko', text: 'échec' },
};

export function QueuePanel({ projectId = null, refreshKey = 0, onDone = null }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');

  // Travaux lancés hors de la file (Retoucher : montage, image, clip, voix).
  const [travaux, setTravaux] = useState([]);
  const load = () =>
    api
      .activeJobs()
      .then(setTravaux)
      .catch(() => {})
      .then(() => api.queue())
      .then((list) => {
        setItems((prev) => {
          // Une vidéo vient de se terminer : la page du projet se met à jour.
          if (onDone && prev) {
            const finished = list.some(
              (it) => it.status === 'done' && prev.some((p) => p.id === it.id && p.status !== 'done'),
            );
            if (finished) {
              onDone();
            }
          }
          return list;
        });
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [refreshKey]);

  const shown = (items || []).filter((it) => !projectId || it.projectId === projectId);
  const liesALaFile = new Set((items || []).map((it) => it.jobId).filter(Boolean));
  const horsFile = travaux.filter((j) => !liesALaFile.has(j.id) && (!projectId || j.projectId === projectId));

  return (
    <div className="clay-block">
      <h3>🏭 File d'attente</h3>
      {error && <p className="error small">{error}</p>}
      {horsFile.map((j) => (
        <div key={j.id} className="clay-file">
          <div className="clay-file-txt">
            <span>{j.label}</span>
            {j.step && <small className="clay-muted">{j.step}</small>}
          </div>
          <span className="clay-state run">
            en cours{j.progress != null ? ` · ${Math.round(j.progress * 100)} %` : ''}
          </span>
        </div>
      ))}
      {items && shown.length === 0 && horsFile.length === 0 && (
        <p className="clay-muted small">
          Rien en attente.
        </p>
      )}
      {[...shown].reverse().map((it) => {
        const st = STATES[it.status] || STATES.waiting;
        return (
          <div key={it.id} className="clay-file">
            <div className="clay-file-txt">
              <span>{it.label}</span>
              {it.status === 'running' && it.step && <small className="clay-muted">{it.step}</small>}
              {it.status === 'error' && it.error && <small className="error">{it.error}</small>}
            </div>
            <span className={`clay-state ${st.cls}`}>
              {st.text}
              {it.status === 'running' && it.progress != null ? ` · ${Math.round(it.progress * 100)} %` : ''}
            </span>
            {it.status === 'done' && it.number != null && !surLeMac() && (
              <a
                className="clay-btn ghost small"
                href={lienVideo(it.projectId, `renders/episode-${it.number}.mp4`, it.label)}
                title="Enregistrer la vidéo"
              >
                ⬇️
              </a>
            )}
            {!projectId && (
              <a className="clay-btn ghost small" href={`#/projet/${it.projectId}`} title="Ouvrir le projet">
                ↗
              </a>
            )}
            {it.status !== 'running' && (
              <button
                className="clay-btn ghost small"
                title={it.status === 'waiting' ? 'Retirer de la file' : 'Effacer la ligne'}
                onClick={() => api.removeFromQueue(it.id).then(load).catch((e) => setError(e.message))}
              >
                ✕
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
