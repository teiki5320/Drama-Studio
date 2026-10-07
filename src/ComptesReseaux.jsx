// Réglages → Comptes des réseaux : les comptes TikTok, YouTube, Pinterest
// du Planning (une ligne chacun), et les applis pour lesquelles chaque
// compte est proposé d'office.
import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { APP_LOOKS } from './apps.js';

const RESEAUX = [
  ['tiktok', 'TikTok'],
  ['youtube', 'YouTube'],
  ['pinterest', 'Pinterest'],
];
const APPLIS = [...Object.entries(APP_LOOKS).map(([k, v]) => [k, `${v.icon} ${v.name}`]), ['recettes', '🍲 Recettes Keur Cook']];
const libelleAppli = (k) => (APPLIS.find((a) => a[0] === k) || [k, k])[1];

export function ComptesReseauxCard() {
  const [comptes, setComptes] = useState(null);
  const [reseau, setReseau] = useState('tiktok');
  const [nom, setNom] = useState('');
  const [ouvert, setOuvert] = useState(null);
  const [error, setError] = useState('');

  const load = () => api.comptesReseaux().then(setComptes).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);
  if (!comptes) {
    return error ? <p className="error small">{error}</p> : null;
  }
  const act = (p) =>
    p
      .then(() => {
        setError('');
        return load();
      })
      .catch((e) => setError(e.message));
  const ajouter = () => nom.trim() && act(api.ajouterCompteReseau({ reseau, nom: nom.trim() }).then(() => setNom('')));

  return (
    <div className="clay-block">
      <h3>📱 Comptes des réseaux</h3>
      <p className="clay-muted small" style={{ marginTop: 0 }}>
        Chaque compte a sa ligne dans le Planning. « Applis » : les applis pour lesquelles ce compte est coché d'office (placement et remplissage
        automatique) ; un compte sans appli sert quand aucune règle ne s'applique. Le compte YouTube qui porte le nom de la chaîne connectée se publie
        en un clic.
      </p>
      {RESEAUX.map(([r, libelle]) => {
        const liste = comptes.filter((c) => c.reseau === r);
        return liste.length ? (
          <div key={r} style={{ marginBottom: 10 }}>
            <div className="clay-muted small" style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, margin: '6px 0' }}>
              {libelle}
            </div>
            {liste.map((c) => (
              <div key={c.id} className="clay-file" style={{ flexWrap: 'wrap' }}>
                <div className="clay-file-txt">
                  <b>{c.nom}</b>
                  <span className="clay-muted small">{c.applis.length ? c.applis.map(libelleAppli).join(', ') : 'proposé par défaut'}</span>
                </div>
                <button className="clay-btn ghost small" onClick={() => setOuvert(ouvert === c.id ? null : c.id)}>
                  {ouvert === c.id ? 'Fermer' : 'Applis'}
                </button>
                <button
                  className="clay-btn ghost small"
                  title="Supprimer ce compte"
                  onClick={() => window.confirm(`Supprimer le compte ${c.nom} ?`) && act(api.retirerCompteReseau(c.id))}
                >
                  ✕
                </button>
                {ouvert === c.id && (
                  <div style={{ flexBasis: '100%', display: 'flex', flexWrap: 'wrap', gap: 6, paddingTop: 6 }}>
                    {APPLIS.map(([k, lib]) => {
                      const on = c.applis.includes(k);
                      return (
                        <button
                          key={k}
                          className={`clay-btn small${on ? '' : ' ghost'}`}
                          onClick={() => act(api.modifierCompteReseau(c.id, { applis: on ? c.applis.filter((x) => x !== k) : [...c.applis, k] }))}
                        >
                          {on ? '✓ ' : ''}
                          {lib}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : null;
      })}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
        <select className="rp-input" style={{ width: 'auto', margin: 0 }} value={reseau} onChange={(e) => setReseau(e.target.value)}>
          {RESEAUX.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        <input
          className="rp-input"
          style={{ flex: 1, minWidth: 180, margin: 0 }}
          placeholder="@nom du compte, ou nom de la chaîne"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ajouter()}
        />
        <button className="clay-btn" onClick={ajouter}>
          Ajouter
        </button>
      </div>
      {error && <p className="error small">{error}</p>}
    </div>
  );
}
