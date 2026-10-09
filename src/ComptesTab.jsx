// Réglages → Comptes & adresses / Reste à faire : le récapitulatif de
// l'harmonisation sous toakeur.com. « Comptes & adresses » montre ce qui est
// réglé, en tableau simple sans commentaires ; « Reste à faire » montre ce qui reste, avec
// quand le faire, et la barre de progression. On touche « À faire » une fois
// la chose faite : la ligne part dans l'autre onglet.
import React, { useEffect, useState } from 'react';
import { api } from './api.js';

const th = { padding: '6px 8px' };
const td = { padding: '8px', overflowWrap: 'anywhere' };

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
  const toutes = data.sections.flatMap((s) => s.lignes);
  const reglees = toutes.filter((l) => l.etat !== 'a_faire').length;
  const sections = data.sections
    .map((s) => ({ ...s, lignes: s.lignes.filter((l) => (l.etat === 'a_faire') === resteSeulement) }))
    .filter((s) => s.lignes.length);
  const cocher = (l) =>
    api
      .etatCompte(l.id, 'fait')
      .then(setData)
      .catch((e) => setError(e.message));

  return (
    <>
      {resteSeulement ? (
        <div className="clay-block">
          <h3 style={{ margin: 0 }}>
            📌 {reglees} / {toutes.length} réglés · reste {toutes.length - reglees}
          </h3>
          <div style={{ height: 8, borderRadius: 99, background: 'var(--none-tint)', marginTop: 10, overflow: 'hidden' }}>
            <div style={{ width: `${toutes.length ? (100 * reglees) / toutes.length : 0}%`, height: '100%', background: 'var(--ok)' }} />
          </div>
        </div>
      ) : null}
      {resteSeulement && !sections.length ? <p className="clay-muted">Tout est réglé 🎉</p> : null}
      {sections.map((s) => (
        <div key={s.titre} className="clay-block" style={{ overflowX: 'auto' }}>
          {resteSeulement ? null : <h3 style={{ marginTop: 0, marginBottom: s.sousTitre ? 4 : undefined }}>{s.titre}</h3>}
          {!resteSeulement && s.sousTitre ? <p className="clay-muted small" style={{ marginTop: 0 }}>{s.sousTitre}</p> : null}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr className="clay-muted small" style={{ textAlign: 'left' }}>
                <th style={th}>{resteSeulement ? 'Quoi' : s.colonnes?.[0] || 'Quoi'}</th>
                <th style={th}>{resteSeulement ? 'Quand' : s.colonnes?.[1] || 'Résultat'}</th>
                {resteSeulement ? <th style={th}>État</th> : null}
              </tr>
            </thead>
            <tbody>
              {s.lignes.map((l) => (
                <tr key={l.id} style={{ borderTop: '1px solid var(--ligne)', verticalAlign: 'top' }}>
                  <td style={{ ...td, fontWeight: 700 }}>
                    {l.quoi}
                    {resteSeulement && l.note ? <div className="clay-muted small" style={{ fontWeight: 400 }}>{l.note}</div> : null}
                  </td>
                  <td style={td}>{resteSeulement ? l.quand : l.resultat}</td>
                  {resteSeulement ? (
                    <td style={td}>
                      <button className="clay-state att" style={{ border: 0, cursor: 'pointer' }} title="Toucher une fois fait" onClick={() => cocher(l)}>
                        À faire
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {error && <p className="error small">{error}</p>}
    </>
  );
}
