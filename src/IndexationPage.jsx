// Indexation des sites sur Google : chaque site, combien de pages Google a
// gardées, et la liste des problèmes en français avec leur solution. Le
// Studio vérifie tout seul chaque matin ; on peut aussi relancer à la main.
import React, { useEffect, useState } from 'react';
import { api, followJob } from './api.js';

const GRAVITE = { 3: '🔴', 2: '🟠', 1: '🟡' };
const date = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : '');
const heure = (iso) => (iso ? new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : 'jamais');

function Probleme({ p, onFait, setError }) {
  const [ouvert, setOuvert] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [copie, setCopie] = useState(false);
  const plan = () => {
    setEnvoi(true);
    api
      .renvoyerPlan(p.id)
      .then(({ jobId }) => followJob(jobId))
      .then(onFait)
      .catch((e) => setError(e.message))
      .finally(() => setEnvoi(false));
  };
  const consigne = () =>
    api
      .consigneIndexation(p.id)
      .then(({ consigne }) => navigator.clipboard?.writeText(consigne))
      .then(() => setCopie(true))
      .catch((e) => setError(e.message));
  return (
    <div style={{ borderTop: '1px solid var(--ligne)', padding: '12px 0' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <b>
          {GRAVITE[p.gravite] || '🟡'} {p.titre}
          {p.urls.length ? ` · ${p.urls.length} page${p.urls.length > 1 ? 's' : ''}` : ''}
        </b>
        {p.corrige ? <span className="clay-state ok">✓ Corrigé le {date(p.corrige.le)} — Google revérifie</span> : null}
      </div>
      <div className="small" style={{ marginTop: 4 }}>{p.explication}</div>
      <div className="small clay-muted" style={{ marginTop: 2 }}>
        <b>Solution :</b> {p.solution}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        {p.action === 'plan' ? (
          <button className="clay-btn small" disabled={envoi} onClick={plan}>
            {envoi ? '⏳ Envoi…' : '✓ Renvoyer le plan à Google'}
          </button>
        ) : (
          <>
            <button className="clay-btn small" onClick={consigne}>
              {copie ? '✓ Consigne copiée' : '📋 Copier la consigne pour Claude'}
            </button>
            <button className="clay-btn ghost small" onClick={() => api.noterCorrige(p.id).then(onFait).catch((e) => setError(e.message))}>
              ✓ C’est corrigé
            </button>
          </>
        )}
        {p.urls.length ? (
          <button className="clay-btn ghost small" onClick={() => setOuvert(!ouvert)}>
            {ouvert ? 'Masquer les pages' : 'Voir les pages'}
          </button>
        ) : null}
      </div>
      {copie && p.action !== 'plan' ? (
        <p className="clay-muted small">Colle-la dans une session Claude ouverte sur le dossier du site, puis touche « C’est corrigé ».</p>
      ) : null}
      {ouvert && (
        <div style={{ marginTop: 8 }}>
          {p.urls.slice(0, 50).map((u) => (
            <div key={u.url} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, padding: '3px 0' }}>
              <span style={{ flex: 1, overflowWrap: 'anywhere' }}>{u.url.replace(/^https?:\/\/(www\.)?/, '')}</span>
              <a className="clay-btn ghost small" href={u.google} target="_blank" rel="noreferrer">
                Demander l’indexation ↗
              </a>
            </div>
          ))}
          {p.urls.length > 50 ? <p className="clay-muted small">… et {p.urls.length - 50} autres.</p> : null}
        </div>
      )}
    </div>
  );
}

export function IndexationPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [suivi, setSuivi] = useState(false);
  const load = () =>
    api
      .indexation()
      .then(setData)
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);
  // Un passage en cours (lancé ici ou le matin) : on le suit jusqu'au bout.
  useEffect(() => {
    if (data?.passageId && !suivi) {
      setSuivi(true);
      followJob(data.passageId)
        .catch((e) => setError(e.message))
        .finally(() => {
          setSuivi(false);
          load();
        });
    }
  }, [data?.passageId]);

  if (!data) {
    return <div className="clay-content clay-muted">{error || 'Chargement…'}</div>;
  }
  if (!data.connecte) {
    return (
      <div className="clay-content">
        <div className="clay-block" style={{ maxWidth: 640 }}>
          <h3 style={{ marginTop: 0 }}>🔎 Brancher Google Search Console</h3>
          <p className="small">Le Studio lira l’état de chaque page de tes sites chez Google, chaque matin.</p>
          {data.configure ? (
            <a className="clay-btn" href="/api/indexation/connecter">
              Connecter Search Console
            </a>
          ) : (
            <p className="clay-muted small">Il faut d’abord les clés Google (Réglages → YouTube).</p>
          )}
          <p className="clay-muted small">Choisis le compte Google qui gère Search Console (teiki5320@gmail.com).</p>
        </div>
        {error && <p className="error small">{error}</p>}
      </div>
    );
  }
  const verifier = () =>
    api
      .verifierIndexation()
      .then(load)
      .catch((e) => setError(e.message));

  return (
    <div className="clay-content">
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="clay-muted small">Dernière vérification : {heure(data.dernierPassage)} · tous les matins à partir de 7 h</span>
        <button className="clay-btn small" disabled={Boolean(data.passageId)} onClick={verifier}>
          {data.passageId ? '⏳ Vérification en cours…' : '🔄 Vérifier maintenant'}
        </button>
      </div>
      {data.sites.length === 0 && (
        <div className="clay-block">
          <p className="small">Aucune vérification encore. Touche « Vérifier maintenant » : la première peut prendre une vingtaine de minutes.</p>
        </div>
      )}
      {data.sites.map((s) => {
        const ouverts = s.problemes.filter((p) => !p.corrige);
        return (
          <div key={s.propriete} className="clay-block">
            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0 }}>{s.domaine}</h3>
              <span className="small">
                <b>{s.indexees}</b> page{s.indexees > 1 ? 's' : ''} sur Google, sur {s.total}
              </span>
              {s.verifiees < s.total ? <span className="clay-muted small">· {s.total - s.verifiees} pas encore vérifiées</span> : null}
              <span className={`clay-state ${ouverts.length ? 'att' : 'ok'}`}>
                {ouverts.length ? `${ouverts.length} problème${ouverts.length > 1 ? 's' : ''}` : '✓ Rien à corriger'}
              </span>
            </div>
            <div style={{ height: 8, borderRadius: 99, background: 'var(--none-tint)', margin: '10px 0', overflow: 'hidden' }}>
              <div style={{ width: `${s.total ? (100 * s.indexees) / s.total : 0}%`, height: '100%', background: 'var(--ok)' }} />
            </div>
            {s.erreur ? <p className="error small">⚠️ {s.erreur}</p> : null}
            {s.problemes.map((p) => (
              <Probleme key={p.id} p={p} onFait={load} setError={setError} />
            ))}
          </div>
        );
      })}
      {error && <p className="error small">{error}</p>}
    </div>
  );
}
