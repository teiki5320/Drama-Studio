// Réglages → Comptes & adresses : le récapitulatif de l'harmonisation sous
// toakeur.com. On touche « À faire » une fois l'adresse changée : la ligne
// passe à « Fait » et l'adresse actuelle devient la nouvelle. Avec
// resteSeulement, on ne montre que les lignes encore à faire ; sinon,
// seulement celles réglées (faites, gardées ou impossibles).
import React, { useEffect, useState } from 'react';
import { api } from './api.js';

const ETIQUETTES = {
  a_faire: ['att', 'À faire'],
  fait: ['ok', '✓ Fait'],
  garde: ['run', 'On garde'],
  impossible: ['ko', 'Ne change pas'],
};

export function ComptesTab({ resteSeulement = false }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api
      .comptes()
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  if (!data) {
    return <p className="clay-muted">{error || 'Chargement…'}</p>;
  }
  const lignes = data.sections.flatMap((s) => s.lignes).filter((l) => l.etat === 'a_faire' || l.etat === 'fait');
  const faites = lignes.filter((l) => l.etat === 'fait').length;
  const sections = data.sections
    .map((s) => ({ ...s, lignes: s.lignes.filter((l) => (l.etat === 'a_faire') === resteSeulement) }))
    .filter((s) => s.lignes.length);
  const basculer = (l) =>
    api
      .etatCompte(l.id, l.etat === 'fait' ? 'a_faire' : 'fait')
      .then(setData)
      .catch((e) => setError(e.message));

  return (
    <>
      {resteSeulement ? (
        <div className="clay-block">
          <h3 style={{ margin: 0 }}>
            🗂️ Tout sous {data.domaine || 'toakeur.com'} · {faites} / {lignes.length} fait{faites > 1 ? 's' : ''}
          </h3>
          <div style={{ height: 8, borderRadius: 99, background: 'var(--none-tint)', marginTop: 10, overflow: 'hidden' }}>
            <div style={{ width: `${lignes.length ? (100 * faites) / lignes.length : 0}%`, height: '100%', background: 'var(--ok)' }} />
          </div>
        </div>
      ) : null}
      {resteSeulement && faites === lignes.length ? <p className="clay-muted">Tout est fait 🎉</p> : null}
      {sections.map((s) => (
        <div key={s.titre} className="clay-block" style={{ overflowX: 'auto' }}>
          <h3 style={{ marginTop: 0 }}>{s.titre}</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr className="clay-muted small" style={{ textAlign: 'left' }}>
                <th style={{ padding: '6px 8px' }}>Quoi</th>
                <th style={{ padding: '6px 8px' }}>Adresse actuelle</th>
                {resteSeulement ? <th style={{ padding: '6px 8px' }}>État</th> : null}
              </tr>
            </thead>
            <tbody>
              {s.lignes.map((l) => {
                const [classe, texte] = ETIQUETTES[l.etat] || ETIQUETTES.a_faire;
                const actuelle = l.etat === 'fait' ? l.apres : l.avant;
                const cochable = l.etat === 'a_faire' || l.etat === 'fait';
                return (
                  <tr key={l.id} style={{ borderTop: '1px solid var(--ligne)', verticalAlign: 'top' }}>
                    <td style={{ padding: '8px', fontWeight: 700 }}>
                      {l.quoi}
                      {l.note ? <div className="clay-muted small" style={{ fontWeight: 400 }}>{l.note}</div> : null}
                    </td>
                    <td style={{ padding: '8px', overflowWrap: 'anywhere' }}>{actuelle}</td>
                    {resteSeulement ? (
                      <td style={{ padding: '8px' }}>
                        {cochable ? (
                          <button
                            className={`clay-state ${classe}`}
                            style={{ border: 0, cursor: 'pointer' }}
                            title={l.etat === 'fait' ? `Fait le ${l.le || '?'} — toucher pour annuler` : 'Toucher une fois changé'}
                            onClick={() => basculer(l)}
                          >
                            {texte}
                          </button>
                        ) : (
                          <span className={`clay-state ${classe}`}>{texte}</span>
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
      {error && <p className="error small">{error}</p>}
    </>
  );
}
